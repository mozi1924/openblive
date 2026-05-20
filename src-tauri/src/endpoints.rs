use std::net::IpAddr;
use std::sync::{OnceLock, RwLock};
use url::Url;

use crate::constants::{
    DEFAULT_APP_KEY, DEFAULT_APP_SEC, DEFAULT_HTTP_USER_AGENT, DEFAULT_LIVE_PLATFORM,
};

const DEFAULT_HOST_WWW: &str = "www.bilibili.com";
const DEFAULT_HOST_API: &str = "api.bilibili.com";
const DEFAULT_HOST_LIVE_API: &str = "api.live.bilibili.com";
const DEFAULT_HOST_PASSPORT: &str = "passport.bilibili.com";
const DEFAULT_HOST_LIVE_WEB: &str = "live.bilibili.com";
const DEFAULT_COOKIE_DOMAIN: &str = ".bilibili.com";
const DEFAULT_DANMU_HOST: &str = "broadcastlv.chat.bilibili.com";
const DEFAULT_DANMU_WSS_PORT: u64 = 2245;

#[derive(Default, Clone)]
struct RuntimeOverrides {
    host_www: String,
    host_api: String,
    host_live_api: String,
    host_passport: String,
    host_live_web: String,
    cookie_domain: String,
    danmu_host: String,
    app_key: String,
    app_sec: String,
    http_user_agent: String,
    livehime_version_override: String,
    livehime_build_override: String,
    live_platform: String,
}

fn runtime_overrides() -> &'static RwLock<RuntimeOverrides> {
    static VALUE: OnceLock<RwLock<RuntimeOverrides>> = OnceLock::new();
    VALUE.get_or_init(|| RwLock::new(RuntimeOverrides::default()))
}

