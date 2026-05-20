use super::client_version::inject_live_client_identity;
use super::common::{
    clear_user_auth_flags, error_message, is_auth_invalid_code, live_platform,
    mark_current_user_login_invalid,
};
use super::danmu::{start_danmu_monitor_inner, stop_danmu_monitor_inner};
use super::linkage::{
    apply_command_template, build_command_template_context, empty_command_template_context,
    normalize_live_control_mode, obs_ws_start_stream, obs_ws_stop_stream, spawn_shell_command,
};
use super::profile::push_recent_area;
use super::session::{
    apply_live_session_identity, clear_live_session_identity, resolve_current_auth_context,
    LIVE_STATUS_LIVE, LIVE_STATUS_OFFLINE,
};
use super::stream::{collect_stream_endpoints, select_primary_endpoint};
use crate::bili::app_sign;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use std::collections::BTreeMap;
use tauri::AppHandle;

pub(crate) async fn start_live_inner(state: &AppState) -> CmdResult {
    let (room_id, csrf, cookie, area) = {
        let runtime = state.runtime.lock().await;
        let (_uid, room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        let area = runtime.session.current_area_id.unwrap_or(235);
        (room_id, csrf, cookie, area)
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
    let room_id_for_rollback = room_id.clone();
    let csrf_for_rollback = csrf.clone();
    let now = chrono::Utc::now().timestamp().to_string();

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("platform".into(), live_platform());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.clone());
    form.insert("csrf".into(), csrf);
    inject_live_client_identity(state, &mut form, false).await;
    form.insert("ts".into(), now);
    let form = app_sign(&form);

    let response = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/room/v1/Room/startLive"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = response["code"].as_i64().unwrap_or(-1);
    if code == 60024 {
        let qr = response["data"]["qr"].as_str().unwrap_or("").to_string();
        return Ok(json!({ "code": 60024, "msg": "i18n.live.face_auth_required", "qr": qr }));
    }
    if code == 60043 {
        let uid = {
            let runtime = state.runtime.lock().await;
            runtime.session.uid
        };
        let qr = format!(
            "{}/blackboard/live/face-auth-middle.html?source_event=400&mid={uid}",
            endpoints::www("")
        );
        return Ok(json!({ "code": 60043, "msg": "i18n.live.face_auth_required", "qr": qr }));
    }
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "start_live code={code}, msg={}",
                    error_message(&response, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &response,
            "i18n.live.error.start_live_failed",
        ));
    }

    let stream_data = &response["data"];
    let endpoints = collect_stream_endpoints(stream_data);
    let primary = select_primary_endpoint(&endpoints);
    let primary_context = primary
        .as_ref()
        .map(build_command_template_context)
        .unwrap_or_else(empty_command_template_context);

    let (
        live_control_mode,
        obs_ws_url,
        obs_ws_password,
        start_command_template,
        obs_ws_auto_start_on_live,
    ) = {
        let runtime = state.runtime.lock().await;
        (
            normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
            runtime.config.obs_ws_url.clone(),
            runtime.config.obs_ws_password.clone(),
            runtime.config.on_live_start_command.clone(),
            runtime.config.obs_ws_auto_start_on_live,
        )
    };

    let linkage_result = match live_control_mode.as_str() {
        "obs_ws" => {
            if !obs_ws_auto_start_on_live {
                Ok(())
            } else if primary_context.server.trim().is_empty()
                || primary_context.stream_key.trim().is_empty()
            {
                Err("i18n.live.error.obs_stream_context_missing".to_string())
            } else {
                obs_ws_start_stream(&obs_ws_url, &obs_ws_password, &primary_context).await
            }
        }
        "command" => {
            let command = apply_command_template(&start_command_template, &primary_context);
            spawn_shell_command(&command).await
        }
        _ => Ok(()),
    };

    if let Err(link_error) = linkage_result {
        let mut rollback_form = BTreeMap::new();
        rollback_form.insert("room_id".into(), room_id_for_rollback);
        rollback_form.insert("platform".into(), live_platform());
        rollback_form.insert("csrf".into(), csrf_for_rollback.clone());
        rollback_form.insert("csrf_token".into(), csrf_for_rollback);
        let _ = state
            .client
            .post_form_with_cookie(
                &endpoints::live_api("/room/v1/Room/stopLive"),
                &rollback_form,
                &cookie,
            )
            .await;
        return Err(format!(
            "i18n.live.error.start_linkage_failed_with_rollback:{link_error}"
        ));
    }

    let live_key = stream_data["live_key"].as_str();
    let sub_session_key = stream_data["sub_session_key"].as_str();

    let mut runtime = state.runtime.lock().await;
    runtime.session.is_live = true;
    runtime.session.live_status = Some(LIVE_STATUS_LIVE);
    apply_live_session_identity(&mut runtime.session, live_key, sub_session_key);
    let current_area = if runtime.session.current_area_names.len() >= 2 {
        Some((
            runtime.session.current_area_names[0].clone(),
            runtime.session.current_area_names[1].clone(),
        ))
    } else {
        None
    };
    if let Some(uid) = runtime.config.current_uid.clone() {
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            clear_user_auth_flags(user);
            if let Some((parent, child)) = current_area {
                push_recent_area(user, &parent, &child);
            } else if user.last_area_name.len() >= 2 {
                let parent = user.last_area_name[0].clone();
                let child = user.last_area_name[1].clone();
                push_recent_area(user, &parent, &child);
            }
        }
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);

    let (primary_addr, primary_code) = primary
        .as_ref()
        .map(|item| (item.addr.clone(), item.code.clone()))
        .unwrap_or_default();

    Ok(wrap_ok(json!({
        "rtmp1": {
            "addr": primary_addr,
            "code": primary_code
        },
        "protocols": stream_data["protocols"],
        "endpoints": endpoints,
        "primary_protocol": primary.as_ref().map(|item| item.protocol.clone()).unwrap_or_default(),
        "live_key": stream_data["live_key"],
        "sub_session_key": stream_data["sub_session_key"],
        "status": stream_data["status"],
        "need_face_auth": stream_data["need_face_auth"],
        "service_source": stream_data["service_source"],
        "up_stream_extra": stream_data["up_stream_extra"]
    })))
}

