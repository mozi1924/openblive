export type LocaleSetting = "auto" | "zh-CN" | "en-US";
export type EffectiveLocale = "zh-CN" | "en-US";

const backendZhCN: Record<string, string> = {
  "i18n.common.not_logged_in": "未登录",
  "i18n.common.login_expired_relogin": "登录已失效，请重新扫码登录",
  "i18n.live.face_auth_required": "需要人脸验证",
  "i18n.live.danmu_send_success": "发送成功",
  "i18n.live.danmu_monitor_already_running": "弹幕监听已在运行",
  "i18n.live.danmu_monitor_started": "弹幕监听已启动",
  "i18n.live.danmu_monitor_stopped": "弹幕监听已停止",
  "i18n.live.profile.title_conflict": "远端标题与最近一次提交不同",
  "i18n.live.profile.area_conflict": "远端分区与最近一次提交不同",
  "i18n.live.profile.tags_conflict": "远端标签与最近一次提交不同",
  "i18n.live.error.sync_status_failed": "查询直播状态失败",
  "i18n.live.error.fetch_live_version_failed": "获取版本号失败",
  "i18n.live.error.room_id_missing": "未获取到直播间号",
  "i18n.live.error.csrf_missing": "未获取到 csrf，请尝试刷新账号信息",
  "i18n.live.error.update_area_failed": "分区设置失败",
  "i18n.live.error.update_title_failed": "标题更新失败",
  "i18n.live.error.update_tags_add_failed": "新增标签失败",
  "i18n.live.error.update_tags_remove_failed": "删除标签失败",
  "i18n.live.error.start_live_failed": "开播失败",
  "i18n.live.error.obs_stream_context_missing": "未获取到推流地址或推流密钥，无法执行 OBS WS 联动",
  "i18n.live.error.start_linkage_failed_with_rollback": "开播联动失败，已尝试回滚开播状态",
  "i18n.live.error.stop_live_failed": "停播失败",
  "i18n.live.error.send_danmu_failed": "发送失败",
  "i18n.live.error.spawn_command_failed": "执行命令失败",
  "i18n.live.error.obs_ws_closed": "OBS WS 连接已关闭",
  "i18n.live.error.obs_ws_receive_failed": "OBS WS 收包失败",
  "i18n.live.error.obs_ws_json_parse_failed": "OBS WS JSON 解析失败",
  "i18n.live.error.obs_ws_binary_json_parse_failed": "OBS WS 二进制 JSON 解析失败",
  "i18n.live.error.obs_ws_closed_by_peer": "OBS WS 连接被关闭",
  "i18n.live.error.obs_ws_non_json_frame": "OBS WS 收到非 JSON 帧",
  "i18n.live.error.obs_ws_request_send_failed": "OBS WS 请求发送失败",
  "i18n.live.error.obs_ws_request_failed": "OBS WS 请求失败",
  "i18n.live.error.obs_ws_protocol_hello_missing": "OBS WS 协议错误：未收到 Hello",
  "i18n.live.error.obs_ws_identify_send_failed": "发送 OBS Identify 失败",
  "i18n.live.error.obs_ws_connect_failed": "连接 OBS WS 失败",
  "i18n.system.obs_ws_not_enabled": "OBS 联动未启用",
  "i18n.system.error.unknown_config_key": "未知设置项",
  "i18n.account.error.load_refresh_pubkey_failed": "加载刷新公钥失败",
  "i18n.account.error.build_correspond_path_failed": "生成 correspondPath 失败",
  "i18n.account.error.cookie_refresh_token_missing":
    "Cookie 需要刷新，但缺少 refresh_token，请重新扫码登录",
  "i18n.account.error.cookie_csrf_missing": "Cookie 需要刷新，但缺少 csrf",
  "i18n.account.error.fetch_refresh_csrf_http_failed": "获取 refresh_csrf 失败",
  "i18n.account.error.refresh_csrf_token_missing": "获取 refresh_csrf 失败: 页面缺少 token",
  "i18n.account.error.cookie_refresh_failed": "Cookie 刷新失败",
  "i18n.account.error.cookie_refresh_confirm_csrf_missing": "Cookie 刷新确认失败: 缺少新的 csrf",
  "i18n.account.error.cookie_refresh_confirm_failed": "Cookie 刷新确认失败",
  "i18n.account.error.local_credential_empty": "本地凭证为空，请重新扫码登录",
  "i18n.account.error.cookie_status_check_failed": "Cookie 状态检查失败",
  "i18n.account.error.login_verify_failed": "登录校验异常",
  "i18n.account.error.cookie_sessdata_missing": "Cookie 缺少 SESSDATA，请重新登录",
  "i18n.account.error.cookie_refresh_retry_failed": "Cookie 需要刷新但刷新失败",
  "i18n.account.error.fetch_user_info_failed": "获取用户信息失败",
  "i18n.account.error.login_uid_missing": "登录成功但未获取到有效 UID，请重试扫码登录",
  "i18n.account.error.account_not_found": "账户不存在",
  "i18n.account.error.account_login_invalid": "该账号登录已失效，请重新扫码登录",
  "i18n.account.user.unknown_name": "未知用户",
};

