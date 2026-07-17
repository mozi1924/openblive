use super::common::{
    cookie_diagnostics, current_timestamp_millis, error_message, fill_profile_from_full,
    has_session_cookie, is_auth_invalid_code, normalize_live_status, RefreshCookieResult,
    AUTH_FAIL_COOLDOWN_SECS, AUTH_INVALID_THRESHOLD, COOKIE_REFRESH_PUBLIC_KEY,
    COOKIE_REFRESH_SOURCE,
};
use crate::avatar::refresh_avatar_cache;
use crate::client::parse_cookie_value;
use crate::config::save_config;
use crate::endpoints;
use crate::live_status::is_live_or_round_status;
use crate::models::UserRecord;
use crate::state::{restore_session_from_current, AppState};
use rand::rngs::OsRng;
use rsa::{pkcs8::DecodePublicKey, Oaep, RsaPublicKey};
use serde_json::json;
use sha2::Sha256;
use std::collections::BTreeMap;

async fn reconcile_accounts_live_status_batch(state: &AppState) -> serde_json::Value {
    let uid_list = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .users
            .keys()
            .filter_map(|uid| uid.parse::<u64>().ok())
            .map(|uid| uid.to_string())
            .collect::<Vec<_>>()
    };
    if uid_list.is_empty() {
        return json!({
            "requested": 0,
            "updated": 0,
            "missing": 0
        });
    }

    let mut params: Vec<(&str, String)> = Vec::with_capacity(uid_list.len());
    for uid in &uid_list {
        params.push(("uids[]", uid.clone()));
    }

    let value = match state
        .client
        .get_json(
            &endpoints::live_api("/room/v1/Room/get_status_info_by_uids"),
            &params,
        )
        .await
    {
        Ok(value) => value,
        Err(error) => {
            return json!({
                "requested": uid_list.len(),
                "updated": 0,
                "missing": uid_list.len(),
                "error": error.to_string(),
            });
        }
    };

    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return json!({
            "requested": uid_list.len(),
            "updated": 0,
            "missing": uid_list.len(),
            "error": error_message(&value, "batch_live_status_failed"),
            "code": code
        });
    }

    let data = value["data"].as_object().cloned().unwrap_or_default();
    let requested = uid_list.len();
    let mut runtime = state.runtime.lock().await;
    let current_uid = runtime.config.current_uid.clone();
    let mut updated = 0usize;
    let mut missing = 0usize;
    let mut changed = false;

    for uid in uid_list {
        let Some(item) = data.get(&uid) else {
            missing += 1;
            continue;
        };
        let mut user_changed = false;
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            if let Some(room_id) = item["room_id"].as_i64() {
                let room_id_text = room_id.to_string();
                if user.room_id != room_id_text {
                    user.room_id = room_id_text;
                    user_changed = true;
                }
            }
        }

        if current_uid.as_deref() == Some(uid.as_str()) {
            let status = normalize_live_status(item["live_status"].as_i64().unwrap_or(0));
            if runtime.session.live_status != Some(status) {
                runtime.session.live_status = Some(status);
                user_changed = true;
            }
            let is_live = is_live_or_round_status(status);
            if runtime.session.is_live != is_live {
                runtime.session.is_live = is_live;
                user_changed = true;
            }
            let live_time = item["live_time"]
                .as_i64()
                .filter(|value| *value > 0)
                .map(|value| value.to_string())
                .unwrap_or_default();
            if runtime.session.live_time != live_time {
                runtime.session.live_time = live_time;
                user_changed = true;
            }
            if !is_live
                && (runtime.session.live_key.is_some() || runtime.session.sub_session_key.is_some())
            {
                runtime.session.live_key = None;
                runtime.session.sub_session_key = None;
                if let Some(user) = runtime.config.users.get_mut(&uid) {
                    user.live_key = None;
                    user.sub_session_key = None;
                }
                user_changed = true;
            }
        }

        if user_changed {
            updated += 1;
            changed = true;
        }
    }

    if changed {
        save_config(&state.config_path, &runtime.config, &state.master_key);
    }

    json!({
        "requested": requested,
        "updated": updated,
        "missing": missing
    })
}

