use crate::live_status::{resolve_live_status, LIVE_STATUS_LIVE, LIVE_STATUS_ROUND};
use crate::state::AppState;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::menu::MenuEvent;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconEvent};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;
use tauri::{App, AppHandle, Manager, Window, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt as WindowStateAppHandleExt, StateFlags};

const TRAY_ID: &str = "main-tray";
const MENU_ACCOUNT_INFO: &str = "tray.account_info";
const MENU_LIVE_STATUS: &str = "tray.live_status";
const MENU_TOGGLE_WINDOW: &str = "tray.toggle_window";
const MENU_START_LIVE: &str = "tray.start_live";
const MENU_STOP_LIVE: &str = "tray.stop_live";
const MENU_QUIT: &str = "tray.quit";

#[cfg(target_os = "windows")]
const TRAY_BLACK: &[u8] = include_bytes!("../icons/tray_black.png");
#[cfg(not(target_os = "macos"))]
const TRAY_WHITE: &[u8] = include_bytes!("../icons/tray_white.png");
#[cfg(target_os = "macos")]
const TRAY_TEMPLATE: &[u8] = include_bytes!("../icons/trayTemplate.png");

#[derive(Clone, PartialEq, Eq)]
struct TrayMenuSnapshot {
    locale: String,
    account_label: String,
    live_status_label: String,
    logged_in: bool,
}

#[derive(Default)]
struct TrayRefreshCoordinator {
    pending: bool,
    running: bool,
    last_applied_at: Option<Instant>,
    last_snapshot: Option<TrayMenuSnapshot>,
}

static TRAY_REFRESH_COORDINATOR: LazyLock<Mutex<TrayRefreshCoordinator>> =
    LazyLock::new(|| Mutex::new(TrayRefreshCoordinator::default()));

const TRAY_REFRESH_MIN_INTERVAL: Duration = Duration::from_millis(350);
const TRAY_REFRESH_LOCK_BUSY_RETRY_INTERVAL: Duration = Duration::from_millis(120);

impl TrayMenuSnapshot {
    fn fallback() -> Self {
        Self {
            locale: "zh-CN".to_string(),
            account_label: crate::i18n::tr("zh-CN", "tray.account.loading"),
            live_status_label: crate::i18n::tr("zh-CN", "tray.live.loading"),
            logged_in: false,
        }
    }
}

fn get_tray_icon(_app: &AppHandle) -> tauri::image::Image<'static> {
    #[cfg(target_os = "macos")]
    {
        tauri::image::Image::from_bytes(TRAY_TEMPLATE)
            .expect("failed to load macOS tray template icon")
    }
    #[cfg(target_os = "windows")]
    {
        let is_dark = _app
            .get_webview_window("main")
            .and_then(|window| window.theme().ok())
            .map(|theme| matches!(theme, tauri::Theme::Dark))
            .unwrap_or(false);

        if is_dark {
            tauri::image::Image::from_bytes(TRAY_WHITE).expect("failed to load white tray icon")
        } else {
            tauri::image::Image::from_bytes(TRAY_BLACK).expect("failed to load black tray icon")
        }
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        tauri::image::Image::from_bytes(TRAY_WHITE).expect("failed to load default tray icon")
    }
}

fn read_tray_menu_snapshot(app: &AppHandle) -> Option<TrayMenuSnapshot> {
    let state = app.state::<AppState>();
    let runtime = state.runtime.try_lock().ok()?;
    let locale = runtime.config.locale.clone();
    let current_user = runtime
        .config
        .current_uid
        .as_ref()
        .and_then(|uid| runtime.config.users.get(uid));
    let logged_in = current_user
        .map(|user| !user.login_invalid)
        .unwrap_or(false);

    let account_label = match current_user {
        Some(user) if !user.login_invalid => format!(
            "{}: {} ({})",
            crate::i18n::tr_config(&runtime.config, "tray.account.current"),
            user.uname,
            user.uid
        ),
        _ => crate::i18n::tr_config(&runtime.config, "tray.account.logged_out"),
    };
    let live_status_label = if !logged_in {
        crate::i18n::tr_config(&runtime.config, "tray.live.off")
    } else {
        match resolve_live_status(runtime.session.live_status, runtime.session.is_live) {
            LIVE_STATUS_LIVE => crate::i18n::tr_config(&runtime.config, "tray.live.on"),
            LIVE_STATUS_ROUND => crate::i18n::tr_config(&runtime.config, "tray.live.round"),
            _ => crate::i18n::tr_config(&runtime.config, "tray.live.off"),
        }
    };

    Some(TrayMenuSnapshot {
        locale,
        account_label,
        live_status_label,
        logged_in,
    })
}

