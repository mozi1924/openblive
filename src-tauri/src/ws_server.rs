use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use serde_json::{json, Value};
use std::ffi::OsStr;
use std::net::{IpAddr, SocketAddr};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};
use tokio::net::{lookup_host, TcpListener};
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio::time::{self, Duration};

use crate::constants::CmdResult;
use crate::state::AppState;

const WS_SERVER_DEFAULT_LISTEN_ADDR: &str = "127.0.0.1:12450";
const CHAT_HEARTBEAT_INTERVAL_SECS: u64 = 10;
const CHAT_DANMU_MAX_BUFFER: usize = 512;
const RAW_DANMU_MAX_BUFFER: usize = 512;
const RAW_EVENT_DANMU: &str = "danmu.message";
const OVERLAY_FALLBACK_INDEX: &str = "overlay/index.html";
const COMPAT_DEFAULT_AVATAR_URL: &str = "//static.hdslb.com/images/member/noface.gif";

#[derive(Clone)]
struct WsServerRuntimeState {
    app: AppHandle,
    auth_token: String,
    bypass_token_for_loopback: bool,
    danmu_tx: broadcast::Sender<Value>,
}

#[derive(Clone)]
struct WsServerConfig {
    enabled: bool,
    listen_addr: String,
    auth_token: String,
    bypass_token_for_loopback: bool,
}

#[derive(Deserialize, Default)]
struct TokenQuery {
    token: Option<String>,
}

#[derive(Deserialize)]
struct CompatIncomingFrame {
    cmd: i64,
    #[allow(dead_code)]
    data: Option<Value>,
}

#[derive(Deserialize)]
struct RawActionFrame {
    #[serde(default)]
    id: Option<Value>,
    action: String,
    #[serde(default)]
    params: Value,
}

#[derive(Default)]
struct CompatSessionState {
    joined: bool,
}

pub async fn sync_ws_server_from_config(app: AppHandle) {
    let config = {
        let state = app.state::<AppState>();
        let runtime = state.runtime.lock().await;
        WsServerConfig {
            enabled: runtime.config.ws_server_enabled,
            listen_addr: runtime.config.ws_server_listen_addr.clone(),
            auth_token: runtime.config.ws_server_auth_token.clone(),
            bypass_token_for_loopback: runtime.config.ws_server_bypass_token_for_loopback,
        }
    };

    let normalized_listen_addr = normalize_listen_addr(&config.listen_addr);
    let fingerprint = format!(
        "{}|{}|{}|{}",
        config.enabled, normalized_listen_addr, config.auth_token, config.bypass_token_for_loopback
    );

    let (should_start, should_stop) = {
        let state = app.state::<AppState>();
        let runtime = state.runtime.lock().await;

        if !config.enabled {
            (false, runtime.ws_server_task.is_some())
        } else {
            let running = runtime
                .ws_server_task
                .as_ref()
                .map(|task| !task.is_finished())
                .unwrap_or(false);
            let changed = runtime.ws_server_runtime_fingerprint != fingerprint;
            if running && !changed {
                return;
            }
            (true, running)
        }
    };

    if should_stop {
        stop_ws_server(&app).await;
    }

    if should_start {
        start_ws_server(
            app,
            normalized_listen_addr,
            config.auth_token,
            config.bypass_token_for_loopback,
            fingerprint,
        )
        .await;
    }
}

async fn stop_ws_server(app: &AppHandle) {
    let (shutdown_tx, task) = {
        let state = app.state::<AppState>();
        let mut runtime = state.runtime.lock().await;
        runtime.ws_server_runtime_fingerprint.clear();
        runtime.ws_server_danmu_tx = None;
        (
            runtime.ws_server_shutdown_tx.take(),
            runtime.ws_server_task.take(),
        )
    };

    if let Some(tx) = shutdown_tx {
        let _ = tx.send(());
    }

    if let Some(task) = task {
        task.abort();
    }
}

