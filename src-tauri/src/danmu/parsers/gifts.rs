use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{normalize_asset_url, normalize_hex_color};
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd == "SEND_GIFT" {
        let Some(data) = payload["data"].as_object() else {
            return Some((None, None));
        };
        let sender = data
            .get("uname")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.gift_user")
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
            .unwrap_or("i18n.live.event.fallback.gift");
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
            .or_else(|| {
                data.get("combo_total_coin")
                    .and_then(|value| value.as_i64())
            })
            .unwrap_or_else(|| gift_unit_price.saturating_mul(num.max(1)));
        let gift_coin_type = data
            .get("coin_type")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        let content = format!("i18n.live.event.gift.sent:{gift_name}:x{num}");
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "gift",
                "time": ctx.time,
                "sender": sender,
                "content": content,
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
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "GUARD_BUY" {
        let Some(data) = payload["data"].as_object() else {
            return Some((None, None));
        };
        let sender = data
            .get("username")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.guard_user")
            .to_string();
        let sender_uid = data.get("uid").and_then(|value| value.as_u64());
        let sender_guard_level = data
            .get("guard_level")
            .and_then(|value| value.as_i64())
            .unwrap_or(3);
        let guard_name = data
            .get("gift_name")
            .and_then(|value| value.as_str())
            .unwrap_or("i18n.live.event.fallback.guard");
        let guard_count = data
            .get("num")
            .and_then(|value| value.as_i64())
            .unwrap_or(1);
        let guard_unit_price = data
            .get("price")
            .and_then(|value| value.as_i64())
            .unwrap_or(0);
        let content = format!("i18n.live.event.guard.activated:{guard_name}");
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "guard",
                "time": ctx.time,
                "sender": sender,
                "content": content,
                "sender_uid": sender_uid,
                "sender_role": "guard",
                "sender_guard_level": sender_guard_level,
                "gift_name": guard_name,
                "gift_count": guard_count,
                "gift_coin_type": "guard",
                "gift_unit_price": guard_unit_price,
                "gift_total_coin": guard_unit_price.saturating_mul(guard_count.max(1)),
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    None
}
