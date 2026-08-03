import { useCallback, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { studioApi } from "../../services/studioApi";
import type { DanmuMsg, LiveProfileState, StreamInfo, User } from "../../types/studio";
import { createSelfDanmuMessage } from "../../utils/danmu";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";
import { clearLiveStreamInfoCache, saveLiveStreamInfoCache } from "../../utils/liveStreamCache";
import { normalizeTags, splitTagInput, type RecentArea, type StartLiveSource } from "./controllerHelpers";

type RequestConfirmPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: "primary" | "danger";
};

type RequestAlertPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: "primary" | "danger";
};

type UseLiveInteractionActionsParams = {
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  activeUidRef: MutableRefObject<string | null>;
  requestConfirm: (payload: RequestConfirmPayload) => Promise<boolean>;
  requestAlert: (payload: RequestAlertPayload) => Promise<void>;
  revealMainWindowForAction: () => Promise<void>;
  hasUnsavedChanges: boolean;
  unsavedItems: string[];
  partitions: Record<string, string[]>;
  danmuText: string;
  currentUser: User | null;
  liveEmoticonMap: ReturnType<typeof import("../../utils/danmu").createLiveEmoticonIndex>;
  setActiveTab: Dispatch<SetStateAction<import("../../types/studio").ActiveTab>>;
  setShowFaceModal: Dispatch<SetStateAction<boolean>>;
  setFaceQr: Dispatch<SetStateAction<string>>;
  setFaceQrContent: Dispatch<SetStateAction<string>>;
  setRtmp: Dispatch<SetStateAction<StreamInfo | null>>;
  setRecentAreas: Dispatch<SetStateAction<RecentArea[]>>;
  setDanmuListening: Dispatch<SetStateAction<boolean>>;
  setDanmus: Dispatch<SetStateAction<DanmuMsg[]>>;
  setDanmuText: Dispatch<SetStateAction<string>>;
  setParent: Dispatch<SetStateAction<string>>;
  setChild: Dispatch<SetStateAction<string>>;
  setTags: Dispatch<SetStateAction<string[]>>;
  setTagAuditStatusMap: Dispatch<SetStateAction<Record<string, number>>>;
  setTagInput: Dispatch<SetStateAction<string>>;
  setProfileState: Dispatch<SetStateAction<LiveProfileState>>;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  parent: string;
  child: string;
  title: string;
  tagInput: string;
  applyProfileState: (nextState?: LiveProfileState | null) => void;
  refreshSession: () => Promise<void>;
  loadLinkageStatus: () => Promise<void>;
  pendingLiveFlowHintSkipRef: MutableRefObject<"start" | "stop" | null>;
  areaDirtyRef: MutableRefObject<boolean>;
  notifyActionResult?: (payload: { text: string; tone: "success" | "error" }) => void;
};

