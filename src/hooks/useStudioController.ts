import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createSelfDanmuMessage, parseDanmuEvent } from "../utils/danmu";
import { resolveBackendMessage, t, type LocaleSetting } from "../utils/i18n";
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

export function useStudioController() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("account");
  const [showLogs, setShowLogs] = useState(false);

  const [qrcode, setQrcode] = useState("");
  const [qrcodeKey, setQrcodeKey] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [accounts, setAccounts] = useState<User[]>([]);

  const [title, setTitle] = useState("测试开播");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [partitions, setPartitions] = useState<Record<string, string[]>>({});
  const [parent, setParent] = useState("");
  const [child, setChild] = useState("");
  const [rtmp, setRtmp] = useState<StreamInfo | null>(null);

  const [danmuText, setDanmuText] = useState("");
  const [danmuListening, setDanmuListening] = useState(false);
  const [danmus, setDanmus] = useState<DanmuMsg[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  const [faceQr, setFaceQr] = useState("");
  const [faceQrContent, setFaceQrContent] = useState("");
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
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
  const titleDirtyRef = useRef(false);
  const areaDirtyRef = useRef(false);
  const tagsDirtyRef = useRef(false);
  const activeUidRef = useRef<string | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const parentRef = useRef("");
  const childRef = useRef("");

  const children = useMemo(() => partitions[parent] || [], [parent, partitions]);

  useWindowDrag(sidebarDragRef, headerDragRef);

  const append = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 300));
  }, []);

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
    return items;
  }, [dirtyStatus]);

  const sectionStatus = useMemo(
    () => ({
      title: buildSectionStatus("title", dirtyStatus.title, profileState),
      area: buildSectionStatus("area", dirtyStatus.area, profileState),
      tags: buildSectionStatus("tags", dirtyStatus.tags, profileState),
    }),
    [dirtyStatus, profileState],
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

  const saveAppConfig = useCallback(async () => {
    if (!appConfig) {
      return;
    }
    setSavingConfig(true);
    try {
      const writableKeys: Array<keyof AppConfig> = [
        "min_to_tray",
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

      const text = `以下账号登录已失效，请重新扫码登录：${firstNotified.join(", ")}`;
      append(text);
      window.alert(text);
    },
    [append],
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
      applyProfileState(defaultProfileState());
      activeUidRef.current = null;
      titleDirtyRef.current = false;
      areaDirtyRef.current = false;
      tagsDirtyRef.current = false;
      setTitle("测试开播");
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
  }, [applyProfileState, applyUserDraftValues, loadRecentAreasForUid, syncTrayMenu]);

  const loadAccounts = useCallback(async () => {
    const res = await studioApi.getAccountList();
    if (res.code === 0 && res.data) {
      setAccounts(res.data.list || []);
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
  }, []);

  const refreshCurrentUser = useCallback(async () => {
    try {
      const res = await studioApi.refreshCurrentUser();
      if (res.code === 0 && res.data) {
        setCurrentUser(res.data);
        applyProfileState(res.data.live_profile_state);
        applyUserDraftValues(res.data);
        append("用户信息已刷新");
        await loadAccounts();
        await studioApi.syncLiveRoomProfile().catch(() => undefined);
      }
    } catch (error) {
      append(`刷新用户信息失败: ${resolveBackendMessage(String(error))}`);
      await loadAccounts();
    }
  }, [append, applyProfileState, applyUserDraftValues, loadAccounts]);

  const syncLiveRoomProfile = useCallback(async (forceAllDrafts = false) => {
    try {
      const res = await studioApi.syncLiveRoomProfile();
      if (res.code !== 0 || !res.data) {
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
          ? "直播间配置同步失败，已回退本地缓存"
          : "已同步直播间标题 / 分区 / 标签",
      );
    } catch {
      append("直播间配置同步失败，已保留本地缓存");
    }
  }, [append, applyProfileState, applyUserDraftValues]);

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
          append("登录二维码渲染失败，请重试");
          return;
        }
        setQrcode(qrPayload.imageSrc);
        setQrcodeKey(res.data.qrcode_key || "");
        append("二维码已生成，请使用 Bilibili App 扫码");
        return;
      }

      append(`获取二维码失败: ${resolveBackendMessage(res.msg || "接口返回异常")}`);
    } catch (error) {
      append(`获取二维码失败: ${resolveBackendMessage(String(error))}`);
    } finally {
      qrcodeRefreshBusyRef.current = false;
    }
  }, [append]);

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
        setCurrentUser(res.data);
        applyProfileState(res.data.live_profile_state);
        titleDirtyRef.current = false;
        areaDirtyRef.current = false;
        tagsDirtyRef.current = false;
        applyUserDraftValues(res.data, {
          forceTitle: true,
          forceArea: true,
          forceTags: true,
        });
        append(`登录成功：${res.data.uname || "用户"}`);
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
          append("二维码已失效，正在自动刷新");
        }
        await loadQrcode();
        return;
      }

      if (!silent || statusChanged) {
        append(`登录状态: ${resolveBackendMessage(res.msg || "等待确认")} (${code})`);
      }
    } finally {
      loginPollBusyRef.current = false;
    }
  }, [append, applyProfileState, applyUserDraftValues, loadAccounts, loadQrcode, qrcodeKey, refreshSession, syncLiveRoomProfile]);

  const switchAccount = useCallback(
    async (uid: string) => {
      try {
        const res = await studioApi.switchAccount(uid);
        if (res.code === 0 && res.data) {
          setCurrentUser(res.data);
          applyProfileState(res.data.live_profile_state);
          setShowFaceModal(false);
          titleDirtyRef.current = false;
          areaDirtyRef.current = false;
          tagsDirtyRef.current = false;
          applyUserDraftValues(res.data, {
            forceTitle: true,
            forceArea: true,
            forceTags: true,
          });
          append(`已切换账号：${res.data.uname}`);
          await refreshSession();
          await loadAccounts();
          await syncLiveRoomProfile(true);
        }
      } catch (error) {
        append(`切换账号失败: ${resolveBackendMessage(String(error))}`);
      }
    },
    [append, applyProfileState, applyUserDraftValues, loadAccounts, refreshSession, syncLiveRoomProfile],
  );

  const logout = useCallback(
    async (uid: string) => {
      const res = await studioApi.logout(uid);
      if (res.code === 0) {
        append("账号已退出");
        await loadAccounts();
        await loadSavedUser();
        await refreshSession();
      }
    },
    [append, loadAccounts, loadSavedUser, refreshSession],
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
    append("分区已同步");
  }, [append]);

  const submitArea = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setProfileState((prev) => ({
        ...prev,
        area: {
          ...prev.area,
          transport: "saving",
          message: "",
        },
      }));
      const res = await studioApi.updateArea(parent, child);
      if (res.code === 0 && res.data?.profile_state) {
        applyProfileState(res.data.profile_state);
        setCurrentUser((prev) =>
          prev ? { ...prev, last_area_name: [parent, child], live_profile_state: res.data?.profile_state } : prev,
        );
        areaDirtyRef.current = false;
        append(`分区设置成功: ${parent} / ${child}`);
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        area: {
          ...prev.area,
          transport: "failed",
          message: resolveBackendMessage(res.msg || "分区设置失败"),
        },
      }));
      append(`分区设置失败: ${resolveBackendMessage(res.msg)}`);
    },
    [append, applyProfileState, child, parent],
  );

  const submitTitle = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setProfileState((prev) => ({
        ...prev,
        title: {
          ...prev.title,
          transport: "saving",
          message: "",
        },
      }));
      const res = await studioApi.updateTitle(title);
      if (res.code === 0 && res.data?.profile_state) {
        applyProfileState(res.data.profile_state);
        setCurrentUser((prev) =>
          prev ? { ...prev, last_title: title, live_profile_state: res.data?.profile_state } : prev,
        );
        append("标题更新成功");
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        title: {
          ...prev.title,
          transport: "failed",
          message: resolveBackendMessage(res.msg || "标题更新失败"),
        },
      }));
      append(`标题更新失败: ${resolveBackendMessage(res.msg)}`);
    },
    [append, applyProfileState, title],
  );

  const submitTags = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
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
        append(
          `标签更新成功 (+${res.data.added.length} / -${res.data.removed.length})`,
        );
        return;
      }
      setProfileState((prev) => ({
        ...prev,
        tags: {
          ...prev.tags,
          transport: "failed",
          message: resolveBackendMessage(res.msg || "标签更新失败"),
        },
      }));
      append(`标签更新失败: ${resolveBackendMessage(res.msg)}`);
    },
    [append, applyProfileState, tags],
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
    if (hasUnsavedChanges) {
      const warning = `检测到未保存信息：${unsavedItems.join("、")}。请先保存后再开播。`;
      append(warning);
      setActiveTab("stream");
      if (source === "tray") {
        await studioApi.revealMainWindow().catch(() => undefined);
      }
      window.alert(warning);
      return;
    }

    const res = await studioApi.startLive();
    if (res.code === 0) {
      setRtmp(res.data || null);
      pushRecentArea(currentUser?.uid || null, { parent, child });
      append("开播成功，已返回推流信息");
      await refreshSession();
      await loadLinkageStatus();
      return;
    }

    if (res.code === 60024 || res.code === 60043) {
      setActiveTab("stream");
      if (source === "tray") {
        await studioApi.revealMainWindow().catch((error) => {
          append(`托盘唤起主界面失败: ${resolveBackendMessage(String(error))}`);
        });
      }
      const qrPayload = await resolveFaceQrImage(res.qr || "");
      setFaceQrContent(qrPayload.content);
      setFaceQr(qrPayload.imageSrc);
      setShowFaceModal(true);
      if (!qrPayload.content) {
        append("需要人脸验证，但接口未返回二维码内容，请稍后重试");
        return;
      }
      if (!qrPayload.imageSrc) {
        append("已收到人脸验证二维码内容，但渲染失败，请手动打开链接完成验证");
      }
      append("需要人脸验证，请扫码后重试开播");
      return;
    }

    append(`开播失败: ${resolveBackendMessage(res.msg)}`);
    await loadLinkageStatus();
  }, [append, child, currentUser?.uid, hasUnsavedChanges, loadLinkageStatus, parent, pushRecentArea, refreshSession, resolveFaceQrImage, unsavedItems]);

  const applyRecentArea = useCallback((nextParent: string, nextChild: string) => {
    if (!nextParent || !nextChild) {
      return;
    }
    const availableChildren = partitions[nextParent] || [];
    if (!availableChildren.includes(nextChild)) {
      append(`快速分区已失效: ${nextParent} / ${nextChild}`);
      return;
    }
    areaDirtyRef.current = true;
    setParent(nextParent);
    setChild(nextChild);
    append(`已应用快速分区: ${nextParent} / ${nextChild}`);
  }, [append, partitions]);

  const stopLive = useCallback(async () => {
    const res = await studioApi.stopLive();
    append(res.code === 0 ? "已停播" : `停播失败: ${resolveBackendMessage(res.msg)}`);
    setRtmp(null);
    await refreshSession();
    await loadLinkageStatus();
  }, [append, loadLinkageStatus, refreshSession]);

  const startDanmu = useCallback(async () => {
    const res = await studioApi.startDanmuMonitor();
    if (res.code === 0) {
      setDanmuListening(true);
      append("弹幕监听已启动");
    } else {
      append(`弹幕监听失败: ${resolveBackendMessage(res.msg)}`);
    }
  }, [append]);

  const stopDanmu = useCallback(async () => {
    await studioApi.stopDanmuMonitor();
    setDanmuListening(false);
    append("弹幕监听已停止");
  }, [append]);

  const sendDanmu = useCallback(async () => {
    const text = danmuText.trim();
    if (!text) {
      return;
    }

    const res = await studioApi.sendDanmu(text);
    if (res.code === 0) {
      append(`发送弹幕: ${text}`);
      setDanmus((prev) => [
        createSelfDanmuMessage(text, currentUser?.uname || "我"),
        ...prev,
      ]);
    } else {
      append(`发送失败: ${resolveBackendMessage(res.msg)}`);
    }

    setDanmuText("");
  }, [append, currentUser?.uname, danmuText]);

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
        append("复制失败，您的系统可能不支持剪贴板访问");
      }
    },
    [append],
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
      return;
    }
    void syncLiveRoomProfile(true);
  }, [currentUser?.uid, syncLiveRoomProfile]);

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
              `启动时 Cookie 刷新部分失败：${res.data.failed
                .map((msg) => resolveBackendMessage(msg, localeSetting))
                .join(" | ")}`,
            );
          }
          if (res.data.updated > 0) {
            await loadSavedUser();
            await loadAccounts();
          }
        })
        .catch(() => {
          append("启动时 Cookie 自动刷新失败");
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
              `Cookie 自动刷新部分失败：${res.data.failed
                .map((msg) => resolveBackendMessage(msg, localeSetting))
                .join(" | ")}`,
            );
          }
          if (res.data.updated > 0) {
            await loadSavedUser();
            await loadAccounts();
          }
        })
        .catch(() => {
          append("Cookie 自动刷新失败，将在下个周期重试");
        });
    }, 15 * 60 * 1000);

    return () => window.clearInterval(timer);
  }, [append, handleExpiredAccounts, loadAccounts, loadSavedUser]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenDanmuEvent((payload) => {
      if (!active) {
        return;
      }

      const parsed = parseDanmuEvent(payload);
      if (parsed) {
        setDanmus((prev) => [parsed, ...prev]);
      }
      append(`弹幕事件: ${payload.cmd || "UNKNOWN"}`);
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append]);

  useEffect(() => {
    let active = true;

    const unlistenPromise = studioApi.listenTrayAction((payload) => {
      if (!active) {
        return;
      }
      if (payload.action === "start_live") {
        append("托盘菜单触发开播");
        void startLive("tray");
      }
      if (payload.action === "stop_live") {
        append("托盘菜单触发下播");
        void stopLive();
      }
    });

    return () => {
      active = false;
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [append, startLive, stopLive]);

  return {
    state: {
      accounts,
      activeTab,
      appConfig,
      child,
      children,
      copiedKey,
      currentUser,
      danmuListening,
      danmuText,
      danmus,
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
      showFaceModal,
      showLogs,
      savingConfig,
      tagInput,
      tags,
      title,
    },
    actions: {
      changeParent,
      clearDanmus: () => setDanmus([]),
      clearLogs: () => setLogs([]),
      closeFaceModal: () => setShowFaceModal(false),
      closeLogs: () => setShowLogs(false),
      copyToClipboard,
      loadAccounts,
      loadPartitions,
      loadQrcode,
      logout,
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
