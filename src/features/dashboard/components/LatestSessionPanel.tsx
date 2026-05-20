import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiveSessionDetail } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t, tf } from "../../../utils/i18n";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatNumber,
} from "../formatters";
import { DashboardKpiCard } from "./DashboardKpiCard";

type LatestSessionPanelProps = {
  locale: LocaleSetting;
  session: LiveSessionDetail;
};

export function LatestSessionPanel({
  locale,
  session,
}: LatestSessionPanelProps) {
  const chartData = session.session_data.map((point) => ({
    ...point,
    label: formatDateTime(point.ts, locale),
  }));
  const stats = session.summary.stats;

  return (
    <section className="flat-panel rounded-3xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
            {t(locale, "ui.dashboard.section.latest")}
          </p>
          <h3 className="mt-3 truncate text-2xl font-semibold tracking-tight text-white">
            {session.summary.title || session.summary.live_key}
          </h3>
          <p className="mt-2 text-sm text-gray-400">
            {tf(locale, "ui.dashboard.latest.meta", {
              date: formatDateTime(session.summary.start_time, locale),
              duration: formatDuration(
                stats?.live_time || session.summary.duration,
                locale,
              ),
            })}
          </p>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-right">
          <p className="text-[11px] tracking-[0.24em] text-gray-500 uppercase">
            live_key
          </p>
          <p className="mt-1 font-mono text-xs text-gray-300">
            {session.summary.live_key}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.revenue")}
          value={formatCurrency(stats?.revenue ?? 0, locale)}
          accentClass="text-bili-blue"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.watched")}
          value={formatNumber(stats?.watched_count ?? 0, locale)}
          accentClass="text-emerald-300"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.danmu")}
          value={formatNumber(stats?.danmu_num ?? 0, locale)}
          accentClass="text-rose-300"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.fans")}
          value={formatNumber(stats?.add_fans ?? 0, locale)}
          accentClass="text-amber-300"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.duration")}
          value={formatDuration(stats?.live_time ?? session.summary.duration, locale)}
          accentClass="text-violet-300"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.max_online")}
          value={formatNumber(stats?.max_online ?? 0, locale)}
          accentClass="text-cyan-300"
        />
        <DashboardKpiCard
          label={t(locale, "ui.dashboard.kpi.new_fans_club")}
          value={formatNumber(stats?.new_fans_club ?? 0, locale)}
          accentClass="text-pink-300"
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_320px]">
        <div className="rounded-3xl border border-white/6 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
            {t(locale, "ui.dashboard.section.timeline")}
          </p>
          {chartData.length > 0 ? (
            <div className="mt-4 h-80 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#98a2b3", fontSize: 12 }}
                    minTickGap={28}
                  />
                  <YAxis tick={{ fill: "#98a2b3", fontSize: 12 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(7, 10, 15, 0.96)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "16px",
                      color: "#fff",
                    }}
                    formatter={(value) => [
                      formatNumber(typeof value === "number" ? value : 0, locale),
                      t(locale, "ui.dashboard.chart.timeline"),
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#00aeec"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              {t(locale, "ui.dashboard.latest.no_detail")}
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-white/6 bg-white/[0.03] p-4">
          <p className="text-[11px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
            {t(locale, "ui.dashboard.section.highlights")}
          </p>
          {session.highlights.length > 0 ? (
            <div className="mt-4 space-y-3">
              {session.highlights.map((highlight) => (
                <div
                  key={`${highlight.id}-${highlight.start_time}`}
                  className="rounded-2xl border border-white/6 bg-[#0b1018] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">
                      {highlight.title || `#${highlight.id}`}
                    </p>
                    <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] text-gray-400">
                      {formatDateTime(highlight.start_time, locale)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-400">
              {t(locale, "ui.dashboard.highlights.empty")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
