use crate::bili::{app_sign, get_danmu_info, wbi_signed};
use crate::config::save_config;
use crate::constants::{CmdResult, DEFAULT_LIVEHIME_BUILD, DEFAULT_LIVEHIME_VERSION};
use crate::danmu::decode_and_emit;
use crate::models::{
    sync_live_profile_state_defaults, DanmuReq, UpdateAreaReq, UpdateTagsReq, UpdateTitleReq,
    UserRecord,
};
use crate::response::wrap_ok;
use crate::state::AppState;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::json;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, State};
use tokio::process::Command;
use tokio_tungstenite::tungstenite::Message;
use url::form_urlencoded;

const LIVE_CLIENT_VERSION_TTL_SECS: i64 = 6 * 60 * 60;
const LIVE_PLATFORM_PC_LINK: &str = "pc_link";

#[derive(Clone, Serialize)]
struct StreamEndpoint {
    protocol: String,
    addr: String,
    code: String,
    full_url: String,
    provider: String,
    new_link: String,
    stream_name: String,
    stream_key: String,
    schedule: String,
    pflag: String,
    query: BTreeMap<String, String>,
}

fn is_auth_invalid_code(code: i64) -> bool {
    matches!(code, -101 | 3 | 65530)
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

fn cookie_diagnostics(cookie_header: &str) -> String {
    let has_sess = crate::client::parse_cookie_value(cookie_header, "SESSDATA").is_some();
    let has_uid = crate::client::parse_cookie_value(cookie_header, "DedeUserID").is_some();
    let has_csrf = crate::client::parse_cookie_value(cookie_header, "bili_jct").is_some();
    format!(
        "has_sess={has_sess}, has_uid={has_uid}, has_csrf={has_csrf}, cookie_len={}",
        cookie_header.len()
    )
}

async fn mark_current_user_login_invalid(state: &AppState, reason: &str) {
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
    runtime.session = Default::default();
    save_config(&state.config_path, &runtime.config, &state.master_key);
}

fn split_tags(raw: &str) -> Vec<String> {
    raw.split([',', '，'])
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .map(|tag| tag.to_string())
        .collect()
}

fn current_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}

fn title_review_from_audit_status(status: Option<i64>) -> &'static str {
    match status {
        Some(2) => "pending",
        Some(0) => "none",
        Some(_) => "unknown",
        None => "none",
    }
}

fn same_tags(left: &[String], right: &[String]) -> bool {
    left == right
}

fn apply_profile_state_from_remote(
    user: &mut UserRecord,
    title: &str,
    parent: &str,
    child: &str,
    area_id: Option<u64>,
    tags: &[String],
) {
    sync_live_profile_state_defaults(user);
    let now = current_timestamp();
    let title_matches_submitted = user.live_profile_state.title.submitted == title;

    if user.live_profile_state.title.submitted.is_empty() {
        user.live_profile_state.title.submitted = title.to_string();
        user.last_title = title.to_string();
    }
    user.live_profile_state.title.effective = title.to_string();
    if title_matches_submitted {
        user.live_profile_state.title.transport = "synced".to_string();
        if matches!(
            user.live_profile_state.title.review.as_str(),
            "pending" | "unknown"
        ) {
            user.live_profile_state.title.review = "none".to_string();
        }
        user.live_profile_state.title.message.clear();
    } else if user.live_profile_state.title.review != "pending" {
        user.live_profile_state.title.transport = "conflict".to_string();
        user.live_profile_state.title.message = "远端标题与最近一次提交不同".to_string();
    }
    user.live_profile_state.title.updated_at = now;

    if user.live_profile_state.area.submitted_parent.is_empty()
        && user.live_profile_state.area.submitted_child.is_empty()
    {
        user.live_profile_state.area.submitted_parent = parent.to_string();
        user.live_profile_state.area.submitted_child = child.to_string();
        user.live_profile_state.area.submitted_area_id = area_id;
        if !parent.is_empty() && !child.is_empty() {
            user.last_area_name = vec![parent.to_string(), child.to_string()];
        }
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    user.live_profile_state.area.effective_parent = parent.to_string();
    user.live_profile_state.area.effective_child = child.to_string();
    user.live_profile_state.area.effective_area_id = area_id;
    if user.live_profile_state.area.submitted_area_id == Some(0)
        && user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
    {
        user.live_profile_state.area.submitted_area_id = area_id;
        if let Some(area_id) = area_id {
            user.last_area_id = area_id.to_string();
        }
    }
    if user.live_profile_state.area.submitted_parent == parent
        && user.live_profile_state.area.submitted_child == child
        && user.live_profile_state.area.submitted_area_id == area_id
    {
        user.live_profile_state.area.transport = "synced".to_string();
        if user.live_profile_state.area.message == "远端分区与最近一次提交不同" {
            user.live_profile_state.area.message.clear();
        }
    } else {
        user.live_profile_state.area.transport = "conflict".to_string();
        user.live_profile_state.area.message = "远端分区与最近一次提交不同".to_string();
    }
    user.live_profile_state.area.updated_at = now;

    if user.live_profile_state.tags.submitted.is_empty() && !tags.is_empty() {
        user.live_profile_state.tags.submitted = tags.to_vec();
        user.last_tags = tags.to_vec();
    }
    user.live_profile_state.tags.effective = tags.to_vec();
    if same_tags(&user.live_profile_state.tags.submitted, tags) {
        user.live_profile_state.tags.transport = "synced".to_string();
        if user.live_profile_state.tags.message == "远端标签与最近一次提交不同" {
            user.live_profile_state.tags.message.clear();
        }
    } else {
        user.live_profile_state.tags.transport = "conflict".to_string();
        user.live_profile_state.tags.message = "远端标签与最近一次提交不同".to_string();
    }
    user.live_profile_state.tags.updated_at = now;
}

fn build_room_update_form(room_id: &str, csrf: &str) -> BTreeMap<String, String> {
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id.to_string());
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("csrf".into(), csrf.to_string());
    form.insert("csrf_token".into(), csrf.to_string());
    form
}

fn sanitized_live_client_version(version: &str, build: u64) -> (String, u64) {
    let normalized_version = if version.trim().is_empty() {
        DEFAULT_LIVEHIME_VERSION.to_string()
    } else {
        version.trim().to_string()
    };
    let normalized_build = if build == 0 {
        DEFAULT_LIVEHIME_BUILD
    } else {
        build
    };
    (normalized_version, normalized_build)
}

