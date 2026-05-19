import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  AccountList,
  DanmuEventPayload,
  LiveRoomProfile,
  Resp,
  Session,
  StreamInfo,
  User,
} from "../types/studio";

const invokeCommand = <T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<Resp<T>> => invoke<Resp<T>>(command, args);

export const studioApi = {
  getSession: () => invokeCommand<Session>("get_session"),
  loadSavedConfig: () => invokeCommand<User | null>("load_saved_config"),
  getAccountList: () => invokeCommand<AccountList>("get_account_list"),
  refreshAllAccountCookies: () =>
    invokeCommand<{ updated: number; failed: string[]; expired: string[] }>(
      "refresh_all_account_cookies",
    ),
  refreshCurrentUser: () => invokeCommand<User>("refresh_current_user"),
  getLoginQrcode: () =>
    invokeCommand<{ url: string; qrcode_key: string }>("get_login_qrcode"),
  pollLoginStatus: (key: string) =>
    invokeCommand<User>("poll_login_status", { req: { key } }),
  switchAccount: (uid: string) =>
    invokeCommand<User>("switch_account", { req: { uid } }),
  logout: (uid: string) => invokeCommand("logout", { req: { uid } }),
  getPartitions: () =>
    invokeCommand<Record<string, string[]>>("get_partitions"),
  updateArea: (parent: string, child: string) =>
    invokeCommand("update_area", { req: { parent, child } }),
  updateTitle: (title: string) =>
    invokeCommand("update_title", { req: { title } }),
  syncLiveRoomProfile: () =>
    invokeCommand<LiveRoomProfile>("sync_live_room_profile"),
  updateLiveTags: (tags: string) =>
    invokeCommand<{ tags: string[]; added: string[]; removed: string[] }>(
      "update_live_tags",
      { req: { tags } },
    ),
  startLive: () => invokeCommand<StreamInfo>("start_live"),
  stopLive: () => invokeCommand("stop_live"),
  startDanmuMonitor: () => invokeCommand("start_danmu_monitor"),
  stopDanmuMonitor: () => invokeCommand("stop_danmu_monitor"),
  sendDanmu: (msg: string) => invokeCommand("send_danmu", { req: { msg } }),
  listenDanmuEvent: (handler: (payload: DanmuEventPayload) => void) =>
    listen<DanmuEventPayload>("danmu-event", (event) => handler(event.payload)),
};
