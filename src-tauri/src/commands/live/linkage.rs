use super::stream::StreamEndpoint;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use tokio::process::Command;
use tokio::sync::Mutex as AsyncMutex;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::tungstenite::Message;
use url::Url;

#[derive(Clone)]
pub(crate) struct CommandTemplateContext {
    pub(crate) server: String,
    pub(crate) stream_code: String,
    pub(crate) stream_url: String,
    pub(crate) protocol: String,
}

pub(crate) fn normalize_live_control_mode(mode: &str) -> &'static str {
    match mode.trim() {
        "obs_ws" => "obs_ws",
        "command" => "command",
        _ => "none",
    }
}

pub(crate) fn build_command_template_context(primary: &StreamEndpoint) -> CommandTemplateContext {
    CommandTemplateContext {
        server: primary.addr.clone(),
        stream_code: primary.code.clone(),
        stream_url: primary.full_url.clone(),
        protocol: primary.protocol.clone(),
    }
}

pub(crate) fn empty_command_template_context() -> CommandTemplateContext {
    CommandTemplateContext {
        server: String::new(),
        stream_code: String::new(),
        stream_url: String::new(),
        protocol: String::new(),
    }
}

pub(crate) fn build_primary_push_fallback_context(
    context: &CommandTemplateContext,
) -> Option<CommandTemplateContext> {
    let next_server = rewrite_stream_server_host(&context.server, OBS_PRIMARY_PUSH_HOST)?;
    let next_stream_url = rewrite_stream_server_host(&context.stream_url, OBS_PRIMARY_PUSH_HOST)
        .unwrap_or_else(|| {
            if context.stream_code.trim().is_empty() {
                next_server.clone()
            } else {
                format!("{}{}", next_server, context.stream_code)
            }
        });
    Some(CommandTemplateContext {
        server: next_server,
        stream_url: next_stream_url,
        stream_code: context.stream_code.clone(),
        protocol: context.protocol.clone(),
    })
}

fn is_safe_template_value(value: &str) -> bool {
    value.chars().all(|ch| {
        ch.is_ascii_alphanumeric()
            || matches!(
                ch,
                '/' | '.' | ':' | '=' | '?' | '&' | '_' | '-' | '%' | '+' | '~' | ',' | '@'
            )
    })
}

fn contains_deprecated_stream_key_placeholder(raw: &str) -> bool {
    raw.contains("{stream_key}") || raw.contains("{{stream_key}}") || raw.contains("${stream_key}")
}

pub(crate) fn apply_command_template(
    raw: &str,
    context: &CommandTemplateContext,
) -> Result<String, String> {
    if contains_deprecated_stream_key_placeholder(raw) {
        return Err("i18n.live.error.command_template_stream_key_removed".to_string());
    }

    let variables = [
        ("server", context.server.as_str()),
        ("stream_code", context.stream_code.as_str()),
        ("stream_url", context.stream_url.as_str()),
        ("protocol", context.protocol.as_str()),
    ];
    for (name, value) in variables {
        if !is_safe_template_value(value) {
            return Err(format!(
                "Unsafe characters detected in command template variable: {name}"
            ));
        }
    }

    let mut cmd = raw.to_string();
    let replacements = [
        ("{{server}}", context.server.as_str()),
        ("{server}", context.server.as_str()),
        ("${server}", context.server.as_str()),
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
    Ok(cmd)
}

pub(crate) async fn spawn_shell_command(raw_command: &str) -> Result<(), String> {
    let command = raw_command.trim();
    if command.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .arg("/C")
        .arg(command)
        .spawn()
        .map_err(|error| format!("i18n.live.error.spawn_command_failed: {error}"))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .arg("-lc")
        .arg(command)
        .spawn()
        .map_err(|error| format!("i18n.live.error.spawn_command_failed: {error}"))?;

    tokio::spawn(async move {
        if let Err(error) = child.wait().await {
            crate::runtime_warn!("[live][command] command process wait failed: {error}");
        }
    });
    Ok(())
}

pub(crate) async fn spawn_shell_command_checked(raw_command: &str) -> Result<(), String> {
    let command = raw_command.trim();
    if command.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    let mut child = Command::new("cmd")
        .arg("/C")
        .arg(command)
        .spawn()
        .map_err(|error| format!("i18n.live.error.spawn_command_failed: {error}"))?;

    #[cfg(not(target_os = "windows"))]
    let mut child = Command::new("sh")
        .arg("-lc")
        .arg(command)
        .spawn()
        .map_err(|error| format!("i18n.live.error.spawn_command_failed: {error}"))?;

    let status = child
        .wait()
        .await
        .map_err(|error| format!("i18n.live.error.command_process_wait_failed: {error}"))?;
    if status.success() {
        return Ok(());
    }
    let code_text = status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "SIGNAL".to_string());
    Err(format!(
        "i18n.live.error.command_process_exit_non_zero:{code_text}"
    ))
}

