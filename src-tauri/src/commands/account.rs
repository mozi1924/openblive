mod common;
mod refresh;

use common::{cookie_diagnostics, fill_profile_from_full, RefreshCookieResult};
use refresh::{refresh_accounts_batch, refresh_cookie_for_uid};

use crate::avatar::{delete_avatar_cache, has_cached_face, refresh_avatar_cache, to_response_user};
use crate::bili::fetch_full_user_data;
use crate::client::parse_cookie_value;
use crate::commands::live::ensure_auto_start_danmu_monitor;
use crate::commands::system::render_qr_data_url;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::cover_cache::{apply_cached_cover_to_user, has_cached_cover, refresh_cover_cache};
use crate::endpoints;
use crate::models::{sync_live_profile_state_defaults, PollReq, UidReq, UserRecord};
use crate::response::wrap_ok;
use crate::state::{restore_session_from_current, AppState};
use crate::state_event::emit_runtime_snapshot;
use serde_json::json;
use tauri::{AppHandle, State};

fn to_response_user_with_cover(config_path: &std::path::Path, user: &UserRecord) -> UserRecord {
    let mut output = to_response_user(config_path, user);
    apply_cached_cover_to_user(config_path, &mut output);
    output
}

#[tauri::command]
pub async fn get_login_qrcode(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            &endpoints::passport("/x/passport-login/web/qrcode/generate"),
            &[],
        )
        .await
        .map_err(|error| error.to_string())?;
    let qr_content = value["data"]["url"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let qrcode_key = value["data"]["qrcode_key"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let image_src = render_qr_data_url(&qr_content, Some(220), Some(2))?;
    Ok(wrap_ok(json!({
        "url": qr_content,
        "content": qr_content,
        "qrcode_key": qrcode_key,
        "image_src": image_src
    })))
}

#[tauri::command]
pub async fn poll_login_status(
    app: AppHandle,
    req: PollReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let value: serde_json::Value = state
        .client
        .http
        .get(endpoints::passport("/x/passport-login/web/qrcode/poll"))
        .header("user-agent", endpoints::http_user_agent())
        .query(&[("qrcode_key", req.key)])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let code = value["data"]["code"].as_i64().unwrap_or(-1);
    crate::runtime_log!(
        "[auth][qrcode] poll status code={}, message={}",
        code,
        value["data"]["message"].as_str().unwrap_or("")
    );
    if code != 0 {
        return Ok(json!({
            "code": code,
            "msg": value["data"]["message"].as_str().unwrap_or("pending")
        }));
    }

    if let Some(auth_url) = value["data"]["url"].as_str().map(str::trim) {
        if !auth_url.is_empty() {
            let _ = state
                .client
                .http
                .get(auth_url)
                .header("user-agent", endpoints::http_user_agent())
                .send()
                .await
                .map_err(|error| error.to_string())?;
        }
    }

    let cookie_header = state.client.cookie_header_for(&endpoints::api_origin());
    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;
    let cookie_uid = parse_cookie_value(&cookie_header, "DedeUserID")
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let nav_uid = full["mid"].as_u64().unwrap_or(0);
    let uid = if nav_uid > 0 { nav_uid } else { cookie_uid };
    if cookie_uid > 0 && nav_uid > 0 && cookie_uid != nav_uid {
        crate::runtime_log!(
            "[auth][qrcode] uid mismatch, cookie_uid={}, nav_uid={}, {}",
            cookie_uid,
            nav_uid,
            cookie_diagnostics(&cookie_header)
        );
    }
    if uid == 0 {
        crate::runtime_log!(
            "[auth][qrcode] login success but uid missing, cookie_uid={}, nav_uid={}, {}",
            cookie_uid,
            nav_uid,
            cookie_diagnostics(&cookie_header)
        );
        return Err("i18n.account.error.login_uid_missing".into());
    }
    let csrf = parse_cookie_value(&cookie_header, "bili_jct").unwrap_or_default();
    let room = state
        .client
        .get_json(
            &endpoints::live_api("/room/v2/Room/room_id_by_uid"),
            &[("uid", uid.to_string())],
        )
        .await
        .map(|value| value["data"]["room_id"].as_i64().unwrap_or(0).to_string())
        .unwrap_or_default();
    let uid_str = uid.to_string();
    crate::runtime_log!(
        "[auth][qrcode] login success uid={}, room_id={}, {}",
        uid_str,
        room,
        cookie_diagnostics(&cookie_header)
    );

    let old = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .users
            .get(&uid_str)
            .cloned()
            .unwrap_or_default()
    };
    let user = UserRecord {
        uid: uid_str.clone(),
        uname: String::new(),
        face: String::new(),
        cookie: cookie_header,
        enc_cookie: String::new(),
        refresh_token: value["data"]["refresh_token"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        enc_refresh_token: String::new(),
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
        last_cover: old.last_cover,
        last_cover_asset: old.last_cover_asset,
        recent_areas: old.recent_areas,
        live_profile_state: old.live_profile_state,
        live_key: None,
        sub_session_key: None,
        login_invalid: false,
        auth_fail_count: 0,
        last_auth_fail_at: 0,
    };
    let mut user = user;
    sync_live_profile_state_defaults(&mut user);
    fill_profile_from_full(&mut user, &full);
    if let Err(error) =
        refresh_avatar_cache(&state.client, &state.config_path, &uid_str, &user.face).await
    {
        crate::runtime_warn!("avatar cache refresh failed for uid {uid_str}: {error}");
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    runtime.config.users.insert(uid_str.clone(), user.clone());
    runtime.config.current_uid = Some(uid_str);
    runtime.session.uid = uid;
    runtime.session.csrf = csrf;
    runtime.session.room_id = room;
    runtime.session.is_live = false;
    runtime.session.live_status = None;
    runtime.session.live_time.clear();
    runtime.session.live_key = None;
    runtime.session.sub_session_key = None;
    runtime.session.from_cache = false;
    runtime.session.last_sync_at = None;
    runtime.session.error_code = None;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    let response_user = to_response_user_with_cover(&state.config_path, &user);
    drop(runtime);
    crate::tray::refresh_tray_menu(&app);
    ensure_auto_start_danmu_monitor(&app, &state, "command.poll_login_status.auto_start").await;
    emit_runtime_snapshot(&app, &state, "command.poll_login_status").await;
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
                crate::runtime_warn!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
        if !user.last_cover.trim().is_empty() && !has_cached_cover(&state.config_path, &user.last_cover) {
            if let Err(error) =
                refresh_cover_cache(&state.client, &state.config_path, &user.last_cover).await
            {
                crate::runtime_warn!("cover cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let data = user
        .as_ref()
        .map(|value| to_response_user_with_cover(&state.config_path, value));
    Ok(wrap_ok(serde_json::to_value(data).unwrap()))
}

#[tauri::command]
pub async fn refresh_current_user(state: State<'_, AppState>) -> CmdResult {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    let uid = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "i18n.common.not_logged_in".to_string())?
    };
    crate::runtime_log!("[auth][manual] refresh_current_user uid={}", uid);
    let refreshed = refresh_cookie_for_uid(&uid, &state, true).await;
    let response = match refreshed {
        RefreshCookieResult::Updated(user) => {
            let response_user = to_response_user_with_cover(&state.config_path, &user);
            Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
        }
        RefreshCookieResult::Missing => Err("i18n.common.not_logged_in".into()),
        RefreshCookieResult::Invalid(msg) => {
            Err(format!("i18n.common.login_expired_relogin:{msg}"))
        }
        RefreshCookieResult::Failed(error) => Err(error),
    };

    let runtime = state.runtime.lock().await;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    response
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
                crate::runtime_warn!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let list: Vec<UserRecord> = users
        .iter()
        .map(|user| to_response_user_with_cover(&state.config_path, user))
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
pub async fn switch_account(app: AppHandle, req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if !runtime.config.users.contains_key(&req.uid) {
        return Err("i18n.account.error.account_not_found".into());
    }
    if runtime
        .config
        .users
        .get(&req.uid)
        .map(|user| user.login_invalid)
        .unwrap_or(false)
    {
        return Err("i18n.account.error.account_login_invalid".into());
    }

    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
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
            crate::runtime_warn!("avatar cache warmup failed for uid {}: {}", user.uid, error);
        }
    }
    if !user.last_cover.trim().is_empty() && !has_cached_cover(&state.config_path, &user.last_cover) {
        if let Err(error) =
            refresh_cover_cache(&state.client, &state.config_path, &user.last_cover).await
        {
            crate::runtime_warn!("cover cache warmup failed for uid {}: {}", user.uid, error);
        }
    }

    ensure_auto_start_danmu_monitor(&app, &state, "command.switch_account.auto_start").await;

    emit_runtime_snapshot(&app, &state, "command.switch_account").await;
    let response_user = to_response_user_with_cover(&state.config_path, &user);
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn logout(app: AppHandle, req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if !req.uid.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("i18n.account.error.account_not_found".into());
    }
    if !runtime.config.users.contains_key(&req.uid) {
        return Err("i18n.account.error.account_not_found".into());
    }

    runtime.config.users.remove(&req.uid);
    if let Err(error) = delete_avatar_cache(&state.config_path, &req.uid) {
        crate::runtime_log!(
            "[auth][logout] delete avatar cache failed uid={}: {}",
            req.uid,
            error
        );
    }
    if runtime.config.current_uid.as_deref() == Some(&req.uid) {
        if let Some(task) = runtime.danmu_task.take() {
            task.abort();
        }
        runtime.config.current_uid = None;
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    let should_emit_snapshot = runtime.config.current_uid.is_none() && runtime.session.uid == 0;
    drop(runtime);
    if should_emit_snapshot {
        emit_runtime_snapshot(&app, &state, "command.logout").await;
    }
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

pub async fn refresh_all_account_profiles_inner(state: &AppState) -> serde_json::Value {
    refresh::refresh_all_account_profiles_inner(state).await
}

#[tauri::command]
pub async fn refresh_all_account_cookies(state: State<'_, AppState>) -> CmdResult {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    Ok(wrap_ok(refresh_accounts_batch(&state, false).await))
}

#[tauri::command]
pub async fn refresh_all_account_profiles(state: State<'_, AppState>) -> CmdResult {
    Ok(wrap_ok(refresh_all_account_profiles_inner(&state).await))
}
