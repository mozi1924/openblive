import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioController } from "./useStudioController";
import { defaultProfileState } from "./studio/controllerHelpers";
import type { LiveRoomProfile, Resp, User } from "../types/studio";

const { mockStudioApi } = vi.hoisted(() => ({
  mockStudioApi: {
    getSession: vi.fn(),
    getAppConfig: vi.fn(),
    getLinkageStatus: vi.fn(),
    setAppConfig: vi.fn(),
    setAppConfigs: vi.fn(),
    refreshTrayMenu: vi.fn(),
    revealMainWindow: vi.fn(),
    showDanmuOverlay: vi.fn(),
    hideDanmuOverlay: vi.fn(),
    loadSavedConfig: vi.fn(),
    getAccountList: vi.fn(),
    refreshAllAccountCookies: vi.fn(),
    refreshAllAccountProfiles: vi.fn(),
    refreshCurrentUser: vi.fn(),
    getLoginQrcode: vi.fn(),
    pollLoginStatus: vi.fn(),
    switchAccount: vi.fn(),
    logout: vi.fn(),
    getPartitions: vi.fn(),
    updateArea: vi.fn(),
    updateTitle: vi.fn(),
    syncLiveStatus: vi.fn(),
    syncLiveRoomProfile: vi.fn(),
    updateLiveTags: vi.fn(),
    startLive: vi.fn(),
    startLiveFlow: vi.fn(),
    stopLive: vi.fn(),
    stopLiveFlow: vi.fn(),
    startDanmuMonitor: vi.fn(),
    stopDanmuMonitor: vi.fn(),
    sendDanmu: vi.fn(),
    getLiveEmoticons: vi.fn(),
    renderQrcode: vi.fn(),
    pushAppLog: vi.fn(),
    getAppLogs: vi.fn(),
    clearAppLogs: vi.fn(),
    listenDanmuMessage: vi.fn(),
    listenAppLog: vi.fn(),
    listenStudioState: vi.fn(),
    listenDanmuOverlaySettings: vi.fn(),
  },
}));

vi.mock("../services/studioApi", () => ({
  studioApi: mockStudioApi,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    startDragging: vi.fn(),
  }),
}));

const ok = <T,>(data: T): Resp<T> => ({
  code: 0,
  msg: "ok",
  data,
});

const makeUser = (uid: string, uname: string, lastTitle: string): User => ({
  uid,
  uname,
  face: "",
  level: 1,
  follower: 1,
  following: 1,
  money: 0,
  bcoin: 0,
  last_title: lastTitle,
  last_area_name: ["手游", "王者荣耀"],
  last_tags: ["test"],
  live_profile_state: defaultProfileState(),
  login_invalid: false,
});

const makeProfileSyncResp = (): Resp<LiveRoomProfile> =>
  ok({
    title: "synced-title",
    parent: "手游",
    child: "王者荣耀",
    tags: ["test"],
    from_cache: false,
    profile_state: defaultProfileState(),
  });

