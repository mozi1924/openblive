use crate::client::BiliClient;
use crate::endpoints;
use crate::models::UserRecord;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::path::{Path, PathBuf};

fn normalize_face_url(face: &str) -> String {
    let trimmed = face.trim();
    if trimmed.starts_with("//") {
        format!("https:{trimmed}")
    } else if let Some(stripped) = trimmed.strip_prefix("http://") {
        format!("https://{stripped}")
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

fn is_safe_uid(uid: &str) -> bool {
    !uid.is_empty() && uid.chars().all(|ch| ch.is_ascii_digit())
}

pub fn has_cached_face(config_path: &Path, uid: &str) -> bool {
    if !is_safe_uid(uid) {
        return false;
    }
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
    if !is_safe_uid(uid) {
        return None;
    }
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
    if !is_safe_uid(uid) {
        return Err("Invalid UID format".to_string());
    }

    let face_url = normalize_face_url(face);
    if face_url.is_empty() {
        return Ok(());
    }

    let resp = client
        .http
        .get(&face_url)
        .header("user-agent", endpoints::http_user_agent())
        .header("referer", endpoints::www_origin())
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

pub fn delete_avatar_cache(config_path: &Path, uid: &str) -> Result<(), String> {
    if !is_safe_uid(uid) {
        return Err("Invalid UID format".to_string());
    }

    let dir = avatar_dir(config_path);
    let path = avatar_path(config_path, uid);
    if !path.starts_with(&dir) {
        return Err("Resolved avatar cache path is outside of avatar directory".to_string());
    }

    if path.exists() {
        std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{delete_avatar_cache, has_cached_face};
    use std::path::PathBuf;

    fn temp_config_path(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        dir.push(format!(
            "openblive-avatar-test-{name}-{}-{now}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir.join("config.json")
    }

    #[test]
    fn has_cached_face_rejects_invalid_uid() {
        let config_path = temp_config_path("invalid_uid_cached_face");
        assert!(!has_cached_face(&config_path, "../../etc/passwd"));
        let _ = std::fs::remove_dir_all(
            config_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        );
    }

    #[test]
    fn delete_avatar_cache_rejects_invalid_uid() {
        let config_path = temp_config_path("invalid_uid_delete");
        let result = delete_avatar_cache(&config_path, "../123");
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(
            config_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        );
    }

    #[test]
    fn delete_avatar_cache_deletes_existing_file_for_valid_uid() {
        let config_path = temp_config_path("valid_uid_delete");
        let avatar_dir = config_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("avatars");
        let _ = std::fs::create_dir_all(&avatar_dir);
        let avatar_file = avatar_dir.join("12345");
        let _ = std::fs::write(&avatar_file, b"demo");
        assert!(avatar_file.exists());

        let result = delete_avatar_cache(&config_path, "12345");
        assert!(result.is_ok());
        assert!(!avatar_file.exists());

        let _ = std::fs::remove_dir_all(
            config_path
                .parent()
                .unwrap_or_else(|| std::path::Path::new(".")),
        );
    }
}
