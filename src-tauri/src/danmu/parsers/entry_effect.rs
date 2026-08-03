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
    let raw_copy = data
        .and_then(|value| value.get("copy_writing_v2"))
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            data.and_then(|value| value.get("copy_writing"))
                .and_then(Value::as_str)
        });
    let copy_writing = if let Some(raw) = raw_copy {
        let mut cleaned = raw.to_string();
        while let Some(start) = cleaned.find("<%") {
            if let Some(end) = cleaned[start..].find("%>") {
                cleaned.replace_range(start..start + end + 2, &sender);
            } else {
                break;
            }
        }
        cleaned
    } else {
        "i18n.live.event.interact.enter".to_string()
    };
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

#[cfg(test)]
mod tests {
    use super::parse;
    use crate::danmu::parsers::ParseContext;
    use serde_json::json;

    #[test]
    fn test_parse_entry_effect_cleans_template_placeholder() {
        let payload = json!({
            "cmd": "ENTRY_EFFECT",
            "data": {
                "uid": 123456,
                "copy_writing": "<%mozi1924%> 来了",
                "uinfo": {
                    "base": {
                        "name": "mozi1924"
                    }
                }
            }
        });
        let ctx = ParseContext {
            id: "msg_1",
            time: "12:00:00",
            cmd: "ENTRY_EFFECT",
        };
        let (message, _) = parse(&payload, &ctx).unwrap();
        let message = message.unwrap();
        assert_eq!(message["sender"].as_str().unwrap(), "mozi1924");
        assert_eq!(message["content"].as_str().unwrap(), "mozi1924 来了");
        assert_eq!(message["interact_type"].as_str().unwrap(), "enter");
    }
}