pub(crate) async fn stop_live_inner(state: &AppState) -> CmdResult {
    let (room_id, csrf, cookie, expected_live_key, expected_sub_session_key) = {
        let runtime = state.runtime.lock().await;
        let (_, room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
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
    form.insert("platform".into(), live_platform());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/room/v1/Room/stopLive"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let (
            live_control_mode,
            obs_ws_url,
            obs_ws_password,
            stop_command_template,
            obs_ws_auto_stop_on_live_end,
        ) = {
            let runtime = state.runtime.lock().await;
            (
                normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
                runtime.config.obs_ws_url.clone(),
                runtime.config.obs_ws_password.clone(),
                runtime.config.on_live_stop_command.clone(),
                runtime.config.obs_ws_auto_stop_on_live_end,
            )
        };
        let empty_context = empty_command_template_context();
        let linkage_result = match live_control_mode.as_str() {
            "obs_ws" => {
                if obs_ws_auto_stop_on_live_end {
                    obs_ws_stop_stream(&obs_ws_url, &obs_ws_password).await
                } else {
                    Ok(())
                }
            }
            "command" => {
                let command = apply_command_template(&stop_command_template, &empty_context);
                spawn_shell_command(&command).await
            }
            _ => Ok(()),
        };
        if let Err(error) = linkage_result {
            eprintln!("[live][stop] linkage failed: {error}");
        }

        let mut runtime = state.runtime.lock().await;
        let current_live_key = runtime.session.live_key.clone();
        let current_sub_session_key = runtime.session.sub_session_key.clone();
        let same_session = current_live_key == expected_live_key
            && current_sub_session_key == expected_sub_session_key;
        if !same_session {
            eprintln!(
                "[live][stop] session identity changed during stop, skip local session override"
            );
            return Ok(wrap_ok(json!({ "session_consistent": false })));
        }
        runtime.session.is_live = false;
        runtime.session.live_status = Some(LIVE_STATUS_OFFLINE);
        clear_live_session_identity(&mut runtime.session);
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({ "session_consistent": true })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!("stop_live code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(&value, "i18n.live.error.stop_live_failed"))
    }
}

pub async fn start_live_flow_inner(app: &AppHandle, state: &AppState) -> CmdResult {
    let start_result = start_live_inner(state).await?;
    let code = start_result["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Ok(start_result);
    }

    let danmu_result = start_danmu_monitor_inner(app, state)
        .await
        .unwrap_or_else(|error| {
            json!({
                "started": false,
                "msg": format!("i18n.live.error.start_live_failed:{error}"),
            })
        });

    let recent_areas = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .as_ref()
            .and_then(|uid| runtime.config.users.get(uid))
            .map(|user| user.recent_areas.clone())
            .unwrap_or_default()
    };

    Ok(wrap_ok(json!({
        "stream_info": start_result["data"].clone(),
        "danmu_monitor_started": danmu_result["started"].as_bool().unwrap_or(false),
        "danmu_monitor_msg": danmu_result["msg"].as_str().unwrap_or(""),
        "recent_areas": recent_areas,
    })))
}

pub async fn stop_live_flow_inner(state: &AppState) -> CmdResult {
    let stop_result = stop_live_inner(state).await?;
    let code = stop_result["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return Ok(stop_result);
    }
    let session_consistent = stop_result["data"]["session_consistent"]
        .as_bool()
        .unwrap_or(true);
    if !session_consistent {
        return Ok(wrap_ok(json!({
            "live_stopped": false,
            "danmu_monitor_stopped": false,
            "danmu_monitor_msg": "",
            "session_consistent": false
        })));
    }

    let danmu_result = stop_danmu_monitor_inner(state)
        .await
        .unwrap_or_else(|error| {
            json!({
                "stopped": false,
                "msg": format!("i18n.live.error.stop_live_failed:{error}"),
            })
        });

    Ok(wrap_ok(json!({
        "live_stopped": true,
        "danmu_monitor_stopped": danmu_result["stopped"].as_bool().unwrap_or(false),
        "danmu_monitor_msg": danmu_result["msg"].as_str().unwrap_or(""),
        "session_consistent": true
    })))
}
