import { Minimize2, LogOut, EyeOff } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type WindowBehaviorSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const windowBehaviorCardClass =
  "flex min-h-20 items-start rounded-xl border p-3.5 text-left transition-all duration-200";

export function WindowBehaviorSection({
  locale,
  appConfig,
  onChangeConfig,
}: WindowBehaviorSectionProps) {
  return (
    <section className="space-y-4.5 p-5">
      <div>
        <div className="flex items-center space-x-2">
          <Minimize2 className="h-4 w-4 text-bili-blue" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            WINDOW BEHAVIOR
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 font-medium">
          {t(locale, "ui.settings.window_behavior.desc_prefix")}
          {appConfig.has_tray
            ? t(locale, "ui.settings.window_behavior.tray_supported")
            : t(locale, "ui.settings.window_behavior.tray_unsupported")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChangeConfig("min_to_tray", true)}
          className={`${windowBehaviorCardClass} ${
            appConfig.min_to_tray
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <Minimize2 className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${appConfig.min_to_tray ? "text-bili-blue" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">{t(locale, "ui.settings.window_behavior.minimize.title")}</span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.window_behavior.minimize.desc")}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeConfig("min_to_tray", false)}
          className={`${windowBehaviorCardClass} ${
            !appConfig.min_to_tray
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <LogOut className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${!appConfig.min_to_tray ? "text-bili-pink" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">{t(locale, "ui.settings.window_behavior.exit.title")}</span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.window_behavior.exit.desc")}
            </span>
          </div>
        </button>
      </div>

      {appConfig.is_macos && (
        <button
          type="button"
          onClick={() =>
            onChangeConfig("hide_dock_on_minimize", !appConfig.hide_dock_on_minimize)
          }
          disabled={!appConfig.min_to_tray}
          className={`flex w-full items-start rounded-xl border p-4 text-left transition-all duration-200 ${
            appConfig.hide_dock_on_minimize
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          } ${!appConfig.min_to_tray ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <EyeOff
            className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${
              appConfig.hide_dock_on_minimize ? "text-bili-blue" : "text-gray-500"
            }`}
          />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.window_behavior.hide_dock.title")}
            </span>
            <span className="mt-1 block text-[10px] leading-normal text-gray-500 font-medium">
              {t(locale, "ui.settings.window_behavior.hide_dock.desc")}
            </span>
          </div>
        </button>
      )}
    </section>
  );
}
