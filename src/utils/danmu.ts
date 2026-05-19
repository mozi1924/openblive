import type { DanmuEventPayload, DanmuMsg } from "../types/studio";
import { t, tf, type LocaleSetting } from "./i18n";

const createMessageId = () => Math.random().toString(36).slice(2, 9);

const getNow = () => new Date().toLocaleTimeString();

export const createSelfDanmuMessage = (
  content: string,
  sender: string,
): DanmuMsg => ({
  id: createMessageId(),
  type: "danmu",
  time: getNow(),
  sender,
  content,
});

export const parseDanmuEvent = (
  payload: DanmuEventPayload,
  locale: LocaleSetting = "auto",
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
    return {
      id,
      type: "danmu",
      time,
      sender:
        typeof senderMeta[1] === "string"
          ? senderMeta[1]
          : t(locale, "ui.danmu.sender.anonymous"),
      content: typeof info[1] === "string" ? info[1] : "",
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
