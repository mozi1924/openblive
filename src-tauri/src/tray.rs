use crate::state::AppState;
use serde::Serialize;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{App, AppHandle, Emitter, Manager, Window, WindowEvent};

const TRAY_ID: &str = "main-tray";
const MENU_ACCOUNT_INFO: &str = "tray.account_info";
const MENU_LIVE_STATUS: &str = "tray.live_status";
const MENU_TOGGLE_WINDOW: &str = "tray.toggle_window";
const MENU_START_LIVE: &str = "tray.start_live";
const MENU_STOP_LIVE: &str = "tray.stop_live";
const MENU_QUIT: &str = "tray.quit";
const EVENT_TRAY_ACTION: &str = "tray-action";

#[cfg(not(target_os = "macos"))]
const TRAY_BLACK: &[u8] = include_bytes!("../icons/tray_black.png");
#[cfg(not(target_os = "macos"))]
const TRAY_WHITE: &[u8] = include_bytes!("../icons/tray_white.png");
#[cfg(target_os = "macos")]
const TRAY_TEMPLATE: &[u8] = include_bytes!("../icons/trayTemplate.png");

fn get_tray_icon(_app: &AppHandle) -> tauri::image::Image<'static> {
    #[cfg(target_os = "macos")]
    {
        tauri::image::Image::from_bytes(TRAY_TEMPLATE)
            .expect("failed to load macOS tray template icon")
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(tauri::Theme::Dark) = _app.theme() {
            tauri::image::Image::from_bytes(TRAY_WHITE).expect("failed to load white tray icon")
        } else {
            tauri::image::Image::from_bytes(TRAY_BLACK).expect("failed to load black tray icon")
        }
    }
}

#[derive(Clone, Serialize)]
struct TrayActionPayload<'a> {
    action: &'a str,
}

fn current_account_label(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let Ok(runtime) = state.runtime.try_lock() else {
        return crate::i18n::tr("zh-CN", "tray.account.loading");
    };
    let Some(uid) = runtime.config.current_uid.as_ref() else {
        return crate::i18n::tr_config(&runtime.config, "tray.account.logged_out");
    };
    let Some(user) = runtime.config.users.get(uid) else {
        return crate::i18n::tr_config(&runtime.config, "tray.account.logged_out");
    };
    format!(
        "{}: {} ({})",
        crate::i18n::tr_config(&runtime.config, "tray.account.current"),
        user.uname,
        user.uid
    )
}

fn current_live_status_label(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let Ok(runtime) = state.runtime.try_lock() else {
        return crate::i18n::tr("zh-CN", "tray.live.loading");
    };
    if runtime.session.is_live {
        crate::i18n::tr_config(&runtime.config, "tray.live.on")
    } else {
        crate::i18n::tr_config(&runtime.config, "tray.live.off")
    }
}

fn has_logged_in_user(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    state
        .runtime
        .try_lock()
        .map(|runtime| runtime.config.current_uid.is_some())
        .unwrap_or(false)
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let locale = {
        let state = app.state::<AppState>();
        state
            .runtime
            .try_lock()
            .map(|runtime| runtime.config.locale.clone())
            .unwrap_or_else(|_| "zh-CN".to_string())
    };
    let account_info = MenuItem::with_id(
        app,
        MENU_ACCOUNT_INFO,
        current_account_label(app),
        false,
        None::<&str>,
    )?;
    let live_status = MenuItem::with_id(
        app,
        MENU_LIVE_STATUS,
        current_live_status_label(app),
        false,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle_window = MenuItem::with_id(
        app,
        MENU_TOGGLE_WINDOW,
        crate::i18n::tr(&locale, "tray.menu.toggle_window"),
        true,
        None::<&str>,
    )?;
    let logged_in = has_logged_in_user(app);
    let start_live = MenuItem::with_id(
        app,
        MENU_START_LIVE,
        crate::i18n::tr(&locale, "tray.menu.start_live"),
        logged_in,
        None::<&str>,
    )?;
    let stop_live = MenuItem::with_id(
        app,
        MENU_STOP_LIVE,
        crate::i18n::tr(&locale, "tray.menu.stop_live"),
        logged_in,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        MENU_QUIT,
        crate::i18n::tr(&locale, "tray.menu.quit"),
        true,
        None::<&str>,
    )?;

    Menu::with_items(
        app,
        &[
            &account_info,
            &live_status,
            &sep1,
            &toggle_window,
            &start_live,
            &stop_live,
            &sep2,
            &quit,
        ],
    )
}

fn emit_tray_action(app: &AppHandle, action: &'static str) {
    let payload = TrayActionPayload { action };
    let _ = app.emit(EVENT_TRAY_ACTION, payload);
}

pub fn has_tray(app: &AppHandle) -> bool {
    app.tray_by_id(TRAY_ID).is_some()
}

pub fn refresh_tray_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_tray_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
}

