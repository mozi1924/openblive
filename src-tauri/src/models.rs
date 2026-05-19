use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub uid: u64,
    pub room_id: String,
    pub csrf: String,
    pub is_live: bool,
    pub current_area_id: Option<u64>,
    pub current_area_names: Vec<String>,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub uid: String,
    pub uname: String,
    pub face: String,
    pub cookie: String,
    pub enc_cookie: String,
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
    pub last_title: String,
    pub last_area_id: String,
    pub last_area_name: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PersistConfig {
    pub users: HashMap<String, UserRecord>,
    pub current_uid: Option<String>,
    pub min_to_tray: bool,
}

impl Default for PersistConfig {
    fn default() -> Self {
        Self {
            users: HashMap::new(),
            current_uid: None,
            min_to_tray: true,
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
