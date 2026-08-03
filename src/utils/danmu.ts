import type {
  AppConfig,
  DanmuContentSegment,
  DanmuEmoticon,
  DanmuMsg,
  LiveEmoticonPackage,
} from "../types/studio";
import { normalizeAssetUrl } from "./assetUrl";

export { normalizeAssetUrl };

const createMessageId = () => Math.random().toString(36).slice(2, 9);
const getNow = () => new Date().toLocaleTimeString();
const EMOTICON_TOKEN_REGEX = /\[[^[\]]+\]/g;

export const normalizeDanmuEmoticon = (
  emoticon?: DanmuEmoticon | null,
): DanmuEmoticon | undefined => {
  if (!emoticon) {
    return undefined;
  }

  const text = normalizeEmoticonText(emoticon.text);
  const url = normalizeAssetUrl(emoticon.url);
  if (!text || !url) {
    return undefined;
  }

  return {
    ...emoticon,
    text,
    url,
  };
};

export const normalizeEmoticonText = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }
  return `[${trimmed}]`;
};

export const resolveEmoticonStyle = (
  width: number,
  height: number,
  targetHeight: number,
) => {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  const resolvedWidth = Math.max(targetHeight, Math.round(targetHeight * ratio));
  return {
    width: `${Math.min(resolvedWidth, targetHeight * 3.4)}px`,
    height: `${targetHeight}px`,
  };
};

export const normalizeDanmuSegments = (
  segments?: DanmuContentSegment[],
): DanmuContentSegment[] | undefined => {
  if (!segments?.length) {
    return undefined;
  }

  const normalized = segments.reduce<DanmuContentSegment[]>((acc, segment) => {
    if (segment.type === "text") {
      if (segment.text) {
        acc.push(segment);
      }
      return acc;
    }

    const emoticon = normalizeDanmuEmoticon(segment.emoticon);
    if (!emoticon) {
      return acc;
    }

    acc.push({
      type: "emoticon" as const,
      text: normalizeEmoticonText(segment.text || emoticon.text),
      emoticon,
    });
    return acc;
  }, []);

  return normalized.length > 0 ? normalized : undefined;
};


const buildSegments = (
  content: string,
  primaryMap: Map<string, DanmuEmoticon>,
  fallbackMap?: Map<string, DanmuEmoticon>,
): DanmuContentSegment[] | undefined => {
  if (!content) {
    return undefined;
  }

  const segments: DanmuContentSegment[] = [];
  let lastIndex = 0;
  let matched = false;

  for (const match of content.matchAll(EMOTICON_TOKEN_REGEX)) {
    const token = match[0];
    const index = match.index ?? 0;
    const primary = primaryMap.get(token);
    const fallback = fallbackMap?.get(token);
    const baseEmoticon = primary ?? fallback;
    const emoticon = baseEmoticon
      ? {
          ...baseEmoticon,
          url: fallback?.url || primary?.url || baseEmoticon.url,
        }
      : null;

    if (!emoticon?.url) {
      continue;
    }

    if (index > lastIndex) {
      segments.push({
        type: "text",
        text: content.slice(lastIndex, index),
      });
    }

    segments.push({
      type: "emoticon",
      text: token,
      emoticon,
    });
    lastIndex = index + token.length;
    matched = true;
  }

  if (!matched) {
    return undefined;
  }

  if (lastIndex < content.length) {
    segments.push({
      type: "text",
      text: content.slice(lastIndex),
    });
  }

  return segments;
};

export const resolveDanmuMessageSegments = (
  message: Pick<DanmuMsg, "content" | "segments" | "emoticon">,
  emoticonMap?: Map<string, DanmuEmoticon>,
): DanmuContentSegment[] | undefined => {
  const normalizedSegments = normalizeDanmuSegments(message.segments);
  if (normalizedSegments?.length) {
    return normalizedSegments;
  }

  const normalizedEmoticon = normalizeDanmuEmoticon(message.emoticon);
  if (normalizedEmoticon) {
    const token = normalizedEmoticon.text;
    const directSegments = buildSegments(message.content, new Map([[token, normalizedEmoticon]]));
    if (directSegments?.length) {
      return directSegments;
    }
    if (message.content.trim() === token) {
      return [{
        type: "emoticon",
        text: token,
        emoticon: normalizedEmoticon,
      }];
    }
  }

  if (!emoticonMap) {
    return undefined;
  }

  return buildSegments(message.content, emoticonMap);
};

