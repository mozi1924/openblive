use crate::avatar::{delete_avatar_cache, has_cached_face, refresh_avatar_cache, to_response_user};
use crate::bili::fetch_full_user_data;
use crate::client::parse_cookie_value;
use crate::commands::system::render_qr_data_url;
use crate::config::save_config;
use crate::constants::CmdResult;
use crate::endpoints;
use crate::models::{sync_live_profile_state_defaults, PollReq, UidReq, UserRecord};
use crate::response::wrap_ok;
use crate::state::{restore_session_from_current, AppState};
use rand::rngs::OsRng;
use rsa::{pkcs8::DecodePublicKey, Oaep, RsaPublicKey};
use serde_json::json;
use sha2::Sha256;
use std::collections::BTreeMap;
use tauri::State;

fn is_auth_invalid_code(code: i64) -> bool {
    matches!(code, -101 | 3 | 65530)
}

const AUTH_INVALID_THRESHOLD: u32 = 3;
const AUTH_FAIL_COOLDOWN_SECS: i64 = 30;
const COOKIE_REFRESH_SOURCE: &str = "main_web";
const COOKIE_REFRESH_PUBLIC_KEY: &str = "-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDLgd2OAkcGVtoE3ThUREbio0Eg
Uc/prcajMKXvkCKFCWhJYJcLkcM2DKKcSeFpD/j6Boy538YXnR6VhcuUJOhH2x71
nzPjfdTcqMz7djHum0qSZA0AyCBDABUqCrfNgCiJ00Ra7GmRj+YCK1NJEuewlb40
JNrRuoEUXpabUzGB8QIDAQAB
-----END PUBLIC KEY-----";

