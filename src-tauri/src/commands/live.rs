use crate::bili::{app_sign, get_danmu_info, wbi_signed};
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::danmu::decode_and_emit;
use crate::models::{DanmuReq, UpdateAreaReq, UpdateTitleReq};
use crate::response::wrap_ok;
use crate::state::AppState;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use tauri::{AppHandle, State};
use tokio_tungstenite::tungstenite::Message;

#[tauri::command]
pub async fn get_partitions(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v1/Area/getList",
            &[("show_pinyin", "1".into())],
        )
        .await
        .map_err(|error| error.to_string())?;
    let mut runtime = state.runtime.lock().await;
    runtime.partition_map.clear();
    let mut out = serde_json::Map::new();

    if let Some(parents) = value["data"].as_array() {
        for parent in parents {
            let parent_name = parent["name"].as_str().unwrap_or("").to_string();
            let mut sub_map = HashMap::new();
            let mut names = vec![];
            if let Some(children) = parent["list"].as_array() {
                for child in children {
                    let child_name = child["name"].as_str().unwrap_or("").to_string();
                    let child_id = child["id"].as_u64().unwrap_or(0);
                    sub_map.insert(child_name.clone(), child_id);
                    names.push(json!(child_name));
                }
            }
            runtime.partition_map.insert(parent_name.clone(), sub_map);
            out.insert(parent_name, json!(names));
        }
    }

    Ok(wrap_ok(json!(out)))
}

#[tauri::command]
pub async fn update_area(req: UpdateAreaReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    let area_id = runtime
        .partition_map
        .get(&req.parent)
        .and_then(|map| map.get(&req.child))
        .copied()
        .ok_or_else(|| "invalid partition".to_string())?;

    runtime.session.current_area_id = Some(area_id);
    runtime.session.current_area_names = vec![req.parent.clone(), req.child.clone()];
    if let Some(uid) = runtime.config.current_uid.clone() {
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            user.last_area_id = area_id.to_string();
            user.last_area_name = vec![req.parent, req.child];
        }
    }

    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({ "area_id": area_id })))
}

#[tauri::command]
pub async fn update_title(req: UpdateTitleReq, state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), runtime.session.room_id.clone());
    form.insert("platform".into(), "pc_link".into());
    form.insert("title".into(), req.title.clone());
    form.insert("csrf".into(), runtime.session.csrf.clone());
    form.insert("csrf_token".into(), runtime.session.csrf.clone());
    drop(runtime);

    let value = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
        .await
        .map_err(|error| error.to_string())?;

    if value["code"].as_i64().unwrap_or(-1) == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                user.last_title = req.title;
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({})))
    } else {
        Err(value["msg"].as_str().unwrap_or("更新失败").into())
    }
}

#[tauri::command]
pub async fn start_live(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let area = runtime.session.current_area_id.unwrap_or(235);
    let room_id = runtime.session.room_id.clone();
    let csrf = runtime.session.csrf.clone();
    drop(runtime);

    let now = state
        .client
        .get_json("https://api.bilibili.com/x/report/click/now", &[])
        .await
        .map_err(|error| error.to_string())?["data"]["now"]
        .as_i64()
        .unwrap_or(0)
        .to_string();

    let mut homepage_params = BTreeMap::new();
    homepage_params.insert("system_version".into(), "2".into());
    homepage_params.insert("ts".into(), now.clone());
    let homepage_params = app_sign(&homepage_params)
        .into_iter()
        .collect::<Vec<_>>();
    let homepage_query = homepage_params
        .iter()
        .map(|(key, value)| (key.as_str(), value.clone()))
        .collect::<Vec<_>>();
    let version = state
        .client
        .get_json(
            "https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion",
            &homepage_query,
        )
        .await
        .map_err(|error| error.to_string())?;

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("platform".into(), "pc_link".into());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.clone());
    form.insert("csrf".into(), csrf);
    form.insert(
        "build".into(),
        version["data"]["build"].as_i64().unwrap_or(0).to_string(),
    );
    form.insert(
        "version".into(),
        version["data"]["curr_version"]
            .as_str()
            .unwrap_or("0")
            .into(),
    );
    form.insert("ts".into(), now);
    let form = app_sign(&form);

    let response = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/startLive", &form)
        .await
        .map_err(|error| error.to_string())?;
    let code = response["code"].as_i64().unwrap_or(-1);
    if code == 60024 {
        let qr = response["data"]["qr"].as_str().unwrap_or("").to_string();
        return Ok(json!({ "code": 60024, "msg": "需要人脸验证", "qr": qr }));
    }
    if code == 60043 {
        let uid = {
            let runtime = state.runtime.lock().await;
            runtime.session.uid
        };
        let qr = format!(
            "https://www.bilibili.com/blackboard/live/face-auth-middle.html?source_event=400&mid={uid}"
        );
        return Ok(json!({ "code": 60043, "msg": "需要人脸验证", "qr": qr }));
    }
    if code != 0 {
        return Err(response["msg"].as_str().unwrap_or("开播失败").into());
    }

    let mut runtime = state.runtime.lock().await;
    runtime.session.is_live = true;
    Ok(wrap_ok(json!({
        "rtmp1": response["data"]["rtmp"],
        "protocols": response["data"]["protocols"]
    })))
}

