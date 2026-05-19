import { Compass, ExternalLink, MessageSquare, Radio, Terminal, User as UserIcon } from "lucide-react";
import type { ActiveTab } from "../../types/studio";

type SidebarProps = {
  activeTab: ActiveTab;
  danmuListening: boolean;
  roomId?: string;
  sessionLive: boolean;
  showLogs: boolean;
  sidebarDragRef: React.RefObject<HTMLDivElement | null>;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleLogs: () => void;
};

const tabs: Array<{
  key: ActiveTab;
  label: string;
  icon: typeof UserIcon;
}> = [
  { key: "account", label: "账户管理", icon: UserIcon },
  { key: "stream", label: "直播控制", icon: Compass },
  { key: "danmu", label: "直播互动", icon: MessageSquare },
];

export function Sidebar({
  activeTab,
  danmuListening,
  roomId,
  sessionLive,
  showLogs,
  sidebarDragRef,
  onSelectTab,
  onToggleLogs,
}: SidebarProps) {
  return (
    <aside className="z-10 flex w-64 shrink-0 flex-col border-r border-[#1a2336] bg-[#0d121c]/90">
      <div
        ref={sidebarDragRef}
        data-tauri-drag-region
        className="drag-region h-8 w-full shrink-0"
      />

      <div className="flex shrink-0 items-center space-x-3 px-6 py-4">
        <div className="glow-blue flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-bili-blue to-bili-pink shadow-lg">
          <Radio className="h-4 w-4 animate-pulse text-white" />
        </div>
        <div>
          <h1 className="text-sm font-bold leading-tight tracking-wider text-white uppercase">
            OpenBlive
          </h1>
          <p className="text-[10px] font-semibold tracking-widest text-gray-500">
            STUDIO PANEL
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4 py-6">
        {tabs.map(({ icon: Icon, key, label }) => (
          <button
            key={key}
            onClick={() => onSelectTab(key)}
            className={`group flex w-full items-center rounded-xl border-l-4 px-4 py-3 text-left transition-all duration-200 no-drag ${
              activeTab === key
                ? "border-bili-blue bg-gradient-to-r from-bili-blue/10 to-transparent font-medium text-white"
                : "border-transparent text-gray-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon
              className={`mr-3 h-5 w-5 transition-colors ${
                activeTab === key
                  ? "text-bili-blue"
                  : "text-gray-500 group-hover:text-gray-300"
              }`}
            />
            <span className="text-sm">{label}</span>
            {key === "danmu" && danmuListening && (
              <span className="ml-auto h-2 w-2 animate-ping rounded-full bg-emerald-500" />
            )}
          </button>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#1a2336] bg-[#090d16]/60 p-4">
        <div className="flex items-center space-x-3 rounded-2xl border border-white/5 bg-white/5 p-3">
          <div className="relative flex">
            <span
              className={`h-3.5 w-3.5 rounded-full ${
                sessionLive ? "bg-emerald-500" : "bg-gray-600"
              }`}
            />
            {sessionLive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-300 uppercase">
                {sessionLive ? "直播中" : "未开播"}
              </span>
              {roomId && (
                <a
                  href={`https://live.bilibili.com/${roomId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="no-drag text-gray-500 transition-colors hover:text-bili-blue"
                  title="前往网页直播间"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-gray-500">
              {roomId ? `房间号: ${roomId}` : "未连接直播间"}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleLogs}
          className="no-drag mt-3 flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-gray-300 transition-all duration-200 hover:border-white/20 hover:bg-white/10"
        >
          <Terminal className="mr-2 h-3.5 w-3.5 text-gray-400" />
          运行日志 {showLogs ? "折叠" : "展开"}
        </button>
      </div>
    </aside>
  );
}
