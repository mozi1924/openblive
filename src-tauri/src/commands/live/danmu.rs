use crate::bili::get_danmu_info;
use crate::constants::CmdResult;
use crate::danmu::decode_and_emit;
use crate::endpoints;
use crate::state::AppState;
use crate::state_event::{emit_runtime_snapshot, emit_studio_state_event};
use chrono::{FixedOffset, NaiveDateTime, TimeZone};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use serde_json::json;
use std::time::Duration;
use tauri::{AppHandle, Manager};
use tokio_tungstenite::tungstenite::Message;

const DANMU_RECONNECT_BASE_MS: u64 = 500;
const DANMU_RECONNECT_MAX_MS: u64 = 30_000;
const DANMU_RECONNECT_JITTER_MS: u64 = 500;

#[derive(Clone)]
struct DanmuHost {
    host: String,
    port: u64,
}

fn extract_danmu_hosts(info: &serde_json::Value) -> Vec<DanmuHost> {
    let default_host = endpoints::danmu_default_host();
    let default_port = endpoints::danmu_default_wss_port();
    let mut hosts = info["data"]["host_list"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let host = item["host"].as_str().unwrap_or("").trim();
                    if host.is_empty() {
                        return None;
                    }
                    Some(DanmuHost {
                        host: host.to_string(),
                        port: item["wss_port"].as_u64().unwrap_or(default_port),
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if hosts.is_empty() {
        hosts.push(DanmuHost {
            host: default_host,
            port: default_port,
        });
    }
    hosts
}

fn danmu_reconnect_delay(attempt: u32) -> Duration {
    let exp = attempt.min(8);
    let scale = 2u64.saturating_pow(exp);
    let base = DANMU_RECONNECT_BASE_MS.saturating_mul(scale);
    let capped = base.min(DANMU_RECONNECT_MAX_MS);
    let jitter = rand::thread_rng().gen_range(0..=DANMU_RECONNECT_JITTER_MS);
    Duration::from_millis(capped.saturating_add(jitter))
}

fn parse_history_created_at_ms(timeline: &str) -> Option<i64> {
    let naive = NaiveDateTime::parse_from_str(timeline, "%Y-%m-%d %H:%M:%S").ok()?;
    let offset = FixedOffset::east_opt(8 * 3600)?;
    let dt = offset.from_local_datetime(&naive).single()?;
    Some(dt.timestamp_millis())
}

fn normalize_history_time_text(timeline: &str) -> String {
    let trimmed = timeline.trim();
    if trimmed.len() >= 8 {
        return trimmed[trimmed.len() - 8..].to_string();
    }
    if trimmed.is_empty() {
        return chrono::Local::now().format("%H:%M:%S").to_string();
    }
    trimmed.to_string()
}

fn parse_i64_maybe(value: &serde_json::Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_u64().and_then(|num| i64::try_from(num).ok()))
        .or_else(|| value.as_str().and_then(|raw| raw.parse::<i64>().ok()))
}

fn parse_u64_maybe(value: &serde_json::Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_i64().and_then(|num| u64::try_from(num).ok()))
        .or_else(|| value.as_str().and_then(|raw| raw.parse::<u64>().ok()))
}

fn normalize_history_asset_url(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("//") {
        return Some(format!("https:{trimmed}"));
    }
    if let Some(stripped) = trimmed.strip_prefix("http://") {
        return Some(format!("https://{stripped}"));
    }
    Some(trimmed.to_string())
}

fn history_sender_guard_level(entry: &serde_json::Value) -> i64 {
    if let Some(level) = entry.get("guard_level").and_then(parse_i64_maybe) {
        return level.max(0);
    }
    entry
        .get("medal")
        .and_then(serde_json::Value::as_array)
        .and_then(|value| value.get(10))
        .and_then(parse_i64_maybe)
        .unwrap_or(0)
        .max(0)
}

fn history_sender_role(
    entry: &serde_json::Value,
    sender_uid: Option<u64>,
    anchor_uid: u64,
) -> &'static str {
    if anchor_uid > 0 && sender_uid == Some(anchor_uid) {
        return "anchor";
    }
    let is_admin = entry.get("isadmin").and_then(parse_i64_maybe).unwrap_or(0) > 0;
    if is_admin {
        return "admin";
    }
    let guard_level = history_sender_guard_level(entry);
    if guard_level > 0 {
        return "guard";
    }
    "viewer"
}