fn fill_profile_from_full(user: &mut UserRecord, full: &serde_json::Value) {
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

enum RefreshCookieResult {
    Updated(UserRecord),
    Missing,
    Invalid(String),
    Failed(String),
}

fn current_timestamp_millis() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn error_message(value: &serde_json::Value, fallback: &str) -> String {
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

fn has_session_cookie(cookie_header: &str) -> bool {
    parse_cookie_value(cookie_header, "SESSDATA").is_some()
}

fn cookie_diagnostics(cookie_header: &str) -> String {
    let has_sess = parse_cookie_value(cookie_header, "SESSDATA").is_some();
    let has_uid = parse_cookie_value(cookie_header, "DedeUserID").is_some();
    let has_csrf = parse_cookie_value(cookie_header, "bili_jct").is_some();
    let has_sid = parse_cookie_value(cookie_header, "sid").is_some();
    format!(
        "has_sess={has_sess}, has_uid={has_uid}, has_csrf={has_csrf}, has_sid={has_sid}, cookie_len={}",
        cookie_header.len()
    )
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
    eprintln!(
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
    eprintln!("[auth][refresh] uid={} use timestamp={ts}", user.uid);
    let correspond_path = build_correspond_path(ts)?;
    let correspond_url = format!("{}/correspond/1/{}", endpoints::www(""), correspond_path);

    let correspond_response = state
        .client
        .http
        .get(&correspond_url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !correspond_response.status().is_success() {
        return Err(format!(
            "i18n.account.error.fetch_refresh_csrf_http_failed:{}",
            correspond_response.status()
        ));
    }
    eprintln!(
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
    eprintln!(
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
    eprintln!(
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
    eprintln!(
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
    eprintln!(
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

    eprintln!(
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
        eprintln!(
            "[auth][check] uid={} auth_fail_count keep={} (within cooldown {}s)",
            uid, user.auth_fail_count, AUTH_FAIL_COOLDOWN_SECS
        );
        return user.auth_fail_count;
    }
    user.last_auth_fail_at = now;
    user.auth_fail_count = user.auth_fail_count.saturating_add(1);
    eprintln!(
        "[auth][check] uid={} auth_fail_count={}",
        uid, user.auth_fail_count
    );
    user.auth_fail_count
}

async fn clear_user_login_invalid_flag(uid: &str, state: &AppState) {
    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(uid) {
        user.login_invalid = false;
    }
}

async fn refresh_cookie_for_uid(
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
        eprintln!(
            "[auth][check] uid={} local cookie missing, skip remote check",
            uid
        );
        return RefreshCookieResult::Failed("i18n.account.error.local_credential_empty".into());
    }
    eprintln!(
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
            eprintln!(
                "[auth][check] uid={} cookie/info request error: {}",
                uid, error
            );
            return RefreshCookieResult::Failed(error.to_string());
        }
    };
    eprintln!(
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
        eprintln!(
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
            eprintln!(
                "[auth][refresh] uid={} refresh required but failed: {}",
                uid, error
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
        return RefreshCookieResult::Updated(user);
    }

    let nav = match state
        .client
        .get_json(&endpoints::api("/x/web-interface/nav"), &[])
        .await
    {
        Ok(value) => value,
        Err(error) => {
            eprintln!("[auth][check] uid={} nav request error: {}", uid, error);
            return RefreshCookieResult::Failed(error.to_string());
        }
    };
    eprintln!(
        "[auth][check] uid={} nav code={}",
        uid,
        nav["code"].as_i64().unwrap_or(-1)
    );

    if nav["code"].as_i64().unwrap_or(-1) != 0 {
        let code = nav["code"].as_i64().unwrap_or(-1);
        let msg = nav["message"]
            .as_str()
            .unwrap_or("i18n.account.error.fetch_user_info_failed");
        eprintln!(
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
            eprintln!(
                "[auth][check] uid={} nav/stat request error: {}",
                uid, error
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
        eprintln!(
            "[auth][check] uid={} avatar cache refresh failed: {}",
            uid, error
        );
    }

    let mut runtime = state.runtime.lock().await;
    runtime.config.users.insert(uid.to_string(), user.clone());
    if runtime.config.current_uid.as_deref() == Some(uid) {
        restore_session_from_current(&mut runtime, &state.client);
    }

    RefreshCookieResult::Updated(user)
}

#[tauri::command]
pub async fn get_login_qrcode(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            &endpoints::passport("/x/passport-login/web/qrcode/generate"),
            &[],
        )
        .await
        .map_err(|error| error.to_string())?;
    let qr_content = value["data"]["url"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let qrcode_key = value["data"]["qrcode_key"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let image_src = render_qr_data_url(&qr_content, Some(220), Some(2))?;
    Ok(wrap_ok(json!({
        "url": qr_content,
        "content": qr_content,
        "qrcode_key": qrcode_key,
        "image_src": image_src
    })))
}

#[tauri::command]
pub async fn poll_login_status(req: PollReq, state: State<'_, AppState>) -> CmdResult {
    let value: serde_json::Value = state
        .client
        .http
        .get(endpoints::passport("/x/passport-login/web/qrcode/poll"))
        .query(&[("qrcode_key", req.key)])
        .send()
        .await
        .map_err(|error| error.to_string())?
        .json()
        .await
        .map_err(|error| error.to_string())?;

    let code = value["data"]["code"].as_i64().unwrap_or(-1);
    eprintln!(
        "[auth][qrcode] poll status code={}, message={}",
        code,
        value["data"]["message"].as_str().unwrap_or("")
    );
    if code != 0 {
        return Ok(json!({
            "code": code,
            "msg": value["data"]["message"].as_str().unwrap_or("pending")
        }));
    }

    if let Some(auth_url) = value["data"]["url"].as_str().map(str::trim) {
        if !auth_url.is_empty() {
            let _ = state
                .client
                .http
                .get(auth_url)
                .send()
                .await
                .map_err(|error| error.to_string())?;
        }
    }

    let cookie_header = state.client.cookie_header_for(&endpoints::api_origin());
    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;
    let cookie_uid = parse_cookie_value(&cookie_header, "DedeUserID")
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let nav_uid = full["mid"].as_u64().unwrap_or(0);
    let uid = if nav_uid > 0 { nav_uid } else { cookie_uid };
    if cookie_uid > 0 && nav_uid > 0 && cookie_uid != nav_uid {
        eprintln!(
            "[auth][qrcode] uid mismatch, cookie_uid={}, nav_uid={}, {}",
            cookie_uid,
            nav_uid,
            cookie_diagnostics(&cookie_header)
        );
    }
    if uid == 0 {
        eprintln!(
            "[auth][qrcode] login success but uid missing, cookie_uid={}, nav_uid={}, {}",
            cookie_uid,
            nav_uid,
            cookie_diagnostics(&cookie_header)
        );
        return Err("i18n.account.error.login_uid_missing".into());
    }
    let csrf = parse_cookie_value(&cookie_header, "bili_jct").unwrap_or_default();
    let room = state
        .client
        .get_json(
            &endpoints::live_api("/room/v2/Room/room_id_by_uid"),
            &[("uid", uid.to_string())],
        )
        .await
        .map(|value| value["data"]["room_id"].as_i64().unwrap_or(0).to_string())
        .unwrap_or_default();
    let uid_str = uid.to_string();
    eprintln!(
        "[auth][qrcode] login success uid={}, room_id={}, {}",
        uid_str,
        room,
        cookie_diagnostics(&cookie_header)
    );

    let mut runtime = state.runtime.lock().await;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    let old = runtime
        .config
        .users
        .get(&uid_str)
        .cloned()
        .unwrap_or_default();
    let user = UserRecord {
        uid: uid_str.clone(),
        uname: String::new(),
        face: String::new(),
        cookie: cookie_header,
        enc_cookie: String::new(),
        refresh_token: value["data"]["refresh_token"]
            .as_str()
            .unwrap_or("")
            .to_string(),
        enc_refresh_token: String::new(),
        room_id: room.clone(),
        csrf: csrf.clone(),
        enc_csrf: String::new(),
        level: 0,
        current_exp: 0,
        next_exp: 0,
        money: 0.0,
        bcoin: 0.0,
        following: 0,
        follower: 0,
        dynamic_count: 0,
        last_title: old.last_title,
        last_area_id: old.last_area_id,
        last_area_name: old.last_area_name,
        last_tags: old.last_tags,
        recent_areas: old.recent_areas,
        live_profile_state: old.live_profile_state,
        live_key: None,
        sub_session_key: None,
        login_invalid: false,
        auth_fail_count: 0,
        last_auth_fail_at: 0,
    };
    let mut user = user;
    sync_live_profile_state_defaults(&mut user);
    fill_profile_from_full(&mut user, &full);
    if let Err(error) =
        refresh_avatar_cache(&state.client, &state.config_path, &uid_str, &user.face).await
    {
        eprintln!("avatar cache refresh failed for uid {uid_str}: {error}");
    }

    runtime.config.users.insert(uid_str.clone(), user.clone());
    runtime.config.current_uid = Some(uid_str);
    runtime.session.uid = uid;
    runtime.session.csrf = csrf;
    runtime.session.room_id = room;
    runtime.session.is_live = false;
    runtime.session.live_status = None;
    runtime.session.live_time.clear();
    runtime.session.live_key = None;
    runtime.session.sub_session_key = None;
    runtime.session.from_cache = false;
    runtime.session.last_sync_at = None;
    runtime.session.error_code = None;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    let response_user = to_response_user(&state.config_path, &user);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn load_saved_config(state: State<'_, AppState>) -> CmdResult {
    let user = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .as_ref()
            .and_then(|uid| runtime.config.users.get(uid))
            .cloned()
    };
    if let Some(user) = &user {
        if !has_cached_face(&state.config_path, &user.uid) {
            if let Err(error) =
                refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
            {
                eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let data = user
        .as_ref()
        .map(|value| to_response_user(&state.config_path, value));
    Ok(wrap_ok(serde_json::to_value(data).unwrap()))
}

#[tauri::command]
pub async fn refresh_current_user(state: State<'_, AppState>) -> CmdResult {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    let uid = {
        let runtime = state.runtime.lock().await;
        runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "i18n.common.not_logged_in".to_string())?
    };
    eprintln!("[auth][manual] refresh_current_user uid={}", uid);
    let refreshed = refresh_cookie_for_uid(&uid, &state, true).await;
    let response = match refreshed {
        RefreshCookieResult::Updated(user) => {
            let response_user = to_response_user(&state.config_path, &user);
            Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
        }
        RefreshCookieResult::Missing => Err("i18n.common.not_logged_in".into()),
        RefreshCookieResult::Invalid(msg) => {
            Err(format!("i18n.common.login_expired_relogin:{msg}"))
        }
        RefreshCookieResult::Failed(error) => Err(error),
    };

    let runtime = state.runtime.lock().await;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    response
}

#[tauri::command]
pub async fn get_account_list(state: State<'_, AppState>) -> CmdResult {
    let users = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.values().cloned().collect::<Vec<_>>()
    };
    for user in &users {
        if !has_cached_face(&state.config_path, &user.uid) {
            if let Err(error) =
                refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
            {
                eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
            }
        }
    }
    let list: Vec<UserRecord> = users
        .iter()
        .map(|user| to_response_user(&state.config_path, user))
        .collect();
    let current_uid = {
        let runtime = state.runtime.lock().await;
        runtime.config.current_uid.clone()
    };
    Ok(wrap_ok(json!({
        "list": list,
        "current_uid": current_uid
    })))
}

#[tauri::command]
pub async fn switch_account(req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if !runtime.config.users.contains_key(&req.uid) {
        return Err("i18n.account.error.account_not_found".into());
    }
    if runtime
        .config
        .users
        .get(&req.uid)
        .map(|user| user.login_invalid)
        .unwrap_or(false)
    {
        return Err("i18n.account.error.account_login_invalid".into());
    }

    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    runtime.config.current_uid = Some(req.uid.clone());
    restore_session_from_current(&mut runtime, &state.client);
    let user = runtime
        .config
        .users
        .get(&req.uid)
        .cloned()
        .unwrap_or_default();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);

    if !has_cached_face(&state.config_path, &user.uid) {
        if let Err(error) =
            refresh_avatar_cache(&state.client, &state.config_path, &user.uid, &user.face).await
        {
            eprintln!("avatar cache warmup failed for uid {}: {}", user.uid, error);
        }
    }
    let response_user = to_response_user(&state.config_path, &user);
    Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
}

#[tauri::command]
pub async fn logout(req: UidReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    runtime.config.users.remove(&req.uid);
    delete_avatar_cache(&state.config_path, &req.uid);
    if runtime.config.current_uid.as_deref() == Some(&req.uid) {
        if let Some(task) = runtime.danmu_task.take() {
            task.abort();
        }
        runtime.config.current_uid = None;
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({})))
}

async fn refresh_accounts_batch(state: &AppState, refresh_profile: bool) -> serde_json::Value {
    let uids = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.keys().cloned().collect::<Vec<_>>()
    };

    let mut updated = 0;
    let mut failed: Vec<String> = Vec::new();
    let mut expired: Vec<String> = Vec::new();
    let mode = if refresh_profile { "profile" } else { "cookie" };
    eprintln!("[auth][batch][{mode}] begin total={}", uids.len());
    for uid in uids {
        eprintln!("[auth][batch][{mode}] checking uid={}", uid);
        match refresh_cookie_for_uid(&uid, state, refresh_profile).await {
            RefreshCookieResult::Updated(_) => {
                updated += 1;
                eprintln!("[auth][batch][{mode}] uid={} updated", uid);
            }
            RefreshCookieResult::Missing => {}
            RefreshCookieResult::Invalid(msg) => {
                expired.push(uid.clone());
                failed.push(format!("{uid}: {msg}"));
                eprintln!("[auth][batch][{mode}] uid={} invalid: {}", uid, msg);
            }
            RefreshCookieResult::Failed(error) => {
                failed.push(format!("{uid}: {error}"));
                eprintln!("[auth][batch][{mode}] uid={} failed: {}", uid, error);
            }
        }
    }
    eprintln!(
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
    json!({
        "updated": updated,
        "failed": failed,
        "expired": expired
    })
}

pub async fn refresh_all_account_profiles_inner(state: &AppState) -> serde_json::Value {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    refresh_accounts_batch(state, true).await
}

#[tauri::command]
pub async fn refresh_all_account_cookies(state: State<'_, AppState>) -> CmdResult {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    Ok(wrap_ok(refresh_accounts_batch(&state, false).await))
}

#[tauri::command]
pub async fn refresh_all_account_profiles(state: State<'_, AppState>) -> CmdResult {
    Ok(wrap_ok(refresh_all_account_profiles_inner(&state).await))
}
