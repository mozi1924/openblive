import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  AppConfig,
  DanmuMsg,
  LinkageStatus,
  LiveProfileState,
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

type ConfirmModalTone = "primary" | "danger";

type ConfirmModalState = {
  show: boolean;
  title: string;
  description: string;
  confirmText: string;
  showCancel: boolean;
  tone: ConfirmModalTone;
};

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

  const danmuVoteController = useDanmuVoteController({
    activeUidRef,
    sessionRoomId: session?.room_id,
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
    currentUserUid: currentUser?.uid,
    sessionRoomId: session?.room_id,
    clearDanmuAssetsAndVoteState,
    syncLiveRoomProfile,
    loadLiveEmoticons,
    clearLiveVoteState,
    loadLiveVoteData,
    qrcodeKey,
    qrLoginExpiresAt,
    setQrLoginRemainingSeconds,
    cancelQrcodeLogin,
    pollLogin,
    localeSetting,
    liveEmoticonMap,
    setDanmus,
    scheduleLiveVoteSync,
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
