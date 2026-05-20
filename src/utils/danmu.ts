import type {
  DanmuContentSegment,
  DanmuEmoticon,
  DanmuMsg,
  LiveEmoticonPackage,
} from "../types/studio";

const createMessageId = () => Math.random().toString(36).slice(2, 9);

const getNow = () => new Date().toLocaleTimeString();

const EMOTICON_TOKEN_REGEX = /\[[^[\]]+\]/g;

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
