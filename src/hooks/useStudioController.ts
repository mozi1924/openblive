import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  DanmuMsg,
  LiveProfileState,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import { writeClipboardText } from "../utils/clipboard";
import { resolveBackendMessage, t, tf } from "../utils/i18n";
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
import { useAppUpdateController } from "./studio/useAppUpdateController";
import { useLiveUserManageController } from "./studio/useLiveUserManageController";
import { useAppConfigController } from "./studio/useAppConfigController";
import {
  TOP_NOTICE_DURATION_MS,
  type TopNoticeItem,
  type TopNoticeTone,
} from "../types/topNotice";

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

const LIVE_ONLINE_RANK_POLL_INTERVAL_MS = 5_000;

export function useStudioController() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("account");
  const [showLogs, setShowLogs] = useState(false);
  const [showLiveOnlineRankPanel, setShowLiveOnlineRankPanel] = useState(false);
  const [showUserManagePanel, setShowUserManagePanel] = useState(false);
  const [topNotices, setTopNotices] = useState<TopNoticeItem[]>([]);

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
  const [recentAreas, setRecentAreas] = useState<RecentArea[]>([]);
  const [profileState, setProfileState] = useState<LiveProfileState>(defaultProfileState);

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
  const topNoticeSeqRef = useRef(0);
  const topNoticeTimersRef = useRef<Map<number, number>>(new Map());

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

  const dismissTopNotice = useCallback((id: number) => {
    const timerId = topNoticeTimersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      topNoticeTimersRef.current.delete(id);
    }
    setTopNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushTopNotice = useCallback(
    (payload: { text: string; tone: TopNoticeTone }) => {
      const text = payload.text.trim();
      if (!text) {
        return;
      }
      const id = ++topNoticeSeqRef.current;
      setTopNotices((prev) => [...prev.slice(-2), { id, text, tone: payload.tone }]);
      const timer = window.setTimeout(() => {
        dismissTopNotice(id);
      }, TOP_NOTICE_DURATION_MS);
      topNoticeTimersRef.current.set(id, timer);
    },
    [dismissTopNotice],
  );

  useEffect(
    () => () => {
      for (const timerId of topNoticeTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      topNoticeTimersRef.current.clear();
    },
    [],
  );

  const syncTrayMenu = useCallback(async () => {
    await studioApi.refreshTrayMenu().catch(() => undefined);
  }, []);

  const appConfigController = useAppConfigController({
    append,
    syncTrayMenu,
  });
  const {
    state: {
      appConfig,
      localeSetting,
      linkageStatus,
      danmuOverlayVisible,
      savingConfig,
      savingLocale,
      hasPendingConfigChanges,
    },
    actions: {
      setDanmuOverlayVisible,
      loadAppConfig,
      loadLinkageStatus,
      updateAppConfig,
      generateHttpUserAgent,
      updateLocaleConfig,
      showDanmuOverlay,
      hideDanmuOverlay,
      saveAppConfig,
    },
  } = appConfigController;

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

  const revealMainWindowForAction = useCallback(async () => {
    await studioApi.revealMainWindow().catch((error) => {
      append(
        tf(localeSetting, "ui.ctrl.reveal_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);
  const appUpdateController = useAppUpdateController({
    localeSetting,
    append,
    requestConfirm,
    requestAlert,
    revealMainWindowForAction,
    setActiveTab,
  });
  const {
    state: {
      appVersion,
      appBundleType,
      availableAppUpdateVersion,
      checkingAppUpdate,
      installingAppUpdate,
    },
    actions: {
      checkAppUpdate,
      downloadAndInstallAppUpdate,
      runPlatformUpdateAction,
    },
  } = appUpdateController;

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

  const liveUserManageController = useLiveUserManageController({
    localeSetting,
    append,
    currentUserUid: currentUser?.uid,
    showUserManagePanel,
    requestConfirm,
    getConfirmSelectValue: () => confirmSelectValueRef.current,
    notifyActionResult: pushTopNotice,
  });
  const {
    state: {
      userManageActiveTab,
      liveSilentUserList,
      liveSilentUserListLoading,
      liveBlackUserList,
      liveBlackUserListLoading,
      liveRoomAdminList,
      liveRoomAdminListLoading,
    },
    actions: {
      refreshSilentUserList,
      refreshBlackUserList,
      refreshRoomAdminList,
      requestMuteUserByDanmu,
      requestBlackUserByDanmu,
      requestRoomAdminByDanmu,
      requestRemoveRoomAdminByDanmu,
      requestRemoveSilentUser,
      requestRemoveBlackUser,
      requestRemoveRoomAdmin,
      changeRoomAdminPage,
      changeSilentUserPage,
      changeBlackUserPage,
      changeUserManageTab,
    },
  } = liveUserManageController;

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
      topNotices,
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
      dismissTopNotice,
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
      requestRemoveRoomAdminByDanmu,
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
