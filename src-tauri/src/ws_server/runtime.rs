use axum::routing::get;
use axum::Router;
use serde_json::Value;
use std::net::SocketAddr;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, oneshot};

use crate::state::AppState;

use super::handlers::{
    chat_ws_handler, overlay_asset_handler, overlay_index_handler, raw_ws_handler,
    text_emoticon_mappings_handler,
};
use super::net::{normalize_listen_addr, resolve_bind_addr};
use super::types::{WsServerConfig, WsServerRuntimeState};

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
        .route(
            "/api/text_emoticon_mappings",
            get(text_emoticon_mappings_handler),
        )
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
