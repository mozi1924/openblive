use std::net::SocketAddr;

use tokio::net::lookup_host;

use super::constants::WS_SERVER_DEFAULT_LISTEN_ADDR;

pub(in crate::ws_server) fn normalize_listen_addr(raw: &str) -> String {
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

pub(in crate::ws_server) async fn resolve_bind_addr(
    listen_addr: &str,
) -> Result<SocketAddr, String> {
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
