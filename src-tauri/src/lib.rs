mod avatar;
mod bili;
mod client;
mod commands;
mod config;
mod constants;
mod crypto;
mod danmu;
mod models;
mod response;
mod state;
mod tray;

use commands::{
    get_account_list, get_app_config, get_login_qrcode, get_partitions, get_session, get_version,
    load_saved_config, logout, poll_login_status, refresh_all_account_cookies,
    refresh_current_user, refresh_live_client_version, refresh_live_client_version_inner,
    send_danmu, set_app_config, start_danmu_monitor, start_live, stop_danmu_monitor, stop_live,
    switch_account, sync_live_room_profile, sync_live_status, update_area, update_live_tags, update_title,
    refresh_tray_menu,
};
use config::{config_path, load_config};
use crypto::get_or_create_master_key;
use state::{restore_session_from_current, AppState, RuntimeState};
use tauri::Manager;
use tokio::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let path = config_path();
    let master_key =
        get_or_create_master_key().expect("failed to load/create master key from system keyring");
    let cfg = load_config(&path, &master_key);
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = app_handle.state::<AppState>();
                if let Err(error) = refresh_live_client_version_inner(&state).await {
                    eprintln!("refresh live client version on startup failed: {error}");
                }
            });
            if let Err(error) = tray::setup_tray(app) {
                eprintln!("setup tray failed: {error}");
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
            stop_live,
            start_danmu_monitor,
            stop_danmu_monitor,
            send_danmu,
            get_session,
            get_app_config,
            set_app_config,
            refresh_tray_menu,
            get_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
