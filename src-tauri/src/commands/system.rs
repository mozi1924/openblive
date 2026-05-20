use crate::constants::CmdResult;
use crate::endpoints;
use crate::i18n::normalize_locale_setting;
use crate::models::{AppConfigReq, AppConfigsReq, AppLogReq, PersistConfig, QrRenderReq};
use crate::response::wrap_ok;
use crate::state_event::emit_studio_state_event;
use crate::{
    config::save_config,
    state::{AppState, RuntimeState},
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use qrcode_generator::QrCodeEcc;
use serde_json::json;
use std::fs;
use tauri::{
    AppHandle, Emitter, LogicalPosition, Manager, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_positioner::{Position, WindowExt};
use tauri_plugin_window_state::AppHandleExt as WindowStateAppHandleExt;
use tokio::time::Duration;

const OBS_KEEPALIVE_INTERVAL_SECS: u64 = 15;
const APP_LOG_LIMIT: usize = 300;
const DANMU_OVERLAY_LABEL: &str = "overlay";
const DANMU_OVERLAY_SETTINGS_EVENT: &str = "danmu-overlay-settings";
const DANMU_OVERLAY_MARGIN_PX: f64 = 16.0;
const DANMU_OVERLAY_WIDTH: f64 = 420.0;
const DANMU_OVERLAY_HEIGHT: f64 = 360.0;
const DANMU_OVERLAY_MIN_WIDTH: f64 = 360.0;
const DANMU_OVERLAY_MIN_HEIGHT: f64 = 260.0;

fn normalize_live_control_mode(mode: &str) -> &'static str {
    match mode.trim() {
        "obs_ws" => "obs_ws",
        "command" => "command",
        _ => "none",
    }
}

fn now_hms() -> String {
    chrono::Local::now().format("%H:%M:%S").to_string()
}

fn normalize_danmu_overlay_opacity(value: u8) -> u8 {
    value.clamp(40, 100)
}

fn overlay_settings_payload(config: &PersistConfig) -> serde_json::Value {
    json!({
        "enabled": config.danmu_overlay_enabled,
        "opacity": normalize_danmu_overlay_opacity(config.danmu_overlay_opacity)
    })
}

fn emit_overlay_settings(window: &WebviewWindow, config: &PersistConfig) {
    let _ = window.emit(
        DANMU_OVERLAY_SETTINGS_EVENT,
        overlay_settings_payload(config),
    );
}

fn build_overlay_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    WebviewWindowBuilder::new(
        app,
        DANMU_OVERLAY_LABEL,
        WebviewUrl::App("index.html".into()),
    )
    .title("OpenBlive Danmu Overlay")
    .transparent(true)
    .decorations(false)
    .skip_taskbar(true)
    .visible(false)
    .resizable(true)
    .shadow(false)
    .inner_size(DANMU_OVERLAY_WIDTH, DANMU_OVERLAY_HEIGHT)
    .min_inner_size(DANMU_OVERLAY_MIN_WIDTH, DANMU_OVERLAY_MIN_HEIGHT)
    .build()
    .map_err(|error| format!("create overlay window failed: {error}"))
}

pub(crate) fn ensure_overlay_window(app: &AppHandle) -> Result<(WebviewWindow, bool), String> {
    if let Some(window) = app.get_webview_window(DANMU_OVERLAY_LABEL) {
        return Ok((window, false));
    }
    build_overlay_window(app).map(|window| (window, true))
}

fn overlay_has_saved_window_state(app: &AppHandle) -> bool {
    let Ok(app_dir) = app.path().app_config_dir() else {
        return false;
    };
    let state_path = app_dir.join(WindowStateAppHandleExt::filename(app));
    let Ok(raw) = fs::read_to_string(state_path) else {
        return false;
    };
    let Ok(saved_state) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return false;
    };

    saved_state.get(DANMU_OVERLAY_LABEL).is_some()
}