fn map_history_entry_to_danmu(
    entry: &serde_json::Value,
    source: &str,
    index: usize,
    anchor_uid: u64,
) -> serde_json::Value {
    let timeline = entry
        .get("timeline")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    let created_at_ms = parse_history_created_at_ms(&timeline);
    let sender_uid = entry.get("uid").and_then(parse_u64_maybe);
    let content = entry
        .get("text")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
        .to_string();
    let sender = entry
        .get("nickname")
        .and_then(serde_json::Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("i18n.live.event.fallback.anonymous_user")
        .to_string();
    let sender_name_color = entry
        .get("uname_color")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            if value.starts_with('#') {
                value.to_string()
            } else {
                format!("#{value}")
            }
        });
    let sender_face = entry
        .get("user")
        .and_then(|value| value.get("base"))
        .and_then(|value| value.get("face"))
        .and_then(serde_json::Value::as_str)
        .and_then(normalize_history_asset_url)
        .or_else(|| {
            entry
                .get("user")
                .and_then(|value| value.get("base"))
                .and_then(|value| value.get("origin_info"))
                .and_then(|value| value.get("face"))
                .and_then(serde_json::Value::as_str)
                .and_then(normalize_history_asset_url)
        });
    let danmu_id_str = entry
        .get("id_str")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let danmu_rnd = entry.get("rnd").and_then(parse_i64_maybe);
    let sender_guard_level = history_sender_guard_level(entry);
    let id = danmu_id_str.clone().unwrap_or_else(|| {
        if let Some(rnd) = danmu_rnd {
            format!("history-{source}-{rnd}")
        } else if let Some(uid) = sender_uid {
            format!("history-{source}-{uid}-{index}")
        } else {
            format!("history-{source}-{index}")
        }
    });

    json!({
        "id": id,
        "type": "danmu",
        "time": normalize_history_time_text(&timeline),
        "created_at_ms": created_at_ms,
        "sender": sender,
        "content": content,
        "sender_uid": sender_uid,
        "sender_role": history_sender_role(entry, sender_uid, anchor_uid),
        "sender_name_color": sender_name_color,
        "sender_guard_level": sender_guard_level,
        "sender_face": sender_face,
        "danmu_id_str": danmu_id_str,
        "danmu_rnd": danmu_rnd,
        "cmd": "HISTORY_DANMU",
        "history": true,
        "history_source": source,
    })
}