const backendEnUS: Record<string, string> = {
  "i18n.common.not_logged_in": "Not logged in",
  "i18n.common.login_expired_relogin": "Session expired, please log in again",
  "i18n.live.face_auth_required": "Face verification required",
  "i18n.live.danmu_send_success": "Sent",
  "i18n.live.danmu_monitor_already_running": "Danmu monitor is already running",
  "i18n.live.danmu_monitor_started": "Danmu monitor started",
  "i18n.live.danmu_monitor_stopped": "Danmu monitor stopped",
  "i18n.live.error.start_live_failed": "Failed to start live",
  "i18n.live.error.stop_live_failed": "Failed to stop live",
  "i18n.live.error.send_danmu_failed": "Failed to send",
  "i18n.system.obs_ws_not_enabled": "OBS linkage is not enabled",
  "i18n.system.error.unknown_config_key": "Unknown config key",
  "i18n.account.error.account_not_found": "Account not found",
  "i18n.account.error.account_login_invalid": "Account session is invalid, please log in again",
  "i18n.account.user.unknown_name": "Unknown user",
};

const uiZhCN: Record<string, string> = {
  "ui.sidebar.tab.account": "账户管理",
  "ui.sidebar.tab.stream": "直播控制",
  "ui.sidebar.tab.danmu": "直播互动",
  "ui.sidebar.tab.settings": "系统设置",
  "ui.sidebar.live.on": "直播中",
  "ui.sidebar.live.off": "未开播",
  "ui.sidebar.room.disconnected": "未连接直播间",
  "ui.sidebar.logs.toggle.show": "运行日志 展开",
  "ui.sidebar.logs.toggle.hide": "运行日志 折叠",
  "ui.header.btn.sync_partitions": "同步分区",
  "ui.header.btn.refresh_accounts": "刷新列表",
  "ui.settings.loading": "正在拉取全局配置信息...",
  "ui.settings.locale.label": "界面语言 / UI Language",
  "ui.settings.locale.auto": "跟随系统 (Auto)",
  "ui.settings.locale.zh": "简体中文",
  "ui.settings.locale.en": "English",
  "ui.settings.save.done": "设置已保存",
  "ui.settings.save.failed": "保存设置失败",
};

const uiEnUS: Record<string, string> = {
  "ui.sidebar.tab.account": "Accounts",
  "ui.sidebar.tab.stream": "Stream Control",
  "ui.sidebar.tab.danmu": "Danmu",
  "ui.sidebar.tab.settings": "Settings",
  "ui.sidebar.live.on": "Live",
  "ui.sidebar.live.off": "Offline",
  "ui.sidebar.room.disconnected": "Room not connected",
  "ui.sidebar.logs.toggle.show": "Logs Expand",
  "ui.sidebar.logs.toggle.hide": "Logs Collapse",
  "ui.header.btn.sync_partitions": "Sync Areas",
  "ui.header.btn.refresh_accounts": "Refresh List",
  "ui.settings.loading": "Loading app config...",
  "ui.settings.locale.label": "Language",
  "ui.settings.locale.auto": "Auto",
  "ui.settings.locale.zh": "Chinese",
  "ui.settings.locale.en": "English",
  "ui.settings.save.done": "Settings saved",
  "ui.settings.save.failed": "Failed to save settings",
};

const I18N_KEY_RE = /(i18n\.[a-z0-9_.-]+)/i;

export function resolveLocale(locale: LocaleSetting): EffectiveLocale {
  if (locale === "zh-CN" || locale === "en-US") {
    return locale;
  }
  const nav = (globalThis.navigator?.language || "").toLowerCase();
  return nav.startsWith("en") ? "en-US" : "zh-CN";
}

function uiDict(locale: EffectiveLocale): Record<string, string> {
  return locale === "en-US" ? uiEnUS : uiZhCN;
}

function backendDict(locale: EffectiveLocale): Record<string, string> {
  return locale === "en-US" ? { ...backendZhCN, ...backendEnUS } : backendZhCN;
}

export function t(localeSetting: LocaleSetting, key: string): string {
  const locale = resolveLocale(localeSetting);
  return uiDict(locale)[key] || key;
}

export const resolveBackendMessage = (
  raw: string,
  localeSetting: LocaleSetting = "auto",
): string => {
  const text = String(raw || "");
  const match = text.match(I18N_KEY_RE);
  if (!match) {
    return text;
  }

  const key = match[1];
  const translated = backendDict(resolveLocale(localeSetting))[key] || key;
  const suffix = text.slice(match.index! + key.length);
  return `${translated}${suffix}`;
};
