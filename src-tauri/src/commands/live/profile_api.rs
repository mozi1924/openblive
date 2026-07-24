use super::common::{
    build_room_update_form, clear_user_auth_flags, error_message, is_auth_invalid_code,
    live_platform, mark_current_user_login_invalid,
};
use super::profile::{
    cover_review_from_audit_status, normalize_cover_url, split_tags, title_review_from_audit_status,
};
use super::profile_sync::fetch_pre_live_info;
use super::session::{current_timestamp, resolve_current_auth_context};
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::cover_cache::ensure_cover_data_url;
use crate::endpoints;
use crate::models::{
    sync_live_profile_state_defaults, AddLiveTagReq, CreateLiveReserveReq, GetLiveCoverAdviceReq,
    RemoveLiveTagReq, UpdateAreaReq, UpdateLiveCoverReq, UpdateRoomNewsReq, UpdateTagsReq,
    UpdateTitleReq, UploadLiveCoverReq,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use base64::Engine;
use rand::{distributions::Alphanumeric, Rng};
use reqwest::multipart::{Form, Part};
use serde_json::json;
use std::collections::{BTreeMap, HashMap};
use tauri::State;

#[derive(Clone)]
struct LiveTagEntry {
    tag_id: u64,
    tag_content: String,
    audit_status: i64,
}

fn parse_live_tag_entries(value: &serde_json::Value) -> Vec<LiveTagEntry> {
    value["data"]["tags"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tag| {
            let tag_id = tag["tag_id"].as_u64().or_else(|| {
                tag["tag_id"]
                    .as_i64()
                    .and_then(|raw| if raw > 0 { Some(raw as u64) } else { None })
            })?;
            let tag_content = tag["tag_content"].as_str().unwrap_or("").trim().to_string();
            if tag_content.is_empty() {
                return None;
            }
            Some(LiveTagEntry {
                tag_id,
                tag_content,
                audit_status: tag["audit_status"].as_i64().unwrap_or(-1),
            })
        })
        .collect()
}

fn tags_review_from_audit_status(tags: &[LiveTagEntry]) -> &'static str {
    if tags.is_empty() {
        return "none";
    }
    if tags.iter().any(|tag| tag.audit_status == 2) {
        return "rejected";
    }
    if tags.iter().any(|tag| tag.audit_status == 0) {
        return "pending";
    }
    if tags.iter().all(|tag| tag.audit_status == 1) {
        return "approved";
    }
    "unknown"
}

async fn fetch_live_tags_remote(
    state: &AppState,
    cookie: &str,
) -> Result<serde_json::Value, String> {
    state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/liveTagService/GetLiveTags"),
            &[],
            cookie,
        )
        .await
        .map_err(|error| error.to_string())
}

fn build_live_tag_update_form(csrf: &str, key: &str, value: String) -> BTreeMap<String, String> {
    let mut form = BTreeMap::new();
    form.insert(key.into(), value);
    form.insert("csrf".into(), csrf.to_string());
    form.insert("csrf_token".into(), csrf.to_string());
    form
}

fn build_live_cover_update_form(
    csrf: &str,
    cover: &str,
    visit_id: Option<&str>,
) -> BTreeMap<String, String> {
    let mut form = BTreeMap::new();
    form.insert("platform".into(), "web".into());
    form.insert("mobi_app".into(), "web".into());
    form.insert("build".into(), "1".into());
    form.insert("cover".into(), cover.to_string());
    form.insert("coverVertical".into(), String::new());
    form.insert("liveDirectionType".into(), "1".into());
    form.insert("csrf".into(), csrf.to_string());
    form.insert("csrf_token".into(), csrf.to_string());
    if let Some(value) = visit_id.map(str::trim).filter(|value| !value.is_empty()) {
        form.insert("visit_id".into(), value.to_string());
    }
    form
}

fn random_visit_id(length: usize) -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(length)
        .map(char::from)
        .collect::<String>()
        .to_lowercase()
}

fn decode_cover_data_url(
    data_url: &str,
    mime_type_hint: Option<&str>,
) -> Result<(Vec<u8>, String), String> {
    let trimmed = data_url.trim();
    let Some(payload) = trimmed.strip_prefix("data:") else {
        return Err("i18n.live.error.upload_cover_invalid_data".into());
    };
    let Some((meta, encoded)) = payload.split_once(',') else {
        return Err("i18n.live.error.upload_cover_invalid_data".into());
    };
    if !meta.contains(";base64") {
        return Err("i18n.live.error.upload_cover_invalid_data".into());
    }
    let mime = meta
        .split(';')
        .next()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .or_else(|| {
            mime_type_hint
                .map(str::trim)
                .filter(|value| !value.is_empty())
        })
        .unwrap_or("image/jpeg")
        .to_string();

    let clean_encoded: String = encoded
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '\r' && *c != '\n')
        .collect();

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&clean_encoded)
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(&clean_encoded))
        .map_err(|_| "i18n.live.error.upload_cover_invalid_data".to_string())?;

    Ok((bytes, mime))
}

