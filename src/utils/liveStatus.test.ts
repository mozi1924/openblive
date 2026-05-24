import { describe, expect, it } from "vitest";
import {
  LIVE_STATUS_LIVE,
  LIVE_STATUS_OFFLINE,
  LIVE_STATUS_ROUND,
  normalizeLiveStatusCode,
  resolveSessionLiveState,
  resolveSessionLiveStatusCode,
} from "./liveStatus";

describe("liveStatus", () => {
  it("normalizes unknown status to offline", () => {
    expect(normalizeLiveStatusCode(undefined)).toBe(LIVE_STATUS_OFFLINE);
    expect(normalizeLiveStatusCode(null)).toBe(LIVE_STATUS_OFFLINE);
    expect(normalizeLiveStatusCode(99)).toBe(LIVE_STATUS_OFFLINE);
  });

  it("resolves round play from live_status", () => {
    const state = resolveSessionLiveState({
      uid: 1,
      room_id: "1000",
      csrf: "",
      is_live: true,
      live_status: LIVE_STATUS_ROUND,
    });
    expect(state.code).toBe(LIVE_STATUS_ROUND);
    expect(state.phase).toBe("round");
    expect(state.isOnline).toBe(true);
    expect(state.isLive).toBe(false);
    expect(state.isRound).toBe(true);
  });

  it("falls back to is_live when live_status is absent", () => {
    expect(
      resolveSessionLiveStatusCode({
        uid: 1,
        room_id: "1000",
        csrf: "",
        is_live: true,
      }),
    ).toBe(LIVE_STATUS_LIVE);
    expect(
      resolveSessionLiveStatusCode({
        uid: 1,
        room_id: "1000",
        csrf: "",
        is_live: false,
      }),
    ).toBe(LIVE_STATUS_OFFLINE);
  });
});
