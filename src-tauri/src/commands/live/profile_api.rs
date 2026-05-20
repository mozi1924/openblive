use super::common::{
    build_room_update_form, clear_user_auth_flags, error_message, is_auth_invalid_code,
    live_platform, mark_current_user_login_invalid,
};
use super::profile::{split_tags, title_review_from_audit_status};
use super::session::{current_timestamp, resolve_current_auth_context};
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::models::{
    sync_live_profile_state_defaults, UpdateAreaReq, UpdateTagsReq, UpdateTitleReq,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use tauri::State;

pub(crate) async fn get_partitions(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            &endpoints::live_api("/room/v1/Area/getList"),
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
                    let child_id = child["id"]
                        .as_u64()
                        .or_else(|| {
                            child["id"]
                                .as_str()
                                .and_then(|value| value.parse::<u64>().ok())
                        })
                        .unwrap_or(0);
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

pub(crate) async fn update_area(req: UpdateAreaReq, state: State<'_, AppState>) -> CmdResult {
    let (uid, room_id, csrf, cookie, area_id) = {
        let runtime = state.runtime.lock().await;
        let (uid, room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        let area_id = runtime
            .partition_map
            .get(&req.parent)
            .and_then(|map| map.get(&req.child))
            .copied()
            .ok_or_else(|| "invalid partition".to_string())?;
        (uid, room_id, csrf, cookie, area_id)
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
    let mut form = build_room_update_form(&room_id, &csrf);
    form.insert("area_id".into(), area_id.to_string());
    let value = state
        .client
        .post_form_with_cookie(&endpoints::live_api("/room/v1/Room/update"), &form, &cookie)
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("update_area code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(&value, "i18n.live.error.update_area_failed"));
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        sync_live_profile_state_defaults(user);
        user.last_area_id = area_id.to_string();
        user.last_area_name = vec![req.parent.clone(), req.child.clone()];
        user.live_profile_state.area.submitted_parent = req.parent.clone();
        user.live_profile_state.area.submitted_child = req.child.clone();
        user.live_profile_state.area.submitted_area_id = Some(area_id);
        user.live_profile_state.area.effective_parent = req.parent.clone();
        user.live_profile_state.area.effective_child = req.child.clone();
        user.live_profile_state.area.effective_area_id = Some(area_id);
        user.live_profile_state.area.transport = "synced".to_string();
        user.live_profile_state.area.review = "none".to_string();
        user.live_profile_state.area.message.clear();
        user.live_profile_state.area.updated_at = current_timestamp();
        clear_user_auth_flags(user);
    }
    runtime.session.current_area_id = Some(area_id);
    runtime.session.current_area_names = vec![req.parent.clone(), req.child.clone()];
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({
        "area_id": area_id,
        "profile_state": runtime
            .config
            .users
            .get(&uid)
            .map(|user| user.live_profile_state.clone())
    })))
}

pub(crate) async fn update_title(req: UpdateTitleReq, state: State<'_, AppState>) -> CmdResult {
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
    form.insert("room_id".into(), room_id);
    form.insert("platform".into(), live_platform());
    form.insert("title".into(), req.title.clone());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(&endpoints::live_api("/room/v1/Room/update"), &form, &cookie)
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let audit_info = value["data"]["audit_info"].clone();
        let audit_status = audit_info["audit_title_status"].as_i64();
        let review = title_review_from_audit_status(audit_status);
        let message = audit_info["audit_title_reason"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                sync_live_profile_state_defaults(user);
                user.last_title = req.title.clone();
                user.live_profile_state.title.submitted = req.title.clone();
                user.live_profile_state.title.transport = "synced".to_string();
                user.live_profile_state.title.review = review.to_string();
                user.live_profile_state.title.message = message.clone();
                user.live_profile_state.title.updated_at = current_timestamp();
                if review == "none" {
                    user.live_profile_state.title.effective = req.title.clone();
                }
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({
            "profile_state": runtime
                .config
                .current_uid
                .as_ref()
                .and_then(|uid| runtime.config.users.get(uid))
                .map(|user| user.live_profile_state.clone())
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "update_title code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(&value, "i18n.live.error.update_title_failed"))
    }
}

pub(crate) async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
    let desired_tags = split_tags(&req.tags);
    let (uid, room_id, csrf, current_tags, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;
        (uid, room_id, csrf, user.last_tags.clone(), cookie)
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
            .post_form_with_cookie(&endpoints::live_api("/room/v1/Room/update"), &form, &cookie)
            .await
            .map_err(|error| error.to_string())?;
        let code = value["code"].as_i64().unwrap_or(-1);
        if code != 0 {
            if is_auth_invalid_code(code) {
                mark_current_user_login_invalid(
                    &state,
                    &format!(
                        "update_live_tags(add) tag={tag}, code={code}, msg={}",
                        error_message(&value, "")
                    ),
                )
                .await;
                return Err("i18n.common.login_expired_relogin".into());
            }
            return Err(format!(
                "i18n.live.error.update_tags_add_failed({tag}): {}",
                error_message(&value, "i18n.live.error.update_tags_add_failed")
            ));
        }
    }

    for tag in &to_del {
        let mut form = build_room_update_form(&room_id, &csrf);
        form.insert("del_tag".into(), tag.clone());
        let value = state
            .client
            .post_form_with_cookie(&endpoints::live_api("/room/v1/Room/update"), &form, &cookie)
            .await
            .map_err(|error| error.to_string())?;
        let code = value["code"].as_i64().unwrap_or(-1);
        if code != 0 {
            if is_auth_invalid_code(code) {
                mark_current_user_login_invalid(
                    &state,
                    &format!(
                        "update_live_tags(del) tag={tag}, code={code}, msg={}",
                        error_message(&value, "")
                    ),
                )
                .await;
                return Err("i18n.common.login_expired_relogin".into());
            }
            return Err(format!(
                "i18n.live.error.update_tags_remove_failed({tag}): {}",
                error_message(&value, "i18n.live.error.update_tags_remove_failed")
            ));
        }
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        sync_live_profile_state_defaults(user);
        user.last_tags = desired_tags.clone();
        user.live_profile_state.tags.submitted = desired_tags.clone();
        user.live_profile_state.tags.effective = desired_tags.clone();
        user.live_profile_state.tags.transport = "synced".to_string();
        user.live_profile_state.tags.review = "none".to_string();
        user.live_profile_state.tags.message.clear();
        user.live_profile_state.tags.updated_at = current_timestamp();
        clear_user_auth_flags(user);
    }
    runtime.session.current_tags = desired_tags.clone();
    save_config(&state.config_path, &runtime.config, &state.master_key);

    Ok(wrap_ok(json!({
        "tags": desired_tags,
        "added": to_add,
        "removed": to_del,
        "profile_state": runtime
            .config
            .users
            .get(&uid)
            .map(|user| user.live_profile_state.clone())
    })))
}