fn parse_stream_query(code: &str) -> BTreeMap<String, String> {
    let query_str = code.trim().trim_start_matches('?');
    if query_str.is_empty() {
        return BTreeMap::new();
    }

    form_urlencoded::parse(query_str.as_bytes())
        .into_owned()
        .collect::<BTreeMap<_, _>>()
}

fn room_live_state(status: i64) -> bool {
    status == 1
}

fn apply_room_status_to_session(
    session: &mut crate::models::SessionState,
    room_info: &serde_json::Value,
) {
    let live_status = room_info["live_status"].as_i64().unwrap_or(0);
    session.live_status = Some(live_status);
    session.is_live = room_live_state(live_status);
    session.live_time = room_info["live_time"].as_str().unwrap_or("").to_string();

    if let Some(room_id) = room_info["room_id"].as_i64() {
        session.room_id = room_id.to_string();
    }
}

fn apply_room_area_to_session(
    session: &mut crate::models::SessionState,
    room_info: &serde_json::Value,
) {
    let parent = room_info["parent_area_name"].as_str().unwrap_or("").to_string();
    let child = room_info["area_name"].as_str().unwrap_or("").to_string();
    if !parent.is_empty() && !child.is_empty() {
        session.current_area_names = vec![parent, child];
    }
    if let Some(area_id) = room_info["area_id"].as_u64() {
        session.current_area_id = Some(area_id);
    }
}

fn parse_protocol_from_addr(addr: &str) -> String {
    if let Some((scheme, _)) = addr.split_once("://") {
        return scheme.trim().to_ascii_lowercase();
    }
    String::new()
}

fn parse_stream_endpoint(value: &serde_json::Value, fallback_protocol: &str) -> Option<StreamEndpoint> {
    let addr = value["addr"].as_str().unwrap_or("").trim().to_string();
    let code = value["code"].as_str().unwrap_or("").trim().to_string();
    if addr.is_empty() && code.is_empty() {
        return None;
    }

    let query = parse_stream_query(&code);
    let mut protocol = value["protocol"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if protocol.is_empty() {
        protocol = query
            .get("schedule")
            .map(|item| item.trim().to_ascii_lowercase())
            .unwrap_or_default();
    }
    if protocol.is_empty() {
        protocol = parse_protocol_from_addr(&addr);
    }
    if protocol.is_empty() {
        protocol = fallback_protocol.to_ascii_lowercase();
    }

    let stream_key = query.get("key").cloned().unwrap_or_else(|| {
        let cleaned = code.trim_start_matches('?').trim();
        if cleaned.is_empty() || cleaned.contains('=') {
            String::new()
        } else {
            cleaned.to_string()
        }
    });

    Some(StreamEndpoint {
        protocol,
        full_url: format!("{addr}{code}"),
        provider: value["provider"].as_str().unwrap_or("").to_string(),
        new_link: value["new_link"].as_str().unwrap_or("").to_string(),
        stream_name: query.get("streamname").cloned().unwrap_or_default(),
        stream_key,
        schedule: query.get("schedule").cloned().unwrap_or_default(),
        pflag: query.get("pflag").cloned().unwrap_or_default(),
        query,
        addr,
        code,
    })
}

fn collect_stream_endpoints(data: &serde_json::Value) -> Vec<StreamEndpoint> {
    let mut endpoints: Vec<StreamEndpoint> = Vec::new();
    if let Some(primary) = parse_stream_endpoint(&data["rtmp"], "rtmp") {
        endpoints.push(primary);
    }
    if let Some(protocols) = data["protocols"].as_array() {
        for protocol in protocols {
            if let Some(endpoint) = parse_stream_endpoint(protocol, "rtmp") {
                endpoints.push(endpoint);
            }
        }
    }

    let mut dedup = HashSet::new();
    endpoints
        .into_iter()
        .filter(|item| {
            let key = format!("{}|{}|{}", item.protocol, item.addr, item.code);
            dedup.insert(key)
        })
        .collect()
}

fn select_primary_endpoint(endpoints: &[StreamEndpoint]) -> Option<StreamEndpoint> {
    if endpoints.is_empty() {
        return None;
    }
    endpoints
        .iter()
        .find(|item| item.protocol == "rtmp")
        .cloned()
        .or_else(|| endpoints.first().cloned())
}

#[derive(Clone)]
struct CommandTemplateContext {
    server: String,
    stream_key: String,
    stream_code: String,
    stream_url: String,
    protocol: String,
}

fn normalize_live_control_mode(mode: &str) -> &'static str {
    match mode.trim() {
        "obs_ws" => "obs_ws",
        "command" => "command",
        _ => "none",
    }
}

fn build_command_template_context(primary: &StreamEndpoint) -> CommandTemplateContext {
    let stream_key = if !primary.stream_key.trim().is_empty() {
        primary.stream_key.clone()
    } else {
        primary
            .query
            .get("key")
            .cloned()
            .unwrap_or_else(String::new)
    };
    CommandTemplateContext {
        server: primary.addr.clone(),
        stream_key,
        stream_code: primary.code.clone(),
        stream_url: primary.full_url.clone(),
        protocol: primary.protocol.clone(),
    }
}

fn apply_command_template(raw: &str, context: &CommandTemplateContext) -> String {
    let mut cmd = raw.to_string();
    let replacements = [
        ("{{server}}", context.server.as_str()),
        ("{server}", context.server.as_str()),
        ("${server}", context.server.as_str()),
        ("{{stream_key}}", context.stream_key.as_str()),
        ("{stream_key}", context.stream_key.as_str()),
        ("${stream_key}", context.stream_key.as_str()),
        ("{{stream_code}}", context.stream_code.as_str()),
        ("{stream_code}", context.stream_code.as_str()),
        ("${stream_code}", context.stream_code.as_str()),
        ("{{stream_url}}", context.stream_url.as_str()),
        ("{stream_url}", context.stream_url.as_str()),
        ("${stream_url}", context.stream_url.as_str()),
        ("{{protocol}}", context.protocol.as_str()),
        ("{protocol}", context.protocol.as_str()),
        ("${protocol}", context.protocol.as_str()),
    ];
    for (from, to) in replacements {
        cmd = cmd.replace(from, to);
    }
    cmd
}

