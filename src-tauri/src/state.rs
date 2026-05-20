use crate::client::BiliClient;
use crate::models::{PersistConfig, SessionState};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

#[derive(Default)]
pub struct RuntimeState {
    pub session: SessionState,
    pub partition_map: HashMap<String, HashMap<String, u64>>,
    pub danmu_task: Option<JoinHandle<()>>,
    pub obs_ws_keepalive_task: Option<JoinHandle<()>>,
    pub obs_ws_connected: bool,
    pub obs_ws_last_error: String,
    pub obs_ws_last_checked_at: i64,
    pub app_logs: Vec<String>,
    pub config: PersistConfig,
}

pub struct AppState {
    pub client: BiliClient,
    pub runtime: Mutex<RuntimeState>,
    pub auth_refresh_lock: Mutex<()>,
    pub config_path: PathBuf,
    pub master_key: [u8; 32],
}

pub fn restore_session_from_current(runtime: &mut RuntimeState, client: &BiliClient) {
    runtime.session = SessionState::default();

    let Some(uid) = &runtime.config.current_uid else {
        return;
    };
    let Some(user) = runtime.config.users.get(uid) else {
        return;
    };

    client.apply_cookie_header(&user.cookie);
    runtime.session.uid = user.uid.parse::<u64>().unwrap_or(0);
    runtime.session.room_id = user.room_id.clone();
    runtime.session.csrf = user.csrf.clone();
    runtime.session.current_area_id = user.last_area_id.parse::<u64>().ok();
    runtime.session.current_area_names = user.last_area_name.clone();
    runtime.session.current_tags = user.last_tags.clone();
    runtime.session.live_key = user.live_key.clone();
    runtime.session.sub_session_key = user.sub_session_key.clone();
}
