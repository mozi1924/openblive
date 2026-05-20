import { RefreshCw } from "lucide-react";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";
import { formatDateTime } from "./formatters";
import { useDashboardData } from "./useDashboardData";
import { DashboardEmptyState } from "./components/DashboardEmptyState";
import { HistoricalTrendPanel } from "./components/HistoricalTrendPanel";
import { LatestSessionPanel } from "./components/LatestSessionPanel";
import { OverviewRadarPanel } from "./components/OverviewRadarPanel";

type DashboardTabProps = {
  locale: LocaleSetting;
  currentUid: string | null;
};

export function DashboardTab({ locale, currentUid }: DashboardTabProps) {
  const { snapshot, loading, refreshing, error, reload } =
    useDashboardData(currentUid);
  const activeSnapshot =
    snapshot && snapshot.current_uid === currentUid ? snapshot : null;

  if (loading && !activeSnapshot) {
    return (
      <DashboardEmptyState
        title={t(locale, "ui.dashboard.refreshing")}
        description={t(locale, "ui.header.desc.dashboard")}
      />
    );
  }

  if (!activeSnapshot && error) {
    return (
      <DashboardEmptyState
        title={t(locale, "ui.dashboard.error.title")}
        description={t(locale, "ui.dashboard.error.desc")}
      />
    );
  }

  if (
    !activeSnapshot ||
    (activeSnapshot.sessions.length === 0 && activeSnapshot.overview.length === 0)
  ) {
    return (
      <DashboardEmptyState
        title={t(locale, "ui.dashboard.empty.title")}
        description={t(locale, "ui.dashboard.empty.desc")}
      />
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-400">
            {tf(locale, "ui.dashboard.updated_at", {
              value: formatDateTime(activeSnapshot.fetched_at, locale),
            })}
          </p>
          {error ? (
            <p className="mt-2 text-sm text-amber-300">
              {t(locale, "ui.dashboard.error.desc")}
            </p>
          ) : null}
        </div>

        <button
          onClick={() => void reload()}
          className="flex items-center rounded-2xl border border-white/8 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-gray-200 transition hover:border-bili-blue/30 hover:bg-white/[0.07] hover:text-white"
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          {refreshing
            ? t(locale, "ui.dashboard.refreshing")
            : t(locale, "ui.dashboard.refresh")}
        </button>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1.25fr)]">
        <OverviewRadarPanel locale={locale} metrics={activeSnapshot.overview} />
        {activeSnapshot.sessions.length > 0 ? (
          <HistoricalTrendPanel locale={locale} sessions={activeSnapshot.sessions} />
        ) : (
          <DashboardEmptyState
            title={t(locale, "ui.dashboard.section.trend")}
            description={t(locale, "ui.dashboard.empty.desc")}
          />
        )}
      </div>

      {activeSnapshot.latest_session ? (
        <LatestSessionPanel locale={locale} session={activeSnapshot.latest_session} />
      ) : (
        <DashboardEmptyState
          title={t(locale, "ui.dashboard.section.latest")}
          description={t(locale, "ui.dashboard.latest.no_detail")}
        />
      )}
    </div>
  );
}
