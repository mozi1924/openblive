use crate::bili::fetch_full_user_data;
use crate::client::parse_cookie_value;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::models::{PollReq, UidReq, UserRecord};
use crate::response::wrap_ok;
use crate::state::{restore_session_from_current, AppState};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn get_login_qrcode(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
            &[],
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(wrap_ok(value["data"].clone()))
}

#[tauri::command]
pub async fn poll_login_status(req: PollReq, state: State<'_, AppState>) -> CmdResult {
    let value: serde_json::Value = state
        .client
        .http
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
        .query(&[("qrcode_key", req.key)])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let code = value["data"]["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Ok(json!({
            "code": code,
            "msg": value["data"]["message"].as_str().unwrap_or("pending")
        }));
    }

    let cookie_header = state.client.cookie_header_for("https://api.bilibili.com/");
    let uid = parse_cookie_value(&cookie_header, "DedeUserID")
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let csrf = parse_cookie_value(&cookie_header, "bili_jct").unwrap_or_default();
    let room = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v2/Room/room_id_by_uid",
            &[("uid", uid.to_string())],
        )
        .await
        .map(|value| value["data"]["room_id"].as_i64().unwrap_or(0).to_string())
        .unwrap_or_default();

    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;
    let uid_str = uid.to_string();

    let mut runtime = state.runtime.lock().await;
    let old = runtime
        .config
        .users
        .get(&uid_str)
        .cloned()
        .unwrap_or_default();
    let user = UserRecord {
        uid: uid_str.clone(),
        uname: full["uname"].as_str().unwrap_or("未知用户").to_string(),
        face: full["face"].as_str().unwrap_or("").to_string(),
        cookie: cookie_header,
        enc_cookie: String::new(),
        room_id: room.clone(),
        csrf: csrf.clone(),
        enc_csrf: String::new(),
        level: full["level_info"]["current_level"].as_i64().unwrap_or(0),
        current_exp: full["level_info"]["current_exp"].as_i64().unwrap_or(0),
        next_exp: full["level_info"]["next_exp"].as_i64().unwrap_or(0),
        money: full["money"].as_f64().unwrap_or(0.0),
        bcoin: full["wallet"]["bcoin_balance"].as_f64().unwrap_or(0.0),
        following: full["stat"]["following"].as_i64().unwrap_or(0),
        follower: full["stat"]["follower"].as_i64().unwrap_or(0),
        dynamic_count: full["stat"]["dynamic_count"].as_i64().unwrap_or(0),
        last_title: old.last_title,
        last_area_id: old.last_area_id,
        last_area_name: old.last_area_name,
    };

    runtime.config.users.insert(uid_str.clone(), user.clone());
    runtime.config.current_uid = Some(uid_str);
    runtime.session.uid = uid;
    runtime.session.csrf = csrf;
    runtime.session.room_id = room;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(serde_json::to_value(user).unwrap()))
}

#[tauri::command]
pub async fn load_saved_config(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    let data = runtime
        .config
        .current_uid
        .as_ref()
        .and_then(|uid| runtime.config.users.get(uid))
        .cloned();
    Ok(wrap_ok(serde_json::to_value(data).unwrap()))
}

#[tauri::command]
pub async fn refresh_current_user(state: State<'_, AppState>) -> CmdResult {
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
    drop(runtime);

    state.client.apply_cookie_header(&user.cookie);
    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;

    let mut runtime = state.runtime.lock().await;
    let mut current = runtime.config.users.get(&uid).cloned().unwrap_or_default();
    current.uname = full["uname"].as_str().unwrap_or("未知用户").to_string();
    current.face = full["face"].as_str().unwrap_or("").to_string();
    current.level = full["level_info"]["current_level"].as_i64().unwrap_or(0);
    current.current_exp = full["level_info"]["current_exp"].as_i64().unwrap_or(0);
    current.next_exp = full["level_info"]["next_exp"].as_i64().unwrap_or(0);
    current.money = full["money"].as_f64().unwrap_or(0.0);
    current.bcoin = full["wallet"]["bcoin_balance"].as_f64().unwrap_or(0.0);
    current.following = full["stat"]["following"].as_i64().unwrap_or(0);
    current.follower = full["stat"]["follower"].as_i64().unwrap_or(0);
    current.dynamic_count = full["stat"]["dynamic_count"].as_i64().unwrap_or(0);
    runtime.config.users.insert(uid, current.clone());
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(serde_json::to_value(current).unwrap()))
}

#[tauri::command]
pub async fn get_account_list(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    let list: Vec<UserRecord> = runtime.config.users.values().cloned().collect();
    Ok(wrap_ok(json!({
        "list": list,
        "current_uid": runtime.config.current_uid
    })))
}

#[tauri::command]
pub async fn switch_account(req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if !runtime.config.users.contains_key(&req.uid) {
        return Err("账户不存在".into());
    }

    runtime.config.current_uid = Some(req.uid.clone());
    restore_session_from_current(&mut runtime, &state.client);
    let user = runtime.config.users.get(&req.uid).cloned().unwrap_or_default();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(serde_json::to_value(user).unwrap()))
}

#[tauri::command]
pub async fn logout(req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    runtime.config.users.remove(&req.uid);
    if runtime.config.current_uid.as_deref() == Some(&req.uid) {
        runtime.config.current_uid = None;
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({})))
}