const formEvent = (): FormEvent => ({
  preventDefault: vi.fn(),
} as unknown as FormEvent);

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();

  mockStudioApi.syncLiveStatus.mockResolvedValue(ok(null));
  mockStudioApi.getSession.mockResolvedValue(ok(null));
  mockStudioApi.getAppConfig.mockResolvedValue(
    ok({
      min_to_tray: true,
      hide_dock_on_minimize: false,
      danmu_overlay_enabled: true,
      danmu_overlay_opacity: 85,
      live_control_mode: "none",
      obs_ws_enabled: false,
      obs_ws_url: "ws://127.0.0.1:4455",
      obs_ws_password: "",
      obs_ws_auto_start_on_live: false,
      obs_ws_auto_stop_on_live_end: false,
      on_live_start_command: "",
      on_live_stop_command: "",
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
      is_win32: false,
      is_macos: false,
      has_tray: true,
    }),
  );
  mockStudioApi.getLinkageStatus.mockResolvedValue(
    ok({
      mode: "none",
      obs_ws: { connected: false, last_error: "", last_checked_at: 0, url: "" },
      command: { start_configured: false, stop_configured: false, template_preview: "" },
    }),
  );
  mockStudioApi.refreshTrayMenu.mockResolvedValue(ok({}));
  mockStudioApi.getPartitions.mockResolvedValue(ok({ 手游: ["王者荣耀", "永劫无间"] }));
  mockStudioApi.listenDanmuMessage.mockResolvedValue(() => undefined);
  mockStudioApi.listenAppLog.mockResolvedValue(() => undefined);
  mockStudioApi.listenStudioState.mockResolvedValue(() => undefined);
  mockStudioApi.listenDanmuOverlaySettings.mockResolvedValue(() => undefined);
  mockStudioApi.syncLiveRoomProfile.mockResolvedValue(makeProfileSyncResp());
  mockStudioApi.refreshAllAccountProfiles.mockResolvedValue(
    ok({ updated: 0, failed: [], expired: [] }),
  );
  mockStudioApi.startDanmuMonitor.mockResolvedValue(ok({}));
  mockStudioApi.stopDanmuMonitor.mockResolvedValue(ok({}));
  mockStudioApi.sendDanmu.mockResolvedValue(ok({}));
  mockStudioApi.getLiveEmoticons.mockResolvedValue(ok([]));
  mockStudioApi.renderQrcode.mockResolvedValue(ok({ content: "", image_src: "" }));
  mockStudioApi.pushAppLog.mockResolvedValue(ok({ line: "" }));
  mockStudioApi.getAppLogs.mockResolvedValue(ok([]));
  mockStudioApi.clearAppLogs.mockResolvedValue(ok({}));
  mockStudioApi.logout.mockResolvedValue(ok({}));
  mockStudioApi.updateArea.mockResolvedValue(ok({ area_id: 1, profile_state: defaultProfileState() }));
  mockStudioApi.updateLiveTags.mockResolvedValue(
    ok({
      tags: ["test"],
      added: [],
      removed: [],
      profile_state: defaultProfileState(),
    }),
  );
  mockStudioApi.startLive.mockResolvedValue(ok(null));
  mockStudioApi.startLiveFlow.mockResolvedValue(
    ok({
      stream_info: null,
      danmu_monitor_started: true,
      danmu_monitor_msg: "i18n.live.danmu_monitor_started",
    }),
  );
  mockStudioApi.stopLive.mockResolvedValue(ok({}));
  mockStudioApi.stopLiveFlow.mockResolvedValue(
    ok({
      live_stopped: true,
      danmu_monitor_stopped: true,
      danmu_monitor_msg: "i18n.live.danmu_monitor_stopped",
    }),
  );
  mockStudioApi.refreshCurrentUser.mockResolvedValue(ok(makeUser("1", "A", "A-old")));
  mockStudioApi.getLoginQrcode.mockResolvedValue(
    ok({ url: "", content: "", image_src: "", qrcode_key: "" }),
  );
  mockStudioApi.pollLoginStatus.mockResolvedValue({ code: 86101, msg: "pending" });
  mockStudioApi.setAppConfig.mockResolvedValue(ok({}));
  mockStudioApi.setAppConfigs.mockResolvedValue(ok({}));
  mockStudioApi.revealMainWindow.mockResolvedValue(ok({}));
  mockStudioApi.showDanmuOverlay.mockResolvedValue(ok({}));
  mockStudioApi.hideDanmuOverlay.mockResolvedValue(ok({}));
});

afterEach(() => {
  cleanup();
});

