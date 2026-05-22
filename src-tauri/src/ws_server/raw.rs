use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::mpsc;

use super::constants::{RAW_DANMU_MAX_BUFFER, RAW_EVENT_DANMU};
use super::types::{RawActionFrame, WsServerRuntimeState};
use super::utils::{invoke_cmd, now_unix_secs};
use crate::state::AppState;

pub(in crate::ws_server) async fn raw_ws_session(socket: WebSocket, state: Arc<WsServerRuntimeState>) {
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
    let recent_messages = fetch_recent_danmu_messages_for_ws(&state.app).await;
    if !recent_messages.is_empty() {
        let frame = json!({
            "event": "danmu.recent",
            "data": {
                "messages": recent_messages,
            },
            "at": now_unix_secs(),
        });
        let _ = out_tx.send(Message::Text(frame.to_string().into())).await;
    }

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

async fn run_action(state: &WsServerRuntimeState, action: &str, _params: Value) -> Result<Value, String> {
    match action {
        "live.start" => invoke_cmd(
            crate::commands::start_live_flow_inner(&state.app, &state.app.state::<AppState>()).await,
        ),
        "live.stop" => invoke_cmd(
            crate::commands::stop_live_flow_inner(&state.app, &state.app.state::<AppState>()).await,
        ),
        "danmu.start" => invoke_cmd(
            crate::commands::start_danmu_monitor_for_ws(&state.app, &state.app.state::<AppState>()).await,
        ),
        "danmu.stop" => invoke_cmd(
            crate::commands::stop_danmu_monitor_for_ws(&state.app.state::<AppState>()).await,
        ),
        "danmu.recent" => invoke_cmd(crate::commands::get_recent_danmu_for_ws(&state.app.state::<AppState>()).await),
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

pub(in crate::ws_server) async fn fetch_recent_danmu_messages_for_ws(app: &tauri::AppHandle) -> Vec<Value> {
    let app_state = app.state::<AppState>();
    match crate::commands::get_recent_danmu_for_ws(&app_state).await {
        Ok(payload) => payload
            .get("data")
            .and_then(|value| value.get("messages"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default(),
        Err(error) => {
            crate::runtime_warn!("[ws-server] fetch recent danmu failed: {error}");
            Vec::new()
        }
    }
}
