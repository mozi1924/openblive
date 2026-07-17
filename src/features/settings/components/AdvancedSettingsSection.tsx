import { useState } from "react";
import { Globe, ChevronDown } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type AdvancedSettingsSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onGenerateHttpUserAgent: () => Promise<void>;
};

const inputClass =
  "w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";

export function AdvancedSettingsSection({
  locale,
  appConfig,
  onChangeConfig,
  onGenerateHttpUserAgent,
}: AdvancedSettingsSectionProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const clearAdvancedConfig = () => {
    onChangeConfig("host_www", "");
    onChangeConfig("host_api", "");
    onChangeConfig("host_live_api", "");
    onChangeConfig("host_passport", "");
    onChangeConfig("host_live_web", "");
    onChangeConfig("cookie_domain", "");
    onChangeConfig("danmu_host", "");
    onChangeConfig("app_key", "");
    onChangeConfig("app_sec", "");
    onChangeConfig("http_user_agent", "");
    onChangeConfig("livehime_version_override", "");
    onChangeConfig("livehime_build_override", "");
    onChangeConfig("live_platform", "");
  };

  return (
    <section className="bg-amber-500/[0.01] p-5">
      <button
        type="button"
        onClick={() => setShowAdvanced((prev) => !prev)}
        className="flex w-full items-center justify-between text-left"
      >
        <div className="flex items-center space-x-2">
          <Globe className="h-4 w-4 text-amber-300" />
          <span className="text-[10px] font-extrabold tracking-widest text-amber-200/90 uppercase">
            {t(locale, "ui.settings.advanced.title")}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-amber-200/80 transition-transform duration-200 ${
            showAdvanced ? "rotate-180" : ""
          }`}
        />
      </button>

      <p className="mt-1.5 text-xs text-gray-400 font-medium">{t(locale, "ui.settings.advanced.desc")}</p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={clearAdvancedConfig}
          className="rounded-lg border border-amber-300/25 px-3 py-1.5 text-[10px] font-semibold text-amber-100 transition-colors hover:border-amber-200/40 hover:bg-amber-200/10"
        >
          {t(locale, "ui.settings.advanced.clear")}
        </button>
      </div>

      {showAdvanced && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.host_www")}</span>
            <input
              className={inputClass}
              value={appConfig.host_www}
              onChange={(event) => onChangeConfig("host_www", event.target.value)}
              placeholder="www.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.host_api")}</span>
            <input
              className={inputClass}
              value={appConfig.host_api}
              onChange={(event) => onChangeConfig("host_api", event.target.value)}
              placeholder="api.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.host_live_api")}</span>
            <input
              className={inputClass}
              value={appConfig.host_live_api}
              onChange={(event) => onChangeConfig("host_live_api", event.target.value)}
              placeholder="api.live.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.host_passport")}</span>
            <input
              className={inputClass}
              value={appConfig.host_passport}
              onChange={(event) => onChangeConfig("host_passport", event.target.value)}
              placeholder="passport.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.host_live_web")}</span>
            <input
              className={inputClass}
              value={appConfig.host_live_web}
              onChange={(event) => onChangeConfig("host_live_web", event.target.value)}
              placeholder="live.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.cookie_domain")}</span>
            <input
              className={inputClass}
              value={appConfig.cookie_domain}
              onChange={(event) => onChangeConfig("cookie_domain", event.target.value)}
              placeholder=".bilibili.com"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.danmu_host")}</span>
            <input
              className={inputClass}
              value={appConfig.danmu_host}
              onChange={(event) => onChangeConfig("danmu_host", event.target.value)}
              placeholder="broadcastlv.chat.bilibili.com"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.app_key")}</span>
            <input
              className={inputClass}
              value={appConfig.app_key}
              onChange={(event) => onChangeConfig("app_key", event.target.value)}
              placeholder="aae92bc66f3edfab"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.app_sec")}</span>
            <input
              className={inputClass}
              value={appConfig.app_sec}
              onChange={(event) => onChangeConfig("app_sec", event.target.value)}
              placeholder="af125a0d5279fd576c1b4418a3e8276d"
            />
          </label>
          <div className="space-y-1 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide font-medium">
                {t(locale, "ui.settings.advanced.http_user_agent")}
              </span>
              <button
                type="button"
                onClick={() => void onGenerateHttpUserAgent()}
                className="rounded border border-white/10 px-2 py-0.5 text-[9px] font-semibold text-gray-300 transition-colors hover:border-white/20 hover:bg-white/8 hover:text-white"
              >
                {t(locale, "ui.settings.advanced.http_user_agent.generate")}
              </button>
            </div>
            <input
              className={inputClass}
              value={appConfig.http_user_agent}
              onChange={(event) => onChangeConfig("http_user_agent", event.target.value)}
              placeholder="Mozilla/5.0 (...)"
            />
          </div>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.livehime_version")}</span>
            <input
              className={inputClass}
              value={appConfig.livehime_version_override}
              onChange={(event) => onChangeConfig("livehime_version_override", event.target.value)}
              placeholder="7.54.0.10521"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.livehime_build")}</span>
            <input
              className={inputClass}
              value={appConfig.livehime_build_override}
              onChange={(event) => onChangeConfig("livehime_build_override", event.target.value)}
              placeholder="10521"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.advanced.live_platform")}</span>
            <input
              className={inputClass}
              value={appConfig.live_platform}
              onChange={(event) => onChangeConfig("live_platform", event.target.value)}
              placeholder="pc_link / pc / android_link"
            />
          </label>
          <p className="sm:col-span-2 text-[10px] text-gray-500 leading-relaxed font-medium">
            {t(locale, "ui.settings.advanced.hint")}
          </p>
        </div>
      )}
    </section>
  );
}
