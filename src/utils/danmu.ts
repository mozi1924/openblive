import type { DanmuEventPayload, DanmuMsg } from "../types/studio";

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
      sender: typeof senderMeta[1] === "string" ? senderMeta[1] : "匿名",
      content: typeof info[1] === "string" ? info[1] : "",
    };
  }

  if (cmd === "SEND_GIFT") {
    const data = payload.data ?? {};
    return {
      id,
      type: "gift",
      time,
      sender: typeof data.uname === "string" ? data.uname : "送礼用户",
      content: `赠送了 ${
        typeof data.giftName === "string" ? data.giftName : "礼物"
      } x ${typeof data.num === "number" ? data.num : 1}`,
    };
  }

  if (cmd === "GUARD_BUY") {
    const data = payload.data ?? {};
    return {
      id,
      type: "guard",
      time,
      sender: typeof data.username === "string" ? data.username : "购航海用户",
      content: `开通了 ${
        typeof data.gift_name === "string" ? data.gift_name : "大航海"
      }`,
    };
  }

  return null;
};
