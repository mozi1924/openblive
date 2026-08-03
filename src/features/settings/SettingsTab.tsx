import { Save } from "lucide-react";
import type { AppConfig } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

import { LanguageSection } from "./components/LanguageSection";
import { WindowBehaviorSection } from "./components/WindowBehaviorSection";
import { DanmuOverlaySection } from "./components/DanmuOverlaySection";
import { WsServerSection } from "./components/WsServerSection";
import { LinkageSection } from "./components/LinkageSection";
import { TtsSettingsSection } from "./components/TtsSettingsSection";
import { AdvancedSettingsSection } from "./components/AdvancedSettingsSection";

type SettingsTabProps = {
  appConfig: AppConfig | null;
  hasPendingConfigChanges: boolean;
  locale: LocaleSetting;
  savingConfig: boolean;
  savingLocale: boolean;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onChangeLocale: (locale: AppConfig["locale"]) => Promise<void>;
  onSaveConfig: () => Promise<void>;
  onGenerateHttpUserAgent: () => Promise<void>;
};

export function SettingsTab({
  appConfig,
  hasPendingConfigChanges,
  locale,
  savingConfig,
  savingLocale,
  onChangeConfig,
  onChangeLocale,
  onSaveConfig,
  onGenerateHttpUserAgent,
}: SettingsTabProps) {
  if (!appConfig) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-gray-500">
        {t(locale, "ui.settings.loading")}
      </div>
    );
  }

  return (
    <div className={`relative mx-auto max-w-4xl ${hasPendingConfigChanges ? "pb-24" : "pb-6"}`}>
      <div className="flat-panel rounded-xl overflow-hidden divide-y divide-white/5">
        <LanguageSection
          locale={locale}
          appConfig={appConfig}
          savingLocale={savingLocale}
          onChangeLocale={onChangeLocale}
        />

        <WindowBehaviorSection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
        />

        <DanmuOverlaySection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
        />

        <TtsSettingsSection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
        />

        <WsServerSection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
        />

        <LinkageSection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
        />

        <AdvancedSettingsSection
          locale={locale}
          appConfig={appConfig}
          onChangeConfig={onChangeConfig}
          onGenerateHttpUserAgent={onGenerateHttpUserAgent}
        />
      </div>

      {/* Sticky footer for saving configuration */}
      <div className="sticky bottom-0 z-20 h-0">
        <div
          className={`flex items-center justify-between gap-4 rounded-xl border border-white/8 bg-[#070a0f]/90 px-5 py-3.5 shadow-md backdrop-blur-lg transition-all duration-300 ${
            hasPendingConfigChanges
              ? "-translate-y-[calc(100%+1rem)] opacity-100"
              : "translate-y-0 opacity-0 pointer-events-none"
          }`}
        >
          <div>
            <p className="text-[11px] font-semibold text-gray-300">{t(locale, "ui.settings.save.instant")}</p>
            <p className="mt-0.5 text-[10px] text-gray-500">
              {t(locale, "ui.settings.save.tip")}
            </p>
          </div>

          <button
            onClick={() => void onSaveConfig()}
            disabled={savingConfig}
            className="btn-primary flex h-9.5 min-w-[128px] items-center justify-center rounded-lg px-5 text-xs font-bold text-white shadow-md active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="mr-2 h-3.5 w-3.5" />
            {savingConfig ? t(locale, "ui.settings.save.saving") : t(locale, "ui.settings.save.all")}
          </button>
        </div>
      </div>
    </div>
  );
}
