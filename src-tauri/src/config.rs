use crate::crypto::{decrypt_text, encrypt_text};
use crate::models::{
    sync_live_profile_state_defaults, LiveProfileState, PersistConfig, UserRecord,
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
    #[serde(default = "default_live_control_mode")]
    live_control_mode: String,
    #[serde(default)]
    obs_ws_enabled: bool,
    #[serde(default = "default_obs_ws_url")]
    obs_ws_url: String,
    #[serde(default)]
    obs_ws_password: String,
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
        user.cookie = match decrypt_text(&user.enc_cookie, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_cookie.is_empty() {
                    eprintln!("[auth][config] legacy decrypt cookie failed uid={uid}: {error}");
                }
                String::new()
            }
        };
        user.refresh_token = match decrypt_text(&user.enc_refresh_token, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_refresh_token.is_empty() {
                    eprintln!(
                        "[auth][config] legacy decrypt refresh_token failed uid={uid}: {error}"
                    );
                }
                String::new()
            }
        };
        user.csrf = match decrypt_text(&user.enc_csrf, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_csrf.is_empty() {
                    eprintln!("[auth][config] legacy decrypt csrf failed uid={uid}: {error}");
                }
                String::new()
            }
        };
    }
    Some(cfg)
}

fn split_files_exist(base_path: &Path) -> bool {
    app_config_path(base_path).is_file()
        || account_config_path(base_path).is_file()
        || live_cache_config_path(base_path).is_file()
}

pub fn load_config(path: &PathBuf, key: &[u8; 32]) -> PersistConfig {
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
        cfg.live_control_mode = app_file.live_control_mode;
        cfg.obs_ws_enabled = app_file.obs_ws_enabled;
        cfg.obs_ws_url = app_file.obs_ws_url;
        cfg.obs_ws_password = app_file.obs_ws_password;
        cfg.obs_ws_auto_start_on_live = app_file.obs_ws_auto_start_on_live;
        cfg.obs_ws_auto_stop_on_live_end = app_file.obs_ws_auto_stop_on_live_end;
        cfg.on_live_start_command = app_file.on_live_start_command;
        cfg.on_live_stop_command = app_file.on_live_stop_command;
        cfg.locale = crate::i18n::normalize_locale_setting(&app_file.locale).to_string();

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
            let mut record = UserRecord::default();
            record.uid = user.uid;
            record.uname = user.uname;
            record.face = user.face;
            record.room_id = user.room_id;
            record.enc_cookie = user.enc_cookie;
            record.enc_refresh_token = user.enc_refresh_token;
            record.enc_csrf = user.enc_csrf;
            record.level = user.level;
            record.current_exp = user.current_exp;
            record.next_exp = user.next_exp;
            record.money = user.money;
            record.bcoin = user.bcoin;
            record.following = user.following;
            record.follower = user.follower;
            record.dynamic_count = user.dynamic_count;
            record.login_invalid = user.login_invalid;
            record.auth_fail_count = user.auth_fail_count;
            record.last_auth_fail_at = user.last_auth_fail_at;
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
                user.live_profile_state = cache.live_profile_state;
            }
        }
    }

    for (uid, user) in cfg.users.iter_mut() {
        sync_live_profile_state_defaults(user);
        user.cookie = match decrypt_text(&user.enc_cookie, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_cookie.is_empty() {
                    eprintln!("[auth][config] decrypt cookie failed uid={uid}: {error}");
                }
                String::new()
            }
        };
        user.refresh_token = match decrypt_text(&user.enc_refresh_token, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_refresh_token.is_empty() {
                    eprintln!("[auth][config] decrypt refresh_token failed uid={uid}: {error}");
                }
                String::new()
            }
        };
        user.csrf = match decrypt_text(&user.enc_csrf, key) {
            Ok(value) => value,
            Err(error) => {
                if !user.enc_csrf.is_empty() {
                    eprintln!("[auth][config] decrypt csrf failed uid={uid}: {error}");
                }
                String::new()
            }
        };
    }

    cfg
}

pub fn save_config(path: &PathBuf, cfg: &PersistConfig, key: &[u8; 32]) {
    let mut app_file = AppSettingsFile::default();
    app_file.min_to_tray = cfg.min_to_tray;
    app_file.hide_dock_on_minimize = cfg.hide_dock_on_minimize;
    app_file.live_control_mode = cfg.live_control_mode.clone();
    app_file.obs_ws_enabled = cfg.obs_ws_enabled;
    app_file.obs_ws_url = cfg.obs_ws_url.clone();
    app_file.obs_ws_password = cfg.obs_ws_password.clone();
    app_file.obs_ws_auto_start_on_live = cfg.obs_ws_auto_start_on_live;
    app_file.obs_ws_auto_stop_on_live_end = cfg.obs_ws_auto_stop_on_live_end;
    app_file.on_live_start_command = cfg.on_live_start_command.clone();
    app_file.on_live_stop_command = cfg.on_live_stop_command.clone();
    app_file.locale = cfg.locale.clone();

    let mut account_file = AccountFile::default();
    account_file.current_uid = cfg.current_uid.clone();

    let mut live_file = LiveCacheFile::default();
    live_file.live_client_version = cfg.live_client_version.clone();
    live_file.live_client_build = cfg.live_client_build;
    live_file.live_client_synced_at = cfg.live_client_synced_at;

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
                live_profile_state: user.live_profile_state.clone(),
            },
        );
    }

    write_json(&app_config_path(path), &app_file);
    write_json(&account_config_path(path), &account_file);
    write_json(&live_cache_config_path(path), &live_file);
}
