import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { FormEvent } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioController } from "./useStudioController";
import { defaultProfileState } from "./studio/controllerHelpers";
import type { LiveRoomProfile, Resp, User } from "../types/studio";
import {
  clearLiveStreamInfoCache,
  readLiveStreamInfoCache,
  saveLiveStreamInfoCache,
} from "../utils/liveStreamCache";

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
    setDanmuOverlayPinned: vi.fn(),
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
    updateRoomNews: vi.fn(),
    createLiveReserve: vi.fn(),
    syncLiveStatus: vi.fn(),
    syncLiveRoomProfile: vi.fn(),
    getLiveCoverHistory: vi.fn(),
    getLiveCoverAdvice: vi.fn(),
    uploadLiveCover: vi.fn(),
    updateLiveCover: vi.fn(),
    updateLiveTags: vi.fn(),
    getLiveTags: vi.fn(),
    startLive: vi.fn(),
    startLiveFlow: vi.fn(),
    stopLive: vi.fn(),
    stopLiveFlow: vi.fn(),
    startDanmuMonitor: vi.fn(),
    stopDanmuMonitor: vi.fn(),
    getRecentDanmu: vi.fn(),
    sendDanmu: vi.fn(),
    getLiveEmoticons: vi.fn(),
    getLiveOnlineRank: vi.fn(),
    getLiveVotePanel: vi.fn(),
    getLiveVoteHistory: vi.fn(),
    createLiveVote: vi.fn(),
    terminateLiveVote: vi.fn(),
    generateHttpUserAgent: vi.fn(),
    renderQrcode: vi.fn(),
    pushAppLog: vi.fn(),
    getAppLogs: vi.fn(),
    clearAppLogs: vi.fn(),
    listenDanmuMessage: vi.fn(),
    listenDanmuAvatarResolved: vi.fn(),
    listenAppLog: vi.fn(),
    listenStudioState: vi.fn(),
    listenDanmuOverlaySettings: vi.fn(),
  },
}));

const { mockPrepareLiveCoverUpload } = vi.hoisted(() => ({
  mockPrepareLiveCoverUpload: vi.fn(),
}));

vi.mock("../services/studioApi", () => ({
  studioApi: mockStudioApi,
}));

