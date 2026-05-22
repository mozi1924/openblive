use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::{AppHandle, Manager};

use crate::emoticon::parse_live_emoticon_packages;
use crate::endpoints;
use crate::state::AppState;

pub(in crate::ws_server) async fn fetch_text_emoticon_mappings(app: &AppHandle) -> Vec<Value> {
    let app_state = app.state::<AppState>();
    let (room_id, cookie) = {
        let runtime = app_state.runtime.lock().await;
        let Some(uid) = runtime.config.current_uid.clone() else {
            return Vec::new();
        };
        let Some(user) = runtime.config.users.get(&uid) else {
            return Vec::new();
        };

        let room_id = if user.room_id.trim().is_empty() {
            runtime.session.room_id.clone()
        } else {
            user.room_id.clone()
        };
        if room_id.trim().is_empty() || user.cookie.trim().is_empty() {
            return Vec::new();
        }
        (room_id, user.cookie.clone())
    };

    let value = match app_state
        .client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/web-ucenter/v2/emoticon/GetEmoticons"),
            &[("platform", "pc".to_string()), ("room_id", room_id)],
            &cookie,
        )
        .await
    {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Vec::new();
    }

    let packages =
        parse_live_emoticon_packages(&app_state.client, &app_state.config_path, &value).await;
    let mut seen = HashSet::new();
    let mut items = Vec::new();
    for package in packages {
        for emoticon in package.emoticons {
            if emoticon.text.trim().is_empty() || emoticon.url.trim().is_empty() {
                continue;
            }
            let dedup_key = format!("{}\u{1f}{}", emoticon.text, emoticon.url);
            if !seen.insert(dedup_key) {
                continue;
            }
            items.push(json!({
                "keyword": emoticon.text,
                "url": emoticon.url,
            }));
        }
    }
    items
}
