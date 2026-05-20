use crate::crypto::{decrypt_text, encrypt_text};
use crate::models::{
    sync_live_profile_state_defaults, LiveProfileState, PersistConfig, RecentArea, UserRecord,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const LEGACY_CONFIG_FILE: &str = "config.json";
const APP_CONFIG_FILE: &str = "app.json";
const ACCOUNT_CONFIG_FILE: &str = "accounts.json";
const LIVE_CACHE_CONFIG_FILE: &str = "live_cache.json";

#[derive(Default, Clone, Serialize, Deserialize)]
struct AppSettingsFile {
    #[serde(default = "default_min_to_tray")]
    min_to_tray: bool,
    #[serde(default = "default_hide_dock_on_minimize")]
    hide_dock_on_minimize: bool,
    #[serde(default = "default_danmu_overlay_enabled")]
    danmu_overlay_enabled: bool,
    #[serde(default = "default_danmu_overlay_opacity")]
    danmu_overlay_opacity: u8,
    #[serde(default = "default_live_control_mode")]
    live_control_mode: String,
    #[serde(default)]
    obs_ws_enabled: bool,
    #[serde(default = "default_obs_ws_url")]
    obs_ws_url: String,
    #[serde(default)]
    obs_ws_password: String,
    #[serde(default)]
    obs_ws_password_enc: String,
    #[serde(default)]
    obs_ws_auto_start_on_live: bool,
    #[serde(default)]
    obs_ws_auto_stop_on_live_end: bool,
    #[serde(default)]
    on_live_start_command: String,
    #[serde(default)]
    on_live_stop_command: String,
    #[serde(default = "default_locale")]
    locale: String,
    #[serde(default)]
    host_www: String,
    #[serde(default)]
    host_api: String,
    #[serde(default)]
    host_live_api: String,
    #[serde(default)]
    host_passport: String,
    #[serde(default)]
    host_live_web: String,
    #[serde(default)]
    cookie_domain: String,
    #[serde(default)]
    danmu_host: String,
    #[serde(default)]
    app_key: String,
    #[serde(default)]
    app_sec: String,
    #[serde(default)]
    http_user_agent: String,
    #[serde(default)]
    livehime_version_override: String,
    #[serde(default)]
    livehime_build_override: String,
    #[serde(default)]
    live_platform: String,
}

#[derive(Default, Clone, Serialize, Deserialize)]
struct AccountUserFile {
    uid: String,
    uname: String,
    face: String,
    #[serde(rename = "roomId")]
    room_id: String,
    enc_cookie: String,
    #[serde(default)]
    enc_refresh_token: String,
    enc_csrf: String,
    level: i64,
    current_exp: i64,
    next_exp: i64,
    money: f64,
    bcoin: f64,
    following: i64,
    follower: i64,
    dynamic_count: i64,
    #[serde(default)]
    login_invalid: bool,
    #[serde(default)]
    auth_fail_count: u32,
    #[serde(default)]
    last_auth_fail_at: i64,
}

#[derive(Default, Clone, Serialize, Deserialize)]
struct AccountFile {
    #[serde(default)]
    users: HashMap<String, AccountUserFile>,
    current_uid: Option<String>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
struct LiveUserCacheFile {
    #[serde(default)]
    last_title: String,
    #[serde(default)]
    last_area_id: String,
    #[serde(default)]
    last_area_name: Vec<String>,
    #[serde(default)]
    last_tags: Vec<String>,
    #[serde(default)]
    recent_areas: Vec<RecentArea>,
    #[serde(default)]
    live_profile_state: LiveProfileState,
}

#[derive(Clone, Serialize, Deserialize)]
struct LiveCacheFile {
    #[serde(default)]
    users: HashMap<String, LiveUserCacheFile>,
    #[serde(default = "default_live_client_version")]
    live_client_version: String,
    #[serde(default = "default_live_client_build")]
    live_client_build: u64,
    #[serde(default = "default_live_client_synced_at")]
    live_client_synced_at: i64,
}

impl Default for LiveCacheFile {
    fn default() -> Self {
        Self {
            users: HashMap::new(),
            live_client_version: default_live_client_version(),
            live_client_build: default_live_client_build(),
            live_client_synced_at: default_live_client_synced_at(),
        }
    }
}

fn default_min_to_tray() -> bool {
    true
}

fn default_hide_dock_on_minimize() -> bool {
    false
}

fn default_danmu_overlay_enabled() -> bool {
    true
}

fn default_danmu_overlay_opacity() -> u8 {
    85
}

fn default_obs_ws_url() -> String {
    "ws://127.0.0.1:4455".to_string()
}

fn default_live_control_mode() -> String {
    "none".to_string()
}

fn default_locale() -> String {
    "auto".to_string()
}

fn default_live_client_version() -> String {
    crate::constants::DEFAULT_LIVEHIME_VERSION.to_string()
}

fn default_live_client_build() -> u64 {
    crate::constants::DEFAULT_LIVEHIME_BUILD
}

fn default_live_client_synced_at() -> i64 {
    0
}

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

pub fn config_path() -> PathBuf {
    config_home_dir().join(LEGACY_CONFIG_FILE)
}

fn config_dir_from_path(path: &Path) -> PathBuf {
    path.parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(config_home_dir)
}

fn app_config_path(base_path: &Path) -> PathBuf {
    config_dir_from_path(base_path).join(APP_CONFIG_FILE)
}

fn account_config_path(base_path: &Path) -> PathBuf {
    config_dir_from_path(base_path).join(ACCOUNT_CONFIG_FILE)
}

fn live_cache_config_path(base_path: &Path) -> PathBuf {
    config_dir_from_path(base_path).join(LIVE_CACHE_CONFIG_FILE)
}

fn load_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<T>(&content).ok())
}

