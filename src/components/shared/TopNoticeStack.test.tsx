import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNoticeStack } from "./TopNoticeStack";
import {
  TOP_NOTICE_ENTER_MS,
  TOP_NOTICE_EXIT_MS,
  type TopNoticeItem,
} from "../../types/topNotice";

const successNotice: TopNoticeItem = {
  id: 1,
  text: "直播已开始",
  tone: "success",
};

describe("TopNoticeStack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it("promotes new notices from enter to idle state", () => {
    const { container } = render(<TopNoticeStack notices={[successNotice]} onDismiss={() => undefined} />);

    const notice = container.querySelector("[data-notice-id='1']");
    expect(notice?.getAttribute("data-notice-state")).toBe("enter");

    act(() => {
      vi.advanceTimersByTime(TOP_NOTICE_ENTER_MS);
    });

    expect(notice?.getAttribute("data-notice-state")).toBe("idle");
  });

  it("keeps removed notices around for the exit animation window", () => {
    const { container, rerender } = render(
      <TopNoticeStack notices={[successNotice]} onDismiss={() => undefined} />,
    );

    act(() => {
      vi.advanceTimersByTime(TOP_NOTICE_ENTER_MS);
    });
    rerender(<TopNoticeStack notices={[]} onDismiss={() => undefined} />);

    const notice = container.querySelector("[data-notice-id='1']");
    expect(notice?.getAttribute("data-notice-state")).toBe("exit");

    act(() => {
      vi.advanceTimersByTime(TOP_NOTICE_EXIT_MS - 1);
    });
    expect(container.textContent).toContain("直播已开始");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.textContent).not.toContain("直播已开始");
  });

  it("forwards dismiss clicks to the parent handler", () => {
    const onDismiss = vi.fn();

    render(<TopNoticeStack notices={[successNotice]} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole("button", { name: "dismiss notice" }));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });
});
