use bytes::Buf;
use rand::random;
use serde_json::{json, Value};
use std::io::Read;
use tauri::{AppHandle, Emitter};

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

fn parse_danmu_message(payload: &Value) -> Option<Value> {
    let cmd = payload["cmd"].as_str().unwrap_or("UNKNOWN");
    let id = next_msg_id();
    let time = now_hms();

    if cmd.starts_with("DANMU_MSG") {
        let info = payload["info"].as_array()?;
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
        return Some(json!({
            "id": id,
            "type": "danmu",
            "time": time,
            "sender": sender,
            "content": content,
            "cmd": cmd,
        }));
    }

    if cmd == "SEND_GIFT" {
        let data = payload["data"].as_object()?;
        let sender = data
            .get("uname")
            .and_then(|value| value.as_str())
            .unwrap_or("礼物用户")
            .to_string();
        let gift_name = data
            .get("giftName")
            .and_then(|value| value.as_str())
            .unwrap_or("礼物");
        let num = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        return Some(json!({
            "id": id,
            "type": "gift",
            "time": time,
            "sender": sender,
            "content": format!("送出 {gift_name} x{num}"),
            "cmd": cmd,
        }));
    }

    if cmd == "GUARD_BUY" {
        let data = payload["data"].as_object()?;
        let sender = data
            .get("username")
            .and_then(|value| value.as_str())
            .unwrap_or("舰长用户")
            .to_string();
        let guard_name = data
            .get("gift_name")
            .and_then(|value| value.as_str())
            .unwrap_or("舰长");
        return Some(json!({
            "id": id,
            "type": "guard",
            "time": time,
            "sender": sender,
            "content": format!("开通 {guard_name}"),
            "cmd": cmd,
        }));
    }

    None
}

pub fn decode_and_emit(app: &AppHandle, data: &[u8]) {
    let mut offset = 0usize;
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
                decode_and_emit(app, &out);
            }
        } else if proto == 3 {
            let mut decoder = brotli::Decompressor::new(body, 4096);
            let mut out = vec![];
            if decoder.read_to_end(&mut out).is_ok() {
                decode_and_emit(app, &out);
            }
        } else if op == 5 {
            if let Ok(value) = serde_json::from_slice::<serde_json::Value>(body) {
                if let Some(message) = parse_danmu_message(&value) {
                    let _ = app.emit("danmu-message", message);
                }
            }
        }

        offset += packet_len;
    }
}
