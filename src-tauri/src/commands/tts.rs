use crate::constants::CmdResult;
use crate::response::wrap_ok;
use crate::state::AppState;
use crate::tts;
use serde::Deserialize;
use serde_json::json;
use tauri::State;

#[derive(Deserialize)]
pub struct TestTtsReq {
    pub text: Option<String>,
}

#[tauri::command]
pub async fn get_tts_voices() -> CmdResult {
    let voices = tts::list_voices_dynamic().await;
    Ok(wrap_ok(json!({ "voices": voices })))
}

#[tauri::command]
pub async fn get_audio_output_devices() -> CmdResult {
    let devices = tts::list_audio_output_devices();
    Ok(wrap_ok(json!({ "devices": devices })))
}

#[tauri::command]
pub async fn test_tts_speech(state: State<'_, AppState>, req: Option<TestTtsReq>) -> CmdResult {
    let config = {
        let runtime = state.runtime.lock().await;
        runtime.config.clone()
    };
    let text = req.and_then(|r| r.text);
    tts::enqueue_test_speech(&config, text);
    Ok(wrap_ok(json!({ "status": "ok" })))
}
