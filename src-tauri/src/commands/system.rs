use crate::constants::CmdResult;
use crate::models::AppConfigReq;
use crate::response::wrap_ok;
use crate::{config::save_config, state::AppState};
use serde_json::json;
use tauri::State;

#[tauri::command]
pub async fn get_session(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(serde_json::to_value(runtime.session.clone()).unwrap()))
}

#[tauri::command]
pub async fn get_app_config(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(json!({
        "min_to_tray": runtime.config.min_to_tray,
        "is_win32": cfg!(target_os = "windows"),
        "has_tray": false
    })))
}

#[tauri::command]
pub async fn set_app_config(req: AppConfigReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    if req.key == "min_to_tray" {
        runtime.config.min_to_tray = req.value.as_bool().unwrap_or(true);
        save_config(&state.config_path, &runtime.config, &state.master_key);
        return Ok(wrap_ok(json!({})));
    }

    Err("Unknown config key".into())
}

#[tauri::command]
pub async fn get_version() -> CmdResult {
    Ok(wrap_ok(json!({ "version": env!("CARGO_PKG_VERSION") })))
}
