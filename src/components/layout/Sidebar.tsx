import {
  ChartNoAxesCombined,
  Compass,
  ExternalLink,
  MessageSquare,
  Settings,
  Terminal,
  User as UserIcon,
} from "lucide-react";
import { AppLogo } from "../branding/AppLogo";
import type { ActiveTab, User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";

type SidebarProps = {
  activeTab: ActiveTab;
  locale: LocaleSetting;
  danmuListening: boolean;
  roomId?: string;
  roomBaseHost?: string;
  sessionLive: boolean;
  showLogs: boolean;
  sidebarDragRef: React.RefObject<HTMLDivElement | null>;
  currentUser?: User | null;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleLogs: () => void;
};

const tabs: Array<{
  key: ActiveTab;
  labelKey: string;
  icon: typeof UserIcon;
}> = [
  { key: "account", labelKey: "ui.sidebar.tab.account", icon: UserIcon },
  { key: "dashboard", labelKey: "ui.sidebar.tab.dashboard", icon: ChartNoAxesCombined },
  { key: "stream", labelKey: "ui.sidebar.tab.stream", icon: Compass },
  { key: "danmu", labelKey: "ui.sidebar.tab.danmu", icon: MessageSquare },
  { key: "settings", labelKey: "ui.sidebar.tab.settings", icon: Settings },
];

export function Sidebar({
  activeTab,
  locale,
  danmuListening,
  roomId,
  roomBaseHost,
  sessionLive,
  showLogs,
  sidebarDragRef,
  currentUser,
  onSelectTab,
  onToggleLogs,
}: SidebarProps) {
  const liveRoomUrl = (() => {
    if (!roomId) {
      return "";
    }
    const raw = (roomBaseHost || "live.bilibili.com").trim();
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      return `${url.origin}/${roomId}`;
    } catch {
      return `https://live.bilibili.com/${roomId}`;
    }
  })();

  return (
    <aside className="z-10 flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#070a0f]/90 backdrop-blur-xl">
      <div
        ref={sidebarDragRef}
        data-tauri-drag-region
        className="drag-region h-8 w-full shrink-0"
      />

      <div className="flex shrink-0 items-center space-x-3 px-6 py-4">
        <AppLogo className="shrink-0" size={38} />
        <div>
          <h1 className="text-sm font-extrabold leading-tight tracking-wider text-white uppercase">
            OpenBlive
          </h1>
          <p className="text-[9px] font-bold tracking-widest text-gray-500">
            STUDIO CLIENT
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1.5 px-4 py-6">
        {tabs.map(({ icon: Icon, key, labelKey }) => (
          <button
            key={key}
            onClick={() => onSelectTab(key)}
            className={`group flex w-full items-center rounded-xl border-l-4 border-y-0 border-r-0 px-4 py-3.5 text-left transition-all duration-200 no-drag ${
              activeTab === key
                ? "border-l-bili-blue bg-bili-blue/10 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(0,174,236,0.14)]"
                : "border-l-transparent text-gray-400 hover:bg-white/4 hover:text-white"
            }`}
          >
            <Icon
              className={`mr-3 h-4.5 w-4.5 transition-colors ${
                activeTab === key
                  ? "text-bili-blue"
                  : "text-gray-500 group-hover:text-gray-300"
              }`}
            />
            <span className="text-xs">{t(locale, labelKey)}</span>
            {key === "danmu" && danmuListening && (
              <span className="ml-auto flex h-2 w-2">
                <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/5 bg-[#05070a]/60 p-4">
        {currentUser && (
          <div className="mb-3 flex items-center space-x-3 rounded-2xl border border-white/5 bg-white/5 p-2.5">
            <img
              src={currentUser.face}
              alt={currentUser.uname}
              className="h-8.5 w-8.5 rounded-xl border border-bili-blue/20 object-cover shadow-sm"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <span className="truncate text-xs font-bold text-gray-200">
                  {currentUser.uname}
                </span>
                <span className="rounded bg-bili-blue/15 px-1 py-0.2 text-[8px] font-bold text-bili-blue">
                  L{currentUser.level}
                </span>
              </div>
              <p className="truncate text-[9px] text-gray-500">UID: {currentUser.uid}</p>
            </div>
          </div>
        )}

        <div className="flex items-center space-x-3 rounded-2xl border border-white/5 bg-white/5 p-3">
          <div className="relative flex">
            <span
              className={`h-3 w-3 rounded-full ${
                sessionLive ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" : "bg-gray-600"
              }`}
            />
            {sessionLive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">
                {sessionLive ? t(locale, "ui.sidebar.live.on") : t(locale, "ui.sidebar.live.off")}
              </span>
              {roomId && (
                <a
                  href={liveRoomUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="no-drag text-gray-500 transition-colors hover:text-bili-blue"
                  title="Open room in browser"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-gray-500 font-mono">
              {roomId ? `Room: ${roomId}` : t(locale, "ui.sidebar.room.disconnected")}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleLogs}
          className="no-drag mt-3 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 py-2.5 text-xs text-gray-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10"
        >
          <Terminal className="mr-2 h-3.5 w-3.5 text-gray-400" />
          {showLogs ? t(locale, "ui.sidebar.logs.toggle.hide") : t(locale, "ui.sidebar.logs.toggle.show")}
        </button>
      </div>
    </aside>
  );
}
