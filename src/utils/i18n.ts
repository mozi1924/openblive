const zhCN: Record<string, string> = {
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
  "i18n.account.error.cookie_refresh_token_missing": "Cookie 需要刷新，但缺少 refresh_token，请重新扫码登录",
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

const I18N_KEY_RE = /(i18n\.[a-z0-9_.-]+)/i;

export const resolveBackendMessage = (raw: string): string => {
  const text = String(raw || "");
  const match = text.match(I18N_KEY_RE);
  if (!match) {
    return text;
  }

  const key = match[1];
  const translated = zhCN[key] || key;
  const suffix = text.slice(match.index! + key.length);
  return `${translated}${suffix}`;
};
