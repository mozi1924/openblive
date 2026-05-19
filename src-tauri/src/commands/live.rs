use crate::bili::{app_sign, get_danmu_info, wbi_signed};
use crate::config::save_config;
use crate::constants::{CmdResult, DEFAULT_LIVEHIME_BUILD, DEFAULT_LIVEHIME_VERSION};
use crate::danmu::decode_and_emit;
use crate::models::{DanmuReq, UpdateAreaReq, UpdateTagsReq, UpdateTitleReq};
use crate::response::wrap_ok;
use crate::state::AppState;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use tauri::{AppHandle, State};
use tokio_tungstenite::tungstenite::Message;

const LIVE_CLIENT_VERSION_TTL_SECS: i64 = 6 * 60 * 60;
const LIVE_PLATFORM_PC_LINK: &str = "pc_link";

fn split_tags(raw: &str) -> Vec<String> {
    raw.split([',', '，'])
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(|tag| tag.to_string())
        .collect()
}

fn build_room_update_form(room_id: &str, csrf: &str) -> BTreeMap<String, String> {
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id.to_string());
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("csrf".into(), csrf.to_string());
    form.insert("csrf_token".into(), csrf.to_string());
    form
}

fn sanitized_live_client_version(version: &str, build: u64) -> (String, u64) {
    let normalized_version = if version.trim().is_empty() {
        DEFAULT_LIVEHIME_VERSION.to_string()
    } else {
        version.trim().to_string()
    };
    let normalized_build = if build == 0 {
        DEFAULT_LIVEHIME_BUILD
    } else {
        build
    };
    (normalized_version, normalized_build)
}

pub async fn refresh_live_client_version_inner(state: &AppState) -> Result<(String, u64), String> {
    let ts = chrono::Utc::now().timestamp().to_string();
    let mut params = BTreeMap::new();
    params.insert("system_version".into(), "2".into());
    params.insert("ts".into(), ts);
    let signed = app_sign(&params);
    let query = signed
        .iter()
        .map(|(key, value)| (key.as_str(), value.clone()))
        .collect::<Vec<_>>();

    let value = state
        .client
        .get_json(
            "https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion",
            &query,
        )
        .await
        .map_err(|error| error.to_string())?;

    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(value["message"]
            .as_str()
            .unwrap_or("获取版本号失败")
            .to_string());
    }

    let raw_version = value["data"]["curr_version"].as_str().unwrap_or("");
    let raw_build = value["data"]["build"].as_u64().unwrap_or(0);
    let (version, build) = sanitized_live_client_version(raw_version, raw_build);

    let mut runtime = state.runtime.lock().await;
    runtime.config.live_client_version = version.clone();
    runtime.config.live_client_build = build;
    runtime.config.live_client_synced_at = chrono::Utc::now().timestamp();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok((version, build))
}

async fn resolve_live_client_version(state: &AppState, force_refresh: bool) -> (String, u64, bool) {
    let (cached_version, cached_build, synced_at) = {
        let runtime = state.runtime.lock().await;
        (
            runtime.config.live_client_version.clone(),
            runtime.config.live_client_build,
            runtime.config.live_client_synced_at,
        )
    };

    let now = chrono::Utc::now().timestamp();
    let stale = synced_at <= 0 || now - synced_at >= LIVE_CLIENT_VERSION_TTL_SECS;
    let missing = cached_version.trim().is_empty() || cached_build == 0;
    let should_refresh = force_refresh || stale || missing;

    if should_refresh {
        if let Ok((version, build)) = refresh_live_client_version_inner(state).await {
            return (version, build, false);
        }
    }

    let (version, build) = sanitized_live_client_version(&cached_version, cached_build);
    (version, build, true)
}

async fn inject_live_client_identity(
    state: &AppState,
    form: &mut BTreeMap<String, String>,
    force_refresh: bool,
) -> bool {
    let (version, build, from_cache) = resolve_live_client_version(state, force_refresh).await;
    form.insert("version".into(), version);
    form.insert("build".into(), build.to_string());
    from_cache
}

#[tauri::command]
pub async fn refresh_live_client_version(state: State<'_, AppState>) -> CmdResult {
    let (version, build, from_cache) = resolve_live_client_version(&state, true).await;

    Ok(wrap_ok(json!({
        "version": version,
        "build": build,
        "from_cache": from_cache
    })))
}

