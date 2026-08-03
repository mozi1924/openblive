use crate::state::AppState;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

pub const STUDIO_STATE_EVENT_NAME: &str = "studio-state";
pub const TTS_PLAYBACK_EVENT_NAME: &str = "tts-playback";

#[derive(Clone, Serialize)]
pub struct StudioStateEvent {
    pub kind: String,
    pub source: String,
    pub at: i64,
    pub data: Value,
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

pub fn emit_studio_state_event(app: &AppHandle, kind: &str, source: &str, data: Value) {
    let payload = StudioStateEvent {
        kind: kind.to_string(),
        source: source.to_string(),
        at: now_ts(),
        data,
    };
    let _ = app.emit(STUDIO_STATE_EVENT_NAME, payload);
}

pub async fn emit_runtime_snapshot(app: &AppHandle, state: &AppState, source: &str) {
    let (session, danmu_running, obs_ws_connected, obs_ws_last_error, obs_ws_last_checked_at, last_online_rank) = {
        let runtime = state.runtime.lock().await;
        (
            runtime.session.clone(),
            runtime.danmu_task.is_some(),
            runtime.obs_ws_connected,
            runtime.obs_ws_last_error.clone(),
            runtime.obs_ws_last_checked_at,
            runtime.last_online_rank.clone(),
        )
    };
    
    let linkage = crate::commands::get_linkage_status_inner(app, state).await;
    
    emit_studio_state_event(
        app,
        "runtime.snapshot",
        source,
        json!({
            "session": session,
            "danmu_running": danmu_running,
            "obs_ws_connected": obs_ws_connected,
            "obs_ws_last_error": obs_ws_last_error,
            "obs_ws_last_checked_at": obs_ws_last_checked_at,
            "linkage_status": linkage,
            "online_rank": last_online_rank,
        }),
    );
}

pub fn emit_tts_playback_state(app: &AppHandle, playing: bool, source: &str) {
    let _ = app.emit(
        TTS_PLAYBACK_EVENT_NAME,
        json!({
            "playing": playing,
            "source": source,
        }),
    );
}

pub fn emit_accounts_changed(app: &AppHandle, source: &str) {
    emit_studio_state_event(
        app,
        "runtime.accounts_changed",
        source,
        json!({}),
    );
}

