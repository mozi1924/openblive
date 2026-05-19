import type {
  DanmuContentSegment,
  DanmuEmoticon,
  DanmuEventPayload,
  DanmuMsg,
  LiveEmoticonPackage,
} from "../types/studio";
import { t, tf, type LocaleSetting } from "./i18n";

const createMessageId = () => Math.random().toString(36).slice(2, 9);

const getNow = () => new Date().toLocaleTimeString();

const EMOTICON_TOKEN_REGEX = /\[[^[\]]+\]/g;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeAssetUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("data:")) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("http://")) {
    return `https://${trimmed.slice("http://".length)}`;
  }
  return trimmed;
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

const toDanmuEmoticon = (
  source: Record<string, unknown>,
  fallbackText = "",
): DanmuEmoticon | null => {
  const text = normalizeEmoticonText(
    typeof source.text === "string"
      ? source.text
      : typeof source.emoji === "string"
        ? source.emoji
        : typeof source.descript === "string"
          ? source.descript
          : fallbackText,
  );
  const url = normalizeAssetUrl(typeof source.url === "string" ? source.url : "");
  if (!text || !url) {
    return null;
  }

  const width =
    typeof source.width === "number" && Number.isFinite(source.width) ? source.width : 20;
  const height =
    typeof source.height === "number" && Number.isFinite(source.height) ? source.height : 20;
  const rawId = source.emoticon_id ?? source.emotion_id;
  const rawUnique = source.emoticon_unique ?? source.emotion_unique;
  const rawDynamic = source.is_dynamic;

  return {
    emoticon_id: typeof rawId === "number" && Number.isFinite(rawId) ? rawId : undefined,
    emoticon_unique: typeof rawUnique === "string" ? rawUnique : undefined,
    text,
    url,
    width,
    height,
    is_dynamic:
      typeof rawDynamic === "number"
        ? rawDynamic > 0
        : typeof rawDynamic === "boolean"
          ? rawDynamic
          : undefined,
  };
};

const buildEventEmoticonMap = (payload: DanmuEventPayload) => {
  const map = new Map<string, DanmuEmoticon>();
  const info = payload.info;
  if (!Array.isArray(info) || !Array.isArray(info[0])) {
    return map;
  }

  const meta = info[0][15];
  if (!isRecord(meta)) {
    return map;
  }

  const pushMap = (value: unknown) => {
    if (!isRecord(value)) {
      return;
    }
    for (const [token, raw] of Object.entries(value)) {
      if (!isRecord(raw)) {
        continue;
      }
      const emoticon = toDanmuEmoticon(raw, token);
      if (emoticon) {
        map.set(emoticon.text, emoticon);
      }
    }
  };

  if (isRecord(meta.emoticon)) {
    const emoticon = toDanmuEmoticon(meta.emoticon);
    if (emoticon) {
      map.set(emoticon.text, emoticon);
    }
  }

  const extra = meta.extra;
  const extraPayload =
    typeof extra === "string"
      ? (() => {
          try {
            const parsed: unknown = JSON.parse(extra);
            return isRecord(parsed) ? parsed : null;
          } catch {
            return null;
          }
        })()
      : isRecord(extra)
        ? extra
        : null;
  if (extraPayload) {
    pushMap(extraPayload.emots);
  }

  return map;
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
): DanmuMsg => ({
  id: createMessageId(),
  type: "danmu",
  time: getNow(),
  sender,
  content,
  segments: emoticonMap ? buildSegments(content, emoticonMap) : undefined,
});

export const parseDanmuEvent = (
  payload: DanmuEventPayload,
  locale: LocaleSetting = "auto",
  fallbackEmoticonMap?: Map<string, DanmuEmoticon>,
): DanmuMsg | null => {
  const cmd = payload.cmd ?? "UNKNOWN";
  const time = getNow();
  const id = createMessageId();

  if (cmd.startsWith("DANMU_MSG")) {
    const info = payload.info;
    if (!Array.isArray(info)) {
      return null;
    }

    const senderMeta = Array.isArray(info[2]) ? info[2] : [];
    const content = typeof info[1] === "string" ? info[1] : "";
    const eventEmoticonMap = buildEventEmoticonMap(payload);

    return {
      id,
      type: "danmu",
      time,
      sender:
        typeof senderMeta[1] === "string"
          ? senderMeta[1]
          : t(locale, "ui.danmu.sender.anonymous"),
      content,
      segments: buildSegments(content, eventEmoticonMap, fallbackEmoticonMap),
    };
  }

  if (cmd === "SEND_GIFT") {
    const data = payload.data ?? {};
    return {
      id,
      type: "gift",
      time,
      sender:
        typeof data.uname === "string"
          ? data.uname
          : t(locale, "ui.danmu.sender.gift_user"),
      content: tf(locale, "ui.danmu.content.gift", {
        gift:
          typeof data.giftName === "string"
            ? data.giftName
            : t(locale, "ui.danmu.content.gift_default"),
        num: typeof data.num === "number" ? data.num : 1,
      }),
    };
  }

  if (cmd === "GUARD_BUY") {
    const data = payload.data ?? {};
    return {
      id,
      type: "guard",
      time,
      sender:
        typeof data.username === "string"
          ? data.username
          : t(locale, "ui.danmu.sender.guard_user"),
      content: tf(locale, "ui.danmu.content.guard", {
        guard:
          typeof data.gift_name === "string"
            ? data.gift_name
            : t(locale, "ui.danmu.content.guard_default"),
      }),
    };
  }

  return null;
};