fn position_overlay_window(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    let _ = window.as_ref().window().move_window(Position::TopLeft);

    let target_position = if let Some(monitor) = app
        .primary_monitor()
        .map_err(|error| format!("read primary monitor failed: {error}"))?
    {
        LogicalPosition::new(
            (monitor.position().x as f64 / monitor.scale_factor()) + DANMU_OVERLAY_MARGIN_PX,
            (monitor.position().y as f64 / monitor.scale_factor()) + DANMU_OVERLAY_MARGIN_PX,
        )
    } else {
        LogicalPosition::new(DANMU_OVERLAY_MARGIN_PX, DANMU_OVERLAY_MARGIN_PX)
    };

    window
        .set_position(target_position)
        .map_err(|error| format!("position overlay window failed: {error}"))
}

fn apply_overlay_window_config(window: &WebviewWindow, config: &PersistConfig) {
    emit_overlay_settings(window, config);
}

fn emit_overlay_visibility(app: &AppHandle, visible: bool) {
    emit_studio_state_event(
        app,
        "overlay.visibility",
        "system.overlay",
        json!({ "visible": visible }),
    );
}

fn show_overlay_window(app: &AppHandle, config: &PersistConfig) -> Result<(), String> {
    let (window, created_now) = ensure_overlay_window(app)?;
    apply_overlay_window_config(&window, config);
    if created_now && !overlay_has_saved_window_state(app) {
        position_overlay_window(app, &window)?;
    }
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.show();
    emit_overlay_visibility(app, true);
    Ok(())
}

fn hide_overlay_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(DANMU_OVERLAY_LABEL) {
        let _ = window.hide();
    }
    emit_overlay_visibility(app, false);
}

pub(crate) async fn sync_overlay_window_from_config(app: AppHandle, state: &AppState) {
    let config = {
        let runtime = state.runtime.lock().await;
        runtime.config.clone()
    };

    if config.danmu_overlay_enabled {
        if let Err(error) = show_overlay_window(&app, &config) {
            crate::runtime_warn!("{error}");
        }
    } else {
        hide_overlay_window(&app);
    }
}

fn push_app_log_buffer(runtime: &mut RuntimeState, line: String) {
    runtime.app_logs.insert(0, line);
    if runtime.app_logs.len() > APP_LOG_LIMIT {
        runtime.app_logs.truncate(APP_LOG_LIMIT);
    }
}

pub(crate) fn render_qr_data_url(
    content: &str,
    width: Option<u32>,
    _margin: Option<u32>,
) -> Result<String, String> {
    let normalized = content.trim();
    if normalized.is_empty() {
        return Ok(String::new());
    }
    if normalized.starts_with("data:image/") {
        return Ok(normalized.to_string());
    }

    let size = width.unwrap_or(220).clamp(120, 1024) as usize;
    let png = qrcode_generator::to_png_to_vec(normalized, QrCodeEcc::Medium, size)
        .map_err(|error| format!("i18n.system.error.qrcode_render_failed: {error}"))?;
    Ok(format!(
        "data:image/png;base64,{}",
        BASE64_STANDARD.encode(png)
    ))
}

pub(crate) async fn emit_app_log_line(
    app: &AppHandle,
    state: &AppState,
    message: &str,
) -> (String, Vec<String>) {
    let message = message.trim();
    if message.is_empty() {
        return (String::new(), Vec::new());
    }
    let line = format!("[{}] {}", now_hms(), message);
    let logs = {
        let mut runtime = state.runtime.lock().await;
        push_app_log_buffer(&mut runtime, line.clone());
        runtime.app_logs.clone()
    };
    let _ = app.emit(
        "app-log",
        json!({ "line": line.clone(), "logs": logs.clone() }),
    );
    (line, logs)
}

