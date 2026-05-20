import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { resetDashboardCacheForTests, useDashboardData } from "./useDashboardData";
import { studioApi } from "../../services/studioApi";
import type { LiveDashboardSnapshot } from "../../types/studio";

const snapshot: LiveDashboardSnapshot = {
  current_uid: "1001",
  overview: [],
  sessions: [
    {
      live_key: "abc",
      title: "Session A",
      cover: "",
      start_time: 10,
      end_time: 20,
      duration: 10,
      platform: "pc_link",
      room_id: 1,
      stats: {
        live_time: 10,
        add_fans: 1,
        revenue: 2.5,
        new_fans_club: 0,
        danmu_num: 9,
        max_online: 4,
        watched_count: 11,
      },
    },
  ],
  latest_session: null,
  fetched_at: 123,
};

function HookHarness({ uid }: { uid: string | null }) {
  const { snapshot, loading, refreshing, error, reload } = useDashboardData(uid);

  return (
    <div>
      <div data-testid="loading">{String(loading)}</div>
      <div data-testid="refreshing">{String(refreshing)}</div>
      <div data-testid="error">{error || ""}</div>
      <div data-testid="title">{snapshot?.sessions[0]?.title || ""}</div>
      <button onClick={() => void reload()}>reload</button>
    </div>
  );
}

describe("useDashboardData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDashboardCacheForTests();
    cleanup();
  });

  it("loads dashboard data on mount", async () => {
    vi.spyOn(studioApi, "getLiveDashboardSnapshot").mockResolvedValue({
      code: 0,
      msg: "ok",
      data: snapshot,
    });

    render(<HookHarness uid="1001" />);

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session A");
    });
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("keeps existing snapshot and exposes an error when refresh fails", async () => {
    const apiSpy = vi
      .spyOn(studioApi, "getLiveDashboardSnapshot")
      .mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: { ...snapshot, current_uid: "2002" },
      })
      .mockRejectedValueOnce(new Error("network"));

    render(<HookHarness uid="2002" />);

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session A");
    });

    screen.getByRole("button", { name: "reload" }).click();

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toContain("network");
    });
    expect(screen.getByTestId("title").textContent).toBe("Session A");
    expect(apiSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores stale responses after switching accounts", async () => {
    let resolveFirst!: (value: {
      code: number;
      msg: string;
      data: LiveDashboardSnapshot;
    }) => void;
    const firstPromise = new Promise<{ code: number; msg: string; data: LiveDashboardSnapshot }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );

    const apiSpy = vi
      .spyOn(studioApi, "getLiveDashboardSnapshot")
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...snapshot,
          current_uid: "3002",
          sessions: [{ ...snapshot.sessions[0], title: "Session B" }],
        },
      });

    const { rerender } = render(<HookHarness uid="3001" />);
    rerender(<HookHarness uid="3002" />);

    resolveFirst({
      code: 0,
      msg: "ok",
      data: {
        ...snapshot,
        current_uid: "3001",
        sessions: [{ ...snapshot.sessions[0], title: "Session A old" }],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session B");
    });
    expect(apiSpy).toHaveBeenCalledTimes(2);
  });

  it("revalidates cached data when returning to an account", async () => {
    const apiSpy = vi
      .spyOn(studioApi, "getLiveDashboardSnapshot")
      .mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...snapshot,
          current_uid: "4001",
          sessions: [{ ...snapshot.sessions[0], title: "Session A cached" }],
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...snapshot,
          current_uid: "4002",
          sessions: [{ ...snapshot.sessions[0], title: "Session B" }],
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        msg: "ok",
        data: {
          ...snapshot,
          current_uid: "4001",
          sessions: [{ ...snapshot.sessions[0], title: "Session A refreshed" }],
        },
      });

    const { rerender } = render(<HookHarness uid="4001" />);
    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session A cached");
    });

    rerender(<HookHarness uid="4002" />);
    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session B");
    });

    rerender(<HookHarness uid="4001" />);
    expect(screen.getByTestId("title").textContent).toBe("Session A cached");

    await waitFor(() => {
      expect(screen.getByTestId("title").textContent).toBe("Session A refreshed");
    });
    expect(apiSpy).toHaveBeenCalledTimes(3);
  });
});
