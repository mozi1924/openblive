use crate::avatar::{delete_avatar_cache, has_cached_face, refresh_avatar_cache, to_response_user};
use crate::bili::fetch_full_user_data;
use crate::client::parse_cookie_value;
use crate::config::save_config;
use crate::constants::CmdResult;
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
    user.uname = full["uname"].as_str().unwrap_or("未知用户").to_string();
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
        .map_err(|error| format!("加载刷新公钥失败: {error}"))?;
    let payload = format!("refresh_{timestamp}");
    let encrypted = public_key
        .encrypt(&mut OsRng, Oaep::new::<Sha256>(), payload.as_bytes())
        .map_err(|error| format!("生成 correspondPath 失败: {error}"))?;
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
        return Err("Cookie 需要刷新，但缺少 refresh_token，请重新扫码登录".into());
    }

    let csrf = parse_cookie_value(&user.cookie, "bili_jct")
        .or_else(|| {
            if user.csrf.trim().is_empty() {
                None
            } else {
                Some(user.csrf.clone())
            }
        })
        .ok_or_else(|| "Cookie 需要刷新，但缺少 csrf".to_string())?;

    let ts = if timestamp > 0 {
        timestamp
    } else {
        current_timestamp_millis()
    };
    eprintln!("[auth][refresh] uid={} use timestamp={ts}", user.uid);
    let correspond_path = build_correspond_path(ts)?;
    let correspond_url = format!("https://www.bilibili.com/correspond/1/{correspond_path}");

    let correspond_response = state
        .client
        .http
        .get(&correspond_url)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !correspond_response.status().is_success() {
        return Err(format!(
            "获取 refresh_csrf 失败: HTTP {}",
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
        .ok_or_else(|| "获取 refresh_csrf 失败: 页面缺少 token".to_string())?;
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
            "https://passport.bilibili.com/x/passport-login/web/cookie/refresh",
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
            "Cookie 刷新失败({code}): {}",
            error_message(&refresh_value, "unknown error")
        ));
    }

    if let Some(next_token) = refresh_value["data"]["refresh_token"].as_str() {
        if !next_token.trim().is_empty() {
            user.refresh_token = next_token.to_string();
        }
    }

    let cookie_header = state.client.cookie_header_for("https://api.bilibili.com/");
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
        .ok_or_else(|| "Cookie 刷新确认失败: 缺少新的 csrf".to_string())?;
    let mut confirm_form = BTreeMap::new();
    confirm_form.insert("csrf".to_string(), confirm_csrf);
    confirm_form.insert("refresh_token".to_string(), old_refresh_token);

    let confirm_value = state
        .client
        .post_form(
            "https://passport.bilibili.com/x/passport-login/web/confirm/refresh",
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
            "Cookie 刷新确认失败({code}): {}",
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
        return RefreshCookieResult::Failed("本地凭证为空，请重新扫码登录".into());
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
            "https://passport.bilibili.com/x/passport-login/web/cookie/info",
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
        let msg = info["message"].as_str().unwrap_or("Cookie 状态检查失败");
        eprintln!(
            "[auth][check] cookie/info failed for uid {uid}: code={code}, msg={msg}, {}",
            cookie_diagnostics(&user.cookie)
        );
        if is_auth_invalid_code(code) {
            let fail_count = bump_user_auth_fail_count(uid, state).await;
            if fail_count < AUTH_INVALID_THRESHOLD {
                clear_user_login_invalid_flag(uid, state).await;
                return RefreshCookieResult::Failed(format!(
                    "登录校验异常({code}): {msg}，第 {fail_count}/{AUTH_INVALID_THRESHOLD} 次"
                ));
            }

            if !has_session_cookie(&user.cookie) {
                mark_user_login_invalid(uid, state, true).await;
                return RefreshCookieResult::Invalid("Cookie 缺少 SESSDATA，请重新登录".into());
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
                "Cookie 需要刷新但刷新失败，第 {fail_count}/{AUTH_INVALID_THRESHOLD} 次：{error}"
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
        .get_json("https://api.bilibili.com/x/web-interface/nav", &[])
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
        let msg = nav["message"].as_str().unwrap_or("获取用户信息失败");
        eprintln!(
            "[auth][check] nav failed for uid {uid}: code={code}, msg={msg}, {}",
            cookie_diagnostics(&user.cookie)
        );
        if is_auth_invalid_code(code) {
            let fail_count = bump_user_auth_fail_count(uid, state).await;
            if fail_count < AUTH_INVALID_THRESHOLD {
                clear_user_login_invalid_flag(uid, state).await;
                return RefreshCookieResult::Failed(format!(
                    "登录校验异常({code}): {msg}，第 {fail_count}/{AUTH_INVALID_THRESHOLD} 次"
                ));
            }

            if !has_session_cookie(&user.cookie) {
                mark_user_login_invalid(uid, state, true).await;
                return RefreshCookieResult::Invalid("Cookie 缺少 SESSDATA，请重新登录".into());
            }
            mark_user_login_invalid(uid, state, true).await;
            return RefreshCookieResult::Invalid(msg.to_string());
        }

        return RefreshCookieResult::Failed(msg.to_string());
    }

    let stat = match state
        .client
        .get_json("https://api.bilibili.com/x/web-interface/nav/stat", &[])
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

    let cookie_header = state.client.cookie_header_for("https://api.bilibili.com/");
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
            "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
            &[],
        )
        .await
        .map_err(|error| error.to_string())?;
    Ok(wrap_ok(value["data"].clone()))
}