fn normalize_cover_file_name(file_name: Option<&str>, mime_type: &str) -> String {
    let raw = file_name.unwrap_or("").trim();
    let base_name = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("")
        .trim();
    let sanitized: String = base_name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect();

    if !sanitized.is_empty() {
        return sanitized;
    }

    let extension = match mime_type {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    };
    format!("live-cover.{extension}")
}

async fn apply_tag_profile_snapshot(
    state: &AppState,
    uid: &str,
    tags: &[LiveTagEntry],
) -> serde_json::Value {
    let mut runtime = state.runtime.lock().await;
    let tag_contents: Vec<String> = tags.iter().map(|item| item.tag_content.clone()).collect();
    if let Some(user) = runtime.config.users.get_mut(uid) {
        sync_live_profile_state_defaults(user);
        user.last_tags = tag_contents.clone();
        user.live_profile_state.tags.submitted = tag_contents.clone();
        user.live_profile_state.tags.effective = tag_contents.clone();
        user.live_profile_state.tags.transport = "synced".to_string();
        user.live_profile_state.tags.review = tags_review_from_audit_status(tags).to_string();
        user.live_profile_state.tags.message.clear();
        user.live_profile_state.tags.updated_at = current_timestamp();
        clear_user_auth_flags(user);
    }
    runtime.session.current_tags = tag_contents.clone();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    json!({
        "tags": tags.iter().map(|item| json!({
            "tag_id": item.tag_id,
            "tag_content": item.tag_content,
            "audit_status": item.audit_status,
        })).collect::<Vec<_>>(),
        "tag_contents": tag_contents,
        "profile_state": runtime
            .config
            .users
            .get(uid)
            .map(|user| user.live_profile_state.clone())
    })
}

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

pub(crate) async fn get_live_cover_history(state: State<'_, AppState>) -> CmdResult {
    let cookie = {
        let runtime = state.runtime.lock().await;
        let (_uid, _room_id, _csrf, cookie) = resolve_current_auth_context(&runtime)?;
        cookie
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/preLive/GetCoverHistory"),
            &[("platform", "web".to_string()), ("build", "1".to_string())],
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
                    "get_live_cover_history code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &value,
            "i18n.live.error.fetch_cover_history_failed",
        ));
    }

    let mut history = Vec::new();
    for mut item in value["data"]["cover_history"]
        .as_array()
        .cloned()
        .unwrap_or_default()
    {
        if let Some(object) = item.as_object_mut() {
            let cover_url = object
                .get("cover_url")
                .and_then(serde_json::Value::as_str)
                .map(normalize_cover_url)
                .unwrap_or_default();
            let cover_asset_url =
                ensure_cover_data_url(&state.client, &state.config_path, &cover_url)
                    .await
                    .unwrap_or_default();
            object.insert("cover_url".into(), json!(cover_url));
            object.insert("cover_asset_url".into(), json!(cover_asset_url));
        }
        history.push(item);
    }
    Ok(wrap_ok(json!({ "history": history })))
}

pub(crate) async fn get_live_cover_advice(
    req: GetLiveCoverAdviceReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let cookie = {
        let runtime = state.runtime.lock().await;
        let (_uid, _room_id, _csrf, cookie) = resolve_current_auth_context(&runtime)?;
        cookie
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }
    let cover_url = normalize_cover_url(&req.cover_url);
    if cover_url.is_empty() {
        return Ok(wrap_ok(json!(null)));
    }

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/preLive/GetCoverAdviceAndQualityScore"),
            &[
                ("cover_url", cover_url.clone()),
                ("platform", "web".to_string()),
            ],
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
                    "get_live_cover_advice code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &value,
            "i18n.live.error.fetch_cover_advice_failed",
        ));
    }

    let mut advice = value["data"].clone();
    if let Some(object) = advice.as_object_mut() {
        object.insert("cover_url".into(), json!(cover_url));
    }
    Ok(wrap_ok(advice))
}

