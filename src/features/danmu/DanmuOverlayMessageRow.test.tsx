import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DanmuOverlayMessageRow } from "./DanmuOverlayMessageRow";
import type { DanmuMsg, User } from "../../types/studio";

const currentUser: User = {
  uid: "1",
  uname: "Anchor",
  face: "",
  level: 1,
  follower: 1,
  last_title: "",
  last_area_name: [],
};

describe("DanmuOverlayMessageRow", () => {
  it("renders a plain danmu row with inline emoticons", () => {
    const message: DanmuMsg = {
      id: "1",
      type: "danmu",
      time: "12:00:00",
      sender: "Viewer",
      content: "hello [doge]",
      segments: [
        { type: "text", text: "hello " },
        {
          type: "emoticon",
          text: "[doge]",
          emoticon: {
            text: "[doge]",
            url: "https://example.com/doge.png",
            width: 32,
            height: 32,
          },
        },
      ],
    };

    const { container } = render(
      <DanmuOverlayMessageRow message={message} currentUser={currentUser} locale="zh-CN" />,
    );

    expect(container.textContent).toContain("Viewer:");
    expect(container.textContent).toContain("hello");
    expect(screen.getByAltText("[doge]")).toBeTruthy();
  });

  it("flattens system style messages into a single line", () => {
    const message: DanmuMsg = {
      id: "2",
      type: "system",
      time: "12:00:01",
      sender: "",
      content: "直播已开始",
    };

    const { container } = render(
      <DanmuOverlayMessageRow message={message} currentUser={currentUser} locale="zh-CN" />,
    );

    expect(container.textContent).toContain("直播已开始");
    expect(container.textContent).not.toContain(":");
  });
});