fn env_or_default(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn normalize_base(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidate = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    if let Ok(url) = Url::parse(&candidate) {
        if let Some(host) = url.host_str() {
            let mut origin = format!("{}://{}", url.scheme(), host);
            if let Some(port) = url.port() {
                origin.push(':');
                origin.push_str(&port.to_string());
            }
            return Some(origin);
        }
    }
    let fallback_host = normalize_host(trimmed);
    if fallback_host.is_empty() {
        None
    } else {
        Some(format!("https://{fallback_host}"))
    }
}

fn normalize_host(raw: &str) -> String {
    let trimmed = raw.trim();
    let without_scheme = trimmed
        .strip_prefix("https://")
        .or_else(|| trimmed.strip_prefix("http://"))
        .or_else(|| trimmed.strip_prefix("wss://"))
        .or_else(|| trimmed.strip_prefix("ws://"))
        .unwrap_or(trimmed);
    without_scheme
        .trim_end_matches('/')
        .split('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_string()
}

fn resolve_base(runtime_value: &str, env_key: &str, default_host: &str) -> String {
    let selected = if runtime_value.trim().is_empty() {
        env_or_default(env_key, default_host)
    } else {
        runtime_value.trim().to_string()
    };
    normalize_base(&selected).unwrap_or_else(|| format!("https://{default_host}"))
}

fn resolve_cookie_domain(runtime_value: &str) -> String {
    let selected = if runtime_value.trim().is_empty() {
        env_or_default("OPENBLIVE_COOKIE_DOMAIN", DEFAULT_COOKIE_DOMAIN)
    } else {
        runtime_value.trim().to_string()
    };
    let normalized = normalize_host(&selected);
    if normalized.is_empty() {
        return DEFAULT_COOKIE_DOMAIN.to_string();
    }
    if normalized.starts_with('.') {
        return normalized;
    }
    if normalized.eq_ignore_ascii_case("localhost") || normalized.parse::<IpAddr>().is_ok() {
        return normalized;
    }
    format!(".{normalized}")
}

fn resolve_danmu_host(runtime_value: &str) -> String {
    let selected = if runtime_value.trim().is_empty() {
        env_or_default("OPENBLIVE_DANMU_HOST", DEFAULT_DANMU_HOST)
    } else {
        runtime_value.trim().to_string()
    };
    let normalized = normalize_host(&selected);
    if normalized.is_empty() {
        DEFAULT_DANMU_HOST.to_string()
    } else {
        normalized
    }
}

fn resolve_app_key(runtime_value: &str) -> String {
    if !runtime_value.trim().is_empty() {
        return runtime_value.trim().to_string();
    }
    env_or_default("OPENBLIVE_APP_KEY", DEFAULT_APP_KEY)
}

fn resolve_app_sec(runtime_value: &str) -> String {
    if !runtime_value.trim().is_empty() {
        return runtime_value.trim().to_string();
    }
    env_or_default("OPENBLIVE_APP_SEC", DEFAULT_APP_SEC)
}

fn resolve_http_user_agent(runtime_value: &str) -> String {
    if !runtime_value.trim().is_empty() {
        return runtime_value.trim().to_string();
    }
    env_or_default("OPENBLIVE_HTTP_USER_AGENT", DEFAULT_HTTP_USER_AGENT)
}

fn resolve_livehime_version_override(runtime_value: &str) -> String {
    if !runtime_value.trim().is_empty() {
        return runtime_value.trim().to_string();
    }
    std::env::var("OPENBLIVE_LIVEHIME_VERSION")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_default()
}

fn resolve_livehime_build_override(runtime_value: &str) -> Option<u64> {
    if !runtime_value.trim().is_empty() {
        return runtime_value
            .trim()
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0);
    }
    std::env::var("OPENBLIVE_LIVEHIME_BUILD")
        .ok()
        .and_then(|value| value.trim().parse::<u64>().ok())
        .filter(|value| *value > 0)
}

fn resolve_live_platform(runtime_value: &str) -> String {
    if !runtime_value.trim().is_empty() {
        return runtime_value.trim().to_string();
    }
    env_or_default("OPENBLIVE_LIVE_PLATFORM", DEFAULT_LIVE_PLATFORM)
}

fn with_runtime<T>(selector: impl FnOnce(&RuntimeOverrides) -> T) -> T {
    match runtime_overrides().read() {
        Ok(guard) => selector(&guard),
        Err(_) => selector(&RuntimeOverrides::default()),
    }
}

pub fn set_runtime_overrides_from_config(cfg: &crate::models::PersistConfig) {
    if let Ok(mut guard) = runtime_overrides().write() {
        guard.host_www = cfg.host_www.clone();
        guard.host_api = cfg.host_api.clone();
        guard.host_live_api = cfg.host_live_api.clone();
        guard.host_passport = cfg.host_passport.clone();
        guard.host_live_web = cfg.host_live_web.clone();
        guard.cookie_domain = cfg.cookie_domain.clone();
        guard.danmu_host = cfg.danmu_host.clone();
        guard.app_key = cfg.app_key.clone();
        guard.app_sec = cfg.app_sec.clone();
        guard.http_user_agent = cfg.http_user_agent.clone();
        guard.livehime_version_override = cfg.livehime_version_override.clone();
        guard.livehime_build_override = cfg.livehime_build_override.clone();
        guard.live_platform = cfg.live_platform.clone();
    }
}

fn base_www() -> String {
    with_runtime(|cfg| resolve_base(&cfg.host_www, "OPENBLIVE_HOST_WWW", DEFAULT_HOST_WWW))
}

fn base_api() -> String {
    with_runtime(|cfg| resolve_base(&cfg.host_api, "OPENBLIVE_HOST_API", DEFAULT_HOST_API))
}

fn base_live_api() -> String {
    with_runtime(|cfg| {
        resolve_base(
            &cfg.host_live_api,
            "OPENBLIVE_HOST_LIVE_API",
            DEFAULT_HOST_LIVE_API,
        )
    })
}

fn base_passport() -> String {
    with_runtime(|cfg| {
        resolve_base(
            &cfg.host_passport,
            "OPENBLIVE_HOST_PASSPORT",
            DEFAULT_HOST_PASSPORT,
        )
    })
}

fn base_live_web() -> String {
    with_runtime(|cfg| {
        resolve_base(
            &cfg.host_live_web,
            "OPENBLIVE_HOST_LIVE_WEB",
            DEFAULT_HOST_LIVE_WEB,
        )
    })
}

pub fn cookie_domain() -> String {
    with_runtime(|cfg| resolve_cookie_domain(&cfg.cookie_domain))
}

pub fn danmu_default_host() -> String {
    with_runtime(|cfg| resolve_danmu_host(&cfg.danmu_host))
}

pub fn app_key() -> String {
    with_runtime(|cfg| resolve_app_key(&cfg.app_key))
}

pub fn app_sec() -> String {
    with_runtime(|cfg| resolve_app_sec(&cfg.app_sec))
}

pub fn http_user_agent() -> String {
    with_runtime(|cfg| resolve_http_user_agent(&cfg.http_user_agent))
}

pub fn livehime_version_override() -> String {
    with_runtime(|cfg| resolve_livehime_version_override(&cfg.livehime_version_override))
}

pub fn livehime_build_override() -> Option<u64> {
    with_runtime(|cfg| resolve_livehime_build_override(&cfg.livehime_build_override))
}

pub fn live_platform() -> String {
    with_runtime(|cfg| resolve_live_platform(&cfg.live_platform))
}

pub fn danmu_default_wss_port() -> u64 {
    static VALUE: OnceLock<u64> = OnceLock::new();
    *VALUE.get_or_init(|| {
        std::env::var("OPENBLIVE_DANMU_WSS_PORT")
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_DANMU_WSS_PORT)
    })
}

pub fn www(path: &str) -> String {
    format!("{}{}", base_www(), path)
}

pub fn api(path: &str) -> String {
    format!("{}{}", base_api(), path)
}

pub fn live_api(path: &str) -> String {
    format!("{}{}", base_live_api(), path)
}

pub fn passport(path: &str) -> String {
    format!("{}{}", base_passport(), path)
}

pub fn live_web(path: &str) -> String {
    format!("{}{}", base_live_web(), path)
}

pub fn danmu_wss(host: &str, port: u64) -> String {
    format!("wss://{}:{}/sub", host, port)
}

pub fn api_origin() -> String {
    api("/")
}

pub fn live_web_origin() -> String {
    live_web("")
}

pub fn www_origin() -> String {
    www("/")
}
