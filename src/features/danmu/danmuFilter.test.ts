import { describe, expect, it } from "vitest";
import type { AppConfig, DanmuMsg } from "../../types/studio";
import { shouldFilterDanmuMessage } from "../../utils/danmu";

const defaultConfig: AppConfig = {
  min_to_tray: true,
  hide_dock_on_minimize: false,
  danmu_overlay_enabled: true,
  danmu_overlay_opacity: 55,
  danmu_overlay_always_on_top: false,
  live_control_mode: "none",
  obs_ws_enabled: false,
  obs_ws_url: "",
  obs_ws_password: "",
  obs_ws_auto_start_on_live: false,
  obs_ws_auto_stop_on_live_end: false,
  on_live_start_command: "",
  on_live_stop_command: "",
  force_custom_push_url: true,
  custom_push_url: "",
  ws_server_enabled: false,
  ws_server_listen_addr: "",
  ws_server_auth_token: "",
  ws_server_bypass_token_for_loopback: true,
  locale: "zh-CN",
  host_www: "",
  host_api: "",
  host_live_api: "",
  host_passport: "",
  host_live_web: "",
  cookie_domain: "",
  danmu_host: "",
  app_key: "",
  app_sec: "",
  http_user_agent: "",
  livehime_version_override: "",
  livehime_build_override: "",
  live_platform: "",
  filter_entry_effect: true,
  filter_enter_msg: false,
  filter_guard_status: true,
  filter_follow_share_msg: false,
  is_win32: false,
  is_macos: true,
  has_tray: true,
};

describe("shouldFilterDanmuMessage", () => {
  it("filters ENTRY_EFFECT when filter_entry_effect is true", () => {
    const entryEffectMsg: DanmuMsg = {
      id: "1",
      type: "interact",
      time: "12:00:00",
      sender: "mozi1924",
      content: "mozi1924 来了",
      cmd: "ENTRY_EFFECT",
      interact_type: "enter",
    };

    expect(shouldFilterDanmuMessage(entryEffectMsg, defaultConfig)).toBe(true);

    const configDisabled: AppConfig = {
      ...defaultConfig,
      filter_entry_effect: false,
    };
    expect(shouldFilterDanmuMessage(entryEffectMsg, configDisabled)).toBe(false);
  });

  it("filters GUARD_HONOR_THOUSAND when filter_guard_status is true", () => {
    const guardStatusMsg: DanmuMsg = {
      id: "2",
      type: "live_state",
      time: "12:00:01",
      sender: "system",
      content: "i18n.live.event.guard_honor_update:+1/-0",
      cmd: "GUARD_HONOR_THOUSAND",
    };

    expect(shouldFilterDanmuMessage(guardStatusMsg, defaultConfig)).toBe(true);

    const configDisabled: AppConfig = {
      ...defaultConfig,
      filter_guard_status: false,
    };
    expect(shouldFilterDanmuMessage(guardStatusMsg, configDisabled)).toBe(false);
  });

  it("does not filter normal enter message by default, but filters when filter_enter_msg is true", () => {
    const normalEnterMsg: DanmuMsg = {
      id: "3",
      type: "interact",
      time: "12:00:02",
      sender: "ViewerA",
      content: "ViewerA 进入直播间",
      cmd: "INTERACT_WORD",
      interact_type: "enter",
    };

    expect(shouldFilterDanmuMessage(normalEnterMsg, defaultConfig)).toBe(false);

    const configEnterFiltered: AppConfig = {
      ...defaultConfig,
      filter_enter_msg: true,
    };
    expect(shouldFilterDanmuMessage(normalEnterMsg, configEnterFiltered)).toBe(true);
  });

  it("filters follow and share messages when filter_follow_share_msg is true", () => {
    const followMsg: DanmuMsg = {
      id: "4",
      type: "interact",
      time: "12:00:03",
      sender: "ViewerB",
      content: "ViewerB 关注了主播",
      cmd: "INTERACT_WORD",
      interact_type: "follow",
    };

    expect(shouldFilterDanmuMessage(followMsg, defaultConfig)).toBe(false);

    const configFollowFiltered: AppConfig = {
      ...defaultConfig,
      filter_follow_share_msg: true,
    };
    expect(shouldFilterDanmuMessage(followMsg, configFollowFiltered)).toBe(true);
  });

  it("does not filter standard danmu chat messages", () => {
    const chatMsg: DanmuMsg = {
      id: "5",
      type: "danmu",
      time: "12:00:04",
      sender: "ViewerC",
      content: "Hello streamer!",
    };

    expect(shouldFilterDanmuMessage(chatMsg, defaultConfig)).toBe(false);
  });
});
