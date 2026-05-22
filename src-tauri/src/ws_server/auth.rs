use axum::http::HeaderMap;
use std::net::{IpAddr, SocketAddr};

use super::types::WsServerRuntimeState;

fn is_loopback(addr: SocketAddr) -> bool {
    match addr.ip() {
        IpAddr::V4(ip) => ip.is_loopback(),
        IpAddr::V6(ip) => ip.is_loopback(),
    }
}

pub(in crate::ws_server) fn is_authorized(
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

    if query_token.map(str::trim).filter(|token| !token.is_empty()) == Some(state.auth_token.trim()) {
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
