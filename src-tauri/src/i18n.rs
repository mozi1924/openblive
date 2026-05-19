use crate::models::PersistConfig;

pub fn normalize_locale(input: &str) -> &'static str {
    let value = input.trim().to_ascii_lowercase();
    if value.starts_with("en") {
        "en-US"
    } else {
        "zh-CN"
    }
}

pub fn tr(locale: &str, key: &str) -> String {
    let lc = normalize_locale(locale);
    match (lc, key) {
        ("en-US", "tray.account.loading") => "Account: Loading".to_string(),
        ("en-US", "tray.account.logged_out") => "Account: Not logged in".to_string(),
        ("en-US", "tray.account.current") => "Account".to_string(),
        ("en-US", "tray.live.loading") => "Live: Loading".to_string(),
        ("en-US", "tray.live.on") => "Live: Streaming".to_string(),
        ("en-US", "tray.live.off") => "Live: Offline".to_string(),
        ("en-US", "tray.menu.toggle_window") => "Show/Hide Main Window".to_string(),
        ("en-US", "tray.menu.start_live") => "Start Live".to_string(),
        ("en-US", "tray.menu.stop_live") => "Stop Live".to_string(),
        ("en-US", "tray.menu.quit") => "Quit".to_string(),
        ("en-US", "tray.tooltip") => "OpenBlive Studio".to_string(),

        (_, "tray.account.loading") => "当前账号：读取中".to_string(),
        (_, "tray.account.logged_out") => "当前账号：未登录".to_string(),
        (_, "tray.account.current") => "当前账号".to_string(),
        (_, "tray.live.loading") => "直播状态：读取中".to_string(),
        (_, "tray.live.on") => "直播状态：直播中".to_string(),
        (_, "tray.live.off") => "直播状态：未开播".to_string(),
        (_, "tray.menu.toggle_window") => "打开/隐藏主界面".to_string(),
        (_, "tray.menu.start_live") => "开播".to_string(),
        (_, "tray.menu.stop_live") => "下播".to_string(),
        (_, "tray.menu.quit") => "退出程序".to_string(),
        (_, "tray.tooltip") => "OpenBlive Studio".to_string(),
        _ => key.to_string(),
    }
}

pub fn tr_config(config: &PersistConfig, key: &str) -> String {
    tr(&config.locale, key)
}