fn build_tray_menu(
    app: &AppHandle,
    snapshot: &TrayMenuSnapshot,
) -> tauri::Result<Menu<tauri::Wry>> {
    let account_info = MenuItem::with_id(
        app,
        MENU_ACCOUNT_INFO,
        snapshot.account_label.clone(),
        false,
        None::<&str>,
    )?;
    let live_status = MenuItem::with_id(
        app,
        MENU_LIVE_STATUS,
        snapshot.live_status_label.clone(),
        false,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle_window = MenuItem::with_id(
        app,
        MENU_TOGGLE_WINDOW,
        crate::i18n::tr(&snapshot.locale, "tray.menu.toggle_window"),
        true,
        None::<&str>,
    )?;
    let start_live = MenuItem::with_id(
        app,
        MENU_START_LIVE,
        crate::i18n::tr(&snapshot.locale, "tray.menu.start_live"),
        snapshot.logged_in,
        None::<&str>,
    )?;
    let stop_live = MenuItem::with_id(
        app,
        MENU_STOP_LIVE,
        crate::i18n::tr(&snapshot.locale, "tray.menu.stop_live"),
        snapshot.logged_in,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        MENU_QUIT,
        crate::i18n::tr(&snapshot.locale, "tray.menu.quit"),
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

pub fn has_tray(app: &AppHandle) -> bool {
    app.tray_by_id(TRAY_ID).is_some()
}

fn apply_tray_menu_snapshot(app: &AppHandle, snapshot: &TrayMenuSnapshot) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };
    if let Ok(menu) = build_tray_menu(app, snapshot) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn schedule_tray_refresh_worker(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let (has_pending, delay) = {
                let coordinator = TRAY_REFRESH_COORDINATOR
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                let has_pending = coordinator.pending;
                let delay = if !has_pending {
                    Duration::from_millis(0)
                } else {
                    coordinator
                        .last_applied_at
                        .map(|instant| instant.elapsed())
                        .filter(|elapsed| *elapsed < TRAY_REFRESH_MIN_INTERVAL)
                        .map(|elapsed| TRAY_REFRESH_MIN_INTERVAL - elapsed)
                        .unwrap_or(Duration::from_millis(0))
                };
                (has_pending, delay)
            };

            if !has_pending {
                let mut coordinator = TRAY_REFRESH_COORDINATOR
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                if coordinator.pending {
                    continue;
                }
                coordinator.running = false;
                break;
            }

            if !delay.is_zero() {
                tokio::time::sleep(delay).await;
            }

            {
                let mut coordinator = TRAY_REFRESH_COORDINATOR
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                if !coordinator.pending {
                    continue;
                }
                coordinator.pending = false;
            }

            let Some(snapshot) = read_tray_menu_snapshot(&app_handle) else {
                {
                    let mut coordinator = TRAY_REFRESH_COORDINATOR
                        .lock()
                        .unwrap_or_else(|poison| poison.into_inner());
                    coordinator.pending = true;
                }
                tokio::time::sleep(TRAY_REFRESH_LOCK_BUSY_RETRY_INTERVAL).await;
                continue;
            };

            let should_apply = {
                let coordinator = TRAY_REFRESH_COORDINATOR
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                coordinator.last_snapshot.as_ref() != Some(&snapshot)
            };

            if !should_apply {
                continue;
            }

            let app_for_main = app_handle.clone();
            let snapshot_for_main = snapshot.clone();
            let scheduled = app_handle
                .run_on_main_thread(move || {
                    apply_tray_menu_snapshot(&app_for_main, &snapshot_for_main);
                })
                .is_ok();

            let should_retry = {
                let mut coordinator = TRAY_REFRESH_COORDINATOR
                    .lock()
                    .unwrap_or_else(|poison| poison.into_inner());
                if scheduled {
                    coordinator.last_snapshot = Some(snapshot);
                    coordinator.last_applied_at = Some(Instant::now());
                    false
                } else {
                    coordinator.pending = true;
                    true
                }
            };

            if should_retry {
                tokio::time::sleep(TRAY_REFRESH_LOCK_BUSY_RETRY_INTERVAL).await;
            }
        }
    });
}