fn extract_refresh_csrf(html: &str) -> Option<String> {
    let marker = "id=\"1-name\">";
    let start = html.find(marker)? + marker.len();
    let rest = &html[start..];
    let end = rest.find("</div>")?;
    let token = rest[..end].trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

fn build_correspond_path(timestamp: i64) -> Result<String, String> {
    let public_key = RsaPublicKey::from_public_key_pem(COOKIE_REFRESH_PUBLIC_KEY)
        .map_err(|error| format!("i18n.account.error.load_refresh_pubkey_failed: {error}"))?;
    let payload = format!("refresh_{timestamp}");
    let encrypted = public_key
        .encrypt(&mut OsRng, Oaep::new::<Sha256>(), payload.as_bytes())
        .map_err(|error| format!("i18n.account.error.build_correspond_path_failed: {error}"))?;
    Ok(hex::encode(encrypted))
}

async fn refresh_cookie_with_official_flow(
    user: &mut UserRecord,
    state: &AppState,
    timestamp: i64,
) -> Result<(), String> {
    crate::runtime_log!(
        "[auth][refresh] uid={} start refresh flow, refresh_token_len={}, {}",
        user.uid,
        user.refresh_token.len(),
        cookie_diagnostics(&user.cookie)
    );
    if user.refresh_token.is_empty() {
        return Err("i18n.account.error.cookie_refresh_token_missing".into());
    }

    let csrf = parse_cookie_value(&user.cookie, "bili_jct")
        .or_else(|| {
            if user.csrf.trim().is_empty() {
                None
            } else {
                Some(user.csrf.clone())
            }
        })
        .ok_or_else(|| "i18n.account.error.cookie_csrf_missing".to_string())?;

    let ts = if timestamp > 0 {
        timestamp
    } else {
        current_timestamp_millis()
    };
    crate::runtime_log!("[auth][refresh] uid={} use timestamp={ts}", user.uid);
    let correspond_path = build_correspond_path(ts)?;
    let correspond_url = format!("{}/correspond/1/{}", endpoints::www(""), correspond_path);

    let correspond_response = state
        .client
        .http
        .get(&correspond_url)
        .header("user-agent", endpoints::http_user_agent())
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !correspond_response.status().is_success() {
        return Err(format!(
            "i18n.account.error.fetch_refresh_csrf_http_failed:{}",
            correspond_response.status()
        ));
    }
    crate::runtime_log!(
        "[auth][refresh] uid={} correspond ok, status={}",
        user.uid,
        correspond_response.status()
    );
    let html = correspond_response
        .text()
        .await
        .map_err(|error| error.to_string())?;
    let refresh_csrf = extract_refresh_csrf(&html)
        .ok_or_else(|| "i18n.account.error.refresh_csrf_token_missing".to_string())?;
    crate::runtime_log!(
        "[auth][refresh] uid={} refresh_csrf extracted len={}",
        user.uid,
        refresh_csrf.len()
    );

    let old_refresh_token = user.refresh_token.clone();
    let mut refresh_form = BTreeMap::new();
    refresh_form.insert("csrf".to_string(), csrf);
    refresh_form.insert("refresh_csrf".to_string(), refresh_csrf);
    refresh_form.insert("source".to_string(), COOKIE_REFRESH_SOURCE.to_string());
    refresh_form.insert("refresh_token".to_string(), old_refresh_token.clone());

    let refresh_value = state
        .client
        .post_form(
            &endpoints::passport("/x/passport-login/web/cookie/refresh"),
            &refresh_form,
        )
        .await
        .map_err(|error| error.to_string())?;
    crate::runtime_log!(
        "[auth][refresh] uid={} cookie/refresh response code={}, message={}",
        user.uid,
        refresh_value["code"].as_i64().unwrap_or(-1),
        error_message(&refresh_value, "")
    );
    if refresh_value["code"].as_i64().unwrap_or(-1) != 0 {
        let code = refresh_value["code"].as_i64().unwrap_or(-1);
        return Err(format!(
            "i18n.account.error.cookie_refresh_failed({code}): {}",
            error_message(&refresh_value, "unknown error")
        ));
    }

    if let Some(next_token) = refresh_value["data"]["refresh_token"].as_str() {
        if !next_token.trim().is_empty() {
            user.refresh_token = next_token.to_string();
        }
    }

    let cookie_header = state.client.cookie_header_for(&endpoints::api_origin());
    if !cookie_header.is_empty() {
        user.cookie = cookie_header;
    }
    if let Some(next_csrf) = parse_cookie_value(&user.cookie, "bili_jct") {
        user.csrf = next_csrf;
    }
    crate::runtime_log!(
        "[auth][refresh] uid={} cookie updated after refresh, {}",
        user.uid,
        cookie_diagnostics(&user.cookie)
    );

    let confirm_csrf = parse_cookie_value(&user.cookie, "bili_jct")
        .or_else(|| {
            if user.csrf.trim().is_empty() {
                None
            } else {
                Some(user.csrf.clone())
            }
        })
        .ok_or_else(|| "i18n.account.error.cookie_refresh_confirm_csrf_missing".to_string())?;
    let mut confirm_form = BTreeMap::new();
    confirm_form.insert("csrf".to_string(), confirm_csrf);
    confirm_form.insert("refresh_token".to_string(), old_refresh_token);

    let confirm_value = state
        .client
        .post_form(
            &endpoints::passport("/x/passport-login/web/confirm/refresh"),
            &confirm_form,
        )
        .await
        .map_err(|error| error.to_string())?;
    crate::runtime_log!(
        "[auth][refresh] uid={} confirm/refresh response code={}, message={}",
        user.uid,
        confirm_value["code"].as_i64().unwrap_or(-1),
        error_message(&confirm_value, "")
    );
    if confirm_value["code"].as_i64().unwrap_or(-1) != 0 {
        let code = confirm_value["code"].as_i64().unwrap_or(-1);
        return Err(format!(
            "i18n.account.error.cookie_refresh_confirm_failed({code}): {}",
            error_message(&confirm_value, "unknown error")
        ));
    }

    crate::runtime_log!(
        "[auth][refresh] uid={} refresh flow done, refresh_token_len={}",
        user.uid,
        user.refresh_token.len()
    );
    Ok(())
}

async fn mark_user_login_invalid(uid: &str, state: &AppState, invalid: bool) {
    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(uid) {
        user.login_invalid = invalid;
        if invalid {
            user.auth_fail_count = AUTH_INVALID_THRESHOLD;
        } else {
            user.auth_fail_count = 0;
            user.last_auth_fail_at = 0;
        }
    }
    if invalid && runtime.config.current_uid.as_deref() == Some(uid) {
        if let Some(task) = runtime.danmu_task.take() {
            task.abort();
        }
        runtime.session = Default::default();
    }
    if !invalid && runtime.config.current_uid.as_deref() == Some(uid) {
        restore_session_from_current(&mut runtime, &state.client);
    }
}

async fn bump_user_auth_fail_count(uid: &str, state: &AppState) -> u32 {
    let mut runtime = state.runtime.lock().await;
    let Some(user) = runtime.config.users.get_mut(uid) else {
        return 0;
    };
    let now = chrono::Utc::now().timestamp();
    if user.last_auth_fail_at > 0 && now - user.last_auth_fail_at < AUTH_FAIL_COOLDOWN_SECS {
        crate::runtime_log!(
            "[auth][check] uid={} auth_fail_count keep={} (within cooldown {}s)",
            uid,
            user.auth_fail_count,
            AUTH_FAIL_COOLDOWN_SECS
        );
        return user.auth_fail_count;
    }
    user.last_auth_fail_at = now;
    user.auth_fail_count = user.auth_fail_count.saturating_add(1);
    crate::runtime_log!(
        "[auth][check] uid={} auth_fail_count={}",
        uid,
        user.auth_fail_count
    );
    user.auth_fail_count
}

async fn clear_user_login_invalid_flag(uid: &str, state: &AppState) {
    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(uid) {
        user.login_invalid = false;
    }
}

pub(super) async fn refresh_cookie_for_uid(
    uid: &str,
    state: &AppState,
    refresh_profile: bool,
) -> RefreshCookieResult {
    let user = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.get(uid).cloned()
    };
    let Some(mut user) = user else {
        return RefreshCookieResult::Missing;
    };
    if user.cookie.trim().is_empty() {
        crate::runtime_log!(
            "[auth][check] uid={} local cookie missing, skip remote check",
            uid
        );
        return RefreshCookieResult::Failed("i18n.account.error.local_credential_empty".into());
    }
    crate::runtime_log!(
        "[auth][check] uid={} begin refresh_profile={}, refresh_token_len={}, {}",
        uid,
        refresh_profile,
        user.refresh_token.len(),
        cookie_diagnostics(&user.cookie)
    );

    state.client.apply_cookie_header(&user.cookie);

    let csrf = parse_cookie_value(&user.cookie, "bili_jct").unwrap_or_default();
    let mut info_params: Vec<(&str, String)> = Vec::new();
    if !csrf.is_empty() {
        info_params.push(("csrf", csrf));
    }

    let info = match state
        .client
        .get_json(
            &endpoints::passport("/x/passport-login/web/cookie/info"),
            &info_params,
        )
        .await
    {
        Ok(value) => value,
        Err(error) => {
            crate::runtime_log!(
                "[auth][check] uid={} cookie/info request error: {}",
                uid,
                error
            );
            return RefreshCookieResult::Failed(error.to_string());
        }
    };
    crate::runtime_log!(
        "[auth][check] uid={} cookie/info code={}, refresh={}, timestamp={}",
        uid,
        info["code"].as_i64().unwrap_or(-1),
        info["data"]["refresh"].as_bool().unwrap_or(false),
        info["data"]["timestamp"].as_i64().unwrap_or(0)
    );

    if info["code"].as_i64().unwrap_or(-1) != 0 {
        let code = info["code"].as_i64().unwrap_or(-1);
        let msg = info["message"]
            .as_str()
            .unwrap_or("i18n.account.error.cookie_status_check_failed");
        crate::runtime_log!(
            "[auth][check] cookie/info failed for uid {uid}: code={code}, msg={msg}, {}",
            cookie_diagnostics(&user.cookie)
        );
        if is_auth_invalid_code(code) {
            let fail_count = bump_user_auth_fail_count(uid, state).await;
            if fail_count < AUTH_INVALID_THRESHOLD {
                clear_user_login_invalid_flag(uid, state).await;
                return RefreshCookieResult::Failed(format!(
                    "i18n.account.error.login_verify_failed({code}): {msg},attempt={fail_count}/{AUTH_INVALID_THRESHOLD}"
                ));
            }

            if !has_session_cookie(&user.cookie) {
                mark_user_login_invalid(uid, state, true).await;
                return RefreshCookieResult::Invalid(
                    "i18n.account.error.cookie_sessdata_missing".into(),
                );
            }
            mark_user_login_invalid(uid, state, true).await;
            return RefreshCookieResult::Invalid(msg.to_string());
        }

        return RefreshCookieResult::Failed(msg.to_string());
    }

    if info["data"]["refresh"].as_bool().unwrap_or(false) {
        let timestamp = info["data"]["timestamp"]
            .as_i64()
            .unwrap_or_else(current_timestamp_millis);
        if let Err(error) = refresh_cookie_with_official_flow(&mut user, state, timestamp).await {
            let fail_count = bump_user_auth_fail_count(uid, state).await;
            clear_user_login_invalid_flag(uid, state).await;
            crate::runtime_log!(
                "[auth][refresh] uid={} refresh required but failed: {}",
                uid,
                error
            );
            return RefreshCookieResult::Failed(format!(
                "i18n.account.error.cookie_refresh_retry_failed:attempt={fail_count}/{AUTH_INVALID_THRESHOLD}:{error}"
            ));
        }
        state.client.apply_cookie_header(&user.cookie);
    }

    if !refresh_profile {
        user.login_invalid = false;
        user.auth_fail_count = 0;
        user.last_auth_fail_at = 0;
        let mut runtime = state.runtime.lock().await;
        runtime.config.users.insert(uid.to_string(), user.clone());
        if runtime.config.current_uid.as_deref() == Some(uid) {
            restore_session_from_current(&mut runtime, &state.client);
        }
        return RefreshCookieResult::Updated(Box::new(user));
    }

    let nav = match state
        .client
        .get_json(&endpoints::api("/x/web-interface/nav"), &[])
        .await
    {
        Ok(value) => value,
        Err(error) => {
            crate::runtime_warn!("[auth][check] uid={} nav request error: {}", uid, error);
            return RefreshCookieResult::Failed(error.to_string());
        }
    };
    crate::runtime_log!(
        "[auth][check] uid={} nav code={}",
        uid,
        nav["code"].as_i64().unwrap_or(-1)
    );

    if nav["code"].as_i64().unwrap_or(-1) != 0 {
        let code = nav["code"].as_i64().unwrap_or(-1);
        let msg = nav["message"]
            .as_str()
            .unwrap_or("i18n.account.error.fetch_user_info_failed");
        crate::runtime_log!(
            "[auth][check] nav failed for uid {uid}: code={code}, msg={msg}, {}",
            cookie_diagnostics(&user.cookie)
        );
        if is_auth_invalid_code(code) {
            let fail_count = bump_user_auth_fail_count(uid, state).await;
            if fail_count < AUTH_INVALID_THRESHOLD {
                clear_user_login_invalid_flag(uid, state).await;
                return RefreshCookieResult::Failed(format!(
                    "i18n.account.error.login_verify_failed({code}): {msg},attempt={fail_count}/{AUTH_INVALID_THRESHOLD}"
                ));
            }

            if !has_session_cookie(&user.cookie) {
                mark_user_login_invalid(uid, state, true).await;
                return RefreshCookieResult::Invalid(
                    "i18n.account.error.cookie_sessdata_missing".into(),
                );
            }
            mark_user_login_invalid(uid, state, true).await;
            return RefreshCookieResult::Invalid(msg.to_string());
        }

        return RefreshCookieResult::Failed(msg.to_string());
    }

    let stat = match state
        .client
        .get_json(&endpoints::api("/x/web-interface/nav/stat"), &[])
        .await
    {
        Ok(value) => value,
        Err(error) => {
            crate::runtime_log!(
                "[auth][check] uid={} nav/stat request error: {}",
                uid,
                error
            );
            json!({ "data": {} })
        }
    };

    let mut full = nav["data"].clone();
    full["stat"] = stat["data"].clone();

    let cookie_header = state.client.cookie_header_for(&endpoints::api_origin());
    if !cookie_header.is_empty() {
        user.cookie = cookie_header;
    }
    if let Some(csrf) = parse_cookie_value(&user.cookie, "bili_jct") {
        user.csrf = csrf;
    }
    fill_profile_from_full(&mut user, &full);
    user.login_invalid = false;
    user.auth_fail_count = 0;
    user.last_auth_fail_at = 0;

    if let Err(error) =
        refresh_avatar_cache(&state.client, &state.config_path, uid, &user.face).await
    {
        crate::runtime_log!(
            "[auth][check] uid={} avatar cache refresh failed: {}",
            uid,
            error
        );
    }

    let mut runtime = state.runtime.lock().await;
    runtime.config.users.insert(uid.to_string(), user.clone());
    if runtime.config.current_uid.as_deref() == Some(uid) {
        restore_session_from_current(&mut runtime, &state.client);
    }

    RefreshCookieResult::Updated(Box::new(user))
}