static OBS_REQUEST_ID: AtomicU64 = AtomicU64::new(1);
static OBS_LINKAGE_LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
const OBS_PRIMARY_PUSH_HOST: &str = "live-push.bilivideo.com";
const OBS_RECONNECT_TRIGGER_COUNT: usize = 3;
const OBS_STREAM_STATUS_CHECK_RETRY: usize = 12;
const OBS_STREAM_STATUS_CHECK_DELAY_MS: u64 = 1_000;
const OBS_FALLBACK_RESTART_RETRY: usize = 3;
const OBS_FALLBACK_RESTART_DELAY_MS: u64 = 1_000;

fn obs_next_request_id() -> String {
    format!("obs-{}", OBS_REQUEST_ID.fetch_add(1, Ordering::Relaxed))
}

fn obs_linkage_lock() -> &'static AsyncMutex<()> {
    OBS_LINKAGE_LOCK.get_or_init(|| AsyncMutex::new(()))
}

#[derive(Clone, Debug, Default)]
struct ObsStreamStatus {
    output_active: bool,
    output_reconnecting: bool,
    output_state: String,
}

fn obs_parse_stream_status(value: &serde_json::Value) -> ObsStreamStatus {
    let data = &value["d"]["responseData"];
    ObsStreamStatus {
        output_active: data["outputActive"].as_bool().unwrap_or(false),
        output_reconnecting: data["outputReconnecting"].as_bool().unwrap_or(false),
        output_state: data["outputState"].as_str().unwrap_or_default().to_string(),
    }
}