#[tauri::command]
pub async fn poll_login_status(req: PollReq, state: State<'_, AppState>) -> CmdResult {
    let value: serde_json::Value = state
        .client
        .http
        .get("https://passport.bilibili.com/x/passport-login/web/qrcode/poll")
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

    let cookie_header = state.client.cookie_header_for("https://api.bilibili.com/");
    let full = fetch_full_user_data(&state.client)
        .await
        .map_err(|error| error.to_string())?;
    let cookie_uid = parse_cookie_value(&cookie_header, "DedeUserID")
        .and_then(|raw| raw.parse().ok())
        .unwrap_or(0);
    let nav_uid = full["mid"].as_u64().unwrap_or(0);
    let uid = if cookie_uid > 0 { cookie_uid } else { nav_uid };
    if uid == 0 {
        eprintln!(
            "[auth][qrcode] login success but uid missing, cookie_uid={}, nav_uid={}, {}",
            cookie_uid,
            nav_uid,
            cookie_diagnostics(&cookie_header)
        );
        return Err("登录成功但未获取到有效 UID，请重试扫码登录".into());
    }
    let csrf = parse_cookie_value(&cookie_header, "bili_jct").unwrap_or_default();
    let room = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v2/Room/room_id_by_uid",
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
        live_profile_state: old.live_profile_state,
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
            .ok_or_else(|| "未登录".to_string())?
    };
    eprintln!("[auth][manual] refresh_current_user uid={}", uid);
    let refreshed = refresh_cookie_for_uid(&uid, &state, true).await;
    let response = match refreshed {
        RefreshCookieResult::Updated(user) => {
            let response_user = to_response_user(&state.config_path, &user);
            Ok(wrap_ok(serde_json::to_value(response_user).unwrap()))
        }
        RefreshCookieResult::Missing => Err("未登录".into()),
        RefreshCookieResult::Invalid(msg) => Err(format!("登录已失效，请重新登录：{msg}")),
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
        return Err("账户不存在".into());
    }
    if runtime
        .config
        .users
        .get(&req.uid)
        .map(|user| user.login_invalid)
        .unwrap_or(false)
    {
        return Err("该账号登录已失效，请重新扫码登录".into());
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
        runtime.config.current_uid = None;
        runtime.session = Default::default();
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn refresh_all_account_cookies(state: State<'_, AppState>) -> CmdResult {
    let _refresh_guard = state.auth_refresh_lock.lock().await;
    let uids = {
        let runtime = state.runtime.lock().await;
        runtime.config.users.keys().cloned().collect::<Vec<_>>()
    };

    let mut updated = 0;
    let mut failed: Vec<String> = Vec::new();
    let mut expired: Vec<String> = Vec::new();
    eprintln!(
        "[auth][batch] begin refresh_all_account_cookies total={}",
        uids.len()
    );
    for uid in uids {
        eprintln!("[auth][batch] checking uid={}", uid);
        match refresh_cookie_for_uid(&uid, &state, false).await {
            RefreshCookieResult::Updated(_) => {
                updated += 1;
                eprintln!("[auth][batch] uid={} updated", uid);
            }
            RefreshCookieResult::Missing => {}
            RefreshCookieResult::Invalid(msg) => {
                expired.push(uid.clone());
                failed.push(format!("{uid}: {msg}"));
                eprintln!("[auth][batch] uid={} invalid: {}", uid, msg);
            }
            RefreshCookieResult::Failed(error) => {
                failed.push(format!("{uid}: {error}"));
                eprintln!("[auth][batch] uid={} failed: {}", uid, error);
            }
        }
    }
    eprintln!(
        "[auth][batch] done updated={}, expired={}, failed={}",
        updated,
        expired.len(),
        failed.len()
    );

    let runtime = state.runtime.lock().await;
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({
        "updated": updated,
        "failed": failed,
        "expired": expired
    })))
}
