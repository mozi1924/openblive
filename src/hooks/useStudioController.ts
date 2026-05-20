import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  AppConfig,
  DanmuMsg,
  LinkageStatus,
  LiveEmoticonPackage,
  LiveVoteInfo,
  LiveVotePanelData,
  LiveProfileState,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import {
  createLiveEmoticonIndex,
  createSelfDanmuMessage,
} from "../utils/danmu";
import { writeClipboardText } from "../utils/clipboard";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../utils/i18n";
import { useWindowDrag } from "./useWindowDrag";
import { applyIncomingRealtimeMessage } from "./studio/realtimeDanmu";
import {
  buildSectionStatus,
  defaultProfileState,
  isValidUser,
  normalizeProfileState,
  normalizeTags,
  splitTagInput,
  StartLiveSource,
  tagsToKey,
  unsavedLabelMap,
  type RecentArea,
} from "./studio/controllerHelpers";
import {
  DEFAULT_LIVE_VOTE_DURATION,
  isLiveVoteActive,
  normalizeLiveVoteHistory,
  normalizeLiveVotePanelData,
} from "./studio/liveVoteUtils";

type ConfirmModalTone = "primary" | "danger";

type ConfirmModalState = {
  show: boolean;
  title: string;
  description: string;
  confirmText: string;
  showCancel: boolean;
  tone: ConfirmModalTone;
};

