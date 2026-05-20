use bytes::Buf;
use rand::{random, Rng};
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

fn parse_danmu_message(payload: &Value) -> (Option<Value>, Option<u64>) {
    let cmd = payload["cmd"].as_str().unwrap_or("UNKNOWN");
    let id = next_msg_id();
    let time = now_hms();

    if cmd.starts_with("DANMU_MSG") {
        let Some(info) = payload["info"].as_array() else {
            return (None, None);
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
        let gift_name = data
            .get("giftName")
            .and_then(|value| value.as_str())
            .unwrap_or("礼物");
        let num = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        return (
            Some(json!({
            "id": id,
            "type": "gift",
            "time": time,
            "sender": sender,
            "content": format!("送出 {gift_name} x{num}"),
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
        let guard_name = data
            .get("gift_name")
            .and_then(|value| value.as_str())
            .unwrap_or("舰长");
        return (
            Some(json!({
            "id": id,
            "type": "guard",
            "time": time,
            "sender": sender,
            "content": format!("开通 {guard_name}"),
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
                if let Some(message) = message {
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
