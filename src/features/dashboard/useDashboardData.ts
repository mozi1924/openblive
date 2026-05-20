import { useCallback, useEffect, useRef, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type { LiveDashboardSnapshot } from "../../types/studio";

const dashboardCache = new Map<string, LiveDashboardSnapshot>();

function getCachedSnapshot(uid: string | null): LiveDashboardSnapshot | null {
  if (!uid) {
    return null;
  }
  return dashboardCache.get(uid) || null;
}

export function resetDashboardCacheForTests() {
  dashboardCache.clear();
}

export function useDashboardData(currentUid: string | null) {
  const activeUidRef = useRef<string | null>(currentUid);
  const requestVersionRef = useRef(0);

  const [snapshot, setSnapshot] = useState<LiveDashboardSnapshot | null>(() =>
    getCachedSnapshot(currentUid),
  );
  const [loading, setLoading] = useState(Boolean(currentUid) && !getCachedSnapshot(currentUid));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (options?: { background?: boolean }) => {
      const uid = currentUid?.trim() || null;
      const requestVersion = ++requestVersionRef.current;

      if (!uid) {
        setSnapshot(null);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      const cached = getCachedSnapshot(uid);
      const hasExistingSnapshot = Boolean(cached);
      setError(null);
      if (options?.background || hasExistingSnapshot) {
        setSnapshot(cached);
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
      }

      try {
        const response = await studioApi.getLiveDashboardSnapshot();
        if (response.code !== 0 || !response.data) {
          throw new Error(response.msg || "load dashboard failed");
        }
        if (
          requestVersion !== requestVersionRef.current ||
          activeUidRef.current !== uid ||
          response.data.current_uid !== uid
        ) {
          return;
        }

        dashboardCache.set(uid, response.data);
        setSnapshot(response.data);
      } catch (nextError) {
        if (
          requestVersion !== requestVersionRef.current ||
          activeUidRef.current !== uid
        ) {
          return;
        }
        setError(String(nextError));
      } finally {
        if (
          requestVersion !== requestVersionRef.current ||
          activeUidRef.current !== uid
        ) {
          return;
        }
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUid],
  );

  useEffect(() => {
    activeUidRef.current = currentUid?.trim() || null;
    const cached = getCachedSnapshot(activeUidRef.current);
    setSnapshot(cached);
    setError(null);
    requestVersionRef.current += 1;

    if (!activeUidRef.current) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (cached) {
      setLoading(false);
      setRefreshing(true);
      void load({ background: true });
      return;
    }
    setLoading(true);
    setRefreshing(false);
    void load();
  }, [currentUid, load]);

  return {
    snapshot,
    loading,
    refreshing,
    error,
    reload: () => load({ background: Boolean(getCachedSnapshot(currentUid)) }),
  };
}
