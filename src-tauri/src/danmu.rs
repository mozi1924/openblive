use crate::{avatar, emoticon, state::AppState};
use bytes::Buf;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::Read,
    sync::{Mutex, OnceLock},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

mod helpers;
mod interact_word;
mod parser_helpers;
mod parsers;

use helpers::normalize_asset_url;
use parsers::{build_parse_failed_system_message, is_supported_cmd, parse_danmu_message};

static AVATAR_CACHE_PENDING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static AVATAR_BATCH_QUEUE: OnceLock<Mutex<HashMap<String, Option<String>>>> = OnceLock::new();
static AVATAR_BATCH_FLUSH_SCHEDULED: OnceLock<Mutex<bool>> = OnceLock::new();
static EMOTICON_CACHE_PENDING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static FILTER_CONFIG_CACHE: OnceLock<Mutex<crate::models::PersistConfig>> = OnceLock::new();

fn filter_config_cache() -> &'static Mutex<crate::models::PersistConfig> {
    FILTER_CONFIG_CACHE.get_or_init(|| Mutex::new(crate::models::PersistConfig::default()))
}
const DANMU_AVATAR_RESOLVED_EVENT: &str = "danmu-avatar-resolved";
const AVATAR_BATCH_MAX_SIZE: usize = 50;
const AVATAR_BATCH_WINDOW_MS: u64 = 80;

fn avatar_cache_pending() -> &'static Mutex<HashSet<String>> {
    AVATAR_CACHE_PENDING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn avatar_batch_queue() -> &'static Mutex<HashMap<String, Option<String>>> {
    AVATAR_BATCH_QUEUE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn avatar_batch_flush_scheduled() -> &'static Mutex<bool> {
    AVATAR_BATCH_FLUSH_SCHEDULED.get_or_init(|| Mutex::new(false))
}

fn emoticon_cache_pending() -> &'static Mutex<HashSet<String>> {
    EMOTICON_CACHE_PENDING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn emit_avatar_resolved(app: &AppHandle, uid: &str, sender_face: &str) {
    let _ = app.emit(
        DANMU_AVATAR_RESOLVED_EVENT,
        json!({
            "uid": uid,
            "sender_face": sender_face,
        }),
    );
}

fn clear_avatar_pending(uid: &str) {
    let pending = avatar_cache_pending();
    let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
    pending_guard.remove(uid);
}

fn flush_avatar_batch_now(app: &AppHandle) {
    let drained = {
        let queue = avatar_batch_queue();
        let mut queue_guard = queue.lock().unwrap_or_else(|poison| poison.into_inner());
        let drained = std::mem::take(&mut *queue_guard);
        let scheduled = avatar_batch_flush_scheduled();
        let mut scheduled_guard = scheduled
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        *scheduled_guard = false;
        drained
    };

    if drained.is_empty() {
        return;
    }

    let app_handle = app.clone();
    let state = app.state::<AppState>();
    let client = state.client.clone();
    let config_path = state.config_path.clone();
    tauri::async_runtime::spawn(async move {
        let result =
            avatar::resolve_and_cache_face_data_urls(&client, &config_path, &drained).await;
        match result {
            Ok(resolved) => {
                for (uid, sender_face) in resolved {
                    emit_avatar_resolved(&app_handle, &uid, &sender_face);
                }
            }
            Err(error) => {
                crate::runtime_log!("[danmu] refresh avatar batch failed: {}", error);
            }
        }

        for uid in drained.keys() {
            clear_avatar_pending(uid);
        }
    });
}

fn schedule_avatar_batch_flush(app: &AppHandle) {
    let should_schedule = {
        let scheduled = avatar_batch_flush_scheduled();
        let mut scheduled_guard = scheduled
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        if *scheduled_guard {
            false
        } else {
            *scheduled_guard = true;
            true
        }
    };
    if !should_schedule {
        return;
    }

    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(AVATAR_BATCH_WINDOW_MS)).await;
        flush_avatar_batch_now(&app_handle);
    });
}

fn enqueue_avatar_resolution(app: &AppHandle, uid: &str, sender_face_hint: Option<String>) {
    let should_flush_now = {
        let queue = avatar_batch_queue();
        let mut queue_guard = queue.lock().unwrap_or_else(|poison| poison.into_inner());
        queue_guard
            .entry(uid.to_string())
            .and_modify(|current| {
                if current.is_none() {
                    *current = sender_face_hint.clone();
                }
            })
            .or_insert(sender_face_hint);
        queue_guard.len() >= AVATAR_BATCH_MAX_SIZE
    };

    if should_flush_now {
        flush_avatar_batch_now(app);
    } else {
        schedule_avatar_batch_flush(app);
    }
}

