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

fn default_transport_status() -> String {
    "idle".to_string()
}

fn default_review_status() -> String {
    "none".to_string()
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct SessionState {
    pub uid: u64,
    pub room_id: String,
    pub csrf: String,
    pub is_live: bool,
    #[serde(default)]
    pub live_status: Option<i64>,
    #[serde(default)]
    pub live_time: String,
    pub current_area_id: Option<u64>,
    #[serde(default)]
    pub current_area_names: Vec<String>,
    #[serde(default)]
    pub current_tags: Vec<String>,
    #[serde(default)]
    pub live_key: Option<String>,
    #[serde(default)]
    pub sub_session_key: Option<String>,
    #[serde(default)]
    pub from_cache: bool,
    #[serde(default)]
    pub last_sync_at: Option<i64>,
    #[serde(default)]
    pub error_code: Option<String>,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct TitleProfileState {
    #[serde(default)]
    pub submitted: String,
    #[serde(default)]
    pub effective: String,
    #[serde(default = "default_transport_status")]
    pub transport: String,
    #[serde(default = "default_review_status")]
    pub review: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct AreaProfileState {
    #[serde(default)]
    pub submitted_parent: String,
    #[serde(default)]
    pub submitted_child: String,
    #[serde(default)]
    pub submitted_area_id: Option<u64>,
    #[serde(default)]
    pub effective_parent: String,
    #[serde(default)]
    pub effective_child: String,
    #[serde(default)]
    pub effective_area_id: Option<u64>,
    #[serde(default = "default_transport_status")]
    pub transport: String,
    #[serde(default = "default_review_status")]
    pub review: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct TagsProfileState {
    #[serde(default)]
    pub submitted: Vec<String>,
    #[serde(default)]
    pub effective: Vec<String>,
    #[serde(default = "default_transport_status")]
    pub transport: String,
    #[serde(default = "default_review_status")]
    pub review: String,
    #[serde(default)]
    pub message: String,
    #[serde(default)]
    pub updated_at: i64,
}

#[derive(Default, Clone, Serialize, Deserialize, PartialEq)]
pub struct LiveProfileState {
    #[serde(default)]
    pub title: TitleProfileState,
    #[serde(default)]
    pub area: AreaProfileState,
    #[serde(default)]
    pub tags: TagsProfileState,
}

#[derive(Default, Clone, Serialize, Deserialize)]
pub struct RecentArea {
    pub parent: String,
    pub child: String,
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
    pub recent_areas: Vec<RecentArea>,
    #[serde(default)]
    pub live_profile_state: LiveProfileState,
    #[serde(default)]
    pub live_key: Option<String>,
    #[serde(default)]
    pub sub_session_key: Option<String>,
    #[serde(default)]
    pub login_invalid: bool,
    #[serde(default)]
    pub auth_fail_count: u32,
    #[serde(default)]
    pub last_auth_fail_at: i64,
}

pub fn sync_live_profile_state_defaults(user: &mut UserRecord) {
    if user.live_profile_state.title.submitted.is_empty() {
        user.live_profile_state.title.submitted = user.last_title.clone();
    }
    if user.live_profile_state.title.effective.is_empty() {
        user.live_profile_state.title.effective = user.last_title.clone();
    }
    if user.live_profile_state.title.transport.trim().is_empty() {
        user.live_profile_state.title.transport = default_transport_status();
    }
    if user.live_profile_state.title.review.trim().is_empty() {
        user.live_profile_state.title.review = default_review_status();
    }
    if user.live_profile_state.title.review == "none"
        && user.live_profile_state.title.transport == "synced"
        && user.live_profile_state.title.submitted == user.live_profile_state.title.effective
    {
        user.live_profile_state.title.message.clear();
    }

    if user.live_profile_state.area.submitted_parent.is_empty() {
        user.live_profile_state.area.submitted_parent =
            user.last_area_name.first().cloned().unwrap_or_default();
    }
    if user.live_profile_state.area.submitted_child.is_empty() {
        user.live_profile_state.area.submitted_child =
            user.last_area_name.get(1).cloned().unwrap_or_default();
    }
    if user.live_profile_state.area.submitted_area_id.is_none() {
        user.live_profile_state.area.submitted_area_id = user
            .last_area_id
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0);
    }
    if user.live_profile_state.area.effective_parent.is_empty() {
        user.live_profile_state.area.effective_parent =
            user.live_profile_state.area.submitted_parent.clone();
    }
    if user.live_profile_state.area.effective_child.is_empty() {
        user.live_profile_state.area.effective_child =
            user.live_profile_state.area.submitted_child.clone();
    }
    if user.live_profile_state.area.effective_area_id.is_none() {
        user.live_profile_state.area.effective_area_id =
            user.live_profile_state.area.submitted_area_id;
    }
    if user.live_profile_state.area.transport.trim().is_empty() {
        user.live_profile_state.area.transport = default_transport_status();
    }
    if user.live_profile_state.area.review.trim().is_empty() {
        user.live_profile_state.area.review = default_review_status();
    }

    if user.live_profile_state.tags.submitted.is_empty() && !user.last_tags.is_empty() {
        user.live_profile_state.tags.submitted = user.last_tags.clone();
    }
    if user.live_profile_state.tags.effective.is_empty() && !user.last_tags.is_empty() {
        user.live_profile_state.tags.effective = user.last_tags.clone();
    }
    if user.live_profile_state.tags.transport.trim().is_empty() {
        user.live_profile_state.tags.transport = default_transport_status();
    }
    if user.live_profile_state.tags.review.trim().is_empty() {
        user.live_profile_state.tags.review = default_review_status();
    }
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PersistConfig {
    pub users: HashMap<String, UserRecord>,
    pub current_uid: Option<String>,
    pub min_to_tray: bool,
    pub hide_dock_on_minimize: bool,
    #[serde(default = "default_live_control_mode")]
    pub live_control_mode: String,
    #[serde(default)]
    pub obs_ws_enabled: bool,
    #[serde(default = "default_obs_ws_url")]
    pub obs_ws_url: String,
    #[serde(default)]
    pub obs_ws_password: String,
    #[serde(default)]
    pub obs_ws_auto_start_on_live: bool,
    #[serde(default)]
    pub obs_ws_auto_stop_on_live_end: bool,
    #[serde(default)]
    pub on_live_start_command: String,
    #[serde(default)]
    pub on_live_stop_command: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default)]
    pub host_www: String,
    #[serde(default)]
    pub host_api: String,
    #[serde(default)]
    pub host_live_api: String,
    #[serde(default)]
    pub host_passport: String,
    #[serde(default)]
    pub host_live_web: String,
    #[serde(default)]
    pub cookie_domain: String,
    #[serde(default)]
    pub danmu_host: String,
    #[serde(default)]
    pub app_key: String,
    #[serde(default)]
    pub app_sec: String,
    #[serde(default)]
    pub livehime_version_override: String,
    #[serde(default)]
    pub livehime_build_override: String,
    #[serde(default)]
    pub live_platform: String,
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
            hide_dock_on_minimize: false,
            live_control_mode: default_live_control_mode(),
            obs_ws_enabled: false,
            obs_ws_url: default_obs_ws_url(),
            obs_ws_password: String::new(),
            obs_ws_auto_start_on_live: false,
            obs_ws_auto_stop_on_live_end: false,
            on_live_start_command: String::new(),
            on_live_stop_command: String::new(),
            locale: default_locale(),
            host_www: String::new(),
            host_api: String::new(),
            host_live_api: String::new(),
            host_passport: String::new(),
            host_live_web: String::new(),
            cookie_domain: String::new(),
            danmu_host: String::new(),
            app_key: String::new(),
            app_sec: String::new(),
            livehime_version_override: String::new(),
            livehime_build_override: String::new(),
            live_platform: String::new(),
            live_client_version: default_live_client_version(),
            live_client_build: default_live_client_build(),
            live_client_synced_at: default_live_client_synced_at(),
        }
    }
}

fn default_live_control_mode() -> String {
    "none".to_string()
}

fn default_obs_ws_url() -> String {
    "ws://127.0.0.1:4455".to_string()
}

fn default_locale() -> String {
    "auto".to_string()
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

#[derive(Deserialize)]
pub struct AppConfigsReq {
    pub values: HashMap<String, serde_json::Value>,
}

#[derive(Deserialize)]
pub struct QrRenderReq {
    pub content: String,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub margin: Option<u32>,
}

#[derive(Deserialize)]
pub struct AppLogReq {
    pub message: String,
}