export function useLiveInteractionActions({
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
  notifyActionResult,
}: UseLiveInteractionActionsParams) {
  const addTagSubmittingRef = useRef(false);

  const emitActionResult = useCallback((text: string, tone: "success" | "error") => {
    const message = text.trim();
    if (!message) {
      return;
    }
    notifyActionResult?.({ text: message, tone });
  }, [notifyActionResult]);

  const applyRemoteLiveTags = useCallback((
    nextTags: string[] | undefined,
    tagItems: Array<{ tag_content: string; audit_status: number }> | undefined,
    nextProfileState?: LiveProfileState | null,
  ) => {
    const normalizedTags = normalizeTags(nextTags || []);
    setTags([...normalizedTags]);
    const nextAuditMap: Record<string, number> = {};
    for (const item of tagItems || []) {
      const key = item.tag_content?.trim() || "";
      if (!key) {
        continue;
      }
      nextAuditMap[key] = Number(item.audit_status ?? -1);
    }
    setTagAuditStatusMap(nextAuditMap);
    if (nextProfileState) {
      applyProfileState(nextProfileState);
    }
    setCurrentUser((prev) =>
      prev
        ? {
            ...prev,
            last_tags: normalizedTags,
            live_profile_state: nextProfileState ?? prev.live_profile_state,
          }
        : prev,
    );
    return normalizedTags;
  }, [applyProfileState, setCurrentUser, setTagAuditStatusMap, setTags]);

  const refreshLiveTags = useCallback(async () => {
    const requestUid = activeUidRef.current;
    const res = await studioApi.getLiveTags();
    if (requestUid !== activeUidRef.current) {
      return;
    }
    if (res.code === 0 && res.data) {
      applyRemoteLiveTags(res.data.tag_contents, res.data.tags, res.data.profile_state);
      return;
    }
    const message = tf(localeSetting, "ui.ctrl.tags_set_failed", {
      msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
    });
    append(message);
    emitActionResult(message, "error");
  }, [activeUidRef, append, applyRemoteLiveTags, emitActionResult, localeSetting]);

  const submitArea = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const requestUid = activeUidRef.current;
      const submittedParent = parent;
      const submittedChild = child;
      try {
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
      } catch (error) {
        if (requestUid !== activeUidRef.current) {
          return;
        }
        const message = resolveBackendMessage(String(error), localeSetting);
        setProfileState((prev) => ({
          ...prev,
          area: {
            ...prev.area,
            transport: "failed",
            message,
          },
        }));
        append(tf(localeSetting, "ui.ctrl.area_set_failed", { msg: message }));
      }
    },
    [activeUidRef, append, applyProfileState, areaDirtyRef, child, localeSetting, parent, setCurrentUser, setProfileState],
  );

  const submitTitle = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const requestUid = activeUidRef.current;
      const submittedTitle = title;
      try {
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
      } catch (error) {
        if (requestUid !== activeUidRef.current) {
          return;
        }
        const message = resolveBackendMessage(String(error), localeSetting);
        setProfileState((prev) => ({
          ...prev,
          title: {
            ...prev.title,
            transport: "failed",
            message,
          },
        }));
        append(tf(localeSetting, "ui.ctrl.title_set_failed", { msg: message }));
      }
    },
    [activeUidRef, append, applyProfileState, localeSetting, setCurrentUser, setProfileState, title],
  );

  const submitTags = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await refreshLiveTags();
    },
    [refreshLiveTags],
  );

  const addTag = useCallback(async () => {
    if (addTagSubmittingRef.current) {
      return;
    }
    const requestUid = activeUidRef.current;
    const parsed = splitTagInput(tagInput);
    if (parsed.length === 0) {
      return;
    }
    addTagSubmittingRef.current = true;
    setProfileState((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        transport: "saving",
        message: "",
      },
    }));
    try {
      for (let index = 0; index < parsed.length; index += 1) {
        const normalizedTag = parsed[index].trim();
        if (!normalizedTag) {
          continue;
        }
        try {
          const res = await studioApi.addLiveTag(normalizedTag);
          if (requestUid !== activeUidRef.current) {
            return;
          }
          if (res.code === 0 && res.data) {
            applyRemoteLiveTags(res.data.tags, res.data.tag_items, res.data.profile_state);
            const addedTag = (res.data.tag_items || []).find((item) => item.tag_content === normalizedTag);
            const auditStatus = Number(addedTag?.audit_status ?? -1);
            const message = tf(localeSetting, "ui.ctrl.tag_add_ok", {
              tag: normalizedTag,
              status: t(localeSetting, `ui.stream.tags.audit.status.${String(auditStatus)}`),
            });
            append(message);
            emitActionResult(message, "success");
          } else {
            const failMessage = tf(localeSetting, "ui.ctrl.tag_add_failed", {
              tag: normalizedTag,
              msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
            });
            setProfileState((prev) => ({
              ...prev,
              tags: {
                ...prev.tags,
                transport: "failed",
                message: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
              },
            }));
            append(failMessage);
            emitActionResult(failMessage, "error");
          }
        } catch (error) {
          if (requestUid !== activeUidRef.current) {
            return;
          }
          const message = resolveBackendMessage(String(error), localeSetting);
          const failMessage = tf(localeSetting, "ui.ctrl.tag_add_failed", {
            tag: normalizedTag,
            msg: message,
          });
          setProfileState((prev) => ({
            ...prev,
            tags: {
              ...prev.tags,
              transport: "failed",
              message,
            },
          }));
          append(failMessage);
          emitActionResult(failMessage, "error");
        }
        if (index < parsed.length - 1) {
          await new Promise<void>((resolve) => {
            window.setTimeout(resolve, 1000);
          });
        }
      }
      setTagInput("");
    } finally {
      addTagSubmittingRef.current = false;
    }
  }, [
    activeUidRef,
    append,
    addTagSubmittingRef,
    applyRemoteLiveTags,
    emitActionResult,
    localeSetting,
    setProfileState,
    setTagInput,
    tagInput,
  ]);

  const removeTag = useCallback(async (tag: string) => {
    const requestUid = activeUidRef.current;
    const accepted = await requestConfirm({
      title: t(localeSetting, "ui.stream.tags.confirm_remove.title"),
      description: tf(localeSetting, "ui.stream.tags.confirm_remove.desc", { tag }),
      confirmText: t(localeSetting, "ui.stream.tags.confirm_remove.confirm"),
      tone: "danger",
    });
    if (!accepted) {
      return;
    }
    setProfileState((prev) => ({
      ...prev,
      tags: {
        ...prev.tags,
        transport: "saving",
        message: "",
      },
    }));
    try {
      const res = await studioApi.removeLiveTag(tag);
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0 && res.data) {
        applyRemoteLiveTags(res.data.tags, res.data.tag_items, res.data.profile_state);
        const message = tf(localeSetting, "ui.ctrl.tag_remove_ok", { tag });
        append(message);
        emitActionResult(message, "success");
        return;
      }
      const failMessage = tf(localeSetting, "ui.ctrl.tag_remove_failed", {
        tag,
        msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
      });
      setProfileState((prev) => ({
        ...prev,
        tags: {
          ...prev.tags,
          transport: "failed",
          message: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.tags_set_failed_default"), localeSetting),
        },
      }));
      append(failMessage);
      emitActionResult(failMessage, "error");
    } catch (error) {
      if (requestUid !== activeUidRef.current) {
        return;
      }
      const message = resolveBackendMessage(String(error), localeSetting);
      const failMessage = tf(localeSetting, "ui.ctrl.tag_remove_failed", { tag, msg: message });
      setProfileState((prev) => ({
        ...prev,
        tags: {
          ...prev.tags,
          transport: "failed",
          message,
        },
      }));
      append(failMessage);
      emitActionResult(failMessage, "error");
    }
  }, [activeUidRef, append, applyRemoteLiveTags, emitActionResult, localeSetting, requestConfirm, setProfileState]);

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
    try {
      const res = await studioApi.startLiveFlow();
      if (requestUid !== activeUidRef.current) {
        return;
      }
      if (res.code === 0) {
        const flow = res.data;
        const streamInfo = flow?.stream_info || null;
        setRtmp(streamInfo);
        saveLiveStreamInfoCache(activeUidRef.current, streamInfo);
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
      await refreshSession();
      await loadLinkageStatus();
    } catch (error) {
      append(
        tf(localeSetting, "ui.ctrl.start_live_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
      setRtmp(null);
      await refreshSession();
      await loadLinkageStatus();
    } finally {
      pendingLiveFlowHintSkipRef.current = null;
    }
  }, [
    activeUidRef,
    append,
    hasUnsavedChanges,
    loadLinkageStatus,
    localeSetting,
    pendingLiveFlowHintSkipRef,
    refreshSession,
    requestAlert,
    requestConfirm,
    resolveFaceQrImage,
    revealMainWindowForAction,
    setActiveTab,
    setDanmuListening,
    setFaceQr,
    setFaceQrContent,
    setRecentAreas,
    setRtmp,
    setShowFaceModal,
    unsavedItems,
  ]);

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
  }, [append, areaDirtyRef, localeSetting, partitions, setChild, setParent]);

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
    try {
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
        setRtmp(null);
      }
      if (res.code === 0) {
        clearLiveStreamInfoCache();
        await refreshSession();
        await loadLinkageStatus();
        return;
      }
      setRtmp(null);
      await refreshSession();
      await loadLinkageStatus();
    } catch (error) {
      append(
        tf(localeSetting, "ui.ctrl.stop_live_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
      setRtmp(null);
      await refreshSession();
      await loadLinkageStatus();
    } finally {
      pendingLiveFlowHintSkipRef.current = null;
    }
  }, [
    activeUidRef,
    append,
    loadLinkageStatus,
    localeSetting,
    pendingLiveFlowHintSkipRef,
    refreshSession,
    requestConfirm,
    revealMainWindowForAction,
    setActiveTab,
    setDanmuListening,
    setRtmp,
  ]);

  const startDanmu = useCallback(async () => {
    const res = await studioApi.startDanmuMonitor();
    if (res.code === 0) {
      setDanmuListening(true);
      append(t(localeSetting, "ui.ctrl.danmu_monitor_started"));
    } else {
      append(tf(localeSetting, "ui.ctrl.danmu_monitor_failed", { msg: resolveBackendMessage(res.msg, localeSetting) }));
    }
  }, [append, localeSetting, setDanmuListening]);

  const stopDanmu = useCallback(async () => {
    await studioApi.stopDanmuMonitor();
    setDanmuListening(false);
    append(t(localeSetting, "ui.ctrl.danmu_monitor_stopped"));
  }, [append, localeSetting, setDanmuListening]);

  const sendDanmu = useCallback(async () => {
    const text = danmuText.trim();
    if (!text) {
      return;
    }

    const optimisticMsg = createSelfDanmuMessage(
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
      "sending",
    );

    setDanmuText("");
    setDanmus((prev) => [optimisticMsg, ...prev]);
    append(tf(localeSetting, "ui.ctrl.danmu_send", { text }));

    try {
      const res = await studioApi.sendDanmu(text);
      if (res.code === 0) {
        setDanmus((prev) =>
          prev.map((msg) => (msg.id === optimisticMsg.id ? { ...msg, status: "success" } : msg)),
        );
      } else {
        const errorMsg = resolveBackendMessage(res.msg, localeSetting);
        append(tf(localeSetting, "ui.ctrl.send_failed", { msg: errorMsg }));
        setDanmus((prev) =>
          prev.map((msg) =>
            msg.id === optimisticMsg.id
              ? {
                  ...msg,
                  optimistic: false,
                  send_failed: true,
                  status: "failed",
                  error_msg: errorMsg,
                }
              : msg,
          ),
        );
      }
    } catch (error) {
      const errorMsg = resolveBackendMessage(String(error), localeSetting);
      append(tf(localeSetting, "ui.ctrl.send_failed", { msg: errorMsg }));
      setDanmus((prev) =>
        prev.map((msg) =>
          msg.id === optimisticMsg.id
            ? {
                ...msg,
                optimistic: false,
                send_failed: true,
                status: "failed",
                error_msg: errorMsg,
              }
            : msg,
        ),
      );
    }
  }, [append, currentUser, danmuText, liveEmoticonMap, localeSetting, setDanmuText, setDanmus]);

  const submitDanmu = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await sendDanmu();
    },
    [sendDanmu],
  );

  return {
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
      sendDanmu,
      submitDanmu,
    },
  };
}
