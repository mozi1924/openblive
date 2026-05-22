use super::{ParseContext, ParseResult};
use rand::Rng;
use serde_json::{json, Value};

pub(super) fn parse(payload: &Value, ctx: &ParseContext<'_>) -> Option<ParseResult> {
    if ctx.cmd != "REENTER_LIVE_ROOM" {
        return None;
    }

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
    Some((
        Some(json!({
            "id": ctx.id,
            "type": "system",
            "time": ctx.time,
            "sender": "system",
            "content": format!("i18n.live.event.reenter_requested(reason={reason})"),
            "cmd": ctx.cmd,
        })),
        Some(delay_secs),
    ))
}

