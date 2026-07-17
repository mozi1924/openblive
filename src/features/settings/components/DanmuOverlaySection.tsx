import { PanelTop, Eye, EyeOff } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type DanmuOverlaySectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const windowBehaviorCardClass =
  "flex min-h-20 items-start rounded-xl border p-3.5 text-left transition-all duration-200";

export function DanmuOverlaySection({
  locale,
  appConfig,
  onChangeConfig,
}: DanmuOverlaySectionProps) {
  return (
    <section className="space-y-4.5 p-5">
      <div>
        <div className="flex items-center space-x-2">
          <PanelTop className="h-4 w-4 text-bili-pink" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            DANMU OVERLAY
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 font-medium">
          {t(locale, "ui.settings.overlay.desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChangeConfig("danmu_overlay_enabled", true)}
          className={`${windowBehaviorCardClass} ${
            appConfig.danmu_overlay_enabled
              ? "border-bili-pink/35 bg-bili-pink/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <Eye className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${appConfig.danmu_overlay_enabled ? "text-bili-pink" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.overlay.enable")}
            </span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.overlay.enable_desc")}
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChangeConfig("danmu_overlay_enabled", false)}
          className={`${windowBehaviorCardClass} ${
            !appConfig.danmu_overlay_enabled
              ? "border-bili-pink/35 bg-bili-pink/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <EyeOff className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${!appConfig.danmu_overlay_enabled ? "text-bili-pink" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.overlay.disable")}
            </span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.overlay.disable_desc")}
            </span>
          </div>
        </button>
      </div>

      <div className="rounded-xl border border-white/6 bg-white/[0.02] px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.overlay.opacity")}
            </p>
            <p className="mt-1 text-[10px] text-gray-500 font-medium">
              {t(locale, "ui.settings.overlay.opacity_desc")}
            </p>
          </div>
          <span className="rounded-full border border-bili-pink/15 bg-bili-pink/10 px-2.5 py-1 text-[10px] font-black text-bili-pink">
            {appConfig.danmu_overlay_opacity}%
          </span>
        </div>
        <input
          type="range"
          min={40}
          max={100}
          step={5}
          value={appConfig.danmu_overlay_opacity}
          onChange={(event) =>
            onChangeConfig("danmu_overlay_opacity", Number(event.target.value))
          }
          className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-white/8 accent-[#ff6699]"
        />
      </div>
    </section>
  );
}
