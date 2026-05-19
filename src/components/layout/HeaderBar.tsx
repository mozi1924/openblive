import { RefreshCw, Users } from "lucide-react";
import type { ActiveTab } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { resolveLocale, t } from "../../utils/i18n";

type HeaderBarProps = {
  activeTab: ActiveTab;
  locale: LocaleSetting;
  headerDragRef: React.RefObject<HTMLElement | null>;
  onRefreshAccounts: () => Promise<void>;
  onRefreshPartitions: () => Promise<void>;
};

const headerMeta: Record<ActiveTab, { title: string; description: string }> = {
  account: {
    title: "账户管理中心",
    description: "扫码快捷登录，轻松切换及维护多个B站直播号",
  },
  stream: {
    title: "直播控制中心",
    description: "修改直播间分区、标题，一键开停播与获取推流信息",
  },
  danmu: {
    title: "弹幕互动终端",
    description: "弹幕、礼物、舰长等互动的全实时流及快速发言",
  },
  settings: {
    title: "系统设置中心",
    description: "托盘、关闭行为、OBS 联动和开播命令的统一配置",
  },
};

export function HeaderBar({
  activeTab,
  locale,
  headerDragRef,
  onRefreshAccounts,
  onRefreshPartitions,
}: HeaderBarProps) {
  const meta = headerMeta[activeTab];
  const effectiveLocale = resolveLocale(locale);
  const description =
    effectiveLocale === "en-US"
      ? {
          account: "QR login, quickly switch and manage Bilibili accounts.",
          stream: "Edit room title/area, start-stop live, and fetch stream endpoint.",
          danmu: "Real-time danmu, gifts, and guard interactions with quick send.",
          settings: "Unified config for tray behavior, OBS linkage, and commands.",
        }[activeTab]
      : meta.description;
  const title =
    effectiveLocale === "en-US"
      ? {
          account: "Account Center",
          stream: "Stream Control",
          danmu: "Danmu Console",
          settings: "System Settings",
        }[activeTab]
      : meta.title;

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
