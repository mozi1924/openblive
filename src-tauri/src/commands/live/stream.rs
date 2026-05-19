use serde::Serialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use url::form_urlencoded;

#[derive(Clone, Serialize)]
pub(crate) struct StreamEndpoint {
    pub(crate) protocol: String,
    pub(crate) addr: String,
    pub(crate) code: String,
    pub(crate) full_url: String,
    pub(crate) provider: String,
    pub(crate) new_link: String,
    pub(crate) stream_name: String,
    pub(crate) stream_key: String,
    pub(crate) schedule: String,
    pub(crate) pflag: String,
    pub(crate) query: BTreeMap<String, String>,
}

fn parse_stream_query(code: &str) -> BTreeMap<String, String> {
    let query_str = code.trim().trim_start_matches('?');
    if query_str.is_empty() {
        return BTreeMap::new();
    }

    form_urlencoded::parse(query_str.as_bytes())
        .into_owned()
        .collect::<BTreeMap<_, _>>()
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

    let query = parse_stream_query(&code);
    let mut protocol = value["protocol"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if protocol.is_empty() {
        protocol = query
            .get("schedule")
            .map(|item| item.trim().to_ascii_lowercase())
            .unwrap_or_default();
    }
    if protocol.is_empty() {
        protocol = parse_protocol_from_addr(&addr);
    }
    if protocol.is_empty() {
        protocol = fallback_protocol.to_ascii_lowercase();
    }

    let stream_key = query.get("key").cloned().unwrap_or_else(|| {
        let cleaned = code.trim_start_matches('?').trim();
        if cleaned.is_empty() || cleaned.contains('=') {
            String::new()
        } else {
            cleaned.to_string()
        }
    });

    Some(StreamEndpoint {
        protocol,
        full_url: format!("{addr}{code}"),
        provider: value["provider"].as_str().unwrap_or("").to_string(),
        new_link: value["new_link"].as_str().unwrap_or("").to_string(),
        stream_name: query.get("streamname").cloned().unwrap_or_default(),
        stream_key,
        schedule: query.get("schedule").cloned().unwrap_or_default(),
        pflag: query.get("pflag").cloned().unwrap_or_default(),
        query,
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
