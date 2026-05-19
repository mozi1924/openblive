use crate::avatar::{delete_avatar_cache, has_cached_face, refresh_avatar_cache, to_response_user};
use crate::bili::fetch_full_user_data;
use crate::client::parse_cookie_value;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::models::{PollReq, UidReq, UserRecord};
use crate::response::wrap_ok;
use crate::state::{restore_session_from_current, AppState};
use serde_json::json;
use tauri::State;

fn fill_profile_from_full(user: &mut UserRecord, full: &serde_json::Value) {
    user.uname = full["uname"].as_str().unwrap_or("未知用户").to_string();
    user.face = full["face"].as_str().unwrap_or("").to_string();
    user.level = full["level_info"]["current_level"].as_i64().unwrap_or(0);
    user.current_exp = full["level_info"]["current_exp"].as_i64().unwrap_or(0);
    user.next_exp = full["level_info"]["next_exp"].as_i64().unwrap_or(0);
    user.money = full["money"].as_f64().unwrap_or(0.0);
    user.bcoin = full["wallet"]["bcoin_balance"].as_f64().unwrap_or(0.0);
    user.following = full["stat"]["following"].as_i64().unwrap_or(0);
    user.follower = full["stat"]["follower"].as_i64().unwrap_or(0);
    user.dynamic_count = full["stat"]["dynamic_count"].as_i64().unwrap_or(0);
}

async fn refresh_cookie_for_uid(uid: &str, state: &AppState) -> Result<Option<UserRecord>, String> {
    let user = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.get(uid).cloned()
    };
    let Some(mut user) = user else {
        return Ok(None);
    };

    state.client.apply_cookie_header(&user.cookie);
    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;
    let cookie_header = state.client.cookie_header_for("https://api.bilibili.com/");
    if !cookie_header.is_empty() {
        user.cookie = cookie_header;
    }
    if let Some(csrf) = parse_cookie_value(&user.cookie, "bili_jct") {
        user.csrf = csrf;
    }
    fill_profile_from_full(&mut user, &full);

    if let Err(error) =
        refresh_avatar_cache(&state.client, &state.config_path, uid, &user.face).await
    {
        eprintln!("avatar cache refresh failed for uid {uid}: {error}");
    }

    let mut runtime = state.runtime.lock().await;
    runtime.config.users.insert(uid.to_string(), user.clone());
    if runtime.config.current_uid.as_deref() == Some(uid) {
        restore_session_from_current(&mut runtime, &state.client);
    }
    Ok(Some(user))
}

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
        uname: String::new(),
        face: String::new(),
        cookie: cookie_header,
        enc_cookie: String::new(),
        room_id: room.clone(),
        csrf: csrf.clone(),
        enc_csrf: String::new(),
        level: 0,
        current_exp: 0,
        next_exp: 0,
        money: 0.0,
        bcoin: 0.0,
        following: 0,
        follower: 0,
        dynamic_count: 0,
        last_title: old.last_title,
        last_area_id: old.last_area_id,
        last_area_name: old.last_area_name,
        last_tags: old.last_tags,
    };
    let mut user = user;
    fill_profile_from_full(&mut user, &full);
    if let Err(error) =
        refresh_avatar_cache(&state.client, &state.config_path, &uid_str, &user.face).await
    {
        eprintln!("avatar cache refresh failed for uid {uid_str}: {error}");
    }

    runtime.config.users.insert(uid_str.clone(), user.clone());
    runtime.config.current_uid = Some(uid_str);
    runtime.session.uid = uid;
    runtime.session.csrf = csrf;
    runtime.session.room_id = room;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    let response_user = to_response_user(&state.config_path, &user);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn load_saved_config(state: State<'_, AppState>) -> CmdResult {
    let user = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .as_ref()
            .and_then(|uid| runtime.config.users.get(uid))
            .cloned()
    };
    if let Some(user) = &user {
        if !has_cached_face(&state.config_path, &user.uid) {
            if let Err(error) =
                refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
            {
                eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let data = user
        .as_ref()
        .map(|value| to_response_user(&state.config_path, value));
    Ok(wrap_ok(serde_json::to_value(data).unwrap()))
}

#[tauri::command]
pub async fn refresh_current_user(state: State<'_, AppState>) -> CmdResult {
    let uid = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?
    };
    let user = refresh_cookie_for_uid(&uid, &state).await?;
    let user = user.ok_or_else(|| "未登录".to_string())?;

    let runtime = state.runtime.lock().await;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    let response_user = to_response_user(&state.config_path, &user);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn get_account_list(state: State<'_, AppState>) -> CmdResult {
    let users = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.values().cloned().collect::<Vec<_>>()
    };
    for user in &users {
        if !has_cached_face(&state.config_path, &user.uid) {
            if let Err(error) =
                refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
            {
                eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let list: Vec<UserRecord> = users
        .iter()
        .map(|user| to_response_user(&state.config_path, user))
        .collect();
    let current_uid = {
        let runtime = state.runtime.lock().await;
        runtime.config.current_uid.clone()
    };
    Ok(wrap_ok(json!({
        "list": list,
        "current_uid": current_uid
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
    let user = runtime
        .config
        .users
        .get(&req.uid)
        .cloned()
        .unwrap_or_default();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);

    if !has_cached_face(&state.config_path, &user.uid) {
        if let Err(error) =
            refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
        {
            eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
        }
    }
    let response_user = to_response_user(&state.config_path, &user);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn logout(req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    runtime.config.users.remove(&req.uid);
    delete_avatar_cache(&state.config_path, &req.uid);
    if runtime.config.current_uid.as_deref() == Some(&req.uid) {
        runtime.config.current_uid = None;
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn refresh_all_account_cookies(state: State<'_, AppState>) -> CmdResult {
    let uids = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.keys().cloned().collect::<Vec<_>>()
    };

    let mut updated = 0;
    let mut failed: Vec<String> = Vec::new();
    for uid in uids {
        match refresh_cookie_for_uid(&uid, &state).await {
            Ok(Some(_)) => updated += 1,
            Ok(None) => {}
            Err(error) => failed.push(format!("{uid}: {error}")),
        }
    }

    let runtime = state.runtime.lock().await;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({
        "updated": updated,
        "failed": failed
    })))
}
