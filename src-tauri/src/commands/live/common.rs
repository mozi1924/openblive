use crate::config::save_config;
use crate::models::UserRecord;
use crate::state::AppState;
use std::collections::BTreeMap;

const LIVE_PLATFORM_PC_LINK: &str = "pc_link";

pub(crate) fn is_auth_invalid_code(code: i64) -> bool {
    matches!(code, -101 | 3 | 65530)
}

pub(crate) fn error_message(value: &serde_json::Value, fallback: &str) -> String {
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

pub(crate) fn build_room_update_form(room_id: &str, csrf: &str) -> BTreeMap<String, String> {
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id.to_string());
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("csrf".into(), csrf.to_string());
    form.insert("csrf_token".into(), csrf.to_string());
    form
}

pub(crate) fn live_platform_pc_link() -> &'static str {
    LIVE_PLATFORM_PC_LINK
}

pub(crate) fn clear_user_auth_flags(user: &mut UserRecord) {
    user.login_invalid = false;
    user.auth_fail_count = 0;
    user.last_auth_fail_at = 0;
}

fn cookie_diagnostics(cookie_header: &str) -> String {
    let has_sess = crate::client::parse_cookie_value(cookie_header, "SESSDATA").is_some();
    let has_uid = crate::client::parse_cookie_value(cookie_header, "DedeUserID").is_some();
    let has_csrf = crate::client::parse_cookie_value(cookie_header, "bili_jct").is_some();
    format!(
        "has_sess={has_sess}, has_uid={has_uid}, has_csrf={has_csrf}, cookie_len={}",
        cookie_header.len()
    )
}

pub(crate) async fn mark_current_user_login_invalid(state: &AppState, reason: &str) {
    let mut runtime = state.runtime.lock().await;
    let Some(uid) = runtime.config.current_uid.clone() else {
        return;
    };
    let mut fail_count = 0u32;
    let mut cookie_diag = String::from("cookie=missing");
    let mut room_id = String::new();
    let mut csrf_len = 0usize;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        user.login_invalid = true;
        user.auth_fail_count = user.auth_fail_count.saturating_add(1);
        user.last_auth_fail_at = chrono::Utc::now().timestamp();
        fail_count = user.auth_fail_count;
        cookie_diag = cookie_diagnostics(&user.cookie);
        room_id = user.room_id.clone();
        csrf_len = user.csrf.len();
    }
    eprintln!(
        "[auth][live] mark login invalid uid={}, fail_count={}, room_id={}, csrf_len={}, reason={}, {}",
        uid, fail_count, room_id, csrf_len, reason, cookie_diag
    );
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    runtime.session = Default::default();
    save_config(&state.config_path, &runtime.config, &state.master_key);
}