#[tauri::command]
pub async fn stop_live(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), runtime.session.room_id.clone());
    form.insert("platform".into(), "pc_link".into());
    form.insert("csrf".into(), runtime.session.csrf.clone());
    form.insert("csrf_token".into(), runtime.session.csrf.clone());
    drop(runtime);

    let value = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/stopLive", &form)
        .await
        .map_err(|error| error.to_string())?;
    if value["code"].as_i64().unwrap_or(-1) == 0 {
        let mut runtime = state.runtime.lock().await;
        runtime.session.is_live = false;
        Ok(wrap_ok(json!({})))
    } else {
        Err(value["msg"].as_str().unwrap_or("停播失败").into())
    }
}

#[tauri::command]
pub async fn send_danmu(req: DanmuReq, state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let room_id = runtime.session.room_id.clone();
    let csrf = runtime.session.csrf.clone();
    drop(runtime);

    let mut params = BTreeMap::new();
    params.insert("web_location".into(), "444.8".into());
    let signed = wbi_signed(&state.client, params)
        .await
        .map_err(|error| error.to_string())?;
    let query = serde_urlencoded::to_string(signed).map_err(|error| error.to_string())?;

    let mut form = BTreeMap::new();
    form.insert("color".into(), "16777215".into());
    form.insert("fontsize".into(), "25".into());
    form.insert("mode".into(), "1".into());
    form.insert("bubble".into(), "0".into());
    form.insert("msg".into(), req.msg);
    form.insert("roomid".into(), room_id);
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    form.insert("rnd".into(), chrono::Utc::now().timestamp().to_string());

    let value = state
        .client
        .post_form(
            &format!("https://api.live.bilibili.com/msg/send?{query}"),
            &form,
        )
        .await
        .map_err(|error| error.to_string())?;
    if value["code"].as_i64().unwrap_or(-1) == 0 {
        Ok(wrap_ok(json!({ "msg": "发送成功" })))
    } else {
        Err(value["msg"].as_str().unwrap_or("发送失败").into())
    }
}

#[tauri::command]
pub async fn start_danmu_monitor(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if runtime.danmu_task.is_some() {
        return Ok(wrap_ok(json!({ "msg": "already running" })));
    }

    let room_id = runtime.session.room_id.clone();
    let uid = runtime.session.uid;
    if room_id.is_empty() {
        return Err("未登录".into());
    }
    let client = state.client.clone();

    runtime.danmu_task = Some(tokio::spawn(async move {
        if let Ok(info) = get_danmu_info(&client, &room_id).await {
            let token = info["data"]["token"].as_str().unwrap_or("");
            let host = info["data"]["host_list"][0]["host"]
                .as_str()
                .unwrap_or("broadcastlv.chat.bilibili.com");
            let port = info["data"]["host_list"][0]["wss_port"]
                .as_u64()
                .unwrap_or(2245);

            if let Ok((ws, _)) =
                tokio_tungstenite::connect_async(format!("wss://{}:{}/sub", host, port)).await
            {
                let (mut write, mut read) = ws.split();
                let auth = json!({
                    "uid": uid as i64,
                    "roomid": room_id.parse::<u64>().unwrap_or(0),
                    "protover": 3,
                    "platform": "web",
                    "type": 2,
                    "key": token
                })
                .to_string();
                let mut packet = vec![];
                packet.extend_from_slice(&((16 + auth.len()) as u32).to_be_bytes());
                packet.extend_from_slice(&(16u16).to_be_bytes());
                packet.extend_from_slice(&(1u16).to_be_bytes());
                packet.extend_from_slice(&(7u32).to_be_bytes());
                packet.extend_from_slice(&(1u32).to_be_bytes());
                packet.extend_from_slice(auth.as_bytes());
                let _ = write.send(Message::Binary(packet.into())).await;

                let heartbeat = tokio::spawn(async move {
                    loop {
                        let mut heartbeat_packet = vec![];
                        heartbeat_packet.extend_from_slice(&(16u32).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(16u16).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(1u16).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(2u32).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(1u32).to_be_bytes());
                        if write
                            .send(Message::Binary(heartbeat_packet.into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    }
                });

                while let Some(Ok(message)) = read.next().await {
                    if let Message::Binary(data) = message {
                        decode_and_emit(&app, &data);
                    }
                }
                heartbeat.abort();
            }
        }
    }));

    Ok(wrap_ok(json!({ "msg": "started" })))
}

#[tauri::command]
pub async fn stop_danmu_monitor(state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    Ok(wrap_ok(json!({ "msg": "stopped" })))
}
