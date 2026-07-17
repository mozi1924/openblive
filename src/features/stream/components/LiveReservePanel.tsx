import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type LiveReservePanelProps = {
  locale: LocaleSetting;
  liveReserveTitle: string;
  liveReserveStartAt: string;
  liveReserveCreateDynamic: boolean;
  onChangeLiveReserveTitle: (value: string) => void;
  onChangeLiveReserveStartAt: (value: string) => void;
  onChangeLiveReserveCreateDynamic: (value: boolean) => void;
  onSubmitLiveReserve: (event: React.FormEvent) => Promise<void>;
};

export function LiveReservePanel({
  locale,
  liveReserveTitle,
  liveReserveStartAt,
  liveReserveCreateDynamic,
  onChangeLiveReserveTitle,
  onChangeLiveReserveStartAt,
  onChangeLiveReserveCreateDynamic,
  onSubmitLiveReserve,
}: LiveReservePanelProps) {
  return (
    <form onSubmit={(event) => void onSubmitLiveReserve(event)} className="space-y-3">
      <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
        {t(locale, "ui.stream.reserve.label")}
      </label>
      <div className="space-y-2">
        <input
          type="text"
          value={liveReserveTitle}
          onChange={(event) => onChangeLiveReserveTitle(event.target.value)}
          placeholder={t(locale, "ui.stream.reserve.title_placeholder")}
          className="w-full rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none hover:border-white/12"
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <input
            type="datetime-local"
            value={liveReserveStartAt}
            onChange={(event) => onChangeLiveReserveStartAt(event.target.value)}
            className="h-9 w-full rounded-lg border border-white/8 bg-white/1.5 px-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none hover:border-white/12"
          />
          <label className="inline-flex items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-gray-200">
            <input
              type="checkbox"
              checked={liveReserveCreateDynamic}
              onChange={(event) => onChangeLiveReserveCreateDynamic(event.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-bili-blue"
            />
            <span>{t(locale, "ui.stream.reserve.dynamic")}</span>
          </label>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] text-gray-500">{t(locale, "ui.stream.reserve.hint")}</p>
        <button
          type="submit"
          className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-4 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
        >
          {t(locale, "ui.stream.reserve.publish")}
        </button>
      </div>
    </form>
  );
}
