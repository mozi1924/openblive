import { useEffect } from "react";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";
import { studioApi } from "../../services/studioApi";
import type { DanmuMsg, LiveProfileState, Session } from "../../types/studio";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";
import { resolveSessionLiveState } from "../../utils/liveStatus";
import { clearLiveStreamInfoCache, readLiveStreamInfoCache } from "../../utils/liveStreamCache";
import { normalizeCoverValue, tagsToKey } from "./controllerHelpers";
import { useTauriEvent } from "../useTauriEvent";

type UseStudioControllerEffectsParams = {
  cover: string;
  title: string;
  parent: string;
  child: string;
  tags: string[];
  profileState: LiveProfileState;
  coverDirtyRef: MutableRefObject<boolean>;
  titleDirtyRef: MutableRefObject<boolean>;
  areaDirtyRef: MutableRefObject<boolean>;
  tagsDirtyRef: MutableRefObject<boolean>;
  confirmResolverRef: MutableRefObject<((accepted: boolean) => void) | null>;
  danmuEndRef: RefObject<HTMLDivElement | null>;
  danmus: DanmuMsg[];
  refreshSession: () => Promise<void>;
  loadSavedUser: () => Promise<void>;
  loadAccounts: () => Promise<void>;
  loadPartitions: () => Promise<void>;
  loadAppConfig: () => Promise<void>;
  loadLinkageStatus: () => Promise<void>;
  currentUserUid: string | undefined;
  hasLiveAuth: boolean;
  clearDanmuAssetsAndVoteState: () => void;
  syncLiveRoomProfile: (forceAllDrafts?: boolean) => Promise<unknown>;
  loadLiveEmoticons: () => Promise<void>;
  clearLiveVoteState: () => void;
  loadLiveVoteData: (options?: { silent?: boolean }) => Promise<void>;
  loadLiveOnlineRank: (options?: { silent?: boolean }) => Promise<void>;
  qrcodeKey: string;
  qrLoginExpiresAt: number | null;
  setQrLoginRemainingSeconds: Dispatch<SetStateAction<number>>;
  cancelQrcodeLogin: (reason?: "timeout" | "manual") => void;
  pollLogin: (silent?: boolean) => Promise<void>;
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  clearLiveVoteSyncTimer: () => void;
  setSession: Dispatch<SetStateAction<Session | null>>;
  setRtmp: Dispatch<SetStateAction<import("../../types/studio").StreamInfo | null>>;
  setDanmuListening: Dispatch<SetStateAction<boolean>>;
  syncTrayMenu: () => Promise<void>;
  setDanmuOverlayVisible: Dispatch<SetStateAction<boolean>>;
  setLogs: Dispatch<SetStateAction<string[]>>;
  setLinkageStatus: Dispatch<SetStateAction<import("../../types/studio").LinkageStatus | null>>;
  setLiveOnlineRankData: Dispatch<SetStateAction<import("../../types/studio").LiveOnlineRankData | null>>;
  pendingLiveFlowHintSkipRef: MutableRefObject<"start" | "stop" | null>;
};

const QR_LOGIN_POLL_INTERVAL_MS = 2000;