pub(crate) async fn upload_live_cover(
    req: UploadLiveCoverReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let cookie = {
        let runtime = state.runtime.lock().await;
        let (_uid, _room_id, _csrf, cookie) = resolve_current_auth_context(&runtime)?;
        cookie
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let (bytes, mime_type) = decode_cover_data_url(&req.data_url, req.mime_type.as_deref())?;
    let file_name = normalize_cover_file_name(req.file_name.as_deref(), &mime_type);
    let part = Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(&mime_type)
        .map_err(|error| error.to_string())?;
    let form = Form::new()
        .text("bucket", "live")
        .text("dir", "new_room_cover")
        .part("file", part);

    let csrf = {
        let runtime = state.runtime.lock().await;
        let (_uid, _room_id, csrf, _cookie) = resolve_current_auth_context(&runtime)?;
        csrf
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }

    let value = state
        .client
        .post_multipart_with_cookie(
            &format!("{}?csrf={}", endpoints::api("/x/upload/web/image"), csrf),
            form,
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
                    "upload_live_cover code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(&value, "i18n.live.error.upload_cover_failed"));
    }

    Ok(wrap_ok(json!({
        "location": normalize_cover_url(value["data"]["location"].as_str().unwrap_or("")),
        "etag": value["data"]["etag"].as_str().unwrap_or(""),
    })))
}

pub(crate) async fn update_live_cover(
    req: UpdateLiveCoverReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let cover = normalize_cover_url(&req.cover);
    if cover.is_empty() {
        return Err("i18n.live.error.update_cover_failed".into());
    }

    let (uid, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (uid, csrf, cookie)
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let form = build_live_cover_update_form(&csrf, &cover, req.visit_id.as_deref());
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
                &state,
                &format!(
                    "update_live_cover code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(&value, "i18n.live.error.update_cover_failed"));
    }

    let remote_cover = fetch_pre_live_info(&state, &cookie)
        .await
        .ok()
        .and_then(|data| data["cover"]["url"].as_str().map(|value| value.to_string()))
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| cover.clone());
    let review = fetch_pre_live_info(&state, &cookie)
        .await
        .ok()
        .map(|data| {
            (
                cover_review_from_audit_status(
                    data["cover"]["auditStatus"].as_i64(),
                    !remote_cover.trim().is_empty(),
                )
                .to_string(),
                data["cover"]["auditReason"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
            )
        })
        .unwrap_or_else(|| ("unknown".to_string(), String::new()));
    let remote_cover_asset =
        ensure_cover_data_url(&state.client, &state.config_path, &remote_cover)
            .await
            .unwrap_or_default();

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        sync_live_profile_state_defaults(user);
        user.last_cover = remote_cover.clone();
        user.last_cover_asset = remote_cover_asset.clone();
        user.live_profile_state.cover.submitted = cover.clone();
        user.live_profile_state.cover.effective = remote_cover.clone();
        user.live_profile_state.cover.transport = "synced".to_string();
        user.live_profile_state.cover.review = review.0;
        user.live_profile_state.cover.message = review.1;
        user.live_profile_state.cover.updated_at = current_timestamp();
        clear_user_auth_flags(user);
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);

    Ok(wrap_ok(json!({
        "cover": remote_cover,
        "cover_asset_url": remote_cover_asset,
        "profile_state": runtime
            .config
            .users
            .get(&uid)
            .map(|user| user.live_profile_state.clone())
    })))
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

pub(crate) async fn update_room_news(
    req: UpdateRoomNewsReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let content = req.content.trim().to_string();
    if content.chars().count() > 60 {
        return Err("i18n.live.error.update_room_news_too_long".into());
    }

    let (uid, room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };

    let room_id_num = room_id
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| "i18n.live.error.room_id_missing".to_string())?;
    let uid_num = uid
        .trim()
        .parse::<u64>()
        .ok()
        .filter(|value| *value > 0)
        .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;

    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id_num.to_string());
    form.insert("uid".into(), uid_num.to_string());
    form.insert("content".into(), content.clone());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/index/updateRoomNews"),
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
                    "update_room_news code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &value,
            "i18n.live.error.update_room_news_failed",
        ));
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        user.last_room_news = content.clone();
        clear_user_auth_flags(user);
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);

    Ok(wrap_ok(json!({
        "content": content,
    })))
}