#[tauri::command]
pub async fn sync_live_room_profile(state: State<'_, AppState>) -> CmdResult {
    let (uid, user) = {
        let runtime = state.runtime.lock().await;
        let uid = runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .cloned()
            .ok_or_else(|| "未登录".to_string())?;
        (uid, user)
    };

    if user.room_id.is_empty() {
        let parent = user
            .last_area_name
            .first()
            .cloned()
            .unwrap_or_else(String::new);
        let child = user
            .last_area_name
            .get(1)
            .cloned()
            .unwrap_or_else(String::new);
        return Ok(wrap_ok(json!({
            "title": user.last_title,
            "parent": parent,
            "child": child,
            "area_id": user.last_area_id.parse::<u64>().ok(),
            "tags": user.last_tags,
            "from_cache": true
        })));
    }

    state.client.apply_cookie_header(&user.cookie);
    let result = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v1/Room/get_info",
            &[("room_id", user.room_id.clone())],
        )
        .await;

    match result {
        Ok(value) if value["code"].as_i64().unwrap_or(-1) == 0 => {
            let data = &value["data"];
            let title = data["title"]
                .as_str()
                .unwrap_or(&user.last_title)
                .to_string();
            let parent = data["parent_area_name"].as_str().unwrap_or("").to_string();
            let child = data["area_name"].as_str().unwrap_or("").to_string();
            let area_id = data["area_id"]
                .as_u64()
                .or_else(|| user.last_area_id.parse::<u64>().ok());
            let tags = split_tags(data["tags"].as_str().unwrap_or(""));
            let room_id = data["room_id"]
                .as_i64()
                .map(|value| value.to_string())
                .unwrap_or_else(|| user.room_id.clone());

            let mut runtime = state.runtime.lock().await;
            if let Some(current) = runtime.config.users.get_mut(&uid) {
                current.last_title = title.clone();
                current.last_area_id = area_id.map(|value| value.to_string()).unwrap_or_default();
                current.last_area_name = if parent.is_empty() || child.is_empty() {
                    current.last_area_name.clone()
                } else {
                    vec![parent.clone(), child.clone()]
                };
                current.last_tags = tags.clone();
                if !room_id.is_empty() {
                    current.room_id = room_id.clone();
                }
            }
            runtime.session.current_area_id = area_id;
            runtime.session.current_area_names = if parent.is_empty() || child.is_empty() {
                runtime.session.current_area_names.clone()
            } else {
                vec![parent.clone(), child.clone()]
            };
            runtime.session.current_tags = tags.clone();
            if !room_id.is_empty() {
                runtime.session.room_id = room_id;
            }
            save_config(&state.config_path, &runtime.config, &state.master_key);

            Ok(wrap_ok(json!({
                "title": title,
                "parent": parent,
                "child": child,
                "area_id": area_id,
                "tags": tags,
                "from_cache": false
            })))
        }
        _ => {
            let parent = user
                .last_area_name
                .first()
                .cloned()
                .unwrap_or_else(String::new);
            let child = user
                .last_area_name
                .get(1)
                .cloned()
                .unwrap_or_else(String::new);

            let mut runtime = state.runtime.lock().await;
            runtime.session.current_area_id = user.last_area_id.parse::<u64>().ok();
            runtime.session.current_area_names = user.last_area_name.clone();
            runtime.session.current_tags = user.last_tags.clone();

            Ok(wrap_ok(json!({
                "title": user.last_title,
                "parent": parent,
                "child": child,
                "area_id": user.last_area_id.parse::<u64>().ok(),
                "tags": user.last_tags,
                "from_cache": true
            })))
        }
    }
}

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
                user.last_title = req.title.clone();
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({})))
    } else {
        Err(value["msg"].as_str().unwrap_or("更新失败").into())
    }
}

#[tauri::command]
pub async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
    let desired_tags = split_tags(&req.tags);
    let (uid, room_id, csrf, current_tags, cookie) = {
        let runtime = state.runtime.lock().await;
        let uid = runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .ok_or_else(|| "未登录".to_string())?;
        (
            uid,
            user.room_id.clone(),
            user.csrf.clone(),
            user.last_tags.clone(),
            user.cookie.clone(),
        )
    };

    if room_id.is_empty() {
        return Err("未获取到直播间号".into());
    }
    if csrf.is_empty() {
        return Err("未获取到 csrf，请尝试刷新账号信息".into());
    }

    state.client.apply_cookie_header(&cookie);

    let to_add: Vec<String> = desired_tags
        .iter()
        .filter(|tag| !current_tags.iter().any(|old| old == *tag))
        .cloned()
        .collect();
    let to_del: Vec<String> = current_tags
        .iter()
        .filter(|tag| !desired_tags.iter().any(|new| new == *tag))
        .cloned()
        .collect();

    for tag in &to_add {
        let mut form = build_room_update_form(&room_id, &csrf);
        form.insert("add_tag".into(), tag.clone());
        let value = state
            .client
            .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
            .await
            .map_err(|error| error.to_string())?;
        if value["code"].as_i64().unwrap_or(-1) != 0 {
            return Err(format!(
                "新增标签失败({tag}): {}",
                value["msg"].as_str().unwrap_or("更新失败")
            ));
        }
    }

    for tag in &to_del {
        let mut form = build_room_update_form(&room_id, &csrf);
        form.insert("del_tag".into(), tag.clone());
        let value = state
            .client
            .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
            .await
            .map_err(|error| error.to_string())?;
        if value["code"].as_i64().unwrap_or(-1) != 0 {
            return Err(format!(
                "删除标签失败({tag}): {}",
                value["msg"].as_str().unwrap_or("更新失败")
            ));
        }
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        user.last_tags = desired_tags.clone();
    }
    runtime.session.current_tags = desired_tags.clone();
    save_config(&state.config_path, &runtime.config, &state.master_key);

    Ok(wrap_ok(json!({
        "tags": desired_tags,
        "added": to_add,
        "removed": to_del
    })))
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
    let now = chrono::Utc::now().timestamp().to_string();

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.clone());
    form.insert("csrf".into(), csrf);
    inject_live_client_identity(&state, &mut form, false).await;
    form.insert("ts".into(), now);
    let form = app_sign(&form);

    let response = state
        .client
        .post_form(
            "https://api.live.bilibili.com/room/v1/Room/startLive",
            &form,
        )
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
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
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