export const createLiveEmoticonIndex = (packages: LiveEmoticonPackage[]) => {
  const map = new Map<string, DanmuEmoticon>();
  for (const pkg of packages) {
    for (const emoticon of pkg.emoticons) {
      const text = normalizeEmoticonText(emoticon.text || emoticon.label);
      const url = normalizeAssetUrl(emoticon.url);
      if (!text || !url) {
        continue;
      }
      map.set(text, {
        emoticon_id: emoticon.emoticon_id,
        emoticon_unique: emoticon.emoticon_unique,
        text,
        url,
        width: emoticon.width,
        height: emoticon.height,
        is_dynamic: emoticon.is_dynamic,
      });
    }
  }
  return map;
};

export const createSelfDanmuMessage = (
  content: string,
  sender: string,
  emoticonMap?: Map<string, DanmuEmoticon>,
  senderMeta?: Pick<
    DanmuMsg,
    | "sender_uid"
    | "sender_role"
    | "sender_name_color"
    | "sender_guard_level"
    | "sender_face"
  >,
  status: "sending" | "success" | "failed" = "sending",
): DanmuMsg => {
  const normalizedSenderMeta = senderMeta
    ? {
        ...senderMeta,
        sender_face: senderMeta.sender_face ? normalizeAssetUrl(senderMeta.sender_face) : undefined,
      }
    : undefined;

  return {
    id: createMessageId(),
    type: "danmu",
    time: getNow(),
    created_at_ms: Date.now(),
    sender,
    content,
    optimistic: true,
    status,
    ...normalizedSenderMeta,
    segments: emoticonMap ? resolveDanmuMessageSegments({ content }, emoticonMap) : undefined,
  };
};

const isSameSender = (left: DanmuMsg, right: DanmuMsg) => {
  if (typeof left.sender_uid === "number" && typeof right.sender_uid === "number") {
    return left.sender_uid === right.sender_uid;
  }
  return left.sender === right.sender;
};

export const upsertIncomingDanmuMessage = (
  prev: DanmuMsg[],
  incoming: DanmuMsg,
): DanmuMsg[] => {
  if (incoming.type !== "danmu") {
    return [incoming, ...prev];
  }

  const optimisticIndex = prev.findIndex(
    (message) =>
      message.type === "danmu" &&
      message.optimistic &&
      isSameSender(message, incoming) &&
      message.content === incoming.content,
  );

  if (optimisticIndex === -1) {
    return [incoming, ...prev];
  }

  return prev.map((message, index) => (index === optimisticIndex ? incoming : message));
};

export const shouldFilterDanmuMessage = (
  message: DanmuMsg,
  config: AppConfig | null,
): boolean => {
  const filterEntryEffect = config?.filter_entry_effect ?? true;
  const filterEnterMsg = config?.filter_enter_msg ?? false;
  const filterGuardStatus = config?.filter_guard_status ?? true;
  const filterFollowShareMsg = config?.filter_follow_share_msg ?? false;

  if (
    filterEntryEffect &&
    (message.cmd === "ENTRY_EFFECT" || message.cmd === "ENTRY_EFFECT_MUST_RECEIVE")
  ) {
    return true;
  }

  if (
    filterGuardStatus &&
    (message.cmd === "GUARD_HONOR_THOUSAND" ||
      (message.type === "live_state" && message.content.includes("guard_honor")))
  ) {
    return true;
  }

  if (
    filterEnterMsg &&
    message.type === "interact" &&
    message.interact_type === "enter" &&
    message.cmd !== "ENTRY_EFFECT" &&
    message.cmd !== "ENTRY_EFFECT_MUST_RECEIVE"
  ) {
    return true;
  }

  if (
    filterFollowShareMsg &&
    message.type === "interact" &&
    (message.interact_type === "follow" || message.interact_type === "share")
  ) {
    return true;
  }

  return false;
};

