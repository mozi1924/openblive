use crate::{avatar, state::AppState};
use bytes::Buf;
use rand::{random, Rng};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    io::Read,
    sync::{Mutex, OnceLock},
};
use tauri::{AppHandle, Emitter, Manager};

static AVATAR_CACHE_PENDING: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn avatar_cache_pending() -> &'static Mutex<HashSet<String>> {
    AVATAR_CACHE_PENDING.get_or_init(|| Mutex::new(HashSet::new()))
}

fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn next_msg_id() -> String {
    format!(
        "{:x}{:08x}",
        chrono::Utc::now().timestamp_millis(),
        random::<u32>()
    )
}

fn normalize_hex_color(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with('#') {
        return Some(trimmed.to_string());
    }
    if trimmed.len() == 6 || trimmed.len() == 8 {
        return Some(format!("#{trimmed}"));
    }
    None
}

fn dec_color_to_hex(value: i64) -> Option<String> {
    if value <= 0 {
        return None;
    }
    Some(format!("#{:06X}", value as u32 & 0x00FF_FFFF))
}

fn normalize_asset_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("//") {
        return Some(format!("https:{trimmed}"));
    }
    if let Some(stripped) = trimmed.strip_prefix("http://") {
        return Some(format!("https://{stripped}"));
    }
    Some(trimmed.to_string())
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
        if let Err(error) = avatar::refresh_avatar_cache(&client, &config_path, &uid_key, &face_url).await {
            eprintln!("[danmu] refresh avatar cache failed for uid {}: {}", uid_key, error);
        }
        let pending = avatar_cache_pending();
        let mut pending_guard = pending.lock().unwrap_or_else(|poison| poison.into_inner());
        pending_guard.remove(&uid_key);
    });
}