fn enrich_sender_face_with_cache(app: &AppHandle, message: &mut Value) {
    let sender_uid = message.get("sender_uid").and_then(Value::as_u64);
    let sender_face_hint = message
        .get("sender_face")
        .and_then(Value::as_str)
        .and_then(normalize_asset_url);
    let Some(uid) = sender_uid else {
        return;
    };

    let uid_key = uid.to_string();
    let state = app.state::<AppState>();
    if let Some(cached_face) = avatar::load_cached_face_data_url(&state.config_path, &uid_key) {
        message["sender_face"] = Value::String(cached_face);
        return;
    }

    if let Some(face_url) = &sender_face_hint {
        message["sender_face"] = Value::String(face_url.clone());
    }

    let should_refresh = {
        let pending = avatar_cache_pending();
        let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
        if pending_guard.contains(&uid_key) {
            false
        } else {
            pending_guard.insert(uid_key.clone());
            true
        }
    };

    if !should_refresh {
        return;
    }

    let config_path = state.config_path.clone();
    if let Some(cached_face) = avatar::load_cached_face_data_url(&config_path, &uid_key) {
        emit_avatar_resolved(app, &uid_key, &cached_face);
        clear_avatar_pending(&uid_key);
        return;
    }

    enqueue_avatar_resolution(app, &uid_key, sender_face_hint);
}

fn enqueue_emoticon_refresh(app: &AppHandle, cache_key: String, source_url: String) {
    if source_url.trim().is_empty() {
        return;
    }
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_handle.state::<AppState>();
        let client = state.client.clone();
        let config_path = state.config_path.clone();
        if let Err(error) =
            emoticon::refresh_emoticon_cache(&client, &config_path, &cache_key, &source_url).await
        {
            crate::runtime_log!(
                "[danmu] refresh emoticon cache failed key={} err={}",
                cache_key,
                error
            );
        }
        let pending = emoticon_cache_pending();
        let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
        pending_guard.remove(&cache_key);
    });
}

fn enrich_emoticon_with_cache(app: &AppHandle, message: &mut Value) {
    let Some(raw_emoticon) = message.get("emoticon").and_then(Value::as_object) else {
        return;
    };
    let emoticon_unique = raw_emoticon
        .get("emoticon_unique")
        .and_then(Value::as_str)
        .unwrap_or("");
    let emoticon_id = raw_emoticon
        .get("emoticon_id")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let source_url = raw_emoticon
        .get("url")
        .and_then(Value::as_str)
        .map(emoticon::normalize_image_url)
        .unwrap_or_default();
    if source_url.trim().is_empty() {
        return;
    }
    let cache_key = emoticon::build_emoticon_cache_key(
        emoticon_unique,
        emoticon_id,
        &source_url,
        raw_emoticon
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("danmu_emoticon"),
    );
    let state = app.state::<AppState>();
    if let Some(cached) = emoticon::resolve_cached_emoticon_data_url(&state.config_path, &cache_key)
    {
        message["emoticon"]["url"] = Value::String(cached);
        return;
    }
    message["emoticon"]["url"] = Value::String(source_url.clone());
    let should_refresh = {
        let pending = emoticon_cache_pending();
        let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
        if pending_guard.contains(&cache_key) {
            false
        } else {
            pending_guard.insert(cache_key.clone());
            true
        }
    };
    if should_refresh {
        enqueue_emoticon_refresh(app, cache_key, source_url);
    }
}

