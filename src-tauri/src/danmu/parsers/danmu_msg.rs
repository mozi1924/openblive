use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{
    dec_color_to_hex, normalize_asset_url, normalize_hex_color, parse_i64, parse_u64,
};
use serde_json::{json, Value};

fn parse_danmu_emoticon(
    meta: &[Value],
    extra_json: Option<&Value>,
    content: &str,
) -> Option<Value> {
    let dm_type = extra_json
        .and_then(|extra| extra.get("dm_type"))
        .and_then(parse_i64)
        .unwrap_or(0);
    let emoticon_meta = meta.get(13).filter(|value| value.is_object())?;
    let source_url = emoticon_meta
        .get("url")
        .and_then(Value::as_str)
        .or_else(|| {
            extra_json
                .and_then(|extra| extra.get("emots"))
                .and_then(|emots| emots.get(content))
                .and_then(|entry| entry.get("url"))
                .and_then(Value::as_str)
        })
        .and_then(normalize_asset_url)?;
    let emoticon_unique = emoticon_meta
        .get("emoticon_unique")
        .and_then(Value::as_str)
        .or_else(|| {
            extra_json
                .and_then(|extra| extra.get("emoticon_unique"))
                .and_then(Value::as_str)
        })
        .unwrap_or("")
        .trim()
        .to_string();
    let emoticon_id = emoticon_meta
        .get("emoticon_id")
        .or_else(|| emoticon_meta.get("id"))
        .and_then(parse_u64)
        .unwrap_or(0);
    let width = emoticon_meta
        .get("width")
        .and_then(parse_u64)
        .unwrap_or_default();
    let height = emoticon_meta
        .get("height")
        .and_then(parse_u64)
        .unwrap_or_default();
    let is_dynamic = emoticon_meta
        .get("is_dynamic")
        .and_then(parse_i64)
        .unwrap_or(0)
        > 0;
    Some(json!({
        "text": content,
        "url": source_url,
        "emoticon_unique": emoticon_unique,
        "emoticon_id": emoticon_id,
        "width": width,
        "height": height,
        "is_dynamic": is_dynamic,
        "dm_type": dm_type,
    }))
}

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if !ctx.cmd.starts_with("DANMU_MSG") {
        return None;
    }

    let Some(info) = payload["info"].as_array() else {
        return Some((None, None));
    };

    let extra_json = info
        .first()
        .and_then(|value| value.get(15))
        .and_then(|value| value.get("extra"))
        .and_then(Value::as_str)
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok());
    let danmu_msg_id = payload
        .get("msg_id")
        .and_then(Value::as_str)
        .map(|raw| raw.to_string());
    let danmu_id_str = extra_json
        .as_ref()
        .and_then(|extra| extra.get("id_str"))
        .and_then(Value::as_str)
        .map(|raw| raw.to_string());
    let danmu_rnd = info
        .first()
        .and_then(Value::as_array)
        .and_then(|meta| meta.get(4))
        .and_then(parse_i64);
    let danmu_legacy_id = info
        .first()
        .and_then(Value::as_array)
        .and_then(|meta| meta.get(5))
        .and_then(parse_i64);
    let sender_uid = info
        .first()
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
        .first()
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
            info.first()
                .and_then(|value| value.get(15))
                .and_then(|value| value.get("user"))
                .and_then(|value| value.get("base"))
                .and_then(|value| value.get("name_color_str"))
                .and_then(|value| value.as_str())
                .and_then(normalize_hex_color)
        })
        .or_else(|| {
            info.first()
                .and_then(|value| value.get(15))
                .and_then(|value| value.get("user"))
                .and_then(|value| value.get("base"))
                .and_then(|value| value.get("name_color"))
                .and_then(|value| value.as_i64())
                .and_then(dec_color_to_hex)
        });
    let sender_face = info
        .first()
        .and_then(|value| value.get(15))
        .and_then(|value| value.get("user"))
        .and_then(|value| value.get("base"))
        .and_then(|value| value.get("face"))
        .and_then(|value| value.as_str())
        .and_then(normalize_asset_url)
        .or_else(|| {
            info.first()
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
    let emoticon = info
        .first()
        .and_then(Value::as_array)
        .and_then(|meta| parse_danmu_emoticon(meta, extra_json.as_ref(), &content));
    let sender = info
        .get(2)
        .and_then(|value| value.as_array())
        .and_then(|meta| meta.get(1))
        .and_then(|value| value.as_str())
        .unwrap_or("i18n.live.event.fallback.anonymous_user")
        .to_string();

    Some((
        Some(json!({
            "id": ctx.id,
            "type": "danmu",
            "time": ctx.time,
            "sender": sender,
            "content": content,
            "sender_uid": sender_uid,
            "sender_role": sender_role,
            "sender_name_color": sender_name_color,
            "sender_guard_level": sender_guard_level,
            "sender_face": sender_face,
            "content_type": if emoticon.is_some() { 1 } else { 0 },
            "emoticon": emoticon,
            "danmu_msg_id": danmu_msg_id,
            "danmu_id_str": danmu_id_str,
            "danmu_rnd": danmu_rnd,
            "danmu_legacy_id": danmu_legacy_id,
            "cmd": ctx.cmd,
        })),
        None,
    ))
}