fn rewrite_stream_server_host(server: &str, next_host: &str) -> Option<String> {
    let trimmed = server.trim();
    if trimmed.is_empty() || next_host.trim().is_empty() {
        return None;
    }

    if let Ok(mut url) = Url::parse(trimmed) {
        let current_host = url.host_str()?.to_string();
        if current_host.eq_ignore_ascii_case(next_host) {
            return None;
        }
        if url.set_host(Some(next_host)).is_err() {
            return None;
        }
        let _ = url.set_port(None);
        return Some(url.to_string());
    }

    let (scheme, rest) = trimmed.split_once("://")?;
    if scheme.trim().is_empty() || rest.trim().is_empty() {
        return None;
    }
    let slash_index = rest.find('/').unwrap_or(rest.len());
    let suffix = &rest[slash_index..];
    let authority = &rest[..slash_index];
    if authority.is_empty() {
        return None;
    }
    let host_with_port = authority.rsplit('@').next().unwrap_or(authority);
    let host_only = host_with_port.split(':').next().unwrap_or(host_with_port);
    if host_only.eq_ignore_ascii_case(next_host) {
        return None;
    }
    Some(format!("{scheme}://{next_host}{suffix}"))
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

async fn obs_wait_message<S>(read: &mut S, label: &str) -> Result<serde_json::Value, String>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let Some(result) = read.next().await else {
        return Err(format!("i18n.live.error.obs_ws_closed({label})"));
    };
    let message = result
        .map_err(|error| format!("i18n.live.error.obs_ws_receive_failed({label}): {error}"))?;
    match message {
        Message::Text(text) => serde_json::from_str::<serde_json::Value>(&text)
            .map_err(|error| format!("i18n.live.error.obs_ws_json_parse_failed({label}): {error}")),
        Message::Binary(bytes) => {
            serde_json::from_slice::<serde_json::Value>(&bytes).map_err(|error| {
                format!("i18n.live.error.obs_ws_binary_json_parse_failed({label}): {error}")
            })
        }
        Message::Close(frame) => Err(format!(
            "i18n.live.error.obs_ws_closed_by_peer({label}): {:?}",
            frame
        )),
        _ => Err(format!("i18n.live.error.obs_ws_non_json_frame({label})")),
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
        .send(Message::Text(packet.to_string()))
        .await
        .map_err(|error| {
            format!("i18n.live.error.obs_ws_request_send_failed({request_type}): {error}")
        })?;
    Ok(request_id)
}

async fn obs_wait_request_response<S>(
    read: &mut S,
    expected_request_id: &str,
    request_type: &str,
) -> Result<serde_json::Value, String>
where
    S: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
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
        return Err(format!(
            "i18n.live.error.obs_ws_request_failed({request_type}) code={code}: {comment}"
        ));
    }
}

async fn obs_get_stream_status<S1, S2>(
    write: &mut S1,
    read: &mut S2,
) -> Result<ObsStreamStatus, String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let req_id = obs_send_request(write, "GetStreamStatus", json!({})).await?;
    let response = obs_wait_request_response(read, &req_id, "GetStreamStatus").await?;
    Ok(obs_parse_stream_status(&response))
}

async fn obs_try_bili_primary_server_fallback<S1, S2>(
    write: &mut S1,
    read: &mut S2,
    context: &CommandTemplateContext,
) -> Result<(), String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let mut reconnecting_streak = 0usize;
    let mut saw_active_stream = false;
    let mut trigger_reason = String::new();

    for attempt in 0..OBS_STREAM_STATUS_CHECK_RETRY {
        match obs_get_stream_status(write, read).await {
            Ok(status) => {
                if status.output_active {
                    saw_active_stream = true;
                }

                if status.output_reconnecting
                    || status.output_state == "OBS_WEBSOCKET_OUTPUT_RECONNECTING"
                {
                    reconnecting_streak += 1;
                } else {
                    reconnecting_streak = 0;
                }

                if let Some(reason) =
                    obs_should_trigger_fallback(&status, saw_active_stream, reconnecting_streak)
                {
                    trigger_reason = reason;
                    break;
                }

                if saw_active_stream
                    && status.output_active
                    && !status.output_reconnecting
                    && status.output_state != "OBS_WEBSOCKET_OUTPUT_RECONNECTING"
                {
                    crate::runtime_log!(
                        "[live][obs] stream started normally, fallback check bypassed"
                    );
                    return Ok(());
                }
            }
            Err(error) => {
                crate::runtime_warn!(
                    "[live][obs] GetStreamStatus failed during fallback probe: {error}"
                );
                return Ok(());
            }
        }

        if attempt + 1 < OBS_STREAM_STATUS_CHECK_RETRY {
            sleep(Duration::from_millis(OBS_STREAM_STATUS_CHECK_DELAY_MS)).await;
        }
    }

    if trigger_reason.is_empty() {
        return Ok(());
    }

    let Some(primary_server) = rewrite_stream_server_host(&context.server, OBS_PRIMARY_PUSH_HOST)
    else {
        crate::runtime_log!(
            "[live][obs] fallback trigger detected ({trigger_reason}) but host is already {}",
            OBS_PRIMARY_PUSH_HOST
        );
        return Ok(());
    };

    crate::runtime_log!(
        "[live][obs] fallback trigger detected ({}), restarting stream on {}",
        trigger_reason,
        OBS_PRIMARY_PUSH_HOST
    );

    if let Err(error) = obs_stop_stream(write, read).await {
        crate::runtime_warn!("[live][obs] StopStream before fallback failed: {error}");
    }

    let mut last_error = String::new();
    for restart_attempt in 0..OBS_FALLBACK_RESTART_RETRY {
        if restart_attempt > 0 {
            sleep(Duration::from_millis(OBS_FALLBACK_RESTART_DELAY_MS)).await;
        }

        let _ = obs_wait_stream_inactive(write, read).await;

        if let Err(error) =
            obs_apply_stream_settings(write, read, &primary_server, &context.stream_code).await
        {
            last_error = format!("SetStreamServiceSettings failed: {error}");
            continue;
        }
        if let Err(error) = obs_start_stream(write, read).await {
            last_error = format!("StartStream failed: {error}");
            continue;
        }

        crate::runtime_log!(
            "[live][obs] fallback completed: stream restarted via {}",
            OBS_PRIMARY_PUSH_HOST
        );
        return Ok(());
    }

    crate::runtime_warn!(
        "[live][obs] fallback restart sequence exhausted after {} attempts: {}",
        OBS_FALLBACK_RESTART_RETRY,
        last_error
    );
    Ok(())
}

