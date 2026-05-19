use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn default_live_client_version() -> String {
    crate::constants::DEFAULT_LIVEHIME_VERSION.to_string()
}

fn default_live_client_build() -> u64 {
    crate::constants::DEFAULT_LIVEHIME_BUILD
}

fn default_live_client_synced_at() -> i64 {
    0
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub uid: u64,
    pub room_id: String,
    pub csrf: String,
    pub is_live: bool,
    pub current_area_id: Option<u64>,
    #[serde(default)]
    pub current_area_names: Vec<String>,
    #[serde(default)]
    pub current_tags: Vec<String>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub uid: String,
    pub uname: String,
    pub face: String,
    pub cookie: String,
    pub enc_cookie: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub enc_refresh_token: String,
    #[serde(rename = "roomId")]
    pub room_id: String,
    pub csrf: String,
    pub enc_csrf: String,
    pub level: i64,
    pub current_exp: i64,
    pub next_exp: i64,
    pub money: f64,
    pub bcoin: f64,
    pub following: i64,
    pub follower: i64,
    pub dynamic_count: i64,
    #[serde(default)]
    pub last_title: String,
    #[serde(default)]
    pub last_area_id: String,
    #[serde(default)]
    pub last_area_name: Vec<String>,
    #[serde(default)]
    pub last_tags: Vec<String>,
    #[serde(default)]
    pub login_invalid: bool,
    #[serde(default)]
    pub auth_fail_count: u32,
    #[serde(default)]
    pub last_auth_fail_at: i64,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PersistConfig {
    pub users: HashMap<String, UserRecord>,
    pub current_uid: Option<String>,
    pub min_to_tray: bool,
    #[serde(default = "default_live_client_version")]
    pub live_client_version: String,
    #[serde(default = "default_live_client_build")]
    pub live_client_build: u64,
    #[serde(default = "default_live_client_synced_at")]
    pub live_client_synced_at: i64,
}

impl Default for PersistConfig {
    fn default() -> Self {
        Self {
            users: HashMap::new(),
            current_uid: None,
            min_to_tray: true,
            live_client_version: default_live_client_version(),
            live_client_build: default_live_client_build(),
            live_client_synced_at: default_live_client_synced_at(),
        }
    }
}

#[derive(Deserialize)]
pub struct PollReq {
    pub key: String,
}

#[derive(Deserialize)]
pub struct UpdateAreaReq {
    pub parent: String,
    pub child: String,
}

#[derive(Deserialize)]
pub struct UpdateTitleReq {
    pub title: String,
}

#[derive(Deserialize)]
pub struct UpdateTagsReq {
    pub tags: String,
}

#[derive(Deserialize)]
pub struct DanmuReq {
    pub msg: String,
}

#[derive(Deserialize)]
pub struct UidReq {
    pub uid: String,
}

#[derive(Deserialize)]
pub struct AppConfigReq {
    pub key: String,
    pub value: serde_json::Value,
}
