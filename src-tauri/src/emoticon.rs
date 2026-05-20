use crate::client::BiliClient;
use crate::endpoints;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize)]
pub struct LiveEmoticonResource {
    pub emoticon_id: u64,
    pub emoticon_unique: String,
    pub text: String,
    pub label: String,
    pub url: String,
    pub width: u64,
    pub height: u64,
    pub is_dynamic: bool,
}

#[derive(Clone, Serialize)]
pub struct LiveEmoticonPackage {
    pub pkg_id: u64,
    pub pkg_name: String,
    pub pkg_descript: String,
    pub emoticons: Vec<LiveEmoticonResource>,
}

fn normalize_image_url(url: &str) -> String {
    let trimmed = url.trim();
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else if let Some(rest) = trimmed.strip_prefix("http://") {
        format!("https://{rest}")
    } else {
        trimmed.to_string()
    }
}

fn normalize_emoticon_text(text: &str) -> String {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        String::new()
    } else if trimmed.starts_with('[') && trimmed.ends_with(']') {
        trimmed.to_string()
    } else {
        format!("[{trimmed}]")
    }
}

fn sanitize_cache_key(key: &str) -> String {
    let sanitized: String = key
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}

fn emoticon_dir(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("emoticons")
}

fn emoticon_path(config_path: &Path, cache_key: &str) -> PathBuf {
    emoticon_dir(config_path).join(sanitize_cache_key(cache_key))
}

fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "image/png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

fn load_cached_emoticon_data_url(config_path: &Path, cache_key: &str) -> Option<String> {
    let bytes = std::fs::read(emoticon_path(config_path, cache_key)).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let mime = detect_mime(&bytes);
    let encoded = BASE64_STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

async fn refresh_emoticon_cache(
    client: &BiliClient,
    config_path: &Path,
    cache_key: &str,
    image_url: &str,
) -> Result<(), String> {
    let normalized_url = normalize_image_url(image_url);
    if normalized_url.is_empty() {
        return Err("empty emoticon url".into());
    }

    let resp = client
        .http
        .get(&normalized_url)
        .header("referer", endpoints::live_web_origin())
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download emoticon failed: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Err("empty emoticon data".into());
    }

    std::fs::create_dir_all(emoticon_dir(config_path)).map_err(|error| error.to_string())?;
    std::fs::write(emoticon_path(config_path, cache_key), &bytes)
        .map_err(|error| error.to_string())?;
    Ok(())
}

async fn resolve_emoticon_url(
    client: &BiliClient,
    config_path: &Path,
    cache_key: &str,
    image_url: &str,
) -> String {
    if let Some(cached) = load_cached_emoticon_data_url(config_path, cache_key) {
        return cached;
    }

    if refresh_emoticon_cache(client, config_path, cache_key, image_url)
        .await
        .is_ok()
    {
        if let Some(cached) = load_cached_emoticon_data_url(config_path, cache_key) {
            return cached;
        }
    }

    normalize_image_url(image_url)
}

pub async fn parse_live_emoticon_packages(
    client: &BiliClient,
    config_path: &Path,
    value: &Value,
) -> Vec<LiveEmoticonPackage> {
    let mut packages = Vec::new();
    let Some(list) = value["data"]["data"].as_array() else {
        return packages;
    };

    for package in list {
        let pkg_id = package["pkg_id"].as_u64().unwrap_or_default();
        let pkg_name = package["pkg_name"].as_str().unwrap_or_default().to_string();
        let pkg_descript = package["pkg_descript"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let Some(items) = package["emoticons"].as_array() else {
            continue;
        };

        let mut emoticons = Vec::new();
        for item in items {
            let emoticon_id = item["emoticon_id"].as_u64().unwrap_or_default();
            let emoticon_unique = item["emoticon_unique"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let label = item["emoji"]
                .as_str()
                .or_else(|| item["descript"].as_str())
                .unwrap_or_default()
                .trim()
                .to_string();
            let text = normalize_emoticon_text(&label);
            if text.is_empty() {
                continue;
            }

            let source_url = item["url"].as_str().unwrap_or_default();
            let cache_key = if !emoticon_unique.is_empty() {
                emoticon_unique.clone()
            } else if emoticon_id > 0 {
                format!("emoji_{emoticon_id}")
            } else if !source_url.trim().is_empty() {
                format!("{:x}", md5::compute(source_url.as_bytes()))
            } else {
                format!("pkg_{pkg_id}_{}", emoticons.len())
            };

            emoticons.push(LiveEmoticonResource {
                emoticon_id,
                emoticon_unique,
                text,
                label,
                url: resolve_emoticon_url(client, config_path, &cache_key, source_url).await,
                width: item["width"].as_u64().unwrap_or_default(),
                height: item["height"].as_u64().unwrap_or_default(),
                is_dynamic: item["is_dynamic"].as_i64().unwrap_or_default() > 0,
            });
        }

        if emoticons.is_empty() {
            continue;
        }

        packages.push(LiveEmoticonPackage {
            pkg_id,
            pkg_name,
            pkg_descript,
            emoticons,
        });
    }

    packages
}
