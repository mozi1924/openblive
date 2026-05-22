pub use super::parser_helpers::{build_parse_failed_system_message, is_supported_cmd};
use super::parser_helpers::{next_msg_id, now_hms};
use serde_json::Value;

mod danmu_msg;
mod entry_effect;
mod gifts;
mod interact;
mod live_state;
mod moderation;
mod recall;
mod reenter;
mod superchat;

pub(super) type ParseResult = (Option<Value>, Option<u64>);

pub(super) struct ParseContext<'a> {
    pub id: &'a str,
    pub time: &'a str,
    pub cmd: &'a str,
}

pub fn parse_danmu_message(payload: &Value) -> ParseResult {
    let cmd = payload["cmd"].as_str().unwrap_or("UNKNOWN");
    let id = next_msg_id();
    let time = now_hms();
    let ctx = ParseContext {
        id: &id,
        time: &time,
        cmd,
    };

    if let Some(result) = danmu_msg::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = interact::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = gifts::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = superchat::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = moderation::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = entry_effect::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = live_state::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = recall::parse(payload, &ctx) {
        return result;
    }

    if let Some(result) = reenter::parse(payload, &ctx) {
        return result;
    }

    (None, None)
}

#[cfg(test)]
mod tests {
    use super::parse_danmu_message;
    use serde_json::json;

    #[test]
    fn parse_danmu_message_extracts_emoticon_payload() {
        let payload = json!({
            "cmd": "DANMU_MSG",
            "info": [
                [
                    0, 1, 25, 16777215, 1710000000000_i64, 123456_i64, 0, "abc", 0, 0, 0, "", 1,
                    {
                        "emoticon_unique": "official_120",
                        "height": 60,
                        "is_dynamic": 1,
                        "url": "http://i0.hdslb.com/bfs/live/test.png",
                        "width": 159
                    },
                    "{}",
                    {
                        "extra": "{\"dm_type\":1,\"emoticon_unique\":\"official_120\",\"id_str\":\"abc\"}"
                    }
                ],
                "离谱",
                [1741226472, "测试用户", 0, 0, 0, 10000, 1, ""],
                []
            ]
        });

        let (message, _) = parse_danmu_message(&payload);
        let message = message.expect("message should be parsed");
        assert_eq!(
            message.get("content_type").and_then(|value| value.as_i64()),
            Some(1)
        );
        assert_eq!(
            message
                .get("emoticon")
                .and_then(|value| value.get("url"))
                .and_then(|value| value.as_str()),
            Some("https://i0.hdslb.com/bfs/live/test.png")
        );
    }
}