pub(crate) async fn create_live_reserve(
    req: CreateLiveReserveReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let title = req.title.trim().to_string();
    if title.is_empty() {
        return Err("i18n.live.error.create_live_reserve_invalid_title".into());
    }
    if req.live_plan_start_time <= current_timestamp() {
        return Err("i18n.live.error.create_live_reserve_invalid_time".into());
    }

    let (_uid, _room_id, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        resolve_current_auth_context(&runtime)?
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let create_dynamic = req.create_dynamic.unwrap_or(false);
    let mut form = BTreeMap::new();
    form.insert("title".into(), title.clone());
    form.insert("type".into(), "2".into());
    form.insert("from".into(), "23".into());
    form.insert(
        "create_dynamic".into(),
        if create_dynamic { "1" } else { "0" }.to_string(),
    );
    form.insert(
        "live_plan_start_time".into(),
        req.live_plan_start_time.to_string(),
    );
    form.insert("business_type".into(), "10".into());
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    form.insert("visit_id".into(), random_visit_id(16));

    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-ucenter/v2/schedule/CreateReserve"),
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
                    "create_live_reserve code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &value,
            "i18n.live.error.create_live_reserve_failed",
        ));
    }

    Ok(wrap_ok(json!({
        "sid": value["data"]["sid"].as_i64().unwrap_or_default(),
        "title": title,
        "live_plan_start_time": req.live_plan_start_time,
        "create_dynamic": create_dynamic,
    })))
}

pub(crate) async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
    let desired_tags = split_tags(&req.tags);
    let (uid, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (uid, csrf, cookie)
    };

    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let current_value = fetch_live_tags_remote(&state, &cookie).await?;
    let current_code = current_value["code"].as_i64().unwrap_or(-1);
    if current_code != 0 {
        if is_auth_invalid_code(current_code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "update_live_tags(fetch) code={current_code}, msg={}",
                    error_message(&current_value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &current_value,
            "i18n.live.error.update_tags_remove_failed",
        ));
    }
    let current_tags = parse_live_tag_entries(&current_value);

    let to_add: Vec<String> = desired_tags
        .iter()
        .filter(|tag| !current_tags.iter().any(|old| old.tag_content == **tag))
        .cloned()
        .collect();
    let to_del: Vec<LiveTagEntry> = current_tags
        .iter()
        .filter(|tag| !desired_tags.iter().any(|new| new == &tag.tag_content))
        .cloned()
        .collect();

    for tag in &to_add {
        let form = build_live_tag_update_form(&csrf, "tag_content", tag.clone());
        let value = state
            .client
            .post_form_with_cookie(
                &endpoints::live_api("/xlive/app-blink/v1/liveTagService/AddLiveTag"),
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
        let form = build_live_tag_update_form(&csrf, "tag_id", tag.tag_id.to_string());
        let value = state
            .client
            .post_form_with_cookie(
                &endpoints::live_api("/xlive/app-blink/v1/liveTagService/DeleteLiveTag"),
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
                        error_message(&value, ""),
                        tag = tag.tag_content
                    ),
                )
                .await;
                return Err("i18n.common.login_expired_relogin".into());
            }
            return Err(format!(
                "i18n.live.error.update_tags_remove_failed({tag}): {}",
                error_message(&value, "i18n.live.error.update_tags_remove_failed"),
                tag = tag.tag_content
            ));
        }
    }

    let final_value = fetch_live_tags_remote(&state, &cookie).await?;
    let final_code = final_value["code"].as_i64().unwrap_or(-1);
    if final_code != 0 {
        if is_auth_invalid_code(final_code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "update_live_tags(refetch) code={final_code}, msg={}",
                    error_message(&final_value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &final_value,
            "i18n.live.error.update_tags_remove_failed",
        ));
    }
    let final_tags = parse_live_tag_entries(&final_value);
    let snapshot = apply_tag_profile_snapshot(&state, &uid, &final_tags).await;

    Ok(wrap_ok(json!({
        "tags": snapshot["tag_contents"],
        "tag_items": snapshot["tags"],
        "added": to_add,
        "removed": to_del.iter().map(|tag| tag.tag_content.clone()).collect::<Vec<_>>(),
        "profile_state": snapshot["profile_state"]
    })))
}

pub(crate) async fn get_live_tags(state: State<'_, AppState>) -> CmdResult {
    let (uid, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, _csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (uid, cookie)
    };
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }
    let value = fetch_live_tags_remote(&state, &cookie).await?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "get_live_tags code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(error_message(
            &value,
            "i18n.live.error.update_tags_remove_failed",
        ));
    }
    let tags = parse_live_tag_entries(&value);
    Ok(wrap_ok(
        apply_tag_profile_snapshot(&state, &uid, &tags).await,
    ))
}

