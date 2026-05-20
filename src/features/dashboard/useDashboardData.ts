import { useCallback, useEffect, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type { LiveDashboardSnapshot } from "../../types/studio";

type DashboardCache = {
  currentUid: string | null;
  snapshot: LiveDashboardSnapshot | null;
};

let dashboardCache: DashboardCache = {
  currentUid: null,
  snapshot: null,
};

export function useDashboardData(currentUid: string | null) {
  const [snapshot, setSnapshot] = useState<LiveDashboardSnapshot | null>(() =>
    dashboardCache.currentUid === currentUid ? dashboardCache.snapshot : null,
  );
  const [loading, setLoading] = useState(
    Boolean(currentUid) && !(dashboardCache.currentUid === currentUid && dashboardCache.snapshot),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (force = false) => {
      if (!currentUid) {
        dashboardCache = { currentUid: null, snapshot: null };
        setSnapshot(null);
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return;
      }

      const hasCached =
        !force &&
        dashboardCache.currentUid === currentUid &&
        dashboardCache.snapshot !== null;
      if (hasCached) {
        setSnapshot(dashboardCache.snapshot);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const hasExistingSnapshot = Boolean(snapshot);
      setError(null);
      if (hasExistingSnapshot) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const response = await studioApi.getLiveDashboardSnapshot();
        if (response.code !== 0 || !response.data) {
          throw new Error(response.msg || "load dashboard failed");
        }
        dashboardCache = {
          currentUid,
          snapshot: response.data,
        };
        setSnapshot(response.data);
      } catch (nextError) {
        setError(String(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUid, snapshot],
  );

  useEffect(() => {
    const cached =
      dashboardCache.currentUid === currentUid ? dashboardCache.snapshot : null;
    setSnapshot(cached);
    setError(null);
    if (!currentUid) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (cached) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    void load(true);
  }, [currentUid, load]);

  return {
    snapshot,
    loading,
    refreshing,
    error,
    reload: () => load(true),
  };
}
