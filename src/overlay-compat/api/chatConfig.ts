export interface ChatConfig {
  minGiftPrice: number;
  showDanmaku: boolean;
  showGift: boolean;
  showGiftName: boolean;
  mergeSimilarDanmaku: boolean;
  mergeGift: boolean;
  maxNumber: number;

  blockGiftDanmaku: boolean;
  blockMirrorMessages: boolean;
  blockLevel: number;
  blockNewbie: boolean;
  blockNotMobileVerified: boolean;
  blockKeywords: string;
  blockUsers: string;
  blockMedalLevel: number;

  showDebugMessages: boolean;
  autoTranslate: boolean;

  emoticons: Array<{ keyword: string; url: string }>;
}

export const DEFAULT_CONFIG: ChatConfig = {
  minGiftPrice: 0.1,
  showDanmaku: true,
  showGift: true,
  showGiftName: false,
  mergeSimilarDanmaku: false,
  mergeGift: true,
  maxNumber: 60,

  blockGiftDanmaku: true,
  blockMirrorMessages: false,
  blockLevel: 0,
  blockNewbie: false,
  blockNotMobileVerified: false,
  blockKeywords: "",
  blockUsers: "",
  blockMedalLevel: 0,

  showDebugMessages: false,
  autoTranslate: false,

  emoticons: [], // [{ keyword: '', url: '' }, ...]
};

export function deepCloneDefaultConfig(): ChatConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function sanitizeConfig(config: ChatConfig) {
  const newEmoticons: Array<{ keyword: string; url: string }> = [];
  if (config.emoticons instanceof Array) {
    for (const emoticon of config.emoticons) {
      try {
        const newEmoticon = {
          keyword: emoticon.keyword,
          url: emoticon.url,
        };
        if (typeof newEmoticon.keyword !== "string" || typeof newEmoticon.url !== "string") {
          continue;
        }
        newEmoticons.push(newEmoticon);
      } catch {
        continue;
      }
    }
  }
  config.emoticons = newEmoticons;
}
