import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  DanmuMsg,
  LiveCoverAdvice,
  LiveCoverHistoryItem,
  LiveProfileState,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import { writeClipboardText } from "../utils/clipboard";
import { prepareLiveCoverUpload } from "../utils/coverUpload";
import { resolveBackendMessage, t, tf } from "../utils/i18n";
import { useWindowDrag } from "./useWindowDrag";
import {
  buildSectionStatus,
  defaultProfileState,
  normalizeCoverValue,
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

type PendingCoverUpload = {
  dataUrl: string;
  fileName: string;
  mimeType: string;
};

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
const LIVE_PROFILE_SYNC_POLL_INTERVAL_MS = 20_000;

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
  const [cover, setCover] = useState("");
  const [coverRenderSrc, setCoverRenderSrc] = useState("");
  const [pendingCoverUpload, setPendingCoverUpload] = useState<PendingCoverUpload | null>(null);
  const [coverHistory, setCoverHistory] = useState<LiveCoverHistoryItem[]>([]);
  const [coverAdvice, setCoverAdvice] = useState<LiveCoverAdvice | null>(null);
  const [coverHistoryLoading, setCoverHistoryLoading] = useState(false);
  const [coverAdviceLoading, setCoverAdviceLoading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagAuditStatusMap, setTagAuditStatusMap] = useState<Record<string, number>>({});
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
  const coverDirtyRef = useRef(false);
  const coverDraftVersionRef = useRef(0);
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
  const tagAuditBootstrapKeyRef = useRef("");

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
    notifyActionResult: pushTopNotice,
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
      cover: normalizeCoverValue(cover) !== normalizeCoverValue(profileState.cover.submitted),
      title: title.trim() !== profileState.title.submitted.trim(),
      area:
        parent !== profileState.area.submitted_parent ||
        child !== profileState.area.submitted_child,
      tags: tagsToKey(tags) !== tagsToKey(profileState.tags.submitted),
    }),
    [child, cover, parent, profileState, tags, title],
  );

  const hasUnsavedChanges = useMemo(() => {
    return dirtyStatus.cover || dirtyStatus.title || dirtyStatus.area || dirtyStatus.tags;
  }, [dirtyStatus]);

  const unsavedItems = useMemo(() => {
    const items: Array<(typeof unsavedLabelMap)[keyof typeof unsavedLabelMap]> = [];
    if (dirtyStatus.cover) {
      items.push(unsavedLabelMap.cover);
    }
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
      cover: buildSectionStatus(localeSetting, "cover", dirtyStatus.cover, profileState),
      title: buildSectionStatus(localeSetting, "title", dirtyStatus.title, profileState),
      area: buildSectionStatus(localeSetting, "area", dirtyStatus.area, profileState),
      tags: buildSectionStatus(localeSetting, "tags", dirtyStatus.tags, profileState),
    }),
    [dirtyStatus, localeSetting, profileState],
  );

  const hasAttentionStatus = useMemo(
    () =>
      sectionStatus.cover.tone !== "green" ||
      sectionStatus.title.tone !== "green" ||
      sectionStatus.area.tone !== "green" ||
      sectionStatus.tags.tone !== "green",
    [sectionStatus],
  );
  const hasPendingReviewOption = useMemo(
    () =>
      profileState.cover.review === "pending" ||
      profileState.title.review === "pending" ||
      profileState.area.review === "pending" ||
      profileState.tags.review === "pending",
    [profileState],
  );
  const needsTagAuditBootstrap = useMemo(
    () => tags.length > 0 && tags.some((tag) => !(tag in tagAuditStatusMap)),
    [tagAuditStatusMap, tags],
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
        allowCover?: boolean;
        forceCover?: boolean;
        forceTitle?: boolean;
        forceArea?: boolean;
        forceTags?: boolean;
      },
    ) => {
      const allowCover = options?.allowCover ?? true;
      const forceCover = options?.forceCover ?? false;
      const forceTitle = options?.forceTitle ?? false;
      const forceArea = options?.forceArea ?? false;
      const forceTags = options?.forceTags ?? false;

      if (allowCover && (forceCover || !coverDirtyRef.current)) {
        setCover(normalizeCoverValue(user.last_cover || ""));
        setCoverRenderSrc(normalizeCoverValue(user.last_cover_asset || ""));
        setPendingCoverUpload(null);
      }
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
        setTagAuditStatusMap({});
        setTagInput("");
      }
    },
    [],
  );

  const resolvePersistedCoverUrl = useCallback((value?: string | null) => {
    const normalized = normalizeCoverValue(value);
    return normalized.startsWith("data:") ? "" : normalized;
  }, []);

  const refreshLiveCoverHistory = useCallback(async () => {
    const requestUid = activeUidRef.current;
    if (!requestUid) {
      setCoverHistory([]);
      return;
    }
    setCoverHistoryLoading(true);
    try {
      const res = await studioApi.getLiveCoverHistory();
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data) {
        setCoverHistory(res.data.history || []);
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.cover_history_load_failed", {
          msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.api_error"), localeSetting),
        }),
      );
    } catch (error) {
      if (requestUid !== activeUidRef.current) {
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.cover_history_load_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      if (requestUid === activeUidRef.current) {
        setCoverHistoryLoading(false);
      }
    }
  }, [activeUidRef, append, localeSetting]);

  const refreshLiveCoverAdvice = useCallback(
    async (coverUrl?: string | null) => {
      const requestUid = activeUidRef.current;
      const targetCover =
        resolvePersistedCoverUrl(coverUrl) ||
        resolvePersistedCoverUrl(currentUserRef.current?.last_cover) ||
        resolvePersistedCoverUrl(profileState.cover.effective) ||
        resolvePersistedCoverUrl(profileState.cover.submitted) ||
        resolvePersistedCoverUrl(cover);
      if (!requestUid) {
        setCoverAdvice(null);
        return;
      }
      if (!targetCover) {
        setCoverAdvice(null);
        return;
      }

      setCoverAdviceLoading(true);
      try {
        const res = await studioApi.getLiveCoverAdvice(targetCover);
        if (requestUid !== activeUidRef.current) {
          return;
        }
        if (res.code === 0) {
          setCoverAdvice(res.data || null);
          return;
        }
        setCoverAdvice(null);
        append(
          tf(localeSetting, "ui.ctrl.cover_advice_load_failed", {
            msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.api_error"), localeSetting),
          }),
        );
      } catch (error) {
        if (requestUid !== activeUidRef.current) {
          return;
        }
        setCoverAdvice(null);
        append(
          tf(localeSetting, "ui.ctrl.cover_advice_load_failed", {
            msg: resolveBackendMessage(String(error), localeSetting),
          }),
        );
      } finally {
        if (requestUid === activeUidRef.current) {
          setCoverAdviceLoading(false);
        }
      }
    },
    [activeUidRef, append, cover, localeSetting, profileState.cover.effective, profileState.cover.submitted, resolvePersistedCoverUrl],
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
    coverDirtyRef,
    coverDraftVersionRef,
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
    setCover,
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
    setTagAuditStatusMap,
    setTagInput,
    setProfileState,
    setCurrentUser,
    parent,
    child,
    title,
    tagInput,
    applyProfileState,
    refreshSession,
    loadLinkageStatus,
    pendingLiveFlowHintSkipRef,
    areaDirtyRef,
    notifyActionResult: pushTopNotice,
  });
  const {
    actions: {
      submitArea,
      submitTitle,
      submitTags,
      refreshLiveTags,
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

  const syncLiveRoomProfileRef = useRef(syncLiveRoomProfile);
  const refreshLiveCoverHistoryRef = useRef(refreshLiveCoverHistory);
  const refreshLiveCoverAdviceRef = useRef(refreshLiveCoverAdvice);
  syncLiveRoomProfileRef.current = syncLiveRoomProfile;
  refreshLiveCoverHistoryRef.current = refreshLiveCoverHistory;
  refreshLiveCoverAdviceRef.current = refreshLiveCoverAdvice;

  const syncLiveRoomProfileResources = useCallback(async (forceAllDrafts = false) => {
    const synced = await syncLiveRoomProfileRef.current(forceAllDrafts);
    await refreshLiveCoverHistoryRef.current();
    await refreshLiveCoverAdviceRef.current(
      synced && typeof synced === "object" && "cover" in synced ? synced.cover : undefined,
    );
    return synced;
  }, []);

  const selectHistoryCover = useCallback((coverUrl: string, assetUrl?: string) => {
    coverDirtyRef.current = true;
    coverDraftVersionRef.current += 1;
    setPendingCoverUpload(null);
    setCover(coverUrl);
    setCoverRenderSrc(normalizeCoverValue(assetUrl || ""));
  }, []);

  const selectCoverFile = useCallback(async (file: File | null) => {
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      const message = t(localeSetting, "ui.ctrl.cover_invalid_file");
      append(message);
      pushTopNotice({ text: message, tone: "error" });
      return;
    }
    try {
      const prepared = await prepareLiveCoverUpload(file);
      coverDirtyRef.current = true;
      coverDraftVersionRef.current += 1;
      setPendingCoverUpload({
        dataUrl: prepared.dataUrl,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
      });
      setCover(prepared.dataUrl);
      setCoverRenderSrc(prepared.dataUrl);
      setCoverAdvice(null);
    } catch {
      const message = t(localeSetting, "ui.ctrl.cover_read_failed");
      append(message);
      pushTopNotice({ text: message, tone: "error" });
    }
  }, [append, localeSetting, pushTopNotice]);

  const submitCover = useCallback(async () => {
    const requestUid = activeUidRef.current;
    const remoteCover = resolvePersistedCoverUrl(cover);
    const uploadPayload = pendingCoverUpload;
    if (!requestUid) {
      return;
    }
    if (!remoteCover && !uploadPayload) {
      const message = t(localeSetting, "ui.ctrl.cover_missing");
      append(message);
      pushTopNotice({ text: message, tone: "error" });
      return;
    }

    setProfileState((prev) => ({
      ...prev,
      cover: {
        ...prev.cover,
        transport: "saving",
        message: "",
      },
    }));

    try {
      let nextCover = remoteCover;
      if (uploadPayload) {
        const uploadRes = await studioApi.uploadLiveCover(
          uploadPayload.dataUrl,
          uploadPayload.fileName,
          uploadPayload.mimeType,
        );
        if (requestUid !== activeUidRef.current) {
          return;
        }
        if (uploadRes.code !== 0 || !uploadRes.data?.location) {
          throw new Error(uploadRes.msg || t(localeSetting, "ui.ctrl.cover_upload_failed_default"));
        }
        nextCover = uploadRes.data.location;
      }

      const res = await studioApi.updateLiveCover(nextCover);
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code !== 0) {
        throw new Error(res.msg || t(localeSetting, "ui.ctrl.cover_apply_failed_default"));
      }

      const persistedCover = normalizeCoverValue(res.data?.cover || nextCover);
      const persistedCoverAsset = normalizeCoverValue(res.data?.cover_asset_url || "");
      coverDirtyRef.current = false;
      setPendingCoverUpload(null);
      setCover(persistedCover);
      setCoverRenderSrc((current) => persistedCoverAsset || current);
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              last_cover: persistedCover,
              last_cover_asset: persistedCoverAsset || prev.last_cover_asset,
              live_profile_state: res.data?.profile_state || prev.live_profile_state,
            }
          : prev,
      );
      if (res.data?.profile_state) {
        applyProfileState(res.data.profile_state);
      }
      await refreshLiveCoverHistory();
      await refreshLiveCoverAdvice(persistedCover);
      const message = t(localeSetting, "ui.ctrl.cover_apply_ok");
      append(message);
      pushTopNotice({ text: message, tone: "success" });
    } catch (error) {
      if (requestUid !== activeUidRef.current) {
        return;
      }
      const message = resolveBackendMessage(String(error), localeSetting);
      setProfileState((prev) => ({
        ...prev,
        cover: {
          ...prev.cover,
          transport: "failed",
          message,
        },
      }));
      const line = tf(localeSetting, "ui.ctrl.cover_apply_failed", { msg: message });
      append(line);
      pushTopNotice({ text: line, tone: "error" });
    }
  }, [
    activeUidRef,
    append,
    applyProfileState,
    cover,
    localeSetting,
    pendingCoverUpload,
    pushTopNotice,
    refreshLiveCoverHistory,
    refreshLiveCoverAdvice,
    resolvePersistedCoverUrl,
    setCurrentUser,
    setProfileState,
  ]);

  useEffect(() => {
    if (!hasLiveAuth || !hasPendingReviewOption) {
      return;
    }
    let alive = true;
    let syncing = false;
    const syncProfileAndTags = async () => {
      if (!alive || syncing) {
        return;
      }
      syncing = true;
      try {
        await syncLiveRoomProfileResources(false);
        await refreshLiveTags();
      } finally {
        syncing = false;
      }
    };

    void syncProfileAndTags();
    const timer = window.setInterval(() => {
      void syncProfileAndTags();
    }, LIVE_PROFILE_SYNC_POLL_INTERVAL_MS);

    return () => {
      alive = false;
      syncing = false;
      window.clearInterval(timer);
    };
  }, [hasLiveAuth, hasPendingReviewOption, refreshLiveTags, syncLiveRoomProfileResources]);

  useEffect(() => {
    if (hasLiveAuth) {
      return;
    }
    setCoverHistory([]);
    setCoverAdvice(null);
    setPendingCoverUpload(null);
    setCover("");
    setCoverRenderSrc("");
  }, [hasLiveAuth]);

  useEffect(() => {
    if (!hasLiveAuth) {
      setTagAuditStatusMap({});
      return;
    }
    if (!hasPendingReviewOption) {
      return;
    }
    void refreshLiveTags();
  }, [hasLiveAuth, hasPendingReviewOption, currentUser?.uid, refreshLiveTags]);

  useEffect(() => {
    if (!hasLiveAuth || !currentUser?.uid || !needsTagAuditBootstrap) {
      return;
    }
    const key = `${currentUser.uid}:${tagsToKey(tags)}`;
    if (tagAuditBootstrapKeyRef.current === key) {
      return;
    }
    tagAuditBootstrapKeyRef.current = key;
    void refreshLiveTags();
  }, [currentUser?.uid, hasLiveAuth, needsTagAuditBootstrap, refreshLiveTags, tags]);

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
    cover,
    title,
    parent,
    child,
    tags,
    profileState,
    coverDirtyRef,
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
    syncLiveRoomProfile: syncLiveRoomProfileResources,
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
      tagAuditStatusMap,
      title,
      userManageActiveTab,
      topNotices,
      cover,
      coverRenderSrc,
      coverAdvice,
      coverAdviceLoading,
      coverHistory,
      coverHistoryLoading,
      pendingCoverUpload,
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
      selectCoverFile,
      selectHistoryCover,
      submitCover,
      refreshLiveTags,
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
      syncLiveRoomProfile: async () => {
        await syncLiveRoomProfileResources(true);
        await refreshLiveTags();
      },
      toggleLogs: () => setShowLogs((prev) => !prev),
    },
    refs: {
      danmuEndRef,
      headerDragRef,
      sidebarDragRef,
    },
  };
}
