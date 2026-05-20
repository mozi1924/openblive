import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AccountList,
  AppLogEvent,
  AppConfig,
  DanmuMsg,
  LinkageStatus,
  LiveFlowResp,
  LiveEmoticonPackage,
  QrPayload,
  LiveRoomProfile,
  Resp,
  Session,
  StreamInfo,
  UpdateAreaResp,
  UpdateTagsResp,
  UpdateTitleResp,
  User,
} from "../types/studio";

const invokeCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Resp<T>> => invoke<Resp<T>>(command, args);

export const studioApi = {
  getSession: () => invokeCommand<Session>("get_session"),
  getAppConfig: () => invokeCommand<AppConfig>("get_app_config"),
  getLinkageStatus: () => invokeCommand<LinkageStatus>("get_linkage_status"),
  setAppConfig: (key: string, value: unknown) =>
    invokeCommand("set_app_config", { req: { key, value } }),
  setAppConfigs: (values: Record<string, unknown>) =>
    invokeCommand("set_app_configs", { req: { values } }),
  refreshTrayMenu: () => invokeCommand("refresh_tray_menu"),
  revealMainWindow: () => invokeCommand("reveal_main_window"),
  loadSavedConfig: () => invokeCommand<User | null>("load_saved_config"),
  getAccountList: () => invokeCommand<AccountList>("get_account_list"),
  refreshAllAccountCookies: () =>
    invokeCommand<{ updated: number; failed: string[]; expired: string[] }>(
      "refresh_all_account_cookies",
    ),
  refreshAllAccountProfiles: () =>
    invokeCommand<{ updated: number; failed: string[]; expired: string[] }>(
      "refresh_all_account_profiles",
    ),
  refreshCurrentUser: () => invokeCommand<User>("refresh_current_user"),
  getLoginQrcode: () =>
    invokeCommand<{ url: string; content: string; image_src: string; qrcode_key: string }>(
      "get_login_qrcode",
    ),
  renderQrcode: (content: string, width = 220, margin = 2) =>
    invokeCommand<QrPayload>("render_qrcode", { req: { content, width, margin } }),
  pollLoginStatus: (key: string) =>
    invokeCommand<User>("poll_login_status", { req: { key } }),
  switchAccount: (uid: string) =>
    invokeCommand<User>("switch_account", { req: { uid } }),
  logout: (uid: string) => invokeCommand("logout", { req: { uid } }),
  getPartitions: () =>
    invokeCommand<Record<string, string[]>>("get_partitions"),
  updateArea: (parent: string, child: string) =>
    invokeCommand<UpdateAreaResp>("update_area", { req: { parent, child } }),
  updateTitle: (title: string) =>
    invokeCommand<UpdateTitleResp>("update_title", { req: { title } }),
  syncLiveStatus: () => invokeCommand<Session>("sync_live_status"),
  syncLiveRoomProfile: () =>
    invokeCommand<LiveRoomProfile>("sync_live_room_profile"),
  updateLiveTags: (tags: string) =>
    invokeCommand<UpdateTagsResp>(
      "update_live_tags",
      { req: { tags } },
    ),
  startLive: () => invokeCommand<StreamInfo>("start_live"),
  startLiveFlow: () => invokeCommand<LiveFlowResp>("start_live_flow"),
  stopLive: () => invokeCommand("stop_live"),
  stopLiveFlow: () => invokeCommand<LiveFlowResp>("stop_live_flow"),
  startDanmuMonitor: () => invokeCommand("start_danmu_monitor"),
  stopDanmuMonitor: () => invokeCommand("stop_danmu_monitor"),
  sendDanmu: (msg: string) => invokeCommand("send_danmu", { req: { msg } }),
  getLiveEmoticons: () => invokeCommand<LiveEmoticonPackage[]>("get_live_emoticons"),
  pushAppLog: (message: string) =>
    invokeCommand<{ line: string; logs: string[] }>("push_app_log", { req: { message } }),
  getAppLogs: () => invokeCommand<string[]>("get_app_logs"),
  clearAppLogs: () => invokeCommand("clear_app_logs"),
  listenDanmuMessage: (handler: (payload: DanmuMsg) => void) =>
    listen<DanmuMsg>("danmu-message", (event) => handler(event.payload)),
  listenAppLog: (handler: (payload: AppLogEvent) => void) =>
    listen<AppLogEvent>("app-log", (event) => handler(event.payload)),
};