#[cfg(target_os = "macos")]
fn should_hide_dock_on_minimize(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    state
        .runtime
        .try_lock()
        .map(|runtime| runtime.config.hide_dock_on_minimize)
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn set_dock_visible(app: &AppHandle, visible: bool) {
    let policy = if visible {
        ActivationPolicy::Regular
    } else {
        ActivationPolicy::Accessory
    };
    let _ = app.set_activation_policy(policy);
    let _ = app.set_dock_visibility(visible);
}

#[cfg(target_os = "macos")]
fn apply_hidden_window_dock_policy(app: &AppHandle) {
    let hide_dock = should_hide_dock_on_minimize(app);
    set_dock_visible(app, !hide_dock);
}

#[cfg(not(target_os = "macos"))]
fn apply_hidden_window_dock_policy(_app: &AppHandle) {}

pub fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) {
        let _ = window.hide();
        apply_hidden_window_dock_policy(app);
    } else {
        reveal_main_window(app);
    }
}

pub fn reveal_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(target_os = "macos")]
    set_dock_visible(app, true);
    let _ = window.show();
    let _ = window.set_focus();
}

#[cfg(target_os = "macos")]
pub fn sync_dock_visibility(app: &AppHandle) {
    let visible = app
        .get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(true);
    if visible {
        set_dock_visible(app, true);
    } else {
        apply_hidden_window_dock_policy(app);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn sync_dock_visibility(_app: &AppHandle) {}

#[cfg(target_os = "macos")]
pub fn on_reopen_event(app: &AppHandle, has_visible_windows: bool) {
    if !has_visible_windows {
        reveal_main_window(app);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn on_reopen_event(_app: &AppHandle, _has_visible_windows: bool) {}

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let menu = build_tray_menu(&handle)?;
    let locale = {
        let state = app.state::<AppState>();
        state
            .runtime
            .try_lock()
            .map(|runtime| runtime.config.locale.clone())
            .unwrap_or_else(|_| "zh-CN".to_string())
    };

    let icon = get_tray_icon(&handle);
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(crate::i18n::tr(&locale, "tray.tooltip"))
        .icon(icon);

    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    let _tray = builder.build(app)?;
    Ok(())
}

pub fn on_tray_menu_event(app: &AppHandle, event: &MenuEvent) {
    match event.id().as_ref() {
        MENU_TOGGLE_WINDOW => toggle_main_window(app),
        MENU_START_LIVE => emit_tray_action(app, "start_live"),
        MENU_STOP_LIVE => emit_tray_action(app, "stop_live"),
        MENU_QUIT => app.exit(0),
        _ => {}
    }
}

pub fn on_tray_icon_event(app: &AppHandle, event: &TrayIconEvent) {
    if let TrayIconEvent::Click {
        button,
        button_state,
        ..
    } = event
    {
        if *button == MouseButton::Left && *button_state == MouseButtonState::Up {
            toggle_main_window(app);
        }
    }
}

pub fn on_window_event(window: &Window, event: &WindowEvent) {
    match event {
        WindowEvent::CloseRequested { api, .. } => {
            let state = window.state::<AppState>();
            let should_min_to_tray = state
                .runtime
                .try_lock()
                .map(|runtime| runtime.config.min_to_tray)
                .unwrap_or(false)
                && has_tray(&window.app_handle());
            if should_min_to_tray {
                api.prevent_close();
                let _ = window.hide();
                apply_hidden_window_dock_policy(&window.app_handle());
            }
        }
        #[cfg(not(target_os = "macos"))]
        WindowEvent::ThemeChanged(theme) => {
            let app = window.app_handle();
            if let Some(tray) = app.tray_by_id(TRAY_ID) {
                let icon_bytes = match theme {
                    tauri::Theme::Dark => TRAY_WHITE,
                    tauri::Theme::Light => TRAY_BLACK,
                    _ => TRAY_BLACK,
                };
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = tray.set_icon(Some(icon));
                }
            }
        }
        _ => {}
    }
}
