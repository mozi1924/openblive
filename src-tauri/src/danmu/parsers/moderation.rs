use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{parse_i64, parse_u64};
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd == "WARNING" {
        let warning_msg = payload
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.warning");
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": warning_msg,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "CUT_OFF" {
        let cut_off_msg = payload
            .get("msg")
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.cut_off");
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": cut_off_msg,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "CUT_OFF_V2" {
        let title = payload
            .get("data")
            .and_then(|value| value.get("cut_off_data"))
            .and_then(|value| value.get("cut_off_title"))
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.moderation.violation_notice");
        let reason = payload
            .get("data")
            .and_then(|value| value.get("cut_off_data"))
            .and_then(|value| value.get("cut_off_message_list"))
            .and_then(Value::as_array)
            .and_then(|list| {
                list.iter().find_map(|item| {
                    let label = item.get("label").and_then(Value::as_str).unwrap_or("");
                    let content = item.get("content").and_then(Value::as_str).unwrap_or("");
                    if label.is_empty() || content.is_empty() {
                        None
                    } else {
                        Some(format!("{label}:{content}"))
                    }
                })
            })
            .unwrap_or_else(|| "i18n.live.event.moderation.cut_off".to_string());
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": format!("{title} · {reason}"),
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "ROOM_BLOCK_MSG" {
        let sender = payload
            .get("data")
            .and_then(|value| value.get("uname"))
            .and_then(Value::as_str)
            .or_else(|| payload.get("uname").and_then(Value::as_str))
            .unwrap_or("i18n.live.event.fallback.some_viewer")
            .to_string();
        let sender_uid = payload
            .get("data")
            .and_then(|value| value.get("uid"))
            .and_then(parse_u64)
            .or_else(|| payload.get("uid").and_then(parse_u64));
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": format!("{sender} i18n.live.event.moderation.room_blocked"),
                "sender_uid": sender_uid,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "ROOM_SILENT_ON" {
        let level = payload
            .get("data")
            .and_then(|value| value.get("level"))
            .and_then(parse_i64)
            .unwrap_or(0);
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": format!("i18n.live.event.moderation.silent_on(level={level})"),
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "ROOM_SILENT_OFF" {
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": "i18n.live.event.moderation.silent_off",
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    None
}