const QR_LOGIN_TIMEOUT_MS = 2 * 60 * 1000;
const QR_LOGIN_POLL_INTERVAL_MS = 2000;
const LIVE_VOTE_SYNC_DEBOUNCE_MS = 800;

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
  const [danmus, setDanmus] = useState<DanmuMsg[]>([]);
  const [liveEmoticonPackages, setLiveEmoticonPackages] = useState<LiveEmoticonPackage[]>([]);
  const [liveEmoticonsLoading, setLiveEmoticonsLoading] = useState(false);
  const [liveVotePanel, setLiveVotePanel] = useState<LiveVotePanelData | null>(null);
  const [liveVoteHistory, setLiveVoteHistory] = useState<LiveVoteInfo[]>([]);
  const [liveVoteLoading, setLiveVoteLoading] = useState(false);
  const [liveVoteSubmitting, setLiveVoteSubmitting] = useState(false);
  const [liveVoteTerminating, setLiveVoteTerminating] = useState(false);
  const [liveVoteQuestion, setLiveVoteQuestion] = useState("");
  const [liveVoteOptionA, setLiveVoteOptionA] = useState("");
  const [liveVoteOptionB, setLiveVoteOptionB] = useState("");
  const [liveVoteDuration, setLiveVoteDuration] = useState(DEFAULT_LIVE_VOTE_DURATION);
  const [liveVoteSelectedTemplateId, setLiveVoteSelectedTemplateId] = useState<number | null>(
    null,
  );
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
  const liveVoteSyncTimerRef = useRef<number | null>(null);

  const children = useMemo(() => partitions[parent] || [], [parent, partitions]);
  const liveEmoticonMap = useMemo(
    () => createLiveEmoticonIndex(liveEmoticonPackages),
    [liveEmoticonPackages],
  );

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
    (payload: Omit<ConfirmModalState, "show" | "showCancel">) =>
      new Promise<boolean>((resolve) => {
        if (confirmResolverRef.current) {
          confirmResolverRef.current(false);
        }
        confirmResolverRef.current = resolve;
        setConfirmModal({
          ...payload,
          showCancel: true,
          show: true,
        });
      }),
    [],
  );

  const requestAlert = useCallback(
    (payload: Omit<ConfirmModalState, "show" | "showCancel">) =>
      new Promise<void>((resolve) => {
        if (confirmResolverRef.current) {
          confirmResolverRef.current(false);
        }
        confirmResolverRef.current = () => resolve();
        setConfirmModal({
          ...payload,
          showCancel: false,
          show: true,
        });
      }),
    [],
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

  const resetLiveVoteDraft = useCallback(() => {
    setLiveVoteSelectedTemplateId(null);
    setLiveVoteQuestion("");
    setLiveVoteOptionA("");
    setLiveVoteOptionB("");
    setLiveVoteDuration(DEFAULT_LIVE_VOTE_DURATION);
  }, []);

  const clearLiveVoteState = useCallback(() => {
    setLiveVotePanel(null);
    setLiveVoteHistory([]);
    setLiveVoteLoading(false);
    setLiveVoteSubmitting(false);
    setLiveVoteTerminating(false);
    resetLiveVoteDraft();
  }, [resetLiveVoteDraft]);

  const resetQrLoginState = useCallback(() => {
    qrLoginSessionNonceRef.current += 1;
    qrLoginExpiresAtRef.current = null;
    setQrLoginExpiresAt(null);
    setQrLoginRemainingSeconds(0);
    setQrcode("");
    setQrcodeKey("");
    loginStatusCodeRef.current = null;
  }, []);

  const cancelQrcodeLogin = useCallback(
    (reason: "timeout" | "manual" = "manual") => {
      if (!qrcodeKey && !qrcode) {
        return;
      }
      resetQrLoginState();
      setQrLoginTimedOut(reason === "timeout");
      if (reason === "timeout") {
        append(t(localeSetting, "ui.ctrl.qr_login_timeout"));
      }
    },
    [append, localeSetting, qrcode, qrcodeKey, resetQrLoginState],
  );

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

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    parentRef.current = parent;
    childRef.current = child;
  }, [child, parent]);

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

  const loadSavedUser = useCallback(async () => {
    const res = await studioApi.loadSavedConfig();
    const user = isValidUser(res.data) ? res.data : null;

    if (!user) {
      setCurrentUser(null);
      setLiveEmoticonPackages([]);
      setLiveEmoticonsLoading(false);
      applyProfileState(defaultProfileState());
      activeUidRef.current = null;
      setDanmuListening(false);
      titleDirtyRef.current = false;
      areaDirtyRef.current = false;
      tagsDirtyRef.current = false;
      setTitle(t(localeSetting, "ui.ctrl.default_title"));
      setParent("");
      setChild("");
      setTags([]);
      setTagInput("");
      setRecentAreas([]);
      await syncTrayMenu();
      return;
    }

    const isAccountSwitched = activeUidRef.current !== user.uid;
    activeUidRef.current = user.uid;
    setCurrentUser(user);
    applyProfileState(user.live_profile_state);
    applyUserDraftValues(user, {
      forceTitle: isAccountSwitched,
      forceArea: isAccountSwitched,
      forceTags: isAccountSwitched,
    });
    if (isAccountSwitched) {
      titleDirtyRef.current = false;
      areaDirtyRef.current = false;
      tagsDirtyRef.current = false;
    }
    setRecentAreas(user.recent_areas || []);
    await syncTrayMenu();
  }, [applyProfileState, applyUserDraftValues, localeSetting, syncTrayMenu]);

  const loadAccounts = useCallback(async () => {
    const res = await studioApi.getAccountList();
    if (res.code === 0 && res.data) {
      setAccounts(res.data.list || []);
      const backendCurrentUid = res.data.current_uid || null;
      if (backendCurrentUid !== activeUidRef.current) {
        await loadSavedUser();
      }
    }
  }, [loadSavedUser]);

  const refreshCurrentUser = useCallback(async () => {
    const requestUid = activeUidRef.current;
    try {
      const res = await studioApi.refreshCurrentUser();
      if (res.code === 0 && res.data) {
        if (requestUid !== activeUidRef.current) {
          return;
        }
        activeUidRef.current = res.data.uid;
        setCurrentUser(res.data);
        applyProfileState(res.data.live_profile_state);
        applyUserDraftValues(res.data);
        append(t(localeSetting, "ui.ctrl.user_refreshed"));
        await loadAccounts();
        await studioApi.syncLiveRoomProfile().catch(() => undefined);
      }
    } catch (error) {
      append(
        tf(localeSetting, "ui.ctrl.user_refresh_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
      await loadAccounts();
    }
  }, [append, applyProfileState, applyUserDraftValues, loadAccounts, localeSetting]);

  const syncLiveRoomProfile = useCallback(async (forceAllDrafts = false) => {
    const requestUid = activeUidRef.current;
    try {
      const res = await studioApi.syncLiveRoomProfile();
      if (res.code !== 0 || !res.data) {
        return;
      }
      if (requestUid !== activeUidRef.current) {
        return;
      }

      const nextProfileState = normalizeProfileState(res.data.profile_state);
      applyProfileState(nextProfileState);
      const profilePatch = {
        last_title: res.data.title || nextProfileState.title.submitted,
        last_area_name: [
          res.data.parent || nextProfileState.area.submitted_parent,
          res.data.child || nextProfileState.area.submitted_child,
        ].filter(Boolean),
        last_tags: Array.isArray(res.data.tags)
          ? normalizeTags(res.data.tags)
          : nextProfileState.tags.submitted,
        live_profile_state: nextProfileState,
      } as Pick<User, "last_title" | "last_area_name" | "last_tags" | "live_profile_state">;
      const draftUser = {
        ...(currentUserRef.current || {
          uid: activeUidRef.current || "",
          uname: "",
          face: "",
          level: 0,
          follower: 0,
          last_title: "",
          last_area_name: [],
          last_tags: [],
          live_profile_state: nextProfileState,
        }),
        ...profilePatch,
      } as User;
      applyUserDraftValues(draftUser, {
        forceTitle: forceAllDrafts,
        forceArea: forceAllDrafts,
        forceTags: forceAllDrafts,
      });
      setCurrentUser((prev) => {
        if (!prev) {
          return draftUser;
        }
        return {
          ...prev,
          ...profilePatch,
        };
      });

      append(
        res.data.from_cache
          ? t(localeSetting, "ui.ctrl.sync_profile_failed_rollback")
          : t(localeSetting, "ui.ctrl.sync_profile_ok"),
      );
    } catch {
      append(t(localeSetting, "ui.ctrl.sync_profile_failed_keep"));
    }
  }, [append, applyProfileState, applyUserDraftValues, localeSetting]);

  const loadQrcode = useCallback(async (options?: { preserveDeadline?: boolean }) => {
    if (qrcodeRefreshBusyRef.current) {
      return;
    }

    const now = Date.now();
    const nextExpiresAt =
      options?.preserveDeadline && qrLoginExpiresAtRef.current
        ? qrLoginExpiresAtRef.current
        : now + QR_LOGIN_TIMEOUT_MS;
    if (nextExpiresAt <= now) {
      cancelQrcodeLogin("timeout");
      return;
    }

    if (!options?.preserveDeadline) {
      qrLoginSessionNonceRef.current += 1;
      setQrLoginTimedOut(false);
    }
    const requestNonce = qrLoginSessionNonceRef.current;

    qrcodeRefreshBusyRef.current = true;
    setQrcode("");
    setQrcodeKey("");
    loginStatusCodeRef.current = null;
    qrLoginExpiresAtRef.current = nextExpiresAt;
    setQrLoginExpiresAt(nextExpiresAt);
    setQrLoginRemainingSeconds(Math.ceil((nextExpiresAt - now) / 1000));

    try {
      const res = await studioApi.getLoginQrcode();
      if (requestNonce !== qrLoginSessionNonceRef.current) {
        return;
      }
      if (Date.now() >= nextExpiresAt) {
        cancelQrcodeLogin("timeout");
        return;
      }
      if (res.code === 0 && res.data?.content) {
        if (!res.data.image_src) {
          append(t(localeSetting, "ui.ctrl.qr_render_failed"));
          return;
        }
        setQrcode(res.data.image_src);
        setQrcodeKey(res.data.qrcode_key || "");
        append(t(localeSetting, "ui.ctrl.qr_ready"));
        return;
      }

      append(tf(localeSetting, "ui.ctrl.qr_fetch_failed", { msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.api_error"), localeSetting) }));
    } catch (error) {
      append(tf(localeSetting, "ui.ctrl.qr_fetch_failed", { msg: resolveBackendMessage(String(error), localeSetting) }));
    } finally {
      qrcodeRefreshBusyRef.current = false;
    }
  }, [append, cancelQrcodeLogin, localeSetting]);

  const pollLogin = useCallback(async (silent = false) => {
    if (!qrcodeKey) {
      return;
    }
    const expiresAt = qrLoginExpiresAtRef.current;
    if (!expiresAt || Date.now() >= expiresAt) {
      cancelQrcodeLogin("timeout");
      return;
    }
    if (loginPollBusyRef.current) {
      return;
    }
    loginPollBusyRef.current = true;

    try {
      const res = await studioApi.pollLoginStatus(qrcodeKey);
      if (res.code === 0 && res.data) {
        loginStatusCodeRef.current = 0;
        activeUidRef.current = res.data.uid;
        setCurrentUser(res.data);
        applyProfileState(res.data.live_profile_state);
        setDanmuListening(false);
        setDanmus([]);
        clearLiveVoteState();
        titleDirtyRef.current = false;
        areaDirtyRef.current = false;
        tagsDirtyRef.current = false;
        applyUserDraftValues(res.data, {
          forceTitle: true,
          forceArea: true,
          forceTags: true,
        });
        setRecentAreas(res.data.recent_areas || []);
        append(tf(localeSetting, "ui.ctrl.login_success", { name: res.data.uname || t(localeSetting, "ui.ctrl.user_fallback") }));
        await refreshSession();
        await loadAccounts();
        await syncLiveRoomProfile(true);
        resetQrLoginState();
        setQrLoginTimedOut(false);
        return;
      }

      const code = res.code;
      const statusChanged = loginStatusCodeRef.current !== code;
      loginStatusCodeRef.current = code;

      if (code === 86038) {
        if (!silent || statusChanged) {
          append(t(localeSetting, "ui.ctrl.qr_expired_refreshing"));
        }
        await loadQrcode({ preserveDeadline: true });
        return;
      }

      if (!silent || statusChanged) {
        append(tf(localeSetting, "ui.ctrl.login_status", { msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.login_pending"), localeSetting), code }));
      }
    } finally {
      loginPollBusyRef.current = false;
    }
  }, [append, applyProfileState, applyUserDraftValues, cancelQrcodeLogin, clearLiveVoteState, loadAccounts, loadQrcode, qrcodeKey, refreshSession, resetQrLoginState, syncLiveRoomProfile, localeSetting]);

  const switchAccount = useCallback(
    async (uid: string) => {
      try {
        const res = await studioApi.switchAccount(uid);
        if (res.code === 0 && res.data) {
          activeUidRef.current = res.data.uid;
          setCurrentUser(res.data);
          applyProfileState(res.data.live_profile_state);
          setDanmuListening(false);
          setDanmus([]);
          setLiveEmoticonPackages([]);
          setLiveEmoticonsLoading(false);
          clearLiveVoteState();
          setShowFaceModal(false);
          titleDirtyRef.current = false;
          areaDirtyRef.current = false;
          tagsDirtyRef.current = false;
          applyUserDraftValues(res.data, {
            forceTitle: true,
            forceArea: true,
            forceTags: true,
          });
          setRecentAreas(res.data.recent_areas || []);
          append(tf(localeSetting, "ui.ctrl.switched_account", { name: res.data.uname }));
          await refreshSession();
          await loadAccounts();
          await syncLiveRoomProfile(true);
        }
      } catch (error) {
        append(tf(localeSetting, "ui.ctrl.switch_failed", { msg: resolveBackendMessage(String(error), localeSetting) }));
      }
    },
    [append, applyProfileState, applyUserDraftValues, clearLiveVoteState, loadAccounts, refreshSession, syncLiveRoomProfile, localeSetting],
  );

  const logout = useCallback(
    async (uid: string) => {
      if (activeUidRef.current === uid) {
        setDanmuListening(false);
        setDanmus([]);
        setLiveEmoticonPackages([]);
        setLiveEmoticonsLoading(false);
        clearLiveVoteState();
      }
      const res = await studioApi.logout(uid);
      if (res.code === 0) {
        append(t(localeSetting, "ui.ctrl.logged_out"));
        await loadAccounts();
        await loadSavedUser();
        await refreshSession();
      }
    },
    [append, clearLiveVoteState, loadAccounts, loadSavedUser, refreshSession, localeSetting],
  );

  const requestLogout = useCallback(
    async (user: User, current: boolean) => {
      const confirmed = await requestConfirm({
        title: current
          ? t(localeSetting, "ui.account.logout_current")
          : t(localeSetting, "ui.account.delete"),
        description: current
          ? t(localeSetting, "ui.account.confirm.logout_current")
          : tf(localeSetting, "ui.account.confirm.delete_account", { name: user.uname }),
        confirmText: current
          ? t(localeSetting, "ui.account.logout_current")
          : t(localeSetting, "ui.account.delete"),
        tone: "danger",
      });
      if (!confirmed) {
        return;
      }
      await logout(user.uid);
    },
    [localeSetting, logout, requestConfirm],
  );

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

  const submitArea = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const requestUid = activeUidRef.current;
      const submittedParent = parent;
      const submittedChild = child;
      setProfileState((prev) => ({
        ...prev,
        area: {
          ...prev.area,
          transport: "saving",
          message: "",
        },
      }));
      const res = await studioApi.updateArea(submittedParent, submittedChild);
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data?.profile_state) {
        applyProfileState(res.data.profile_state);
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                last_area_name: [submittedParent, submittedChild],
                live_profile_state: res.data?.profile_state,
              }
            : prev,
        );
        areaDirtyRef.current = false;
        append(tf(localeSetting, "ui.ctrl.area_set_ok", { parent: submittedParent, child: submittedChild }));
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        area: {
          ...prev.area,
          transport: "failed",
          message: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.area_set_failed_default"), localeSetting),
        },
      }));
      append(tf(localeSetting, "ui.ctrl.area_set_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    },
    [append, applyProfileState, child, parent, localeSetting],
  );

  const submitTitle = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const requestUid = activeUidRef.current;
      const submittedTitle = title;
      setProfileState((prev) => ({
        ...prev,
        title: {
          ...prev.title,
          transport: "saving",
          message: "",
        },
      }));
      const res = await studioApi.updateTitle(submittedTitle);
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data?.profile_state) {
        applyProfileState(res.data.profile_state);
        setCurrentUser((prev) =>
          prev ? { ...prev, last_title: submittedTitle, live_profile_state: res.data?.profile_state } : prev,
        );
        append(t(localeSetting, "ui.ctrl.title_set_ok"));
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        title: {
          ...prev.title,
          transport: "failed",
          message: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.title_set_failed_default"), localeSetting),
        },
      }));
      append(tf(localeSetting, "ui.ctrl.title_set_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    },
    [append, applyProfileState, title, localeSetting],
  );

  const submitTags = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const requestUid = activeUidRef.current;
      const normalized = normalizeTags(tags);
      setProfileState((prev) => ({
        ...prev,
        tags: {
          ...prev.tags,
          transport: "saving",
          message: "",
        },
      }));
      const res = await studioApi.updateLiveTags(normalized.join(","));
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data) {
        const nextTags = normalizeTags(res.data.tags || []);
        setTags([...nextTags]);
        setTagInput("");
        if (res.data.profile_state) {
          applyProfileState(res.data.profile_state);
        }
        setCurrentUser((prev) =>
          prev ? { ...prev, last_tags: nextTags, live_profile_state: res.data?.profile_state } : prev,
        );
        append(tf(localeSetting, "ui.ctrl.tags_set_ok", { added: res.data.added.length, removed: res.data.removed.length }));
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        tags: {
          ...prev.tags,
          transport: "failed",
          message: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
        },
      }));
      append(tf(localeSetting, "ui.ctrl.tags_set_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    },
    [append, applyProfileState, tags, localeSetting],
  );

  const addTag = useCallback(() => {
    const parsed = splitTagInput(tagInput);
    if (parsed.length === 0) {
      return;
    }
    setTags((prev) => {
      const merged = [...prev];
      for (const tag of parsed) {
        if (!merged.includes(tag)) {
          merged.push(tag);
        }
      }
      return merged;
    });
    setTagInput("");
  }, [tagInput]);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((value) => value !== tag));
  }, []);

  const resolveFaceQrImage = useCallback(async (qr: string) => {
    const content = qr.trim();
    if (!content) {
      return {
        content: "",
        imageSrc: "",
      };
    }
    try {
      const res = await studioApi.renderQrcode(content, 220, 2);
      if (res.code === 0 && res.data) {
        return {
          content: res.data.content || content,
          imageSrc: res.data.image_src || "",
        };
      }
    } catch {
      // no-op
    }
    return {
      content,
      imageSrc: "",
    };
  }, []);

  const startLive = useCallback(async (source: StartLiveSource = "manual") => {
    const requestUid = activeUidRef.current;
    if (source === "tray") {
      setActiveTab("stream");
      await revealMainWindowForAction();
    }
    if (source !== "face_retry") {
      const confirmed = await requestConfirm({
        title: t(localeSetting, "ui.stream.start"),
        description: t(localeSetting, "ui.stream.confirm.start"),
        confirmText: t(localeSetting, "ui.stream.start"),
        tone: "primary",
      });
      if (!confirmed) {
        return;
      }
    }
    if (hasUnsavedChanges) {
      const warning = tf(localeSetting, "ui.ctrl.unsaved_warning", { items: unsavedItems.join("、") });
      append(warning);
      setActiveTab("stream");
      if (source === "tray") {
        await revealMainWindowForAction();
      }
      await requestAlert({
        title: t(localeSetting, "ui.profile.unsaved"),
        description: warning,
        confirmText: t(localeSetting, "ui.confirm.ok"),
        tone: "danger",
      });
      return;
    }

    pendingLiveFlowHintSkipRef.current = "start";
    const res = await studioApi.startLiveFlow();
    if (requestUid !== activeUidRef.current) {
      return;
    }
    if (res.code === 0) {
      const flow = res.data;
      setRtmp(flow?.stream_info || null);
      setRecentAreas(flow?.recent_areas || []);
      append(t(localeSetting, "ui.ctrl.start_live_ok"));
      const danmuStarted = Boolean(flow?.danmu_monitor_started);
      const danmuMsg = resolveBackendMessage(flow?.danmu_monitor_msg || "", localeSetting);
      if (danmuStarted) {
        setDanmuListening(true);
        append(t(localeSetting, "ui.ctrl.danmu_monitor_started"));
      } else {
        if (flow?.danmu_monitor_msg === "i18n.live.danmu_monitor_already_running") {
          setDanmuListening(true);
          append(t(localeSetting, "ui.ctrl.danmu_monitor_started"));
        } else if (danmuMsg) {
          append(tf(localeSetting, "ui.ctrl.danmu_monitor_failed", { msg: danmuMsg }));
        }
      }
      await refreshSession();
      await loadLinkageStatus();
      return;
    }

    if (res.code === 60024 || res.code === 60043) {
      setActiveTab("stream");
      if (source === "tray") {
        await revealMainWindowForAction();
      }
      const qrPayload = await resolveFaceQrImage(res.qr || "");
      setFaceQrContent(qrPayload.content);
      setFaceQr(qrPayload.imageSrc);
      setShowFaceModal(true);
      if (!qrPayload.content) {
        append(t(localeSetting, "ui.ctrl.face_qr_missing"));
        return;
      }
      if (!qrPayload.imageSrc) {
        append(t(localeSetting, "ui.ctrl.face_qr_render_failed"));
      }
      append(t(localeSetting, "ui.ctrl.face_required"));
      return;
    }

    append(tf(localeSetting, "ui.ctrl.start_live_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    await loadLinkageStatus();
  }, [append, hasUnsavedChanges, loadLinkageStatus, localeSetting, refreshSession, requestAlert, requestConfirm, resolveFaceQrImage, revealMainWindowForAction, unsavedItems]);

  const applyRecentArea = useCallback((nextParent: string, nextChild: string) => {
    if (!nextParent || !nextChild) {
      return;
    }
    const availableChildren = partitions[nextParent] || [];
    if (!availableChildren.includes(nextChild)) {
      append(tf(localeSetting, "ui.ctrl.quick_area_invalid", { parent: nextParent, child: nextChild }));
      return;
    }
    areaDirtyRef.current = true;
    setParent(nextParent);
    setChild(nextChild);
    append(tf(localeSetting, "ui.ctrl.quick_area_applied", { parent: nextParent, child: nextChild }));
  }, [append, partitions, localeSetting]);

  const stopLive = useCallback(async (source: "manual" | "tray" = "manual") => {
    const requestUid = activeUidRef.current;
    if (source === "tray") {
      setActiveTab("stream");
      await revealMainWindowForAction();
    }
    const confirmed = await requestConfirm({
      title: t(localeSetting, "ui.stream.stop"),
      description: t(localeSetting, "ui.stream.confirm.stop"),
      confirmText: t(localeSetting, "ui.stream.stop"),
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    pendingLiveFlowHintSkipRef.current = "stop";
    const res = await studioApi.stopLiveFlow();
    if (requestUid !== activeUidRef.current) {
      return;
    }
    const sessionConsistent = res.data?.session_consistent ?? true;
    append(
      res.code === 0
        ? sessionConsistent
          ? t(localeSetting, "ui.ctrl.stop_live_ok")
          : t(localeSetting, "ui.ctrl.stop_live_session_mismatch")
        : tf(localeSetting, "ui.ctrl.stop_live_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }),
    );
    if (res.code === 0 && sessionConsistent) {
      setDanmuListening(false);
      setRtmp(null);
    }
    if (res.code === 0) {
      await refreshSession();
      await loadLinkageStatus();
      return;
    }
    setRtmp(null);
    await refreshSession();
    await loadLinkageStatus();
  }, [append, loadLinkageStatus, localeSetting, refreshSession, requestConfirm, revealMainWindowForAction]);

  const startDanmu = useCallback(async () => {
    const res = await studioApi.startDanmuMonitor();
    if (res.code === 0) {
      setDanmuListening(true);
      append(t(localeSetting, "ui.ctrl.danmu_monitor_started"));
    } else {
      append(tf(localeSetting, "ui.ctrl.danmu_monitor_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    }
  }, [append, localeSetting]);

  const stopDanmu = useCallback(async () => {
    await studioApi.stopDanmuMonitor();
    setDanmuListening(false);
    append(t(localeSetting, "ui.ctrl.danmu_monitor_stopped"));
  }, [append, localeSetting]);

  const sendDanmu = useCallback(async () => {
    const text = danmuText.trim();
    if (!text) {
      return;
    }

    const res = await studioApi.sendDanmu(text);
    if (res.code === 0) {
      append(tf(localeSetting, "ui.ctrl.danmu_send", { text }));
      setDanmus((prev) => [
        createSelfDanmuMessage(
          text,
          currentUser?.uname || t(localeSetting, "ui.ctrl.me"),
          liveEmoticonMap,
          currentUser?.uid
            ? {
                sender_uid: Number(currentUser.uid),
                sender_role: "anchor",
                sender_face: currentUser.face,
              }
            : undefined,
        ),
        ...prev,
      ]);
    } else {
      append(tf(localeSetting, "ui.ctrl.send_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    }

    setDanmuText("");
  }, [append, currentUser?.uid, currentUser?.uname, danmuText, liveEmoticonMap, localeSetting]);

  const loadLiveEmoticons = useCallback(async () => {
    if (!activeUidRef.current || !session?.room_id) {
      setLiveEmoticonPackages([]);
      return;
    }

    const requestUid = activeUidRef.current;
    setLiveEmoticonsLoading(true);
    try {
      const res = await studioApi.getLiveEmoticons();
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data) {
        setLiveEmoticonPackages(res.data);
      } else {
        setLiveEmoticonPackages([]);
        append(
          tf(localeSetting, "ui.ctrl.danmu_emoticon_load_failed", {
            msg: resolveBackendMessage(res.msg, localeSetting),
          }),
        );
      }
    } catch (error) {
      if (requestUid !== activeUidRef.current) {
        return;
      }
      setLiveEmoticonPackages([]);
      append(
        tf(localeSetting, "ui.ctrl.danmu_emoticon_load_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      if (requestUid === activeUidRef.current) {
        setLiveEmoticonsLoading(false);
      }
    }
  }, [append, localeSetting, session?.room_id]);

  const loadLiveVoteData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeUidRef.current || !session?.room_id) {
        setLiveVotePanel(null);
        setLiveVoteHistory([]);
        return;
      }

      const requestUid = activeUidRef.current;
      if (!options?.silent) {
        setLiveVoteLoading(true);
      }

      const [panelResult, historyResult] = await Promise.allSettled([
        studioApi.getLiveVotePanel(),
        studioApi.getLiveVoteHistory(),
      ]);
      if (requestUid !== activeUidRef.current) {
        return;
      }

      let panelError: string | null = null;
      if (panelResult.status === "fulfilled") {
        const res = panelResult.value;
        if (res.code === 0) {
          setLiveVotePanel(normalizeLiveVotePanelData(res.data));
        } else {
          setLiveVotePanel({
            vote_info: null,
            templates: [],
          });
          panelError = resolveBackendMessage(res.msg, localeSetting);
        }
      } else {
        setLiveVotePanel({
          vote_info: null,
          templates: [],
        });
        panelError = resolveBackendMessage(String(panelResult.reason), localeSetting);
      }

      let historyError: string | null = null;
      if (historyResult.status === "fulfilled") {
        const res = historyResult.value;
        if (res.code === 0) {
          setLiveVoteHistory(normalizeLiveVoteHistory(res.data));
        } else {
          setLiveVoteHistory([]);
          historyError = resolveBackendMessage(res.msg, localeSetting);
        }
      } else {
        setLiveVoteHistory([]);
        historyError = resolveBackendMessage(String(historyResult.reason), localeSetting);
      }

      if (!options?.silent && panelError) {
        append(tf(localeSetting, "ui.ctrl.live_vote_panel_load_failed", { msg: panelError }));
      }
      if (!options?.silent && historyError) {
        append(tf(localeSetting, "ui.ctrl.live_vote_history_load_failed", { msg: historyError }));
      }

      if (requestUid === activeUidRef.current) {
        setLiveVoteLoading(false);
      }
    },
    [append, localeSetting, session?.room_id],
  );

  const applyLiveVoteTemplate = useCallback(
    (templateId: number) => {
      const template = liveVotePanel?.templates.find((item) => item.template_id === templateId);
      if (!template) {
        return;
      }
      setLiveVoteSelectedTemplateId(template.template_id);
      setLiveVoteQuestion(template.question);
      setLiveVoteOptionA(template.option_a);
      setLiveVoteOptionB(template.option_b);
    },
    [liveVotePanel?.templates],
  );

  const updateLiveVoteQuestion = useCallback((value: string) => {
    setLiveVoteSelectedTemplateId(null);
    setLiveVoteQuestion(value);
  }, []);

  const updateLiveVoteOptionA = useCallback((value: string) => {
    setLiveVoteSelectedTemplateId(null);
    setLiveVoteOptionA(value);
  }, []);

  const updateLiveVoteOptionB = useCallback((value: string) => {
    setLiveVoteSelectedTemplateId(null);
    setLiveVoteOptionB(value);
  }, []);

  const createLiveVote = useCallback(async () => {
    const question = liveVoteQuestion.trim();
    const optionA = liveVoteOptionA.trim();
    const optionB = liveVoteOptionB.trim();
    if (!question || !optionA || !optionB) {
      return;
    }
    if (isLiveVoteActive(liveVotePanel?.vote_info ?? null)) {
      append(t(localeSetting, "ui.danmu.vote.create_disabled_active"));
      return;
    }

    const requestUid = activeUidRef.current;
    setLiveVoteSubmitting(true);
    try {
      const res = await studioApi.createLiveVote(
        question,
        optionA,
        optionB,
        liveVoteDuration,
        liveVoteSelectedTemplateId,
      );
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_vote_created", { question }));
        resetLiveVoteDraft();
        await loadLiveVoteData({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_vote_create_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    } catch (error) {
      if (requestUid !== activeUidRef.current) {
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_vote_create_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      if (requestUid === activeUidRef.current) {
        setLiveVoteSubmitting(false);
      }
    }
  }, [
    append,
    liveVoteDuration,
    liveVoteOptionA,
    liveVoteOptionB,
    liveVotePanel?.vote_info,
    liveVoteQuestion,
    liveVoteSelectedTemplateId,
    loadLiveVoteData,
    localeSetting,
    resetLiveVoteDraft,
  ]);

  const terminateLiveVote = useCallback(
    async (interactionId: number) => {
      if (interactionId <= 0) {
        return;
      }

      const confirmed = await requestConfirm({
        title: t(localeSetting, "ui.danmu.vote.terminate"),
        description: t(localeSetting, "ui.danmu.vote.terminate_confirm"),
        confirmText: t(localeSetting, "ui.danmu.vote.terminate"),
        tone: "danger",
      });
      if (!confirmed) {
        return;
      }

      const requestUid = activeUidRef.current;
      setLiveVoteTerminating(true);
      try {
        const res = await studioApi.terminateLiveVote(interactionId);
        if (requestUid !== activeUidRef.current) {
          return;
        }
        if (res.code === 0) {
          append(t(localeSetting, "ui.ctrl.live_vote_terminated"));
          await loadLiveVoteData({ silent: true });
          return;
        }
        append(
          tf(localeSetting, "ui.ctrl.live_vote_terminate_failed", {
            msg: resolveBackendMessage(res.msg, localeSetting),
          }),
        );
      } catch (error) {
        if (requestUid !== activeUidRef.current) {
          return;
        }
        append(
          tf(localeSetting, "ui.ctrl.live_vote_terminate_failed", {
            msg: resolveBackendMessage(String(error), localeSetting),
          }),
        );
      } finally {
        if (requestUid === activeUidRef.current) {
          setLiveVoteTerminating(false);
        }
      }
    },
    [append, loadLiveVoteData, localeSetting, requestConfirm],
  );

  const scheduleLiveVoteSync = useCallback(() => {
    if (liveVoteSyncTimerRef.current !== null) {
      window.clearTimeout(liveVoteSyncTimerRef.current);
    }
    liveVoteSyncTimerRef.current = window.setTimeout(() => {
      liveVoteSyncTimerRef.current = null;
      void loadLiveVoteData({ silent: true });
    }, LIVE_VOTE_SYNC_DEBOUNCE_MS);
  }, [loadLiveVoteData]);

  const submitDanmu = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await sendDanmu();
    },
    [sendDanmu],
  );

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

  useEffect(() => {
    titleDirtyRef.current = title.trim() !== profileState.title.submitted.trim();
    areaDirtyRef.current =
      parent !== profileState.area.submitted_parent ||
      child !== profileState.area.submitted_child;
    tagsDirtyRef.current =
      tagsToKey(tags) !== tagsToKey(profileState.tags.submitted);
  }, [child, parent, profileState, tags, title]);

  useEffect(
    () => () => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
        confirmResolverRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    danmuEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [danmus]);

  useEffect(() => {
    void refreshSession();
    void loadSavedUser();
    void loadAccounts();
    void loadPartitions();
    void loadAppConfig();
    void loadLinkageStatus();
  }, [loadAccounts, loadAppConfig, loadLinkageStatus, loadPartitions, loadSavedUser, refreshSession]);

  useEffect(() => {
    void loadLinkageStatus();
    const timer = window.setInterval(() => {
      void loadLinkageStatus();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [loadLinkageStatus]);

  useEffect(() => {
    if (!currentUser?.uid) {
      setLiveEmoticonPackages([]);
      setLiveEmoticonsLoading(false);
      clearLiveVoteState();
      return;
    }
    void syncLiveRoomProfile(true);
  }, [clearLiveVoteState, currentUser?.uid, syncLiveRoomProfile]);

  useEffect(() => {
    if (!currentUser?.uid || !session?.room_id) {
      setLiveEmoticonPackages([]);
      setLiveEmoticonsLoading(false);
      clearLiveVoteState();
      return;
    }
    void loadLiveEmoticons();
  }, [clearLiveVoteState, currentUser?.uid, loadLiveEmoticons, session?.room_id]);

  useEffect(() => {
    if (!currentUser?.uid || !session?.room_id) {
      clearLiveVoteState();
      return;
    }
    void loadLiveVoteData();
  }, [clearLiveVoteState, currentUser?.uid, loadLiveVoteData, session?.room_id]);

  useEffect(() => {
    if (!qrcodeKey || !qrLoginExpiresAt) {
      setQrLoginRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((qrLoginExpiresAt - Date.now()) / 1000));
      setQrLoginRemainingSeconds(remaining);
    };
    updateRemaining();

    const expiryTimer = window.setTimeout(() => {
      cancelQrcodeLogin("timeout");
    }, Math.max(0, qrLoginExpiresAt - Date.now()));

    void pollLogin(true);
    const timer = window.setInterval(() => {
      updateRemaining();
      void pollLogin(true);
    }, QR_LOGIN_POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(expiryTimer);
    };
  }, [cancelQrcodeLogin, pollLogin, qrcodeKey, qrLoginExpiresAt]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenDanmuMessage((message) => {
      if (!active) {
        return;
      }
      const withFallbackSegments =
        message.type === "danmu" &&
        (!message.segments || message.segments.length === 0)
          ? createSelfDanmuMessage(message.content, message.sender, liveEmoticonMap)
          : null;
      const resolvedMessage = withFallbackSegments
        ? { ...message, segments: withFallbackSegments.segments }
        : message;
      setDanmus((prev) => applyIncomingRealtimeMessage(prev, resolvedMessage, localeSetting));

      if (message.cmd === "DM_INTERACTION" && message.interaction_event_type === 101) {
        scheduleLiveVoteSync();
      }

      append(tf(localeSetting, "ui.ctrl.danmu_event", { cmd: message.type.toUpperCase() }));
    });

    return () => {
      active = false;
      if (liveVoteSyncTimerRef.current !== null) {
        window.clearTimeout(liveVoteSyncTimerRef.current);
        liveVoteSyncTimerRef.current = null;
      }
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append, liveEmoticonMap, localeSetting, scheduleLiveVoteSync]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenStudioState((event) => {
      if (!active) {
        return;
      }

      switch (event.kind) {
        case "runtime.snapshot": {
          const nextSession = event.data?.session;
          if (nextSession) {
            setSession(nextSession);
            const liveStatus = nextSession.live_status ?? (nextSession.is_live ? 1 : 0);
            if (liveStatus !== 1) {
              setRtmp(null);
            }
          }
          if (typeof event.data?.danmu_running === "boolean") {
            setDanmuListening(event.data.danmu_running);
          }
          void syncTrayMenu();
          break;
        }
        case "live.flow": {
          const action = event.data?.action;
          if (action !== "start" && action !== "stop") {
            break;
          }
          if (pendingLiveFlowHintSkipRef.current === action) {
            pendingLiveFlowHintSkipRef.current = null;
            break;
          }
          const ok = event.data?.ok !== false;
          if (!ok) {
            const code = String(event.data?.code ?? "UNKNOWN");
            if (action === "start") {
              append(tf(localeSetting, "ui.ctrl.start_live_failed", { msg: code }));
            } else {
              append(tf(localeSetting, "ui.ctrl.stop_live_failed", { msg: code }));
            }
            break;
          }
          if (action === "start") {
            append(t(localeSetting, "ui.ctrl.tray_start"));
          } else if (event.data?.session_consistent === false) {
            append(t(localeSetting, "ui.ctrl.stop_live_session_mismatch"));
          } else {
            append(t(localeSetting, "ui.ctrl.tray_stop"));
          }
          break;
        }
        case "live.preflight": {
          const ok = event.data?.ok !== false;
          if (!ok) {
            append(
              tf(localeSetting, "ui.ctrl.live_precheck_failed", {
                msg: resolveBackendMessage(String(event.data?.error || "UNKNOWN"), localeSetting),
              }),
            );
            break;
          }
          if (event.data?.skipped) {
            append(t(localeSetting, "ui.ctrl.live_precheck_skipped"));
            break;
          }
          const auditStatus = Number(event.data?.audit_title_status ?? -1);
          const reason = String(event.data?.audit_title_reason || "").trim();
          if (reason) {
            append(
              tf(localeSetting, "ui.ctrl.live_precheck_audit_hint", {
                status: String(auditStatus),
                reason,
              }),
            );
          } else {
            append(tf(localeSetting, "ui.ctrl.live_precheck_ok", { status: String(auditStatus) }));
          }
          break;
        }
        case "overlay.visibility": {
          if (typeof event.data?.visible === "boolean") {
            setDanmuOverlayVisible(event.data.visible);
          }
          break;
        }
        default:
          break;
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append, localeSetting, syncTrayMenu]);

  useEffect(() => {
    let active = true;

    void studioApi.getAppLogs().then((res) => {
      if (!active) {
        return;
      }
      if (res.code === 0 && Array.isArray(res.data)) {
        setLogs(res.data.filter((item) => typeof item === "string" && item.trim().length > 0));
      }
    });

    const unlistenPromise = studioApi.listenAppLog((payload) => {
      if (!active) {
        return;
      }
      if (Array.isArray(payload?.logs)) {
        setLogs(payload.logs.filter((item) => typeof item === "string" && item.trim().length > 0));
        return;
      }
      const line = payload?.line?.trim() || "";
      if (!line) {
        return;
      }
      setLogs((prev) => [line, ...prev].slice(0, 300));
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return {
    state: {
      accounts,
      activeTab,
      appConfig,
      child,
      children,
      copiedKey,
      confirmModalConfirmText: confirmModal.confirmText,
      confirmModalDescription: confirmModal.description,
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
      showConfirmModal: confirmModal.show,
      showFaceModal,
      showLogs,
      savingConfig,
      savingLocale,
      tagInput,
      tags,
      title,
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
      setActiveTab,
      setChild: changeChild,
      setDanmuText,
      setLiveVoteDuration,
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
      applyLiveVoteTemplate,
      clearLiveVoteDraft: resetLiveVoteDraft,
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