fn write_json<T: Serialize>(path: &Path, value: &T) {
    if let Ok(content) = serde_json::to_string_pretty(value) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(path, content);
    }
}

fn load_legacy_config(path: &Path, key: &[u8; 32]) -> Option<PersistConfig> {
    let mut cfg: PersistConfig = load_json(path)?;
    for (uid, user) in cfg.users.iter_mut() {
        let mut credential_corrupted = false;
        user.cookie = match decrypt_text(&user.enc_cookie, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_cookie.is_empty() {
                    crate::runtime_warn!(
                        "[auth][config] legacy decrypt cookie failed uid={uid}: {error}"
                    );
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        user.refresh_token = match decrypt_text(&user.enc_refresh_token, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_refresh_token.is_empty() {
                    crate::runtime_log!(
                        "[auth][config] legacy decrypt refresh_token failed uid={uid}: {error}"
                    );
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        user.csrf = match decrypt_text(&user.enc_csrf, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_csrf.is_empty() {
                    crate::runtime_warn!(
                        "[auth][config] legacy decrypt csrf failed uid={uid}: {error}"
                    );
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        if credential_corrupted {
            user.login_invalid = true;
            user.live_key = None;
            user.sub_session_key = None;
        }
    }
    Some(cfg)
}

fn split_files_exist(base_path: &Path) -> bool {
    app_config_path(base_path).is_file()
        || account_config_path(base_path).is_file()
        || live_cache_config_path(base_path).is_file()
}

pub fn load_config(path: &Path, key: &[u8; 32]) -> PersistConfig {
    if !split_files_exist(path) {
        if let Some(legacy) = load_legacy_config(path, key) {
            save_config(path, &legacy, key);
            return legacy;
        }
    }

    let mut cfg = PersistConfig::default();

    if let Some(app_file) = load_json::<AppSettingsFile>(&app_config_path(path)) {
        cfg.min_to_tray = app_file.min_to_tray;
        cfg.hide_dock_on_minimize = app_file.hide_dock_on_minimize;
        cfg.danmu_overlay_enabled = app_file.danmu_overlay_enabled;
        cfg.danmu_overlay_opacity = app_file.danmu_overlay_opacity.clamp(40, 100);
        cfg.live_control_mode = app_file.live_control_mode;
        cfg.obs_ws_enabled = app_file.obs_ws_enabled;
        cfg.obs_ws_url = app_file.obs_ws_url;
        cfg.obs_ws_password = if !app_file.obs_ws_password_enc.trim().is_empty() {
            match decrypt_text(&app_file.obs_ws_password_enc, key) {
                Ok(value) => value,
                Err(error) => {
                    crate::runtime_warn!("[auth][config] decrypt obs_ws_password failed: {error}");
                    String::new()
                }
            }
        } else if app_file.obs_ws_password.trim().is_empty() {
            String::new()
        } else {
            match decrypt_text(&app_file.obs_ws_password, key) {
                Ok(value) => value,
                Err(_) => app_file.obs_ws_password,
            }
        };
        cfg.obs_ws_auto_start_on_live = app_file.obs_ws_auto_start_on_live;
        cfg.obs_ws_auto_stop_on_live_end = app_file.obs_ws_auto_stop_on_live_end;
        cfg.on_live_start_command = app_file.on_live_start_command;
        cfg.on_live_stop_command = app_file.on_live_stop_command;
        cfg.locale = crate::i18n::normalize_locale_setting(&app_file.locale).to_string();
        cfg.host_www = app_file.host_www;
        cfg.host_api = app_file.host_api;
        cfg.host_live_api = app_file.host_live_api;
        cfg.host_passport = app_file.host_passport;
        cfg.host_live_web = app_file.host_live_web;
        cfg.cookie_domain = app_file.cookie_domain;
        cfg.danmu_host = app_file.danmu_host;
        cfg.app_key = app_file.app_key;
        cfg.app_sec = app_file.app_sec;
        cfg.http_user_agent = app_file.http_user_agent;
        cfg.livehime_version_override = app_file.livehime_version_override;
        cfg.livehime_build_override = app_file.livehime_build_override;
        cfg.live_platform = app_file.live_platform;

        if cfg.live_control_mode.trim().is_empty() || cfg.live_control_mode == "none" {
            if cfg.obs_ws_enabled {
                cfg.live_control_mode = "obs_ws".to_string();
            } else if !cfg.on_live_start_command.trim().is_empty()
                || !cfg.on_live_stop_command.trim().is_empty()
            {
                cfg.live_control_mode = "command".to_string();
            }
        }
    }

    if let Some(account_file) = load_json::<AccountFile>(&account_config_path(path)) {
        cfg.current_uid = account_file.current_uid;
        for (uid, user) in account_file.users {
            let record = UserRecord {
                uid: user.uid,
                uname: user.uname,
                face: user.face,
                room_id: user.room_id,
                enc_cookie: user.enc_cookie,
                enc_refresh_token: user.enc_refresh_token,
                enc_csrf: user.enc_csrf,
                level: user.level,
                current_exp: user.current_exp,
                next_exp: user.next_exp,
                money: user.money,
                bcoin: user.bcoin,
                following: user.following,
                follower: user.follower,
                dynamic_count: user.dynamic_count,
                login_invalid: user.login_invalid,
                auth_fail_count: user.auth_fail_count,
                last_auth_fail_at: user.last_auth_fail_at,
                ..Default::default()
            };
            cfg.users.insert(uid, record);
        }
    }

    if let Some(live_file) = load_json::<LiveCacheFile>(&live_cache_config_path(path)) {
        cfg.live_client_version = live_file.live_client_version;
        cfg.live_client_build = live_file.live_client_build;
        cfg.live_client_synced_at = live_file.live_client_synced_at;

        for (uid, cache) in live_file.users {
            if let Some(user) = cfg.users.get_mut(&uid) {
                user.last_title = cache.last_title;
                user.last_area_id = cache.last_area_id;
                user.last_area_name = cache.last_area_name;
                user.last_tags = cache.last_tags;
                user.recent_areas = cache.recent_areas;
                user.live_profile_state = cache.live_profile_state;
            }
        }
    }

    for (uid, user) in cfg.users.iter_mut() {
        sync_live_profile_state_defaults(user);
        let mut credential_corrupted = false;
        user.cookie = match decrypt_text(&user.enc_cookie, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_cookie.is_empty() {
                    crate::runtime_warn!("[auth][config] decrypt cookie failed uid={uid}: {error}");
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        user.refresh_token = match decrypt_text(&user.enc_refresh_token, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_refresh_token.is_empty() {
                    crate::runtime_warn!(
                        "[auth][config] decrypt refresh_token failed uid={uid}: {error}"
                    );
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        user.csrf = match decrypt_text(&user.enc_csrf, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_csrf.is_empty() {
                    crate::runtime_warn!("[auth][config] decrypt csrf failed uid={uid}: {error}");
                    credential_corrupted = true;
                }
                String::new()
            }
        };
        if credential_corrupted {
            user.login_invalid = true;
            user.live_key = None;
            user.sub_session_key = None;
        }
    }
    if let Some(uid) = cfg.current_uid.clone() {
        let should_clear_current = !cfg.users.contains_key(&uid);
        if should_clear_current {
            cfg.current_uid = None;
        }
    }

    cfg
}

pub fn save_config(path: &Path, cfg: &PersistConfig, key: &[u8; 32]) {
    let obs_ws_password_enc = if cfg.obs_ws_password.trim().is_empty() {
        String::new()
    } else {
        match encrypt_text(&cfg.obs_ws_password, key) {
            Ok(enc) => enc,
            Err(error) => {
                crate::runtime_warn!("[auth][config] encrypt obs_ws_password failed: {error}");
                String::new()
            }
        }
    };
    let app_file = AppSettingsFile {
        min_to_tray: cfg.min_to_tray,
        hide_dock_on_minimize: cfg.hide_dock_on_minimize,
        danmu_overlay_enabled: cfg.danmu_overlay_enabled,
        danmu_overlay_opacity: cfg.danmu_overlay_opacity.clamp(40, 100),
        live_control_mode: cfg.live_control_mode.clone(),
        obs_ws_enabled: cfg.obs_ws_enabled,
        obs_ws_url: cfg.obs_ws_url.clone(),
        obs_ws_password: String::new(),
        obs_ws_password_enc,
        obs_ws_auto_start_on_live: cfg.obs_ws_auto_start_on_live,
        obs_ws_auto_stop_on_live_end: cfg.obs_ws_auto_stop_on_live_end,
        on_live_start_command: cfg.on_live_start_command.clone(),
        on_live_stop_command: cfg.on_live_stop_command.clone(),
        locale: cfg.locale.clone(),
        host_www: cfg.host_www.clone(),
        host_api: cfg.host_api.clone(),
        host_live_api: cfg.host_live_api.clone(),
        host_passport: cfg.host_passport.clone(),
        host_live_web: cfg.host_live_web.clone(),
        cookie_domain: cfg.cookie_domain.clone(),
        danmu_host: cfg.danmu_host.clone(),
        app_key: cfg.app_key.clone(),
        app_sec: cfg.app_sec.clone(),
        http_user_agent: cfg.http_user_agent.clone(),
        livehime_version_override: cfg.livehime_version_override.clone(),
        livehime_build_override: cfg.livehime_build_override.clone(),
        live_platform: cfg.live_platform.clone(),
    };

    let mut account_file = AccountFile {
        current_uid: cfg.current_uid.clone(),
        ..Default::default()
    };

    let mut live_file = LiveCacheFile {
        live_client_version: cfg.live_client_version.clone(),
        live_client_build: cfg.live_client_build,
        live_client_synced_at: cfg.live_client_synced_at,
        ..Default::default()
    };

    for (uid, user) in &cfg.users {
        let mut enc_cookie = user.enc_cookie.clone();
        let mut enc_refresh_token = user.enc_refresh_token.clone();
        let mut enc_csrf = user.enc_csrf.clone();
        if !user.cookie.is_empty() {
            if let Ok(enc) = encrypt_text(&user.cookie, key) {
                enc_cookie = enc;
            }
        }
        if !user.refresh_token.is_empty() {
            if let Ok(enc) = encrypt_text(&user.refresh_token, key) {
                enc_refresh_token = enc;
            }
        }
        if !user.csrf.is_empty() {
            if let Ok(enc) = encrypt_text(&user.csrf, key) {
                enc_csrf = enc;
            }
        }

        account_file.users.insert(
            uid.clone(),
            AccountUserFile {
                uid: user.uid.clone(),
                uname: user.uname.clone(),
                face: user.face.clone(),
                room_id: user.room_id.clone(),
                enc_cookie,
                enc_refresh_token,
                enc_csrf,
                level: user.level,
                current_exp: user.current_exp,
                next_exp: user.next_exp,
                money: user.money,
                bcoin: user.bcoin,
                following: user.following,
                follower: user.follower,
                dynamic_count: user.dynamic_count,
                login_invalid: user.login_invalid,
                auth_fail_count: user.auth_fail_count,
                last_auth_fail_at: user.last_auth_fail_at,
            },
        );

        live_file.users.insert(
            uid.clone(),
            LiveUserCacheFile {
                last_title: user.last_title.clone(),
                last_area_id: user.last_area_id.clone(),
                last_area_name: user.last_area_name.clone(),
                last_tags: user.last_tags.clone(),
                recent_areas: user.recent_areas.clone(),
                live_profile_state: user.live_profile_state.clone(),
            },
        );
    }

    write_json(&app_config_path(path), &app_file);
    write_json(&account_config_path(path), &account_file);
    write_json(&live_cache_config_path(path), &live_file);
}

#[cfg(test)]
mod tests {
    use super::{app_config_path, load_config, save_config};
    use crate::models::PersistConfig;
    use serde_json::Value;
    use std::path::{Path, PathBuf};

    fn test_key() -> [u8; 32] {
        [42u8; 32]
    }

    fn temp_config_path(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        dir.push(format!(
            "openblive-config-test-{name}-{}-{now}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir.join("config.json")
    }

    fn cleanup(config_path: &Path) {
        let parent = config_path.parent().unwrap_or_else(|| Path::new("."));
        let _ = std::fs::remove_dir_all(parent);
    }

    #[test]
    fn save_and_load_obs_password_uses_encrypted_field() {
        let config_path = temp_config_path("obs_encrypt_roundtrip");
        let cfg = PersistConfig {
            obs_ws_password: "super-secret-password".to_string(),
            ..Default::default()
        };

        save_config(&config_path, &cfg, &test_key());

        let app_path = app_config_path(&config_path);
        let raw = std::fs::read_to_string(&app_path).expect("app.json should exist");
        let json: Value = serde_json::from_str(&raw).expect("app.json should be valid json");

        assert_eq!(
            json["obs_ws_password"].as_str().unwrap_or(""),
            "",
            "plaintext obs_ws_password should not be persisted"
        );
        let encrypted = json["obs_ws_password_enc"].as_str().unwrap_or("");
        assert!(
            !encrypted.is_empty(),
            "encrypted obs_ws_password_enc should be written"
        );
        assert_ne!(encrypted, "super-secret-password");

        let loaded = load_config(&config_path, &test_key());
        assert_eq!(loaded.obs_ws_password, "super-secret-password");

        cleanup(&config_path);
    }

    #[test]
    fn load_config_keeps_plaintext_obs_password_for_legacy_file() {
        let config_path = temp_config_path("obs_plaintext_legacy");
        let app_path = app_config_path(&config_path);
        let parent = app_path.parent().unwrap_or_else(|| Path::new("."));
        let _ = std::fs::create_dir_all(parent);
        let _ = std::fs::write(
            &app_path,
            r#"{
              "obs_ws_password": "legacy-plain-password",
              "obs_ws_url": "ws://127.0.0.1:4455"
            }"#,
        );

        let loaded = load_config(&config_path, &test_key());
        assert_eq!(loaded.obs_ws_password, "legacy-plain-password");

        cleanup(&config_path);
    }
}