async fn spawn_shell_command(raw_command: &str) -> Result<(), String> {
    let command = raw_command.trim();
    if command.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .arg("/C")
        .arg(command)
        .spawn()
        .map_err(|error| format!("执行命令失败: {error}"))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .arg("-lc")
        .arg(command)
        .spawn()
        .map_err(|error| format!("执行命令失败: {error}"))?;

    tokio::spawn(async move {
        if let Err(error) = child.wait().await {
            eprintln!("[live][command] command process wait failed: {error}");
        }
    });
    Ok(())
}

static OBS_REQUEST_ID: AtomicU64 = AtomicU64::new(1);

fn obs_next_request_id() -> String {
    format!("obs-{}", OBS_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
}

fn obs_compute_auth(password: &str, salt: &str, challenge: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(format!("{password}{salt}"));
    let secret = base64::engine::general_purpose::STANDARD.encode(hasher.finalize());

    let mut hasher2 = Sha256::new();
    hasher2.update(format!("{secret}{challenge}"));
    base64::engine::general_purpose::STANDARD.encode(hasher2.finalize())
}

async fn obs_wait_message<S>(
    read: &mut S,
    label: &str,
) -> Result<serde_json::Value, String>
where
    S: futures_util::Stream<
            Item = Result<Message, tokio_tungstenite::tungstenite::Error>,
        > + Unpin,
{
    let Some(result) = read.next().await else {
        return Err(format!("OBS WS 连接已关闭({label})"));
    };
    let message = result.map_err(|error| format!("OBS WS 收包失败({label}): {error}"))?;
    match message {
        Message::Text(text) => serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|error| format!("OBS WS JSON 解析失败({label}): {error}")),
        Message::Binary(bytes) => serde_json::from_slice::<serde_json::Value>(&bytes)
            .map_err(|error| format!("OBS WS 二进制 JSON 解析失败({label}): {error}")),
        Message::Close(frame) => Err(format!("OBS WS 连接被关闭({label}): {:?}", frame)),
        _ => Err(format!("OBS WS 收到非 JSON 帧({label})")),
    }
}

async fn obs_send_request<S>(
    write: &mut S,
    request_type: &str,
    request_data: serde_json::Value,
) -> Result<String, String>
where
    S: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
{
    let request_id = obs_next_request_id();
    let packet = json!({
        "op": 6,
        "d": {
            "requestType": request_type,
            "requestId": request_id,
            "requestData": request_data
        }
    });
    write
        .send(Message::Text(packet.to_string().into()))
        .await
        .map_err(|error| format!("OBS WS 请求发送失败({request_type}): {error}"))?;
    Ok(request_id)
}

async fn obs_wait_request_response<S>(
    read: &mut S,
    expected_request_id: &str,
    request_type: &str,
) -> Result<serde_json::Value, String>
where
    S: futures_util::Stream<
            Item = Result<Message, tokio_tungstenite::tungstenite::Error>,
        > + Unpin,
{
    loop {
        let value = obs_wait_message(read, request_type).await?;
        let op = value["op"].as_i64().unwrap_or(-1);
        if op != 7 {
            continue;
        }
        let response_id = value["d"]["requestId"].as_str().unwrap_or_default();
        if response_id != expected_request_id {
            continue;
        }
        let result = value["d"]["requestStatus"]["result"]
            .as_bool()
            .unwrap_or(false);
        if result {
            return Ok(value);
        }
        let code = value["d"]["requestStatus"]["code"].as_i64().unwrap_or(-1);
        let comment = value["d"]["requestStatus"]["comment"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("OBS WS 请求失败({request_type}) code={code}: {comment}"));
    }
}

async fn obs_ws_start_stream(
    url: &str,
    password: &str,
    context: &CommandTemplateContext,
) -> Result<(), String> {
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("连接 OBS WS 失败: {error}"))?;
    let (mut write, mut read) = ws.split();

    let hello = obs_wait_message(&mut read, "hello").await?;
    if hello["op"].as_i64().unwrap_or(-1) != 0 {
        return Err("OBS WS 协议错误：未收到 Hello".to_string());
    }

    let rpc_version = hello["d"]["rpcVersion"].as_i64().unwrap_or(1);
    let mut identify = json!({
        "op": 1,
        "d": {
            "rpcVersion": rpc_version
        }
    });
    if let Some(auth_obj) = hello["d"]["authentication"].as_object() {
        let challenge = auth_obj
            .get("challenge")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let salt = auth_obj
            .get("salt")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let auth = obs_compute_auth(password, salt, challenge);
        identify["d"]["authentication"] = json!(auth);
    }
    write
        .send(Message::Text(identify.to_string().into()))
        .await
        .map_err(|error| format!("发送 OBS Identify 失败: {error}"))?;

    loop {
        let identified = obs_wait_message(&mut read, "identify").await?;
        let op = identified["op"].as_i64().unwrap_or(-1);
        if op == 2 {
            break;
        }
    }

    let set_req_id = obs_send_request(
        &mut write,
        "SetStreamServiceSettings",
        json!({
            "streamServiceType": "rtmp_custom",
            "streamServiceSettings": {
                "server": context.server,
                "key": context.stream_key
            }
        }),
    )
    .await?;
    obs_wait_request_response(&mut read, &set_req_id, "SetStreamServiceSettings").await?;

    let start_req_id = obs_send_request(&mut write, "StartStream", json!({})).await?;
    obs_wait_request_response(&mut read, &start_req_id, "StartStream").await?;
    Ok(())
}

