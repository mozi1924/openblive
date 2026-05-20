use crate::bili::wbi_signed;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::emoticon::parse_live_emoticon_packages;
use crate::endpoints;
use crate::models::{
    CreateLiveVoteReq, DanmuReq, TerminateLiveVoteReq, UpdateAreaReq, UpdateTagsReq, UpdateTitleReq,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use crate::state_event::{emit_runtime_snapshot, emit_studio_state_event};
use serde_json::json;
use std::collections::BTreeMap;
use tauri::{AppHandle, State};

mod client_version;
mod common;
mod danmu;
mod flow;
mod linkage;
mod profile;
mod profile_api;
mod profile_sync;
mod session;
mod stream;
use client_version::refresh_live_client_version as refresh_live_client_version_inner_cmd;
pub use client_version::refresh_live_client_version_inner;
use common::{
    clear_user_auth_flags, error_message, is_auth_invalid_code, mark_current_user_login_invalid,
};
use danmu::{start_danmu_monitor_inner, stop_danmu_monitor_inner};
pub use flow::{start_live_flow_inner, stop_live_flow_inner};
use flow::{start_live_inner, stop_live_inner};
pub(crate) use linkage::obs_ws_probe;
use profile_api::{
    get_partitions as get_partitions_inner, update_area as update_area_inner,
    update_live_tags as update_live_tags_inner, update_title as update_title_inner,
};
use profile_sync::{
    sync_live_room_profile as sync_live_room_profile_inner,
    sync_live_status as sync_live_status_inner,
};
use session::resolve_current_auth_context;

#[tauri::command]
pub async fn sync_live_status(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let result = sync_live_status_inner(state.clone()).await;
    if result.is_ok() {
        emit_runtime_snapshot(&app, &state, "command.sync_live_status").await;
    }
    result
}

#[tauri::command]
pub async fn refresh_live_client_version(state: State<'_, AppState>) -> CmdResult {
    refresh_live_client_version_inner_cmd(state).await
}

#[tauri::command]
pub async fn sync_live_room_profile(state: State<'_, AppState>) -> CmdResult {
    sync_live_room_profile_inner(state).await
}

#[tauri::command]
pub async fn get_partitions(state: State<'_, AppState>) -> CmdResult {
    get_partitions_inner(state).await
}

#[tauri::command]
pub async fn update_area(req: UpdateAreaReq, state: State<'_, AppState>) -> CmdResult {
    update_area_inner(req, state).await
}

#[tauri::command]
pub async fn update_title(req: UpdateTitleReq, state: State<'_, AppState>) -> CmdResult {
    update_title_inner(req, state).await
}

#[tauri::command]
pub async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
    update_live_tags_inner(req, state).await
}

#[tauri::command]
pub async fn start_live(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let result = start_live_inner(&state).await;
    if let Ok(payload) = &result {
        emit_studio_state_event(
            &app,
            "live.flow",
            "command.start_live",
            json!({
                "action": "start",
                "ok": payload["code"].as_i64().unwrap_or(-1) == 0,
                "code": payload["code"].as_i64().unwrap_or(-1),
            }),
        );
    }
    if result.is_ok() {
        emit_runtime_snapshot(&app, &state, "command.start_live").await;
    }
    result
}

#[tauri::command]
pub async fn stop_live(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let result = stop_live_inner(&state).await;
    if let Ok(payload) = &result {
        emit_studio_state_event(
            &app,
            "live.flow",
            "command.stop_live",
            json!({
                "action": "stop",
                "ok": payload["code"].as_i64().unwrap_or(-1) == 0,
                "code": payload["code"].as_i64().unwrap_or(-1),
                "session_consistent": payload["data"]["session_consistent"].as_bool().unwrap_or(true),
            }),
        );
    }
    if result.is_ok() {
        emit_runtime_snapshot(&app, &state, "command.stop_live").await;
    }
    result
}

#[tauri::command]
pub async fn start_live_flow(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    start_live_flow_inner(&app, &state).await
}

#[tauri::command]
pub async fn stop_live_flow(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    stop_live_flow_inner(&app, &state).await
}

