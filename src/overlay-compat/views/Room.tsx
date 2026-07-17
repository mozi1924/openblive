import { useEffect, useRef, useState, useMemo } from "react";
import * as i18n from "../lang/i18n";
import { mergeConfig, toBool, toInt, toFloat } from "../utils";
import * as trie from "../utils/trie";
import * as chatConfig from "../api/chatConfig";
import * as chat from "../api/chat";
import * as chatModels from "../api/chat/models";
import { ChatRenderer, ChatRendererRef } from "../components/ChatRenderer";
import * as constants from "../components/ChatRenderer/constants";
import ChatClientRelay from "../api/chat/ChatClientRelay";

interface RoomProps {
  roomKeyType?: number;
  roomKeyValue?: string | number | null;
  strConfig?: Record<string, string>;
}

export default function Room({
  roomKeyType = 1,
  roomKeyValue = null,
  strConfig = {},
}: RoomProps) {
  const [config, setConfig] = useState<chatConfig.ChatConfig>(chatConfig.deepCloneDefaultConfig());
  const [textEmoticons, setTextEmoticons] = useState<any[]>([]);

  const chatClient = useRef<ChatClientRelay | null>(null);
  const pendingMsgIdToPromise = useRef<Map<string, Promise<void>>>(new Map());
  const rendererRef = useRef<ChatRendererRef | null>(null);

  // Parse configurations from query parameters
  const initConfig = () => {
    const locale = strConfig.lang;
    if (locale) {
      i18n.setLocale(locale);
    }

    let cfg: Record<string, any> = {};
    for (const key in strConfig) {
      if (strConfig[key] !== "") {
        cfg[key] = strConfig[key];
      }
    }
    cfg = mergeConfig(cfg, chatConfig.deepCloneDefaultConfig());

    cfg.minGiftPrice = toFloat(cfg.minGiftPrice, chatConfig.DEFAULT_CONFIG.minGiftPrice);
    cfg.showDanmaku = toBool(cfg.showDanmaku);
    cfg.showGift = toBool(cfg.showGift);
    cfg.showGiftName = toBool(cfg.showGiftName);
    cfg.mergeSimilarDanmaku = toBool(cfg.mergeSimilarDanmaku);
    cfg.mergeGift = toBool(cfg.mergeGift);
    cfg.maxNumber = toInt(cfg.maxNumber, chatConfig.DEFAULT_CONFIG.maxNumber);

    cfg.blockGiftDanmaku = toBool(cfg.blockGiftDanmaku);
    cfg.blockMirrorMessages = toBool(cfg.blockMirrorMessages);
    cfg.blockLevel = toInt(cfg.blockLevel, chatConfig.DEFAULT_CONFIG.blockLevel);
    cfg.blockNewbie = toBool(cfg.blockNewbie);
    cfg.blockNotMobileVerified = toBool(cfg.blockNotMobileVerified);
    cfg.blockMedalLevel = toInt(cfg.blockMedalLevel, chatConfig.DEFAULT_CONFIG.blockMedalLevel);

    cfg.showDebugMessages = toBool(cfg.showDebugMessages);
    cfg.autoTranslate = toBool(cfg.autoTranslate);

    const toObjIfJson = (str: any) => {
      if (typeof str !== "string") return str;
      try {
        return JSON.parse(str);
      } catch {
        return {};
      }
    };
    cfg.emoticons = toObjIfJson(cfg.emoticons);

    chatConfig.sanitizeConfig(cfg as chatConfig.ChatConfig);
    setConfig(cfg as chatConfig.ChatConfig);
  };

  // Memoize Trie structures for filtering
  const blockKeywordsTrie = useMemo(() => {
    const blockKeywords = config.blockKeywords.split("\n");
    const res = new trie.Trie();
    for (const keyword of blockKeywords) {
      if (keyword !== "") {
        res.set(keyword, true);
      }
    }
    return res;
  }, [config.blockKeywords]);

  const blockUsersSet = useMemo(() => {
    let blockUsers = config.blockUsers.split("\n");
    blockUsers = blockUsers.filter((user) => user !== "");
    return new Set(blockUsers);
  }, [config.blockUsers]);

  const emoticonsTrie = useMemo(() => {
    const res = new trie.Trie();
    for (const emoticons of [config.emoticons, textEmoticons]) {
      for (const emoticon of emoticons) {
        if (emoticon.keyword !== "" && emoticon.url !== "") {
          res.set(emoticon.keyword, emoticon);
        }
      }
    }
    return res;
  }, [config.emoticons, textEmoticons]);

  // Keep a ref to the latest state to avoid stale closure issues in WebSocket callbacks
  const stateRef = useRef({
    config,
    blockKeywordsTrie,
    blockUsersSet,
    emoticonsTrie,
    textEmoticons,
  });
  stateRef.current = {
    config,
    blockKeywordsTrie,
    blockUsersSet,
    emoticonsTrie,
    textEmoticons,
  };

  // Helper functions
  const resolveBackendI18nText = (rawText: string): string => {
    if (typeof rawText !== "string" || rawText === "") {
      return rawText;
    }
    if (rawText === "i18n.live.event.room_change") {
      return i18n.t("i18n.live.event.room_change.full");
    }

    if (rawText.startsWith("i18n.")) {
      const splitIndex = rawText.indexOf(":");
      if (splitIndex > 0) {
        const key = rawText.slice(0, splitIndex);
        const suffix = rawText.slice(splitIndex + 1).split(":").join(" ");
        if (i18n.te(key)) {
          return suffix.trim() === "" ? i18n.t(key) : `${i18n.t(key)} ${suffix}`;
        }
      } else if (i18n.te(rawText)) {
        return i18n.t(rawText);
      }
    }

    return rawText.replace(/i18n\.[a-z0-9_.]+/gi, (token) =>
      i18n.te(token) ? i18n.t(token) : token
    );
  };

  const fillImageContentSizes = async (contentParts: any[]) => {
    const urlSizeMap = new Map<string, { width: number; height: number }>();
    for (const content of contentParts) {
      if (content.type === constants.CONTENT_PART_TYPE_IMAGE) {
        urlSizeMap.set(content.url, { width: 0, height: 0 });
      }
    }
    if (urlSizeMap.size === 0) {
      return;
    }

    const promises: Promise<void>[] = [];
    for (const url of urlSizeMap.keys()) {
      const urlInClosure = url;
      promises.push(
        new Promise<void>((resolve) => {
          const img = document.createElement("img");
          img.onload = () => {
            const size = urlSizeMap.get(urlInClosure);
            if (size) {
              size.width = img.naturalWidth;
              size.height = img.naturalHeight;
            }
            resolve();
          };
          img.onerror = () => resolve();
          window.setTimeout(() => resolve(), 5000);
          img.src = urlInClosure;
        })
      );
    }
    await Promise.all(promises);

    for (const content of contentParts) {
      if (content.type === constants.CONTENT_PART_TYPE_IMAGE) {
        const size = urlSizeMap.get(content.url);
        if (size) {
          content.width = size.width;
          content.height = size.height;
        }
      }
    }
  };

  const parseContentParts = async (data: any) => {
    const contentParts: any[] = [];

    if (data.emoticon !== null) {
      contentParts.push({
        type: constants.CONTENT_PART_TYPE_IMAGE,
        text: data.content,
        url: data.emoticon,
        width: 0,
        height: 0,
      });
      await fillImageContentSizes(contentParts);
      return contentParts;
    }

    if (
      stateRef.current.config.emoticons.length === 0 &&
      stateRef.current.textEmoticons.length === 0
    ) {
      contentParts.push({
        type: constants.CONTENT_PART_TYPE_TEXT,
        text: data.content,
      });
      return contentParts;
    }

    const trieObj = stateRef.current.emoticonsTrie;
    let startPos = 0;
    let pos = 0;
    while (pos < data.content.length) {
      const remainContent = data.content.substring(pos);
      const matchEmoticon = trieObj.lazyMatch(remainContent);
      if (matchEmoticon === null) {
        pos++;
        continue;
      }

      if (pos !== startPos) {
        contentParts.push({
          type: constants.CONTENT_PART_TYPE_TEXT,
          text: data.content.slice(startPos, pos),
        });
      }

      contentParts.push({
        type: constants.CONTENT_PART_TYPE_IMAGE,
        text: matchEmoticon.keyword,
        url: matchEmoticon.url,
        width: 0,
        height: 0,
      });
      pos += matchEmoticon.keyword.length;
      startPos = pos;
    }

    if (pos !== startPos) {
      contentParts.push({
        type: constants.CONTENT_PART_TYPE_TEXT,
        text: data.content.slice(startPos, pos),
      });
    }

    await fillImageContentSizes(contentParts);
    return contentParts;
  };

  const filterByContent = (content: string) => {
    const trieObj = stateRef.current.blockKeywordsTrie;
    for (let i = 0; i < content.length; i++) {
      const remainContent = content.substring(i);
      if (trieObj.lazyMatch(remainContent) !== null) {
        return false;
      }
    }
    return true;
  };

  const filterByAuthorName = (authorName: string) => {
    return !stateRef.current.blockUsersSet.has(authorName);
  };

  const filterTextMessage = (data: any) => {
    const cfg = stateRef.current.config;
    if (cfg.blockGiftDanmaku && data.isGiftDanmaku) {
      return false;
    } else if (cfg.blockMirrorMessages && data.isMirror) {
      return false;
    } else if (cfg.blockLevel > 0 && data.authorLevel < cfg.blockLevel) {
      return false;
    } else if (cfg.blockNewbie && data.isNewbie) {
      return false;
    } else if (cfg.blockNotMobileVerified && !data.isMobileVerified) {
      return false;
    } else if (cfg.blockMedalLevel > 0 && data.medalLevel < cfg.blockMedalLevel) {
      return false;
    }
    return filterByContent(data.content) && filterByAuthorName(data.authorName);
  };

  const filterSuperChatMessage = (data: any) => {
    return filterByContent(data.content) && filterByAuthorName(data.authorName);
  };

  const filterNewMemberMessage = (data: any) => {
    return filterByAuthorName(data.authorName);
  };

  const ensureMessageSent = async (id: string) => {
    const promise = pendingMsgIdToPromise.current.get(id);
    if (promise !== undefined) {
      await promise;
    }
  };

  // Event handlers definition for WebSocket
  const handlersRef = useRef<any>({});
  handlersRef.current = {
    onAddText(data: any) {
      const promise = (async () => {
        const cfg = stateRef.current.config;
        if (!cfg.showDanmaku || !filterTextMessage(data)) {
          return;
        }
        const authorName = resolveBackendI18nText(data.authorName);
        const content = resolveBackendI18nText(data.content);
        const normalizedData = { ...data, authorName, content };
        const contentParts = await parseContentParts(normalizedData);

        if (rendererRef.current && rendererRef.current.mergeSimilarText(content)) {
          return;
        }

        const message = {
          id: data.id,
          type: constants.MESSAGE_TYPE_TEXT,
          avatarUrl: chat.resolveAvatarUrl(data.avatarUrl, data.uid, authorName),
          time: new Date(data.timestamp * 1000),
          authorName,
          authorType: data.authorType,
          content,
          contentParts,
          privilegeType: data.privilegeType,
          repeated: 1,
          translation: cfg.autoTranslate ? data.translation : "",
          isMirror: data.isMirror,
          uid: data.uid,
          medalLevel: data.medalLevel,
          medalName: data.medalName,
        };
        if (rendererRef.current) {
          rendererRef.current.addMessage(message);
        }
      })().catch((err) => console.error("Error adding message:", err));

      const id = data.id;
      pendingMsgIdToPromise.current.set(id, promise);
      promise.finally(() => {
        pendingMsgIdToPromise.current.delete(id);
      });
    },

    onAddGift(data: any) {
      const cfg = stateRef.current.config;
      if (!cfg.showGift) {
        return;
      }
      const authorName = resolveBackendI18nText(data.authorName);
      const giftName = resolveBackendI18nText(data.giftName);
      const price = data.totalCoin / 1000;

      if (
        rendererRef.current &&
        rendererRef.current.mergeSimilarGift(authorName, price, data.totalFreeCoin, giftName, data.num)
      ) {
        return;
      }
      if (price < cfg.minGiftPrice) {
        return;
      }

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_GIFT,
        avatarUrl: chat.resolveAvatarUrl(data.avatarUrl, data.uid, authorName),
        time: new Date(data.timestamp * 1000),
        authorName,
        authorNamePronunciation: "",
        price,
        giftName,
        num: data.num,
        totalFreeCoin: data.totalFreeCoin,
        giftId: data.giftId,
        giftIconUrl: data.giftIconUrl,
        uid: data.uid,
        privilegeType: data.privilegeType,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      };
      if (rendererRef.current) {
        rendererRef.current.addMessage(message);
      }
    },

    onAddMember(data: any) {
      const cfg = stateRef.current.config;
      if (!cfg.showGift || !filterNewMemberMessage(data)) {
        return;
      }
      const authorName = resolveBackendI18nText(data.authorName);

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_MEMBER,
        avatarUrl: chat.resolveAvatarUrl(data.avatarUrl, data.uid, authorName),
        time: new Date(data.timestamp * 1000),
        authorName,
        authorNamePronunciation: "",
        privilegeType: data.privilegeType,
        title: i18n.t("chat.membershipTitle"),
        num: data.num,
        unit: data.unit,
        price: data.totalCoin / 1000,
        uid: data.uid,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      };
      if (rendererRef.current) {
        rendererRef.current.addMessage(message);
      }
    },

    onAddSuperChat(data: any) {
      const cfg = stateRef.current.config;
      if (!cfg.showGift || !filterSuperChatMessage(data)) {
        return;
      }
      if (data.price < cfg.minGiftPrice) {
        return;
      }
      const authorName = resolveBackendI18nText(data.authorName);
      const content = resolveBackendI18nText(data.content.trim());

      const message = {
        id: data.id,
        type: constants.MESSAGE_TYPE_SUPER_CHAT,
        avatarUrl: chat.resolveAvatarUrl(data.avatarUrl, data.uid, authorName),
        authorName,
        authorNamePronunciation: "",
        price: data.price,
        time: new Date(data.timestamp * 1000),
        content,
        translation: cfg.autoTranslate ? data.translation : "",
        uid: data.uid,
        privilegeType: data.privilegeType,
        medalLevel: data.medalLevel,
        medalName: data.medalName,
      };
      if (rendererRef.current) {
        rendererRef.current.addMessage(message);
      }
    },

    async onDelSuperChat(data: any) {
      await Promise.all(data.ids.map(ensureMessageSent));
      if (rendererRef.current) {
        rendererRef.current.delMessages(data.ids);
      }
    },

    async onUpdateTranslation(data: any) {
      const cfg = stateRef.current.config;
      if (!cfg.autoTranslate) {
        return;
      }
      await ensureMessageSent(data.id);
      if (rendererRef.current) {
        rendererRef.current.updateMessage(data.id, { translation: data.translation });
      }
    },

    onFatalError(error: any) {
      console.error("Overlay fatal error:", error);
      handlersRef.current.onAddText(
        new chatModels.AddTextMsg({
          authorName: "blivechat",
          authorType: constants.AUTHOR_TYPE_ADMIN,
          content: i18n.t("room.fatalErrorOccurred"),
          authorLevel: 60,
        })
      );
    },

    onDebugMsg(data: any) {
      const cfg = stateRef.current.config;
      if (!cfg.showDebugMessages) {
        return;
      }
      handlersRef.current.onAddText(
        new chatModels.AddTextMsg({
          authorName: "blivechat",
          authorType: constants.AUTHOR_TYPE_ADMIN,
          content: data.content,
          authorLevel: 60,
        })
      );
    },
  };

  const initChatClient = async () => {
    const roomKey = {
      type: roomKeyType,
      value: roomKeyValue ?? 1,
    };

    const client = new ChatClientRelay(roomKey, stateRef.current.config.autoTranslate);
    client.msgHandler = {
      onAddText: (data) => handlersRef.current.onAddText(data),
      onAddGift: (data) => handlersRef.current.onAddGift(data),
      onAddMember: (data) => handlersRef.current.onAddMember(data),
      onAddSuperChat: (data) => handlersRef.current.onAddSuperChat(data),
      onDelSuperChat: (data) => handlersRef.current.onDelSuperChat(data),
      onUpdateTranslation: (data) => handlersRef.current.onUpdateTranslation(data),
      onFatalError: (error) => handlersRef.current.onFatalError(error),
      onDebugMsg: (data) => handlersRef.current.onDebugMsg(data),
    };

    chatClient.current = client;
    client.start();
  };

  const initTextEmoticons = async () => {
    const emoticons = await chat.getTextEmoticons();
    setTextEmoticons(emoticons);
  };

  const init = async () => {
    const initChatClientPromise = initChatClient();
    initTextEmoticons();

    try {
      await initChatClientPromise;
    } catch (e) {
      console.error("Failed to load room overlay:", e);
      throw e;
    }
  };

  useEffect(() => {
    initConfig();
  }, [strConfig]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      document.removeEventListener("visibilitychange", onVisibilityChange);
      init();
    };

    if (document.visibilityState === "visible") {
      init();
    } else {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (chatClient.current) {
        chatClient.current.stop();
      }
    };
  }, [roomKeyValue, roomKeyType]);

  return (
    <ChatRenderer
      ref={rendererRef}
      maxNumber={config.maxNumber}
      showGiftName={config.showGiftName}
    />
  );
}
