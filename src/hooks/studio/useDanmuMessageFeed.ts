import { useCallback, useEffect, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type { DanmuMsg } from "../../types/studio";
import { createLiveEmoticonIndex, createSelfDanmuMessage } from "../../utils/danmu";
import type { LocaleSetting } from "../../utils/i18n";
import { useTauriEvent } from "../useTauriEvent";
import { applyIncomingRealtimeMessage, applyResolvedDanmuAvatar } from "./realtimeDanmu";

type UseDanmuMessageFeedParams = {
  localeSetting: LocaleSetting;
  liveEmoticonMap: ReturnType<typeof createLiveEmoticonIndex>;
  currentUserUid?: string | null;
  maxMessages?: number;
  onRealtimeMessage?: (message: DanmuMsg) => void;
};

const normalizeMessageLimit = (value?: number) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : null;

export function useDanmuMessageFeed({
  localeSetting,
  liveEmoticonMap,
  currentUserUid,
  maxMessages,
  onRealtimeMessage,
}: UseDanmuMessageFeedParams) {
  const [danmus, setDanmus] = useState<DanmuMsg[]>([]);
  const messageLimit = normalizeMessageLimit(maxMessages);

  const applyLimit = useCallback(
    (messages: DanmuMsg[]) => {
      if (!messageLimit) {
        return messages;
      }
      return messages.slice(0, messageLimit);
    },
    [messageLimit],
  );

  const resolveDanmuSegments = useCallback(
    (message: DanmuMsg): DanmuMsg => {
      if (message.type !== "danmu" || (message.segments && message.segments.length > 0)) {
        return message;
      }
      const fallback = createSelfDanmuMessage(
        message.content,
        message.sender,
        liveEmoticonMap,
        {
          sender_uid: message.sender_uid,
          sender_role: message.sender_role,
          sender_name_color: message.sender_name_color,
          sender_guard_level: message.sender_guard_level,
          sender_face: message.sender_face,
        },
      );
      return {
        ...message,
        segments: fallback.segments,
      };
    },
    [liveEmoticonMap],
  );

  const loadRecentDanmu = useCallback(async () => {
    const res = await studioApi.getRecentDanmu().catch(() => null);
    if (!res || res.code !== 0 || !Array.isArray(res.data)) {
      return;
    }
    const recent = applyLimit([...res.data].map(resolveDanmuSegments).reverse());
    setDanmus((prev) => {
      if (prev.length === 0) {
        return recent;
      }
      const seen = new Set(prev.map((item) => item.id));
      const appended = recent.filter((item) => !seen.has(item.id));
      if (appended.length === 0) {
        return prev;
      }
      return applyLimit([...prev, ...appended]);
    });
  }, [applyLimit, resolveDanmuSegments]);

  useEffect(() => {
    if (!currentUserUid?.trim()) {
      return;
    }
    void loadRecentDanmu();
  }, [currentUserUid, loadRecentDanmu]);

  useEffect(() => {
    if (liveEmoticonMap.size === 0) {
      return;
    }
    setDanmus((prev) => applyLimit(prev.map(resolveDanmuSegments)));
  }, [applyLimit, liveEmoticonMap, resolveDanmuSegments]);

  useTauriEvent(studioApi.listenDanmuMessage, (message) => {
    const resolvedMessage = resolveDanmuSegments(message);
    setDanmus((prev) =>
      applyLimit(applyIncomingRealtimeMessage(prev, resolvedMessage, localeSetting)),
    );
    onRealtimeMessage?.(message);
  });

  useTauriEvent(studioApi.listenDanmuAvatarResolved, (payload) => {
    setDanmus((prev) => applyLimit(applyResolvedDanmuAvatar(prev, payload)));
  });

  return {
    danmus,
    setDanmus,
    loadRecentDanmu,
  };
}
