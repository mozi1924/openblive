pub(in crate::ws_server) const WS_SERVER_DEFAULT_LISTEN_ADDR: &str = "127.0.0.1:12450";
pub(in crate::ws_server) const CHAT_HEARTBEAT_INTERVAL_SECS: u64 = 10;
pub(in crate::ws_server) const CHAT_DANMU_MAX_BUFFER: usize = 512;
pub(in crate::ws_server) const RAW_DANMU_MAX_BUFFER: usize = 512;
pub(in crate::ws_server) const RAW_EVENT_DANMU: &str = "danmu.message";
pub(in crate::ws_server) const OVERLAY_FALLBACK_INDEX: &str = "overlay/index.html";
pub(in crate::ws_server) const COMPAT_DEFAULT_AVATAR_URL: &str =
    "//static.hdslb.com/images/member/noface.gif";
