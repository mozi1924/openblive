import type { Session } from "../types/studio";

// Live status constants defined by Bilibili live streaming protocol.
// MUST be kept synchronized with Rust backend src-tauri/src/live_status.rs.
export const LIVE_STATUS_OFFLINE = 0;
export const LIVE_STATUS_LIVE = 1;
export const LIVE_STATUS_ROUND = 2;

export type LiveSessionPhase = "off" | "live" | "round";

export type LiveSessionState = {
  code: typeof LIVE_STATUS_OFFLINE | typeof LIVE_STATUS_LIVE | typeof LIVE_STATUS_ROUND;
  phase: LiveSessionPhase;
  isOnline: boolean;
  isLive: boolean;
  isRound: boolean;
};

export const normalizeLiveStatusCode = (rawStatus?: number | null) => {
  if (rawStatus === LIVE_STATUS_LIVE) {
    return LIVE_STATUS_LIVE;
  }
  if (rawStatus === LIVE_STATUS_ROUND) {
    return LIVE_STATUS_ROUND;
  }
  return LIVE_STATUS_OFFLINE;
};

export const resolveSessionLiveStatusCode = (session?: Session | null) => {
  if (!session) {
    return LIVE_STATUS_OFFLINE;
  }
  if (typeof session.live_status === "number") {
    return normalizeLiveStatusCode(session.live_status);
  }
  return session.is_live ? LIVE_STATUS_LIVE : LIVE_STATUS_OFFLINE;
};

export const resolveSessionLiveState = (session?: Session | null): LiveSessionState => {
  const code = resolveSessionLiveStatusCode(session);
  if (code === LIVE_STATUS_LIVE) {
    return {
      code,
      phase: "live",
      isOnline: true,
      isLive: true,
      isRound: false,
    };
  }
  if (code === LIVE_STATUS_ROUND) {
    return {
      code,
      phase: "round",
      isOnline: true,
      isLive: false,
      isRound: true,
    };
  }
  return {
    code: LIVE_STATUS_OFFLINE,
    phase: "off",
    isOnline: false,
    isLive: false,
    isRound: false,
  };
};
