use crate::avatar;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::models::{AddSilentUserReq, GetSilentUserListReq, RemoveSilentUserReq};
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};

use super::common::{
    clear_user_auth_flags, error_message, is_auth_invalid_code, mark_current_user_login_invalid,
};
use super::session::resolve_room_scoped_auth_context;

fn normalize_page(page: Option<u32>) -> u32 {
    page.unwrap_or(1).max(1)
}

fn normalize_face_url(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else if let Some(stripped) = trimmed.strip_prefix("http://") {
        format!("https://{stripped}")
    } else {
        trimmed.to_string()
    }
}

pub(crate) async fn add_silent_user_inner(req: AddSilentUserReq, state: &AppState) -> CmdResult {
    if req.tuid == 0 {
        return Err("i18n.live.error.invalid_target_uid".into());
    }
    if req.hour < -1 {
        return Err("i18n.live.error.invalid_silent_duration".into());
    }

    let (_uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_room_scoped_auth_context(&runtime, true)?
    };

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("tuid".into(), req.tuid.to_string());
    form.insert("mobile_app".into(), "web".to_string());
    form.insert("hour".into(), req.hour.to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    if let Some(msg) = req.msg {
        let trimmed = msg.trim();
        if !trimmed.is_empty() {
            form.insert("msg".into(), trimmed.to_string());
        }
    }

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/web-ucenter/v1/banned/AddSilentUser"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(current_uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&current_uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!(null)))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "add_silent_user code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.add_silent_user_failed",
        ))
    }
}

pub(crate) async fn get_silent_user_list_inner(
    req: GetSilentUserListReq,
    state: &AppState,
) -> CmdResult {
    let page = normalize_page(req.page);

    let (_uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_room_scoped_auth_context(&runtime, true)?
    };

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("ps".into(), page.to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/web-ucenter/v1/banned/GetSilentUserList"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(current_uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&current_uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);

        let data = value["data"].clone();
        let total = data["total"].as_u64().unwrap_or(0);
        let total_page = data["total_page"].as_u64().unwrap_or(1);
        let mut items = data["data"].as_array().cloned().unwrap_or_default();

        let mut avatar_targets = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let uid = item["tuid"]
                .as_u64()
                .map(|value| value.to_string())
                .or_else(|| {
                    item["tuid"]
                        .as_str()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                })
                .unwrap_or_default();
            let face_hint = item["face"]
                .as_str()
                .map(normalize_face_url)
                .unwrap_or_default();
            avatar_targets.push((index, uid, face_hint));
        }

        let mut avatar_requests = HashMap::new();
        for (_, uid, face_hint) in &avatar_targets {
            if uid.is_empty() || avatar::load_cached_face_data_url(&state.config_path, uid).is_some()
            {
                continue;
            }
            let fallback = if face_hint.trim().is_empty() {
                None
            } else {
                Some(face_hint.clone())
            };
            avatar_requests.insert(uid.clone(), fallback);
        }
        let resolved_faces = if avatar_requests.is_empty() {
            HashMap::new()
        } else {
            match avatar::resolve_and_cache_face_data_urls(
                &state.client,
                &state.config_path,
                &avatar_requests,
            )
            .await
            {
                Ok(resolved) => resolved,
                Err(error) => {
                    crate::runtime_warn!("get_silent_user_list resolve avatars failed: {}", error);
                    HashMap::new()
                }
            }
        };

        for (index, uid, face_hint) in avatar_targets {
            let final_face = if uid.is_empty() {
                face_hint
            } else {
                avatar::load_cached_face_data_url(&state.config_path, &uid)
                    .or_else(|| resolved_faces.get(&uid).cloned())
                    .unwrap_or(face_hint)
            };

            if !final_face.trim().is_empty() {
                items[index]["face"] = serde_json::Value::String(final_face);
            }
        }

        Ok(wrap_ok(json!({
            "page": page,
            "total": total,
            "total_page": total_page,
            "items": items,
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "get_silent_user_list code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.get_silent_user_list_failed",
        ))
    }
}

pub(crate) async fn remove_silent_user_inner(
    req: RemoveSilentUserReq,
    state: &AppState,
) -> CmdResult {
    if req.id == 0 {
        return Err("i18n.live.error.invalid_silent_record_id".into());
    }

    let (_uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_room_scoped_auth_context(&runtime, true)?
    };

    let mut form = BTreeMap::new();
    form.insert("roomid".into(), room_id);
    form.insert("id".into(), req.id.to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/banned_service/v1/Silent/del_room_block_user"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(current_uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&current_uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!(null)))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "remove_silent_user code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.remove_silent_user_failed",
        ))
    }
}
