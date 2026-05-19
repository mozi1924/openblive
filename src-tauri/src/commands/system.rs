use crate::constants::CmdResult;
use crate::i18n::normalize_locale_setting;
use crate::models::AppConfigReq;
use crate::response::wrap_ok;
use crate::{config::save_config, state::AppState};
use serde_json::json;
use tauri::{AppHandle, Manager, State};
use tokio::time::Duration;

const OBS_KEEPALIVE_INTERVAL_SECS: u64 = 15;

fn normalize_live_control_mode(mode: &str) -> &'static str {
    match mode.trim() {
        "obs_ws" => "obs_ws",
        "command" => "command",
        _ => "none",
    }
}

async fn ensure_obs_ws_keepalive_task(app: AppHandle) {
    let should_spawn = {
        let app_state = app.state::<AppState>();
        let mut runtime = app_state.runtime.lock().await;
        let mode = normalize_live_control_mode(&runtime.config.live_control_mode);
        if mode != "obs_ws" {
            if let Some(task) = runtime.obs_ws_keepalive_task.take() {
                task.abort();
            }
            runtime.obs_ws_connected = false;
            runtime.obs_ws_last_error = "i18n.system.obs_ws_not_enabled".to_string();
            runtime.obs_ws_last_checked_at = chrono::Utc::now().timestamp();
            false
        } else if runtime.obs_ws_keepalive_task.is_some() {
            false
        } else {
            true
        }
    };

    if !should_spawn {
        return;
    }

    let app_for_task = app.clone();
    let handle = tokio::spawn(async move {
        loop {
            let (mode, url, password) = {
                let app_state = app_for_task.state::<AppState>();
                let runtime = app_state.runtime.lock().await;
                (
                    normalize_live_control_mode(&runtime.config.live_control_mode).to_string(),
                    runtime.config.obs_ws_url.clone(),
                    runtime.config.obs_ws_password.clone(),
                )
            };

            if mode != "obs_ws" {
                let app_state = app_for_task.state::<AppState>();
                let mut runtime = app_state.runtime.lock().await;
                runtime.obs_ws_connected = false;
                runtime.obs_ws_last_error = "i18n.system.obs_ws_not_enabled".to_string();
                runtime.obs_ws_last_checked_at = chrono::Utc::now().timestamp();
                runtime.obs_ws_keepalive_task = None;
                break;
            }

            let result = crate::commands::live::obs_ws_probe(&url, &password).await;
            let app_state = app_for_task.state::<AppState>();
            let mut runtime = app_state.runtime.lock().await;
            runtime.obs_ws_last_checked_at = chrono::Utc::now().timestamp();
            match result {
                Ok(()) => {
                    runtime.obs_ws_connected = true;
                    runtime.obs_ws_last_error.clear();
                }
                Err(error) => {
                    runtime.obs_ws_connected = false;
                    runtime.obs_ws_last_error = error;
                }
            }
            drop(runtime);

            tokio::time::sleep(Duration::from_secs(OBS_KEEPALIVE_INTERVAL_SECS)).await;
        }
    });

    let app_state = app.state::<AppState>();
    let mut runtime = app_state.runtime.lock().await;
    runtime.obs_ws_keepalive_task = Some(handle);
}

#[tauri::command]
pub async fn get_session(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(
        serde_json::to_value(runtime.session.clone()).unwrap(),
    ))
}

#[tauri::command]
pub async fn get_app_config(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    ensure_obs_ws_keepalive_task(app.clone()).await;
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(json!({
        "min_to_tray": runtime.config.min_to_tray,
        "live_control_mode": runtime.config.live_control_mode,
        "obs_ws_enabled": runtime.config.obs_ws_enabled,
        "obs_ws_url": runtime.config.obs_ws_url,
        "obs_ws_password": runtime.config.obs_ws_password,
        "obs_ws_auto_start_on_live": runtime.config.obs_ws_auto_start_on_live,
        "obs_ws_auto_stop_on_live_end": runtime.config.obs_ws_auto_stop_on_live_end,
        "on_live_start_command": runtime.config.on_live_start_command,
        "on_live_stop_command": runtime.config.on_live_stop_command,
        "locale": runtime.config.locale,
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
        "live_control_mode" => {
            let mode = req.value.as_str().unwrap_or("none").trim();
            runtime.config.live_control_mode = match mode {
                "obs_ws" => "obs_ws".to_string(),
                "command" => "command".to_string(),
                _ => "none".to_string(),
            };
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
        "locale" => {
            runtime.config.locale =
                normalize_locale_setting(req.value.as_str().unwrap_or("auto")).to_string();
        }
        _ => return Err("i18n.system.error.unknown_config_key".into()),
    }
    runtime.config.obs_ws_enabled = runtime.config.live_control_mode == "obs_ws";
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);
    ensure_obs_ws_keepalive_task(app.clone()).await;
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn get_linkage_status(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    ensure_obs_ws_keepalive_task(app).await;
    let runtime = state.runtime.lock().await;
    let mode = normalize_live_control_mode(&runtime.config.live_control_mode);
    let command_start = runtime.config.on_live_start_command.trim().to_string();
    let command_stop = runtime.config.on_live_stop_command.trim().to_string();
    let command_ready = !command_start.is_empty();

    Ok(wrap_ok(json!({
        "mode": mode,
        "obs_ws": {
            "connected": runtime.obs_ws_connected,
            "last_error": runtime.obs_ws_last_error,
            "last_checked_at": runtime.obs_ws_last_checked_at,
            "url": runtime.config.obs_ws_url
        },
        "command": {
            "start_configured": command_ready,
            "stop_configured": !command_stop.is_empty(),
            "template_preview": command_start
        }
    })))
}

#[tauri::command]
pub async fn refresh_tray_menu(app: AppHandle) -> CmdResult {
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn reveal_main_window(app: AppHandle) -> CmdResult {
    crate::tray::reveal_main_window(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn get_version() -> CmdResult {
    Ok(wrap_ok(json!({ "version": env!("CARGO_PKG_VERSION") })))
}