async fn obs_apply_stream_settings<S1, S2>(
    write: &mut S1,
    read: &mut S2,
    server: &str,
    key: &str,
) -> Result<(), String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let set_req_id = obs_send_request(
        write,
        "SetStreamServiceSettings",
        json!({
            "streamServiceType": "rtmp_custom",
            "streamServiceSettings": {
                "server": server,
                "key": key
            }
        }),
    )
    .await?;
    obs_wait_request_response(read, &set_req_id, "SetStreamServiceSettings").await?;
    Ok(())
}

async fn obs_start_stream<S1, S2>(write: &mut S1, read: &mut S2) -> Result<(), String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let start_req_id = obs_send_request(write, "StartStream", json!({})).await?;
    obs_wait_request_response(read, &start_req_id, "StartStream").await?;
    Ok(())
}

async fn obs_stop_stream<S1, S2>(write: &mut S1, read: &mut S2) -> Result<(), String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let stop_req_id = obs_send_request(write, "StopStream", json!({})).await?;
    obs_wait_request_response(read, &stop_req_id, "StopStream").await?;
    Ok(())
}

async fn obs_wait_stream_inactive<S1, S2>(write: &mut S1, read: &mut S2) -> bool
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    for wait_attempt in 0..OBS_FALLBACK_RESTART_RETRY {
        match obs_get_stream_status(write, read).await {
            Ok(status) => {
                if !status.output_active
                    || status.output_state == "OBS_WEBSOCKET_OUTPUT_STOPPED"
                    || status.output_state == "OBS_WEBSOCKET_OUTPUT_STOPPING"
                {
                    return true;
                }
            }
            Err(error) => {
                crate::runtime_warn!(
                    "[live][obs] GetStreamStatus failed while waiting stream inactive: {error}"
                );
                return false;
            }
        }
        if wait_attempt + 1 < OBS_FALLBACK_RESTART_RETRY {
            sleep(Duration::from_millis(OBS_FALLBACK_RESTART_DELAY_MS)).await;
        }
    }
    false
}

fn obs_should_trigger_fallback(
    status: &ObsStreamStatus,
    saw_active_stream: bool,
    reconnecting_streak: usize,
) -> Option<String> {
    if reconnecting_streak >= OBS_RECONNECT_TRIGGER_COUNT {
        return Some(format!(
            "reconnecting({} consecutive probes)",
            reconnecting_streak
        ));
    }

    if status.output_state == "OBS_WEBSOCKET_OUTPUT_STOPPED"
        || status.output_state == "OBS_WEBSOCKET_OUTPUT_STOPPING"
    {
        return Some(format!("output_state={}", status.output_state));
    }

    if saw_active_stream && !status.output_active && !status.output_reconnecting {
        return Some("output_disconnected".to_string());
    }

    None
}