async fn start_ws_server(
    app: AppHandle,
    listen_addr: String,
    auth_token: String,
    bypass_token_for_loopback: bool,
    fingerprint: String,
) {
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let (danmu_tx, _) = broadcast::channel::<Value>(1024);

    {
        let state = app.state::<AppState>();
        let mut runtime = state.runtime.lock().await;
        runtime.ws_server_runtime_fingerprint = fingerprint;
        runtime.ws_server_shutdown_tx = Some(shutdown_tx);
        runtime.ws_server_danmu_tx = Some(danmu_tx.clone());
    }

    let app_for_server = app.clone();
    let task = tokio::spawn(async move {
        run_ws_server(
            app_for_server,
            listen_addr,
            auth_token,
            bypass_token_for_loopback,
            danmu_tx,
            shutdown_rx,
        )
        .await;
    });

    let state = app.state::<AppState>();
    let mut runtime = state.runtime.lock().await;
    runtime.ws_server_task = Some(task);
}

async fn run_ws_server(
    app: AppHandle,
    listen_addr: String,
    auth_token: String,
    bypass_token_for_loopback: bool,
    danmu_tx: broadcast::Sender<Value>,
    mut shutdown_rx: oneshot::Receiver<()>,
) {
    let bind_addr = match resolve_bind_addr(&listen_addr).await {
        Ok(addr) => addr,
        Err(error) => {
            crate::runtime_warn!("[ws-server] invalid listen address: {error}");
            return;
        }
    };

    let listener = match TcpListener::bind(bind_addr).await {
        Ok(listener) => listener,
        Err(error) => {
            crate::runtime_warn!("[ws-server] bind failed on {bind_addr}: {error}");
            return;
        }
    };

    let shared_state = Arc::new(WsServerRuntimeState {
        app,
        auth_token,
        bypass_token_for_loopback,
        danmu_tx,
    });

    let router = Router::new()
        .route("/overlay", get(overlay_index_handler))
        .route("/overlay/{*path}", get(overlay_asset_handler))
        .route("/api/chat", get(chat_ws_handler))
        .route("/ws", get(raw_ws_handler))
        .with_state(shared_state);

    crate::runtime_log!("[ws-server] listening on http://{bind_addr}");

    let server = axum::serve(
        listener,
        router.into_make_service_with_connect_info::<SocketAddr>(),
    );

    tokio::select! {
        _ = &mut shutdown_rx => {
            crate::runtime_log!("[ws-server] shutdown signal received");
        }
        result = server => {
            if let Err(error) = result {
                crate::runtime_warn!("[ws-server] server exited with error: {error}");
            }
        }
    }
}

fn normalize_listen_addr(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return WS_SERVER_DEFAULT_LISTEN_ADDR.to_string();
    }

    trimmed
        .strip_prefix("http://")
        .or_else(|| trimmed.strip_prefix("https://"))
        .unwrap_or(trimmed)
        .trim_end_matches('/')
        .to_string()
}

async fn resolve_bind_addr(listen_addr: &str) -> Result<SocketAddr, String> {
    if let Ok(addr) = listen_addr.parse::<SocketAddr>() {
        return Ok(addr);
    }

    let mut resolved = lookup_host(listen_addr)
        .await
        .map_err(|error| format!("resolve {listen_addr} failed: {error}"))?;
    resolved
        .next()
        .ok_or_else(|| format!("resolve {listen_addr} returned no address"))
}

fn is_loopback(addr: SocketAddr) -> bool {
    match addr.ip() {
        IpAddr::V4(ip) => ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_loopback(),
    }
}

fn is_authorized(
    headers: &HeaderMap,
    query_token: Option<&str>,
    addr: SocketAddr,
    state: &WsServerRuntimeState,
) -> bool {
    if state.auth_token.trim().is_empty() {
        return true;
    }

    if state.bypass_token_for_loopback && is_loopback(addr) {
        return true;
    }

    if query_token.map(str::trim).filter(|token| !token.is_empty()) == Some(state.auth_token.trim())
    {
        return true;
    }

    if let Some(header_value) = headers.get("x-openblive-token") {
        if let Ok(token) = header_value.to_str() {
            if token.trim() == state.auth_token.trim() {
                return true;
            }
        }
    }

    false
}

async fn overlay_index_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
) -> impl IntoResponse {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    serve_overlay_path(&state.app, Path::new("overlay/index.html"), true).await
}

