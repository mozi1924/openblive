import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardTab } from "./DashboardTab";
import type { LiveDashboardSnapshot } from "../../types/studio";

const snapshot: LiveDashboardSnapshot = {
  current_uid: "1001",
  overview: [
    { name: "收益", index: "income", me: 1, aver: 0.8, max: 1.4 },
  ],
  sessions: [
    {
      live_key: "lk-1",
      title: "Night Stream",
      cover: "",
      start_time: 1710000000,
      end_time: 1710003600,
      duration: 3600,
      platform: "pc_link",
      room_id: 1,
      stats: {
        live_time: 3600,
        add_fans: 12,
        revenue: 88.5,
        new_fans_club: 3,
        danmu_num: 220,
        max_online: 66,
        watched_count: 987,
      },
    },
  ],
  latest_session: {
    summary: {
      live_key: "lk-1",
      title: "Night Stream",
      cover: "",
      start_time: 1710000000,
      end_time: 1710003600,
      duration: 3600,
      platform: "pc_link",
      room_id: 1,
      stats: {
        live_time: 3600,
        add_fans: 12,
        revenue: 88.5,
        new_fans_club: 3,
        danmu_num: 220,
        max_online: 66,
        watched_count: 987,
      },
    },
    session_data: [
      { ts: 1710000000, value: 1 },
      { ts: 1710000060, value: 3 },
    ],
    highlights: [
      { id: 1, type: 1, start_time: 1710000100, end_time: 1710000200, title: "弹幕高峰" },
    ],
    max_danmaku_ts: 1710000100,
    max_pcu_ts: 1710000200,
    max_value: 12,
  },
  fetched_at: 1710004000,
};

vi.mock("./useDashboardData", () => ({
  useDashboardData: vi.fn(),
}));

vi.mock("recharts", async () => {
  const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: passthrough,
    RadarChart: passthrough,
    Radar: () => <div />,
    PolarGrid: () => <div />,
    PolarAngleAxis: () => <div />,
    Tooltip: () => <div />,
    LineChart: passthrough,
    Line: () => <div />,
    CartesianGrid: () => <div />,
    Legend: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
  };
});

describe("DashboardTab", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it("renders empty state when there is no snapshot data", async () => {
    const { useDashboardData } = await import("./useDashboardData");
    vi.mocked(useDashboardData).mockReturnValue({
      snapshot: null,
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
    });

    render(<DashboardTab locale="zh-CN" currentUid="1001" />);

    expect(screen.getByText("暂无可展示的直播数据")).toBeTruthy();
  });

  it("renders trend and latest session sections with snapshot data", async () => {
    const { useDashboardData } = await import("./useDashboardData");
    vi.mocked(useDashboardData).mockReturnValue({
      snapshot,
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
    });

    render(<DashboardTab locale="zh-CN" currentUid="1001" />);

    expect(screen.getByText("最近多场趋势")).toBeTruthy();
    expect(screen.getByText("Night Stream")).toBeTruthy();
    expect(screen.getByText("弹幕高峰")).toBeTruthy();
  });

  it("does not render a mismatched account snapshot", async () => {
    const { useDashboardData } = await import("./useDashboardData");
    vi.mocked(useDashboardData).mockReturnValue({
      snapshot,
      loading: false,
      refreshing: false,
      error: null,
      reload: vi.fn(),
    });

    render(<DashboardTab locale="zh-CN" currentUid="another-account" />);

    expect(screen.getAllByText("暂无可展示的直播数据").length).toBeGreaterThan(0);
  });
});
