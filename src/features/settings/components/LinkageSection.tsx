import { Cpu, Terminal, Sliders, Server, EyeOff } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type LinkageSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const variables = ["{server}", "{stream_url}", "{stream_code}", "{protocol}"];
const optionCardClass =
  "flex min-h-36 items-start rounded-xl border p-4 text-left transition-all duration-200";
const inputClass =
  "w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";

export function LinkageSection({
  locale,
  appConfig,
  onChangeConfig,
}: LinkageSectionProps) {
  return (
    <>
      {/* Linkage Mode Select */}
      <section className="space-y-4.5 p-5">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="h-4 w-4 text-bili-pink" />
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              DEVICE LINKAGE MODE
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 font-medium">
            {t(locale, "ui.settings.linkage.desc")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "obs_ws")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "obs_ws"
                ? "border-bili-blue/35 bg-bili-blue/5 text-white"
                : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Cpu className={`h-4 w-4 ${appConfig.live_control_mode === "obs_ws" ? "text-bili-blue" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200 font-mono">OBS WebSocket</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed font-medium">
              {t(locale, "ui.settings.linkage.obs.desc")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "command")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "command"
                ? "border-bili-pink/35 bg-bili-pink/5 text-white"
                : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Terminal className={`h-4 w-4 ${appConfig.live_control_mode === "command" ? "text-bili-pink" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200">{t(locale, "ui.settings.linkage.command.title")}</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed font-medium">
              {t(locale, "ui.settings.linkage.command.desc")}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "none")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "none"
                ? "border-amber-500/35 bg-amber-500/5 text-white"
                : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sliders className={`h-4 w-4 ${appConfig.live_control_mode === "none" ? "text-amber-400" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200">{t(locale, "ui.settings.linkage.none.title")}</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed font-medium">
              {t(locale, "ui.settings.linkage.none.desc")}
            </span>
          </button>
        </div>
      </section>

      {/* OBS WS Setup */}
      {appConfig.live_control_mode === "obs_ws" && (
        <section className="space-y-4 p-5 border-t border-white/5">
          <div>
            <div className="flex items-center space-x-2">
              <Server className="h-4 w-4 text-bili-blue" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                OBS WEBSOCKET CONFIG
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 font-medium">
              {t(locale, "ui.settings.obs.desc")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.obs.server")}</span>
              <input
                className={inputClass}
                value={appConfig.obs_ws_url}
                onChange={(event) =>
                  onChangeConfig("obs_ws_url", event.target.value)
                }
                placeholder="ws://127.0.0.1:4455"
              />
            </div>
            
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.obs.password")}</span>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  type="password"
                  value={appConfig.obs_ws_password}
                  onChange={(event) =>
                    onChangeConfig("obs_ws_password", event.target.value)
                  }
                  placeholder={t(locale, "ui.settings.obs.password.placeholder")}
                />
                <EyeOff className="absolute right-3.5 top-2.5 h-4 w-4 text-gray-600" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Command Linkage triggers */}
      {appConfig.live_control_mode === "command" && (
        <section className="space-y-4 p-5 border-t border-white/5">
          <div>
            <div className="flex items-center space-x-2">
              <Terminal className="h-4 w-4 text-bili-pink" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                SHELL COMMAND DEFINITION
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 font-medium">
              {t(locale, "ui.settings.command.desc")}
            </p>
            
            <div className="mt-2 flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <span
                  key={v}
                  className="rounded border border-white/5 bg-white/2 px-1.5 py-0.5 text-[9px] font-mono font-bold text-gray-400 hover:text-white"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-3.5">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.command.start")}</span>
              <input
                className="w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs font-mono text-gray-300 outline-none transition-all hover:border-white/12 focus:border-bili-pink/40"
                value={appConfig.on_live_start_command}
                onChange={(event) =>
                  onChangeConfig("on_live_start_command", event.target.value)
                }
                placeholder={t(locale, "ui.settings.command.start.placeholder")}
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">{t(locale, "ui.settings.command.stop")}</span>
              <input
                className="w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs font-mono text-gray-300 outline-none transition-all hover:border-white/12 focus:border-bili-pink/40"
                value={appConfig.on_live_stop_command}
                onChange={(event) =>
                  onChangeConfig("on_live_stop_command", event.target.value)
                }
                placeholder={t(locale, "ui.settings.command.stop.placeholder")}
              />
            </div>
          </div>
        </section>
      )}
      {/* Custom Push Server Settings */}
      <section className="space-y-4 p-5 border-t border-white/5">
        <div>
          <div className="flex items-center space-x-2">
            <Server className="h-4 w-4 text-bili-blue" />
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              CUSTOM PUSH SERVER
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 font-medium">
            {t(locale, "ui.settings.stream.push_settings.desc")}
          </p>
        </div>

        <div className="space-y-4">
          <button
            type="button"
            onClick={() =>
              onChangeConfig("force_custom_push_url", !appConfig.force_custom_push_url)
            }
            className={`flex w-full items-start rounded-xl border p-4 text-left transition-all duration-200 ${
              appConfig.force_custom_push_url
                ? "border-bili-blue/35 bg-bili-blue/5 text-white"
                : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
            }`}
          >
            <Server
              className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${
                appConfig.force_custom_push_url ? "text-bili-blue" : "text-gray-500"
              }`}
            />
            <div>
              <span className="block text-xs font-bold text-gray-200">
                {t(locale, "ui.settings.stream.force_custom_push")}
              </span>
              <span className="mt-1 block text-[10px] leading-normal text-gray-500 font-medium">
                {t(locale, "ui.settings.stream.force_custom_push.desc")}
              </span>
            </div>
          </button>

          {appConfig.force_custom_push_url && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                {t(locale, "ui.settings.stream.custom_push_url")}
              </span>
              <input
                className={inputClass}
                value={appConfig.custom_push_url}
                onChange={(event) =>
                  onChangeConfig("custom_push_url", event.target.value)
                }
                placeholder="rtmp://live-push.bilivideo.com/live-bvc/"
              />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
