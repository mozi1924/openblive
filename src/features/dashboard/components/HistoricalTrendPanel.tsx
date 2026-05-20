import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiveSessionSummary } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";
import {
  formatCurrency,
  formatDate,
  formatDuration,
  formatNumber,
} from "../formatters";

type HistoricalTrendPanelProps = {
  locale: LocaleSetting;
  sessions: LiveSessionSummary[];
};

export function HistoricalTrendPanel({
  locale,
  sessions,
}: HistoricalTrendPanelProps) {
  const chartData = sessions
    .map((session) => ({
      label: formatDate(session.start_time, locale),
      revenue: session.stats?.revenue ?? null,
      watched: session.stats?.watched_count ?? null,
      danmu: session.stats?.danmu_num ?? null,
      fans: session.stats?.add_fans ?? null,
      duration: session.stats?.live_time ?? null,
      title: session.title,
    }))
    .reverse();

  return (
    <section className="flat-panel rounded-3xl p-5">
      <div className="mb-4">
        <p className="text-[11px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
          {t(locale, "ui.dashboard.section.trend")}
        </p>
      </div>

      <div className="h-96 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#98a2b3", fontSize: 12 }} />
            <YAxis tick={{ fill: "#98a2b3", fontSize: 12 }} width={48} />
            <Tooltip
              contentStyle={{
                background: "rgba(7, 10, 15, 0.96)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "16px",
                color: "#fff",
              }}
              formatter={(value, name) => {
                if (typeof value !== "number") {
                  return ["-", String(name)];
                }
                if (name === "duration") {
                  return [
                    formatDuration(value, locale),
                    t(locale, "ui.dashboard.kpi.duration"),
                  ] as [string, string];
                }
                if (name === "revenue") {
                  return [
                    formatCurrency(value, locale),
                    t(locale, "ui.dashboard.kpi.revenue"),
                  ] as [string, string];
                }
                const labelMap: Record<string, string> = {
                  watched: t(locale, "ui.dashboard.kpi.watched"),
                  danmu: t(locale, "ui.dashboard.kpi.danmu"),
                  fans: t(locale, "ui.dashboard.kpi.fans"),
                };
                return [
                  formatNumber(value, locale),
                  labelMap[String(name)] || String(name),
                ] as [string, string];
              }}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.title || ""}
            />
            <Legend />
            <Line type="monotone" dataKey="revenue" stroke="#00aeec" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="watched" stroke="#22c55e" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="danmu" stroke="#fb7185" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="fans" stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls />
            <Line type="monotone" dataKey="duration" stroke="#a78bfa" dot={false} strokeWidth={2} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