async fn obs_ws_stop_stream(url: &str, password: &str) -> Result<(), String> {
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("连接 OBS WS 失败: {error}"))?;
    let (mut write, mut read) = ws.split();

    let hello = obs_wait_message(&mut read, "hello").await?;
    if hello["op"].as_i64().unwrap_or(-1) != 0 {
        return Err("OBS WS 协议错误：未收到 Hello".to_string());
    }

    let rpc_version = hello["d"]["rpcVersion"].as_i64().unwrap_or(1);
    let mut identify = json!({
        "op": 1,
        "d": {
            "rpcVersion": rpc_version
        }
    });
    if let Some(auth_obj) = hello["d"]["authentication"].as_object() {
        let challenge = auth_obj
            .get("challenge")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let salt = auth_obj
            .get("salt")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let auth = obs_compute_auth(password, salt, challenge);
        identify["d"]["authentication"] = json!(auth);
    }
    write
        .send(Message::Text(identify.to_string().into()))
        .await
        .map_err(|error| format!("发送 OBS Identify 失败: {error}"))?;

    loop {
        let identified = obs_wait_message(&mut read, "identify").await?;
        let op = identified["op"].as_i64().unwrap_or(-1);
        if op == 2 {
            break;
        }
    }

    let stop_req_id = obs_send_request(&mut write, "StopStream", json!({})).await?;
    obs_wait_request_response(&mut read, &stop_req_id, "StopStream").await?;
    Ok(())
}

pub(crate) async fn obs_ws_probe(url: &str, password: &str) -> Result<(), String> {
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("连接 OBS WS 失败: {error}"))?;
    let (mut write, mut read) = ws.split();

    let hello = obs_wait_message(&mut read, "hello").await?;
    if hello["op"].as_i64().unwrap_or(-1) != 0 {
        return Err("OBS WS 协议错误：未收到 Hello".to_string());
    }

    let rpc_version = hello["d"]["rpcVersion"].as_i64().unwrap_or(1);
    let mut identify = json!({
        "op": 1,
        "d": { "rpcVersion": rpc_version }
    });
    if let Some(auth_obj) = hello["d"]["authentication"].as_object() {
        let challenge = auth_obj
            .get("challenge")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        let salt = auth_obj
            .get("salt")
            .and_then(|item| item.as_str())
            .unwrap_or_default();
        identify["d"]["authentication"] = json!(obs_compute_auth(password, salt, challenge));
    }
    write
        .send(Message::Text(identify.to_string().into()))
        .await
        .map_err(|error| format!("发送 OBS Identify 失败: {error}"))?;

    loop {
        let identified = obs_wait_message(&mut read, "identify").await?;
        let op = identified["op"].as_i64().unwrap_or(-1);
        if op == 2 {
            break;
        }
    }

    let req_id = obs_send_request(&mut write, "GetStreamStatus", json!({})).await?;
    obs_wait_request_response(&mut read, &req_id, "GetStreamStatus").await?;
    Ok(())
}

async fn fetch_room_info_by_room_id(
    state: &AppState,
    room_id: &str,
    cookie_header: Option<&str>,
) -> Result<serde_json::Value, String> {
    if let Some(cookie) = cookie_header {
        if !cookie.trim().is_empty() {
            state.client.apply_cookie_header(cookie);
        }
    }

    let value = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v1/Room/get_info",
            &[("room_id", room_id.to_string())],
        )
        .await
        .map_err(|error| error.to_string())?;
    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(error_message(&value, "查询直播状态失败"));
    }
    Ok(value["data"].clone())
}

pub async fn refresh_live_client_version_inner(state: &AppState) -> Result<(String, u64), String> {
    let ts = chrono::Utc::now().timestamp().to_string();
    let mut params = BTreeMap::new();
    params.insert("system_version".into(), "2".into());
    params.insert("ts".into(), ts);
    let signed = app_sign(&params);
    let query = signed
        .iter()
        .map(|(key, value)| (key.as_str(), value.clone()))
        .collect::<Vec<_>>();

    let value = state
        .client
        .get_json(
            "https://api.live.bilibili.com/xlive/app-blink/v1/liveVersionInfo/getHomePageLiveVersion",
            &query,
        )
        .await
        .map_err(|error| error.to_string())?;

    if value["code"].as_i64().unwrap_or(-1) != 0 {
        return Err(value["message"]
            .as_str()
            .unwrap_or("获取版本号失败")
            .to_string());
    }

    let raw_version = value["data"]["curr_version"].as_str().unwrap_or("");
    let raw_build = value["data"]["build"].as_u64().unwrap_or(0);
    let (version, build) = sanitized_live_client_version(raw_version, raw_build);

    let mut runtime = state.runtime.lock().await;
    runtime.config.live_client_version = version.clone();
    runtime.config.live_client_build = build;
    runtime.config.live_client_synced_at = chrono::Utc::now().timestamp();
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok((version, build))
}

#[tauri::command]
pub async fn sync_live_status(state: State<'_, AppState>) -> CmdResult {
    let (uid, room_id, cookie, fallback_session) = {
        let runtime = state.runtime.lock().await;
        let fallback = runtime.session.clone();
        let Some(uid) = runtime.config.current_uid.clone() else {
            return Ok(wrap_ok(serde_json::to_value(fallback).unwrap()));
        };
        let Some(user) = runtime.config.users.get(&uid) else {
            return Ok(wrap_ok(serde_json::to_value(fallback).unwrap()));
        };
        let room_id = if user.room_id.trim().is_empty() {
            runtime.session.room_id.clone()
        } else {
            user.room_id.clone()
        };
        (uid, room_id, user.cookie.clone(), fallback)
    };

    if room_id.trim().is_empty() {
        return Ok(wrap_ok(serde_json::to_value(fallback_session).unwrap()));
    }

    let room_info = match fetch_room_info_by_room_id(&state, &room_id, Some(&cookie)).await {
        Ok(data) => data,
        Err(_) => return Ok(wrap_ok(serde_json::to_value(fallback_session).unwrap())),
    };

    let mut runtime = state.runtime.lock().await;
    apply_room_status_to_session(&mut runtime.session, &room_info);
    if let Some(room_id_long) = room_info["room_id"].as_i64() {
        let room_id_text = room_id_long.to_string();
        runtime.session.room_id = room_id_text.clone();
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            user.room_id = room_id_text;
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
    }

    Ok(wrap_ok(serde_json::to_value(runtime.session.clone()).unwrap()))
}

async fn resolve_live_client_version(state: &AppState, force_refresh: bool) -> (String, u64, bool) {
    let (cached_version, cached_build, synced_at) = {
        let runtime = state.runtime.lock().await;
        (
            runtime.config.live_client_version.clone(),
            runtime.config.live_client_build,
            runtime.config.live_client_synced_at,
        )
    };

    let now = chrono::Utc::now().timestamp();
    let stale = synced_at <= 0 || now - synced_at >= LIVE_CLIENT_VERSION_TTL_SECS;
    let missing = cached_version.trim().is_empty() || cached_build == 0;
    let should_refresh = force_refresh || stale || missing;

    if should_refresh {
        if let Ok((version, build)) = refresh_live_client_version_inner(state).await {
            return (version, build, false);
        }
    }

    let (version, build) = sanitized_live_client_version(&cached_version, cached_build);
    (version, build, true)
}

