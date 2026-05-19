use crate::state::AppState;
use serde::Serialize;
use tauri::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Emitter, Manager, Window, WindowEvent};

const TRAY_ID: &str = "main-tray";
const MENU_ACCOUNT_INFO: &str = "tray.account_info";
const MENU_LIVE_STATUS: &str = "tray.live_status";
const MENU_TOGGLE_WINDOW: &str = "tray.toggle_window";
const MENU_START_LIVE: &str = "tray.start_live";
const MENU_STOP_LIVE: &str = "tray.stop_live";
const MENU_QUIT: &str = "tray.quit";
const EVENT_TRAY_ACTION: &str = "tray-action";

#[derive(Clone, Serialize)]
struct TrayActionPayload<'a> {
    action: &'a str,
}

fn current_account_label(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let runtime = state.runtime.blocking_lock();
    let Some(uid) = runtime.config.current_uid.as_ref() else {
        return "当前账号：未登录".to_string();
    };
    let Some(user) = runtime.config.users.get(uid) else {
        return "当前账号：未登录".to_string();
    };
    format!("当前账号：{} ({})", user.uname, user.uid)
}

fn current_live_status_label(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let runtime = state.runtime.blocking_lock();
    if runtime.session.is_live {
        "直播状态：直播中".to_string()
    } else {
        "直播状态：未开播".to_string()
    }
}

fn has_logged_in_user(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let runtime = state.runtime.blocking_lock();
    runtime.config.current_uid.is_some()
}

fn build_tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
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
        "打开/隐藏主界面",
        true,
        None::<&str>,
    )?;
    let logged_in = has_logged_in_user(app);
    let start_live = MenuItem::with_id(app, MENU_START_LIVE, "开播", logged_in, None::<&str>)?;
    let stop_live = MenuItem::with_id(app, MENU_STOP_LIVE, "下播", logged_in, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, MENU_QUIT, "退出程序", true, None::<&str>)?;

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

pub fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) {
        let _ = window.hide();
    } else {
        reveal_main_window(app);
    }
}

pub fn reveal_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let menu = build_tray_menu(&app.handle().clone())?;
    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("OpenBlive Studio");
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
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
    if let WindowEvent::CloseRequested { api, .. } = event {
        let state = window.state::<AppState>();
        let runtime = state.runtime.blocking_lock();
        let should_min_to_tray = runtime.config.min_to_tray && has_tray(&window.app_handle());
        drop(runtime);
        if should_min_to_tray {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}
