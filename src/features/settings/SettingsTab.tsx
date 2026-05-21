import { useState } from "react";
import {
  Cpu,
  Terminal,
  Minimize2,
  LogOut,
  Save,
  Sliders,
  Server,
  EyeOff,
  ChevronDown,
  Globe,
  PanelTop,
  Eye,
} from "lucide-react";
import type { AppConfig } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

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

  if (!appConfig) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-gray-500">
        {t(locale, "ui.settings.loading")}
      </div>
    );
  }

  const variables = ["{server}", "{stream_url}", "{stream_code}", "{protocol}"];
  const optionCardClass =
    "flex min-h-36 items-start rounded-xl border p-4 text-left transition-all duration-200";
  const windowBehaviorCardClass =
    "flex min-h-20 items-start rounded-xl border p-3.5 text-left transition-all duration-200";
  const inputClass =
    "w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";
  const selectClass =
    "h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3.5 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none";

  return (
    <div className={`relative mx-auto max-w-4xl ${hasPendingConfigChanges ? "pb-24" : "pb-6"}`}>
      <div className="flat-panel rounded-xl overflow-hidden divide-y divide-white/5">
        
        {/* Language Selection */}
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

        {/* Window Behavior */}
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
          <section className="space-y-4 p-5">
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
          <section className="space-y-4 p-5">
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

        {/* Advanced Settings */}
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
