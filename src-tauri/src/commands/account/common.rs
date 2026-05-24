use crate::client::parse_cookie_value;
pub(super) use crate::live_status::normalize_live_status;
use crate::models::UserRecord;
use serde_json::Value;

pub(super) const AUTH_INVALID_THRESHOLD: u32 = 3;
pub(super) const AUTH_FAIL_COOLDOWN_SECS: i64 = 30;
pub(super) const COOKIE_REFRESH_SOURCE: &str = "main_web";
pub(super) const COOKIE_REFRESH_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----";

pub(super) fn is_auth_invalid_code(code: i64) -> bool {
    matches!(code, -101 | 3 | 65530)
}

pub(super) fn fill_profile_from_full(user: &mut UserRecord, full: &Value) {
    user.uname = full["uname"]
        .as_str()
        .unwrap_or("i18n.account.user.unknown_name")
        .to_string();
    user.face = full["face"].as_str().unwrap_or("").to_string();
    user.level = full["level_info"]["current_level"].as_i64().unwrap_or(0);
    user.current_exp = full["level_info"]["current_exp"].as_i64().unwrap_or(0);
    user.next_exp = full["level_info"]["next_exp"].as_i64().unwrap_or(0);
    user.money = full["money"].as_f64().unwrap_or(0.0);
    user.bcoin = full["wallet"]["bcoin_balance"].as_f64().unwrap_or(0.0);
    user.following = full["stat"]["following"].as_i64().unwrap_or(0);
    user.follower = full["stat"]["follower"].as_i64().unwrap_or(0);
    user.dynamic_count = full["stat"]["dynamic_count"].as_i64().unwrap_or(0);
}

pub(super) enum RefreshCookieResult {
    Updated(Box<UserRecord>),
    Missing,
    Invalid(String),
    Failed(String),
}

pub(super) fn current_timestamp_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub(super) fn error_message(value: &Value, fallback: &str) -> String {
    value["msg"]
        .as_str()
        .filter(|msg| !msg.trim().is_empty())
        .or_else(|| {
            value["message"]
                .as_str()
                .filter(|msg| !msg.trim().is_empty())
        })
        .unwrap_or(fallback)
        .to_string()
}

pub(super) fn has_session_cookie(cookie_header: &str) -> bool {
    parse_cookie_value(cookie_header, "SESSDATA").is_some()
}

pub(super) fn cookie_diagnostics(cookie_header: &str) -> String {
    let has_sess = parse_cookie_value(cookie_header, "SESSDATA").is_some();
    let has_uid = parse_cookie_value(cookie_header, "DedeUserID").is_some();
    let has_csrf = parse_cookie_value(cookie_header, "bili_jct").is_some();
    let has_sid = parse_cookie_value(cookie_header, "sid").is_some();
    format!(
        "has_sess={has_sess}, has_uid={has_uid}, has_csrf={has_csrf}, has_sid={has_sid}, cookie_len={}",
        cookie_header.len()
    )
}
