import { PanelTop, Radio, RefreshCw, Trash2, Users } from "lucide-react";
import type { ActiveTab } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type HeaderBarProps = {
  activeTab: ActiveTab;
  locale: LocaleSetting;
  headerDragRef: React.RefObject<HTMLElement | null>;
  onRefreshAccounts: () => Promise<void>;
  onRefreshPartitions: () => Promise<void>;
  danmuCount: number;
  danmuListening: boolean;
  danmuOverlayVisible: boolean;
  onStartDanmu: () => Promise<void>;
  onStopDanmu: () => Promise<void>;
  onShowDanmuOverlay: () => Promise<void>;
  onHideDanmuOverlay: () => Promise<void>;
  onClearDanmus: () => void;
};

export function HeaderBar({
  activeTab,
  locale,
  headerDragRef,
  onRefreshAccounts,
  onRefreshPartitions,
  danmuCount,
  danmuListening,
  danmuOverlayVisible,
  onStartDanmu,
  onStopDanmu,
  onShowDanmuOverlay,
  onHideDanmuOverlay,
  onClearDanmus,
}: HeaderBarProps) {
  const title = t(locale, `ui.header.title.${activeTab}`);
  const description = t(locale, `ui.header.desc.${activeTab}`);
  const showAccountRefresh = activeTab === "account";
  const showPartitionSync = activeTab === "stream";
  const showDanmuHeader = activeTab === "danmu";
  const showDefaultActions = showAccountRefresh || showPartitionSync;

  return (
    <header
      ref={headerDragRef}
      data-tauri-drag-region="deep"
      className="drag-region flex h-12 shrink-0 items-center justify-between border-b border-[#131b2b] bg-[#0a0e17] px-6"
    >
      {showDanmuHeader ? (
        <>
          <div className="flex items-center" data-tauri-drag-region="deep">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-wide text-white">
                  {t(locale, "ui.danmu.feed_title")}
                </span>
                <span className="rounded-full border border-bili-blue/20 bg-bili-blue/10 px-2 py-0.5 text-[10px] font-mono font-bold text-bili-blue">
                  {tf(locale, "ui.danmu.feed_count", { count: danmuCount })}
                </span>
              </div>
              <p className="text-[10px] font-medium text-gray-500">WebSocket Event Stream</p>
            </div>
          </div>

          <div data-tauri-drag-region="false" className="no-drag flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#05070a] px-2.5 py-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  danmuListening
                    ? "animate-pulse bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                    : "bg-gray-600"
                }`}
              />
              <span className="text-xs font-semibold text-gray-300">
                {danmuListening ? t(locale, "ui.danmu.status.on") : t(locale, "ui.danmu.status.off")}
              </span>
            </div>

            {!danmuListening ? (
              <button
                onClick={() => void onStartDanmu()}
                className="flex items-center space-x-1.5 rounded-lg bg-bili-blue px-3 py-1.5 text-xs font-bold text-white shadow-[0_4px_12px_rgba(0,174,236,0.25)] transition-all hover:bg-bili-blue/90 active:scale-95"
              >
                <Radio className="h-3.5 w-3.5" />
                <span>{t(locale, "ui.danmu.start")}</span>
              </button>
            ) : (
              <button
                onClick={() => void onStopDanmu()}
                className="flex items-center space-x-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95"
              >
                <Radio className="h-3.5 w-3.5 animate-pulse text-rose-400" />
                <span>{t(locale, "ui.danmu.stop")}</span>
              </button>
            )}

            <button
              onClick={() =>
                void (danmuOverlayVisible ? onHideDanmuOverlay() : onShowDanmuOverlay())
              }
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                danmuOverlayVisible
                  ? "border border-amber-500/25 bg-amber-500/12 text-amber-300 hover:bg-amber-500/20"
                  : "border border-white/8 bg-white/5 text-gray-200 hover:border-white/15 hover:bg-white/10"
              }`}
            >
              <PanelTop className="h-3.5 w-3.5" />
              <span>
                {danmuOverlayVisible
                  ? t(locale, "ui.settings.overlay.hide")
                  : t(locale, "ui.settings.overlay.show")}
              </span>
            </button>

            <button
              onClick={onClearDanmus}
              className="rounded-lg border border-white/5 bg-white/3 p-2 text-gray-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95"
              title={t(locale, "ui.danmu.clear_wall")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          <div data-tauri-drag-region="deep">
            <h2 className="text-sm font-bold leading-none text-white">{title}</h2>
            <p className="mt-0.5 text-[10px] text-gray-500">{description}</p>
          </div>

          {showDefaultActions ? (
            <div data-tauri-drag-region="false" className="no-drag flex shrink-0 space-x-2">
              {showPartitionSync ? (
                <button
                  onClick={() => void onRefreshPartitions()}
                  className="flex items-center rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all duration-200 active:scale-95 hover:border-white/10 hover:bg-white/10"
                >
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  {t(locale, "ui.header.btn.sync_partitions")}
                </button>
              ) : null}

              {showAccountRefresh ? (
                <button
                  onClick={() => void onRefreshAccounts()}
                  className="flex items-center rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all duration-200 active:scale-95 hover:border-white/10 hover:bg-white/10"
                >
                  <Users className="mr-1.5 h-3 w-3" />
                  {t(locale, "ui.header.btn.refresh_accounts")}
                </button>
              ) : null}
            </div>
          ) : (
            <div />
          )}
        </>
      )}
    </header>
  );
}
