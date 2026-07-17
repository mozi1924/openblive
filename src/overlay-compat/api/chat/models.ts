import { getUuid4Hex } from "../../utils";
import * as constants from "../../components/ChatRenderer/constants";
import * as chat from ".";

export class AddTextMsg {
  avatarUrl: string;
  timestamp: number;
  authorName: string;
  authorType: number;
  content: string;
  privilegeType: number;
  isGiftDanmaku: boolean;
  authorLevel: number;
  isNewbie: boolean;
  isMobileVerified: boolean;
  medalLevel: number;
  id: string;
  translation: string;
  emoticon: string | null;
  isMirror: boolean;
  uid: string | number;
  medalName: string;

  constructor({
    avatarUrl = chat.DEFAULT_AVATAR_URL,
    timestamp = new Date().getTime() / 1000,
    authorName = "",
    authorType = constants.AUTHOR_TYPE_NORMAL,
    content = "",
    privilegeType = 0,
    isGiftDanmaku = false,
    authorLevel = 1,
    isNewbie = false,
    isMobileVerified = true,
    medalLevel = 0,
    id = getUuid4Hex(),
    translation = "",
    emoticon = null,
    isMirror = false,
    uid = "",
    medalName = "",
  }: Partial<AddTextMsg> = {}) {
    this.avatarUrl = avatarUrl;
    this.timestamp = timestamp;
    this.authorName = authorName;
    this.authorType = authorType;
    this.content = content;
    this.privilegeType = privilegeType;
    this.isGiftDanmaku = isGiftDanmaku;
    this.authorLevel = authorLevel;
    this.isNewbie = isNewbie;
    this.isMobileVerified = isMobileVerified;
    this.medalLevel = medalLevel;
    this.id = id;
    this.translation = translation;
    this.emoticon = emoticon;
    this.isMirror = isMirror;
    this.uid = uid;
    this.medalName = medalName;
  }
}

export class AddGiftMsg {
  id: string;
  avatarUrl: string;
  timestamp: number;
  authorName: string;
  totalCoin: number;
  totalFreeCoin: number;
  giftName: string;
  num: number;
  giftId: number;
  giftIconUrl: string;
  uid: string | number;
  privilegeType: number;
  medalLevel: number;
  medalName: string;

  constructor({
    id = getUuid4Hex(),
    avatarUrl = chat.DEFAULT_AVATAR_URL,
    timestamp = new Date().getTime() / 1000,
    authorName = "",
    totalCoin = 0,
    totalFreeCoin = 0,
    giftName = "",
    num = 1,
    giftId = 0,
    giftIconUrl = "",
    uid = "",
    privilegeType = 0,
    medalLevel = 0,
    medalName = "",
  }: Partial<AddGiftMsg> = {}) {
    this.id = id;
    this.avatarUrl = avatarUrl;
    this.timestamp = timestamp;
    this.authorName = authorName;
    this.totalCoin = totalCoin;
    this.totalFreeCoin = totalFreeCoin;
    this.giftName = giftName;
    this.num = num;
    this.giftId = giftId;
    this.giftIconUrl = giftIconUrl;
    this.uid = uid;
    this.privilegeType = privilegeType;
    this.medalLevel = medalLevel;
    this.medalName = medalName;
  }
}

export class AddMemberMsg {
  id: string;
  avatarUrl: string;
  timestamp: number;
  authorName: string;
  privilegeType: number;
  num: number;
  unit: string;
  totalCoin: number;
  uid: string | number;
  medalLevel: number;
  medalName: string;

  constructor({
    id = getUuid4Hex(),
    avatarUrl = chat.DEFAULT_AVATAR_URL,
    timestamp = new Date().getTime() / 1000,
    authorName = "",
    privilegeType = 1,
    num = 1,
    unit = "月",
    totalCoin = 0,
    uid = "",
    medalLevel = 0,
    medalName = "",
  }: Partial<AddMemberMsg> = {}) {
    this.id = id;
    this.avatarUrl = avatarUrl;
    this.timestamp = timestamp;
    this.authorName = authorName;
    this.privilegeType = privilegeType;
    this.num = num;
    this.unit = unit;
    this.totalCoin = totalCoin;
    this.uid = uid;
    this.medalLevel = medalLevel;
    this.medalName = medalName;
  }
}

export class AddSuperChatMsg {
  id: string;
  avatarUrl: string;
  timestamp: number;
  authorName: string;
  price: number;
  content: string;
  translation: string;
  uid: string | number;
  privilegeType: number;
  medalLevel: number;
  medalName: string;

  constructor({
    id = getUuid4Hex(),
    avatarUrl = chat.DEFAULT_AVATAR_URL,
    timestamp = new Date().getTime() / 1000,
    authorName = "",
    price = 0,
    content = "",
    translation = "",
    uid = "",
    privilegeType = 0,
    medalLevel = 0,
    medalName = "",
  }: Partial<AddSuperChatMsg> = {}) {
    this.id = id;
    this.avatarUrl = avatarUrl;
    this.timestamp = timestamp;
    this.authorName = authorName;
    this.price = price;
    this.content = content;
    this.translation = translation;
    this.uid = uid;
    this.privilegeType = privilegeType;
    this.medalLevel = medalLevel;
    this.medalName = medalName;
  }
}

export class DelSuperChatMsg {
  ids: string[];
  constructor({ ids = [] }: { ids?: string[] } = {}) {
    this.ids = ids;
  }
}

export class UpdateTranslationMsg {
  id: string;
  translation: string;
  constructor({ id = getUuid4Hex(), translation = "" }: { id?: string; translation?: string } = {}) {
    this.id = id;
    this.translation = translation;
  }
}

export const FATAL_ERROR_TYPE_AUTH_CODE_ERROR = 1;
export const FATAL_ERROR_TYPE_TOO_MANY_RETRIES = 2;
export const FATAL_ERROR_TYPE_TOO_MANY_CONNECTIONS = 3;

export class ChatClientFatalError extends Error {
  type: number;
  constructor(type: number, message: string) {
    super(message);
    this.type = type;
  }
}

export class DebugMsg {
  content: string;
  constructor({ content = "" }: { content?: string } = {}) {
    this.content = content;
  }
}
