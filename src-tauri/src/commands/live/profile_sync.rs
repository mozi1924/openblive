use super::common::error_message;
use super::profile::{
    apply_profile_state_from_remote, cover_review_from_audit_status, normalize_cover_url,
    split_tags,
};
use super::session::{
    apply_room_area_to_session, apply_room_status_to_session, mark_session_sync_state,
};
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::cover_cache::{ensure_cover_data_url, load_cached_cover_data_url};
use crate::endpoints;
use crate::models::SessionState;
use crate::response::wrap_ok;
use crate::state::AppState;
use serde_json::json;
use tauri::State;

pub(crate) async fn fetch_room_info_by_room_id(
    state: &AppState,
    room_id: &str,
    cookie_header: Option<&str>,
) -> Result<serde_json::Value, String> {
    let cookie = cookie_header.unwrap_or("");

    let value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/room/v1/Room/get_info"),
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

pub(crate) async fn fetch_pre_live_info(
    state: &AppState,
    cookie_header: &str,
) -> Result<serde_json::Value, String> {
    let mut value = state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/app-blink/v1/preLive/PreLive"),
            &[
                ("cover", "true".to_string()),
                ("platform", "web".to_string()),
                ("mobi_app", "web".to_string()),
                ("build", "1".to_string()),
            ],
            cookie_header,
        )
        .await
        .map_err(|error| error.to_string())?;
    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(error_message(
            &value,
            "i18n.live.error.fetch_live_cover_failed",
        ));
    }
    if let Some(object) = value["data"]["cover"].as_object_mut() {
        let cover_url = object
            .get("url")
            .and_then(serde_json::Value::as_str)
            .map(normalize_cover_url)
            .unwrap_or_default();
        object.insert("url".into(), json!(cover_url));
    }
    Ok(value["data"].clone())
}

pub(crate) async fn sync_live_status_runtime(state: &AppState) -> SessionState {
    let (uid, room_id, cookie) = {
        let mut runtime = state.runtime.lock().await;
        let Some(uid) = runtime.config.current_uid.clone() else {
            mark_session_sync_state(&mut runtime.session, true, Some("NO_ACTIVE_USER"));
            return runtime.session.clone();
        };
        let Some(user) = runtime.config.users.get(&uid) else {
            mark_session_sync_state(&mut runtime.session, true, Some("ACTIVE_USER_MISSING"));
            return runtime.session.clone();
        };
        let room_id = if user.room_id.trim().is_empty() {
            runtime.session.room_id.clone()
        } else {
            user.room_id.clone()
        };
        (uid, room_id, user.cookie.clone())
    };

    if room_id.trim().is_empty() {
        let mut runtime = state.runtime.lock().await;
        mark_session_sync_state(&mut runtime.session, true, Some("ROOM_ID_MISSING"));
        return runtime.session.clone();
    }

    let room_info = match fetch_room_info_by_room_id(state, &room_id, Some(&cookie)).await {
        Ok(data) => data,
        Err(_) => {
            let mut runtime = state.runtime.lock().await;
            mark_session_sync_state(&mut runtime.session, true, Some("FETCH_ROOM_INFO_FAILED"));
            return runtime.session.clone();
        }
    };

    let mut runtime = state.runtime.lock().await;
    apply_room_status_to_session(&mut runtime.session, &room_info);
    mark_session_sync_state(&mut runtime.session, false, None);
    let mut need_save = false;
    if !runtime.session.is_live {
        if let Some(uid_key) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid_key) {
                if user.live_key.is_some() || user.sub_session_key.is_some() {
                    user.live_key = None;
                    user.sub_session_key = None;
                    need_save = true;
                }
            }
        }
    }
    if let Some(room_id_long) = room_info["room_id"].as_i64() {
        let room_id_text = room_id_long.to_string();
        if runtime.session.room_id != room_id_text {
            runtime.session.room_id = room_id_text.clone();
            need_save = true;
        }
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            if user.room_id != room_id_text {
                user.room_id = room_id_text;
                need_save = true;
            }
        }
    }
    if need_save {
        save_config(&state.config_path, &runtime.config, &state.master_key);
    }

    runtime.session.clone()
}

pub async fn sync_live_status(state: State<'_, AppState>) -> CmdResult {
    let session = sync_live_status_runtime(&state).await;
    Ok(wrap_ok(serde_json::to_value(session).unwrap()))
}

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
        let cover = normalize_cover_url(&user.last_cover);
        let cover_asset_url = if !user.last_cover_asset.trim().is_empty() {
            user.last_cover_asset.clone()
        } else {
            load_cached_cover_data_url(&state.config_path, &cover).unwrap_or_default()
        };
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
            "cover": cover,
            "cover_asset_url": cover_asset_url,
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
            let pre_live = fetch_pre_live_info(&state, &user.cookie).await.ok();
            let remote_cover = pre_live
                .as_ref()
                .and_then(|value| value["cover"]["url"].as_str())
                .unwrap_or(&user.last_cover)
                .to_string();
            let remote_cover_asset = ensure_cover_data_url(&state.client, &state.config_path, &remote_cover)
                .await
                .unwrap_or_default();
            let cover_review = cover_review_from_audit_status(
                pre_live
                    .as_ref()
                    .and_then(|value| value["cover"]["auditStatus"].as_i64()),
                !remote_cover.trim().is_empty(),
            )
            .to_string();
            let cover_message = pre_live
                .as_ref()
                .and_then(|value| value["cover"]["auditReason"].as_str())
                .unwrap_or("")
                .to_string();

            let mut runtime = state.runtime.lock().await;
            if let Some(current) = runtime.config.users.get_mut(&uid) {
                apply_profile_state_from_remote(
                    current,
                    &title,
                    &parent,
                    &child,
                    area_id,
                    &tags,
                    &remote_cover,
                    &cover_review,
                    &cover_message,
                );
                if !room_id.is_empty() {
                    current.room_id = room_id.clone();
                }
                current.last_cover_asset = remote_cover_asset.clone();
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
            if !runtime.session.is_live {
                if let Some(current) = runtime.config.users.get_mut(&uid) {
                    current.live_key = None;
                    current.sub_session_key = None;
                }
            }
            save_config(&state.config_path, &runtime.config, &state.master_key);

            Ok(wrap_ok(json!({
                "title": title,
                "parent": parent,
                "child": child,
                "area_id": area_id,
                "tags": tags,
                "cover": normalize_cover_url(&remote_cover),
                "cover_asset_url": remote_cover_asset,
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
                "cover": normalize_cover_url(&user.last_cover),
                "cover_asset_url": if !user.last_cover_asset.trim().is_empty() {
                    user.last_cover_asset.clone()
                } else {
                    load_cached_cover_data_url(&state.config_path, &user.last_cover).unwrap_or_default()
                },
                "profile_state": user.live_profile_state,
                "from_cache": true
            })))
        }
    }
}
