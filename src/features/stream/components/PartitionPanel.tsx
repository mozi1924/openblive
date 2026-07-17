import { ChevronDown } from "lucide-react";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type PartitionPanelProps = {
  locale: LocaleSetting;
  parent: string;
  child: string;
  children: string[];
  partitions: Record<string, string[]>;
  recentAreas: Array<{ parent: string; child: string }>;
  sectionStatus: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  onChangeParent: (value: string) => void;
  onChangeChild: (value: string) => void;
  onApplyRecentArea: (parent: string, child: string) => void;
  onSubmitArea: (event: React.FormEvent) => Promise<void>;
};

export function PartitionPanel({
  locale,
  parent,
  child,
  children,
  partitions,
  recentAreas,
  sectionStatus,
  onChangeParent,
  onChangeChild,
  onApplyRecentArea,
  onSubmitArea,
}: PartitionPanelProps) {
  return (
    <form onSubmit={(event) => void onSubmitArea(event)} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
          {t(locale, "ui.stream.area.title")}
        </label>
        <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              sectionStatus.tone === "green"
                ? "bg-emerald-400"
                : sectionStatus.tone === "red"
                  ? "bg-rose-400"
                  : "bg-amber-400"
            }`}
          />
          <span className="text-gray-200">{sectionStatus.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col space-y-1">
          <span className="text-[9px] font-bold text-gray-500">{t(locale, "ui.stream.area.parent")}</span>
          <div className="relative">
            <select
              value={parent}
              onChange={(event) => onChangeParent(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
            >
              {Object.keys(partitions).map((partition) => (
                <option key={partition} value={partition} className="bg-[#090b0f]">
                  {partition}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </div>
        </div>
        <div className="flex flex-col space-y-1">
          <span className="text-[9px] font-bold text-gray-500">{t(locale, "ui.stream.area.child")}</span>
          <div className="relative">
            <select
              value={child}
              onChange={(event) => onChangeChild(event.target.value)}
              className="h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
            >
              {children.map((partition) => (
                <option key={partition} value={partition} className="bg-[#090b0f]">
                  {partition}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex min-h-9 flex-1 flex-wrap items-center gap-1.5">
          {recentAreas.map((area) => {
            const key = `${area.parent}/${area.child}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => onApplyRecentArea(area.parent, area.child)}
                className="rounded border border-white/10 bg-white/2 px-2 py-0.5 text-[10px] text-gray-400 transition-all hover:border-bili-blue/30 hover:bg-bili-blue/10 hover:text-bili-blue font-medium"
                title={`${area.parent} / ${area.child}`}
              >
                {area.parent} / {area.child}
              </button>
            );
          })}
        </div>
        <button
          type="submit"
          className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
        >
          {t(locale, "ui.stream.area.save")}
        </button>
      </div>
    </form>
  );
}
