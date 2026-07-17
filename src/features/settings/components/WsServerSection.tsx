import { Server, Eye, EyeOff } from "lucide-react";
import type { AppConfig } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t } from "../../../utils/i18n";

type WsServerSectionProps = {
  locale: LocaleSetting;
  appConfig: AppConfig;
  onChangeConfig: <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => void;
};

const windowBehaviorCardClass =
  "flex min-h-20 items-start rounded-xl border p-3.5 text-left transition-all duration-200";

const inputClass =
  "w-full rounded-lg border border-white/8 bg-[#090b0f] px-3.5 py-2.5 text-xs text-white outline-none transition-all hover:border-white/12 focus:border-bili-blue/40";

export function WsServerSection({
  locale,
  appConfig,
  onChangeConfig,
}: WsServerSectionProps) {
  return (
    <section className="space-y-4.5 p-5">
      <div>
        <div className="flex items-center space-x-2">
          <Server className="h-4 w-4 text-bili-blue" />
          <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
            EXTERNAL WS SERVER
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 font-medium">
          {t(locale, "ui.settings.ws_server.desc")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onChangeConfig("ws_server_enabled", true)}
          className={`${windowBehaviorCardClass} ${
            appConfig.ws_server_enabled
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <Eye className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${appConfig.ws_server_enabled ? "text-bili-blue" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.ws_server.enable")}
            </span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.ws_server.enable_desc")}
            </span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => onChangeConfig("ws_server_enabled", false)}
          className={`${windowBehaviorCardClass} ${
            !appConfig.ws_server_enabled
              ? "border-bili-blue/35 bg-bili-blue/5 text-white"
              : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
          }`}
        >
          <EyeOff className={`mr-3 h-5 w-5 shrink-0 mt-0.5 ${!appConfig.ws_server_enabled ? "text-bili-blue" : "text-gray-500"}`} />
          <div>
            <span className="block text-xs font-bold text-gray-200">
              {t(locale, "ui.settings.ws_server.disable")}
            </span>
            <span className="mt-1 block text-[10px] text-gray-500 leading-normal font-medium">
              {t(locale, "ui.settings.ws_server.disable_desc")}
            </span>
          </div>
        </button>
      </div>

      <label className="flex flex-col gap-2 text-xs text-gray-300">
        <span>{t(locale, "ui.settings.ws_server.listen_addr")}</span>
        <input
          className={inputClass}
          value={appConfig.ws_server_listen_addr}
          onChange={(event) => onChangeConfig("ws_server_listen_addr", event.target.value)}
          placeholder="127.0.0.1:12450"
        />
      </label>

      <label className="flex flex-col gap-2 text-xs text-gray-300">
        <span>{t(locale, "ui.settings.ws_server.auth_token")}</span>
        <input
          className={inputClass}
          value={appConfig.ws_server_auth_token}
          onChange={(event) => onChangeConfig("ws_server_auth_token", event.target.value)}
          placeholder={t(locale, "ui.settings.ws_server.auth_token.placeholder")}
        />
      </label>

      <button
        type="button"
        onClick={() =>
          onChangeConfig(
            "ws_server_bypass_token_for_loopback",
            !appConfig.ws_server_bypass_token_for_loopback,
          )
        }
        className={`flex w-full items-start rounded-xl border p-4 text-left transition-all duration-200 ${
          appConfig.ws_server_bypass_token_for_loopback
            ? "border-bili-blue/35 bg-bili-blue/5 text-white"
            : "border-white/5 bg-white/2 text-gray-400 hover:border-white/10 hover:bg-white/4"
        }`}
      >
        <Server
          className={`mr-3 mt-0.5 h-5 w-5 shrink-0 ${
            appConfig.ws_server_bypass_token_for_loopback ? "text-bili-blue" : "text-gray-500"
          }`}
        />
        <div>
          <span className="block text-xs font-bold text-gray-200">
            {t(locale, "ui.settings.ws_server.bypass_loopback")}
          </span>
          <span className="mt-1 block text-[10px] leading-normal text-gray-500 font-medium">
            {t(locale, "ui.settings.ws_server.bypass_loopback_desc")}
          </span>
        </div>
      </button>
    </section>
  );
}