export function useStudioControllerEffects({
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
  currentUserUid,
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
  setLinkageStatus,
  setLiveOnlineRankData,
}: UseStudioControllerEffectsParams) {
  useEffect(() => {
    coverDirtyRef.current = normalizeCoverValue(cover) !== normalizeCoverValue(profileState.cover.submitted);
    titleDirtyRef.current = title.trim() !== profileState.title.submitted.trim();
    areaDirtyRef.current =
      parent !== profileState.area.submitted_parent ||
      child !== profileState.area.submitted_child;
    tagsDirtyRef.current = tagsToKey(tags) !== tagsToKey(profileState.tags.submitted);
  }, [child, cover, parent, profileState, tags, title, coverDirtyRef, titleDirtyRef, areaDirtyRef, tagsDirtyRef]);

  useEffect(
    () => () => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
        confirmResolverRef.current = null;
      }
    },
    [confirmResolverRef],
  );

  useEffect(() => {
    danmuEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [danmuEndRef, danmus]);

  useEffect(() => {
    void loadSavedUser();
    void loadAccounts();
    void loadPartitions();
    void loadAppConfig();
    void loadLinkageStatus();
  }, [
    loadAccounts,
    loadAppConfig,
    loadLinkageStatus,
    loadPartitions,
    loadSavedUser,
  ]);

  useEffect(() => {
    if (!hasLiveAuth) {
      setSession(null);
      setRtmp(null);
      setDanmuListening(false);
      return;
    }
    void refreshSession();
    void loadLinkageStatus();
  }, [hasLiveAuth, loadLinkageStatus, refreshSession, setDanmuListening, setRtmp, setSession]);

  useEffect(() => {
    if (!currentUserUid?.trim()) {
      clearDanmuAssetsAndVoteState();
      return;
    }
    void syncLiveRoomProfile(false);
  }, [clearDanmuAssetsAndVoteState, currentUserUid, syncLiveRoomProfile]);

  useEffect(() => {
    if (!currentUserUid?.trim()) {
      clearDanmuAssetsAndVoteState();
      return;
    }
    void loadLiveEmoticons();
  }, [clearDanmuAssetsAndVoteState, currentUserUid, loadLiveEmoticons]);

  useEffect(() => {
    if (!currentUserUid?.trim()) {
      clearLiveVoteState();
      return;
    }
    void loadLiveVoteData();
  }, [clearLiveVoteState, currentUserUid, loadLiveVoteData]);

  useEffect(() => {
    if (!currentUserUid?.trim()) {
      return;
    }
    void loadLiveOnlineRank({ silent: true });
  }, [currentUserUid, loadLiveOnlineRank]);

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
  }, [cancelQrcodeLogin, pollLogin, qrcodeKey, qrLoginExpiresAt, setQrLoginRemainingSeconds]);

  useEffect(() => {
    return () => {
      clearLiveVoteSyncTimer();
    };
  }, [clearLiveVoteSyncTimer]);

  useTauriEvent(studioApi.listenStudioState, (event) => {
    switch (event.kind) {
      case "runtime.accounts_changed": {
        void loadSavedUser();
        void loadAccounts();
        break;
      }
      case "runtime.snapshot": {
        if (!hasLiveAuth) {
          break;
        }
        const nextSession = event.data?.session;
        if (nextSession) {
          setSession(nextSession);
          const liveSessionState = resolveSessionLiveState(nextSession);
          if (!liveSessionState.isLive) {
            setRtmp(null);
            clearLiveStreamInfoCache();
          } else {
            const cachedStreamInfo = readLiveStreamInfoCache(nextSession.uid ?? currentUserUid);
            if (cachedStreamInfo) {
              setRtmp((prev) => prev || cachedStreamInfo);
            }
          }
        }
        if (typeof event.data?.danmu_running === "boolean") {
          setDanmuListening(event.data.danmu_running);
        }
        const linkage = event.data?.linkage_status as any;
        if (linkage) {
          setLinkageStatus(linkage);
        }
        const onlineRank = event.data?.online_rank as any;
        if (onlineRank) {
          const onlineRankItems = Array.isArray(onlineRank.online_rank_items)
            ? onlineRank.online_rank_items.map((item: any) => ({
                user_rank: Number(item.user_rank ?? 0),
                uid: String(item.uid ?? ""),
                name: String(item.name ?? ""),
                face: String(item.face ?? ""),
              }))
            : [];
          setLiveOnlineRankData({
            online_num: Number(onlineRank.online_num ?? 0),
            online_rank_items: onlineRankItems,
          });
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
          setRtmp(null);
          clearLiveStreamInfoCache();
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
      case "danmu.monitor": {
        if (event.source !== "command.switch_account.auto_start") {
          break;
        }
        const running = event.data?.running === true;
        if (running) {
          append(t(localeSetting, "ui.ctrl.switch_account_danmu_auto_resume_ok"));
          break;
        }
        append(
          tf(localeSetting, "ui.ctrl.switch_account_danmu_auto_resume_failed", {
            msg: resolveBackendMessage(String(event.data?.msg || "unknown"), localeSetting),
          }),
        );
        break;
      }
      default:
        break;
    }
  });

  useEffect(() => {
    void studioApi.getAppLogs().then((res) => {
      if (res.code === 0 && Array.isArray(res.data)) {
        setLogs(res.data.filter((item) => typeof item === "string" && item.trim().length > 0));
      }
    });
  }, [setLogs]);

  useTauriEvent(studioApi.listenAppLog, (payload) => {
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
}
