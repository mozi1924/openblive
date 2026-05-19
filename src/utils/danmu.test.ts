import { describe, expect, it } from "vitest";
import {
  createLiveEmoticonIndex,
  createSelfDanmuMessage,
  normalizeEmoticonText,
  parseDanmuEvent,
} from "./danmu";
import type { LiveEmoticonPackage } from "../types/studio";

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
    );

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

  it("parses incoming danmu event emoticons and prefers cached assets", () => {
    const message = parseDanmuEvent(
      {
        cmd: "DANMU_MSG",
        info: [
          Array.from({ length: 16 }, (_, index) =>
            index === 15
              ? {
                  extra:
                    '{"emots":{"[热]":{"emoji":"[热]","emoticon_id":278,"emoticon_unique":"emoji_278","height":20,"url":"http://i0.hdslb.com/bfs/live/demo.png","width":20}}}',
                }
              : null,
          ),
          "白花300块[热]",
          [0, "观众A"],
        ],
      },
      "zh-CN",
      createLiveEmoticonIndex(emoticonPackages),
    );

    expect(message?.segments).toEqual([
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
          is_dynamic: undefined,
        },
      },
    ]);
  });
});
