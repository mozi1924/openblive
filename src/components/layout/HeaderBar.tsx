import { PanelTop, RefreshCw, Trash2, Users } from "lucide-react";
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
  danmuOverlayVisible: boolean;
  liveOnlineRankPanelOpen: boolean;
  onShowDanmuOverlay: () => Promise<void>;
  onHideDanmuOverlay: () => Promise<void>;
  onToggleLiveOnlineRankPanel: () => void;
  onClearDanmus: () => void;
};

export function HeaderBar({
  activeTab,
  locale,
  headerDragRef,
  onRefreshAccounts,
  onRefreshPartitions,
  danmuCount,
  danmuOverlayVisible,
  liveOnlineRankPanelOpen,
  onShowDanmuOverlay,
  onHideDanmuOverlay,
  onToggleLiveOnlineRankPanel,
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
                  ? t(locale, "ui.overlay.hide")
                  : t(locale, "ui.overlay.show")}
              </span>
            </button>

            <button
              onClick={onToggleLiveOnlineRankPanel}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                liveOnlineRankPanelOpen
                  ? "border border-bili-blue/30 bg-bili-blue/15 text-bili-blue"
                  : "border border-white/8 bg-white/5 text-gray-200 hover:border-white/15 hover:bg-white/10"
              }`}
              title={t(locale, "ui.danmu.online_rank.toggle")}
            >
              <Users className="h-3.5 w-3.5" />
              <span>{t(locale, "ui.danmu.online_rank.panel_title")}</span>
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
