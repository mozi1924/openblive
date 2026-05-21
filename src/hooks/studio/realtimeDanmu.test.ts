import { describe, expect, it } from "vitest";
import type { DanmuMsg } from "../../types/studio";
import { applyResolvedDanmuAvatar } from "./realtimeDanmu";

describe("applyResolvedDanmuAvatar", () => {
  it("patches matching messages by uid", () => {
    const original: DanmuMsg[] = [
      {
        id: "gift-1",
        type: "gift",
        time: "12:00:02",
        sender: "观众A",
        sender_uid: 1001,
        content: "投喂了礼物",
      },
      {
        id: "msg-1",
        type: "danmu",
        time: "12:00:01",
        sender: "观众A",
        sender_uid: 1001,
        content: "你好",
      },
      {
        id: "msg-2",
        type: "danmu",
        time: "12:00:00",
        sender: "观众B",
        sender_uid: 2002,
        content: "路过",
      },
    ];

    const result = applyResolvedDanmuAvatar(original, {
      uid: "1001",
      sender_face: "data:image/png;base64,abc",
    });

    expect(result[0].sender_face).toBe("data:image/png;base64,abc");
    expect(result[1].sender_face).toBe("data:image/png;base64,abc");
    expect(result[2].sender_face).toBeUndefined();
  });

  it("ignores invalid payloads", () => {
    const original: DanmuMsg[] = [
      {
        id: "msg-1",
        type: "danmu",
        time: "12:00:01",
        sender: "观众A",
        sender_uid: 1001,
        content: "你好",
      },
    ];

    expect(
      applyResolvedDanmuAvatar(original, {
        uid: "not-a-number",
        sender_face: "data:image/png;base64,abc",
      }),
    ).toEqual(original);

    expect(
      applyResolvedDanmuAvatar(original, {
        uid: "1001",
        sender_face: "   ",
      }),
    ).toEqual(original);
  });
});