async fn obs_identify<S1, S2>(write: &mut S1, read: &mut S2, password: &str) -> Result<(), String>
where
    S1: futures_util::Sink<Message, Error = tokio_tungstenite::tungstenite::Error> + Unpin,
    S2: futures_util::Stream<Item = Result<Message, tokio_tungstenite::tungstenite::Error>> + Unpin,
{
    let hello = obs_wait_message(read, "hello").await?;
    if hello["op"].as_i64().unwrap_or(-1) != 0 {
        return Err("i18n.live.error.obs_ws_protocol_hello_missing".to_string());
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
        .send(Message::Text(identify.to_string()))
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_identify_send_failed: {error}"))?;

    loop {
        let identified = obs_wait_message(read, "identify").await?;
        if identified["op"].as_i64().unwrap_or(-1) == 2 {
            break;
        }
    }

    Ok(())
}

pub(crate) async fn obs_ws_start_stream(
    url: &str,
    password: &str,
    context: &CommandTemplateContext,
) -> Result<(), String> {
    let _obs_linkage_guard = obs_linkage_lock().lock().await;
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_connect_failed: {error}"))?;
    let (mut write, mut read) = ws.split();
    obs_identify(&mut write, &mut read, password).await?;

    obs_apply_stream_settings(&mut write, &mut read, &context.server, &context.stream_code).await?;
    obs_start_stream(&mut write, &mut read).await?;
    if let Err(error) = obs_try_bili_primary_server_fallback(&mut write, &mut read, context).await {
        crate::runtime_warn!("[live][obs] fallback process failed: {error}");
    }
    Ok(())
}

pub(crate) async fn obs_ws_stop_stream(url: &str, password: &str) -> Result<(), String> {
    let _obs_linkage_guard = obs_linkage_lock().lock().await;
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_connect_failed: {error}"))?;
    let (mut write, mut read) = ws.split();
    obs_identify(&mut write, &mut read, password).await?;

    obs_stop_stream(&mut write, &mut read).await?;
    Ok(())
}

pub(crate) async fn obs_ws_probe(url: &str, password: &str) -> Result<(), String> {
    let _obs_linkage_guard = obs_linkage_lock().lock().await;
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_connect_failed: {error}"))?;
    let (mut write, mut read) = ws.split();
    obs_identify(&mut write, &mut read, password).await?;

    let req_id = obs_send_request(&mut write, "GetStreamStatus", json!({})).await?;
    obs_wait_request_response(&mut read, &req_id, "GetStreamStatus").await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        apply_command_template, build_command_template_context,
        build_primary_push_fallback_context, obs_should_trigger_fallback,
        rewrite_stream_server_host, CommandTemplateContext, ObsStreamStatus, StreamEndpoint,
    };

    fn demo_context() -> CommandTemplateContext {
        CommandTemplateContext {
            server: "rtmp://example.com/live".to_string(),
            stream_code: "?streamname=live_1_2&key=key_abc-123".to_string(),
            stream_url: "rtmp://example.com/live?streamname=live_1_2&key=key_abc-123".to_string(),
            protocol: "rtmp".to_string(),
        }
    }

    #[test]
    fn apply_command_template_replaces_placeholders() {
        let context = demo_context();
        let output = apply_command_template("ffmpeg -re -i in.mp4 -f flv {stream_url}", &context)
            .expect("template should be valid");
        assert_eq!(
            output,
            "ffmpeg -re -i in.mp4 -f flv rtmp://example.com/live?streamname=live_1_2&key=key_abc-123"
        );
    }

    #[test]
    fn apply_command_template_rejects_unsafe_value() {
        let mut context = demo_context();
        context.stream_code = "abc;rm -rf /".to_string();
        let err = apply_command_template("{stream_code}", &context)
            .expect_err("unsafe template variable must be rejected");
        assert!(err.contains("stream_code"));
    }

    #[test]
    fn apply_command_template_rejects_deprecated_stream_key_placeholder() {
        let context = demo_context();
        let err = apply_command_template("{stream_key}", &context)
            .expect_err("deprecated stream_key placeholder should be rejected");
        assert_eq!(err, "i18n.live.error.command_template_stream_key_removed");
    }

    #[test]
    fn build_command_template_context_uses_code_as_fallback() {
        let endpoint = StreamEndpoint {
            addr: "rtmp://localhost/live".to_string(),
            code: "?streamname=live_1_2&key=abc".to_string(),
            full_url: "rtmp://localhost/live?streamname=live_1_2&key=abc".to_string(),
            protocol: "rtmp".to_string(),
        };
        let context = build_command_template_context(&endpoint);
        assert_eq!(context.stream_code, endpoint.code);
    }

    #[test]
    fn rewrite_stream_server_host_replaces_host_keeps_scheme_and_path() {
        let result = rewrite_stream_server_host(
            "rtmp://tx-push-live.bilivideo.com/live-bvc",
            "live-push.bilivideo.com",
        )
        .expect("fallback server should be built");
        assert_eq!(result, "rtmp://live-push.bilivideo.com/live-bvc");
    }

    #[test]
    fn rewrite_stream_server_host_returns_none_when_host_unchanged() {
        let result = rewrite_stream_server_host(
            "rtmps://live-push.bilivideo.com/live-bvc",
            "live-push.bilivideo.com",
        );
        assert!(result.is_none());
    }

    #[test]
    fn build_primary_push_fallback_context_rewrites_server_and_stream_url() {
        let context = CommandTemplateContext {
            server: "rtmp://tx-push-live.bilivideo.com/live-bvc".to_string(),
            stream_code: "?streamname=live_1_2&key=abc".to_string(),
            stream_url: "rtmp://tx-push-live.bilivideo.com/live-bvc?streamname=live_1_2&key=abc"
                .to_string(),
            protocol: "rtmp".to_string(),
        };
        let fallback =
            build_primary_push_fallback_context(&context).expect("fallback context should exist");
        assert_eq!(fallback.server, "rtmp://live-push.bilivideo.com/live-bvc");
        assert_eq!(
            fallback.stream_url,
            "rtmp://live-push.bilivideo.com/live-bvc?streamname=live_1_2&key=abc"
        );
        assert_eq!(fallback.stream_code, context.stream_code);
    }

    #[test]
    fn obs_should_trigger_fallback_when_reconnecting_streak_reaches_threshold() {
        let status = ObsStreamStatus {
            output_active: true,
            output_reconnecting: true,
            output_state: "OBS_WEBSOCKET_OUTPUT_RECONNECTING".to_string(),
        };
        let reason =
            obs_should_trigger_fallback(&status, true, 3).expect("fallback should be triggered");
        assert!(reason.contains("reconnecting"));
    }

    #[test]
    fn obs_should_trigger_fallback_when_output_stopped() {
        let status = ObsStreamStatus {
            output_active: false,
            output_reconnecting: false,
            output_state: "OBS_WEBSOCKET_OUTPUT_STOPPED".to_string(),
        };
        let reason =
            obs_should_trigger_fallback(&status, false, 0).expect("fallback should be triggered");
        assert_eq!(reason, "output_state=OBS_WEBSOCKET_OUTPUT_STOPPED");
    }

    #[test]
    fn obs_should_not_trigger_fallback_for_normal_started_stream() {
        let status = ObsStreamStatus {
            output_active: true,
            output_reconnecting: false,
            output_state: "OBS_WEBSOCKET_OUTPUT_STARTED".to_string(),
        };
        let reason = obs_should_trigger_fallback(&status, true, 0);
        assert!(reason.is_none());
    }
}
