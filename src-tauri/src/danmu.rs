use crate::{avatar, state::AppState};
use bytes::Buf;
use serde_json::Value;
use std::{
    collections::HashSet,
    io::Read,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter, Manager};

mod helpers;
mod interact_word;
mod parsers;

use helpers::normalize_asset_url;
use parsers::{build_parse_failed_system_message, is_supported_cmd, parse_danmu_message};

static AVATAR_CACHE_PENDING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn avatar_cache_pending() -> &'static Mutex<HashSet<String>> {
    AVATAR_CACHE_PENDING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn enrich_sender_face_with_cache(app: &AppHandle, message: &mut Value) {
    let sender_uid = message.get("sender_uid").and_then(Value::as_u64);
    let sender_face = message
        .get("sender_face")
        .and_then(Value::as_str)
        .and_then(normalize_asset_url);
    let (Some(uid), Some(face_url)) = (sender_uid, sender_face) else {
        return;
    };

    let uid_key = uid.to_string();
    let state = app.state::<AppState>();
    if let Some(cached_face) = avatar::load_cached_face_data_url(&state.config_path, &uid_key) {
        message["sender_face"] = Value::String(cached_face);
        return;
    }

    message["sender_face"] = Value::String(face_url.clone());

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

    let client = state.client.clone();
    let config_path = state.config_path.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(error) =
            avatar::refresh_avatar_cache(&client, &config_path, &uid_key, &face_url).await
        {
            crate::runtime_log!(
                "[danmu] refresh avatar cache failed for uid {}: {}",
                uid_key, error
            );
        }
        let pending = avatar_cache_pending();
        let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
        pending_guard.remove(&uid_key);
    });
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
            let mut decoder = flate2::read::ZlibDecoder::new(body);
            let mut out = vec![];
            if decoder.read_to_end(&mut out).is_ok() {
                if let Some(delay) = decode_and_emit(app, &out) {
                    reenter_delay_secs = Some(delay);
                }
            }
        } else if proto == 3 {
            let mut decoder = brotli::Decompressor::new(body, 4096);
            let mut out = vec![];
            if decoder.read_to_end(&mut out).is_ok() {
                if let Some(delay) = decode_and_emit(app, &out) {
                    reenter_delay_secs = Some(delay);
                }
            }
        } else if op == 5 {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) {
                let raw_cmd = value["cmd"].as_str().unwrap_or("UNKNOWN");
                let (message, reenter_delay) = parse_danmu_message(&value);
                if let Some(mut message) = message {
                    enrich_sender_face_with_cache(app, &mut message);
                    let _ = app.emit("danmu-message", message);
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
