import type { StreamInfo } from "../types/studio";

const LIVE_STREAM_CACHE_KEY = "openblive.live-stream-info.v1";
let inMemoryCacheRaw: string | null = null;

type LiveStreamCachePayload = {
  uid: string;
  stream_info: StreamInfo;
  saved_at: number;
};

function normalizeUid(uid: string | number | null | undefined): string | null {
  if (uid == null) {
    return null;
  }
  const normalized = String(uid).trim();
  return normalized ? normalized : null;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readCacheRaw(storage: Storage | null): string | null {
  if (!storage) {
    return inMemoryCacheRaw;
  }
  try {
    return storage.getItem(LIVE_STREAM_CACHE_KEY);
  } catch {
    return inMemoryCacheRaw;
  }
}

function writeCacheRaw(storage: Storage | null, raw: string) {
  if (!storage) {
    inMemoryCacheRaw = raw;
    return;
  }
  try {
    storage.setItem(LIVE_STREAM_CACHE_KEY, raw);
  } catch {
    inMemoryCacheRaw = raw;
  }
}

export function saveLiveStreamInfoCache(uid: string | number | null | undefined, streamInfo: StreamInfo | null) {
  const storage = getStorage();
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid || !streamInfo) {
    clearLiveStreamInfoCache();
    return;
  }

  const payload: LiveStreamCachePayload = {
    uid: normalizedUid,
    stream_info: streamInfo,
    saved_at: Date.now(),
  };

  writeCacheRaw(storage, JSON.stringify(payload));
}

export function readLiveStreamInfoCache(uid: string | number | null | undefined): StreamInfo | null {
  const storage = getStorage();
  const normalizedUid = normalizeUid(uid);
  if (!normalizedUid) {
    return null;
  }

  try {
    const raw = readCacheRaw(storage);
    if (!raw) {
      return null;
    }
    const payload = JSON.parse(raw) as Partial<LiveStreamCachePayload> | null;
    if (!payload || payload.uid !== normalizedUid || !payload.stream_info || typeof payload.stream_info !== "object") {
      return null;
    }
    return payload.stream_info as StreamInfo;
  } catch {
    return null;
  }
}

export function clearLiveStreamInfoCache() {
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(LIVE_STREAM_CACHE_KEY);
    } catch {
      // Ignore storage errors.
    }
  }
  inMemoryCacheRaw = null;
}
