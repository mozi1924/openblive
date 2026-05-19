use crate::bili::{app_sign, get_danmu_info, wbi_signed};
use crate::config::save_config;
use crate::constants::{CmdResult, DEFAULT_LIVEHIME_BUILD, DEFAULT_LIVEHIME_VERSION};
use crate::danmu::decode_and_emit;
use crate::emoticon::parse_live_emoticon_packages;
use crate::models::{
    sync_live_profile_state_defaults, DanmuReq, UpdateAreaReq, UpdateTagsReq, UpdateTitleReq,
    UserRecord,
};
use crate::response::wrap_ok;
use crate::state::{AppState, RuntimeState};
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use tauri::{AppHandle, State};
use tokio_tungstenite::tungstenite::Message;

mod common;
mod linkage;
mod stream;
use common::{
    build_room_update_form, clear_user_auth_flags, error_message, is_auth_invalid_code,
    live_platform_pc_link, mark_current_user_login_invalid,
};
pub(crate) use linkage::obs_ws_probe;
use linkage::{
    apply_command_template, build_command_template_context, empty_command_template_context,
    normalize_live_control_mode, obs_ws_start_stream, obs_ws_stop_stream, spawn_shell_command,
};
use stream::{collect_stream_endpoints, select_primary_endpoint};

const LIVE_CLIENT_VERSION_TTL_SECS: i64 = 6 * 60 * 60;

fn split_tags(raw: &str) -> Vec<String> {
    raw.split([',', '，'])
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(|tag| tag.to_string())
        .collect()
}

fn current_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn title_review_from_audit_status(status: Option<i64>) -> &'static str {
    match status {
        Some(2) => "pending",
        Some(0) => "none",
        Some(_) => "unknown",
        None => "none",
    }
}

fn same_tags(left: &[String], right: &[String]) -> bool {
    left == right
}

