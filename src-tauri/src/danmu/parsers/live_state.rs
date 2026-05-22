use super::{ParseContext, ParseResult};
use crate::danmu::helpers::parse_i64;
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd == "ROOM_CHANGE" {
        let title = payload
            .get("data")
            .and_then(|value| value.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let parent = payload
            .get("data")
            .and_then(|value| value.get("parent_area_name"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let area = payload
            .get("data")
            .and_then(|value| value.get("area_name"))
            .and_then(Value::as_str)
            .unwrap_or("");
        let content = if !title.is_empty() && !parent.is_empty() && !area.is_empty() {
            format!("i18n.live.event.room_change.full:{title}({parent}/{area})")
        } else if !title.is_empty() {
            format!("i18n.live.event.room_change.title:{title}")
        } else {
            "i18n.live.event.room_change".to_string()
        };
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "live_state",
                "time": ctx.time,
                "sender": "system",
                "content": content,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "GUARD_HONOR_THOUSAND" {
        let add_count = payload
            .get("data")
            .and_then(|value| value.get("add"))
            .and_then(Value::as_array)
            .map(|list| list.len())
            .unwrap_or(0);
        let del_count = payload
            .get("data")
            .and_then(|value| value.get("del"))
            .and_then(Value::as_array)
            .map(|list| list.len())
            .unwrap_or(0);
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "live_state",
                "time": ctx.time,
                "sender": "system",
                "content": format!("i18n.live.event.guard_honor_update:+{add_count}/-{del_count}"),
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "LIVE" {
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "live_state",
                "time": ctx.time,
                "sender": "system",
                "content": "i18n.live.event.live_started",
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    if ctx.cmd == "PREPARING" {
        let is_round = payload.get("round").and_then(parse_i64).unwrap_or(0) == 1;
        let content = if is_round {
            "i18n.live.event.preparing_round"
        } else {
            "i18n.live.event.preparing"
        };
        return Some((
            Some(json!({
                "id": ctx.id,
                "type": "live_state",
                "time": ctx.time,
                "sender": "system",
                "content": content,
                "cmd": ctx.cmd,
            })),
            None,
        ));
    }

    None
}

