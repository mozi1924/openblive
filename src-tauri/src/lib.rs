mod avatar;
mod bili;
mod client;
mod commands;
mod config;
mod constants;
mod crypto;
mod danmu;
mod emoticon;
mod endpoints;
mod i18n;
mod models;
mod response;
mod runtime_log;
mod state;
mod state_event;
mod tray;
mod ws_server;

use commands::{
    clear_app_logs, create_live_vote, ensure_auto_start_danmu_monitor, generate_http_user_agent,
    get_account_list, get_app_config, get_app_logs, get_linkage_status,
    get_live_dashboard_snapshot, get_live_emoticons, get_live_online_rank, get_live_vote_history,
    get_live_vote_panel, get_login_qrcode, get_partitions, get_recent_danmu, get_session,
    get_version, hide_danmu_overlay, load_saved_config, logout, poll_login_status, push_app_log,
    refresh_all_account_cookies, refresh_all_account_profiles, refresh_all_account_profiles_inner,
    refresh_current_user, refresh_live_client_version, refresh_live_client_version_inner,
    refresh_tray_menu, render_qrcode, reveal_main_window, send_danmu, set_app_config,
    set_app_configs, set_danmu_overlay_pinned, show_danmu_overlay, start_danmu_monitor, start_live,
    start_live_flow, stop_danmu_monitor, stop_live, stop_live_flow, switch_account,
    sync_live_room_profile, sync_live_status, terminate_live_vote, update_area, update_live_tags,
    update_title,
};
use config::{config_path, load_config};
use crypto::get_or_create_master_key;
use state::{restore_session_from_current, AppState, RuntimeState};
use tauri::{webview::PageLoadEvent, Manager};
#[cfg(desktop)]
use tauri_plugin_window_state::StateFlags;
use tokio::sync::Mutex;
use tokio::time::Duration;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let path = config_path();
    let master_key = get_or_create_master_key().expect("failed to load/create local master key");
    let cfg = load_config(&path, &master_key);
    endpoints::set_runtime_overrides_from_config(&cfg);
    let client = client::BiliClient::new();
    let mut runtime = RuntimeState {
        config: cfg,
        ..Default::default()
    };
    restore_session_from_current(&mut runtime, &client);

    let app_state = AppState {
        client,
        runtime: Mutex::new(runtime),
        auth_refresh_lock: Mutex::new(()),
        config_path: path,
        master_key,
    };

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .targets([tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("runtime".to_string()),
                    },
                )])
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::reveal_main_window(app);
        }))
        .on_page_load(|webview, payload| {
            if webview.label() != "main" {
                return;
            }
            if let PageLoadEvent::Finished = payload.event() {
                let app_handle = webview.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    commands::restore_main_window_state(app_handle.clone());
                    let state = app_handle.state::<AppState>();
                    commands::sync_overlay_window_from_config(app_handle.clone(), &state).await;
                });
            }
        })
        .manage(app_state);

    #[cfg(desktop)]
    {
        builder = builder.plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
                .build(),
        );
    }

    let app = builder
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                if let Err(error) = refresh_live_client_version_inner(&state).await {
                    crate::runtime_warn!("refresh live client version on startup failed: {error}");
                }
            });
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::ensure_obs_ws_keepalive_task(app_handle.clone()).await;
                ws_server::sync_ws_server_from_config(app_handle.clone()).await;
                let state = app_handle.state::<AppState>();
                ensure_auto_start_danmu_monitor(
                    &app_handle,
                    &state,
                    "app.startup.auto_start_danmu_monitor",
                )
                .await;

                let first_state = app_handle.state::<AppState>();
                let first = refresh_all_account_profiles_inner(&first_state).await;
                crate::runtime_log!("[auth][batch][profile] startup refresh: {}", first);

                let mut ticker = tokio::time::interval(Duration::from_secs(15 * 60));
                loop {
                    ticker.tick().await;
                    let state = app_handle.state::<AppState>();
                    let result = refresh_all_account_profiles_inner(&state).await;
                    crate::runtime_log!("[auth][batch][profile] periodic refresh: {}", result);
                }
            });
            if let Err(error) = tray::setup_tray(app) {
                crate::runtime_warn!("setup tray failed: {error}");
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            tray::on_tray_menu_event(app, &event);
        })
        .on_tray_icon_event(|app, event| {
            tray::on_tray_icon_event(app, &event);
        })
        .on_window_event(|window, event| {
            tray::on_window_event(window, event);
        })
        .invoke_handler(tauri::generate_handler![
            get_login_qrcode,
            poll_login_status,
            load_saved_config,
            refresh_current_user,
            get_account_list,
            refresh_all_account_cookies,
            refresh_all_account_profiles,
            refresh_live_client_version,
            switch_account,
            logout,
            get_partitions,
            sync_live_room_profile,
            sync_live_status,
            update_area,
            update_title,
            update_live_tags,
            start_live,
            start_live_flow,
            stop_live,
            stop_live_flow,
            start_danmu_monitor,
            stop_danmu_monitor,
            send_danmu,
            get_live_emoticons,
            get_live_dashboard_snapshot,
            get_live_online_rank,
            get_live_vote_panel,
            get_live_vote_history,
            create_live_vote,
            terminate_live_vote,
            get_recent_danmu,
            get_session,
            get_app_config,
            generate_http_user_agent,
            get_linkage_status,
            set_app_config,
            set_app_configs,
            refresh_tray_menu,
            reveal_main_window,
            show_danmu_overlay,
            hide_danmu_overlay,
            set_danmu_overlay_pinned,
            get_version,
            render_qrcode,
            push_app_log,
            get_app_logs,
            clear_app_logs
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } = event
        {
            tray::on_reopen_event(app_handle, has_visible_windows);
        }
    });
}