fn apply_profile_state_from_remote(
    user: &mut UserRecord,
    title: &str,
    parent: &str,
    child: &str,
    area_id: Option<u64>,
    tags: &[String],
) {
    sync_live_profile_state_defaults(user);
    let now = current_timestamp();
    let title_matches_submitted = user.live_profile_state.title.submitted == title;

    if user.live_profile_state.title.submitted.is_empty() {
        user.live_profile_state.title.submitted = title.to_string();
        user.last_title = title.to_string();
    }
    user.live_profile_state.title.effective = title.to_string();
    if title_matches_submitted {
        user.live_profile_state.title.transport = "synced".to_string();
        if matches!(
            user.live_profile_state.title.review.as_str(),
            "pending" | "unknown"
        ) {
            user.live_profile_state.title.review = "none".to_string();
        }
        user.live_profile_state.title.message.clear();
    } else if user.live_profile_state.title.review != "pending" {
        user.live_profile_state.title.transport = "conflict".to_string();
        user.live_profile_state.title.message = "i18n.live.profile.title_conflict".to_string();
    }
    user.live_profile_state.title.updated_at = now;

    if user.live_profile_state.area.submitted_parent.is_empty()
        && user.live_profile_state.area.submitted_child.is_empty()
    {
        user.live_profile_state.area.submitted_parent = parent.to_string();
        user.live_profile_state.area.submitted_child = child.to_string();
        user.live_profile_state.area.submitted_area_id = area_id;
        if !parent.is_empty() && !child.is_empty() {
            user.last_area_name = vec![parent.to_string(), child.to_string()];
        }
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    user.live_profile_state.area.effective_parent = parent.to_string();
    user.live_profile_state.area.effective_child = child.to_string();
    user.live_profile_state.area.effective_area_id = area_id;
    if user.live_profile_state.area.submitted_area_id == Some(0)
        && user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
    {
        user.live_profile_state.area.submitted_area_id = area_id;
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    if user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
        && user.live_profile_state.area.submitted_area_id == area_id
    {
        user.live_profile_state.area.transport = "synced".to_string();
        if user.live_profile_state.area.message == "i18n.live.profile.area_conflict" {
            user.live_profile_state.area.message.clear();
        }
    } else {
        user.live_profile_state.area.transport = "conflict".to_string();
        user.live_profile_state.area.message = "i18n.live.profile.area_conflict".to_string();
    }
    user.live_profile_state.area.updated_at = now;

    if user.live_profile_state.tags.submitted.is_empty() && !tags.is_empty() {
        user.live_profile_state.tags.submitted = tags.to_vec();
        user.last_tags = tags.to_vec();
    }
    user.live_profile_state.tags.effective = tags.to_vec();
    if same_tags(&user.live_profile_state.tags.submitted, tags) {
        user.live_profile_state.tags.transport = "synced".to_string();
        if user.live_profile_state.tags.message == "i18n.live.profile.tags_conflict" {
            user.live_profile_state.tags.message.clear();
        }
    } else {
        user.live_profile_state.tags.transport = "conflict".to_string();
        user.live_profile_state.tags.message = "i18n.live.profile.tags_conflict".to_string();
    }
    user.live_profile_state.tags.updated_at = now;
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

fn room_live_state(status: i64) -> bool {
    status == 1
}

fn apply_room_status_to_session(
    session: &mut crate::models::SessionState,
    room_info: &serde_json::Value,
) {
    let live_status = room_info["live_status"].as_i64().unwrap_or(0);
    session.live_status = Some(live_status);
    session.is_live = room_live_state(live_status);
    session.live_time = room_info["live_time"].as_str().unwrap_or("").to_string();

    if let Some(room_id) = room_info["room_id"].as_i64() {
        session.room_id = room_id.to_string();
    }
}

fn apply_room_area_to_session(
    session: &mut crate::models::SessionState,
    room_info: &serde_json::Value,
) {
    let parent = room_info["parent_area_name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let child = room_info["area_name"].as_str().unwrap_or("").to_string();
    if !parent.is_empty() && !child.is_empty() {
        session.current_area_names = vec![parent, child];
    }
    if let Some(area_id) = room_info["area_id"].as_u64() {
        session.current_area_id = Some(area_id);
    }
}

fn resolve_current_auth_context(
    runtime: &RuntimeState,
) -> Result<(String, String, String, String), String> {
    let uid = runtime
        .config
        .current_uid
        .clone()
        .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;
    let user = runtime
        .config
        .users
        .get(&uid)
        .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;

    let room_id = if user.room_id.trim().is_empty() {
        runtime.session.room_id.clone()
    } else {
        user.room_id.clone()
    };
    let csrf = if user.csrf.trim().is_empty() {
        runtime.session.csrf.clone()
    } else {
        user.csrf.clone()
    };
    Ok((uid, room_id, csrf, user.cookie.clone()))
}

async fn fetch_room_info_by_room_id(
    state: &AppState,
    room_id: &str,
    cookie_header: Option<&str>,
) -> Result<serde_json::Value, String> {
    let cookie = cookie_header.unwrap_or("");

    let value = state
        .client
        .get_json_with_cookie(
            "https://api.live.bilibili.com/room/v1/Room/get_info",
            &[("room_id", room_id.to_string())],
            cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(error_message(&value, "i18n.live.error.sync_status_failed"));
    }
    Ok(value["data"].clone())
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
            .unwrap_or("i18n.live.error.fetch_live_version_failed")
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

#[tauri::command]
pub async fn sync_live_status(state: State<'_, AppState>) -> CmdResult {
    let (uid, room_id, cookie, fallback_session) = {
        let runtime = state.runtime.lock().await;
        let fallback = runtime.session.clone();
        let Some(uid) = runtime.config.current_uid.clone() else {
            return Ok(wrap_ok(serde_json::to_value(fallback).unwrap()));
        };
        let Some(user) = runtime.config.users.get(&uid) else {
            return Ok(wrap_ok(serde_json::to_value(fallback).unwrap()));
        };
        let room_id = if user.room_id.trim().is_empty() {
            runtime.session.room_id.clone()
        } else {
            user.room_id.clone()
        };
        (uid, room_id, user.cookie.clone(), fallback)
    };

    if room_id.trim().is_empty() {
        return Ok(wrap_ok(serde_json::to_value(fallback_session).unwrap()));
    }

    let room_info = match fetch_room_info_by_room_id(&state, &room_id, Some(&cookie)).await {
        Ok(data) => data,
        Err(_) => return Ok(wrap_ok(serde_json::to_value(fallback_session).unwrap())),
    };

    let mut runtime = state.runtime.lock().await;
    apply_room_status_to_session(&mut runtime.session, &room_info);
    if let Some(room_id_long) = room_info["room_id"].as_i64() {
        let room_id_text = room_id_long.to_string();
        runtime.session.room_id = room_id_text.clone();
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            user.room_id = room_id_text;
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
    }

    Ok(wrap_ok(
        serde_json::to_value(runtime.session.clone()).unwrap(),
    ))
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
            .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .cloned()
            .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;
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
            "profile_state": user.live_profile_state,
            "from_cache": true
        })));
    }

    let result = fetch_room_info_by_room_id(&state, &user.room_id, Some(&user.cookie)).await;

    match result {
        Ok(data) => {
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
                apply_profile_state_from_remote(current, &title, &parent, &child, area_id, &tags);
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
            apply_room_status_to_session(&mut runtime.session, &data);
            apply_room_area_to_session(&mut runtime.session, &data);
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
                "profile_state": runtime
                    .config
                    .users
                    .get(&uid)
                    .map(|user| user.live_profile_state.clone()),
                "from_cache": false
            })))
        }
        Err(_) => {
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
                "profile_state": user.live_profile_state,
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

#[tauri::command]
pub async fn update_area(req: UpdateAreaReq, state: State<'_, AppState>) -> CmdResult {
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
        .post_form_with_cookie(
            "https://api.live.bilibili.com/room/v1/Room/update",
            &form,
            &cookie,
        )
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

#[tauri::command]
pub async fn update_title(req: UpdateTitleReq, state: State<'_, AppState>) -> CmdResult {
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
    form.insert("platform".into(), live_platform_pc_link().into());
    form.insert("title".into(), req.title.clone());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            "https://api.live.bilibili.com/room/v1/Room/update",
            &form,
            &cookie,
        )
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

#[tauri::command]
pub async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
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
            .post_form_with_cookie(
                "https://api.live.bilibili.com/room/v1/Room/update",
                &form,
                &cookie,
            )
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
            .post_form_with_cookie(
                "https://api.live.bilibili.com/room/v1/Room/update",
                &form,
                &cookie,
            )
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

#[tauri::command]
pub async fn start_live(state: State<'_, AppState>) -> CmdResult {
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
    form.insert("platform".into(), live_platform_pc_link().into());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.clone());
    form.insert("csrf".into(), csrf);
    inject_live_client_identity(&state, &mut form, false).await;
    form.insert("ts".into(), now);
    let form = app_sign(&form);

    let response = state
        .client
        .post_form_with_cookie(
            "https://api.live.bilibili.com/room/v1/Room/startLive",
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
            "https://www.bilibili.com/blackboard/live/face-auth-middle.html?source_event=400&mid={uid}"
        );
        return Ok(json!({ "code": 60043, "msg": "i18n.live.face_auth_required", "qr": qr }));
    }
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
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
        rollback_form.insert("platform".into(), live_platform_pc_link().into());
        rollback_form.insert("csrf".into(), csrf_for_rollback.clone());
        rollback_form.insert("csrf_token".into(), csrf_for_rollback);
        let _ = state
            .client
            .post_form_with_cookie(
                "https://api.live.bilibili.com/room/v1/Room/stopLive",
                &rollback_form,
                &cookie,
            )
            .await;
        return Err(format!(
            "i18n.live.error.start_linkage_failed_with_rollback:{link_error}"
        ));
    }

    let mut runtime = state.runtime.lock().await;
    runtime.session.is_live = true;
    if let Some(uid) = runtime.config.current_uid.clone() {
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            clear_user_auth_flags(user);
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

#[tauri::command]
pub async fn stop_live(state: State<'_, AppState>) -> CmdResult {
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
    form.insert("platform".into(), live_platform_pc_link().into());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            "https://api.live.bilibili.com/room/v1/Room/stopLive",
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
                let command = apply_command_template(&stop_command_template, &empty_context);
                spawn_shell_command(&command).await
            }
            _ => Ok(()),
        };
        if let Err(error) = linkage_result {
            eprintln!("[live][stop] linkage failed: {error}");
        }

        let mut runtime = state.runtime.lock().await;
        runtime.session.is_live = false;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                clear_user_auth_flags(user);
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({})))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("stop_live code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        Err(error_message(&value, "i18n.live.error.stop_live_failed"))
    }
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
            &format!("https://api.live.bilibili.com/msg/send?{query}"),
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
            "https://api.live.bilibili.com/xlive/web-ucenter/v2/emoticon/GetEmoticons",
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
pub async fn start_danmu_monitor(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if runtime.danmu_task.is_some() {
        return Ok(wrap_ok(
            json!({ "msg": "i18n.live.danmu_monitor_already_running" }),
        ));
    }

    let room_id = runtime.session.room_id.clone();
    let uid = runtime.session.uid;
    if room_id.is_empty() {
        return Err("i18n.common.not_logged_in".into());
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

    Ok(wrap_ok(json!({ "msg": "i18n.live.danmu_monitor_started" })))
}

#[tauri::command]
pub async fn stop_danmu_monitor(state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    Ok(wrap_ok(json!({ "msg": "i18n.live.danmu_monitor_stopped" })))
}
