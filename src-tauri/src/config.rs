use crate::crypto::{decrypt_text, encrypt_text};
use crate::models::PersistConfig;
use std::path::PathBuf;

pub fn config_path() -> PathBuf {
    if let Ok(custom) = std::env::var("BILILIVE_CONFIG_HOME") {
        return PathBuf::from(custom).join("config.json");
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
    dir.join("config.json")
}

pub fn load_config(path: &PathBuf, key: &[u8; 32]) -> PersistConfig {
    let mut cfg: PersistConfig = std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default();

    for user in cfg.users.values_mut() {
        user.cookie = decrypt_text(&user.enc_cookie, key).unwrap_or_default();
        user.csrf = decrypt_text(&user.enc_csrf, key).unwrap_or_default();
    }

    cfg
}

pub fn save_config(path: &PathBuf, cfg: &PersistConfig, key: &[u8; 32]) {
    let mut cloned = cfg.clone();
    for user in cloned.users.values_mut() {
        if !user.cookie.is_empty() {
            if let Ok(enc) = encrypt_text(&user.cookie, key) {
                user.enc_cookie = enc;
            }
        }
        if !user.csrf.is_empty() {
            if let Ok(enc) = encrypt_text(&user.csrf, key) {
                user.enc_csrf = enc;
            }
        }
        user.cookie.clear();
        user.csrf.clear();
    }

    if let Ok(content) = serde_json::to_string_pretty(&cloned) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, content);
    }
}
