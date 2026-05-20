import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { studioApi } from "../../services/studioApi";
import type {
  LiveEmoticonPackage,
  LiveVoteInfo,
  LiveVotePanelData,
} from "../../types/studio";
import { createLiveEmoticonIndex } from "../../utils/danmu";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";
import {
  DEFAULT_LIVE_VOTE_DURATION,
  isLiveVoteActive,
  normalizeLiveVoteHistory,
  normalizeLiveVotePanelData,
} from "./liveVoteUtils";

const LIVE_VOTE_SYNC_DEBOUNCE_MS = 800;

type RequestConfirmPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: "primary" | "danger";
};

type UseDanmuVoteControllerParams = {
  activeUidRef: MutableRefObject<string | null>;
  sessionRoomId: string | null | undefined;
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  requestConfirm: (payload: RequestConfirmPayload) => Promise<boolean>;
};

export function useDanmuVoteController({
  activeUidRef,
  sessionRoomId,
  localeSetting,
  append,
  requestConfirm,
}: UseDanmuVoteControllerParams) {
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

  const liveVoteSyncTimerRef = useRef<number | null>(null);

  const liveEmoticonMap = useMemo(
    () => createLiveEmoticonIndex(liveEmoticonPackages),
    [liveEmoticonPackages],
  );

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

  const clearDanmuAssetsAndVoteState = useCallback(() => {
    setLiveEmoticonPackages([]);
    setLiveEmoticonsLoading(false);
    clearLiveVoteState();
  }, [clearLiveVoteState]);

  const loadLiveEmoticons = useCallback(async () => {
    if (!activeUidRef.current || !sessionRoomId) {
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
  }, [activeUidRef, append, localeSetting, sessionRoomId]);

  const loadLiveVoteData = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!activeUidRef.current || !sessionRoomId) {
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
    [activeUidRef, append, localeSetting, sessionRoomId],
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
    activeUidRef,
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
    [activeUidRef, append, loadLiveVoteData, localeSetting, requestConfirm],
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

  const clearLiveVoteSyncTimer = useCallback(() => {
    if (liveVoteSyncTimerRef.current !== null) {
      window.clearTimeout(liveVoteSyncTimerRef.current);
      liveVoteSyncTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearLiveVoteSyncTimer();
    },
    [clearLiveVoteSyncTimer],
  );

  return {
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
  };
}
