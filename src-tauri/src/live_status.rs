// Live status constants defined by Bilibili live streaming protocol.
// MUST be kept synchronized with frontend src/utils/liveStatus.ts.
pub const LIVE_STATUS_OFFLINE: i64 = 0;
pub const LIVE_STATUS_LIVE: i64 = 1;
pub const LIVE_STATUS_ROUND: i64 = 2;

pub fn normalize_live_status(status: i64) -> i64 {
    match status {
        LIVE_STATUS_LIVE => LIVE_STATUS_LIVE,
        LIVE_STATUS_ROUND => LIVE_STATUS_ROUND,
        _ => LIVE_STATUS_OFFLINE,
    }
}

pub fn is_live_or_round_status(status: i64) -> bool {
    matches!(
        normalize_live_status(status),
        LIVE_STATUS_LIVE | LIVE_STATUS_ROUND
    )
}

pub fn resolve_live_status(status: Option<i64>, is_live: bool) -> i64 {
    if let Some(value) = status {
        return normalize_live_status(value);
    }
    if is_live {
        LIVE_STATUS_LIVE
    } else {
        LIVE_STATUS_OFFLINE
    }
}

#[cfg(test)]
mod tests {
    use super::{
        is_live_or_round_status, normalize_live_status, resolve_live_status, LIVE_STATUS_LIVE,
        LIVE_STATUS_OFFLINE, LIVE_STATUS_ROUND,
    };

    #[test]
    fn normalize_status_keeps_live_and_round_only() {
        assert_eq!(normalize_live_status(LIVE_STATUS_LIVE), LIVE_STATUS_LIVE);
        assert_eq!(normalize_live_status(LIVE_STATUS_ROUND), LIVE_STATUS_ROUND);
        assert_eq!(normalize_live_status(99), LIVE_STATUS_OFFLINE);
        assert_eq!(normalize_live_status(-1), LIVE_STATUS_OFFLINE);
    }

    #[test]
    fn online_state_includes_round_play() {
        assert!(is_live_or_round_status(LIVE_STATUS_LIVE));
        assert!(is_live_or_round_status(LIVE_STATUS_ROUND));
        assert!(!is_live_or_round_status(LIVE_STATUS_OFFLINE));
    }

    #[test]
    fn resolve_status_prefers_status_field_then_bool_fallback() {
        assert_eq!(
            resolve_live_status(Some(LIVE_STATUS_ROUND), false),
            LIVE_STATUS_ROUND
        );
        assert_eq!(resolve_live_status(Some(12345), true), LIVE_STATUS_OFFLINE);
        assert_eq!(resolve_live_status(None, true), LIVE_STATUS_LIVE);
        assert_eq!(resolve_live_status(None, false), LIVE_STATUS_OFFLINE);
    }
}
