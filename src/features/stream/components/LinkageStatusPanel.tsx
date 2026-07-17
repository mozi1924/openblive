import { ExternalLink } from "lucide-react";
import type { ActiveTab, LinkageStatus } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { resolveBackendMessage, t, tf } from "../../../utils/i18n";

type LinkageStatusPanelProps = {
  locale: LocaleSetting;
  linkageStatus: LinkageStatus | null;
  onSelectTab: (tab: ActiveTab) => void;
};

export function LinkageStatusPanel({
  locale,
  linkageStatus,
  onSelectTab,
}: LinkageStatusPanelProps) {
  const obsStatus = linkageStatus?.obs_ws;
  const commandStatus = linkageStatus?.command;
  const activeLinkageMode = linkageStatus?.mode ?? "none";
  const isObsConfigured = Boolean(obsStatus?.url);
  const isCommandConfigured = Boolean(
    commandStatus?.start_configured || commandStatus?.stop_configured || commandStatus?.template_preview,
  );
  const hasActiveLinkage = activeLinkageMode === "obs_ws"
    ? isObsConfigured
    : activeLinkageMode === "command"
      ? isCommandConfigured
      : false;

  const linkageTitle = activeLinkageMode === "obs_ws"
    ? "OBS WebSocket"
    : activeLinkageMode === "command"
      ? t(locale, "ui.stream.linkage.command")
      : t(locale, "ui.stream.linkage.none");

  const linkageStateText = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? t(locale, "ui.stream.linkage.state.connected")
      : t(locale, "ui.stream.linkage.state.disconnected")
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured
        ? t(locale, "ui.stream.linkage.state.deployed")
        : commandStatus?.stop_configured
          ? t(locale, "ui.stream.linkage.state.stop_only")
          : t(locale, "ui.stream.linkage.state.not_configured")
      : t(locale, "ui.stream.linkage.state.pending");

  const linkageStateClass = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
      : "text-rose-400 border-rose-500/20 bg-rose-500/10"
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured || commandStatus?.stop_configured
        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
        : "text-amber-400 border-amber-500/20 bg-amber-500/10"
      : "text-gray-400 border-white/8 bg-white/4";

  return (
    <div className="space-y-3 rounded-lg border border-white/5 bg-[#05070a] p-3.5 text-left">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase">
            EQUIPMENT LINKAGE
          </span>
        </div>
      </div>

      {!hasActiveLinkage ? (
        <div className="rounded border border-dashed border-white/10 bg-white/2 p-3 text-center">
          <p className="text-xs font-bold text-gray-200">{t(locale, "ui.stream.no_linkage")}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 font-medium">
            {t(locale, "ui.stream.no_linkage.desc")}
          </p>
          <button
            onClick={() => onSelectTab("settings")}
            className="mt-2 inline-flex items-center text-[11px] font-bold text-bili-blue hover:underline"
          >
            {t(locale, "ui.stream.no_linkage.goto")}
            <ExternalLink className="ml-1 h-3 w-3" />
          </button>
        </div>
      ) : (
        <div className="rounded border border-white/5 bg-white/2 p-2.5 font-mono text-[11px] transition-all hover:bg-white/4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold text-gray-300">{linkageTitle}</span>
              <p className="mt-0.5 text-[10px] font-sans text-gray-500 font-medium">
                {activeLinkageMode === "obs_ws" ? t(locale, "ui.stream.linkage.current.obs") : t(locale, "ui.stream.linkage.current.command")}
              </p>
            </div>
            <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-extrabold ${linkageStateClass}`}>
              {linkageStateText}
            </span>
          </div>

          {activeLinkageMode === "obs_ws" && (
            <div className="space-y-1">
              <p className="truncate text-[10px] text-gray-500 font-medium">
                {tf(locale, "ui.stream.linkage.address", { value: obsStatus?.url || "ws://127.0.0.1:4455" })}
              </p>
              {obsStatus?.last_error && (
                <p className="truncate text-[9px] text-rose-400 leading-tight">
                  ERR: {resolveBackendMessage(obsStatus.last_error, locale)}
                </p>
              )}
            </div>
          )}

          {activeLinkageMode === "command" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                  commandStatus?.start_configured
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-white/8 bg-white/4 text-gray-500"
                }`}>
                  {tf(locale, "ui.stream.command.start", {
                    status: commandStatus?.start_configured
                      ? t(locale, "ui.stream.command.configured")
                      : t(locale, "ui.stream.command.unconfigured"),
                  })}
                </span>
                <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                  commandStatus?.stop_configured
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-white/8 bg-white/4 text-gray-500"
                }`}>
                  {tf(locale, "ui.stream.command.stop", {
                    status: commandStatus?.stop_configured
                      ? t(locale, "ui.stream.command.configured")
                      : t(locale, "ui.stream.command.unconfigured"),
                  })}
                </span>
              </div>

              {commandStatus?.template_preview && (
                <p className="truncate rounded bg-black/40 px-2 py-1 text-[9px] text-gray-500 select-text font-medium">
                  CMD: {commandStatus.template_preview}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
