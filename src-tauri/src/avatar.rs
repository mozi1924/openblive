use crate::client::BiliClient;
use crate::models::UserRecord;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::path::{Path, PathBuf};

fn normalize_face_url(face: &str) -> String {
    let trimmed = face.trim();
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else {
        trimmed.to_string()
    }
}

fn avatar_dir(config_path: &Path) -> PathBuf {
    config_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("avatars")
}

fn avatar_path(config_path: &Path, uid: &str) -> PathBuf {
    avatar_dir(config_path).join(uid)
}

pub fn has_cached_face(config_path: &Path, uid: &str) -> bool {
    avatar_path(config_path, uid).is_file()
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

pub fn load_cached_face_data_url(config_path: &Path, uid: &str) -> Option<String> {
    let path = avatar_path(config_path, uid);
    let bytes = std::fs::read(path).ok()?;
    if bytes.is_empty() {
        return None;
    }

    let mime = detect_mime(&bytes);
    let encoded = BASE64_STANDARD.encode(bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

pub fn to_response_user(config_path: &Path, user: &UserRecord) -> UserRecord {
    let mut output = user.clone();
    if let Some(face) = load_cached_face_data_url(config_path, &user.uid) {
        output.face = face;
    } else {
        output.face = normalize_face_url(&output.face);
    }
    output
}

pub async fn refresh_avatar_cache(
    client: &BiliClient,
    config_path: &Path,
    uid: &str,
    face: &str,
) -> Result<(), String> {
    let face_url = normalize_face_url(face);
    if face_url.is_empty() {
        return Ok(());
    }

    let resp = client
        .http
        .get(&face_url)
        .header("referer", "https://www.bilibili.com")
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("download avatar failed: {}", resp.status()));
    }

    let bytes = resp.bytes().await.map_err(|error| error.to_string())?;
    if bytes.is_empty() {
        return Err("empty avatar data".into());
    }

    let dir = avatar_dir(config_path);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let file = avatar_path(config_path, uid);
    std::fs::write(file, &bytes).map_err(|error| error.to_string())?;
    Ok(())
}

pub fn delete_avatar_cache(config_path: &Path, uid: &str) {
    let _ = std::fs::remove_file(avatar_path(config_path, uid));
}
