use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;
use tokio::sync::broadcast;

#[derive(Clone)]
pub(in crate::ws_server) struct WsServerRuntimeState {
    pub(in crate::ws_server) app: AppHandle,
    pub(in crate::ws_server) auth_token: String,
    pub(in crate::ws_server) bypass_token_for_loopback: bool,
    pub(in crate::ws_server) danmu_tx: broadcast::Sender<Value>,
}

#[derive(Clone)]
pub(in crate::ws_server) struct WsServerConfig {
    pub(in crate::ws_server) enabled: bool,
    pub(in crate::ws_server) listen_addr: String,
    pub(in crate::ws_server) auth_token: String,
    pub(in crate::ws_server) bypass_token_for_loopback: bool,
}

#[derive(Deserialize, Default)]
pub(in crate::ws_server) struct TokenQuery {
    pub(in crate::ws_server) token: Option<String>,
}

#[derive(Deserialize)]
pub(in crate::ws_server) struct CompatIncomingFrame {
    pub(in crate::ws_server) cmd: i64,
    #[allow(dead_code)]
    pub(in crate::ws_server) data: Option<Value>,
}

#[derive(Deserialize)]
pub(in crate::ws_server) struct RawActionFrame {
    #[serde(default)]
    pub(in crate::ws_server) id: Option<Value>,
    pub(in crate::ws_server) action: String,
    #[serde(default)]
    pub(in crate::ws_server) params: Value,
}

#[derive(Default)]
pub(in crate::ws_server) struct CompatSessionState {
    pub(in crate::ws_server) joined: bool,
}