fn apply_app_config_value(
    runtime: &mut RuntimeState,
    key: &str,
    value: &serde_json::Value,
) -> Result<(), String> {
    match key {
        "min_to_tray" => {
            runtime.config.min_to_tray = value.as_bool().unwrap_or(true);
        }
        "hide_dock_on_minimize" => {
            runtime.config.hide_dock_on_minimize = value.as_bool().unwrap_or(false);
        }
        "danmu_overlay_enabled" => {
            runtime.config.danmu_overlay_enabled = value.as_bool().unwrap_or(true);
        }
        "danmu_overlay_opacity" => {
            let next_opacity = value
                .as_u64()
                .and_then(|raw| u8::try_from(raw).ok())
                .unwrap_or(85);
            runtime.config.danmu_overlay_opacity = normalize_danmu_overlay_opacity(next_opacity);
        }
        "live_control_mode" => {
            let mode = value.as_str().unwrap_or("none").trim();
            runtime.config.live_control_mode = match mode {
                "obs_ws" => "obs_ws".to_string(),
                "command" => "command".to_string(),
                _ => "none".to_string(),
            };
        }
        "obs_ws_enabled" => {
            runtime.config.obs_ws_enabled = value.as_bool().unwrap_or(false);
        }
        "obs_ws_url" => {
            runtime.config.obs_ws_url = value.as_str().unwrap_or("").to_string();
        }
        "obs_ws_password" => {
            runtime.config.obs_ws_password = value.as_str().unwrap_or("").to_string();
        }
        "obs_ws_auto_start_on_live" => {
            runtime.config.obs_ws_auto_start_on_live = value.as_bool().unwrap_or(false);
        }
        "obs_ws_auto_stop_on_live_end" => {
            runtime.config.obs_ws_auto_stop_on_live_end = value.as_bool().unwrap_or(false);
        }
        "on_live_start_command" => {
            runtime.config.on_live_start_command = value.as_str().unwrap_or("").to_string();
        }
        "on_live_stop_command" => {
            runtime.config.on_live_stop_command = value.as_str().unwrap_or("").to_string();
        }
        "locale" => {
            runtime.config.locale =
                normalize_locale_setting(value.as_str().unwrap_or("auto")).to_string();
        }
        "host_www" => {
            runtime.config.host_www = value.as_str().unwrap_or("").trim().to_string();
        }
        "host_api" => {
            runtime.config.host_api = value.as_str().unwrap_or("").trim().to_string();
        }
        "host_live_api" => {
            runtime.config.host_live_api = value.as_str().unwrap_or("").trim().to_string();
        }
        "host_passport" => {
            runtime.config.host_passport = value.as_str().unwrap_or("").trim().to_string();
        }
        "host_live_web" => {
            runtime.config.host_live_web = value.as_str().unwrap_or("").trim().to_string();
        }
        "cookie_domain" => {
            runtime.config.cookie_domain = value.as_str().unwrap_or("").trim().to_string();
        }
        "danmu_host" => {
            runtime.config.danmu_host = value.as_str().unwrap_or("").trim().to_string();
        }
        "app_key" => {
            runtime.config.app_key = value.as_str().unwrap_or("").trim().to_string();
        }
        "app_sec" => {
            runtime.config.app_sec = value.as_str().unwrap_or("").trim().to_string();
        }
        "http_user_agent" => {
            runtime.config.http_user_agent = value.as_str().unwrap_or("").trim().to_string();
        }
        "livehime_version_override" => {
            runtime.config.livehime_version_override =
                value.as_str().unwrap_or("").trim().to_string();
        }
        "livehime_build_override" => {
            runtime.config.livehime_build_override =
                value.as_str().unwrap_or("").trim().to_string();
        }
        "live_platform" => {
            runtime.config.live_platform = value.as_str().unwrap_or("").trim().to_string();
        }
        _ => return Err("i18n.system.error.unknown_config_key".into()),
    }
    Ok(())
}

