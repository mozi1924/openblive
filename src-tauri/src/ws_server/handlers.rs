use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{ConnectInfo, Query, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;
use std::net::SocketAddr;
use std::path::Path;
use std::sync::Arc;

use super::auth::is_authorized;
use super::compat::compat_ws_session;
use super::emoticon::fetch_text_emoticon_mappings;
use super::overlay::{sanitize_overlay_subpath, serve_overlay_path};
use super::raw::raw_ws_session;
use super::types::{TokenQuery, WsServerRuntimeState};

pub(in crate::ws_server) async fn overlay_index_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
) -> Response {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    serve_overlay_path(&state.app, Path::new("overlay/index.html"), true).await
}

pub(in crate::ws_server) async fn overlay_asset_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
    axum::extract::Path(path): axum::extract::Path<String>,
) -> Response {
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

pub(in crate::ws_server) async fn chat_ws_handler(
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

pub(in crate::ws_server) async fn text_emoticon_mappings_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
) -> Response {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (StatusCode::UNAUTHORIZED, "unauthorized").into_response();
    }

    let mappings = fetch_text_emoticon_mappings(&state.app).await;
    let mut response = Json(json!({ "textEmoticons": mappings })).into_response();
    response.headers_mut().insert(
        "cache-control",
        HeaderValue::from_static("private, max-age=60"),
    );
    response
}

pub(in crate::ws_server) async fn raw_ws_handler(
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

#[derive(serde::Deserialize, Default)]
pub(in crate::ws_server) struct RestActionBody {
    pub action: Option<String>,
    pub params: Option<serde_json::Value>,
}

pub(in crate::ws_server) async fn rest_action_post_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
    axum::extract::Json(body): axum::extract::Json<RestActionBody>,
) -> Response {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "unauthorized" } })),
        )
            .into_response();
    }

    let action_name = body.action.unwrap_or_default();
    if action_name.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": { "code": "BAD_REQUEST", "message": "action is required" } })),
        )
            .into_response();
    }

    let params = body.params.unwrap_or(serde_json::Value::Null);
    match super::action::dispatch_action(&state.app, &action_name, params).await {
        Ok(result) => Json(json!({ "ok": true, "result": result })).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": { "code": "ACTION_FAILED", "message": error } })),
        )
            .into_response(),
    }
}

pub(in crate::ws_server) async fn rest_action_path_handler(
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Query(query): Query<TokenQuery>,
    State(state): State<Arc<WsServerRuntimeState>>,
    axum::extract::Path(action): axum::extract::Path<String>,
    body: Option<axum::extract::Json<serde_json::Value>>,
) -> Response {
    if !is_authorized(&headers, query.token.as_deref(), addr, &state) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "ok": false, "error": { "code": "UNAUTHORIZED", "message": "unauthorized" } })),
        )
            .into_response();
    }

    let params = body.map(|b| b.0).unwrap_or(serde_json::Value::Null);
    match super::action::dispatch_action(&state.app, &action, params).await {
        Ok(result) => Json(json!({ "ok": true, "result": result })).into_response(),
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": { "code": "ACTION_FAILED", "message": error } })),
        )
            .into_response(),
    }
}
