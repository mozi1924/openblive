
export interface MsgHandler {
  onAddText: (data: any) => void;
  onAddGift: (data: any) => void;
  onAddMember: (data: any) => void;
  onAddSuperChat: (data: any) => void;
  onDelSuperChat: (data: any) => void;
  onUpdateTranslation: (data: any) => void;
  onFatalError: (error: any) => void;
  onDebugMsg: (data: any) => void;
}

export function getDefaultMsgHandler(): MsgHandler {
  const dummyFunc = () => {};
  return {
    onAddText: dummyFunc,
    onAddGift: dummyFunc,
    onAddMember: dummyFunc,
    onAddSuperChat: dummyFunc,
    onDelSuperChat: dummyFunc,
    onUpdateTranslation: dummyFunc,
    onFatalError: dummyFunc,
    onDebugMsg: dummyFunc,
  };
}

export const DEFAULT_AVATAR_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiB2aWV3Qm94PSIwIDAgMTI4IDEyOCI+PGNpcmNsZSBjeD0iNjQiIGN5PSI2NCIgcj0iNjQiIGZpbGw9IiNlMGUwZTAiLz48Y2lyY2xlIGN4PSI2NCIgY3k9IjQ2IiByPSIyNCIgZmlsbD0iIzllOWU5ZSIvPjxwYXRoIGQ9Ik02NCA3OGMtMjYuNSAwLTQ4IDE1LjctNDggMzUgMCAyIDEuNiAzLjYgMy42IDMuNmg4OC44YzIgMCAzLjYtMS42IDMuNi0zLjYgMC0xOS4zLTIxLjUtMzUtNDgtMzV6IiBmaWxsPSIjOWU5ZTllIi8+PC9zdmc+";

export function processAvatarUrl(avatarUrl?: string | null): string {
  if (!avatarUrl || typeof avatarUrl !== "string" || avatarUrl.trim() === "" || avatarUrl === "//") {
    return DEFAULT_AVATAR_URL;
  }
  const trimmed = avatarUrl.trim();
  if (trimmed.startsWith("data:") || trimmed.startsWith("/api/") || trimmed.startsWith("http://127.0.0.1") || trimmed.startsWith("http://localhost")) {
    return trimmed;
  }
  return `/api/avatar_url?face=${encodeURIComponent(trimmed)}`;
}

export function getDefaultAvatarUrl(uid?: string | number | null, _username = ""): string {
  if (uid !== null && uid !== undefined && `${uid}` !== "" && `${uid}` !== "0") {
    return `/api/avatar_url?uid=${encodeURIComponent(uid)}`;
  }
  return DEFAULT_AVATAR_URL;
}

export function resolveAvatarUrl(avatarUrl?: string | null, uid?: string | number | null, username = ""): string {
  if (avatarUrl && avatarUrl !== "" && avatarUrl !== "//") {
    return processAvatarUrl(avatarUrl);
  }
  return getDefaultAvatarUrl(uid, username);
}


export async function getTextEmoticons(): Promise<Array<{ keyword: string; url: string }>> {
  try {
    const res = await fetch("/api/text_emoticon_mappings");
    if (!res.ok) {
      return [];
    }
    const data = await res.json();
    return data.textEmoticons || [];
  } catch {
    return [];
  }
}

// 开放平台接口不会发送是否是礼物弹幕，只能用内容判断了
const GIFT_DANMAKU_CONTENTS = new Set([
  // 红包
  "老板大气！点点红包抽礼物",
  "老板大气！点点红包抽礼物！",
  "点点红包，关注主播抽礼物～",
  "喜欢主播加关注，点点红包抽礼物",
  "红包抽礼物，开启今日好运！",
  "中奖喷雾！中奖喷雾！",
  // 节奏风暴
  "前方高能预警，注意这不是演习",
  "我从未见过如此厚颜无耻之人",
  "那万一赢了呢",
  "你们城里人真会玩",
  "左舷弹幕太薄了",
  "要优雅，不要污",
  "我选择狗带",
  "可爱即正义~~",
  "糟了，是心动的感觉！",
  "这个直播间已经被我们承包了！",
  "妈妈问我为什么跪着看直播 w(ﾟДﾟ)w",
  "你们对力量一无所知~(￣▽￣)~",
]);

export function isGiftDanmakuByContent(content: string): boolean {
  return GIFT_DANMAKU_CONTENTS.has(content);
}
