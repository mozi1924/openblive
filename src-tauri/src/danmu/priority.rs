use serde_json::Value;
use crate::models::PersistConfig;
use crate::tts::TtsPriority;

pub fn resolve_tts_priority(config: &PersistConfig, message: &Value) -> TtsPriority {
    if !config.tts_priority_queue_enabled {
        return TtsPriority::Normal;
    }

    let msg_type = message.get("type").and_then(Value::as_str).unwrap_or_default();
    let sender_guard_level = message
        .get("sender_guard_level")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let sender_role = message
        .get("sender_role")
        .and_then(Value::as_str)
        .unwrap_or_default();

    match msg_type {
        "superchat" => {
            if config.tts_priority_superchat {
                return TtsPriority::High;
            }
        }
        "gift" => {
            if config.tts_priority_gift {
                return TtsPriority::High;
            }
        }
        "danmu" | "interact" => {
            if config.tts_priority_guard && (sender_guard_level > 0 || sender_role == "guard") {
                return TtsPriority::High;
            }
            if config.tts_priority_high_rank && sender_role == "admin" {
                return TtsPriority::High;
            }
        }
        _ => {}
    }

    TtsPriority::Normal
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_resolve_tts_priority() {
        let mut cfg = PersistConfig::default();
        cfg.tts_priority_queue_enabled = true;
        cfg.tts_priority_guard = true;
        cfg.tts_priority_gift = true;
        cfg.tts_priority_superchat = true;

        let sc_msg = json!({ "type": "superchat" });
        assert_eq!(resolve_tts_priority(&cfg, &sc_msg), TtsPriority::High);

        let gift_msg = json!({ "type": "gift" });
        assert_eq!(resolve_tts_priority(&cfg, &gift_msg), TtsPriority::High);

        let guard_msg = json!({ "type": "danmu", "sender_guard_level": 3 });
        assert_eq!(resolve_tts_priority(&cfg, &guard_msg), TtsPriority::High);

        let normal_msg = json!({ "type": "danmu", "sender_guard_level": 0, "sender_role": "viewer" });
        assert_eq!(resolve_tts_priority(&cfg, &normal_msg), TtsPriority::Normal);
    }
}