pub(super) async fn refresh_accounts_batch(
    app: &tauri::AppHandle,
    state: &AppState,
    refresh_profile: bool,
) -> serde_json::Value {
    let uids = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.keys().cloned().collect::<Vec<_>>()
    };

    let mut updated = 0;
    let mut failed: Vec<String> = Vec::new();
    let mut expired: Vec<String> = Vec::new();
    let mode = if refresh_profile { "profile" } else { "cookie" };
    crate::runtime_log!("[auth][batch][{mode}] begin total={}", uids.len());
    for uid in uids {
        crate::runtime_log!("[auth][batch][{mode}] checking uid={}", uid);
        match refresh_cookie_for_uid(&uid, state, refresh_profile).await {
            RefreshCookieResult::Updated(_) => {
                updated += 1;
                crate::runtime_log!("[auth][batch][{mode}] uid={} updated", uid);
            }
            RefreshCookieResult::Missing => {}
            RefreshCookieResult::Invalid(msg) => {
                expired.push(uid.clone());
                failed.push(format!("{uid}: {msg}"));
                crate::runtime_warn!("[auth][batch][{mode}] uid={} invalid: {}", uid, msg);
            }
            RefreshCookieResult::Failed(error) => {
                failed.push(format!("{uid}: {error}"));
                crate::runtime_warn!("[auth][batch][{mode}] uid={} failed: {}", uid, error);
            }
        }
    }
    crate::runtime_log!(
        "[auth][batch][{mode}] done updated={}, expired={}, failed={}",
        updated,
        expired.len(),
        failed.len()
    );

    let mut runtime = state.runtime.lock().await;
    let current_uid = runtime.config.current_uid.clone();
    let current_is_valid = current_uid
        .as_ref()
        .and_then(|uid| runtime.config.users.get(uid))
        .map(|user| !user.login_invalid)
        .unwrap_or(false);
    if current_is_valid {
        restore_session_from_current(&mut runtime, &state.client);
    } else if current_uid.is_some() {
        if let Some(task) = runtime.danmu_task.take() {
            task.abort();
        }
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);

    crate::state_event::emit_accounts_changed(app, "account.refresh_batch");

    let status_reconcile = if refresh_profile {
        let value = reconcile_accounts_live_status_batch(state).await;
        crate::runtime_log!("[auth][batch][profile] live status reconcile: {}", value);
        Some(value)
    } else {
        None
    };
    json!({
        "updated": updated,
        "failed": failed,
        "expired": expired,
        "status_reconcile": status_reconcile
    })
}

pub(super) async fn refresh_all_account_profiles_inner(
    app: &tauri::AppHandle,
    state: &AppState,
) -> serde_json::Value {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    refresh_accounts_batch(app, state, true).await
}