pub(crate) async fn add_live_tag(req: AddLiveTagReq, state: State<'_, AppState>) -> CmdResult {
    let tag = req.tag.trim().to_string();
    if tag.is_empty() {
        return Err("i18n.live.error.update_tags_add_failed".into());
    }

    let (uid, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (uid, csrf, cookie)
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let form = build_live_tag_update_form(&csrf, "tag_content", tag.clone());
    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/liveTagService/AddLiveTag"),
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
                    "add_live_tag tag={tag}, code={code}, msg={}",
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

    let final_value = fetch_live_tags_remote(&state, &cookie).await?;
    let final_code = final_value["code"].as_i64().unwrap_or(-1);
    if final_code != 0 {
        return Err(error_message(
            &final_value,
            "i18n.live.error.update_tags_add_failed",
        ));
    }
    let final_tags = parse_live_tag_entries(&final_value);
    let snapshot = apply_tag_profile_snapshot(&state, &uid, &final_tags).await;

    Ok(wrap_ok(json!({
        "added": tag,
        "tags": snapshot["tag_contents"],
        "tag_items": snapshot["tags"],
        "profile_state": snapshot["profile_state"]
    })))
}

pub(crate) async fn remove_live_tag(
    req: RemoveLiveTagReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let target_tag = req.tag.trim().to_string();
    if target_tag.is_empty() {
        return Err("i18n.live.error.update_tags_remove_failed".into());
    }

    let (uid, csrf, cookie) = {
        let runtime = state.runtime.lock().await;
        let (uid, _room_id, csrf, cookie) = resolve_current_auth_context(&runtime)?;
        (uid, csrf, cookie)
    };
    if csrf.is_empty() {
        return Err("i18n.live.error.csrf_missing".into());
    }
    if cookie.trim().is_empty() {
        return Err("i18n.account.error.local_credential_empty".into());
    }

    let current_value = fetch_live_tags_remote(&state, &cookie).await?;
    let current_code = current_value["code"].as_i64().unwrap_or(-1);
    if current_code != 0 {
        return Err(error_message(
            &current_value,
            "i18n.live.error.update_tags_remove_failed",
        ));
    }
    let current_tags = parse_live_tag_entries(&current_value);
    let target = current_tags
        .iter()
        .find(|tag| tag.tag_content == target_tag)
        .ok_or_else(|| "i18n.live.error.update_tags_remove_failed".to_string())?;

    let form = build_live_tag_update_form(&csrf, "tag_id", target.tag_id.to_string());
    let value = state
        .client
        .post_form_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/liveTagService/DeleteLiveTag"),
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
                    "remove_live_tag tag={target_tag}, code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("i18n.common.login_expired_relogin".into());
        }
        return Err(format!(
            "i18n.live.error.update_tags_remove_failed({target_tag}): {}",
            error_message(&value, "i18n.live.error.update_tags_remove_failed")
        ));
    }

    let final_value = fetch_live_tags_remote(&state, &cookie).await?;
    let final_code = final_value["code"].as_i64().unwrap_or(-1);
    if final_code != 0 {
        return Err(error_message(
            &final_value,
            "i18n.live.error.update_tags_remove_failed",
        ));
    }
    let final_tags = parse_live_tag_entries(&final_value);
    let snapshot = apply_tag_profile_snapshot(&state, &uid, &final_tags).await;

    Ok(wrap_ok(json!({
        "removed": target_tag,
        "tags": snapshot["tag_contents"],
        "tag_items": snapshot["tags"],
        "profile_state": snapshot["profile_state"]
    })))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_cover_file_name_sanitizes_windows_paths() {
        assert_eq!(
            normalize_cover_file_name(Some("C:\\Users\\Admin\\Pictures\\my_cover.png"), "image/png"),
            "my_cover.png"
        );
        assert_eq!(
            normalize_cover_file_name(Some("/home/user/my-cover.jpg"), "image/jpeg"),
            "my-cover.jpg"
        );
        assert_eq!(
            normalize_cover_file_name(Some("invalid\\name/test?.png"), "image/png"),
            "test.png"
        );
        assert_eq!(
            normalize_cover_file_name(None, "image/png"),
            "live-cover.png"
        );
    }

    #[test]
    fn test_decode_cover_data_url_handles_newlines_and_spaces() {
        let raw_data = "data:image/jpeg;base64, aGVsbG8 = \r\n";
        let (bytes, mime) = decode_cover_data_url(raw_data, None).unwrap();
        assert_eq!(bytes, b"hello");
        assert_eq!(mime, "image/jpeg");
    }
}
