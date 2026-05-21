use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

#[derive(Clone, Serialize)]
pub(crate) struct StreamEndpoint {
    pub(crate) protocol: String,
    pub(crate) addr: String,
    pub(crate) code: String,
    pub(crate) full_url: String,
}

fn parse_protocol_from_addr(addr: &str) -> String {
    if let Some((scheme, _)) = addr.split_once("://") {
        return scheme.trim().to_ascii_lowercase();
    }
    String::new()
}

fn parse_stream_endpoint(value: &Value, fallback_protocol: &str) -> Option<StreamEndpoint> {
    let addr = value["addr"].as_str().unwrap_or("").trim().to_string();
    let code = value["code"].as_str().unwrap_or("").trim().to_string();
    if addr.is_empty() && code.is_empty() {
        return None;
    }

    let mut protocol = value["protocol"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if protocol.is_empty() {
        protocol = parse_protocol_from_addr(&addr);
    }
    if protocol.is_empty() {
        protocol = fallback_protocol.to_ascii_lowercase();
    }

    Some(StreamEndpoint {
        protocol,
        full_url: format!("{addr}{code}"),
        addr,
        code,
    })
}

pub(crate) fn collect_stream_endpoints(data: &Value) -> Vec<StreamEndpoint> {
    let mut endpoints: Vec<StreamEndpoint> = Vec::new();
    if let Some(primary) = parse_stream_endpoint(&data["rtmp"], "rtmp") {
        endpoints.push(primary);
    }
    if let Some(protocols) = data["protocols"].as_array() {
        for protocol in protocols {
            if let Some(endpoint) = parse_stream_endpoint(protocol, "rtmp") {
                endpoints.push(endpoint);
            }
        }
    }

    let mut dedup = HashSet::new();
    endpoints
        .into_iter()
        .filter(|item| {
            let key = format!("{}|{}|{}", item.protocol, item.addr, item.code);
            dedup.insert(key)
        })
        .collect()
}

pub(crate) fn select_primary_endpoint(endpoints: &[StreamEndpoint]) -> Option<StreamEndpoint> {
    if endpoints.is_empty() {
        return None;
    }
    endpoints
        .iter()
        .find(|item| item.protocol == "rtmp")
        .cloned()
        .or_else(|| endpoints.first().cloned())
}
