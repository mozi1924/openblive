import { useCallback, useEffect, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type { DanmuMsg } from "../../types/studio";
import {
  createLiveEmoticonIndex,
  createSelfDanmuMessage,
  normalizeDanmuEmoticon,
  resolveDanmuMessageSegments,
} from "../../utils/danmu";
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
      if (message.type !== "danmu") {
        return message;
      }

      const normalizedEmoticon = normalizeDanmuEmoticon(message.emoticon);
      const resolvedSegments = resolveDanmuMessageSegments(message, liveEmoticonMap);
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

      if (
        resolvedSegments === message.segments &&
        (normalizedEmoticon?.url || "") === (message.emoticon?.url || "")
      ) {
        return message;
      }

      if (!resolvedSegments && !normalizedEmoticon && !fallback.segments) {
        return message;
      }

      return {
        ...message,
        emoticon: normalizedEmoticon ?? message.emoticon,
        segments: resolvedSegments ?? fallback.segments,
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
      const recentById = new Map(recent.map((item) => [item.id, item] as const));
      const merged = prev.map((item) => recentById.get(item.id) ?? item);
      const seen = new Set(prev.map((item) => item.id));
      const appended = recent.filter((item) => !seen.has(item.id));
      if (appended.length === 0 && merged.every((item, index) => item === prev[index])) {
        return prev;
      }
      return applyLimit([...merged, ...appended]);
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
    void loadRecentDanmu();
  }, [applyLimit, liveEmoticonMap, loadRecentDanmu, resolveDanmuSegments]);

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
