import { Globe, ChevronDown } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type LanguageSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  savingLocale: boolean;
  onChangeLocale: (locale: AppConfig["locale"]) => Promise<void>;
};

const selectClass =
  "h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3.5 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none";

export function LanguageSection({
  locale,
  appConfig,
  savingLocale,
  onChangeLocale,
}: LanguageSectionProps) {
  return (
    <section className="space-y-3.5 p-5">
      <div className="flex items-center space-x-2">
        <Globe className="h-4 w-4 text-bili-blue" />
        <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
          LANGUAGE SETTING
        </span>
      </div>
      <div className="relative max-w-xs">
        <select
          className={selectClass}
          value={appConfig.locale}
          disabled={savingLocale}
          onChange={(event) =>
            void onChangeLocale(
              (event.target.value as AppConfig["locale"]) || "auto",
            )
          }
        >
          <option value="auto" className="bg-[#090b0f]">{t(locale, "ui.settings.locale.auto")}</option>
          <option value="zh-CN" className="bg-[#090b0f]">{t(locale, "ui.settings.locale.zh")}</option>
          <option value="en-US" className="bg-[#090b0f]">{t(locale, "ui.settings.locale.en")}</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      </div>
    </section>
  );
}
