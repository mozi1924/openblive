use crate::models::SessionState;
use crate::state::RuntimeState;

pub(crate) const LIVE_STATUS_OFFLINE: i64 = 0;
pub(crate) const LIVE_STATUS_LIVE: i64 = 1;
pub(crate) const LIVE_STATUS_ROUND: i64 = 2;

pub(crate) fn current_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn normalize_live_status(status: i64) -> i64 {
    match status {
        LIVE_STATUS_LIVE => LIVE_STATUS_LIVE,
        LIVE_STATUS_ROUND => LIVE_STATUS_ROUND,
        _ => LIVE_STATUS_OFFLINE,
    }
}

fn room_live_state(status: i64) -> bool {
    matches!(
        normalize_live_status(status),
        LIVE_STATUS_LIVE | LIVE_STATUS_ROUND
    )
}

fn normalize_session_token(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .map(|token| token.to_string())
}

pub(crate) fn apply_live_session_identity(
    session: &mut SessionState,
    live_key: Option<&str>,
    sub_session_key: Option<&str>,
) {
    session.live_key = normalize_session_token(live_key);
    session.sub_session_key = normalize_session_token(sub_session_key);
}

pub(crate) fn clear_live_session_identity(session: &mut SessionState) {
    session.live_key = None;
    session.sub_session_key = None;
}

pub(crate) fn mark_session_sync_state(
    session: &mut SessionState,
    from_cache: bool,
    error_code: Option<&str>,
) {
    session.from_cache = from_cache;
    session.last_sync_at = Some(current_timestamp());
    session.error_code = error_code.map(|value| value.to_string());
}

pub(crate) fn apply_room_status_to_session(
    session: &mut SessionState,
    room_info: &serde_json::Value,
) {
    let live_status = normalize_live_status(room_info["live_status"].as_i64().unwrap_or(0));
    session.live_status = Some(live_status);
    session.is_live = room_live_state(live_status);
    session.live_time = room_info["live_time"].as_str().unwrap_or("").to_string();
    if !session.is_live {
        clear_live_session_identity(session);
    }

    if let Some(room_id) = room_info["room_id"].as_i64() {
        session.room_id = room_id.to_string();
    }
}

pub(crate) fn apply_room_area_to_session(
    session: &mut SessionState,
    room_info: &serde_json::Value,
) {
    let parent = room_info["parent_area_name"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let child = room_info["area_name"].as_str().unwrap_or("").to_string();
    if !parent.is_empty() && !child.is_empty() {
        session.current_area_names = vec![parent, child];
    }
    if let Some(area_id) = room_info["area_id"].as_u64() {
        session.current_area_id = Some(area_id);
    }
}

pub(crate) fn resolve_current_auth_context(
    runtime: &RuntimeState,
) -> Result<(String, String, String, String), String> {
    let uid = runtime
        .config
        .current_uid
        .clone()
        .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;
    let user = runtime
        .config
        .users
        .get(&uid)
        .ok_or_else(|| "i18n.common.not_logged_in".to_string())?;

    let room_id = if user.room_id.trim().is_empty() {
        runtime.session.room_id.clone()
    } else {
        user.room_id.clone()
    };
    let csrf = if user.csrf.trim().is_empty() {
        runtime.session.csrf.clone()
    } else {
        user.csrf.clone()
    };
    Ok((uid, room_id, csrf, user.cookie.clone()))
}