fn parse_danmu_message(payload: &Value) -> (Option<Value>, Option<u64>) {
    let cmd = payload["cmd"].as_str().unwrap_or("UNKNOWN");
    let id = next_msg_id();
    let time = now_hms();

    if cmd.starts_with("DANMU_MSG") {
        let Some(info) = payload["info"].as_array() else {
            return (None, None);
        };
        let sender_uid = info
            .get(0)
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("uid"))
            .and_then(|value| value.as_u64())
            .or_else(|| {
                info.get(2)
                    .and_then(|value| value.as_array())
                    .and_then(|value| value.first())
                    .and_then(|value| value.as_u64())
            });
        let sender_admin_level = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(2))
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let sender_guard_level = info
            .get(0)
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("medal"))
            .and_then(|value| value.get("guard_level"))
            .and_then(|value| value.as_i64())
            .or_else(|| {
                info.get(3)
                    .and_then(|value| value.as_array())
                    .and_then(|medal| medal.get(10))
                    .and_then(|value| value.as_i64())
            })
            .unwrap_or(0);
        let sender_name_color = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(7))
            .and_then(|value| value.as_str())
            .and_then(normalize_hex_color)
            .or_else(|| {
                info.get(0)
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("name_color_str"))
                    .and_then(|value| value.as_str())
                    .and_then(normalize_hex_color)
            })
            .or_else(|| {
                info.get(0)
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("name_color"))
                    .and_then(|value| value.as_i64())
                    .and_then(dec_color_to_hex)
            });
        let sender_face = info
            .get(0)
            .and_then(|value| value.get(15))
            .and_then(|value| value.get("user"))
            .and_then(|value| value.get("base"))
            .and_then(|value| value.get("face"))
            .and_then(|value| value.as_str())
            .and_then(normalize_asset_url)
            .or_else(|| {
                info.get(0)
                    .and_then(|value| value.get(15))
                    .and_then(|value| value.get("user"))
                    .and_then(|value| value.get("base"))
                    .and_then(|value| value.get("origin_info"))
                    .and_then(|value| value.get("face"))
                    .and_then(|value| value.as_str())
                    .and_then(normalize_asset_url)
            });
        let sender_role = if sender_admin_level > 0 {
            "admin"
        } else if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let content = info
            .get(1)
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let sender = info
            .get(2)
            .and_then(|value| value.as_array())
            .and_then(|meta| meta.get(1))
            .and_then(|value| value.as_str())
            .unwrap_or("匿名用户")
            .to_string();
        return (
            Some(json!({
            "id": id,
            "type": "danmu",
            "time": time,
            "sender": sender,
            "content": content,
            "sender_uid": sender_uid,
            "sender_role": sender_role,
            "sender_name_color": sender_name_color,
            "sender_guard_level": sender_guard_level,
            "sender_face": sender_face,
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "SEND_GIFT" {
        let Some(data) = payload["data"].as_object() else {
            return (None, None);
        };
        let sender = data
            .get("uname")
            .and_then(|value| value.as_str())
            .unwrap_or("礼物用户")
            .to_string();
        let sender_uid = data.get("uid").and_then(|value| value.as_u64());
        let sender_guard_level = data
            .get("medal_info")
            .and_then(|value| value.get("guard_level"))
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let sender_face = data
            .get("face")
            .and_then(|value| value.as_str())
            .and_then(normalize_asset_url);
        let sender_name_color = data
            .get("name_color")
            .and_then(|value| value.as_str())
            .and_then(normalize_hex_color);
        let sender_role = if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let gift_name = data
            .get("giftName")
            .and_then(|value| value.as_str())
            .unwrap_or("礼物");
        let num = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        let gift_unit_price = data
            .get("price")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let gift_total_coin = data
            .get("total_coin")
            .and_then(|value| value.as_i64())
            .or_else(|| data.get("combo_total_coin").and_then(|value| value.as_i64()))
            .unwrap_or_else(|| gift_unit_price.saturating_mul(num.max(1)));
        let gift_coin_type = data
            .get("coin_type")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        return (
            Some(json!({
            "id": id,
            "type": "gift",
            "time": time,
            "sender": sender,
            "content": format!("送出 {gift_name} x{num}"),
            "sender_uid": sender_uid,
            "sender_role": sender_role,
            "sender_guard_level": sender_guard_level,
            "sender_name_color": sender_name_color,
            "sender_face": sender_face,
            "gift_name": gift_name,
            "gift_count": num,
            "gift_coin_type": gift_coin_type,
            "gift_unit_price": gift_unit_price,
            "gift_total_coin": gift_total_coin,
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "GUARD_BUY" {
        let Some(data) = payload["data"].as_object() else {
            return (None, None);
        };
        let sender = data
            .get("username")
            .and_then(|value| value.as_str())
            .unwrap_or("舰长用户")
            .to_string();
        let sender_uid = data.get("uid").and_then(|value| value.as_u64());
        let sender_guard_level = data
            .get("guard_level")
            .and_then(|value| value.as_i64())
            .unwrap_or(3);
        let guard_name = data
            .get("gift_name")
            .and_then(|value| value.as_str())
            .unwrap_or("舰长");
        let guard_count = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        let guard_unit_price = data
            .get("price")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        return (
            Some(json!({
            "id": id,
            "type": "guard",
            "time": time,
            "sender": sender,
            "content": format!("开通 {guard_name}"),
            "sender_uid": sender_uid,
            "sender_role": "guard",
            "sender_guard_level": sender_guard_level,
            "gift_name": guard_name,
            "gift_count": guard_count,
            "gift_coin_type": "guard",
            "gift_unit_price": guard_unit_price,
            "gift_total_coin": guard_unit_price.saturating_mul(guard_count.max(1)),
            "cmd": cmd,
            })),
            None,
        );
    }

    if cmd == "REENTER_LIVE_ROOM" {
        let range = payload["data"]["request_random_sec_range"]
            .as_u64()
            .unwrap_or(0)
            .min(30);
        let delay_secs = if range > 0 {
            rand::thread_rng().gen_range(0..=range)
        } else {
            0
        };
        let reason = payload["data"]["reason"].as_i64().unwrap_or(-1);
        return (
            Some(json!({
                "id": id,
                "type": "system",
                "time": time,
                "sender": "system",
                "content": format!("服务端请求重进直播间（reason={reason}）"),
                "cmd": cmd,
            })),
            Some(delay_secs),
        );
    }

    (None, None)
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
                let (message, reenter_delay) = parse_danmu_message(&value);
                if let Some(mut message) = message {
                    enrich_sender_face_with_cache(app, &mut message);
                    let _ = app.emit("danmu-message", message);
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
