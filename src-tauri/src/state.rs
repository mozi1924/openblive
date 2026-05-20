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
    if user.cookie.trim().is_empty() {
        return;
    }

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

#[cfg(test)]
mod tests {
    use super::{restore_session_from_current, RuntimeState};
    use crate::client::BiliClient;
    use crate::models::UserRecord;

    #[test]
    fn restore_session_skips_when_cookie_empty() {
        let client = BiliClient::new();
        let mut runtime = RuntimeState::default();
        runtime.config.current_uid = Some("123".to_string());
        runtime.config.users.insert(
            "123".to_string(),
            UserRecord {
                uid: "123".to_string(),
                room_id: "999".to_string(),
                cookie: String::new(),
                live_key: Some("live_key_should_not_restore".to_string()),
                sub_session_key: Some("sub_key_should_not_restore".to_string()),
                ..Default::default()
            },
        );

        restore_session_from_current(&mut runtime, &client);
        assert_eq!(runtime.session.uid, 0);
        assert!(runtime.session.live_key.is_none());
        assert!(runtime.session.sub_session_key.is_none());
    }
}