async fn overlay_asset_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> impl IntoResponse {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    let clean = sanitize_overlay_subpath(path.as_str());
    if clean.is_empty() {
        return serve_overlay_path(&state.app, Path::new("overlay/index.html"), true).await;
    }
    let wants_spa_fallback = Path::new(&clean).extension().is_none();
    serve_overlay_path(
        &state.app,
        Path::new("overlay").join(clean).as_path(),
        wants_spa_fallback,
    )
    .await
}

async fn chat_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
) -> impl IntoResponse {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    ws.on_upgrade(move |socket| compat_ws_session(socket, state))
        .into_response()
}

async fn raw_ws_handler(
    ws: WebSocketUpgrade,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
) -> impl IntoResponse {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    ws.on_upgrade(move |socket| raw_ws_session(socket, state))
        .into_response()
}

async fn compat_ws_session(socket: WebSocket, state: Arc<WsServerRuntimeState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (out_tx, mut out_rx) = mpsc::channel::<Message>(CHAT_DANMU_MAX_BUFFER);

    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if ws_sender.send(message).await.is_err() {
                break;
            }
        }
    });

    let joined_state = Arc::new(tokio::sync::Mutex::new(CompatSessionState::default()));
    let joined_state_for_pump = joined_state.clone();
    let mut danmu_rx = state.danmu_tx.subscribe();
    let out_tx_for_pump = out_tx.clone();
    let pump = tokio::spawn(async move {
        let mut heartbeat = time::interval(Duration::from_secs(CHAT_HEARTBEAT_INTERVAL_SECS));
        loop {
            tokio::select! {
                _ = heartbeat.tick() => {
                    let frame = json!({"cmd": 0, "data": {}});
                    if out_tx_for_pump.send(Message::Text(frame.to_string().into())).await.is_err() {
                        break;
                    }
                }
                payload = danmu_rx.recv() => {
                    let payload = match payload {
                        Ok(value) => value,
                        Err(_) => continue,
                    };
                    let joined = {
                        let guard = joined_state_for_pump.lock().await;
                        guard.joined
                    };
                    if !joined {
                        continue;
                    }
                    if let Some(frame) = map_danmu_to_compat_frame(&payload) {
                        if out_tx_for_pump
                            .send(Message::Text(frame.to_string().into()))
                            .await
                            .is_err()
                        {
                            break;
                        }
                    }
                }
            }
        }
    });

    while let Some(Ok(message)) = ws_receiver.next().await {
        let text = match message {
            Message::Text(text) => text,
            Message::Binary(bytes) => String::from_utf8_lossy(&bytes).into_owned().into(),
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => continue,
        };

        if let Ok(frame) = serde_json::from_str::<CompatIncomingFrame>(&text) {
            if frame.cmd == 1 {
                let mut guard = joined_state.lock().await;
                guard.joined = true;
                // roomId / roomKey / 身份码相关字段全部兼容接收，但忽略。
            }
        }
    }

    pump.abort();
    writer.abort();
}