#[tauri::command]
pub async fn send_danmu(req: DanmuReq, state: State<'_, AppState>) -> CmdResult {
    let (_uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

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
        .post_form_with_cookie(
            &format!("{}?{query}", endpoints::live_api("/msg/send")),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({ "msg": "i18n.live.danmu_send_success" })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("send_danmu code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(&value, "i18n.live.error.send_danmu_failed"))
    }
}

#[tauri::command]
pub async fn get_live_emoticons(state: State<'_, AppState>) -> CmdResult {
    let (_uid, room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/web-ucenter/v2/emoticon/GetEmoticons"),
            &[("platform", "pc".to_string()), ("room_id", room_id)],
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let packages =
            parse_live_emoticon_packages(&state.client, &state.config_path, &value).await;
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!(packages)))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "get_live_emoticons code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.fetch_live_emoticons_failed",
        ))
    }
}

#[tauri::command]
pub async fn get_live_vote_panel(state: State<'_, AppState>) -> CmdResult {
    let (_uid, room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-room/v1/dm/interaction/votePanel"),
            &[("room_id", room_id)],
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(value["data"].clone()))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "get_live_vote_panel code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.fetch_live_vote_panel_failed",
        ))
    }
}

#[tauri::command]
pub async fn get_live_vote_history(state: State<'_, AppState>) -> CmdResult {
    let (_uid, room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-room/v1/dm/interaction/voteHistory"),
            &[("room_id", room_id)],
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(value["data"].clone()))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "get_live_vote_history code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.fetch_live_vote_history_failed",
        ))
    }
}

#[tauri::command]
pub async fn create_live_vote(req: CreateLiveVoteReq, state: State<'_, AppState>) -> CmdResult {
    if !(1..=9).contains(&req.duration) {
        return Err("i18n.live.error.invalid_vote_duration".into());
    }

    let (room_id, csrf, cookie, live_key, sub_session_key) = {
        let runtime = state.runtime.lock().await;
        let (_uid, room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (
            room_id,
            csrf,
            cookie,
            runtime.session.live_key.clone(),
            runtime.session.sub_session_key.clone(),
        )
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("duration".into(), req.duration.to_string());
    form.insert("question".into(), req.question);
    form.insert("option_a".into(), req.option_a);
    form.insert("option_b".into(), req.option_b);
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    if let Some(template_id) = req.template_id.filter(|value| *value > 0) {
        form.insert("template_id".into(), template_id.to_string());
    }
    if let Some(value) = live_key.filter(|value| !value.trim().is_empty()) {
        form.insert("live_key".into(), value);
    }
    if let Some(value) = sub_session_key.filter(|value| !value.trim().is_empty()) {
        form.insert("sub_session_key".into(), value);
    }

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-room/v1/dm/interaction/createVote"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({
            "interaction_id": value["data"]["interaction_id"].as_u64().unwrap_or(0)
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "create_live_vote code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.create_live_vote_failed",
        ))
    }
}

#[tauri::command]
pub async fn terminate_live_vote(
    req: TerminateLiveVoteReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let (_uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if room_id.is_empty() {
        return Err("i18n.live.error.room_id_missing".into());
    }
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("interaction_id".into(), req.interaction_id.to_string());
    form.insert("room_id".into(), room_id);
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-room/v1/dm/interaction/terminateVote"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!(null)))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "terminate_live_vote code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.terminate_live_vote_failed",
        ))
    }
}

#[tauri::command]
pub async fn start_danmu_monitor(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let payload = start_danmu_monitor_inner(&app, &state).await?;
    emit_studio_state_event(
        &app,
        "danmu.monitor",
        "command.start_danmu_monitor",
        json!({
            "running": payload["started"].as_bool().unwrap_or(false),
            "msg": payload["msg"].as_str().unwrap_or(""),
        }),
    );
    emit_runtime_snapshot(&app, &state, "command.start_danmu_monitor").await;
    Ok(wrap_ok(json!({
        "msg": payload["msg"].as_str().unwrap_or("i18n.live.danmu_monitor_started")
    })))
}

#[tauri::command]
pub async fn stop_danmu_monitor(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let payload = stop_danmu_monitor_inner(&state).await?;
    emit_studio_state_event(
        &app,
        "danmu.monitor",
        "command.stop_danmu_monitor",
        json!({
            "running": false,
            "stopped": payload["stopped"].as_bool().unwrap_or(false),
            "msg": payload["msg"].as_str().unwrap_or(""),
        }),
    );
    emit_runtime_snapshot(&app, &state, "command.stop_danmu_monitor").await;
    Ok(wrap_ok(json!({
        "msg": payload["msg"].as_str().unwrap_or("i18n.live.danmu_monitor_stopped")
    })))
}
