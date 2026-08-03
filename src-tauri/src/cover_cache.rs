use crate::client::BiliClient;
use crate::endpoints;
use crate::models::UserRecord;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::path::{Path, PathBuf};

use crate::url::normalize_https_url as normalize_cover_url;

fn cover_dir(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("covers")
}

fn cache_key(cover_url: &str) -> Option<String> {
    let normalized = normalize_cover_url(cover_url);
    if normalized.is_empty() {
        return None;
    }
    Some(format!("{:x}", md5::compute(normalized.as_bytes())))
}

fn cover_path(config_path: &Path, cover_url: &str) -> Option<PathBuf> {
    cache_key(cover_url).map(|key| cover_dir(config_path).join(key))
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

pub fn has_cached_cover(config_path: &Path, cover_url: &str) -> bool {
    cover_path(config_path, cover_url)
        .map(|path| path.is_file())
        .unwrap_or(false)
}

pub fn load_cached_cover_data_url(config_path: &Path, cover_url: &str) -> Option<String> {
    let path = cover_path(config_path, cover_url)?;
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }
    let mime = detect_mime(&bytes);
    let encoded = BASE64_STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

pub async fn refresh_cover_cache(
    client: &BiliClient,
    config_path: &Path,
    cover_url: &str,
) -> Result<(), String> {
    let normalized = normalize_cover_url(cover_url);
    if normalized.is_empty() {
        return Ok(());
    }

    let resp = client
        .http
        .get(&normalized)
        .header("user-agent", endpoints::http_user_agent())
        .header("referer", endpoints::live_web(""))
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download cover failed: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Err("empty cover data".into());
    }

    let dir = cover_dir(config_path);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let file =
        cover_path(config_path, &normalized).ok_or_else(|| "invalid cover url".to_string())?;
    std::fs::write(file, &bytes).map_err(|error| error.to_string())?;
    Ok(())
}

pub async fn ensure_cover_data_url(
    client: &BiliClient,
    config_path: &Path,
    cover_url: &str,
) -> Option<String> {
    let normalized = normalize_cover_url(cover_url);
    if normalized.is_empty() {
        return None;
    }
    if let Some(data_url) = load_cached_cover_data_url(config_path, &normalized) {
        return Some(data_url);
    }
    if refresh_cover_cache(client, config_path, &normalized)
        .await
        .is_err()
    {
        return None;
    }
    load_cached_cover_data_url(config_path, &normalized)
}

pub fn apply_cached_cover_to_user(config_path: &Path, user: &mut UserRecord) {
    user.last_cover_asset =
        load_cached_cover_data_url(config_path, &user.last_cover).unwrap_or_default();
}
