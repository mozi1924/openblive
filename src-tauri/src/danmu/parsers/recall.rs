use super::{ParseContext, ParseResult};
use crate::danmu::helpers::{parse_i64, parse_string};
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd != "RECALL_DANMU_MSG" {
        return None;
    }

    let recall_target_id = payload
        .get("data")
        .and_then(|value| value.get("target_id"))
        .and_then(parse_i64)
        .map(|value| value.to_string())
        .or_else(|| {
            payload
                .get("data")
                .and_then(|value| value.get("target_id"))
                .and_then(parse_string)
        });
    let recall_type = payload
        .get("data")
        .and_then(|value| value.get("recall_type"))
        .and_then(parse_i64)
        .unwrap_or(0);
    Some((
        Some(json!({
            "id": ctx.id,
            "type": "recall",
            "time": ctx.time,
            "sender": "system",
            "content": "i18n.live.event.danmu_recalled",
            "recall_target_id": recall_target_id,
            "recall_type": recall_type,
            "cmd": ctx.cmd,
        })),
        None,
    ))
}
