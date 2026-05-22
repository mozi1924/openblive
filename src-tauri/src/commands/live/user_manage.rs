use crate::avatar;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::models::{
    AddBlackUserReq, AddRoomAdminReq, AddSilentUserReq, GetBlackUserListReq, GetRoomAdminListReq,
    GetSilentUserListReq, RemoveBlackUserReq, RemoveRoomAdminReq, RemoveSilentUserReq,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};

use super::common::{
    clear_user_auth_flags, error_message, is_auth_invalid_code, mark_current_user_login_invalid,
};
use super::session::{resolve_current_auth_context, resolve_room_scoped_auth_context};

fn normalize_page(page: Option<u32>) -> u32 {
    page.unwrap_or(1).max(1)
}

fn normalize_page_size(page_size: Option<u32>) -> u32 {
    page_size.unwrap_or(50).clamp(1, 50)
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

pub(crate) async fn add_black_user_inner(req: AddBlackUserReq, state: &AppState) -> CmdResult {
    if req.fid == 0 {
        return Err("i18n.live.error.invalid_target_uid".into());
    }

    let (_uid, _room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if csrf.trim().is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("fid".into(), req.fid.to_string());
    form.insert("act".into(), "5".to_string());
    form.insert("re_src".into(), "11".to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(&endpoints::api("/x/relation/modify"), &form, &cookie)
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 || code == 22120 {
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
                    "add_black_user code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.add_black_user_failed",
        ))
    }
}

pub(crate) async fn get_black_user_list_inner(
    req: GetBlackUserListReq,
    state: &AppState,
) -> CmdResult {
    let page = normalize_page(req.page);
    let page_size = normalize_page_size(req.page_size);

    let (_uid, _room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let params = [("pn", page.to_string()), ("ps", page_size.to_string())];
    let value = state
        .client
        .get_json_with_cookie(&endpoints::api("/x/relation/blacks"), &params, &cookie)
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
        let total_page = if total == 0 {
            1
        } else {
            total.div_ceil(page_size as u64).max(1)
        };
        let mut items = data["list"].as_array().cloned().unwrap_or_default();

        let mut avatar_targets = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let uid = item["mid"]
                .as_u64()
                .map(|value| value.to_string())
                .or_else(|| {
                    item["mid"]
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
            if uid.is_empty()
                || avatar::load_cached_face_data_url(&state.config_path, uid).is_some()
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
                    crate::runtime_warn!("get_black_user_list resolve avatars failed: {}", error);
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
            "page_size": page_size,
            "total": total,
            "total_page": total_page,
            "items": items,
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "get_black_user_list code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.get_black_user_list_failed",
        ))
    }
}

pub(crate) async fn remove_black_user_inner(
    req: RemoveBlackUserReq,
    state: &AppState,
) -> CmdResult {
    if req.fid == 0 {
        return Err("i18n.live.error.invalid_target_uid".into());
    }

    let (_uid, _room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if csrf.trim().is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("fid".into(), req.fid.to_string());
    form.insert("act".into(), "6".to_string());
    form.insert("re_src".into(), "11".to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(&endpoints::api("/x/relation/modify"), &form, &cookie)
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
                    "remove_black_user code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.remove_black_user_failed",
        ))
    }
}

pub(crate) async fn add_room_admin_inner(req: AddRoomAdminReq, state: &AppState) -> CmdResult {
    if req.uid == 0 {
        return Err("i18n.live.error.invalid_target_uid".into());
    }

    let (_uid, _room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if csrf.trim().is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("admin".into(), req.uid.to_string());
    form.insert("admin_level".into(), "1".to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/web-ucenter/v1/roomAdmin/appoint"),
            &form,
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 || code == 1008021 {
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
                    "add_room_admin code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.add_room_admin_failed",
        ))
    }
}

pub(crate) async fn get_room_admin_list_inner(
    req: GetRoomAdminListReq,
    state: &AppState,
) -> CmdResult {
    let page = normalize_page(req.page);

    let (_uid, _room_id, _csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let params = [("page", page.to_string())];
    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-ucenter/v1/roomAdmin/get_by_anchor"),
            &params,
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
        let page_info = data["page"].clone();
        let resolved_page = page_info["page"].as_u64().unwrap_or(page as u64).max(1);
        let page_size = page_info["page_size"].as_u64().unwrap_or(20).max(1);
        let total = page_info["total_count"].as_u64().unwrap_or(0);
        let total_page = page_info["total_page"].as_u64().unwrap_or(1).max(1);
        let mut items = data["data"].as_array().cloned().unwrap_or_default();

        let mut avatar_targets = Vec::new();
        for (index, item) in items.iter().enumerate() {
            let uid = item["uid"]
                .as_u64()
                .map(|value| value.to_string())
                .or_else(|| {
                    item["uid"]
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
            if uid.is_empty()
                || avatar::load_cached_face_data_url(&state.config_path, uid).is_some()
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
                    crate::runtime_warn!("get_room_admin_list resolve avatars failed: {}", error);
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
            "page": resolved_page,
            "page_size": page_size,
            "total": total,
            "total_page": total_page,
            "items": items,
            "max_room_anchors_number": data["max_room_anchors_number"].as_u64().unwrap_or(0),
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                state,
                &format!(
                    "get_room_admin_list code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.get_room_admin_list_failed",
        ))
    }
}

pub(crate) async fn remove_room_admin_inner(
    req: RemoveRoomAdminReq,
    state: &AppState,
) -> CmdResult {
    if req.uid == 0 {
        return Err("i18n.live.error.invalid_target_uid".into());
    }

    let (_uid, _room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if csrf.trim().is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("uid".into(), req.uid.to_string());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-ucenter/v1/roomAdmin/dismiss"),
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
                    "remove_room_admin code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(
            &value,
            "i18n.live.error.remove_room_admin_failed",
        ))
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
            if uid.is_empty()
                || avatar::load_cached_face_data_url(&state.config_path, uid).is_some()
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
