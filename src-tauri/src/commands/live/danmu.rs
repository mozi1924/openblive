use crate::bili::get_danmu_info;
use crate::constants::CmdResult;
use crate::danmu::decode_and_emit;
use crate::endpoints;
use crate::state::AppState;
use crate::state_event::emit_studio_state_event;
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

    let room_id = runtime.session.room_id.clone();
    let uid = runtime.session.uid;
    if room_id.is_empty() {
        return Err("i18n.common.not_logged_in".into());
    }
    let client = state.client.clone();

    let app_handle = app.clone();
    runtime.danmu_task = Some(tokio::spawn(async move {
        let mut attempt: u32 = 0;
        let mut host_cursor: usize = 0;
        loop {
            let info = match get_danmu_info(&client, &room_id).await {
                Ok(value) => value,
                Err(error) => {
                    eprintln!("[danmu] get_danmu_info failed: {error}");
                    let delay = danmu_reconnect_delay(attempt);
                    attempt = attempt.saturating_add(1);
                    tokio::time::sleep(delay).await;
                    continue;
                }
            };
            let token = info["data"]["token"].as_str().unwrap_or("").to_string();
            if token.trim().is_empty() {
                eprintln!("[danmu] missing token for room_id={room_id}");
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
                    if write
                        .send(Message::Binary(auth_packet.into()))
                        .await
                        .is_err()
                    {
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
                            if write
                                .send(Message::Binary(heartbeat_packet.into()))
                                .await
                                .is_err()
                            {
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
                                    eprintln!(
                                        "[danmu] received REENTER_LIVE_ROOM, reconnect in {}s",
                                        delay_secs
                                    );
                                    break;
                                }
                            }
                            Ok(_) => {}
                            Err(error) => {
                                eprintln!(
                                    "[danmu] read failed on {}:{}: {error}",
                                    host.host, host.port
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
                    eprintln!(
                        "[danmu] connect failed on {}:{}: {error}",
                        host.host, host.port
                    );
                    let delay = danmu_reconnect_delay(attempt);
                    attempt = attempt.saturating_add(1);
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }));

    let cleanup_app = app.clone();
    tokio::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(1)).await;
            let state = cleanup_app.state::<AppState>();
            let mut runtime = state.runtime.lock().await;
            let status = runtime.danmu_task.as_ref().map(|task| task.is_finished());
            match status {
                Some(true) => {
                    runtime.danmu_task = None;
                    break;
                }
                Some(false) => {}
                None => break,
            }
        }
    });

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