async fn inject_live_client_identity(
    state: &AppState,
    form: &mut BTreeMap<String, String>,
    force_refresh: bool,
) -> bool {
    let (version, build, from_cache) = resolve_live_client_version(state, force_refresh).await;
    form.insert("version".into(), version);
    form.insert("build".into(), build.to_string());
    from_cache
}

#[tauri::command]
pub async fn refresh_live_client_version(state: State<'_, AppState>) -> CmdResult {
    let (version, build, from_cache) = resolve_live_client_version(&state, true).await;

    Ok(wrap_ok(json!({
        "version": version,
        "build": build,
        "from_cache": from_cache
    })))
}

#[tauri::command]
pub async fn sync_live_room_profile(state: State<'_, AppState>) -> CmdResult {
    let (uid, user) = {
        let runtime = state.runtime.lock().await;
        let uid = runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .cloned()
            .ok_or_else(|| "未登录".to_string())?;
        (uid, user)
    };

    if user.room_id.is_empty() {
        let parent = user
            .last_area_name
            .first()
            .cloned()
            .unwrap_or_else(String::new);
        let child = user
            .last_area_name
            .get(1)
            .cloned()
            .unwrap_or_else(String::new);
        return Ok(wrap_ok(json!({
            "title": user.last_title,
            "parent": parent,
            "child": child,
            "area_id": user.last_area_id.parse::<u64>().ok(),
            "tags": user.last_tags,
            "profile_state": user.live_profile_state,
            "from_cache": true
        })));
    }

    let result = fetch_room_info_by_room_id(&state, &user.room_id, Some(&user.cookie)).await;

    match result {
        Ok(data) => {
            let title = data["title"]
                .as_str()
                .unwrap_or(&user.last_title)
                .to_string();
            let parent = data["parent_area_name"].as_str().unwrap_or("").to_string();
            let child = data["area_name"].as_str().unwrap_or("").to_string();
            let area_id = data["area_id"]
                .as_u64()
                .or_else(|| user.last_area_id.parse::<u64>().ok());
            let tags = split_tags(data["tags"].as_str().unwrap_or(""));
            let room_id = data["room_id"]
                .as_i64()
                .map(|value| value.to_string())
                .unwrap_or_else(|| user.room_id.clone());

            let mut runtime = state.runtime.lock().await;
            if let Some(current) = runtime.config.users.get_mut(&uid) {
                apply_profile_state_from_remote(current, &title, &parent, &child, area_id, &tags);
                if !room_id.is_empty() {
                    current.room_id = room_id.clone();
                }
            }
            runtime.session.current_area_id = area_id;
            runtime.session.current_area_names = if parent.is_empty() || child.is_empty() {
                runtime.session.current_area_names.clone()
            } else {
                vec![parent.clone(), child.clone()]
            };
            runtime.session.current_tags = tags.clone();
            apply_room_status_to_session(&mut runtime.session, &data);
            apply_room_area_to_session(&mut runtime.session, &data);
            if !room_id.is_empty() {
                runtime.session.room_id = room_id;
            }
            save_config(&state.config_path, &runtime.config, &state.master_key);

            Ok(wrap_ok(json!({
                "title": title,
                "parent": parent,
                "child": child,
                "area_id": area_id,
                "tags": tags,
                "profile_state": runtime
                    .config
                    .users
                    .get(&uid)
                    .map(|user| user.live_profile_state.clone()),
                "from_cache": false
            })))
        }
        Err(_) => {
            let parent = user
                .last_area_name
                .first()
                .cloned()
                .unwrap_or_else(String::new);
            let child = user
                .last_area_name
                .get(1)
                .cloned()
                .unwrap_or_else(String::new);

            let mut runtime = state.runtime.lock().await;
            runtime.session.current_area_id = user.last_area_id.parse::<u64>().ok();
            runtime.session.current_area_names = user.last_area_name.clone();
            runtime.session.current_tags = user.last_tags.clone();

            Ok(wrap_ok(json!({
                "title": user.last_title,
                "parent": parent,
                "child": child,
                "area_id": user.last_area_id.parse::<u64>().ok(),
                "tags": user.last_tags,
                "profile_state": user.live_profile_state,
                "from_cache": true
            })))
        }
    }
}

#[tauri::command]
pub async fn get_partitions(state: State<'_, AppState>) -> CmdResult {
    let value = state
        .client
        .get_json(
            "https://api.live.bilibili.com/room/v1/Area/getList",
            &[("show_pinyin", "1".into())],
        )
        .await
        .map_err(|error| error.to_string())?;
    let mut runtime = state.runtime.lock().await;
    runtime.partition_map.clear();
    let mut out = serde_json::Map::new();

    if let Some(parents) = value["data"].as_array() {
        for parent in parents {
            let parent_name = parent["name"].as_str().unwrap_or("").to_string();
            let mut sub_map = HashMap::new();
            let mut names = vec![];
            if let Some(children) = parent["list"].as_array() {
                for child in children {
                    let child_name = child["name"].as_str().unwrap_or("").to_string();
                    let child_id = child["id"]
                        .as_u64()
                        .or_else(|| child["id"].as_str().and_then(|value| value.parse::<u64>().ok()))
                        .unwrap_or(0);
                    sub_map.insert(child_name.clone(), child_id);
                    names.push(json!(child_name));
                }
            }
            runtime.partition_map.insert(parent_name.clone(), sub_map);
            out.insert(parent_name, json!(names));
        }
    }

    Ok(wrap_ok(json!(out)))
}