async fn raw_ws_session(socket: WebSocket, state: Arc<WsServerRuntimeState>) {
    let (mut ws_sender, mut ws_receiver) = socket.split();

    let (out_tx, mut out_rx) = mpsc::channel::<Message>(RAW_DANMU_MAX_BUFFER);
    let writer = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if ws_sender.send(message).await.is_err() {
                break;
            }
        }
    });

    let mut danmu_rx = state.danmu_tx.subscribe();
    let out_tx_for_events = out_tx.clone();
    let event_pump = tokio::spawn(async move {
        loop {
            let payload = match danmu_rx.recv().await {
                Ok(payload) => payload,
                Err(_) => continue,
            };
            let frame = json!({
                "event": RAW_EVENT_DANMU,
                "data": payload,
                "at": now_unix_secs(),
            });
            if out_tx_for_events
                .send(Message::Text(frame.to_string().into()))
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let ready = json!({
        "event": "ready",
        "data": {
            "service": "openblive-ws",
            "version": 1,
        },
        "at": now_unix_secs(),
    });
    let _ = out_tx.send(Message::Text(ready.to_string().into())).await;

    while let Some(Ok(message)) = ws_receiver.next().await {
        let text = match message {
            Message::Text(text) => text,
            Message::Binary(bytes) => String::from_utf8_lossy(&bytes).into_owned().into(),
            Message::Close(_) => break,
            Message::Ping(_) | Message::Pong(_) => continue,
        };

        let parsed = match serde_json::from_str::<RawActionFrame>(&text) {
            Ok(parsed) => parsed,
            Err(error) => {
                let err_frame = json!({
                    "id": Value::Null,
                    "ok": false,
                    "error": {
                        "code": "BAD_REQUEST",
                        "message": format!("invalid json frame: {error}"),
                    }
                });
                if out_tx
                    .send(Message::Text(err_frame.to_string().into()))
                    .await
                    .is_err()
                {
                    break;
                }
                continue;
            }
        };

        let request_id = parsed.id.clone().unwrap_or(Value::Null);
        let result = run_action(&state, parsed.action.as_str(), parsed.params).await;
        let response = match result {
            Ok(result) => json!({
                "id": request_id,
                "ok": true,
                "result": result,
            }),
            Err(error) => json!({
                "id": request_id,
                "ok": false,
                "error": {
                    "code": "ACTION_FAILED",
                    "message": error,
                }
            }),
        };

        if out_tx
            .send(Message::Text(response.to_string().into()))
            .await
            .is_err()
        {
            break;
        }
    }

    event_pump.abort();
    writer.abort();
}

async fn run_action(
    state: &WsServerRuntimeState,
    action: &str,
    _params: Value,
) -> Result<Value, String> {
    match action {
        "live.start" => invoke_cmd(
            crate::commands::start_live_flow_inner(&state.app, &state.app.state::<AppState>())
                .await,
        ),
        "live.stop" => invoke_cmd(
            crate::commands::stop_live_flow_inner(&state.app, &state.app.state::<AppState>()).await,
        ),
        "danmu.start" => invoke_cmd(
            crate::commands::start_danmu_monitor_for_ws(&state.app, &state.app.state::<AppState>())
                .await,
        ),
        "danmu.stop" => invoke_cmd(
            crate::commands::stop_danmu_monitor_for_ws(&state.app.state::<AppState>()).await,
        ),
        "session.get" => {
            let app_state = state.app.state::<AppState>();
            let runtime = app_state.runtime.lock().await;
            Ok(json!({
                "session": runtime.session,
                "danmu_running": runtime.danmu_task.is_some(),
                "overlay_enabled": runtime.config.danmu_overlay_enabled,
            }))
        }
        "server.ping" => Ok(json!({ "pong": true, "at": now_unix_secs() })),
        _ => Err(format!("unknown action: {action}")),
    }
}

fn invoke_cmd(result: CmdResult) -> Result<Value, String> {
    result.map_err(|error| error.to_string())
}

fn map_danmu_to_compat_frame(payload: &Value) -> Option<Value> {
    let msg_type = payload.get("type")?.as_str().unwrap_or("");
    match msg_type {
        "danmu" => Some(json!({
            "cmd": 2,
            "data": build_compat_text_data(payload),
        })),
        "interact" => Some(json!({
            "cmd": 2,
            "data": build_compat_interact_text_data(payload),
        })),
        "gift" => Some(json!({
            "cmd": 3,
            "data": build_compat_gift_data(payload),
        })),
        "guard" => Some(json!({
            "cmd": 4,
            "data": build_compat_member_data(payload),
        })),
        "superchat" => Some(json!({
            "cmd": 5,
            "data": build_compat_super_chat_data(payload),
        })),
        "moderation" => {
            let deleted_ids = payload
                .get("deleted_ids")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if deleted_ids.is_empty() {
                None
            } else {
                Some(json!({
                    "cmd": 6,
                    "data": { "ids": deleted_ids },
                }))
            }
        }
        "recall" => {
            let target = payload
                .get("recall_target_id")
                .and_then(Value::as_str)
                .map(str::to_string)
                .filter(|value| !value.trim().is_empty());
            if let Some(target) = target {
                Some(json!({
                    "cmd": 6,
                    "data": { "ids": [target] },
                }))
            } else {
                Some(json!({
                    "cmd": 2,
                    "data": build_compat_system_text_data(payload),
                }))
            }
        }
        _ => Some(json!({
            "cmd": 2,
            "data": build_compat_system_text_data(payload),
        })),
    }
}

fn build_compat_text_data(payload: &Value) -> Value {
    let avatar = normalize_avatar_url(
        payload
            .get("sender_face")
            .and_then(Value::as_str)
            .unwrap_or(""),
    );
    let sender = payload
        .get("sender")
        .and_then(Value::as_str)
        .unwrap_or("viewer")
        .to_string();
    let role = payload
        .get("sender_role")
        .and_then(Value::as_str)
        .unwrap_or("viewer");
    let author_type = match role {
        "anchor" => 3,
        "admin" => 2,
        "guard" => 1,
        _ => 0,
    };
    let sender_guard_level = payload
        .get("sender_guard_level")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("compat-{}", now_unix_secs()));
    let content = payload
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    json!([
        avatar,
        now_unix_secs(),
        sender,
        author_type,
        content,
        sender_guard_level,
        0,
        1,
        0,
        1,
        0,
        id,
        "",
        0,
        [],
        [],
        uid,
        "",
        0,
    ])
}

fn build_compat_interact_text_data(payload: &Value) -> Value {
    let avatar = normalize_avatar_url(
        payload
            .get("sender_face")
            .and_then(Value::as_str)
            .unwrap_or(""),
    );
    let sender = payload
        .get("sender")
        .and_then(Value::as_str)
        .unwrap_or("i18n.live.event.fallback.viewer")
        .to_string();
    let role = payload
        .get("sender_role")
        .and_then(Value::as_str)
        .unwrap_or("viewer");
    let author_type = match role {
        "anchor" => 3,
        "admin" | "system" => 2,
        "guard" => 1,
        _ => 0,
    };
    let sender_guard_level = payload
        .get("sender_guard_level")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let id = payload
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("compat-interact-{}", now_unix_secs()));
    let mut content = payload
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let sender_prefix = format!("{sender} ");
    if content.starts_with(&sender_prefix) {
        content = content[sender_prefix.len()..].to_string();
    }

    json!([
        avatar,
        now_unix_secs(),
        sender,
        author_type,
        content,
        sender_guard_level,
        0,
        1,
        0,
        1,
        0,
        id,
        "",
        0,
        [],
        [],
        uid,
        "",
        0,
    ])
}

