use super::client_version::inject_live_client_identity;
use super::common::{
    clear_user_auth_flags, error_message, is_auth_invalid_code, live_platform,
    mark_current_user_login_invalid,
};
use super::danmu::start_danmu_monitor_inner;
use super::linkage::{
    apply_command_template, build_command_template_context, build_primary_push_fallback_context,
    empty_command_template_context, normalize_live_control_mode, obs_ws_start_stream,
    obs_ws_stop_stream, spawn_shell_command, spawn_shell_command_checked,
};
use super::profile::push_recent_area;
use super::profile_sync::sync_live_status_runtime;
use super::session::{
    apply_live_session_identity, clear_live_session_identity, resolve_current_auth_context,
};
use super::stream::{collect_stream_endpoints, select_primary_endpoint};
use crate::bili::app_sign;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::live_status::{
    is_live_or_round_status, resolve_live_status, LIVE_STATUS_LIVE, LIVE_STATUS_OFFLINE,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use crate::state_event::{emit_runtime_snapshot, emit_studio_state_event};
use serde_json::json;
use std::collections::BTreeMap;
use tauri::AppHandle;

async fn resolve_start_live_ts(state: &AppState, cookie: &str) -> String {
    let local_ts = chrono::Utc::now().timestamp().to_string();
    let value = match state
        .client
        .get_json_with_cookie(&endpoints::api("/x/report/click/now"), &[], cookie)
        .await
    {
        Ok(value) => value,
        Err(_) => return local_ts,
    };

    value["data"]["now"]
        .as_i64()
        .filter(|ts| *ts > 0)
        .map(|ts| ts.to_string())
        .unwrap_or(local_ts)
}

async fn request_start_live(
    state: &AppState,
    cookie: &str,
    room_id: &str,
    csrf: &str,
    area: u64,
    force_refresh_identity: bool,
) -> Result<serde_json::Value, String> {
    let ts = resolve_start_live_ts(state, cookie).await;
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id.to_string());
    form.insert("platform".into(), live_platform());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.to_string());
    form.insert("csrf".into(), csrf.to_string());
    inject_live_client_identity(state, &mut form, force_refresh_identity).await;
    form.insert("ts".into(), ts);
    let form = app_sign(&form);

    state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/room/v1/Room/startLive"),
            &form,
            cookie,
        )
        .await
        .map_err(|error| error.to_string())
}