#[tauri::command]
pub async fn update_area(req: UpdateAreaReq, state: State<'_, AppState>) -> CmdResult {
    let (uid, room_id, csrf, cookie, area_id) = {
        let runtime = state.runtime.lock().await;
        let uid = runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .ok_or_else(|| "未登录".to_string())?;
        let area_id = runtime
            .partition_map
            .get(&req.parent)
            .and_then(|map| map.get(&req.child))
            .copied()
            .ok_or_else(|| "invalid partition".to_string())?;
        (
            uid,
            user.room_id.clone(),
            user.csrf.clone(),
            user.cookie.clone(),
            area_id,
        )
    };

    if room_id.is_empty() {
        return Err("未获取到直播间号".into());
    }
    if csrf.is_empty() {
        return Err("未获取到 csrf，请尝试刷新账号信息".into());
    }

    state.client.apply_cookie_header(&cookie);
    let mut form = build_room_update_form(&room_id, &csrf);
    form.insert("area_id".into(), area_id.to_string());
    let value = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("update_area code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("登录已失效，请重新扫码登录".into());
        }
        return Err(error_message(&value, "分区设置失败"));
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        sync_live_profile_state_defaults(user);
        user.last_area_id = area_id.to_string();
        user.last_area_name = vec![req.parent.clone(), req.child.clone()];
        user.live_profile_state.area.submitted_parent = req.parent.clone();
        user.live_profile_state.area.submitted_child = req.child.clone();
        user.live_profile_state.area.submitted_area_id = Some(area_id);
        user.live_profile_state.area.effective_parent = req.parent.clone();
        user.live_profile_state.area.effective_child = req.child.clone();
        user.live_profile_state.area.effective_area_id = Some(area_id);
        user.live_profile_state.area.transport = "synced".to_string();
        user.live_profile_state.area.review = "none".to_string();
        user.live_profile_state.area.message.clear();
        user.live_profile_state.area.updated_at = current_timestamp();
        user.login_invalid = false;
        user.auth_fail_count = 0;
        user.last_auth_fail_at = 0;
    }
    runtime.session.current_area_id = Some(area_id);
    runtime.session.current_area_names = vec![req.parent.clone(), req.child.clone()];
    save_config(&state.config_path, &runtime.config, &state.master_key);
    Ok(wrap_ok(json!({
        "area_id": area_id,
        "profile_state": runtime
            .config
            .users
            .get(&uid)
            .map(|user| user.live_profile_state.clone())
    })))
}

#[tauri::command]
pub async fn update_title(req: UpdateTitleReq, state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), runtime.session.room_id.clone());
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("title".into(), req.title.clone());
    form.insert("csrf".into(), runtime.session.csrf.clone());
    form.insert("csrf_token".into(), runtime.session.csrf.clone());
    drop(runtime);

    let value = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
        .await
        .map_err(|error| error.to_string())?;

    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let audit_info = value["data"]["audit_info"].clone();
        let audit_status = audit_info["audit_title_status"].as_i64();
        let review = title_review_from_audit_status(audit_status);
        let message = audit_info["audit_title_reason"]
            .as_str()
            .unwrap_or("")
            .to_string();
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                sync_live_profile_state_defaults(user);
                user.last_title = req.title.clone();
                user.live_profile_state.title.submitted = req.title.clone();
                user.live_profile_state.title.transport = "synced".to_string();
                user.live_profile_state.title.review = review.to_string();
                user.live_profile_state.title.message = message.clone();
                user.live_profile_state.title.updated_at = current_timestamp();
                if review == "none" {
                    user.live_profile_state.title.effective = req.title.clone();
                }
                user.login_invalid = false;
                user.auth_fail_count = 0;
                user.last_auth_fail_at = 0;
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({
            "profile_state": runtime
                .config
                .current_uid
                .as_ref()
                .and_then(|uid| runtime.config.users.get(uid))
                .map(|user| user.live_profile_state.clone())
        })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "update_title code={code}, msg={}",
                    error_message(&value, "")
                ),
            )
            .await;
            return Err("登录已失效，请重新扫码登录".into());
        }
        Err(error_message(&value, "更新失败"))
    }
}

#[tauri::command]
pub async fn update_live_tags(req: UpdateTagsReq, state: State<'_, AppState>) -> CmdResult {
    let desired_tags = split_tags(&req.tags);
    let (uid, room_id, csrf, current_tags, cookie) = {
        let runtime = state.runtime.lock().await;
        let uid = runtime
            .config
            .current_uid
            .clone()
            .ok_or_else(|| "未登录".to_string())?;
        let user = runtime
            .config
            .users
            .get(&uid)
            .ok_or_else(|| "未登录".to_string())?;
        (
            uid,
            user.room_id.clone(),
            user.csrf.clone(),
            user.last_tags.clone(),
            user.cookie.clone(),
        )
    };

    if room_id.is_empty() {
        return Err("未获取到直播间号".into());
    }
    if csrf.is_empty() {
        return Err("未获取到 csrf，请尝试刷新账号信息".into());
    }

    state.client.apply_cookie_header(&cookie);

    let to_add: Vec<String> = desired_tags
        .iter()
        .filter(|tag| !current_tags.iter().any(|old| old == *tag))
        .cloned()
        .collect();
    let to_del: Vec<String> = current_tags
        .iter()
        .filter(|tag| !desired_tags.iter().any(|new| new == *tag))
        .cloned()
        .collect();

    for tag in &to_add {
        let mut form = build_room_update_form(&room_id, &csrf);
        form.insert("add_tag".into(), tag.clone());
        let value = state
            .client
            .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
            .await
            .map_err(|error| error.to_string())?;
        let code = value["code"].as_i64().unwrap_or(-1);
        if code != 0 {
            if is_auth_invalid_code(code) {
                mark_current_user_login_invalid(
                    &state,
                    &format!(
                        "update_live_tags(add) tag={tag}, code={code}, msg={}",
                        error_message(&value, "")
                    ),
                )
                .await;
                return Err("登录已失效，请重新扫码登录".into());
            }
            return Err(format!(
                "新增标签失败({tag}): {}",
                error_message(&value, "更新失败")
            ));
        }
    }

    for tag in &to_del {
        let mut form = build_room_update_form(&room_id, &csrf);
        form.insert("del_tag".into(), tag.clone());
        let value = state
            .client
            .post_form("https://api.live.bilibili.com/room/v1/Room/update", &form)
            .await
            .map_err(|error| error.to_string())?;
        let code = value["code"].as_i64().unwrap_or(-1);
        if code != 0 {
            if is_auth_invalid_code(code) {
                mark_current_user_login_invalid(
                    &state,
                    &format!(
                        "update_live_tags(del) tag={tag}, code={code}, msg={}",
                        error_message(&value, "")
                    ),
                )
                .await;
                return Err("登录已失效，请重新扫码登录".into());
            }
            return Err(format!(
                "删除标签失败({tag}): {}",
                error_message(&value, "更新失败")
            ));
        }
    }

    let mut runtime = state.runtime.lock().await;
    if let Some(user) = runtime.config.users.get_mut(&uid) {
        sync_live_profile_state_defaults(user);
        user.last_tags = desired_tags.clone();
        user.live_profile_state.tags.submitted = desired_tags.clone();
        user.live_profile_state.tags.effective = desired_tags.clone();
        user.live_profile_state.tags.transport = "synced".to_string();
        user.live_profile_state.tags.review = "none".to_string();
        user.live_profile_state.tags.message.clear();
        user.live_profile_state.tags.updated_at = current_timestamp();
        user.login_invalid = false;
        user.auth_fail_count = 0;
        user.last_auth_fail_at = 0;
    }
    runtime.session.current_tags = desired_tags.clone();
    save_config(&state.config_path, &runtime.config, &state.master_key);

    Ok(wrap_ok(json!({
        "tags": desired_tags,
        "added": to_add,
        "removed": to_del,
        "profile_state": runtime
            .config
            .users
            .get(&uid)
            .map(|user| user.live_profile_state.clone())
    })))
}

