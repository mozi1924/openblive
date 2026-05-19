import { RefreshCw, Users } from "lucide-react";
import type { ActiveTab } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type HeaderBarProps = {
  activeTab: ActiveTab;
  locale: LocaleSetting;
  headerDragRef: React.RefObject<HTMLElement | null>;
  onRefreshAccounts: () => Promise<void>;
  onRefreshPartitions: () => Promise<void>;
};

export function HeaderBar({
  activeTab,
  locale,
  headerDragRef,
  onRefreshAccounts,
  onRefreshPartitions,
}: HeaderBarProps) {
  const title = t(locale, `ui.header.title.${activeTab}`);
  const description = t(locale, `ui.header.desc.${activeTab}`);

  return (
    <header
      ref={headerDragRef}
      data-tauri-drag-region="deep"
      className="drag-region flex h-14 shrink-0 items-center justify-between border-b border-[#131b2b] bg-[#0a0e17] px-8"
    >
      <div data-tauri-drag-region="deep">
        <h2 className="text-sm font-bold leading-none text-white">{title}</h2>
        <p className="mt-1 text-[11px] text-gray-500">{description}</p>
      </div>

      <div
        data-tauri-drag-region="false"
        className="no-drag flex shrink-0 space-x-2"
      >
        <button
          onClick={() => void onRefreshPartitions()}
          className="flex items-center rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all duration-200 active:scale-95 hover:border-white/10 hover:bg-white/10"
        >
          <RefreshCw className="mr-1.5 h-3 w-3" />
          {t(locale, "ui.header.btn.sync_partitions")}
        </button>
        <button
          onClick={() => void onRefreshAccounts()}
          className="flex items-center rounded-lg border border-white/5 bg-white/5 px-3 py-1.5 text-xs text-gray-300 transition-all duration-200 active:scale-95 hover:border-white/10 hover:bg-white/10"
        >
          <Users className="mr-1.5 h-3 w-3" />
          {t(locale, "ui.header.btn.refresh_accounts")}
        </button>
      </div>
    </header>
  );
}