fn build_compat_system_text_data(payload: &Value) -> Value {
    json!([
        COMPAT_DEFAULT_AVATAR_URL,
        now_unix_secs(),
        payload
            .get("sender")
            .and_then(Value::as_str)
            .unwrap_or("openblive"),
        2,
        payload.get("content").and_then(Value::as_str).unwrap_or(""),
        0,
        0,
        60,
        0,
        1,
        0,
        payload.get("id").and_then(Value::as_str).unwrap_or(""),
        "",
        0,
        [],
        [],
        "",
        "",
        0,
    ])
}

fn build_compat_gift_data(payload: &Value) -> Value {
    let total_coin = payload
        .get("gift_total_coin")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    let is_paid = payload
        .get("gift_coin_type")
        .and_then(Value::as_str)
        .map(|kind| kind.eq_ignore_ascii_case("gold"))
        .unwrap_or(true);
    json!({
        "id": payload.get("id").and_then(Value::as_str).unwrap_or(""),
        "avatarUrl": normalize_avatar_url(
            payload
                .get("sender_face")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "totalCoin": if is_paid { total_coin } else { 0 },
        "totalFreeCoin": if is_paid { 0 } else { total_coin },
        "giftName": payload.get("gift_name").and_then(Value::as_str).unwrap_or("Gift"),
        "num": payload.get("gift_count").and_then(Value::as_i64).unwrap_or(1),
        "giftId": 0,
        "giftIconUrl": "",
        "uid": payload.get("sender_uid").and_then(Value::as_u64).map(|v| v.to_string()).unwrap_or_default(),
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "medalLevel": 0,
        "medalName": "",
    })
}

fn build_compat_member_data(payload: &Value) -> Value {
    let num = payload
        .get("gift_count")
        .and_then(Value::as_i64)
        .unwrap_or(1)
        .max(1);
    let total_coin = payload
        .get("gift_total_coin")
        .and_then(Value::as_i64)
        .unwrap_or(0);

    json!({
        "id": payload.get("id").and_then(Value::as_str).unwrap_or(""),
        "avatarUrl": normalize_avatar_url(
            payload
                .get("sender_face")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "num": num,
        "unit": "月",
        "total_coin": total_coin,
        "uid": payload.get("sender_uid").and_then(Value::as_u64).map(|v| v.to_string()).unwrap_or_default(),
        "medalLevel": 0,
        "medalName": "",
    })
}

fn build_compat_super_chat_data(payload: &Value) -> Value {
    json!({
        "id": payload.get("superchat_id").and_then(Value::as_i64).map(|v| v.to_string()).unwrap_or_else(|| payload.get("id").and_then(Value::as_str).unwrap_or("").to_string()),
        "avatarUrl": normalize_avatar_url(
            payload
                .get("sender_face")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "price": payload.get("superchat_price").and_then(Value::as_i64).unwrap_or(0),
        "content": payload.get("content").and_then(Value::as_str).unwrap_or(""),
        "translation": "",
        "uid": payload.get("sender_uid").and_then(Value::as_u64).map(|v| v.to_string()).unwrap_or_default(),
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "medalLevel": 0,
        "medalName": "",
    })
}

fn normalize_avatar_url(avatar_url: &str) -> String {
    let trimmed = avatar_url.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    if let Some(without_scheme) = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
    {
        return format!("//{without_scheme}");
    }
    trimmed.to_string()
}

fn now_unix_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

pub fn broadcast_danmu_message(app: &AppHandle, payload: &Value) {
    let app_handle = app.clone();
    let payload = payload.clone();
    tokio::spawn(async move {
        let app_state = app_handle.state::<AppState>();
        let tx = {
            let runtime = app_state.runtime.lock().await;
            runtime.ws_server_danmu_tx.clone()
        };
        if let Some(tx) = tx {
            let _ = tx.send(payload);
        }
    });
}

fn sanitize_overlay_subpath(path: &str) -> String {
    let clean = path.trim().trim_start_matches('/').replace('\\', "/");
    clean
        .split('/')
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .collect::<Vec<_>>()
        .join("/")
}

fn overlay_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        roots.push(resource_dir.clone());
        roots.push(resource_dir.join("dist"));
        roots.push(resource_dir.join("overlay-compat").join("dist"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.join("dist"));
        roots.push(cwd.join("overlay-compat").join("dist"));
        if let Some(parent) = cwd.parent() {
            roots.push(parent.join("dist"));
            roots.push(parent.join("overlay-compat").join("dist"));
        }
    }
    roots
}

async fn serve_overlay_path(app: &AppHandle, rel_path: &Path, spa_fallback: bool) -> Response {
    for root in overlay_roots(app) {
        let target = root.join(rel_path);
        if let Ok(bytes) = tokio::fs::read(&target).await {
            let mut response = (StatusCode::OK, bytes).into_response();
            let mime = infer_mime(&target);
            response
                .headers_mut()
                .insert("content-type", HeaderValue::from_static(mime));
            return response;
        }
    }

    if spa_fallback {
        for root in overlay_roots(app) {
            let fallback = root.join(OVERLAY_FALLBACK_INDEX);
            if let Ok(bytes) = tokio::fs::read(&fallback).await {
                let mut response = (StatusCode::OK, bytes).into_response();
                response.headers_mut().insert(
                    "content-type",
                    HeaderValue::from_static("text/html; charset=utf-8"),
                );
                return response;
            }
        }
    }

    (
        StatusCode::NOT_FOUND,
        "overlay assets not found, please run `pnpm build:overlay`",
    )
        .into_response()
}

fn infer_mime(path: &Path) -> &'static str {
    match path.extension().and_then(OsStr::to_str).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "map" => "application/json; charset=utf-8",
        _ => "application/octet-stream",
    }
}