pub(crate) async fn fetch_recent_danmu_messages_inner(
    state: &AppState,
) -> Result<Vec<serde_json::Value>, String> {
    let (room_id, cookie, anchor_uid, config_path, client) = {
        let runtime = state.runtime.lock().await;
        let Some(uid) = runtime.config.current_uid.clone() else {
            return Err("i18n.common.not_logged_in".to_string());
        };
        let Some(user) = runtime.config.users.get(&uid) else {
            return Err("i18n.common.not_logged_in".to_string());
        };
        let anchor_uid = runtime.session.uid.max(uid.parse::<u64>().unwrap_or(0));
        let room_id = if user.room_id.trim().is_empty() {
            runtime.session.room_id.clone()
        } else {
            user.room_id.clone()
        };
        if room_id.trim().is_empty() {
            return Err("i18n.live.error.room_id_missing".to_string());
        }
        if user.cookie.trim().is_empty() {
            return Err("i18n.account.error.local_credential_empty".to_string());
        }
        (
            room_id,
            user.cookie.clone(),
            anchor_uid,
            state.config_path.clone(),
            state.client.clone(),
        )
    };

    let value = client
        .get_json_with_cookie(
            &endpoints::live_api("/xlive/web-room/v1/dM/gethistory"),
            &[("roomid", room_id.clone())],
            &cookie,
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value
        .get("code")
        .and_then(serde_json::Value::as_i64)
        .unwrap_or(-1);
    if code != 0 {
        let message = value
            .get("message")
            .and_then(serde_json::Value::as_str)
            .filter(|msg| !msg.trim().is_empty())
            .unwrap_or("i18n.live.error.fetch_recent_danmu_failed");
        return Err(message.to_string());
    }

    let mut rows: Vec<(i64, serde_json::Value)> = Vec::new();
    let mut seq = 0usize;
    for source in ["admin", "room"] {
        let entries = value
            .get("data")
            .and_then(|data| data.get(source))
            .and_then(serde_json::Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in entries {
            let mapped = map_history_entry_to_danmu(&entry, source, seq, anchor_uid);
            let order_ts = mapped
                .get("created_at_ms")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(i64::MAX / 2 + seq as i64);
            rows.push((order_ts, mapped));
            seq += 1;
        }
    }

    let avatar_requests = rows
        .iter()
        .filter_map(|(_, message)| {
            let uid = message
                .get("sender_uid")
                .and_then(serde_json::Value::as_u64)?;
            if uid == 0 {
                return None;
            }
            let uid_key = uid.to_string();
            let sender_face_hint = message
                .get("sender_face")
                .and_then(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            Some((uid_key, sender_face_hint))
        })
        .collect::<std::collections::HashMap<String, Option<String>>>();
    if !avatar_requests.is_empty() {
        if let Ok(resolved_faces) =
            crate::avatar::resolve_and_cache_face_data_urls(&client, &config_path, &avatar_requests)
                .await
        {
            for (_, message) in &mut rows {
                let Some(uid) = message
                    .get("sender_uid")
                    .and_then(serde_json::Value::as_u64)
                else {
                    continue;
                };
                let uid_key = uid.to_string();
                if let Some(face) = resolved_faces.get(&uid_key) {
                    message["sender_face"] = serde_json::Value::String(face.clone());
                }
            }
        }
    }

    rows.sort_by_key(|(order_ts, _)| *order_ts);
    Ok(rows.into_iter().map(|(_, value)| value).collect())
}

struct DanmuTaskGuard {
    app: AppHandle,
    task_id: u64,
}

fn clear_danmu_task_if_current(runtime: &mut crate::state::RuntimeState, task_id: u64) -> bool {
    if runtime.danmu_task_id != task_id {
        return false;
    }
    runtime.danmu_task = None;
    true
}

impl Drop for DanmuTaskGuard {
    fn drop(&mut self) {
        let app = self.app.clone();
        let task_id = self.task_id;
        tokio::spawn(async move {
            let state = app.state::<AppState>();
            let should_emit_snapshot = {
                let mut runtime = state.runtime.lock().await;
                clear_danmu_task_if_current(&mut runtime, task_id)
            };
            if should_emit_snapshot {
                emit_runtime_snapshot(&app, &state, "danmu.cleanup").await;
            }
        });
    }
}

pub(crate) async fn start_danmu_monitor_inner(app: &AppHandle, state: &AppState) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if runtime
        .danmu_task
        .as_ref()
        .map(|task| task.is_finished())
        .unwrap_or(false)
    {
        runtime.danmu_task = None;
    }
    if runtime.danmu_task.is_some() {
        return Ok(json!({
            "started": false,
            "msg": "i18n.live.danmu_monitor_already_running"
        }));
    }

    runtime.danmu_task_id += 1;
    let current_task_id = runtime.danmu_task_id;

    let room_id = runtime.session.room_id.clone();
    let uid = runtime.session.uid;
    if room_id.is_empty() {
        return Err("i18n.common.not_logged_in".into());
    }
    let client = state.client.clone();

    let app_handle = app.clone();
    let app_handle_for_guard = app.clone();
    runtime.danmu_task = Some(tokio::spawn(async move {
        let _guard = DanmuTaskGuard {
            app: app_handle_for_guard,
            task_id: current_task_id,
        };
        let mut attempt: u32 = 0;
        let mut host_cursor: usize = 0;
        loop {
            let info = match get_danmu_info(&client, &room_id).await {
                Ok(value) => value,
                Err(error) => {
                    crate::runtime_warn!("[danmu] get_danmu_info failed: {error}");
                    let delay = danmu_reconnect_delay(attempt);
                    attempt = attempt.saturating_add(1);
                    tokio::time::sleep(delay).await;
                    continue;
                }
            };
            let token = info["data"]["token"].as_str().unwrap_or("").to_string();
            if token.trim().is_empty() {
                crate::runtime_warn!("[danmu] missing token for room_id={room_id}");
                let delay = danmu_reconnect_delay(attempt);
                attempt = attempt.saturating_add(1);
                tokio::time::sleep(delay).await;
                continue;
            }
            let hosts = extract_danmu_hosts(&info);
            let host = hosts[host_cursor % hosts.len()].clone();
            host_cursor = (host_cursor + 1) % hosts.len();
            let ws_url = endpoints::danmu_wss(&host.host, host.port);
            match tokio_tungstenite::connect_async(ws_url).await {
                Ok((ws, _)) => {
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
                    let mut auth_packet = vec![];
                    auth_packet.extend_from_slice(&((16 + auth.len()) as u32).to_be_bytes());
                    auth_packet.extend_from_slice(&(16u16).to_be_bytes());
                    auth_packet.extend_from_slice(&(1u16).to_be_bytes());
                    auth_packet.extend_from_slice(&(7u32).to_be_bytes());
                    auth_packet.extend_from_slice(&(1u32).to_be_bytes());
                    auth_packet.extend_from_slice(auth.as_bytes());
                    if write.send(Message::Binary(auth_packet)).await.is_err() {
                        let delay = danmu_reconnect_delay(attempt);
                        attempt = attempt.saturating_add(1);
                        tokio::time::sleep(delay).await;
                        continue;
                    }

                    let heartbeat = tokio::spawn(async move {
                        loop {
                            let mut heartbeat_packet = vec![];
                            heartbeat_packet.extend_from_slice(&(16u32).to_be_bytes());
                            heartbeat_packet.extend_from_slice(&(16u16).to_be_bytes());
                            heartbeat_packet.extend_from_slice(&(1u16).to_be_bytes());
                            heartbeat_packet.extend_from_slice(&(2u32).to_be_bytes());
                            heartbeat_packet.extend_from_slice(&(1u32).to_be_bytes());
                            if write.send(Message::Binary(heartbeat_packet)).await.is_err() {
                                break;
                            }
                            tokio::time::sleep(Duration::from_secs(30)).await;
                        }
                    });

                    let mut reenter_delay_secs: Option<u64> = None;
                    while let Some(message) = read.next().await {
                        match message {
                            Ok(Message::Binary(data)) => {
                                if let Some(delay_secs) = decode_and_emit(&app_handle, &data) {
                                    reenter_delay_secs = Some(delay_secs);
                                    emit_studio_state_event(
                                        &app_handle,
                                        "danmu.reenter",
                                        "danmu.monitor",
                                        json!({
                                            "delay_secs": delay_secs,
                                            "host": host.host,
                                            "port": host.port,
                                        }),
                                    );
                                    crate::runtime_log!(
                                        "[danmu] received REENTER_LIVE_ROOM, reconnect in {}s",
                                        delay_secs
                                    );
                                    break;
                                }
                            }
                            Ok(_) => {}
                            Err(error) => {
                                crate::runtime_log!(
                                    "[danmu] read failed on {}:{}: {error}",
                                    host.host,
                                    host.port
                                );
                                break;
                            }
                        }
                    }
                    heartbeat.abort();
                    if let Some(delay_secs) = reenter_delay_secs {
                        attempt = 0;
                        if delay_secs > 0 {
                            tokio::time::sleep(Duration::from_secs(delay_secs)).await;
                        }
                        continue;
                    }
                    let delay = danmu_reconnect_delay(attempt);
                    attempt = attempt.saturating_add(1);
                    tokio::time::sleep(delay).await;
                }
                Err(error) => {
                    crate::runtime_log!(
                        "[danmu] connect failed on {}:{}: {error}",
                        host.host,
                        host.port
                    );
                    let delay = danmu_reconnect_delay(attempt);
                    attempt = attempt.saturating_add(1);
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }));

    Ok(json!({
        "started": true,
        "msg": "i18n.live.danmu_monitor_started"
    }))
}

pub(crate) async fn stop_danmu_monitor_inner(state: &AppState) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    let mut stopped = false;
    if let Some(task) = runtime.danmu_task.take() {
        task.abort();
        stopped = true;
    }
    Ok(json!({
        "stopped": stopped,
        "msg": "i18n.live.danmu_monitor_stopped"
    }))
}

#[cfg(test)]
mod tests {
    use super::clear_danmu_task_if_current;
    use crate::state::RuntimeState;

    #[test]
    fn clear_danmu_task_only_when_task_id_matches() {
        let mut runtime = RuntimeState::default();
        runtime.danmu_task_id = 42;

        assert!(!clear_danmu_task_if_current(&mut runtime, 41));
        assert!(clear_danmu_task_if_current(&mut runtime, 42));
        assert!(runtime.danmu_task.is_none());
    }
}