#[tauri::command]
pub async fn start_live(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let area = runtime.session.current_area_id.unwrap_or(235);
    let room_id = runtime.session.room_id.clone();
    let csrf = runtime.session.csrf.clone();
    let room_id_for_rollback = room_id.clone();
    let csrf_for_rollback = csrf.clone();
    drop(runtime);
    let now = chrono::Utc::now().timestamp().to_string();

    let mut form = BTreeMap::new();
    form.insert("room_id".into(), room_id);
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("area_v2".into(), area.to_string());
    form.insert("backup_stream".into(), "0".into());
    form.insert("csrf_token".into(), csrf.clone());
    form.insert("csrf".into(), csrf);
    inject_live_client_identity(&state, &mut form, false).await;
    form.insert("ts".into(), now);
    let form = app_sign(&form);

    let response = state
        .client
        .post_form(
            "https://api.live.bilibili.com/room/v1/Room/startLive",
            &form,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = response["code"].as_i64().unwrap_or(-1);
    if code == 60024 {
        let qr = response["data"]["qr"].as_str().unwrap_or("").to_string();
        return Ok(json!({ "code": 60024, "msg": "需要人脸验证", "qr": qr }));
    }
    if code == 60043 {
        let uid = {
            let runtime = state.runtime.lock().await;
            runtime.session.uid
        };
        let qr = format!(
            "https://www.bilibili.com/blackboard/live/face-auth-middle.html?source_event=400&mid={uid}"
        );
        return Ok(json!({ "code": 60043, "msg": "需要人脸验证", "qr": qr }));
    }
    if code != 0 {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!(
                    "start_live code={code}, msg={}",
                    error_message(&response, "")
                ),
            )
            .await;
            return Err("登录已失效，请重新扫码登录".into());
        }
        return Err(error_message(&response, "开播失败"));
    }

    let stream_data = &response["data"];
    let endpoints = collect_stream_endpoints(stream_data);
    let primary = select_primary_endpoint(&endpoints);
    let primary_context = primary
        .as_ref()
        .map(build_command_template_context)
        .unwrap_or_else(|| CommandTemplateContext {
            server: String::new(),
            stream_key: String::new(),
            stream_code: String::new(),
            stream_url: String::new(),
            protocol: String::new(),
        });

    let (live_control_mode, obs_ws_url, obs_ws_password, start_command_template) = {
        let runtime = state.runtime.lock().await;
        (
            normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
            runtime.config.obs_ws_url.clone(),
            runtime.config.obs_ws_password.clone(),
            runtime.config.on_live_start_command.clone(),
        )
    };

    let linkage_result = match live_control_mode.as_str() {
        "obs_ws" => {
            if primary_context.server.trim().is_empty() || primary_context.stream_key.trim().is_empty() {
                Err("未获取到推流地址或推流密钥，无法执行 OBS WS 联动".to_string())
            } else {
                obs_ws_start_stream(&obs_ws_url, &obs_ws_password, &primary_context).await
            }
        }
        "command" => {
            let command = apply_command_template(&start_command_template, &primary_context);
            spawn_shell_command(&command).await
        }
        _ => Ok(()),
    };

    if let Err(link_error) = linkage_result {
        let mut rollback_form = BTreeMap::new();
        rollback_form.insert("room_id".into(), room_id_for_rollback);
        rollback_form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
        rollback_form.insert("csrf".into(), csrf_for_rollback.clone());
        rollback_form.insert("csrf_token".into(), csrf_for_rollback);
        let _ = state
            .client
            .post_form("https://api.live.bilibili.com/room/v1/Room/stopLive", &rollback_form)
            .await;
        return Err(format!("开播联动失败，已尝试回滚开播状态：{link_error}"));
    }

    let mut runtime = state.runtime.lock().await;
    runtime.session.is_live = true;
    if let Some(uid) = runtime.config.current_uid.clone() {
        if let Some(user) = runtime.config.users.get_mut(&uid) {
            user.login_invalid = false;
            user.auth_fail_count = 0;
            user.last_auth_fail_at = 0;
        }
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);

    let (primary_addr, primary_code) = primary
        .as_ref()
        .map(|item| (item.addr.clone(), item.code.clone()))
        .unwrap_or_default();

    Ok(wrap_ok(json!({
        "rtmp1": {
            "addr": primary_addr,
            "code": primary_code
        },
        "protocols": stream_data["protocols"],
        "endpoints": endpoints,
        "primary_protocol": primary.as_ref().map(|item| item.protocol.clone()).unwrap_or_default(),
        "live_key": stream_data["live_key"],
        "sub_session_key": stream_data["sub_session_key"],
        "status": stream_data["status"],
        "need_face_auth": stream_data["need_face_auth"],
        "service_source": stream_data["service_source"],
        "up_stream_extra": stream_data["up_stream_extra"]
    })))
}

