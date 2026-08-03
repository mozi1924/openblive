use crate::client::BiliClient;
use crate::endpoints;
use crate::models::UserRecord;
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::url::normalize_https_url as normalize_face_url;

fn face_url_from_user_card_payload(value: &Value) -> Option<String> {
    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        return None;
    }

    value["data"]["card"]["face"]
        .as_str()
        .map(normalize_face_url)
        .filter(|face| !face.is_empty())
}

fn face_urls_from_batch_user_cards_payload(
    value: &Value,
) -> Result<HashMap<String, String>, String> {
    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        let message = value["message"].as_str().unwrap_or("unknown error");
        return Err(format!(
            "fetch batch user cards failed: code={code}, message={message}"
        ));
    }

    let mut faces = HashMap::new();
    let Some(data) = value["data"].as_object() else {
        return Ok(faces);
    };

    for (uid, entry) in data {
        let Some(face) = entry
            .get("face")
            .and_then(Value::as_str)
            .map(normalize_face_url)
            .filter(|face| !face.is_empty())
        else {
            continue;
        };
        faces.insert(uid.clone(), face);
    }

    Ok(faces)
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

pub async fn fetch_face_url_by_uid(
    client: &BiliClient,
    uid: &str,
) -> Result<Option<String>, String> {
    if !is_safe_uid(uid) {
        return Err("Invalid UID format".to_string());
    }

    let value = client
        .get_json(
            &endpoints::api("/x/web-interface/card"),
            &[("mid", uid.to_string())],
        )
        .await
        .map_err(|error| error.to_string())?;
    let code = value["code"].as_i64().unwrap_or(-1);
    if code != 0 {
        let message = value["message"].as_str().unwrap_or("unknown error");
        return Err(format!(
            "fetch user card failed: code={code}, message={message}"
        ));
    }

    Ok(face_url_from_user_card_payload(&value))
}

pub async fn fetch_face_urls_by_uids(
    client: &BiliClient,
    uids: &[String],
) -> Result<HashMap<String, String>, String> {
    let sanitized = uids
        .iter()
        .filter(|uid| is_safe_uid(uid))
        .cloned()
        .collect::<Vec<_>>();
    if sanitized.is_empty() {
        return Ok(HashMap::new());
    }

    let value = client
        .get_json(
            &endpoints::api("/x/polymer/pc-electron/v1/user/cards"),
            &[("uids", sanitized.join(","))],
        )
        .await
        .map_err(|error| error.to_string())?;

    face_urls_from_batch_user_cards_payload(&value)
}

pub async fn resolve_and_cache_face_data_url(
    client: &BiliClient,
    config_path: &Path,
    uid: &str,
    fallback_face: Option<&str>,
) -> Result<Option<String>, String> {
    if !is_safe_uid(uid) {
        return Err("Invalid UID format".to_string());
    }

    if let Some(face_url) = fetch_face_url_by_uid(client, uid).await? {
        refresh_avatar_cache(client, config_path, uid, &face_url).await?;
        return Ok(load_cached_face_data_url(config_path, uid));
    }

    if let Some(face_url) = fallback_face
        .map(normalize_face_url)
        .filter(|face| !face.is_empty())
    {
        refresh_avatar_cache(client, config_path, uid, &face_url).await?;
        return Ok(load_cached_face_data_url(config_path, uid));
    }

    Ok(None)
}

pub async fn resolve_and_cache_face_data_urls(
    client: &BiliClient,
    config_path: &Path,
    requests: &HashMap<String, Option<String>>,
) -> Result<HashMap<String, String>, String> {
    let mut resolved = HashMap::new();
    let uids = requests
        .keys()
        .filter(|uid| is_safe_uid(uid))
        .cloned()
        .collect::<Vec<_>>();
    if uids.is_empty() {
        return Ok(resolved);
    }

    let batch_faces = match fetch_face_urls_by_uids(client, &uids).await {
        Ok(faces) => Some(faces),
        Err(_) => None,
    };
    for uid in uids {
        let resolved_face =
            if let Some(face_url) = batch_faces.as_ref().and_then(|faces| faces.get(&uid)) {
                refresh_avatar_cache(client, config_path, &uid, face_url).await?;
                load_cached_face_data_url(config_path, &uid)
            } else {
                resolve_and_cache_face_data_url(
                    client,
                    config_path,
                    &uid,
                    requests.get(&uid).and_then(|value| value.as_deref()),
                )
                .await?
            };

        if let Some(face) = resolved_face {
            resolved.insert(uid, face);
        }
    }

    Ok(resolved)
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
    use super::{
        delete_avatar_cache, face_url_from_user_card_payload,
        face_urls_from_batch_user_cards_payload, has_cached_face,
    };
    use serde_json::json;
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

    #[test]
    fn parses_face_url_from_user_card_payload() {
        let payload = json!({
            "code": 0,
            "data": {
                "card": {
                    "face": "http://i0.hdslb.com/bfs/face/demo.jpg"
                }
            }
        });

        let face = face_url_from_user_card_payload(&payload);

        assert_eq!(
            face.as_deref(),
            Some("https://i0.hdslb.com/bfs/face/demo.jpg")
        );
    }

    #[test]
    fn parses_face_urls_from_batch_user_cards_payload() {
        let payload = json!({
            "code": 0,
            "data": {
                "1001": {
                    "face": "http://i0.hdslb.com/bfs/face/a.jpg"
                },
                "1002": {
                    "face": "https://i1.hdslb.com/bfs/face/b.png"
                },
                "1003": {}
            }
        });

        let faces = face_urls_from_batch_user_cards_payload(&payload).unwrap();

        assert_eq!(
            faces.get("1001").map(String::as_str),
            Some("https://i0.hdslb.com/bfs/face/a.jpg")
        );
        assert_eq!(
            faces.get("1002").map(String::as_str),
            Some("https://i1.hdslb.com/bfs/face/b.png")
        );
        assert!(!faces.contains_key("1003"));
    }
}