vi.mock("../utils/coverUpload", () => ({
  prepareLiveCoverUpload: mockPrepareLiveCoverUpload,
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

const makeUser = (uid: string, uname: string, lastTitle: string): User => {
  const profileState = defaultProfileState();
  profileState.cover.submitted = "http://example.com/cover.jpg";
  profileState.cover.effective = "http://example.com/cover.jpg";
  profileState.cover.transport = "synced";
  return {
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
    last_cover: "http://example.com/cover.jpg",
    live_profile_state: profileState,
    login_invalid: false,
  };
};

const makeProfileSyncResp = (): Resp<LiveRoomProfile> =>
  ok((() => {
    const profileState = defaultProfileState();
    profileState.cover.submitted = "http://example.com/cover.jpg";
    profileState.cover.effective = "http://example.com/cover.jpg";
    profileState.cover.transport = "synced";
    return {
      title: "synced-title",
      parent: "手游",
      child: "王者荣耀",
      tags: ["test"],
      cover: "http://example.com/cover.jpg",
      from_cache: false,
      profile_state: profileState,
    };
  })());

const makeCoverProfileState = (cover: string) => {
  const profileState = defaultProfileState();
  profileState.cover.submitted = cover;
  profileState.cover.effective = cover;
  profileState.cover.transport = "synced";
  return profileState;
};

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

let studioStateListener: ((payload: { kind: string; source: string; at: number; data?: Record<string, unknown> }) => void) | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  clearLiveStreamInfoCache();
  studioStateListener = null;

  mockStudioApi.syncLiveStatus.mockResolvedValue(ok(null));
  mockStudioApi.getSession.mockResolvedValue(ok(null));
  mockStudioApi.getAppConfig.mockResolvedValue(
    ok({
      min_to_tray: true,
      hide_dock_on_minimize: false,
      danmu_overlay_enabled: true,
      danmu_overlay_opacity: 55,
      danmu_overlay_always_on_top: false,
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
  mockStudioApi.listenDanmuAvatarResolved.mockResolvedValue(() => undefined);
  mockStudioApi.listenAppLog.mockResolvedValue(() => undefined);
  mockStudioApi.listenStudioState.mockImplementation(async (handler) => {
    studioStateListener = handler;
    return () => {
      if (studioStateListener === handler) {
        studioStateListener = null;
      }
    };
  });
  mockStudioApi.listenDanmuOverlaySettings.mockResolvedValue(() => undefined);
  mockStudioApi.syncLiveRoomProfile.mockResolvedValue(makeProfileSyncResp());
  mockStudioApi.getLiveCoverHistory.mockResolvedValue(ok({ history: [] }));
  mockStudioApi.getLiveCoverAdvice.mockResolvedValue(ok(null));
  mockStudioApi.uploadLiveCover.mockResolvedValue(ok({ location: "http://example.com/uploaded.jpg" }));
  mockStudioApi.updateLiveCover.mockResolvedValue(
    ok({ cover: "http://example.com/uploaded.jpg", profile_state: defaultProfileState() }),
  );
  mockStudioApi.refreshAllAccountProfiles.mockResolvedValue(
    ok({ updated: 0, failed: [], expired: [] }),
  );
  mockStudioApi.startDanmuMonitor.mockResolvedValue(ok({}));
  mockStudioApi.stopDanmuMonitor.mockResolvedValue(ok({}));
  mockStudioApi.getRecentDanmu.mockResolvedValue(ok([]));
  mockStudioApi.sendDanmu.mockResolvedValue(ok({}));
  mockStudioApi.getLiveEmoticons.mockResolvedValue(ok([]));
  mockStudioApi.getLiveOnlineRank.mockResolvedValue(
    ok({
      online_num: 0,
      online_rank_items: [],
    }),
  );
  mockStudioApi.getLiveVotePanel.mockResolvedValue(
    ok({
      vote_info: null,
      templates: [],
    }),
  );
  mockStudioApi.getLiveVoteHistory.mockResolvedValue(
    ok({
      history: [],
    }),
  );
  mockPrepareLiveCoverUpload.mockResolvedValue({
    dataUrl: "data:image/jpeg;base64,prepared-cover",
    fileName: "cover.jpg",
    mimeType: "image/jpeg",
  });
  mockStudioApi.createLiveVote.mockResolvedValue(ok({ interaction_id: 0 }));
  mockStudioApi.terminateLiveVote.mockResolvedValue(ok({}));
  mockStudioApi.generateHttpUserAgent.mockResolvedValue(ok({ user_agent: "ua" }));
  mockStudioApi.renderQrcode.mockResolvedValue(ok({ content: "", image_src: "" }));
  mockStudioApi.pushAppLog.mockResolvedValue(ok({ line: "" }));
  mockStudioApi.getAppLogs.mockResolvedValue(ok([]));
  mockStudioApi.clearAppLogs.mockResolvedValue(ok({}));
  mockStudioApi.logout.mockResolvedValue(ok({}));
  mockStudioApi.updateArea.mockResolvedValue(ok({ area_id: 1, profile_state: defaultProfileState() }));
  mockStudioApi.getLiveTags.mockResolvedValue(
    ok({
      tags: [],
      tag_contents: [],
      profile_state: defaultProfileState(),
    }),
  );
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
  mockStudioApi.setDanmuOverlayPinned.mockResolvedValue(ok({}));
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

  it("treats login-invalid current user as unauthenticated for live control polling", async () => {
    const invalidUser = {
      ...makeUser("1", "A", "A-old"),
      login_invalid: true,
    };

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(invalidUser));
    mockStudioApi.getAccountList.mockResolvedValue(
      ok({ list: [invalidUser], current_uid: invalidUser.uid }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.login_invalid).toBe(true));
    await act(async () => {
      await flush();
    });

    expect(mockStudioApi.syncLiveStatus).not.toHaveBeenCalled();
    expect(mockStudioApi.syncLiveRoomProfile).not.toHaveBeenCalled();
    expect(mockStudioApi.getLiveEmoticons).not.toHaveBeenCalled();
    expect(mockStudioApi.getLiveVotePanel).not.toHaveBeenCalled();
    expect(mockStudioApi.getLiveVoteHistory).not.toHaveBeenCalled();
    expect(result.current.state.session).toBeNull();
  });

  it("does not request online rank before session room id is ready", async () => {
    const user = makeUser("1", "A", "A-old");
    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: user.uid }));
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "",
        csrf: "",
        live_status: 0,
        from_cache: false,
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    await act(async () => {
      await flush();
    });

    expect(mockStudioApi.getLiveOnlineRank).not.toHaveBeenCalled();
  });

  it("keeps danmu listening state while clearing messages after switching account", async () => {
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
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "1001",
        csrf: "",
        live_status: 0,
        from_cache: false,
        error_code: null,
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    act(() => {
      studioStateListener?.({
        kind: "runtime.snapshot",
        source: "test.bootstrap",
        at: Date.now(),
        data: {
          danmu_running: false,
          session: {
            uid: 1,
            room_id: "1001",
            csrf: "",
            live_status: 0,
            from_cache: false,
            error_code: null,
          },
        },
      });
    });

    await act(async () => {
      await result.current.actions.startDanmu();
    });
    expect(result.current.state.danmuListening).toBe(true);

    act(() => {
      result.current.actions.setDanmuText("hello");
    });
    await waitFor(() => expect(result.current.state.danmuText).toBe("hello"));
    await act(async () => {
      await result.current.actions.submitDanmu(formEvent());
    });
    expect(result.current.state.danmus.length).toBe(1);

    await act(async () => {
      await result.current.actions.switchAccount("2");
    });

    expect(result.current.state.currentUser?.uid).toBe("2");
    expect(result.current.state.danmuListening).toBe(true);
    expect(result.current.state.danmus).toHaveLength(0);
  });

  it("keeps danmu listening state after account switch and runtime snapshot", async () => {
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
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "1001",
        csrf: "",
        live_status: 0,
        from_cache: false,
        error_code: null,
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    act(() => {
      studioStateListener?.({
        kind: "runtime.snapshot",
        source: "test.bootstrap",
        at: Date.now(),
        data: {
          danmu_running: false,
          session: {
            uid: 1,
            room_id: "1001",
            csrf: "",
            live_status: 0,
            from_cache: false,
            error_code: null,
          },
        },
      });
    });

    await act(async () => {
      await result.current.actions.startDanmu();
    });
    expect(result.current.state.danmuListening).toBe(true);

    await act(async () => {
      await result.current.actions.switchAccount("2");
    });
    expect(result.current.state.danmuListening).toBe(true);

    act(() => {
      studioStateListener?.({
        kind: "runtime.snapshot",
        source: "command.switch_account",
        at: Date.now(),
        data: {
          danmu_running: true,
          session: {
            uid: 2,
            room_id: "2",
            csrf: "csrf",
            is_live: false,
          },
        },
      });
    });

    expect(result.current.state.danmuListening).toBe(true);
  });

  it("logs switch-account auto resume danmu result events", async () => {
    const user = makeUser("1", "A", "A-old");
    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.pushAppLog.mockRejectedValue(new Error("log unavailable"));

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));

    act(() => {
      studioStateListener?.({
        kind: "danmu.monitor",
        source: "command.switch_account.auto_start",
        at: Date.now(),
        data: {
          running: true,
          msg: "i18n.live.danmu_monitor_started",
        },
      });
    });
    await act(async () => {
      await flush();
    });
    expect(
      result.current.state.logs.some((line) => line.includes("自动恢复弹幕监听")),
    ).toBe(true);

    act(() => {
      studioStateListener?.({
        kind: "danmu.monitor",
        source: "command.switch_account.auto_start",
        at: Date.now(),
        data: {
          running: false,
          msg: "i18n.common.not_logged_in",
        },
      });
    });
    await act(async () => {
      await flush();
    });
    expect(result.current.state.logs.some((line) => line.includes("恢复失败"))).toBe(true);
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

  it("refreshes session as fallback when start live flow request throws", async () => {
    const user = makeUser("1", "A", "A-old");
    const syncedProfileState = defaultProfileState();
    syncedProfileState.title.submitted = user.last_title;
    syncedProfileState.title.effective = user.last_title;
    syncedProfileState.title.transport = "synced";
    syncedProfileState.area.submitted_parent = user.last_area_name[0];
    syncedProfileState.area.submitted_child = user.last_area_name[1];
    syncedProfileState.area.effective_parent = user.last_area_name[0];
    syncedProfileState.area.effective_child = user.last_area_name[1];
    syncedProfileState.area.transport = "synced";
    syncedProfileState.tags.submitted = [...(user.last_tags || [])];
    syncedProfileState.tags.effective = [...(user.last_tags || [])];
    syncedProfileState.tags.transport = "synced";
    syncedProfileState.cover.submitted = user.last_cover || "";
    syncedProfileState.cover.effective = user.last_cover || "";
    syncedProfileState.cover.transport = "synced";
    user.live_profile_state = syncedProfileState;

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.syncLiveRoomProfile.mockResolvedValue(
      ok({
        title: user.last_title,
        parent: user.last_area_name[0],
        child: user.last_area_name[1],
        tags: user.last_tags || [],
        cover: user.last_cover || "",
        from_cache: false,
        profile_state: syncedProfileState,
      }),
    );
    mockStudioApi.startLiveFlow.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    const syncCallsBefore = mockStudioApi.syncLiveStatus.mock.calls.length;

    let startPromise: Promise<void> | undefined;
    act(() => {
      startPromise = result.current.actions.startLive("face_retry");
    });

    await act(async () => {
      await startPromise;
      await flush();
    });

    expect(mockStudioApi.syncLiveStatus.mock.calls.length).toBeGreaterThan(syncCallsBefore);
  });

  it("hydrates stream info from local cache when startup sync reports live", async () => {
    const user = makeUser("1", "A", "A-old");
    const cachedStreamInfo = {
      rtmp1: {
        addr: "rtmp://cache-host/live",
        code: "?streamname=live_1_2&key=cache",
      },
    };

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "1001",
        csrf: "csrf",
        live_status: 1,
        from_cache: false,
      }),
    );
    saveLiveStreamInfoCache("1", cachedStreamInfo);

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    await waitFor(() => expect(result.current.state.session?.live_status).toBe(1));
    await waitFor(() => expect(result.current.state.rtmp).toEqual(cachedStreamInfo));
  });

  it("clears local stream cache when startup sync reports offline", async () => {
    const user = makeUser("1", "A", "A-old");
    const cachedStreamInfo = {
      rtmp1: {
        addr: "rtmp://cache-host/live",
        code: "?streamname=live_1_2&key=cache",
      },
    };

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "1001",
        csrf: "csrf",
        live_status: 0,
        from_cache: false,
      }),
    );
    saveLiveStreamInfoCache("1", cachedStreamInfo);

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    await waitFor(() => expect(result.current.state.session?.live_status).toBe(0));
    await waitFor(() => expect(readLiveStreamInfoCache("1")).toBeNull());
    expect(result.current.state.rtmp).toBeNull();
  });

  it("saves stream info to local cache after start live success", async () => {
    const user = makeUser("1", "A", "A-old");
    const syncedProfileState = defaultProfileState();
    syncedProfileState.title.submitted = user.last_title;
    syncedProfileState.title.effective = user.last_title;
    syncedProfileState.title.transport = "synced";
    syncedProfileState.area.submitted_parent = user.last_area_name[0];
    syncedProfileState.area.submitted_child = user.last_area_name[1];
    syncedProfileState.area.effective_parent = user.last_area_name[0];
    syncedProfileState.area.effective_child = user.last_area_name[1];
    syncedProfileState.area.transport = "synced";
    syncedProfileState.tags.submitted = [...(user.last_tags || [])];
    syncedProfileState.tags.effective = [...(user.last_tags || [])];
    syncedProfileState.tags.transport = "synced";
    syncedProfileState.cover.submitted = user.last_cover || "";
    syncedProfileState.cover.effective = user.last_cover || "";
    syncedProfileState.cover.transport = "synced";
    user.live_profile_state = syncedProfileState;
    const streamInfo = {
      rtmp1: {
        addr: "rtmp://push.example.com/live",
        code: "?streamname=live_1_2&key=abc",
      },
    };

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.syncLiveRoomProfile.mockResolvedValue(
      ok({
        title: user.last_title,
        parent: user.last_area_name[0],
        child: user.last_area_name[1],
        tags: user.last_tags || [],
        cover: user.last_cover || "",
        from_cache: false,
        profile_state: syncedProfileState,
      }),
    );
    mockStudioApi.syncLiveStatus.mockResolvedValue(
      ok({
        uid: 1,
        room_id: "1001",
        csrf: "csrf",
        live_status: 1,
        from_cache: false,
      }),
    );
    mockStudioApi.startLiveFlow.mockResolvedValue(
      ok({
        stream_info: streamInfo,
        danmu_monitor_started: true,
        danmu_monitor_msg: "i18n.live.danmu_monitor_started",
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));

    await act(async () => {
      await result.current.actions.startLive("face_retry");
      await flush();
    });

    expect(readLiveStreamInfoCache("1")).toEqual(streamInfo);
  });

  it("keeps applied history cover instead of forcing an immediate stale profile sync", async () => {
    const user = makeUser("1", "A", "A-old");
    const persistedCover = "http://example.com/history.jpg";
    const persistedCoverNormalized = "https://example.com/history.jpg";
    const persistedAsset = "data:image/png;base64,history";

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.getLiveCoverHistory.mockResolvedValue(
      ok({
        history: [
          {
            cover_url: persistedCover,
            cover_asset_url: persistedAsset,
            use_status: 0,
            cover_id: 2,
          },
        ],
      }),
    );
    mockStudioApi.updateLiveCover.mockResolvedValue(
      ok({
        cover: persistedCover,
        cover_asset_url: persistedAsset,
        profile_state: makeCoverProfileState(persistedCover),
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));
    await waitFor(() => expect(result.current.state.coverHistory).toHaveLength(1));
    const syncCallsBeforeSubmit = mockStudioApi.syncLiveRoomProfile.mock.calls.length;

    act(() => {
      result.current.actions.selectHistoryCover(persistedCover, persistedAsset);
    });

    expect(result.current.state.cover).toBe(persistedCover);
    expect(result.current.state.coverRenderSrc).toBe(persistedAsset);
    expect(result.current.state.dirtyStatus.cover).toBe(true);

    await act(async () => {
      await result.current.actions.submitCover();
    });

    expect(result.current.state.cover).toBe(persistedCoverNormalized);
    expect(result.current.state.coverRenderSrc).toBe(persistedAsset);
    expect(result.current.state.currentUser?.last_cover).toBe(persistedCoverNormalized);
    expect(result.current.state.currentUser?.last_cover_asset).toBe(persistedAsset);
    expect(result.current.state.dirtyStatus.cover).toBe(false);
    expect(mockStudioApi.syncLiveRoomProfile.mock.calls.length).toBe(syncCallsBeforeSubmit);
  });

  it("replaces upload preview data url with persisted cover after submit", async () => {
    const user = makeUser("1", "A", "A-old");
    const preparedDataUrl = "data:image/jpeg;base64,prepared-cover";
    const persistedCover = "http://example.com/uploaded.jpg";
    const persistedCoverNormalized = "https://example.com/uploaded.jpg";
    const persistedAsset = "data:image/png;base64,uploaded-asset";

    mockStudioApi.loadSavedConfig.mockResolvedValue(ok(user));
    mockStudioApi.getAccountList.mockResolvedValue(ok({ list: [user], current_uid: "1" }));
    mockStudioApi.uploadLiveCover.mockResolvedValue(ok({ location: persistedCover }));
    mockStudioApi.updateLiveCover.mockResolvedValue(
      ok({
        cover: persistedCover,
        cover_asset_url: persistedAsset,
        profile_state: makeCoverProfileState(persistedCover),
      }),
    );

    const { result } = renderHook(() => useStudioController());
    await waitFor(() => expect(result.current.state.currentUser?.uid).toBe("1"));

    const file = new File(["cover"], "cover.png", { type: "image/png" });
    await act(async () => {
      await result.current.actions.selectCoverFile(file);
    });

    expect(mockPrepareLiveCoverUpload).toHaveBeenCalledWith(file);
    expect(result.current.state.cover).toBe(preparedDataUrl);
    expect(result.current.state.coverRenderSrc).toBe(preparedDataUrl);
    expect(result.current.state.dirtyStatus.cover).toBe(true);

    await act(async () => {
      await result.current.actions.submitCover();
    });

    expect(mockStudioApi.uploadLiveCover).toHaveBeenCalledWith(
      preparedDataUrl,
      "cover.jpg",
      "image/jpeg",
    );
    expect(result.current.state.cover).toBe(persistedCoverNormalized);
    expect(result.current.state.coverRenderSrc).toBe(persistedAsset);
    expect(result.current.state.pendingCoverUpload).toBeNull();
    expect(result.current.state.dirtyStatus.cover).toBe(false);
  });
});
