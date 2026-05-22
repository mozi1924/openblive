import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  AppConfig,
  DanmuMsg,
  LinkageStatus,
  LiveBlackUserItem,
  LiveBlackUserListData,
  LiveRoomAdminItem,
  LiveRoomAdminListData,
  LiveProfileState,
  LiveSilentUserListData,
  LiveSilentUserItem,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import { writeClipboardText } from "../utils/clipboard";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../utils/i18n";
import { useWindowDrag } from "./useWindowDrag";
import {
  buildSectionStatus,
  defaultProfileState,
  normalizeProfileState,
  tagsToKey,
  unsavedLabelMap,
  type RecentArea,
} from "./studio/controllerHelpers";
import { useDanmuVoteController } from "./studio/useDanmuVoteController";
import { useStudioControllerEffects } from "./studio/useStudioControllerEffects";
import { useAccountController } from "./studio/useAccountController";
import { useLiveInteractionActions } from "./studio/useLiveInteractionActions";
import { useDanmuMessageFeed } from "./studio/useDanmuMessageFeed";

type ConfirmModalTone = "primary" | "danger";
type ConfirmModalSelectOption = {
  value: string;
  label: string;
};

type ConfirmModalState = {
  show: boolean;
  title: string;
  description: string;
  confirmText: string;
  showCancel: boolean;
  tone: ConfirmModalTone;
  selectLabel?: string;
  selectOptions?: ConfirmModalSelectOption[];
  selectValue?: string;
};
type ConfirmRequestPayload = Omit<ConfirmModalState, "show" | "showCancel">;

const MANUAL_SAVE_APP_CONFIG_KEYS = [
  "min_to_tray",
  "hide_dock_on_minimize",
  "danmu_overlay_enabled",
  "danmu_overlay_opacity",
  "danmu_overlay_always_on_top",
  "live_control_mode",
  "obs_ws_url",
  "obs_ws_password",
  "obs_ws_auto_start_on_live",
  "obs_ws_auto_stop_on_live_end",
  "on_live_start_command",
  "on_live_stop_command",
  "ws_server_enabled",
  "ws_server_listen_addr",
  "ws_server_auth_token",
  "ws_server_bypass_token_for_loopback",
  "host_www",
  "host_api",
  "host_live_api",
  "host_passport",
  "host_live_web",
  "cookie_domain",
  "danmu_host",
  "app_key",
  "app_sec",
  "http_user_agent",
  "livehime_version_override",
  "livehime_build_override",
  "live_platform",
] as const satisfies ReadonlyArray<keyof AppConfig>;

type ManualSaveConfigKey = (typeof MANUAL_SAVE_APP_CONFIG_KEYS)[number];
type AppConfigSnapshot = Pick<AppConfig, ManualSaveConfigKey>;
const LIVE_ONLINE_RANK_POLL_INTERVAL_MS = 5_000;
const APP_UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const RELEASES_PAGE_URL = "https://github.com/mozi1924/openblive/releases";

const buildAppConfigSnapshot = (config: AppConfig): AppConfigSnapshot =>
  MANUAL_SAVE_APP_CONFIG_KEYS.reduce((acc, key) => {
    (
      acc as Record<ManualSaveConfigKey, AppConfig[ManualSaveConfigKey]>
    )[key] = config[key];
    return acc;
  }, {} as AppConfigSnapshot);

