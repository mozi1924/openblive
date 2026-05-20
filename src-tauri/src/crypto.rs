use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use anyhow::{anyhow, Result};
use base64::Engine;
use keyring::Entry;
use rand::RngCore;
use std::path::PathBuf;

const MASTER_KEY_FILENAME: &str = "master_key.b64";

fn config_home_dir() -> PathBuf {
    if let Ok(custom) = std::env::var("BILILIVE_CONFIG_HOME") {
        let dir = PathBuf::from(custom);
        let _ = std::fs::create_dir_all(&dir);
        return dir;
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = if cfg!(target_os = "macos") {
        home.join("Library")
            .join("Application Support")
            .join("OpenBliveStudio")
    } else {
        home.join(".openblive")
    };
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn local_master_key_path() -> PathBuf {
    config_home_dir().join(MASTER_KEY_FILENAME)
}

fn decode_master_key(encoded: &str) -> Option<[u8; 32]> {
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    if raw.len() != 32 {
        return None;
    }
    let mut out = [0u8; 32];
    out.copy_from_slice(&raw);
    Some(out)
}

fn read_master_key_from_file() -> Option<[u8; 32]> {
    let path = local_master_key_path();
    let content = std::fs::read_to_string(path).ok()?;
    decode_master_key(content.trim())
}

fn write_master_key_to_file(key: &[u8; 32]) {
    let path = local_master_key_path();
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(&path, encoded);
}

fn remove_master_key_file() {
    let path = local_master_key_path();
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}

pub fn get_or_create_master_key() -> Result<[u8; 32]> {
    let entry = Entry::new("OpenBliveStudio", "credential_master_key").ok();
    let keyring_key = entry
        .as_ref()
        .and_then(|item| item.get_password().ok())
        .and_then(|secret| decode_master_key(&secret));
    let file_key = read_master_key_from_file();

    if let Some(key) = keyring_key {
        eprintln!("[auth][key] master key source=keyring");
        remove_master_key_file();
        return Ok(key);
    }

    if let Some(key) = file_key {
        eprintln!("[auth][key] master key source=local_file_fallback");
        if let Some(item) = entry.as_ref() {
            let encoded = base64::engine::general_purpose::STANDARD.encode(key);
            match item.set_password(&encoded) {
                Ok(()) => {
                    eprintln!("[auth][key] master key migrated_to=keyring");
                    remove_master_key_file();
                }
                Err(error) => {
                    eprintln!("[auth][key] keyring store failed, keep local fallback: {error}");
                }
            }
        }
        return Ok(key);
    }

    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    if let Some(item) = entry.as_ref() {
        match item.set_password(&encoded) {
            Ok(()) => {
                eprintln!("[auth][key] master key source=new_generated_keyring");
                remove_master_key_file();
                return Ok(key);
            }
            Err(error) => {
                eprintln!("[auth][key] keyring unavailable, fallback to local file: {error}");
            }
        }
    }

    write_master_key_to_file(&key);
    eprintln!("[auth][key] master key source=new_generated_local_file_fallback");
    Ok(key)
}

pub fn encrypt_text(plain: &str, key: &[u8; 32]) -> Result<String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| anyhow!(error.to_string()))?;
    let mut nonce = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), plain.as_bytes())
        .map_err(|error| anyhow!(error.to_string()))?;

    let mut payload = Vec::with_capacity(12 + ciphertext.len());
    payload.extend_from_slice(&nonce);
    payload.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(payload))
}

pub fn decrypt_text(enc: &str, key: &[u8; 32]) -> Result<String> {
    let payload = base64::engine::general_purpose::STANDARD
        .decode(enc)
        .map_err(|error| anyhow!(error.to_string()))?;
    if payload.len() < 13 {
        return Err(anyhow!("invalid encrypted payload"));
    }

    let (nonce, data) = payload.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|error| anyhow!(error.to_string()))?;
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce), data)
        .map_err(|error| anyhow!(error.to_string()))?;

    String::from_utf8(plain).map_err(|error| anyhow!(error.to_string()))
}
