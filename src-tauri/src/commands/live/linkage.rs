use super::stream::StreamEndpoint;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::json;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::process::Command;
use tokio_tungstenite::tungstenite::Message;

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
    raw.contains("{stream_key}")
        || raw.contains("{{stream_key}}")
        || raw.contains("${stream_key}")
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
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_connect_failed: {error}"))?;
    let (mut write, mut read) = ws.split();
    obs_identify(&mut write, &mut read, password).await?;

    let set_req_id = obs_send_request(
        &mut write,
        "SetStreamServiceSettings",
        json!({
            "streamServiceType": "rtmp_custom",
            "streamServiceSettings": {
                "server": context.server,
                "key": context.stream_code
            }
        }),
    )
    .await?;
    obs_wait_request_response(&mut read, &set_req_id, "SetStreamServiceSettings").await?;

    let start_req_id = obs_send_request(&mut write, "StartStream", json!({})).await?;
    obs_wait_request_response(&mut read, &start_req_id, "StartStream").await?;
    Ok(())
}

pub(crate) async fn obs_ws_stop_stream(url: &str, password: &str) -> Result<(), String> {
    let (ws, _) = tokio_tungstenite::connect_async(url)
        .await
        .map_err(|error| format!("i18n.live.error.obs_ws_connect_failed: {error}"))?;
    let (mut write, mut read) = ws.split();
    obs_identify(&mut write, &mut read, password).await?;

    let stop_req_id = obs_send_request(&mut write, "StopStream", json!({})).await?;
    obs_wait_request_response(&mut read, &stop_req_id, "StopStream").await?;
    Ok(())
}

pub(crate) async fn obs_ws_probe(url: &str, password: &str) -> Result<(), String> {
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
    use super::{apply_command_template, build_command_template_context, CommandTemplateContext, StreamEndpoint};

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
}