pub(crate) async fn start_live_inner(app: &AppHandle, state: &AppState) -> CmdResult {
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
    let response_first = request_start_live(state, &cookie, &room_id, &csrf, area, false).await?;
    let mut response = response_first.clone();
    let mut code = response["code"].as_i64().unwrap_or(-1);
    if matches!(code, 60024 | 60043) {
        let response_retry =
            request_start_live(state, &cookie, &room_id, &csrf, area, true).await?;
        let retry_code = response_retry["code"].as_i64().unwrap_or(-1);
        if retry_code == 0 {
            response = response_retry;
            code = 0;
        } else {
            response = response_retry;
            code = retry_code;
        }
    }
    if code == 60024 {
        let qr = response["data"]["qr"].as_str().unwrap_or("").to_string();
        return Ok(json!({ "code": 60024, "msg": "i18n.live.face_auth_required", "qr": qr }));
    }
    if code == 60043 {
        let v_voucher = response["data"]["risk_extra"]["v_voucher"]
            .as_str()
            .unwrap_or("")
            .to_string();

        let mut reg_form = BTreeMap::new();
        reg_form.insert("v_voucher".into(), v_voucher.clone());
        reg_form.insert("dm_track".into(), "[]".into());
        reg_form.insert("csrf".into(), csrf.clone());

        let reg_response = state
            .client
            .post_form_with_cookie(
                "https://api.bilibili.com/x/gaia-vgate/v2/register",
                &reg_form,
                &cookie,
            )
            .await
            .map_err(|e| format!("v2 register request failed: {}", e))?;

        let content_enc = reg_response["data"]["content"]
            .as_str()
            .ok_or_else(|| "v2 register response missing content".to_string())?;

        let decrypted_data = crate::captcha::decrypt_captcha(&v_voucher, content_enc)?;

        let token = decrypted_data["token"]
            .as_str()
            .ok_or_else(|| "decrypted content missing token".to_string())?
            .to_string();

        let risk_type = decrypted_data["type"]
            .as_str()
            .ok_or_else(|| "decrypted content missing type".to_string())?;

        if risk_type != "realname" {
            return Err(format!("Unsupported risk type: {}", risk_type));
        }

        let obfuscated_token = crate::captcha::obfuscate_token(&token, None, None);

        let t_inner = urlencoding::encode(&obfuscated_token);
        let t_encoded = urlencoding::encode(&t_inner);
        let qr_url = format!("https://www.bilibili.com/h5/risk-control/realname?t={}", t_encoded);

        // Spawn validatePreCheck background polling task
        let client_clone = state.client.clone();
        let cookie_clone = cookie.clone();
        let csrf_clone = csrf.clone();
        let token_clone = token.clone();
        let app_handle = app.clone();

        tokio::spawn(async move {
            let url = "https://api.bilibili.com/x/gaia-vgate/v2/validatePreCheck";
            let start_time = std::time::Instant::now();
            let mut verified = false;

            while start_time.elapsed().as_secs() < 120 {
                let mut params = BTreeMap::new();
                params.insert("token".to_string(), token_clone.clone());
                params.insert("dm_track".to_string(), crate::captcha::gen_dm_track());
                params.insert("csrf".to_string(), csrf_clone.clone());

                match client_clone.post_form_with_cookie(url, &params, &cookie_clone).await {
                    Ok(resp) => {
                        if let Some(status) = resp["data"]["status"].as_i64() {
                            if status == 1 {
                                verified = true;
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        crate::runtime_warn!("validatePreCheck poll failed: {}", e);
                    }
                }
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
            }

            if verified {
                crate::runtime_log!("Face verification succeeded!");
                emit_studio_state_event(
                    &app_handle,
                    "live.face_auth_success",
                    "validate_pre_check",
                    json!({ "ok": true }),
                );
            } else {
                crate::runtime_log!("Face verification timed out or failed.");
            }
        });

        return Ok(json!({ "code": 60043, "msg": "i18n.live.face_auth_required", "qr": qr_url }));
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

    let (live_control_mode, obs_ws_url, obs_ws_password, start_command_template) = {
        let runtime = state.runtime.lock().await;
        (
            normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
            runtime.config.obs_ws_url.clone(),
            runtime.config.obs_ws_password.clone(),
            runtime.config.on_live_start_command.clone(),
        )
    };

    let linkage_result = match live_control_mode.as_str() {
        "obs_ws" => {
            if primary_context.server.trim().is_empty()
                || primary_context.stream_code.trim().is_empty()
            {
                Err("i18n.live.error.obs_stream_context_missing".to_string())
            } else {
                let obs_ws_url_bg = obs_ws_url.clone();
                let obs_ws_password_bg = obs_ws_password.clone();
                let primary_context_bg = primary_context.clone();
                let app_bg = app.clone();
                tokio::spawn(async move {
                    if let Err(error) = obs_ws_start_stream(
                        app_bg,
                        &obs_ws_url_bg,
                        &obs_ws_password_bg,
                        &primary_context_bg,
                    )
                    .await
                    {
                        crate::runtime_warn!("[live][obs] async start linkage failed: {error}");
                    }
                });
                Ok(())
            }
        }
        "command" => {
            if start_command_template.trim().is_empty() {
                Err("i18n.live.error.command_start_template_missing".to_string())
            } else {
                let command = apply_command_template(&start_command_template, &primary_context)?;
                match spawn_shell_command_checked(&command).await {
                    Ok(()) => Ok(()),
                    Err(first_error) => {
                        if let Some(fallback_context) =
                            build_primary_push_fallback_context(&primary_context)
                        {
                            let fallback_command =
                                apply_command_template(&start_command_template, &fallback_context)?;
                            match spawn_shell_command_checked(&fallback_command).await {
                                Ok(()) => {
                                    crate::runtime_log!(
                                        "[live][command] process exit non-zero detected, fallback to {} succeeded",
                                        fallback_context.server
                                    );
                                    Ok(())
                                }
                                Err(fallback_error) => Err(format!(
                                    "i18n.live.error.command_fallback_failed:first={first_error}, fallback={fallback_error}"
                                )),
                            }
                        } else {
                            Err(first_error)
                        }
                    }
                }
            }
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
    let session_live_key = runtime.session.live_key.clone();
    let session_sub_session_key = runtime.session.sub_session_key.clone();
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
            user.live_key = session_live_key;
            user.sub_session_key = session_sub_session_key;
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

async fn preflight_update_pre_live_info(state: &AppState) -> Result<serde_json::Value, String> {
    let (csrf, cookie, title) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        let title = runtime
            .config
            .users
            .get(&uid)
            .map(|user| {
                let submitted = user.live_profile_state.title.submitted.trim();
                if !submitted.is_empty() {
                    submitted.to_string()
                } else {
                    user.last_title.trim().to_string()
                }
            })
            .unwrap_or_default();
        (csrf, cookie, title)
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }
    if title.trim().is_empty() {
        return Ok(json!({
            "ok": true,
            "skipped": true,
            "reason": "TITLE_EMPTY",
        }));
    }

    let mut form = BTreeMap::new();
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    form.insert("platform".into(), "web".to_string());
    form.insert("mobi_app".into(), "web".to_string());
    form.insert("build".into(), "1".to_string());
    form.insert("title".into(), title.clone());

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/preLive/UpdatePreLiveInfo"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "preflight_update_pre_live_info code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(&value, "i18n.live.error.update_title_failed"));
    }

    let audit_info = value["data"]["audit_info"].clone();
    Ok(json!({
        "ok": true,
        "skipped": false,
        "title": title,
        "audit_title_status": audit_info["audit_title_status"].as_i64().unwrap_or(-1),
        "audit_title_reason": audit_info["audit_title_reason"].as_str().unwrap_or(""),
    }))
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
        let (live_control_mode, obs_ws_url, obs_ws_password, stop_command_template) = {
            let runtime = state.runtime.lock().await;
            (
                normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
                runtime.config.obs_ws_url.clone(),
                runtime.config.obs_ws_password.clone(),
                runtime.config.on_live_stop_command.clone(),
            )
        };
        let empty_context = empty_command_template_context();
        let linkage_result = match live_control_mode.as_str() {
            "obs_ws" => obs_ws_stop_stream(&obs_ws_url, &obs_ws_password).await,
            "command" => {
                if stop_command_template.trim().is_empty() {
                    return Err("i18n.live.error.command_stop_template_missing".to_string());
                }
                let command = apply_command_template(&stop_command_template, &empty_context)?;
                spawn_shell_command(&command).await
            }
            _ => Ok(()),
        };
        if let Err(error) = linkage_result {
            crate::runtime_warn!("[live][stop] linkage failed: {error}");
        }

        let response_sub_session_key = value["data"]["sub_session_key"]
            .as_str()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(|item| item.to_string());

        let mut runtime = state.runtime.lock().await;
        let current_live_key = runtime.session.live_key.clone();
        let current_sub_session_key = runtime.session.sub_session_key.clone();
        let response_session_consistent =
            match (&expected_sub_session_key, &response_sub_session_key) {
                (Some(expected), Some(actual)) => expected == actual,
                _ => true,
            };
        let same_session = current_live_key == expected_live_key
            && current_sub_session_key == expected_sub_session_key
            && response_session_consistent;
        if !same_session {
            let has_expected_identity = expected_live_key.as_deref().is_some()
                || expected_sub_session_key.as_deref().is_some();
            let mut reclaimed_user_count = 0usize;
            if has_expected_identity {
                for user in runtime.config.users.values_mut() {
                    if user.live_key.as_deref() == expected_live_key.as_deref()
                        && user.sub_session_key.as_deref() == expected_sub_session_key.as_deref()
                    {
                        user.live_key = None;
                        user.sub_session_key = None;
                        reclaimed_user_count += 1;
                    }
                }
            }
            if reclaimed_user_count > 0 {
                save_config(&state.config_path, &runtime.config, &state.master_key);
            }
            crate::runtime_log!(
                "[live][stop] session identity changed during stop, skip local session override, reclaimed_user_count={reclaimed_user_count}"
            );
            return Ok(wrap_ok(json!({
                "session_consistent": false,
                "reclaimed_user_count": reclaimed_user_count
            })));
        }
        runtime.session.is_live = false;
        runtime.session.live_status = Some(LIVE_STATUS_OFFLINE);
        clear_live_session_identity(&mut runtime.session);
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
                user.live_key = None;
                user.sub_session_key = None;
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
    match preflight_update_pre_live_info(state).await {
        Ok(preflight) => {
            emit_studio_state_event(app, "live.preflight", "start_live_flow_inner", preflight);
        }
        Err(error) => {
            emit_studio_state_event(
                app,
                "live.preflight",
                "start_live_flow_inner",
                json!({
                    "ok": false,
                    "error": error
                }),
            );
            return Err(error);
        }
    }

    let start_result = start_live_inner(app, state).await?;
    let code = start_result["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        emit_studio_state_event(
            app,
            "live.flow",
            "start_live_flow_inner",
            json!({
                "action": "start",
                "ok": false,
                "code": code
            }),
        );
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

    let response = wrap_ok(json!({
        "stream_info": start_result["data"].clone(),
        "danmu_monitor_started": danmu_result["started"].as_bool().unwrap_or(false),
        "danmu_monitor_msg": danmu_result["msg"].as_str().unwrap_or(""),
        "recent_areas": recent_areas,
    }));
    emit_studio_state_event(
        app,
        "live.flow",
        "start_live_flow_inner",
        json!({
            "action": "start",
            "ok": true,
            "code": 0,
            "danmu_monitor_started": danmu_result["started"].as_bool().unwrap_or(false),
        }),
    );
    emit_runtime_snapshot(app, state, "start_live_flow_inner").await;
    crate::tray::refresh_tray_menu(app);
    Ok(response)
}

pub async fn stop_live_flow_inner(app: &AppHandle, state: &AppState) -> CmdResult {
    let stop_result = stop_live_inner(state).await?;
    let code = stop_result["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        emit_studio_state_event(
            app,
            "live.flow",
            "stop_live_flow_inner",
            json!({
                "action": "stop",
                "ok": false,
                "code": code
            }),
        );
        return Ok(stop_result);
    }
    let session_consistent = stop_result["data"]["session_consistent"]
        .as_bool()
        .unwrap_or(true);
    if !session_consistent {
        let synced_session = sync_live_status_runtime(state).await;
        let synced_live_status =
            resolve_live_status(synced_session.live_status, synced_session.is_live);
        let synced_is_live = is_live_or_round_status(synced_live_status);
        let response = wrap_ok(json!({
            "live_stopped": !synced_is_live,
            "danmu_monitor_stopped": false,
            "danmu_monitor_msg": "",
            "session_consistent": false,
            "sync_fallback_applied": true
        }));
        emit_studio_state_event(
            app,
            "live.flow",
            "stop_live_flow_inner",
            json!({
                "action": "stop",
                "ok": true,
                "code": 0,
                "session_consistent": false,
                "sync_fallback_applied": true,
                "danmu_monitor_stopped": false,
            }),
        );
        emit_runtime_snapshot(app, state, "stop_live_flow_inner").await;
        crate::tray::refresh_tray_menu(app);
        return Ok(response);
    }

    let response = wrap_ok(json!({
        "live_stopped": true,
        "danmu_monitor_stopped": false,
        "danmu_monitor_msg": "",
        "session_consistent": true
    }));
    emit_studio_state_event(
        app,
        "live.flow",
        "stop_live_flow_inner",
        json!({
            "action": "stop",
            "ok": true,
            "code": 0,
            "session_consistent": true,
            "danmu_monitor_stopped": false,
        }),
    );
    emit_runtime_snapshot(app, state, "stop_live_flow_inner").await;
    crate::tray::refresh_tray_menu(app);
    Ok(response)
}
