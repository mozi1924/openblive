import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { studioApi } from "../services/studioApi";
import type {
  ActiveTab,
  DanmuMsg,
  Session,
  StreamInfo,
  User,
} from "../types/studio";
import { createSelfDanmuMessage, parseDanmuEvent } from "../utils/danmu";
import { useWindowDrag } from "./useWindowDrag";

const isValidUser = (value: User | null | undefined): value is User =>
  Boolean(value?.uid);

const splitTagInput = (raw: string) =>
  raw
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);

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
  const [showFaceModal, setShowFaceModal] = useState(false);
  const [showStreamKey, setShowStreamKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState<"server" | "key" | null>(null);

  const danmuEndRef = useRef<HTMLDivElement>(null);
  const sidebarDragRef = useRef<HTMLDivElement>(null);
  const headerDragRef = useRef<HTMLElement>(null);
  const expiredAccountNoticeRef = useRef<Set<string>>(new Set());
  const loginPollBusyRef = useRef(false);
  const loginStatusCodeRef = useRef<number | null>(null);
  const qrcodeRefreshBusyRef = useRef(false);
  const startupCookieRefreshDoneRef = useRef(false);

  const children = useMemo(() => partitions[parent] || [], [parent, partitions]);

  useWindowDrag(sidebarDragRef, headerDragRef);

  const append = useCallback((line: string) => {
    const ts = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 300));
  }, []);

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
    const res = await studioApi.getSession();
    setSession(res.data || null);
    if (!res.data?.is_live) {
      setRtmp(null);
    }
  }, []);

  const loadSavedUser = useCallback(async () => {
    const res = await studioApi.loadSavedConfig();
    const user = isValidUser(res.data) ? res.data : null;

    if (!user) {
      setCurrentUser(null);
      return;
    }

    setCurrentUser(user);
    if (user.last_title) {
      setTitle(user.last_title);
    }
    if (user.last_area_name.length >= 2) {
      setParent(user.last_area_name[0]);
      setChild(user.last_area_name[1]);
    }
    setTags([...(user.last_tags || [])]);
    setTagInput("");
  }, []);

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
        append("用户信息已刷新");
        await loadAccounts();
        await studioApi.syncLiveRoomProfile().catch(() => undefined);
      }
    } catch (error) {
      append(`刷新用户信息失败: ${String(error)}`);
      await loadAccounts();
    }
  }, [append, loadAccounts]);

  const syncLiveRoomProfile = useCallback(async () => {
    try {
      const res = await studioApi.syncLiveRoomProfile();
      if (res.code !== 0 || !res.data) {
        return;
      }

      if (res.data.title) {
        setTitle(res.data.title);
      }
      setTags([...(res.data.tags || [])]);
      setTagInput("");
      if (res.data.parent) {
        setParent(res.data.parent);
      }
      if (res.data.child) {
        setChild(res.data.child);
      }

      append(
        res.data.from_cache
          ? "直播间配置同步失败，已回退本地缓存"
          : "已同步直播间标题 / 分区 / 标签",
      );
    } catch {
      append("直播间配置同步失败，已保留本地缓存");
    }
  }, [append]);

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
        const qrDataUrl = await QRCode.toDataURL(res.data.url, {
          width: 220,
          margin: 2,
        });
        setQrcode(qrDataUrl);
        setQrcodeKey(res.data.qrcode_key || "");
        append("二维码已生成，请使用 Bilibili App 扫码");
        return;
      }

      append(`获取二维码失败: ${res.msg || "接口返回异常"}`);
    } catch (error) {
      append(`获取二维码失败: ${String(error)}`);
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
        append(`登录成功：${res.data.uname || "用户"}`);
        await refreshSession();
        await loadAccounts();
        await syncLiveRoomProfile();
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
        append(`登录状态: ${res.msg || "等待确认"} (${code})`);
      }
    } finally {
      loginPollBusyRef.current = false;
    }
  }, [append, loadAccounts, loadQrcode, qrcodeKey, refreshSession, syncLiveRoomProfile]);

  const switchAccount = useCallback(
    async (uid: string) => {
      try {
        const res = await studioApi.switchAccount(uid);
        if (res.code === 0 && res.data) {
          setCurrentUser(res.data);
          setShowFaceModal(false);
          append(`已切换账号：${res.data.uname}`);
          await refreshSession();
          await loadAccounts();
          await syncLiveRoomProfile();
        }
      } catch (error) {
        append(`切换账号失败: ${String(error)}`);
      }
    },
    [append, loadAccounts, refreshSession, syncLiveRoomProfile],
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
    if (!parent && keys.length > 0) {
      setParent(keys[0]);
      setChild((res.data[keys[0]] || [])[0] || "");
    }
    append("分区已同步");
  }, [append, parent]);

  const submitArea = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const res = await studioApi.updateArea(parent, child);
      append(
        res.code === 0
          ? `分区设置成功: ${parent} / ${child}`
          : `分区设置失败: ${res.msg}`,
      );
      await refreshSession();
    },
    [append, child, parent, refreshSession],
  );

  const submitTitle = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const res = await studioApi.updateTitle(title);
      append(res.code === 0 ? "标题更新成功" : `标题更新失败: ${res.msg}`);
    },
    [append, title],
  );

  const submitTags = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const normalized = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
      const res = await studioApi.updateLiveTags(normalized.join(","));
      if (res.code === 0 && res.data) {
        setTags([...(res.data.tags || [])]);
        setTagInput("");
        append(
          `标签更新成功 (+${res.data.added.length} / -${res.data.removed.length})`,
        );
        return;
      }
      append(`标签更新失败: ${res.msg}`);
    },
    [append, tags],
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

  const startLive = useCallback(async () => {
    const res = await studioApi.startLive();
    if (res.code === 0) {
      setRtmp(res.data || null);
      append("开播成功，已返回推流信息");
      await refreshSession();
      return;
    }

    if (res.code === 60024 || res.code === 60043) {
      setFaceQr(res.qr || "");
      setShowFaceModal(true);
      append("需要人脸验证，请扫码后重试开播");
      return;
    }

    append(`开播失败: ${res.msg}`);
  }, [append, refreshSession]);

  const stopLive = useCallback(async () => {
    const res = await studioApi.stopLive();
    append(res.code === 0 ? "已停播" : `停播失败: ${res.msg}`);
    setRtmp(null);
    await refreshSession();
  }, [append, refreshSession]);

  const startDanmu = useCallback(async () => {
    const res = await studioApi.startDanmuMonitor();
    if (res.code === 0) {
      setDanmuListening(true);
      append("弹幕监听已启动");
    } else {
      append(`弹幕监听失败: ${res.msg}`);
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
      append(`发送失败: ${res.msg}`);
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
    async (text: string, type: "server" | "key") => {
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
      setParent(newParent);
      const subList = partitions[newParent] || [];
      setChild(subList[0] || "");
    },
    [partitions],
  );

  useEffect(() => {
    danmuEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [danmus]);

  useEffect(() => {
    void refreshSession();
    void loadSavedUser();
    void loadAccounts();
    void loadPartitions();
  }, [loadAccounts, loadPartitions, loadSavedUser, refreshSession]);

  useEffect(() => {
    if (!currentUser?.uid) {
      return;
    }
    void syncLiveRoomProfile();
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
            append(`启动时 Cookie 刷新部分失败：${res.data.failed.join(" | ")}`);
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
            append(`Cookie 自动刷新部分失败：${res.data.failed.join(" | ")}`);
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

  return {
    state: {
      accounts,
      activeTab,
      child,
      children,
      copiedKey,
      currentUser,
      danmuListening,
      danmuText,
      danmus,
      faceQr,
      logs,
      parent,
      partitions,
      qrcode,
      rtmp,
      session,
      showFaceModal,
      showLogs,
      showStreamKey,
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
        await startLive();
      },
      setActiveTab,
      setChild,
      setDanmuText,
      setShowStreamKey,
      setTagInput,
      setTitle,
      addTag,
      removeTag,
      startDanmu,
      startLive,
      stopDanmu,
      stopLive,
      submitArea,
      submitDanmu,
      submitTags,
      submitTitle,
      switchAccount,
      syncLiveRoomProfile,
      toggleLogs: () => setShowLogs((prev) => !prev),
    },
    refs: {
      danmuEndRef,
      headerDragRef,
      sidebarDragRef,
    },
  };
}
