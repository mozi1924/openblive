import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { LiveOverviewMetric } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type OverviewRadarPanelProps = {
  locale: LocaleSetting;
  metrics: LiveOverviewMetric[];
};

export function OverviewRadarPanel({
  locale,
  metrics,
}: OverviewRadarPanelProps) {
  return (
    <section className="flat-panel rounded-3xl p-5">
      <div className="mb-4">
        <p className="text-[11px] font-semibold tracking-[0.24em] text-gray-500 uppercase">
          {t(locale, "ui.dashboard.section.overview")}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_240px]">
        <div className="h-80 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={metrics} outerRadius="72%">
              <PolarGrid stroke="rgba(255,255,255,0.10)" />
              <PolarAngleAxis
                dataKey="name"
                tick={{ fill: "#98a2b3", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(7, 10, 15, 0.96)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px",
                  color: "#fff",
                }}
              />
              <Radar
                name={t(locale, "ui.dashboard.chart.overview.max")}
                dataKey="max"
                stroke="#64748b"
                fill="#64748b"
                fillOpacity={0.08}
              />
              <Radar
                name={t(locale, "ui.dashboard.chart.overview.average")}
                dataKey="aver"
                stroke="#f472b6"
                fill="#f472b6"
                fillOpacity={0.16}
              />
              <Radar
                name={t(locale, "ui.dashboard.chart.overview.me")}
                dataKey="me"
                stroke="#00aeec"
                fill="#00aeec"
                fillOpacity={0.28}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid content-start gap-3">
          {metrics.map((metric) => (
            <div
              key={metric.index}
              className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-200">
                  {metric.name}
                </span>
                <span className="text-sm font-semibold text-bili-blue">
                  {metric.me.toFixed(2)}
                </span>
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-gray-500">
                <span>
                  {t(locale, "ui.dashboard.chart.overview.average")}:{" "}
                  {metric.aver.toFixed(2)}
                </span>
                <span>
                  {t(locale, "ui.dashboard.chart.overview.max")}:{" "}
                  {metric.max.toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