describe("useStudioController multi-account regressions", () => {
  it("persists danmu overlay settings in save payload", async () => {
    const user = makeUser("1", "A", "A-old");

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.appConfig).not.toBeNull());

    act(() => {
      result.current.actions.updateAppConfig("danmu_overlay_enabled", false);
      result.current.actions.updateAppConfig("danmu_overlay_opacity", 60);
    });

    await act(async () => {
      await result.current.actions.saveAppConfig();
    });

    expect(mockStudioApi.setAppConfigs).toHaveBeenCalledWith(
      expect.objectContaining({
        danmu_overlay_enabled: false,
        danmu_overlay_opacity: 60,
      }),
    );
  });

  it("ignores stale title submit result after account switch", async () => {
    const userA = makeUser("1", "A", "A-old");
    const userB = makeUser("2", "B", "B-old");
    const titleReq = deferred<Resp<{ profile_state: ReturnType<typeof defaultProfileState> }>>();
    let backendCurrentUid = "1";

    mockStudioApi.refreshAllAccountProfiles.mockResolvedValue({
      code: 1,
      msg: "skip",
    });
    mockStudioApi.loadSavedConfig.mockImplementation(async () =>
      ok(backendCurrentUid === "1" ? userA : userB),
    );
    mockStudioApi.getAccountList.mockImplementation(async () =>
      ok({ list: [userA, userB], current_uid: backendCurrentUid }),
    );
    mockStudioApi.switchAccount.mockImplementation(async () => {
      backendCurrentUid = "2";
      return ok(userB);
    });
    mockStudioApi.updateTitle.mockReturnValue(titleReq.promise);

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));

    act(() => {
      result.current.actions.setTitle("title-from-a");
    });

    act(() => {
      void result.current.actions.submitTitle(formEvent());
    });

    await waitFor(() => expect(mockStudioApi.updateTitle).toHaveBeenCalledTimes(1));

    await act(async () => {
      await result.current.actions.switchAccount("2");
    });
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("2"));

    titleReq.resolve(ok({ profile_state: defaultProfileState() }));
    await act(async () => {
      await flush();
    });

    expect(result.current.state.currentUser?.uid).toBe("2");
    expect(result.current.state.currentUser?.last_title).not.toBe("title-from-a");
  });

  it("hydrates current user from backend current_uid", async () => {
    const userA = makeUser("1", "A", "A-old");
    const userB = makeUser("2", "B", "B-old");
    const backendCurrentUid = "2";

    mockStudioApi.loadSavedConfig.mockImplementation(async () =>
      ok(userB),
    );
    mockStudioApi.getAccountList.mockImplementation(async () =>
      ok({ list: [userA, userB], current_uid: backendCurrentUid }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("2"));
  });

  it("clears danmu listening state and messages after switching account", async () => {
    const userA = makeUser("1", "A", "A-old");
    const userB = makeUser("2", "B", "B-old");
    let backendCurrentUid = "1";

    mockStudioApi.refreshAllAccountProfiles.mockResolvedValue({
      code: 1,
      msg: "skip",
    });
    mockStudioApi.loadSavedConfig.mockImplementation(async () =>
      ok(backendCurrentUid === "1" ? userA : userB),
    );
    mockStudioApi.getAccountList.mockImplementation(async () =>
      ok({ list: [userA, userB], current_uid: backendCurrentUid }),
    );
    mockStudioApi.switchAccount.mockImplementation(async () => {
      backendCurrentUid = "2";
      return ok(userB);
    });

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));

    await act(async () => {
      await result.current.actions.startDanmu();
    });
    expect(result.current.state.danmuListening).toBe(true);

    act(() => {
      result.current.actions.setDanmuText("hello");
    });
    await act(async () => {
      await result.current.actions.submitDanmu(formEvent());
    });
    expect(result.current.state.danmus.length).toBe(1);

    await act(async () => {
      await result.current.actions.switchAccount("2");
    });

    expect(result.current.state.currentUser?.uid).toBe("2");
    expect(result.current.state.danmuListening).toBe(false);
    expect(result.current.state.danmus).toHaveLength(0);
  });

  it("stops QR polling when login session times out", async () => {
    vi.useFakeTimers();
    try {
      mockStudioApi.getLoginQrcode.mockResolvedValue(
        ok({ url: "", content: "qr", image_src: "data:image/png;base64,abc", qrcode_key: "k1" }),
      );
      mockStudioApi.pollLoginStatus.mockResolvedValue({ code: 86101, msg: "pending" });

      const { result } = renderHook(() => useStudioController());
      await act(async () => {
        await flush();
      });

      await act(async () => {
        await result.current.actions.loadQrcode();
      });

      expect(result.current.state.qrcode).toContain("data:image/png;base64,abc");
      expect(result.current.state.qrLoginTimedOut).toBe(false);
      expect(result.current.state.qrLoginRemainingSeconds).toBeGreaterThan(0);

      await act(async () => {
        vi.advanceTimersByTime(120_500);
        await flush();
      });

      expect(result.current.state.qrcode).toBe("");
      expect(result.current.state.qrLoginTimedOut).toBe(true);
      expect(result.current.state.qrLoginRemainingSeconds).toBe(0);

      const pollCallsAtTimeout = mockStudioApi.pollLoginStatus.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(8_000);
        await flush();
      });

      expect(mockStudioApi.pollLoginStatus.mock.calls.length).toBe(pollCallsAtTimeout);
    } finally {
      vi.useRealTimers();
    }
  });
});
