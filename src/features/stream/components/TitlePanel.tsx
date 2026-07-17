import type { LiveProfileState } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t, tf } from "../../../utils/i18n";

type TitlePanelProps = {
  locale: LocaleSetting;
  title: string;
  sectionStatus: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  profileState: LiveProfileState;
  onChangeTitle: (value: string) => void;
  onSubmitTitle: (event: React.FormEvent) => Promise<void>;
};

export function TitlePanel({
  locale,
  title,
  sectionStatus,
  profileState,
  onChangeTitle,
  onSubmitTitle,
}: TitlePanelProps) {
  const titleAuditDetail =
    profileState.title.message && sectionStatus.tone !== "green"
      ? tf(locale, "ui.stream.last_submit", {
          value: profileState.title.submitted || t(locale, "ui.stream.last_submit.none"),
        })
      : "";

  return (
    <form onSubmit={(event) => void onSubmitTitle(event)} className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
          {t(locale, "ui.stream.title.label")}
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
          <span className="text-gray-300 font-medium">{sectionStatus.label}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(event) => onChangeTitle(event.target.value)}
          placeholder={t(locale, "ui.stream.title.placeholder")}
          className="flex-1 rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none hover:border-white/12"
        />
        <button
          type="submit"
          className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-4 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
        >
          {t(locale, "ui.stream.title.update")}
        </button>
      </div>
      {titleAuditDetail && (
        <p className="text-[10px] leading-relaxed text-amber-200/90 font-medium">
          {titleAuditDetail} · {profileState.title.message}
        </p>
      )}
    </form>
  );
}