pub fn should_filter_danmu_message(config: &crate::models::PersistConfig, message: &Value) -> bool {
    let cmd = message.get("cmd").and_then(Value::as_str).unwrap_or_default();
    let msg_type = message.get("type").and_then(Value::as_str).unwrap_or_default();
    let interact_type = message
        .get("interact_type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let content = message
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();

    if config.filter_entry_effect && (cmd == "ENTRY_EFFECT" || cmd == "ENTRY_EFFECT_MUST_RECEIVE") {
        return true;
    }

    if config.filter_guard_status
        && (cmd == "GUARD_HONOR_THOUSAND"
            || (msg_type == "live_state" && content.contains("guard_honor")))
    {
        return true;
    }

    if config.filter_enter_msg
        && msg_type == "interact"
        && interact_type == "enter"
        && cmd != "ENTRY_EFFECT"
        && cmd != "ENTRY_EFFECT_MUST_RECEIVE"
    {
        return true;
    }

    if config.filter_follow_share_msg
        && msg_type == "interact"
        && (interact_type == "follow" || interact_type == "share")
    {
        return true;
    }

    false
}

pub fn decode_and_emit(app: &AppHandle, data: &[u8]) -> Option<u64> {
    let mut offset = 0usize;
    let mut reenter_delay_secs: Option<u64> = None;
    while offset + 16 <= data.len() {
        let mut cur = std::io::Cursor::new(&data[offset..]);
        let packet_len = cur.get_u32() as usize;
        let header_len = cur.get_u16() as usize;
        let proto = cur.get_u16();
        let op = cur.get_u32();
        let _ = cur.get_u32();

        if packet_len == 0 || offset + packet_len > data.len() || header_len < 16 {
            break;
        }

        let body = &data[offset + header_len..offset + packet_len];
        if proto == 2 {
            let decoder = flate2::read::ZlibDecoder::new(body);
            let mut out = vec![];
            // Limit decompressed output to 5MB to prevent zip bombs
            let mut reader = decoder.take(5 * 1024 * 1024);
            if reader.read_to_end(&mut out).is_ok() {
                if out.len() < 5 * 1024 * 1024 {
                    if let Some(delay) = decode_and_emit(app, &out) {
                        reenter_delay_secs = Some(delay);
                    }
                } else {
                    crate::runtime_log!(
                        "[danmu] Decompressed size exceeded safety limit (5MB). Aborting packet."
                    );
                }
            }
        } else if proto == 3 {
            let decoder = brotli::Decompressor::new(body, 4096);
            let mut out = vec![];
            // Limit decompressed output to 5MB to prevent zip bombs
            let mut reader = decoder.take(5 * 1024 * 1024);
            if reader.read_to_end(&mut out).is_ok() {
                if out.len() < 5 * 1024 * 1024 {
                    if let Some(delay) = decode_and_emit(app, &out) {
                        reenter_delay_secs = Some(delay);
                    }
                } else {
                    crate::runtime_log!(
                        "[danmu] Decompressed size exceeded safety limit (5MB). Aborting packet."
                    );
                }
            }
        } else if op == 5 {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) {
                let raw_cmd = value["cmd"].as_str().unwrap_or("UNKNOWN");
                let (message, reenter_delay) = parse_danmu_message(&value);
                if let Some(mut message) = message {
                    let config = {
                        let state = app.state::<AppState>();
                        let maybe_cfg = state.runtime.try_lock().ok().map(|g| g.config.clone());
                        if let Some(cfg) = maybe_cfg {
                            if let Ok(mut cache) = filter_config_cache().lock() {
                                *cache = cfg.clone();
                            }
                            cfg
                        } else if let Ok(cache) = filter_config_cache().lock() {
                            cache.clone()
                        } else {
                            crate::models::PersistConfig::default()
                        }
                    };
                    if !should_filter_danmu_message(&config, &message) {
                        enrich_sender_face_with_cache(app, &mut message);
                        enrich_emoticon_with_cache(app, &mut message);
                        crate::ws_server::broadcast_danmu_message(app, &message);
                        let _ = app.emit("danmu-message", message);
                    }
                } else if is_supported_cmd(raw_cmd) {
                    let _ = app.emit("danmu-message", build_parse_failed_system_message(raw_cmd));
                }
                if reenter_delay.is_some() {
                    reenter_delay_secs = reenter_delay;
                }
            }
        }

        offset += packet_len;
    }
    reenter_delay_secs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PersistConfig;
    use serde_json::json;

    #[test]
    fn test_should_filter_entry_effect() {
        let mut cfg = PersistConfig::default();
        cfg.filter_entry_effect = true;
        let msg = json!({ "cmd": "ENTRY_EFFECT", "type": "interact" });
        assert!(should_filter_danmu_message(&cfg, &msg));

        cfg.filter_entry_effect = false;
        assert!(!should_filter_danmu_message(&cfg, &msg));
    }

    #[test]
    fn test_should_filter_guard_status() {
        let mut cfg = PersistConfig::default();
        cfg.filter_guard_status = true;
        let msg = json!({ "cmd": "GUARD_HONOR_THOUSAND", "type": "interact" });
        assert!(should_filter_danmu_message(&cfg, &msg));

        cfg.filter_guard_status = false;
        assert!(!should_filter_danmu_message(&cfg, &msg));
    }

    #[test]
    fn test_should_filter_enter_msg() {
        let mut cfg = PersistConfig::default();
        cfg.filter_enter_msg = true;
        let msg = json!({ "type": "interact", "interact_type": "enter", "cmd": "INTERACT_WORD" });
        assert!(should_filter_danmu_message(&cfg, &msg));

        cfg.filter_enter_msg = false;
        assert!(!should_filter_danmu_message(&cfg, &msg));
    }

    #[test]
    fn test_should_filter_follow_share_msg() {
        let mut cfg = PersistConfig::default();
        cfg.filter_follow_share_msg = true;
        let follow_msg = json!({ "type": "interact", "interact_type": "follow" });
        let share_msg = json!({ "type": "interact", "interact_type": "share" });
        assert!(should_filter_danmu_message(&cfg, &follow_msg));
        assert!(should_filter_danmu_message(&cfg, &share_msg));

        cfg.filter_follow_share_msg = false;
        assert!(!should_filter_danmu_message(&cfg, &follow_msg));
        assert!(!should_filter_danmu_message(&cfg, &share_msg));
    }
}

