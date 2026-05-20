use crate::models::PersistConfig;

pub fn normalize_locale_setting(input: &str) -> &'static str {
    let value = input.trim().to_ascii_lowercase();
    if value.is_empty() || value == "auto" {
        "auto"
    } else if value.starts_with("en") {
        "en-US"
    } else {
        "zh-CN"
    }
}

fn detect_system_locale() -> &'static str {
    let env_locale = std::env::var("LC_ALL")
        .ok()
        .or_else(|| std::env::var("LANG").ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if env_locale.starts_with("en") || env_locale.contains("en_") {
        "en-US"
    } else {
        "zh-CN"
    }
}

pub fn resolve_locale(locale_setting: &str) -> &'static str {
    let normalized = normalize_locale_setting(locale_setting);
    if normalized == "auto" {
        detect_system_locale()
    } else {
        normalized
    }
}

pub fn tr(locale_setting: &str, key: &str) -> String {
    let lc = resolve_locale(locale_setting);
    match (lc, key) {
        ("en-US", "tray.account.loading") => "Account: Loading".to_string(),
        ("en-US", "tray.account.logged_out") => "Account: Not logged in".to_string(),
        ("en-US", "tray.account.current") => "Account".to_string(),
        ("en-US", "tray.live.loading") => "Live: Loading".to_string(),
        ("en-US", "tray.live.on") => "Live: Streaming".to_string(),
        ("en-US", "tray.live.round") => "Live: Round Play".to_string(),
        ("en-US", "tray.live.off") => "Live: Offline".to_string(),
        ("en-US", "tray.menu.toggle_window") => "Show/Hide Main Window".to_string(),
        ("en-US", "tray.menu.start_live") => "Start Live".to_string(),
        ("en-US", "tray.menu.stop_live") => "Stop Live".to_string(),
        ("en-US", "tray.menu.quit") => "Quit".to_string(),
        ("en-US", "tray.tooltip") => "OpenBlive Studio".to_string(),
        ("en-US", "i18n.live.event.fallback.anonymous_user") => "Anonymous User".to_string(),
        ("en-US", "i18n.live.event.fallback.viewer") => "Viewer".to_string(),
        ("en-US", "i18n.live.event.fallback.gift_user") => "Gift User".to_string(),
        ("en-US", "i18n.live.event.fallback.gift") => "Gift".to_string(),
        ("en-US", "i18n.live.event.fallback.guard_user") => "Guard User".to_string(),
        ("en-US", "i18n.live.event.fallback.guard") => "Guard".to_string(),
        ("en-US", "i18n.live.event.fallback.superchat_user") => "Super Chat User".to_string(),
        ("en-US", "i18n.live.event.fallback.superchat") => "Super Chat".to_string(),
        ("en-US", "i18n.live.event.fallback.some_viewer") => "A viewer".to_string(),
        ("en-US", "i18n.live.event.interact.enter") => "entered the room".to_string(),
        ("en-US", "i18n.live.event.interact.follow") => "followed the streamer".to_string(),
        ("en-US", "i18n.live.event.interact.share") => "shared the stream".to_string(),
        ("en-US", "i18n.live.event.interact.unknown") => "triggered an interaction".to_string(),
        ("en-US", "i18n.live.event.interact.received") => "Interaction event received".to_string(),
        ("en-US", "i18n.live.event.interact.received_v2") => {
            "Interaction event received (V2)".to_string()
        }
        ("en-US", "i18n.live.event.gift.sent") => "Gift sent".to_string(),
        ("en-US", "i18n.live.event.guard.activated") => "Guard activated".to_string(),
        ("en-US", "i18n.live.event.moderation.superchat_deleted") => {
            "Super Chat messages removed".to_string()
        }
        ("en-US", "i18n.live.event.moderation.warning") => "Room warning received".to_string(),
        ("en-US", "i18n.live.event.moderation.cut_off") => {
            "Live stream has been cut off".to_string()
        }
        ("en-US", "i18n.live.event.moderation.violation_notice") => "Violation notice".to_string(),
        ("en-US", "i18n.live.event.moderation.room_blocked") => "has been muted".to_string(),
        ("en-US", "i18n.live.event.moderation.silent_on") => "Mute mode enabled".to_string(),
        ("en-US", "i18n.live.event.moderation.silent_off") => "Mute mode disabled".to_string(),
        ("en-US", "i18n.live.event.room_change.full") => "Room info updated".to_string(),
        ("en-US", "i18n.live.event.room_change.title") => "Room title updated".to_string(),
        ("en-US", "i18n.live.event.room_change") => "Room info updated".to_string(),
        ("en-US", "i18n.live.event.guard_honor_update") => {
            "Thousand-guard status updated".to_string()
        }
        ("en-US", "i18n.live.event.live_started") => "Live started".to_string(),
        ("en-US", "i18n.live.event.preparing_round") => {
            "Streamer temporarily away, room switched to round-play".to_string()
        }
        ("en-US", "i18n.live.event.preparing") => {
            "Streamer is preparing (not live yet)".to_string()
        }
        ("en-US", "i18n.live.event.danmu_recalled") => "Danmu recalled".to_string(),
        ("en-US", "i18n.live.event.reenter_requested") => {
            "Server requested re-entering the room".to_string()
        }
        ("en-US", "i18n.live.event.parse_failed") => "Event parse failed".to_string(),

        (_, "tray.account.loading") => "当前账号：读取中".to_string(),
        (_, "tray.account.logged_out") => "当前账号：未登录".to_string(),
        (_, "tray.account.current") => "当前账号".to_string(),
        (_, "tray.live.loading") => "直播状态：读取中".to_string(),
        (_, "tray.live.on") => "直播状态：直播中".to_string(),
        (_, "tray.live.round") => "直播状态：轮播中".to_string(),
        (_, "tray.live.off") => "直播状态：未开播".to_string(),
        (_, "tray.menu.toggle_window") => "打开/隐藏主界面".to_string(),
        (_, "tray.menu.start_live") => "开播".to_string(),
        (_, "tray.menu.stop_live") => "下播".to_string(),
        (_, "tray.menu.quit") => "退出程序".to_string(),
        (_, "tray.tooltip") => "OpenBlive Studio".to_string(),
        (_, "i18n.live.event.fallback.anonymous_user") => "匿名用户".to_string(),
        (_, "i18n.live.event.fallback.viewer") => "观众".to_string(),
        (_, "i18n.live.event.fallback.gift_user") => "礼物用户".to_string(),
        (_, "i18n.live.event.fallback.gift") => "礼物".to_string(),
        (_, "i18n.live.event.fallback.guard_user") => "舰长用户".to_string(),
        (_, "i18n.live.event.fallback.guard") => "舰长".to_string(),
        (_, "i18n.live.event.fallback.superchat_user") => "醒目留言用户".to_string(),
        (_, "i18n.live.event.fallback.superchat") => "醒目留言".to_string(),
        (_, "i18n.live.event.fallback.some_viewer") => "某观众".to_string(),
        (_, "i18n.live.event.interact.enter") => "进入了直播间".to_string(),
        (_, "i18n.live.event.interact.follow") => "关注了主播".to_string(),
        (_, "i18n.live.event.interact.share") => "分享了直播间".to_string(),
        (_, "i18n.live.event.interact.unknown") => "触发了互动".to_string(),
        (_, "i18n.live.event.interact.received") => "收到互动事件".to_string(),
        (_, "i18n.live.event.interact.received_v2") => "收到互动事件（V2）".to_string(),
        (_, "i18n.live.event.gift.sent") => "送出礼物".to_string(),
        (_, "i18n.live.event.guard.activated") => "开通了大航海".to_string(),
        (_, "i18n.live.event.moderation.superchat_deleted") => "移除醒目留言".to_string(),
        (_, "i18n.live.event.moderation.warning") => "直播间收到警告".to_string(),
        (_, "i18n.live.event.moderation.cut_off") => "直播已被切断".to_string(),
        (_, "i18n.live.event.moderation.violation_notice") => "违规提示".to_string(),
        (_, "i18n.live.event.moderation.room_blocked") => "已被禁言".to_string(),
        (_, "i18n.live.event.moderation.silent_on") => "已开启禁言".to_string(),
        (_, "i18n.live.event.moderation.silent_off") => "已关闭禁言".to_string(),
        (_, "i18n.live.event.room_change.full") => "直播间信息更新".to_string(),
        (_, "i18n.live.event.room_change.title") => "直播间标题更新".to_string(),
        (_, "i18n.live.event.room_change") => "直播间信息已更新".to_string(),
        (_, "i18n.live.event.guard_honor_update") => "千舰状态更新".to_string(),
        (_, "i18n.live.event.live_started") => "直播已开始".to_string(),
        (_, "i18n.live.event.preparing_round") => "主播暂时离开，直播间进入轮播".to_string(),
        (_, "i18n.live.event.preparing") => "主播准备中（暂未开播）".to_string(),
        (_, "i18n.live.event.danmu_recalled") => "弹幕被撤回".to_string(),
        (_, "i18n.live.event.reenter_requested") => "服务端请求重进直播间".to_string(),
        (_, "i18n.live.event.parse_failed") => "事件解析失败".to_string(),
        _ => key.to_string(),
    }
}

pub fn tr_config(config: &PersistConfig, key: &str) -> String {
    tr(&config.locale, key)
}

#[allow(dead_code)]
pub fn effective_locale(config: &PersistConfig) -> &'static str {
    resolve_locale(&config.locale)
}
