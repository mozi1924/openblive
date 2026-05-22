use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{normalize_asset_url, parse_u64};
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd != "ENTRY_EFFECT" && ctx.cmd != "ENTRY_EFFECT_MUST_RECEIVE" {
        return None;
    }

    let data = payload.get("data").and_then(Value::as_object);
    let sender = data
        .and_then(|value| value.get("uinfo"))
        .and_then(|value| value.get("base"))
        .and_then(|value| value.get("name"))
        .and_then(Value::as_str)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            data.and_then(|value| value.get("copy_writing"))
                .and_then(Value::as_str)
                .and_then(|raw| {
                    raw.split("<%")
                        .nth(1)
                        .and_then(|part| part.split("%>").next())
                        .map(|part| part.trim().to_string())
                })
        })
        .unwrap_or_else(|| "i18n.live.event.fallback.viewer".to_string());
    let sender_uid = data.and_then(|value| value.get("uid")).and_then(parse_u64);
    let sender_face = data
        .and_then(|value| value.get("face"))
        .and_then(Value::as_str)
        .and_then(normalize_asset_url);
    let copy_writing = data
        .and_then(|value| value.get("copy_writing_v2"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| data.and_then(|value| value.get("copy_writing")).and_then(Value::as_str))
        .unwrap_or("i18n.live.event.interact.enter");
    Some((
        Some(json!({
            "id": ctx.id,
            "type": "interact",
            "time": ctx.time,
            "sender": sender,
            "content": copy_writing,
            "sender_uid": sender_uid,
            "sender_role": "viewer",
            "sender_face": sender_face,
            "interact_type": "enter",
            "cmd": ctx.cmd,
        })),
        None,
    ))
}

