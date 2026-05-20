import { describe, expect, it } from "vitest";
import {
  createLiveEmoticonIndex,
  createSelfDanmuMessage,
  normalizeEmoticonText,
  upsertIncomingDanmuMessage,
} from "./danmu";
import type { DanmuMsg, LiveEmoticonPackage } from "../types/studio";

const emoticonPackages: LiveEmoticonPackage[] = [
  {
    pkg_id: 1,
    pkg_name: "通用表情",
    pkg_descript: "官方表情",
    emoticons: [
      {
        emoticon_id: 278,
        emoticon_unique: "emoji_278",
        text: "[热]",
        label: "热",
        url: "data:image/png;base64,abc",
        width: 20,
        height: 20,
        is_dynamic: false,
      },
    ],
  },
];

describe("danmu emoticon helpers", () => {
  it("normalizes live emoticon tokens", () => {
    expect(normalizeEmoticonText("热")).toBe("[热]");
    expect(normalizeEmoticonText("[热]")).toBe("[热]");
  });

  it("segments self-sent danmu with cached emoticons", () => {
    const message = createSelfDanmuMessage(
      "白花300块[热]",
      "主播",
      createLiveEmoticonIndex(emoticonPackages),
      { sender_face: "http://i0.hdslb.com/bfs/face/test.jpg" },
    );

    expect(message.sender_face).toBe("https://i0.hdslb.com/bfs/face/test.jpg");
    expect(message.segments).toEqual([
      { type: "text", text: "白花300块" },
      {
        type: "emoticon",
        text: "[热]",
        emoticon: {
          emoticon_id: 278,
          emoticon_unique: "emoji_278",
          text: "[热]",
          url: "data:image/png;base64,abc",
          width: 20,
          height: 20,
          is_dynamic: false,
        },
      },
    ]);
  });

  it("replaces optimistic self danmu when websocket echo arrives", () => {
    const optimistic = createSelfDanmuMessage("1", "主播", undefined, {
      sender_uid: 42,
      sender_role: "anchor",
    });
    const incoming: DanmuMsg = {
      id: "server-1",
      type: "danmu",
      time: "12:00:01",
      sender: "主播",
      sender_uid: 42,
      sender_role: "viewer",
      content: "1",
    };

    const result = upsertIncomingDanmuMessage([optimistic], incoming);

    expect(result).toEqual([incoming]);
  });
});