export function useStudioController() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("account");
  const [showLogs, setShowLogs] = useState(false);
  const [showLiveOnlineRankPanel, setShowLiveOnlineRankPanel] = useState(false);
  const [showUserManagePanel, setShowUserManagePanel] = useState(false);
  const [userManageActiveTab, setUserManageActiveTab] = useState<
    "silent" | "blacklist" | "room_admin"
  >("silent");
  const [liveSilentUserListLoading, setLiveSilentUserListLoading] = useState(false);
  const [liveSilentUserList, setLiveSilentUserList] = useState<LiveSilentUserListData | null>(null);
  const [liveBlackUserListLoading, setLiveBlackUserListLoading] = useState(false);
  const [liveBlackUserList, setLiveBlackUserList] = useState<LiveBlackUserListData | null>(null);
  const [liveRoomAdminListLoading, setLiveRoomAdminListLoading] = useState(false);
  const [liveRoomAdminList, setLiveRoomAdminList] = useState<LiveRoomAdminListData | null>(null);

  const [qrcode, setQrcode] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
  const [qrLoginExpiresAt, setQrLoginExpiresAt] = useState<number | null>(null);
  const [qrLoginRemainingSeconds, setQrLoginRemainingSeconds] = useState(0);
  const [qrLoginTimedOut, setQrLoginTimedOut] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);

  const [title, setTitle] = useState(t("auto", "ui.ctrl.default_title"));
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [partitions, setPartitions] = useState<Record<string, string[]>>({});
  const [parent, setParent] = useState("");
  const [child, setChild] = useState("");
  const [rtmp, setRtmp] = useState<StreamInfo | null>(null);

  const [danmuText, setDanmuText] = useState("");
  const [danmuListening, setDanmuListening] = useState(false);
  const [danmuOverlayVisible, setDanmuOverlayVisible] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const [faceQr, setFaceQr] = useState("");
  const [faceQrContent, setFaceQrContent] = useState("");
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    show: false,
    title: "",
    description: "",
    confirmText: "",
    showCancel: true,
    tone: "primary",
  });
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [savedAppConfigSnapshot, setSavedAppConfigSnapshot] = useState<AppConfigSnapshot | null>(
    null,
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [linkageStatus, setLinkageStatus] = useState<LinkageStatus | null>(null);
  const [recentAreas, setRecentAreas] = useState<RecentArea[]>([]);
  const [profileState, setProfileState] = useState<LiveProfileState>(defaultProfileState);
  const [appVersion, setAppVersion] = useState("");
  const [appBundleType, setAppBundleType] = useState<string | null>(null);
  const [availableAppUpdateVersion, setAvailableAppUpdateVersion] = useState<string | null>(null);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);
  const [installingAppUpdate, setInstallingAppUpdate] = useState(false);
  const localeSetting = (appConfig?.locale || "auto") as LocaleSetting;

  const danmuEndRef = useRef<HTMLDivElement>(null);
  const sidebarDragRef = useRef<HTMLDivElement>(null);
  const headerDragRef = useRef<HTMLElement>(null);
  const loginPollBusyRef = useRef(false);
  const loginStatusCodeRef = useRef<number | null>(null);
  const qrcodeRefreshBusyRef = useRef(false);
  const qrLoginExpiresAtRef = useRef<number | null>(null);
  const qrLoginSessionNonceRef = useRef(0);
  const confirmResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const titleDirtyRef = useRef(false);
  const areaDirtyRef = useRef(false);
  const tagsDirtyRef = useRef(false);
  const activeUidRef = useRef<string | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const parentRef = useRef("");
  const childRef = useRef("");
  const syncStatusCacheHintRef = useRef("");
  const pendingLiveFlowHintSkipRef = useRef<"start" | "stop" | null>(null);
  const liveOnlineRankPollingRef = useRef(false);
  const confirmSelectValueRef = useRef("");
  const appUpdateRef = useRef<TauriUpdate | null>(null);
  const appUpdatePromptedVersionRef = useRef<string | null>(null);
  const appUpdateCheckBusyRef = useRef(false);

  const children = useMemo(() => partitions[parent] || [], [parent, partitions]);
  useWindowDrag(sidebarDragRef, headerDragRef);

  const append = useCallback((line: string) => {
    const message = line.trim();
    if (!message) {
      return;
    }
    void studioApi.pushAppLog(message).catch(() => {
      setLogs((prev) => [message, ...prev].slice(0, 300));
    });
  }, []);

  const resolveConfirm = useCallback((accepted: boolean) => {
    setConfirmModal((prev) => ({ ...prev, show: false }));
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    resolve?.(accepted);
  }, []);

  const requestConfirm = useCallback(
    (payload: ConfirmRequestPayload) =>
      new Promise<boolean>((resolve) => {
        if (confirmResolverRef.current) {
          confirmResolverRef.current(false);
        }
        const options = payload.selectOptions ?? [];
        const selectValue = payload.selectValue ?? options[0]?.value ?? "";
        confirmSelectValueRef.current = selectValue;
        confirmResolverRef.current = resolve;
        setConfirmModal({
          ...payload,
          selectValue,
          showCancel: true,
          show: true,
        });
      }),
    [],
  );

  const requestAlert = useCallback(
    (payload: ConfirmRequestPayload) =>
      new Promise<void>((resolve) => {
        if (confirmResolverRef.current) {
          confirmResolverRef.current(false);
        }
        const options = payload.selectOptions ?? [];
        const selectValue = payload.selectValue ?? options[0]?.value ?? "";
        confirmSelectValueRef.current = selectValue;
        confirmResolverRef.current = () => resolve();
        setConfirmModal({
          ...payload,
          selectValue,
          showCancel: false,
          show: true,
        });
      }),
    [],
  );

  const setConfirmSelectValue = useCallback((value: string) => {
    confirmSelectValueRef.current = value;
    setConfirmModal((prev) => ({
      ...prev,
      selectValue: value,
    }));
  }, []);

  const muteDurationOptions = useMemo<ConfirmModalSelectOption[]>(
    () => [
      { value: "10", label: t(localeSetting, "ui.danmu.user_manage.duration.10m") },
      { value: "30", label: t(localeSetting, "ui.danmu.user_manage.duration.30m") },
      { value: "60", label: t(localeSetting, "ui.danmu.user_manage.duration.1h") },
      { value: "360", label: t(localeSetting, "ui.danmu.user_manage.duration.6h") },
      { value: "0", label: t(localeSetting, "ui.danmu.user_manage.duration.session") },
      { value: "-1", label: t(localeSetting, "ui.danmu.user_manage.duration.forever") },
    ],
    [localeSetting],
  );

  const revealMainWindowForAction = useCallback(async () => {
    await studioApi.revealMainWindow().catch((error) => {
      append(
        tf(localeSetting, "ui.ctrl.reveal_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);

  const replacePendingAppUpdate = useCallback((next: TauriUpdate | null) => {
    const previous = appUpdateRef.current;
    appUpdateRef.current = next;
    if (previous && previous !== next) {
      void previous.close().catch(() => undefined);
    }
  }, []);

  const loadAppMetadata = useCallback(async () => {
    try {
      const { getVersion, getBundleType } = await import("@tauri-apps/api/app");
      const [version, bundleType] = await Promise.all([getVersion(), getBundleType()]);
      setAppVersion(version.trim());
      setAppBundleType(bundleType);
    } catch {
      setAppVersion("");
      setAppBundleType(null);
    }
  }, []);

  const checkAppUpdate = useCallback(
    async (options?: { promptOnAvailable?: boolean; silent?: boolean }) => {
      if (appUpdateCheckBusyRef.current) {
        return;
      }
      appUpdateCheckBusyRef.current = true;
      setCheckingAppUpdate(true);
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) {
          setAvailableAppUpdateVersion(null);
          appUpdatePromptedVersionRef.current = null;
          replacePendingAppUpdate(null);
          if (!options?.silent) {
            append(tf(localeSetting, "ui.project.update.none", { version: appVersion || "--" }));
          }
          return;
        }

        setAvailableAppUpdateVersion(update.version);
        replacePendingAppUpdate(update);

        if (options?.promptOnAvailable === false) {
          return;
        }
        if (appUpdatePromptedVersionRef.current === update.version) {
          return;
        }

        appUpdatePromptedVersionRef.current = update.version;
        const accepted = await requestConfirm({
          title: t(localeSetting, "ui.project.update.popup.title"),
          description: tf(localeSetting, "ui.project.update.popup.desc", {
            current: update.currentVersion,
            version: update.version,
          }),
          confirmText: t(localeSetting, "ui.project.update.popup.confirm"),
          tone: "primary",
        });
        if (accepted) {
          await revealMainWindowForAction();
          setActiveTab("project");
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.project.update.error.check", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setCheckingAppUpdate(false);
        appUpdateCheckBusyRef.current = false;
      }
    },
    [appVersion, append, localeSetting, replacePendingAppUpdate, requestConfirm, revealMainWindowForAction],
  );

  const downloadAndInstallAppUpdate = useCallback(async () => {
    if (installingAppUpdate) {
      return;
    }

    let update = appUpdateRef.current;
    if (!update) {
      await checkAppUpdate({ promptOnAvailable: false, silent: false });
      update = appUpdateRef.current;
    }
    if (!update) {
      return;
    }

    setInstallingAppUpdate(true);
    try {
      await update.downloadAndInstall();
      append(tf(localeSetting, "ui.project.update.install.done", { version: update.version }));
      setAvailableAppUpdateVersion(null);
      replacePendingAppUpdate(null);
    } catch (error) {
      append(
        tf(localeSetting, "ui.project.update.error.install", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      setInstallingAppUpdate(false);
    }
  }, [append, checkAppUpdate, installingAppUpdate, localeSetting, replacePendingAppUpdate]);

  const danmuVoteController = useDanmuVoteController({
    activeUidRef,
    localeSetting,
    append,
    requestConfirm,
  });
  const {
    state: {
      liveEmoticonPackages,
      liveEmoticonsLoading,
      liveEmoticonMap,
      liveVotePanel,
      liveVoteHistory,
      liveOnlineRankData,
      liveOnlineRankLoading,
      liveVoteLoading,
      liveVoteSubmitting,
      liveVoteTerminating,
      liveVoteQuestion,
      liveVoteOptionA,
      liveVoteOptionB,
      liveVoteDuration,
      liveVoteSelectedTemplateId,
    },
    actions: {
      setLiveVoteDuration,
      loadLiveEmoticons,
      loadLiveVoteData,
      loadLiveOnlineRank,
      applyLiveVoteTemplate,
      clearLiveVoteDraft: resetLiveVoteDraft,
      setLiveVoteQuestion: updateLiveVoteQuestion,
      setLiveVoteOptionA: updateLiveVoteOptionA,
      setLiveVoteOptionB: updateLiveVoteOptionB,
      createLiveVote,
      terminateLiveVote,
      clearLiveVoteState,
      clearDanmuAssetsAndVoteState,
      scheduleLiveVoteSync,
      clearLiveVoteSyncTimer,
    },
  } = danmuVoteController;

  const dirtyStatus = useMemo(
    () => ({
      title: title.trim() !== profileState.title.submitted.trim(),
      area:
        parent !== profileState.area.submitted_parent ||
        child !== profileState.area.submitted_child,
      tags: tagsToKey(tags) !== tagsToKey(profileState.tags.submitted),
    }),
    [child, parent, profileState, tags, title],
  );

  const hasUnsavedChanges = useMemo(() => {
    return dirtyStatus.title || dirtyStatus.area || dirtyStatus.tags;
  }, [dirtyStatus]);

  const unsavedItems = useMemo(() => {
    const items: Array<(typeof unsavedLabelMap)[keyof typeof unsavedLabelMap]> = [];
    if (dirtyStatus.title) {
      items.push(unsavedLabelMap.title);
    }
    if (dirtyStatus.area) {
      items.push(unsavedLabelMap.area);
    }
    if (dirtyStatus.tags) {
      items.push(unsavedLabelMap.tags);
    }
    return items.map((key) => t(localeSetting, key));
  }, [dirtyStatus, localeSetting]);

  const sectionStatus = useMemo(
    () => ({
      title: buildSectionStatus(localeSetting, "title", dirtyStatus.title, profileState),
      area: buildSectionStatus(localeSetting, "area", dirtyStatus.area, profileState),
      tags: buildSectionStatus(localeSetting, "tags", dirtyStatus.tags, profileState),
    }),
    [dirtyStatus, localeSetting, profileState],
  );

  const hasAttentionStatus = useMemo(
    () =>
      sectionStatus.title.tone !== "green" ||
      sectionStatus.area.tone !== "green" ||
      sectionStatus.tags.tone !== "green",
    [sectionStatus],
  );

  const hasPendingConfigChanges = useMemo(() => {
    if (!appConfig || !savedAppConfigSnapshot) {
      return false;
    }
    return MANUAL_SAVE_APP_CONFIG_KEYS.some(
      (key) => appConfig[key] !== savedAppConfigSnapshot[key],
    );
  }, [appConfig, savedAppConfigSnapshot]);
  const hasLiveAuth = Boolean(currentUser?.uid?.trim() && !currentUser?.login_invalid);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    parentRef.current = parent;
    childRef.current = child;
  }, [child, parent]);

  useEffect(() => {
    if (activeTab !== "danmu") {
      setShowLiveOnlineRankPanel(false);
      setShowUserManagePanel(false);
    }
  }, [activeTab]);

  useEffect(() => {
    void loadAppMetadata();
  }, [loadAppMetadata]);

  useEffect(() => {
    void checkAppUpdate({ promptOnAvailable: true, silent: true });
    const timer = window.setInterval(() => {
      void checkAppUpdate({ promptOnAvailable: true, silent: true });
    }, APP_UPDATE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      replacePendingAppUpdate(null);
    };
  }, [checkAppUpdate, replacePendingAppUpdate]);

  useEffect(() => {
    if (activeTab !== "danmu" || !showLiveOnlineRankPanel || !hasLiveAuth) {
      return;
    }

    let alive = true;
    const refresh = async () => {
      if (!alive || liveOnlineRankPollingRef.current) {
        return;
      }
      liveOnlineRankPollingRef.current = true;
      try {
        await loadLiveOnlineRank({ silent: true });
      } finally {
        liveOnlineRankPollingRef.current = false;
      }
    };

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, LIVE_ONLINE_RANK_POLL_INTERVAL_MS);

    return () => {
      alive = false;
      window.clearInterval(timer);
      liveOnlineRankPollingRef.current = false;
    };
  }, [activeTab, hasLiveAuth, loadLiveOnlineRank, showLiveOnlineRankPanel]);

  const syncTrayMenu = useCallback(async () => {
    await studioApi.refreshTrayMenu().catch(() => undefined);
  }, []);

  const loadAppConfig = useCallback(async () => {
    const res = await studioApi.getAppConfig();
    if (res.code === 0 && res.data) {
      setAppConfig(res.data);
      setSavedAppConfigSnapshot(buildAppConfigSnapshot(res.data));
      setDanmuOverlayVisible(Boolean(res.data.danmu_overlay_enabled));
    }
  }, []);

  const loadLinkageStatus = useCallback(async () => {
    const res = await studioApi.getLinkageStatus();
    if (res.code === 0 && res.data) {
      setLinkageStatus(res.data);
    }
  }, []);

  const applyProfileState = useCallback((nextState?: LiveProfileState | null) => {
    const normalized = normalizeProfileState(nextState);
    setProfileState(normalized);
  }, []);

  const applyUserDraftValues = useCallback(
    (
      user: User,
      options?: {
        forceTitle?: boolean;
        forceArea?: boolean;
        forceTags?: boolean;
      },
    ) => {
      const forceTitle = options?.forceTitle ?? false;
      const forceArea = options?.forceArea ?? false;
      const forceTags = options?.forceTags ?? false;

      if (forceTitle || !titleDirtyRef.current) {
        setTitle(user.last_title || "");
      }
      if (
        (forceArea || !areaDirtyRef.current) &&
        user.last_area_name.length >= 2
      ) {
        setParent(user.last_area_name[0] || "");
        setChild(user.last_area_name[1] || "");
      }
      if (forceTags || !tagsDirtyRef.current) {
        setTags([...(user.last_tags || [])]);
        setTagInput("");
      }
    },
    [],
  );

  const updateAppConfig = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      setAppConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const generateHttpUserAgent = useCallback(async () => {
    try {
      const res = await studioApi.generateHttpUserAgent();
      const userAgent = res.data?.user_agent?.trim() || "";
      if (res.code === 0 && userAgent) {
        updateAppConfig("http_user_agent", userAgent);
        append(t(localeSetting, "ui.settings.advanced.http_user_agent.generated"));
        return;
      }
      append(
        tf(localeSetting, "ui.settings.advanced.http_user_agent.generate_failed", {
          msg: resolveBackendMessage(res.msg || "empty user-agent", localeSetting),
        }),
      );
    } catch (error) {
      append(
        tf(localeSetting, "ui.settings.advanced.http_user_agent.generate_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    }
  }, [append, localeSetting, updateAppConfig]);

  const updateLocaleConfig = useCallback(
    async (nextLocale: AppConfig["locale"]) => {
      if (!appConfig) {
        return;
      }
      const prevLocale = appConfig.locale;
      setAppConfig((prev) => (prev ? { ...prev, locale: nextLocale } : prev));
      setSavingLocale(true);
      try {
        await studioApi.setAppConfig("locale", nextLocale);
        await loadAppConfig();
        await syncTrayMenu();
      } catch (error) {
        setAppConfig((prev) => (prev ? { ...prev, locale: prevLocale } : prev));
        append(
          `${t(prevLocale, "ui.settings.save.failed")}: ${resolveBackendMessage(
            String(error),
            prevLocale,
          )}`,
        );
      } finally {
        setSavingLocale(false);
      }
    },
    [appConfig, append, loadAppConfig, syncTrayMenu],
  );

  const showDanmuOverlay = useCallback(async () => {
    await studioApi.showDanmuOverlay().then(() => {
      setDanmuOverlayVisible(true);
    }).catch((error) => {
      append(
        tf(localeSetting, "ui.settings.overlay.action_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);

  const hideDanmuOverlay = useCallback(async () => {
    await studioApi.hideDanmuOverlay().then(() => {
      setDanmuOverlayVisible(false);
    }).catch((error) => {
      append(
        tf(localeSetting, "ui.settings.overlay.action_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);

  const openReleasePage = useCallback(async () => {
    try {
      await openUrl(RELEASES_PAGE_URL);
    } catch {
      window.open(RELEASES_PAGE_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  const runPlatformUpdateAction = useCallback(async () => {
    if (!availableAppUpdateVersion) {
      await checkAppUpdate({ promptOnAvailable: false, silent: false });
      return;
    }

    if (appBundleType === "deb" || appBundleType === "rpm") {
      await requestAlert({
        title: t(localeSetting, "ui.project.update.pkg.title"),
        description: t(localeSetting, "ui.project.update.pkg.desc"),
        confirmText: t(localeSetting, "ui.project.update.pkg.confirm"),
        tone: "primary",
      });
      return;
    }

    if (appBundleType === "app") {
      await openReleasePage();
      append(t(localeSetting, "ui.project.update.dmg.opened"));
      return;
    }

    await downloadAndInstallAppUpdate();
  }, [
    appBundleType,
    append,
    availableAppUpdateVersion,
    checkAppUpdate,
    downloadAndInstallAppUpdate,
    localeSetting,
    openReleasePage,
    requestAlert,
  ]);

  const saveAppConfig = useCallback(async () => {
    if (!appConfig) {
      return;
    }
    setSavingConfig(true);
    try {
      const values = MANUAL_SAVE_APP_CONFIG_KEYS.reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = appConfig[key];
        return acc;
      }, {});
      await studioApi.setAppConfigs(values);
      append(t(localeSetting, "ui.settings.save.done"));
      await loadAppConfig();
      await loadLinkageStatus();
      await syncTrayMenu();
    } catch (error) {
      append(
        `${t(localeSetting, "ui.settings.save.failed")}: ${resolveBackendMessage(
          String(error),
          localeSetting,
        )}`,
      );
    } finally {
      setSavingConfig(false);
    }
  }, [appConfig, append, loadAppConfig, loadLinkageStatus, syncTrayMenu]);

  const refreshSession = useCallback(async () => {
    const res = await studioApi
      .syncLiveStatus()
      .catch(() => studioApi.getSession());
    const nextSession = res.data || null;
    setSession(nextSession);
    const liveStatus = nextSession?.live_status ?? (nextSession?.is_live ? 1 : 0);
    if (liveStatus !== 1) {
      setRtmp(null);
    }
    if (nextSession?.from_cache) {
      const errorCode = nextSession.error_code || "SYNC_FAILED";
      if (syncStatusCacheHintRef.current !== errorCode) {
        append(tf(localeSetting, "ui.ctrl.sync_status_cache_hint", { code: errorCode }));
        syncStatusCacheHintRef.current = errorCode;
      }
    } else {
      syncStatusCacheHintRef.current = "";
    }
    await syncTrayMenu();
  }, [append, localeSetting, syncTrayMenu]);

  const handleRealtimeDanmuMessage = useCallback(
    (message: DanmuMsg) => {
      if (message.cmd === "DM_INTERACTION" && message.interaction_event_type === 101) {
        scheduleLiveVoteSync();
      }
      append(tf(localeSetting, "ui.ctrl.danmu_event", { cmd: message.type.toUpperCase() }));
    },
    [append, localeSetting, scheduleLiveVoteSync],
  );

  const { danmus, setDanmus } = useDanmuMessageFeed({
    localeSetting,
    liveEmoticonMap,
    currentUserUid: hasLiveAuth ? currentUser?.uid : undefined,
    onRealtimeMessage: handleRealtimeDanmuMessage,
  });

  const accountController = useAccountController({
    localeSetting,
    append,
    qrcode,
    qrcodeKey,
    activeUidRef,
    currentUserRef,
    titleDirtyRef,
    areaDirtyRef,
    tagsDirtyRef,
    loginPollBusyRef,
    loginStatusCodeRef,
    qrcodeRefreshBusyRef,
    qrLoginExpiresAtRef,
    qrLoginSessionNonceRef,
    setQrLoginExpiresAt,
    setQrLoginRemainingSeconds,
    setQrcode,
    setQrcodeKey,
    setQrLoginTimedOut,
    setCurrentUser,
    setDanmuListening,
    setDanmus,
    setTitle,
    setParent,
    setChild,
    setTags,
    setTagInput,
    setRecentAreas,
    setAccounts,
    setShowFaceModal,
    applyProfileState,
    applyUserDraftValues,
    clearDanmuAssetsAndVoteState,
    refreshSession,
    syncTrayMenu,
    requestConfirm,
  });
  const {
    actions: {
      cancelQrcodeLogin,
      loadSavedUser,
      loadAccounts,
      refreshCurrentUser,
      syncLiveRoomProfile,
      loadQrcode,
      pollLogin,
      switchAccount,
      logout,
      requestLogout,
    },
  } = accountController;

  const loadPartitions = useCallback(async () => {
    const res = await studioApi.getPartitions();
    if (res.code !== 0 || !res.data) {
      return;
    }

    setPartitions(res.data);
    const keys = Object.keys(res.data);
    if (keys.length > 0) {
      const latestParent = parentRef.current;
      const latestChild = childRef.current;

      if (!latestParent) {
        setParent(keys[0]);
        setChild((res.data[keys[0]] || [])[0] || "");
      } else if (!Object.prototype.hasOwnProperty.call(res.data, latestParent)) {
        setParent(keys[0]);
        setChild((res.data[keys[0]] || [])[0] || "");
      } else {
        const childrenForParent = res.data[latestParent] || [];
        if (!latestChild || !childrenForParent.includes(latestChild)) {
          setChild(childrenForParent[0] || "");
        }
      }
    }
    append(t(localeSetting, "ui.ctrl.partitions_synced"));
  }, [append, localeSetting]);

  const refreshSilentUserList = useCallback(
    async (options?: { silent?: boolean; page?: number }) => {
      const page = Math.max(options?.page ?? liveSilentUserList?.page ?? 1, 1);
      setLiveSilentUserListLoading(true);
      try {
        const res = await studioApi.getSilentUserList(page);
        if (res.code === 0 && res.data) {
          setLiveSilentUserList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_silent_user_list_load_failed", {
              msg: resolveBackendMessage(res.msg, localeSetting),
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_silent_user_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveSilentUserListLoading(false);
      }
    },
    [append, liveSilentUserList?.page, localeSetting],
  );

  const refreshBlackUserList = useCallback(
    async (options?: { silent?: boolean; page?: number; pageSize?: number }) => {
      const page = Math.max(options?.page ?? liveBlackUserList?.page ?? 1, 1);
      const pageSize = Math.max(options?.pageSize ?? liveBlackUserList?.page_size ?? 50, 1);
      setLiveBlackUserListLoading(true);
      try {
        const res = await studioApi.getBlackUserList(page, pageSize);
        if (res.code === 0 && res.data) {
          setLiveBlackUserList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_black_user_list_load_failed", {
              msg: resolveBackendMessage(res.msg, localeSetting),
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_black_user_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveBlackUserListLoading(false);
      }
    },
    [append, liveBlackUserList?.page, liveBlackUserList?.page_size, localeSetting],
  );

  const refreshRoomAdminList = useCallback(
    async (options?: { silent?: boolean; page?: number }) => {
      const page = Math.max(options?.page ?? liveRoomAdminList?.page ?? 1, 1);
      setLiveRoomAdminListLoading(true);
      try {
        const res = await studioApi.getRoomAdminList(page);
        if (res.code === 0 && res.data) {
          setLiveRoomAdminList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_room_admin_list_load_failed", {
              msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_room_admin_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveRoomAdminListLoading(false);
      }
    },
    [append, liveRoomAdminList?.page, localeSetting],
  );

  const requestMuteUserByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUser?.uid ? Number(currentUser.uid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_silent_user_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.silent.title", { name: senderName }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.silent.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.silent.confirm"),
        tone: "danger",
        selectLabel: t(localeSetting, "ui.danmu.user_manage.confirm.silent.duration"),
        selectOptions: muteDurationOptions,
        selectValue: "-1",
      });
      if (!accepted) {
        return;
      }

      const duration = Number.parseInt(confirmSelectValueRef.current || "-1", 10);
      const muteHours = Number.isFinite(duration) ? duration : -1;
      const res = await studioApi.addSilentUser(
        senderUid,
        muteHours,
        resolveBackendMessage(message.content, localeSetting).trim() || undefined,
      );
      if (res.code === 0) {
        const durationLabel =
          muteDurationOptions.find((option) => option.value === String(muteHours))?.label ||
          String(muteHours);
        append(
          tf(localeSetting, "ui.ctrl.live_silent_user_added", {
            name: senderName,
            duration: durationLabel,
          }),
        );
        if (showUserManagePanel) {
          void refreshSilentUserList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_silent_user_add_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [
      append,
      currentUser?.uid,
      localeSetting,
      muteDurationOptions,
      refreshSilentUserList,
      requestConfirm,
      showUserManagePanel,
    ],
  );

  const requestBlackUserByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUser?.uid ? Number(currentUser.uid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_black_user_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.black.title", { name: senderName }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.black.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.black.confirm"),
        tone: "danger",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.addBlackUser(senderUid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_black_user_added", { name: senderName }));
        if (showUserManagePanel) {
          void refreshBlackUserList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_black_user_add_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [
      append,
      currentUser?.uid,
      localeSetting,
      refreshBlackUserList,
      requestConfirm,
      showUserManagePanel,
    ],
  );

  const requestRoomAdminByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUser?.uid ? Number(currentUser.uid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_room_admin_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.room_admin.title", {
          name: senderName,
        }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.room_admin.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.room_admin.confirm"),
        tone: "danger",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.addRoomAdmin(senderUid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_room_admin_added", { name: senderName }));
        if (showUserManagePanel) {
          void refreshRoomAdminList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_room_admin_add_failed", {
          msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
        }),
      );
    },
    [
      append,
      currentUser?.uid,
      localeSetting,
      refreshRoomAdminList,
      requestConfirm,
      showUserManagePanel,
    ],
  );

  const requestRemoveSilentUser = useCallback(
    async (item: LiveSilentUserItem) => {
      const name = item.tname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unsilent.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unsilent.desc", {
          name,
          uid: item.tuid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unsilent.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeSilentUser(item.id);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_silent_user_removed", { name }));
        await refreshSilentUserList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_silent_user_remove_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [append, localeSetting, refreshSilentUserList, requestConfirm],
  );

  const requestRemoveBlackUser = useCallback(
    async (item: LiveBlackUserItem) => {
      const name = item.uname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unblack.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unblack.desc", {
          name,
          uid: item.mid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unblack.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeBlackUser(item.mid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_black_user_removed", { name }));
        await refreshBlackUserList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_black_user_remove_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [append, localeSetting, refreshBlackUserList, requestConfirm],
  );

  const requestRemoveRoomAdmin = useCallback(
    async (item: LiveRoomAdminItem) => {
      const name = item.uname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.desc", {
          name,
          uid: item.uid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeRoomAdmin(item.uid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_room_admin_removed", { name }));
        await refreshRoomAdminList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_room_admin_remove_failed", {
          msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
        }),
      );
    },
    [append, localeSetting, refreshRoomAdminList, requestConfirm],
  );

  const changeRoomAdminPage = useCallback(
    (page: number) => {
      void refreshRoomAdminList({ page, silent: true });
    },
    [refreshRoomAdminList],
  );

  const changeSilentUserPage = useCallback(
    (page: number) => {
      void refreshSilentUserList({ page, silent: true });
    },
    [refreshSilentUserList],
  );

  const changeBlackUserPage = useCallback(
    (page: number) => {
      void refreshBlackUserList({ page, silent: true });
    },
    [refreshBlackUserList],
  );

  const changeUserManageTab = useCallback(
    (tab: "silent" | "blacklist" | "room_admin") => {
      setUserManageActiveTab(tab);
      if (tab === "silent") {
        void refreshSilentUserList({ silent: true });
      } else if (tab === "blacklist") {
        void refreshBlackUserList({ silent: true });
      } else {
        void refreshRoomAdminList({ silent: true });
      }
    },
    [refreshBlackUserList, refreshRoomAdminList, refreshSilentUserList],
  );

  const liveInteractionActions = useLiveInteractionActions({
    localeSetting,
    append,
    activeUidRef,
    requestConfirm,
    requestAlert,
    revealMainWindowForAction,
    hasUnsavedChanges,
    unsavedItems,
    partitions,
    danmuText,
    currentUser,
    liveEmoticonMap,
    setActiveTab,
    setShowFaceModal,
    setFaceQr,
    setFaceQrContent,
    setRtmp,
    setRecentAreas,
    setDanmuListening,
    setDanmus,
    setDanmuText,
    setParent,
    setChild,
    setTags,
    setTagInput,
    setProfileState,
    setCurrentUser,
    parent,
    child,
    title,
    tags,
    tagInput,
    applyProfileState,
    refreshSession,
    loadLinkageStatus,
    pendingLiveFlowHintSkipRef,
    areaDirtyRef,
  });
  const {
    actions: {
      submitArea,
      submitTitle,
      submitTags,
      addTag,
      removeTag,
      startLive,
      applyRecentArea,
      stopLive,
      startDanmu,
      stopDanmu,
      submitDanmu,
    },
  } = liveInteractionActions;

  const copyToClipboard = useCallback(
    async (text: string, type: string) => {
      try {
        await writeClipboardText(text);
        setCopiedKey(type);
        window.setTimeout(() => setCopiedKey(null), 2000);
      } catch {
        append(t(localeSetting, "ui.ctrl.copy_failed"));
      }
    },
    [append, localeSetting],
  );

  const changeParent = useCallback(
    (newParent: string) => {
      areaDirtyRef.current = true;
      setParent(newParent);
      const subList = partitions[newParent] || [];
      setChild(subList[0] || "");
    },
    [partitions],
  );

  const changeChild = useCallback((newChild: string) => {
    areaDirtyRef.current = true;
    setChild(newChild);
  }, []);

  useStudioControllerEffects({
    title,
    parent,
    child,
    tags,
    profileState,
    titleDirtyRef,
    areaDirtyRef,
    tagsDirtyRef,
    confirmResolverRef,
    danmuEndRef,
    danmus,
    refreshSession,
    loadSavedUser,
    loadAccounts,
    loadPartitions,
    loadAppConfig,
    loadLinkageStatus,
    currentUserUid: hasLiveAuth ? currentUser?.uid : undefined,
    hasLiveAuth,
    clearDanmuAssetsAndVoteState,
    syncLiveRoomProfile,
    loadLiveEmoticons,
    clearLiveVoteState,
    loadLiveVoteData,
    loadLiveOnlineRank,
    qrcodeKey,
    qrLoginExpiresAt,
    setQrLoginRemainingSeconds,
    cancelQrcodeLogin,
    pollLogin,
    localeSetting,
    append,
    clearLiveVoteSyncTimer,
    setSession,
    setRtmp,
    setDanmuListening,
    syncTrayMenu,
    pendingLiveFlowHintSkipRef,
    setDanmuOverlayVisible,
    setLogs,
  });

  return {
    state: {
      accounts,
      activeTab,
      appConfig,
      appVersion,
      appBundleType,
      availableAppUpdateVersion,
      checkingAppUpdate,
      child,
      children,
      copiedKey,
      confirmModalConfirmText: confirmModal.confirmText,
      confirmModalDescription: confirmModal.description,
      confirmModalSelectLabel: confirmModal.selectLabel,
      confirmModalSelectOptions: confirmModal.selectOptions,
      confirmModalSelectValue: confirmModal.selectValue,
      confirmModalShowCancel: confirmModal.showCancel,
      confirmModalTitle: confirmModal.title,
      confirmModalTone: confirmModal.tone,
      currentUser,
      danmuListening,
      danmuOverlayVisible,
      danmuText,
      danmus,
      liveEmoticonPackages,
      liveEmoticonsLoading,
      liveVotePanel,
      liveVoteHistory,
      liveOnlineRankData,
      liveOnlineRankLoading,
      liveSilentUserList,
      liveSilentUserListLoading,
      liveBlackUserList,
      liveBlackUserListLoading,
      liveRoomAdminList,
      liveRoomAdminListLoading,
      liveVoteLoading,
      liveVoteSubmitting,
      liveVoteTerminating,
      liveVoteQuestion,
      liveVoteOptionA,
      liveVoteOptionB,
      liveVoteDuration,
      liveVoteSelectedTemplateId,
      faceQr,
      faceQrContent,
      logs,
      linkageStatus,
      recentAreas,
      hasUnsavedChanges,
      hasAttentionStatus,
      profileState,
      sectionStatus,
      dirtyStatus,
      hasPendingConfigChanges,
      unsavedItems,
      parent,
      partitions,
      qrcode,
      qrLoginRemainingSeconds,
      qrLoginTimedOut,
      rtmp,
      session,
      showLiveOnlineRankPanel,
      showUserManagePanel,
      showConfirmModal: confirmModal.show,
      showFaceModal,
      showLogs,
      installingAppUpdate,
      savingConfig,
      savingLocale,
      tagInput,
      tags,
      title,
      userManageActiveTab,
    },
    actions: {
      changeParent,
      clearDanmus: () => setDanmus([]),
      clearLogs: async () => {
        await studioApi.clearAppLogs().catch(() => undefined);
        setLogs([]);
      },
      cancelConfirmAction: () => resolveConfirm(false),
      closeFaceModal: () => setShowFaceModal(false),
      closeLogs: () => setShowLogs(false),
      confirmAction: () => resolveConfirm(true),
      copyToClipboard,
      loadAccounts,
      loadPartitions,
      loadQrcode,
      cancelQrcodeLogin,
      logout,
      requestLogout,
      pollLogin,
      refreshCurrentUser,
      retryStartLive: async () => {
        setShowFaceModal(false);
        await startLive("face_retry");
      },
      toggleLiveOnlineRankPanel: () => {
        setShowLiveOnlineRankPanel((prev) => !prev);
        setShowUserManagePanel(false);
      },
      toggleUserManagePanel: () => {
        setShowUserManagePanel((prev) => {
          const next = !prev;
          if (next) {
            changeUserManageTab("silent");
          }
          return next;
        });
        setShowLiveOnlineRankPanel(false);
      },
      closeLiveOnlineRankPanel: () => setShowLiveOnlineRankPanel(false),
      closeUserManagePanel: () => setShowUserManagePanel(false),
      setActiveTab,
      setChild: changeChild,
      setDanmuText,
      setConfirmSelectValue,
      setLiveVoteDuration,
      setUserManageActiveTab: changeUserManageTab,
      updateAppConfig,
      generateHttpUserAgent,
      updateLocaleConfig,
      saveAppConfig,
      showDanmuOverlay,
      hideDanmuOverlay,
      setTagInput,
      setTitle,
      addTag,
      removeTag,
      refreshLiveVoteData: () => loadLiveVoteData(),
      refreshLiveOnlineRank: () => loadLiveOnlineRank(),
      refreshSilentUserList: () => refreshSilentUserList(),
      refreshBlackUserList: () => refreshBlackUserList(),
      refreshRoomAdminList: () => refreshRoomAdminList(),
      changeSilentUserPage,
      changeBlackUserPage,
      changeRoomAdminPage,
      applyLiveVoteTemplate,
      clearLiveVoteDraft: resetLiveVoteDraft,
      checkAppUpdate: () => checkAppUpdate({ promptOnAvailable: true, silent: false }),
      downloadAndInstallAppUpdate,
      runPlatformUpdateAction,
      setLiveVoteQuestion: updateLiveVoteQuestion,
      setLiveVoteOptionA: updateLiveVoteOptionA,
      setLiveVoteOptionB: updateLiveVoteOptionB,
      createLiveVote,
      terminateLiveVote,
      startDanmu,
      startLive,
      applyRecentArea,
      stopDanmu,
      stopLive,
      submitArea,
      submitDanmu,
      submitTags,
      submitTitle,
      requestMuteUserByDanmu,
      requestBlackUserByDanmu,
      requestRoomAdminByDanmu,
      requestRemoveSilentUser,
      requestRemoveBlackUser,
      requestRemoveRoomAdmin,
      switchAccount,
      syncLiveRoomProfile: async () => syncLiveRoomProfile(true),
      toggleLogs: () => setShowLogs((prev) => !prev),
    },
    refs: {
      danmuEndRef,
      headerDragRef,
      sidebarDragRef,
    },
  };
}
