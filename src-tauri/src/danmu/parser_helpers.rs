use serde_json::{json, Value};

pub fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

pub fn next_msg_id() -> String {
    format!(
        "{:x}{:08x}",
        chrono::Utc::now().timestamp_millis(),
        rand::random::<u32>()
    )
}

pub fn parse_dm_interaction_detail(payload: &Value) -> Option<Value> {
    let raw = payload
        .get("data")
        .and_then(|value| value.get("data"))
        .or_else(|| payload.get("data"))
        .or_else(|| payload.get("value"))?;

    if raw.is_object() || raw.is_array() {
        return Some(raw.clone());
    }
    raw.as_str()
        .and_then(|value| serde_json::from_str::<Value>(value).ok())
}

pub fn is_supported_cmd(cmd: &str) -> bool {
    cmd.starts_with("DANMU_MSG")
        || cmd == "SEND_GIFT"
        || cmd == "GUARD_BUY"
        || cmd == "INTERACT_WORD"
        || cmd == "INTERACT_WORD_V2"
        || cmd == "DM_INTERACTION"
        || cmd == "SUPER_CHAT_MESSAGE"
        || cmd == "SUPER_CHAT_MESSAGE_JPN"
        || cmd == "SUPER_CHAT_MESSAGE_DELETE"
        || cmd == "WARNING"
        || cmd == "CUT_OFF"
        || cmd == "CUT_OFF_V2"
        || cmd == "ROOM_BLOCK_MSG"
        || cmd == "ROOM_SILENT_ON"
        || cmd == "ROOM_SILENT_OFF"
        || cmd == "ENTRY_EFFECT"
        || cmd == "ENTRY_EFFECT_MUST_RECEIVE"
        || cmd == "ROOM_CHANGE"
        || cmd == "GUARD_HONOR_THOUSAND"
        || cmd == "LIVE"
        || cmd == "PREPARING"
        || cmd == "RECALL_DANMU_MSG"
        || cmd == "REENTER_LIVE_ROOM"
}

pub fn build_parse_failed_system_message(cmd: &str) -> Value {
    json!({
        "id": next_msg_id(),
        "type": "system",
        "time": now_hms(),
        "sender": "system",
        "content": format!("i18n.live.event.parse_failed({cmd})"),
        "cmd": cmd,
    })
}
