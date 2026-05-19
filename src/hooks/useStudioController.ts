import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  AppConfig,
  DanmuMsg,
  LinkageStatus,
  LiveEmoticonPackage,
  LiveProfileState,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import {
  createLiveEmoticonIndex,
  createSelfDanmuMessage,
  parseDanmuEvent,
} from "../utils/danmu";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../utils/i18n";
import { resolveQrPayload } from "../utils/qrcode";
import { useWindowDrag } from "./useWindowDrag";
import {
  buildSectionStatus,
  defaultProfileState,
  isValidUser,
  loadRecentAreasFromStorage,
  normalizeProfileState,
  normalizeTags,
  pushRecentAreaToStorage,
  splitTagInput,
  StartLiveSource,
  tagsToKey,
  unsavedLabelMap,
  type RecentArea,
} from "./studio/controllerHelpers";

type ConfirmModalTone = "primary" | "danger";

type ConfirmModalState = {
  show: boolean;
  title: string;
  description: string;
  confirmText: string;
  showCancel: boolean;
  tone: ConfirmModalTone;
};

export function useStudioController() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("account");
  const [showLogs, setShowLogs] = useState(false);

  const [qrcode, setQrcode] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
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
  const [danmus, setDanmus] = useState<DanmuMsg[]>([]);
  const [liveEmoticonPackages, setLiveEmoticonPackages] = useState<LiveEmoticonPackage[]>([]);
  const [liveEmoticonsLoading, setLiveEmoticonsLoading] = useState(false);
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
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [linkageStatus, setLinkageStatus] = useState<LinkageStatus | null>(null);
  const [recentAreas, setRecentAreas] = useState<RecentArea[]>([]);
  const [profileState, setProfileState] = useState<LiveProfileState>(defaultProfileState);
  const localeSetting = (appConfig?.locale || "auto") as LocaleSetting;

  const danmuEndRef = useRef<HTMLDivElement>(null);
  const sidebarDragRef = useRef<HTMLDivElement>(null);
  const headerDragRef = useRef<HTMLElement>(null);
  const expiredAccountNoticeRef = useRef<Set<string>>(new Set());
  const loginPollBusyRef = useRef(false);
  const loginStatusCodeRef = useRef<number | null>(null);
  const qrcodeRefreshBusyRef = useRef(false);
  const startupCookieRefreshDoneRef = useRef(false);
  const confirmResolverRef = useRef<((accepted: boolean) => void) | null>(null);
  const titleDirtyRef = useRef(false);
  const areaDirtyRef = useRef(false);
  const tagsDirtyRef = useRef(false);
  const activeUidRef = useRef<string | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const parentRef = useRef("");
  const childRef = useRef("");

  const children = useMemo(() => partitions[parent] || [], [parent, partitions]);
  const liveEmoticonMap = useMemo(
    () => createLiveEmoticonIndex(liveEmoticonPackages),
    [liveEmoticonPackages],
  );

  useWindowDrag(sidebarDragRef, headerDragRef);

  const append = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 300));
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

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    parentRef.current = parent;
    childRef.current = child;
  }, [child, parent]);

  const loadRecentAreasForUid = useCallback((uid: string | null) => {
    setRecentAreas(loadRecentAreasFromStorage(uid));
  }, []);

  const pushRecentArea = useCallback((uid: string | null, area: RecentArea) => {
    const next = pushRecentAreaToStorage(uid, area);
    if (next.length > 0) {
      setRecentAreas(next);
    }
  }, []);

  const syncTrayMenu = useCallback(async () => {
    await studioApi.refreshTrayMenu().catch(() => undefined);
  }, []);

  const loadAppConfig = useCallback(async () => {
    const res = await studioApi.getAppConfig();
    if (res.code === 0 && res.data) {
      setAppConfig(res.data);
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

  const saveAppConfig = useCallback(async () => {
    if (!appConfig) {
      return;
    }
    setSavingConfig(true);
    try {
      const writableKeys: Array<keyof AppConfig> = [
        "min_to_tray",
        "hide_dock_on_minimize",
        "live_control_mode",
        "obs_ws_enabled",
        "obs_ws_url",
        "obs_ws_password",
        "obs_ws_auto_start_on_live",
        "obs_ws_auto_stop_on_live_end",
        "on_live_start_command",
        "on_live_stop_command",
        "locale",
      ];
      for (const key of writableKeys) {
        await studioApi.setAppConfig(key, appConfig[key]);
      }
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

  const handleExpiredAccounts = useCallback(
    (uids: string[]) => {
      if (uids.length === 0) {
        return;
      }
      const firstNotified: string[] = [];
      for (const uid of uids) {
        if (expiredAccountNoticeRef.current.has(uid)) {
          continue;
        }
        expiredAccountNoticeRef.current.add(uid);
        firstNotified.push(uid);
      }
      if (firstNotified.length === 0) {
        return;
      }

      const text = tf(localeSetting, "ui.ctrl.alert.expired_accounts", {
        uids: firstNotified.join(", "),
      });
      append(text);
      void requestAlert({
        title: t(localeSetting, "ui.account.login_invalid"),
        description: text,
        confirmText: t(localeSetting, "ui.confirm.ok"),
        tone: "danger",
      });
    },
    [append, localeSetting, requestAlert],
  );

  const refreshSession = useCallback(async () => {
    const res = await studioApi
      .syncLiveStatus()
      .catch(() => studioApi.getSession());
    setSession(res.data || null);
    if (!res.data?.is_live) {
      setRtmp(null);
    }
    await syncTrayMenu();
  }, [syncTrayMenu]);

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
      loadRecentAreasForUid(null);
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
    loadRecentAreasForUid(user.uid);
    await syncTrayMenu();
  }, [applyProfileState, applyUserDraftValues, loadRecentAreasForUid, localeSetting, syncTrayMenu]);

  const loadAccounts = useCallback(async () => {
    const res = await studioApi.getAccountList();
    if (res.code === 0 && res.data) {
      setAccounts(res.data.list || []);
      const backendCurrentUid = res.data.current_uid || null;
      if (backendCurrentUid !== activeUidRef.current) {
        await loadSavedUser();
      }
      const validUids = new Set(
        (res.data.list || [])
          .filter((user) => !user.login_invalid)
          .map((user) => user.uid),
      );
      for (const uid of Array.from(expiredAccountNoticeRef.current)) {
        if (validUids.has(uid)) {
          expiredAccountNoticeRef.current.delete(uid);
        }
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

  const loadQrcode = useCallback(async () => {
    if (qrcodeRefreshBusyRef.current) {
      return;
    }
    qrcodeRefreshBusyRef.current = true;
    setQrcode("");
    setQrcodeKey("");
    loginStatusCodeRef.current = null;

    try {
      const res = await studioApi.getLoginQrcode();
      if (res.code === 0 && res.data?.url) {
        const qrPayload = await resolveQrPayload(res.data.url, {
          width: 220,
          margin: 2,
        });
        if (!qrPayload.imageSrc) {
          append(t(localeSetting, "ui.ctrl.qr_render_failed"));
          return;
        }
        setQrcode(qrPayload.imageSrc);
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
  }, [append, localeSetting]);

  const pollLogin = useCallback(async (silent = false) => {
    if (!qrcodeKey) {
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
        titleDirtyRef.current = false;
        areaDirtyRef.current = false;
        tagsDirtyRef.current = false;
        applyUserDraftValues(res.data, {
          forceTitle: true,
          forceArea: true,
          forceTags: true,
        });
        loadRecentAreasForUid(res.data.uid);
        append(tf(localeSetting, "ui.ctrl.login_success", { name: res.data.uname || t(localeSetting, "ui.ctrl.user_fallback") }));
        await refreshSession();
        await loadAccounts();
        await syncLiveRoomProfile(true);
        setQrcode("");
        setQrcodeKey("");
        return;
      }

      const code = res.code;
      const statusChanged = loginStatusCodeRef.current !== code;
      loginStatusCodeRef.current = code;

      if (code === 86038) {
        if (!silent || statusChanged) {
          append(t(localeSetting, "ui.ctrl.qr_expired_refreshing"));
        }
        await loadQrcode();
        return;
      }

      if (!silent || statusChanged) {
        append(tf(localeSetting, "ui.ctrl.login_status", { msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.login_pending"), localeSetting), code }));
      }
    } finally {
      loginPollBusyRef.current = false;
    }
  }, [append, applyProfileState, applyUserDraftValues, loadAccounts, loadQrcode, loadRecentAreasForUid, qrcodeKey, refreshSession, syncLiveRoomProfile, localeSetting]);

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
          setShowFaceModal(false);
          titleDirtyRef.current = false;
          areaDirtyRef.current = false;
          tagsDirtyRef.current = false;
          applyUserDraftValues(res.data, {
            forceTitle: true,
            forceArea: true,
            forceTags: true,
          });
          loadRecentAreasForUid(res.data.uid);
          append(tf(localeSetting, "ui.ctrl.switched_account", { name: res.data.uname }));
          await refreshSession();
          await loadAccounts();
          await syncLiveRoomProfile(true);
        }
      } catch (error) {
        append(tf(localeSetting, "ui.ctrl.switch_failed", { msg: resolveBackendMessage(String(error), localeSetting) }));
      }
    },
    [append, applyProfileState, applyUserDraftValues, loadAccounts, loadRecentAreasForUid, refreshSession, syncLiveRoomProfile, localeSetting],
  );

  const logout = useCallback(
    async (uid: string) => {
      if (activeUidRef.current === uid) {
        setDanmuListening(false);
        setDanmus([]);
        setLiveEmoticonPackages([]);
        setLiveEmoticonsLoading(false);
      }
      const res = await studioApi.logout(uid);
      if (res.code === 0) {
        append(t(localeSetting, "ui.ctrl.logged_out"));
        await loadAccounts();
        await loadSavedUser();
        await refreshSession();
      }
    },
    [append, loadAccounts, loadSavedUser, refreshSession, localeSetting],
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
    return resolveQrPayload(qr, {
      width: 220,
      margin: 2,
    });
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

    const res = await studioApi.startLive();
    if (requestUid !== activeUidRef.current) {
      return;
    }
    if (res.code === 0) {
      setRtmp(res.data || null);
      pushRecentArea(currentUser?.uid || null, { parent, child });
      append(t(localeSetting, "ui.ctrl.start_live_ok"));
      const danmuRes = await studioApi.startDanmuMonitor();
      if (danmuRes.code === 0) {
        setDanmuListening(true);
        append(t(localeSetting, "ui.ctrl.danmu_monitor_started"));
      } else {
        append(tf(localeSetting, "ui.ctrl.danmu_monitor_failed", { msg: resolveBackendMessage(danmuRes.msg, localeSetting) }));
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
  }, [append, child, currentUser?.uid, hasUnsavedChanges, loadLinkageStatus, localeSetting, parent, pushRecentArea, refreshSession, requestAlert, requestConfirm, resolveFaceQrImage, revealMainWindowForAction, unsavedItems]);

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
    const res = await studioApi.stopLive();
    if (requestUid !== activeUidRef.current) {
      return;
    }
    append(
      res.code === 0
        ? t(localeSetting, "ui.ctrl.stop_live_ok")
        : tf(localeSetting, "ui.ctrl.stop_live_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }),
    );
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
        ),
        ...prev,
      ]);
    } else {
      append(tf(localeSetting, "ui.ctrl.send_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    }

    setDanmuText("");
  }, [append, currentUser?.uname, danmuText, liveEmoticonMap, localeSetting]);

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
        await navigator.clipboard.writeText(text);
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
      return;
    }
    void syncLiveRoomProfile(true);
  }, [currentUser?.uid, syncLiveRoomProfile]);

  useEffect(() => {
    if (!currentUser?.uid || !session?.room_id) {
      setLiveEmoticonPackages([]);
      setLiveEmoticonsLoading(false);
      return;
    }
    void loadLiveEmoticons();
  }, [currentUser?.uid, loadLiveEmoticons, session?.room_id]);

  useEffect(() => {
    if (!qrcodeKey) {
      return;
    }

    void pollLogin(true);
    const timer = window.setInterval(() => {
      void pollLogin(true);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [pollLogin, qrcodeKey]);

  useEffect(() => {
    if (!startupCookieRefreshDoneRef.current) {
      startupCookieRefreshDoneRef.current = true;
      void studioApi
        .refreshAllAccountCookies()
        .then(async (res) => {
          if (res.code !== 0 || !res.data) {
            return;
          }
          handleExpiredAccounts(res.data.expired || []);
          if (res.data.failed.length > 0) {
            append(
              tf(localeSetting, "ui.ctrl.cookie_refresh_partial_failed_start", {
                list: res.data.failed
                  .map((msg) => resolveBackendMessage(msg, localeSetting))
                  .join(" | "),
              }),
            );
          }
          await loadSavedUser();
          await loadAccounts();
        })
        .catch(() => {
          append(t(localeSetting, "ui.ctrl.cookie_refresh_start_failed"));
        });
    }

    const timer = window.setInterval(() => {
      void studioApi
        .refreshAllAccountCookies()
        .then(async (res) => {
          if (res.code !== 0 || !res.data) {
            return;
          }

          handleExpiredAccounts(res.data.expired || []);
          if (res.data.failed.length > 0) {
            append(
              tf(localeSetting, "ui.ctrl.cookie_refresh_partial_failed", {
                list: res.data.failed
                  .map((msg) => resolveBackendMessage(msg, localeSetting))
                  .join(" | "),
              }),
            );
          }
          await loadSavedUser();
          await loadAccounts();
        })
        .catch(() => {
          append(t(localeSetting, "ui.ctrl.cookie_refresh_failed"));
        });
    }, 15 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [append, handleExpiredAccounts, loadAccounts, loadSavedUser, localeSetting]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenDanmuEvent((payload) => {
      if (!active) {
        return;
      }

      const parsed = parseDanmuEvent(payload, localeSetting, liveEmoticonMap);
      if (parsed) {
        setDanmus((prev) => [parsed, ...prev]);
      }
      append(tf(localeSetting, "ui.ctrl.danmu_event", { cmd: payload.cmd || "UNKNOWN" }));
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append, liveEmoticonMap, localeSetting]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenTrayAction((payload) => {
      if (!active) {
        return;
      }
      if (payload.action === "start_live") {
        append(t(localeSetting, "ui.ctrl.tray_start"));
        void startLive("tray");
      }
      if (payload.action === "stop_live") {
        append(t(localeSetting, "ui.ctrl.tray_stop"));
        void stopLive("tray");
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append, startLive, stopLive, localeSetting]);

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
      danmuText,
      danmus,
      liveEmoticonPackages,
      liveEmoticonsLoading,
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
      unsavedItems,
      parent,
      partitions,
      qrcode,
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
      clearLogs: () => setLogs([]),
      cancelConfirmAction: () => resolveConfirm(false),
      closeFaceModal: () => setShowFaceModal(false),
      closeLogs: () => setShowLogs(false),
      confirmAction: () => resolveConfirm(true),
      copyToClipboard,
      loadAccounts,
      loadPartitions,
      loadQrcode,
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
      updateAppConfig,
      updateLocaleConfig,
      saveAppConfig,
      setTagInput,
      setTitle,
      addTag,
      removeTag,
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
