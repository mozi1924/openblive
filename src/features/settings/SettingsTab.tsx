import type { AppConfig } from "../../types/studio";

type SettingsTabProps = {
  appConfig: AppConfig | null;
  savingConfig: boolean;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
  onSaveConfig: () => Promise<void>;
};

export function SettingsTab({
  appConfig,
  savingConfig,
  onChangeConfig,
  onSaveConfig,
}: SettingsTabProps) {
  if (!appConfig) {
    return (
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 text-sm text-gray-300">
        正在加载设置...
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-base font-semibold text-white">关闭按钮行为</h3>
        <p className="mt-1 text-xs text-gray-400">
          可切换为“最小化到托盘”或“直接退出程序”。
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {appConfig.has_tray
            ? "当前环境支持托盘菜单。"
            : "当前环境未检测到托盘能力，关闭时将按系统默认行为处理。"}
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="radio"
              name="close-behavior"
              checked={appConfig.min_to_tray}
              onChange={() => onChangeConfig("min_to_tray", true)}
            />
            关闭窗口时最小化到托盘（推荐）
          </label>
          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="radio"
              name="close-behavior"
              checked={!appConfig.min_to_tray}
              onChange={() => onChangeConfig("min_to_tray", false)}
            />
            关闭窗口时直接退出程序
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-base font-semibold text-white">OBS WebSocket 联动</h3>
        <p className="mt-1 text-xs text-gray-400">
          先保存配置，后续可继续接入自动连 OBS、联动开播/下播执行。
        </p>

        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="checkbox"
              checked={appConfig.obs_ws_enabled}
              onChange={(event) =>
                onChangeConfig("obs_ws_enabled", event.target.checked)
              }
            />
            启用 OBS WS 联动
          </label>
          <label className="block text-gray-300">
            OBS WS 地址
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-bili-blue"
              value={appConfig.obs_ws_url}
              onChange={(event) =>
                onChangeConfig("obs_ws_url", event.target.value)
              }
              placeholder="ws://127.0.0.1:4455"
            />
          </label>
          <label className="block text-gray-300">
            OBS WS 密码
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-bili-blue"
              type="password"
              value={appConfig.obs_ws_password}
              onChange={(event) =>
                onChangeConfig("obs_ws_password", event.target.value)
              }
              placeholder="可为空"
            />
          </label>
          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="checkbox"
              checked={appConfig.obs_ws_auto_start_on_live}
              onChange={(event) =>
                onChangeConfig("obs_ws_auto_start_on_live", event.target.checked)
              }
            />
            开播时联动 OBS 开始推流
          </label>
          <label className="flex items-center gap-2 text-gray-200">
            <input
              type="checkbox"
              checked={appConfig.obs_ws_auto_stop_on_live_end}
              onChange={(event) =>
                onChangeConfig(
                  "obs_ws_auto_stop_on_live_end",
                  event.target.checked,
                )
              }
            />
            下播时联动 OBS 停止推流
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-base font-semibold text-white">命令联动</h3>
        <p className="mt-1 text-xs text-gray-400">
          预留命令字段，后续可实现开播/下播自动执行脚本。
        </p>
        <div className="mt-4 space-y-3 text-sm">
          <label className="block text-gray-300">
            开播时执行命令
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-bili-blue"
              value={appConfig.on_live_start_command}
              onChange={(event) =>
                onChangeConfig("on_live_start_command", event.target.value)
              }
              placeholder="例如: obs-cli scene switch Live"
            />
          </label>
          <label className="block text-gray-300">
            下播时执行命令
            <input
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1220] px-3 py-2 text-sm text-white outline-none focus:border-bili-blue"
              value={appConfig.on_live_stop_command}
              onChange={(event) =>
                onChangeConfig("on_live_stop_command", event.target.value)
              }
              placeholder="例如: obs-cli streaming stop"
            />
          </label>
        </div>

        <button
          onClick={() => void onSaveConfig()}
          disabled={savingConfig}
          className="mt-5 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm text-white transition-colors hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {savingConfig ? "保存中..." : "保存设置"}
        </button>
      </section>
    </div>
  );
}