#[tauri::command]
pub async fn stop_live(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    let mut form = BTreeMap::new();
    form.insert("room_id".into(), runtime.session.room_id.clone());
    form.insert("platform".into(), LIVE_PLATFORM_PC_LINK.into());
    form.insert("csrf".into(), runtime.session.csrf.clone());
    form.insert("csrf_token".into(), runtime.session.csrf.clone());
    drop(runtime);

    let value = state
        .client
        .post_form("https://api.live.bilibili.com/room/v1/Room/stopLive", &form)
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let (live_control_mode, obs_ws_url, obs_ws_password, stop_command_template) = {
            let runtime = state.runtime.lock().await;
            (
                normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
                runtime.config.obs_ws_url.clone(),
                runtime.config.obs_ws_password.clone(),
                runtime.config.on_live_stop_command.clone(),
            )
        };
        let empty_context = CommandTemplateContext {
            server: String::new(),
            stream_key: String::new(),
            stream_code: String::new(),
            stream_url: String::new(),
            protocol: String::new(),
        };
        let linkage_result = match live_control_mode.as_str() {
            "obs_ws" => obs_ws_stop_stream(&obs_ws_url, &obs_ws_password).await,
            "command" => {
                let command = apply_command_template(&stop_command_template, &empty_context);
                spawn_shell_command(&command).await
            }
            _ => Ok(()),
        };
        if let Err(error) = linkage_result {
            eprintln!("[live][stop] linkage failed: {error}");
        }

        let mut runtime = state.runtime.lock().await;
        runtime.session.is_live = false;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                user.login_invalid = false;
                user.auth_fail_count = 0;
                user.last_auth_fail_at = 0;
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({})))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("stop_live code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("登录已失效，请重新扫码登录".into());
        }
        Err(error_message(&value, "停播失败"))
    }
}

#[tauri::command]
pub async fn send_danmu(req: DanmuReq, state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    if runtime.session.room_id.is_empty() {
        return Err("未登录".into());
    }

    let room_id = runtime.session.room_id.clone();
    let csrf = runtime.session.csrf.clone();
    drop(runtime);

    let mut params = BTreeMap::new();
    params.insert("web_location".into(), "444.8".into());
    let signed = wbi_signed(&state.client, params)
        .await
        .map_err(|error| error.to_string())?;
    let query = serde_urlencoded::to_string(signed).map_err(|error| error.to_string())?;

    let mut form = BTreeMap::new();
    form.insert("color".into(), "16777215".into());
    form.insert("fontsize".into(), "25".into());
    form.insert("mode".into(), "1".into());
    form.insert("bubble".into(), "0".into());
    form.insert("msg".into(), req.msg);
    form.insert("roomid".into(), room_id);
    form.insert("csrf".into(), csrf.clone());
    form.insert("csrf_token".into(), csrf);
    form.insert("rnd".into(), chrono::Utc::now().timestamp().to_string());

    let value = state
        .client
        .post_form(
            &format!("https://api.live.bilibili.com/msg/send?{query}"),
            &form,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code == 0 {
        let mut runtime = state.runtime.lock().await;
        if let Some(uid) = runtime.config.current_uid.clone() {
            if let Some(user) = runtime.config.users.get_mut(&uid) {
                user.login_invalid = false;
                user.auth_fail_count = 0;
                user.last_auth_fail_at = 0;
            }
        }
        save_config(&state.config_path, &runtime.config, &state.master_key);
        Ok(wrap_ok(json!({ "msg": "发送成功" })))
    } else {
        if is_auth_invalid_code(code) {
            mark_current_user_login_invalid(
                &state,
                &format!("send_danmu code={code}, msg={}", error_message(&value, "")),
            )
            .await;
            return Err("登录已失效，请重新扫码登录".into());
        }
        Err(error_message(&value, "发送失败"))
    }
}

#[tauri::command]
pub async fn start_danmu_monitor(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if runtime.danmu_task.is_some() {
        return Ok(wrap_ok(json!({ "msg": "already running" })));
    }

    let room_id = runtime.session.room_id.clone();
    let uid = runtime.session.uid;
    if room_id.is_empty() {
        return Err("未登录".into());
    }
    let client = state.client.clone();

    runtime.danmu_task = Some(tokio::spawn(async move {
        if let Ok(info) = get_danmu_info(&client, &room_id).await {
            let token = info["data"]["token"].as_str().unwrap_or("");
            let host = info["data"]["host_list"][0]["host"]
                .as_str()
                .unwrap_or("broadcastlv.chat.bilibili.com");
            let port = info["data"]["host_list"][0]["wss_port"]
                .as_u64()
                .unwrap_or(2245);

            if let Ok((ws, _)) =
                tokio_tungstenite::connect_async(format!("wss://{}:{}/sub", host, port)).await
            {
                let (mut write, mut read) = ws.split();
                let auth = json!({
                    "uid": uid as i64,
                    "roomid": room_id.parse::<u64>().unwrap_or(0),
                    "protover": 3,
                    "platform": "web",
                    "type": 2,
                    "key": token
                })
                .to_string();
                let mut packet = vec![];
                packet.extend_from_slice(&((16 + auth.len()) as u32).to_be_bytes());
                packet.extend_from_slice(&(16u16).to_be_bytes());
                packet.extend_from_slice(&(1u16).to_be_bytes());
                packet.extend_from_slice(&(7u32).to_be_bytes());
                packet.extend_from_slice(&(1u32).to_be_bytes());
                packet.extend_from_slice(auth.as_bytes());
                let _ = write.send(Message::Binary(packet.into())).await;

                let heartbeat = tokio::spawn(async move {
                    loop {
                        let mut heartbeat_packet = vec![];
                        heartbeat_packet.extend_from_slice(&(16u32).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(16u16).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(1u16).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(2u32).to_be_bytes());
                        heartbeat_packet.extend_from_slice(&(1u32).to_be_bytes());
                        if write
                            .send(Message::Binary(heartbeat_packet.into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                    }
                });

                while let Some(Ok(message)) = read.next().await {
                    if let Message::Binary(data) = message {
                        decode_and_emit(&app, &data);
                    }
                }
                heartbeat.abort();
            }
        }
    }));

    Ok(wrap_ok(json!({ "msg": "started" })))
}

#[tauri::command]
pub async fn stop_danmu_monitor(state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
    }
    Ok(wrap_ok(json!({ "msg": "stopped" })))
}
