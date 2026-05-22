use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{
    normalize_asset_url, normalize_hex_color, parse_i64, parse_string, parse_u64,
};
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd == "SUPER_CHAT_MESSAGE" || ctx.cmd == "SUPER_CHAT_MESSAGE_JPN" {
        let Some(data) = payload["data"].as_object() else {
            return Some((None, None));
        };
        let sender = data
            .get("user_info")
            .and_then(|value| value.get("uname"))
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("i18n.live.event.fallback.superchat_user")
            .to_string();
        let sender_uid = data.get("uid").and_then(parse_u64);
        let sender_guard_level = data
            .get("user_info")
            .and_then(|value| value.get("guard_level"))
            .and_then(parse_i64)
            .or_else(|| {
                data.get("medal_info")
                    .and_then(|value| value.get("guard_level"))
                    .and_then(parse_i64)
            })
            .unwrap_or(0);
        let sender_name_color = data
            .get("user_info")
            .and_then(|value| value.get("name_color"))
            .and_then(Value::as_str)
            .and_then(normalize_hex_color);
        let sender_face = data
            .get("user_info")
            .and_then(|value| value.get("face"))
            .and_then(Value::as_str)
            .and_then(normalize_asset_url);
        let sender_role = if sender_guard_level > 0 {
            "guard"
        } else {
            "viewer"
        };
        let superchat_id = data.get("id").and_then(parse_i64);
        let superchat_price = data.get("price").and_then(parse_i64).unwrap_or(0);
        let message = data
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let message_jpn = data.get("message_jpn").and_then(parse_string);
        let gift_name = data
            .get("gift")
            .and_then(|value| value.get("gift_name"))
            .and_then(Value::as_str)
            .unwrap_or("i18n.live.event.fallback.superchat");
        let gift_count = data
            .get("gift")
            .and_then(|value| value.get("num"))
            .and_then(parse_i64)
            .unwrap_or(1);
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "superchat",
                "time": ctx.time,
                "sender": sender,
                "content": message,
                "sender_uid": sender_uid,
                "sender_role": sender_role,
                "sender_guard_level": sender_guard_level,
                "sender_name_color": sender_name_color,
                "sender_face": sender_face,
                "superchat_id": superchat_id,
                "superchat_price": superchat_price,
                "superchat_message_jpn": message_jpn,
                "gift_name": gift_name,
                "gift_count": gift_count,
                "gift_coin_type": "gold",
                "gift_total_coin": superchat_price.saturating_mul(1000),
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "SUPER_CHAT_MESSAGE_DELETE" {
        let ids = payload
            .get("data")
            .and_then(|value| value.get("ids"))
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(parse_i64).collect::<Vec<_>>())
            .unwrap_or_default();
        let content = format!("i18n.live.event.moderation.superchat_deleted:{}", ids.len());
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "moderation",
                "time": ctx.time,
                "sender": "system",
                "content": content,
                "deleted_ids": ids,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    None
}