pub(crate) async fn ensure_obs_ws_keepalive_task(app: AppHandle) {
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
        } else {
            runtime.obs_ws_keepalive_task.is_none()
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
        "hide_dock_on_minimize": runtime.config.hide_dock_on_minimize,
        "danmu_overlay_enabled": runtime.config.danmu_overlay_enabled,
        "danmu_overlay_opacity": normalize_danmu_overlay_opacity(runtime.config.danmu_overlay_opacity),
        "live_control_mode": runtime.config.live_control_mode,
        "obs_ws_enabled": runtime.config.obs_ws_enabled,
        "obs_ws_url": runtime.config.obs_ws_url,
        "obs_ws_password": runtime.config.obs_ws_password,
        "obs_ws_auto_start_on_live": runtime.config.obs_ws_auto_start_on_live,
        "obs_ws_auto_stop_on_live_end": runtime.config.obs_ws_auto_stop_on_live_end,
        "on_live_start_command": runtime.config.on_live_start_command,
        "on_live_stop_command": runtime.config.on_live_stop_command,
        "locale": runtime.config.locale,
        "host_www": runtime.config.host_www,
        "host_api": runtime.config.host_api,
        "host_live_api": runtime.config.host_live_api,
        "host_passport": runtime.config.host_passport,
        "host_live_web": runtime.config.host_live_web,
        "cookie_domain": runtime.config.cookie_domain,
        "danmu_host": runtime.config.danmu_host,
        "app_key": runtime.config.app_key,
        "app_sec": runtime.config.app_sec,
        "http_user_agent": runtime.config.http_user_agent,
        "livehime_version_override": runtime.config.livehime_version_override,
        "livehime_build_override": runtime.config.livehime_build_override,
        "live_platform": runtime.config.live_platform,
        "is_win32": cfg!(target_os = "windows"),
        "is_macos": cfg!(target_os = "macos"),
        "has_tray": crate::tray::has_tray(&app)
    })))
}

#[tauri::command]
pub async fn generate_http_user_agent() -> CmdResult {
    Ok(wrap_ok(json!({
        "user_agent": endpoints::generate_system_http_user_agent()
    })))
}

#[tauri::command]
pub async fn set_app_config(
    app: AppHandle,
    req: AppConfigReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    apply_app_config_value(&mut runtime, req.key.as_str(), &req.value)?;
    endpoints::set_runtime_overrides_from_config(&runtime.config);
    runtime.config.obs_ws_enabled = runtime.config.live_control_mode == "obs_ws";
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);
    ensure_obs_ws_keepalive_task(app.clone()).await;
    sync_overlay_window_from_config(app.clone(), &state).await;
    crate::tray::sync_dock_visibility(&app);
    crate::tray::refresh_tray_menu(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn set_app_configs(
    app: AppHandle,
    req: AppConfigsReq,
    state: State<'_, AppState>,
) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    for (key, value) in req.values.iter() {
        apply_app_config_value(&mut runtime, key.as_str(), value)?;
    }
    endpoints::set_runtime_overrides_from_config(&runtime.config);
    runtime.config.obs_ws_enabled = runtime.config.live_control_mode == "obs_ws";
    save_config(&state.config_path, &runtime.config, &state.master_key);
    drop(runtime);
    ensure_obs_ws_keepalive_task(app.clone()).await;
    sync_overlay_window_from_config(app.clone(), &state).await;
    crate::tray::sync_dock_visibility(&app);
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
pub async fn show_danmu_overlay(app: AppHandle, state: State<'_, AppState>) -> CmdResult {
    let config = {
        let runtime = state.runtime.lock().await;
        runtime.config.clone()
    };
    show_overlay_window(&app, &config)?;
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn hide_danmu_overlay(app: AppHandle) -> CmdResult {
    hide_overlay_window(&app);
    Ok(wrap_ok(json!({})))
}

#[tauri::command]
pub async fn get_version() -> CmdResult {
    Ok(wrap_ok(json!({ "version": env!("CARGO_PKG_VERSION") })))
}

#[tauri::command]
pub async fn render_qrcode(req: QrRenderReq) -> CmdResult {
    let content = req.content.trim().to_string();
    let image_src = render_qr_data_url(&content, req.width, req.margin)?;
    Ok(wrap_ok(json!({
        "content": content,
        "image_src": image_src
    })))
}

#[tauri::command]
pub async fn push_app_log(app: AppHandle, req: AppLogReq, state: State<'_, AppState>) -> CmdResult {
    let (line, logs) = emit_app_log_line(&app, &state, &req.message).await;
    Ok(wrap_ok(json!({ "line": line, "logs": logs })))
}

#[tauri::command]
pub async fn get_app_logs(state: State<'_, AppState>) -> CmdResult {
    let runtime = state.runtime.lock().await;
    Ok(wrap_ok(json!(runtime.app_logs.clone())))
}

#[tauri::command]
pub async fn clear_app_logs(state: State<'_, AppState>) -> CmdResult {
    let mut runtime = state.runtime.lock().await;
    runtime.app_logs.clear();
    Ok(wrap_ok(json!({})))
}
