import { Cpu, Terminal, Minimize2, LogOut, Save, Sliders, Server, EyeOff } from "lucide-react";
import type { AppConfig } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type SettingsTabProps = {
  appConfig: AppConfig | null;
  locale: LocaleSetting;
  savingConfig: boolean;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveConfig: () => Promise<void>;
};

export function SettingsTab({
  appConfig,
  locale,
  savingConfig,
  onChangeConfig,
  onSaveConfig,
}: SettingsTabProps) {
  if (!appConfig) {
    return (
      <div className="flex items-center justify-center py-20 text-xs text-gray-500">
        {t(locale, "ui.settings.loading")}
      </div>
    );
  }

  const variables = ["{server}", "{stream_key}", "{stream_url}", "{stream_code}", "{protocol}"];
  const optionCardClass =
    "flex min-h-36 items-start rounded-2xl border p-4 text-left transition-all duration-200";
  const inputClass =
    "w-full rounded-xl border border-white/8 bg-[#090b0f] px-3.5 py-3 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";

  return (
    <div className="relative mx-auto max-w-4xl space-y-6 pb-28">
      
      {/* Window Behavior */}
      <section className="glass-panel space-y-4 rounded-3xl p-6">
        <div className="text-xs text-gray-500">{t(locale, "ui.settings.locale.label")}</div>
        <select
          className={inputClass}
          value={appConfig.locale}
          onChange={(event) =>
            onChangeConfig(
              "locale",
              (event.target.value as AppConfig["locale"]) || "auto",
            )
          }
        >
          <option value="auto">{t(locale, "ui.settings.locale.auto")}</option>
          <option value="zh-CN">{t(locale, "ui.settings.locale.zh")}</option>
          <option value="en-US">{t(locale, "ui.settings.locale.en")}</option>
        </select>
      </section>

      {/* Window Behavior */}
      <section className="glass-panel space-y-5 rounded-3xl p-6">
        <div>
          <div className="flex items-center space-x-2">
            <Minimize2 className="h-4.5 w-4.5 text-bili-blue" />
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              WINDOW BEHAVIOR
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            自定义窗口关闭按钮的行为。当前托盘菜单：{appConfig.has_tray ? "已支持" : "不支持"}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => onChangeConfig("min_to_tray", true)}
            className={`${optionCardClass} ${
              appConfig.min_to_tray
                ? "border-bili-blue/35 bg-bili-blue/5 text-white"
                : "border-white/5 bg-white/2.5 text-gray-400 hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <Minimize2 className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${appConfig.min_to_tray ? "text-bili-blue" : "text-gray-500"}`} />
            <div>
              <span className="block text-xs font-bold text-gray-200">最小化到系统托盘</span>
              <span className="mt-1 block text-[10px] text-gray-500 leading-normal">
                关闭窗口时程序在后台托盘静默运行，不会意外断开当前的直播与设备联动。
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig("min_to_tray", false)}
            className={`${optionCardClass} ${
              !appConfig.min_to_tray
                ? "border-bili-blue/35 bg-bili-blue/5 text-white"
                : "border-white/5 bg-white/2.5 text-gray-400 hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <LogOut className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${!appConfig.min_to_tray ? "text-bili-pink" : "text-gray-500"}`} />
            <div>
              <span className="block text-xs font-bold text-gray-200">直接退出程序</span>
              <span className="mt-1 block text-[10px] text-gray-500 leading-normal">
                点击关闭按钮时立即注销所有联结并清理环境退出。
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* Linkage Mode Select */}
      <section className="glass-panel space-y-5 rounded-3xl p-6">
        <div>
          <div className="flex items-center space-x-2">
            <Cpu className="h-4.5 w-4.5 text-bili-pink" />
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              DEVICE LINKAGE MODE
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            选择在哔哩哔哩直播间开启或停止时，本地需要触发的同步联动方式。
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "obs_ws")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "obs_ws"
                ? "border-bili-blue/35 bg-bili-blue/5 text-white"
                : "border-white/5 bg-white/2.5 text-gray-400 hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Cpu className={`h-4.5 w-4.5 ${appConfig.live_control_mode === "obs_ws" ? "text-bili-blue" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200 font-mono">OBS WebSocket</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed">
              基于 OBS Websocket v5 官方协议。开播时自动写入流密钥并启动串流，下播时自动停止。
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "command")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "command"
                ? "border-bili-pink/35 bg-bili-pink/5 text-white"
                : "border-white/5 bg-white/2.5 text-gray-400 hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Terminal className={`h-4.5 w-4.5 ${appConfig.live_control_mode === "command" ? "text-bili-pink" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200">命令行联动</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed">
              执行自定义本地 Shell 脚本命令（如 FFmpeg、Gstreamer 等），支持注入服务器与密钥参数。
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeConfig("live_control_mode", "none")}
            className={`${optionCardClass} flex-col ${
              appConfig.live_control_mode === "none"
                ? "border-amber-500/35 bg-amber-500/5 text-white"
                : "border-white/5 bg-white/2.5 text-gray-400 hover:border-white/10 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sliders className={`h-4.5 w-4.5 ${appConfig.live_control_mode === "none" ? "text-amber-400" : "text-gray-500"}`} />
              <span className="text-xs font-bold text-gray-200">不进行联动</span>
            </div>
            <span className="mt-2 text-[10px] text-gray-500 leading-relaxed">
              仅使用此面板控制 Bilibili 官方直播间标题、分区等信息，不进行任何本地采集器串流联动。
            </span>
          </button>
        </div>
      </section>

      {/* OBS WS Setup */}
      {appConfig.live_control_mode === "obs_ws" && (
        <section className="glass-panel space-y-4 rounded-3xl p-6">
          <div>
            <div className="flex items-center space-x-2">
              <Server className="h-4.5 w-4.5 text-bili-blue" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                OBS WEBSOCKET CONFIG
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              请确保 OBS Studio -“工具”-“WebSocket 服务器设置”中已启用服务器。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">服务器地址</span>
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
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">访问密码</span>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  type="password"
                  value={appConfig.obs_ws_password}
                  onChange={(event) =>
                    onChangeConfig("obs_ws_password", event.target.value)
                  }
                  placeholder="OBS WebSocket 访问密码 (无则置空)"
                />
                <EyeOff className="absolute right-3.5 top-3 h-4 w-4 text-gray-600" />
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Command Linkage triggers */}
      {appConfig.live_control_mode === "command" && (
        <section className="glass-panel space-y-4 rounded-3xl p-6">
          <div>
            <div className="flex items-center space-x-2">
              <Terminal className="h-4.5 w-4.5 text-bili-pink" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                SHELL COMMAND DEFINITION
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              设置命令模板。执行命令时，以下变量将被推流信息动态替换：
            </p>
            
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {variables.map((v) => (
                <span
                  key={v}
                  className="rounded-lg border border-white/5 bg-white/3 px-2 py-0.5 text-[9px] font-mono font-bold text-gray-400 hover:text-white"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">开播触发命令</span>
              <input
                className="w-full rounded-xl border border-white/8 bg-[#090b0f] px-4 py-3 text-xs font-mono text-gray-300 outline-none transition-all hover:border-white/12 focus:border-bili-pink/40"
                value={appConfig.on_live_start_command}
                onChange={(event) =>
                  onChangeConfig("on_live_start_command", event.target.value)
                }
                placeholder="例如: ffmpeg -re -i my_feed.mp4 -c copy -f flv {stream_url}"
              />
            </div>

            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">下播触发命令</span>
              <input
                className="w-full rounded-xl border border-white/8 bg-[#090b0f] px-4 py-3 text-xs font-mono text-gray-300 outline-none transition-all hover:border-white/12 focus:border-bili-pink/40"
                value={appConfig.on_live_stop_command}
                onChange={(event) =>
                  onChangeConfig("on_live_stop_command", event.target.value)
                }
                placeholder="例如: killall ffmpeg"
              />
            </div>
          </div>
        </section>
      )}

      {/* Sticky footer for saving configuration */}
      <div className="sticky bottom-[-2rem] z-20 mt-8 flex items-center justify-between gap-4 rounded-3xl border border-white/8 bg-[#070a0f]/88 px-6 py-4 shadow-[0_-10px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl">
        <div>
          <p className="text-[11px] font-semibold text-gray-300">保存后立即生效</p>
          <p className="mt-1 text-[10px] text-gray-500">
            配置会写入本地 `config.json`，下次启动仍会保留。
          </p>
        </div>
        
        <button
          onClick={() => void onSaveConfig()}
          disabled={savingConfig}
          className="btn-primary flex h-11 min-w-[148px] items-center justify-center rounded-2xl px-6 text-xs font-bold text-white shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="mr-2 h-4 w-4" />
          {savingConfig ? "保存中..." : "保存全部设置"}
        </button>
      </div>

    </div>
  );
}
