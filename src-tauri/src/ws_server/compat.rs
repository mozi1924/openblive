use axum::extract::ws::{Message, WebSocket};
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio::time::{self, Duration};

use super::constants::{
    CHAT_DANMU_MAX_BUFFER, CHAT_HEARTBEAT_INTERVAL_SECS, COMPAT_DEFAULT_AVATAR_URL,
};
use super::types::{CompatIncomingFrame, CompatSessionState, WsServerRuntimeState};
use super::utils::now_unix_secs;

use std::path::Path;
use tauri::Manager;
use crate::state::AppState;

pub(in crate::ws_server) async fn compat_ws_session(
    socket: WebSocket,
    state: Arc<WsServerRuntimeState>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (out_tx, mut out_rx) = mpsc::channel::<Message>(CHAT_DANMU_MAX_BUFFER);
    let config_path = state.app.state::<AppState>().config_path.clone();

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
    let config_path_for_pump = config_path.clone();
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
                    if let Some(frame) = map_danmu_to_compat_frame(&payload, &config_path_for_pump) {
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
                let should_send_recent = {
                    let mut guard = joined_state.lock().await;
                    let should_send = !guard.joined;
                    guard.joined = true;
                    should_send
                };
                // roomId / roomKey / 身份码相关字段全部兼容接收，但忽略。
                if should_send_recent {
                    let recent_messages =
                        super::raw::fetch_recent_danmu_messages_for_ws(&state.app).await;
                    for payload in recent_messages {
                        if let Some(frame) = map_danmu_to_compat_frame(&payload, &config_path) {
                            if out_tx
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
        }
    }

    pump.abort();
    writer.abort();
}

fn resolve_avatar_for_compat(config_path: &Path, uid: &str, raw_face: &str) -> String {
    let uid = uid.trim();
    let raw_face = raw_face.trim();

    if !uid.is_empty() {
        if let Some(cached) = crate::avatar::load_cached_face_data_url(config_path, uid) {
            return cached;
        }
    }

    if !uid.is_empty() || !raw_face.is_empty() {
        let encoded_face = urlencoding::encode(raw_face);
        return format!("/api/avatar_url?uid={uid}&face={encoded_face}");
    }

    COMPAT_DEFAULT_AVATAR_URL.to_string()
}

fn map_danmu_to_compat_frame(payload: &Value, config_path: &Path) -> Option<Value> {
    let msg_type = payload.get("type")?.as_str().unwrap_or("");
    match msg_type {
        "danmu" => Some(json!({
            "cmd": 2,
            "data": build_compat_text_data(payload, config_path),
        })),
        "interact" => Some(json!({
            "cmd": 2,
            "data": build_compat_interact_text_data(payload, config_path),
        })),
        "gift" => Some(json!({
            "cmd": 3,
            "data": build_compat_gift_data(payload, config_path),
        })),
        "guard" => Some(json!({
            "cmd": 4,
            "data": build_compat_member_data(payload, config_path),
        })),
        "superchat" => Some(json!({
            "cmd": 5,
            "data": build_compat_super_chat_data(payload, config_path),
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


fn build_compat_text_data(payload: &Value, config_path: &Path) -> Value {
    let raw_face = payload
        .get("sender_face")
        .and_then(Value::as_str)
        .unwrap_or("");
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let avatar = resolve_avatar_for_compat(config_path, &uid, raw_face);

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
    let emoticon_url = payload
        .get("emoticon")
        .and_then(|value| value.get("url"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let content_type = if emoticon_url.is_some() { 1 } else { 0 };
    let content_type_params = emoticon_url
        .map(|url| json!([url]))
        .unwrap_or_else(|| json!([]));

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
        content_type,
        content_type_params,
        [],
        uid,
        "",
        0,
    ])
}

fn build_compat_interact_text_data(payload: &Value, config_path: &Path) -> Value {
    let raw_face = payload
        .get("sender_face")
        .and_then(Value::as_str)
        .unwrap_or("");
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|value| value.to_string())
        .unwrap_or_default();
    let avatar = resolve_avatar_for_compat(config_path, &uid, raw_face);

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

fn build_compat_gift_data(payload: &Value, config_path: &Path) -> Value {
    let raw_face = payload
        .get("sender_face")
        .and_then(Value::as_str)
        .unwrap_or("");
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|v| v.to_string())
        .unwrap_or_default();
    let avatar = resolve_avatar_for_compat(config_path, &uid, raw_face);

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
        "avatarUrl": avatar,
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "totalCoin": if is_paid { total_coin } else { 0 },
        "totalFreeCoin": if is_paid { 0 } else { total_coin },
        "giftName": payload.get("gift_name").and_then(Value::as_str).unwrap_or("Gift"),
        "num": payload.get("gift_count").and_then(Value::as_i64).unwrap_or(1),
        "giftId": 0,
        "giftIconUrl": "",
        "uid": uid,
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "medalLevel": 0,
        "medalName": "",
    })
}

fn build_compat_member_data(payload: &Value, config_path: &Path) -> Value {
    let raw_face = payload
        .get("sender_face")
        .and_then(Value::as_str)
        .unwrap_or("");
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|v| v.to_string())
        .unwrap_or_default();
    let avatar = resolve_avatar_for_compat(config_path, &uid, raw_face);

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
        "avatarUrl": avatar,
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "uid": uid,
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "num": num,
        "unit": "月",
        "total_coin": total_coin,
        "medalLevel": 0,
        "medalName": "",
    })
}

fn build_compat_super_chat_data(payload: &Value, config_path: &Path) -> Value {
    let raw_face = payload
        .get("sender_face")
        .and_then(Value::as_str)
        .unwrap_or("");
    let uid = payload
        .get("sender_uid")
        .and_then(Value::as_u64)
        .map(|v| v.to_string())
        .unwrap_or_default();
    let avatar = resolve_avatar_for_compat(config_path, &uid, raw_face);

    json!({
        "id": payload.get("superchat_id").and_then(Value::as_i64).map(|v| v.to_string()).unwrap_or_else(|| payload.get("id").and_then(Value::as_str).unwrap_or("").to_string()),
        "avatarUrl": avatar,
        "timestamp": now_unix_secs(),
        "authorName": payload.get("sender").and_then(Value::as_str).unwrap_or("viewer"),
        "price": payload.get("superchat_price").and_then(Value::as_i64).unwrap_or(0),
        "content": payload.get("content").and_then(Value::as_str).unwrap_or(""),
        "translation": "",
        "uid": uid,
        "privilegeType": payload.get("sender_guard_level").and_then(Value::as_i64).unwrap_or(0),
        "medalLevel": 0,
        "medalName": "",
    })
}