pub fn refresh_tray_menu(app: &AppHandle) {
    if !has_tray(app) {
        return;
    }
    let should_start_worker = {
        let mut coordinator = TRAY_REFRESH_COORDINATOR
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        coordinator.pending = true;
        if coordinator.running {
            false
        } else {
            coordinator.running = true;
            true
        }
    };
    if should_start_worker {
        schedule_tray_refresh_worker(app);
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

fn toggle_main_window_inner(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) {
        let _ = window.hide();
        let _ =
            app.save_window_state(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED);
        apply_hidden_window_dock_policy(app);
    } else {
        reveal_main_window_inner(app);
    }
}

pub fn toggle_main_window(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        toggle_main_window_inner(&app_handle);
    });
}

fn reveal_main_window_inner(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(target_os = "macos")]
    set_dock_visible(app, true);
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    let _ = window.show();
    let _ = window.set_focus();
}

pub fn reveal_main_window(app: &AppHandle) {
    let app_handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        reveal_main_window_inner(&app_handle);
    });
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
    } else if let Some(window) = app.get_webview_window("main") {
        let is_minimized = window.is_minimized().unwrap_or(false);
        let is_visible = window.is_visible().unwrap_or(false);
        if is_minimized || !is_visible {
            reveal_main_window(app);
        } else {
            let _ = window.set_focus();
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[allow(dead_code)]
pub fn on_reopen_event(_app: &AppHandle, _has_visible_windows: bool) {}

pub fn setup_tray(app: &mut App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    let snapshot = read_tray_menu_snapshot(&handle).unwrap_or_else(TrayMenuSnapshot::fallback);
    let menu = build_tray_menu(&handle, &snapshot)?;

    let icon = get_tray_icon(&handle);
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(crate::i18n::tr(&snapshot.locale, "tray.tooltip"))
        .icon(icon);

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    let _tray = builder.build(app)?;
    {
        let mut coordinator = TRAY_REFRESH_COORDINATOR
            .lock()
            .unwrap_or_else(|poison| poison.into_inner());
        coordinator.last_snapshot = Some(snapshot);
        coordinator.last_applied_at = Some(Instant::now());
        coordinator.pending = false;
        coordinator.running = false;
    }
    Ok(())
}

pub fn on_tray_menu_event(app: &AppHandle, event: &MenuEvent) {
    match event.id().as_ref() {
        MENU_TOGGLE_WINDOW => toggle_main_window(app),
        MENU_START_LIVE => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                match crate::commands::start_live_flow_inner(&app_handle, &state).await {
                    Ok(value) if value["code"].as_i64().unwrap_or(-1) == 0 => {
                        crate::runtime_log!("[tray] start live flow success");
                    }
                    Ok(value) => {
                        crate::runtime_log!("[tray] start live flow non-zero response: {}", value);
                        reveal_main_window(&app_handle);
                    }
                    Err(error) => {
                        crate::runtime_warn!("[tray] start live flow failed: {error}");
                        reveal_main_window(&app_handle);
                    }
                }
                refresh_tray_menu(&app_handle);
            });
        }
        MENU_STOP_LIVE => {
            let app_handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                if let Err(error) = crate::commands::stop_live_flow_inner(&app_handle, &state).await
                {
                    crate::runtime_warn!("[tray] stop live flow failed: {error}");
                } else {
                    crate::runtime_log!("[tray] stop live flow success");
                }
                refresh_tray_menu(&app_handle);
            });
        }
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
                && has_tray(window.app_handle());
            if should_min_to_tray {
                api.prevent_close();
                let _ = window.hide();
                let _ = window.app_handle().save_window_state(
                    StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED,
                );
                apply_hidden_window_dock_policy(window.app_handle());
            }
        }
        #[cfg(target_os = "windows")]
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
