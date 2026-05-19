use crate::constants::CmdResult;
use crate::models::AppConfigReq;
use crate::response::wrap_ok;
use crate::{config::save_config, state::AppState};
use serde_json::json;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn get_session(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(
        serde_json::to_value(runtime.session.clone()).unwrap(),
    ))
}

#[tauri::command]
pub async fn get_app_config(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(json!({
        "min_to_tray": runtime.config.min_to_tray,
        "obs_ws_enabled": runtime.config.obs_ws_enabled,
        "obs_ws_url": runtime.config.obs_ws_url,
        "obs_ws_password": runtime.config.obs_ws_password,
        "obs_ws_auto_start_on_live": runtime.config.obs_ws_auto_start_on_live,
        "obs_ws_auto_stop_on_live_end": runtime.config.obs_ws_auto_stop_on_live_end,
        "on_live_start_command": runtime.config.on_live_start_command,
        "on_live_stop_command": runtime.config.on_live_stop_command,
        "is_win32": cfg!(target_os = "windows"),
        "has_tray": crate::tray::has_tray(&app)
    })))
}

#[tauri::command]
pub async fn set_app_config(app: AppHandle, req: AppConfigReq, state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    match req.key.as_str() {
        "min_to_tray" => {
            runtime.config.min_to_tray = req.value.as_bool().unwrap_or(true);
        }
        "obs_ws_enabled" => {
            runtime.config.obs_ws_enabled = req.value.as_bool().unwrap_or(false);
        }
        "obs_ws_url" => {
            runtime.config.obs_ws_url = req.value.as_str().unwrap_or("").to_string();
        }
        "obs_ws_password" => {
            runtime.config.obs_ws_password = req.value.as_str().unwrap_or("").to_string();
        }
        "obs_ws_auto_start_on_live" => {
            runtime.config.obs_ws_auto_start_on_live = req.value.as_bool().unwrap_or(false);
        }
        "obs_ws_auto_stop_on_live_end" => {
            runtime.config.obs_ws_auto_stop_on_live_end = req.value.as_bool().unwrap_or(false);
        }
        "on_live_start_command" => {
            runtime.config.on_live_start_command = req.value.as_str().unwrap_or("").to_string();
        }
        "on_live_stop_command" => {
            runtime.config.on_live_stop_command = req.value.as_str().unwrap_or("").to_string();
        }
        _ => return Err("Unknown config key".into()),
    }
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn refresh_tray_menu(app: AppHandle) -> CmdResult {
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn get_version() -> CmdResult {
    Ok(wrap_ok(json!({ "version": env!("CARGO_PKG_VERSION") })))
}
