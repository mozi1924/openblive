import {
  Check,
  ChevronDown,
  Compass,
  Copy,
  Link,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
  Server,
  Key,
  ExternalLink,
} from "lucide-react";
import type {
  ActiveTab,
  LinkageStatus,
  LiveProfileState,
  Session,
  StreamEndpoint,
  StreamInfo,
} from "../../types/studio";

type StreamTabProps = {
  child: string;
  children: string[];
  copiedKey: string | null;
  parent: string;
  partitions: Record<string, string[]>;
  rtmp: StreamInfo | null;
  session: Session | null;
  linkageStatus: LinkageStatus | null;
  tagInput: string;
  tags: string[];
  title: string;
  recentAreas: Array<{ parent: string; child: string }>;
  hasUnsavedChanges: boolean;
  hasAttentionStatus: boolean;
  profileState: LiveProfileState;
  sectionStatus: {
    title: { tone: "green" | "yellow" | "red"; label: string; detail: string };
    area: { tone: "green" | "yellow" | "red"; label: string; detail: string };
    tags: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  };
  dirtyStatus: { title: boolean; area: boolean; tags: boolean };
  unsavedItems: string[];
  onSelectTab: (tab: ActiveTab) => void;
  onChangeChild: (value: string) => void;
  onChangeParent: (value: string) => void;
  onChangeTagInput: React.Dispatch<React.SetStateAction<string>>;
  onChangeTitle: React.Dispatch<React.SetStateAction<string>>;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onCopyToClipboard: (text: string, type: string) => Promise<void>;
  onSyncProfile: () => Promise<void>;
  onStartLive: () => Promise<void>;
  onStopLive: () => Promise<void>;
  onApplyRecentArea: (parent: string, child: string) => void;
  onSubmitArea: (event: React.FormEvent) => Promise<void>;
  onSubmitTags: (event: React.FormEvent) => Promise<void>;
  onSubmitTitle: (event: React.FormEvent) => Promise<void>;
};

function SectionBadge({
  label,
  state,
}: {
  label: string;
  state: { tone: "green" | "yellow" | "red"; label: string; detail: string };
}) {
  const toneClass =
    state.tone === "green"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : state.tone === "red"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
        : "border-amber-500/25 bg-amber-500/10 text-amber-300";
  const dotClass =
    state.tone === "green"
      ? "bg-emerald-400"
      : state.tone === "red"
        ? "bg-rose-400"
        : "bg-amber-400";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span>{label}</span>
        <span className="opacity-90">{state.label}</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed opacity-90">{state.detail}</p>
    </div>
  );
}

export function StreamTab({
  child,
  children,
  copiedKey,
  parent,
  partitions,
  rtmp,
  session,
  linkageStatus,
  tagInput,
  tags,
  title,
  recentAreas,
  hasUnsavedChanges,
  hasAttentionStatus,
  profileState,
  sectionStatus,
  dirtyStatus,
  unsavedItems,
  onSelectTab,
  onChangeChild,
  onChangeParent,
  onChangeTagInput,
  onChangeTitle,
  onAddTag,
  onRemoveTag,
  onCopyToClipboard,
  onSyncProfile,
  onStartLive,
  onStopLive,
  onApplyRecentArea,
  onSubmitArea,
  onSubmitTags,
  onSubmitTitle,
}: StreamTabProps) {
  const streamEndpoints = buildStreamEndpoints(rtmp);
  const primaryEndpoint = streamEndpoints[0];
  const actionButtonClass =
    "flex h-11 items-center justify-center rounded-xl text-xs font-bold transition-all duration-150";
  const liveStatus = session?.live_status ?? (session?.is_live ? 1 : 0);
  const isLive = liveStatus === 1;
  const isRoundPlay = liveStatus === 2;
  const statusLabel = isLive ? "直播中" : isRoundPlay ? "轮播中" : "未开播";
  
  const statusHint = isLive
    ? "推流已建立，标题、分区和标签调整会直接同步到当前直播间。"
    : isRoundPlay
      ? "当前仍在轮播，正式开播后会接管轮播状态并切换到直播中。"
      : "开始直播后会拉取推流参数，并按当前设置执行本地联动。";

  const statusColorPill = isLive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : isRoundPlay
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-gray-500/30 bg-white/5 text-gray-400";

  // Reactor ring color/animations
  const reactorRingClass = isLive
    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-pulse-glow"
    : isRoundPlay
      ? "border-amber-500/30 bg-amber-500/5 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
      : "border-white/5 bg-white/2 text-gray-500";


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
      ? "命令联动"
      : "未配置联动";

  const linkageStateText = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? "已连接"
      : "连接断开"
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured
        ? "已部署"
        : commandStatus?.stop_configured
          ? "仅配置停播命令"
          : "未配置命令"
      : "待配置";

  const linkageStateClass = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
      : "text-rose-400 border-rose-500/20 bg-rose-500/10"
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured || commandStatus?.stop_configured
        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
        : "text-amber-400 border-amber-500/20 bg-amber-500/10"
      : "text-gray-400 border-white/8 bg-white/4";
  const linkageHint = activeLinkageMode === "obs_ws"
    ? "通过 WebSocket 与 OBS Studio 保持联动。"
    : activeLinkageMode === "command"
      ? "按配置的本地命令执行开播和停播动作。"
      : "当前仅控制 B 站直播间信息，不触发本地设备。";
  const titleAuditDetail = profileState.title.message && sectionStatus.title.tone !== "green"
    ? `上次提交：${profileState.title.submitted || "未记录"}`
    : "";

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Parameters Setup */}
      <div className="space-y-6 lg:col-span-7">
        <div className="glass-panel rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Compass className="h-4.5 w-4.5 text-bili-blue" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                ROOM MANAGEMENT
              </span>
            </div>
            
            <button
              onClick={() => void onSyncProfile()}
              className={`${actionButtonClass} shrink-0 border border-white/8 bg-white/4 px-4 text-gray-300 active:scale-95 hover:border-bili-blue/30 hover:bg-white/8 hover:text-white`}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              同步B站设置
            </button>
          </div>

          <div className="space-y-6">
            {/* Title setting */}
            <form onSubmit={(event) => void onSubmitTitle(event)} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  直播间标题
                </label>
                <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px]">
                  <span className={`h-2 w-2 rounded-full ${
                    sectionStatus.title.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.title.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-200">{sectionStatus.title.label}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => onChangeTitle(event.target.value)}
                  placeholder="给您的直播间起一个炫酷的标题吧"
                  className="flex-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/5 focus:outline-none hover:border-white/15"
                />
                <button
                  type="submit"
                  className={`${actionButtonClass} border border-bili-blue/20 bg-bili-blue/10 px-5 text-bili-blue active:scale-95 hover:bg-bili-blue hover:text-white`}
                >
                  更新
                </button>
              </div>
              {titleAuditDetail && (
                <p className="text-[10px] leading-relaxed text-amber-200/90">
                  {titleAuditDetail} · {profileState.title.message}
                </p>
              )}
            </form>

            <div className="h-px bg-white/5" />

            {/* Partition Area setting */}
            <form onSubmit={(event) => void onSubmitArea(event)} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  开播分区设置
                </label>
                <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px]">
                  <span className={`h-2 w-2 rounded-full ${
                    sectionStatus.area.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.area.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-200">{sectionStatus.area.label}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">主分区</span>
                  <div className="relative">
                    <select
                      value={parent}
                      onChange={(event) => onChangeParent(event.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-white/8 bg-gradient-to-br from-[#0b111c] to-[#090b0f] px-3.5 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
                    >
                      {Object.keys(partitions).map((partition) => (
                        <option key={partition} value={partition} className="bg-[#090b0f]">
                          {partition}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">子分区</span>
                  <div className="relative">
                    <select
                      value={child}
                      onChange={(event) => onChangeChild(event.target.value)}
                      className="h-11 w-full appearance-none rounded-xl border border-white/8 bg-gradient-to-br from-[#0b111c] to-[#090b0f] px-3.5 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
                    >
                      {children.map((partition) => (
                        <option key={partition} value={partition} className="bg-[#090b0f]">
                          {partition}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex min-h-11 flex-1 flex-wrap items-center gap-1.5">
                  {recentAreas.map((area) => {
                    const key = `${area.parent}/${area.child}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onApplyRecentArea(area.parent, area.child)}
                        className="rounded-lg border border-white/10 bg-white/4 px-2.5 py-1 text-[10px] text-gray-300 transition-all hover:border-bili-blue/30 hover:bg-bili-blue/10 hover:text-bili-blue"
                        title={`${area.parent} / ${area.child}`}
                      >
                        {area.parent} / {area.child}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  className={`${actionButtonClass} border border-bili-blue/20 bg-bili-blue/10 px-6 text-bili-blue active:scale-95 hover:bg-bili-blue hover:text-white`}
                >
                  保存分区
                </button>
              </div>
            </form>

            <div className="h-px bg-white/5" />

            {/* Tags setting */}
            <form onSubmit={(event) => void onSubmitTags(event)} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  直播间标签
                </label>
                <div className="flex items-center gap-2 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 text-[10px]">
                  <span className={`h-2 w-2 rounded-full ${
                    sectionStatus.tags.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.tags.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-200">{sectionStatus.tags.label}</span>
                </div>
              </div>
              
              {/* Display Current Tags */}
              <div className="min-h-12 rounded-xl border border-white/5 bg-white/2.5 p-2.5">
                {tags.length === 0 ? (
                  <p className="px-1.5 py-1 text-xs text-gray-500">
                    暂无标签，可在下方输入添加
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-lg border border-bili-blue/20 bg-bili-blue/8 px-2.5 py-1 text-xs font-medium text-bili-blue"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => onRemoveTag(tag)}
                          className="ml-1.5 rounded p-0.5 text-bili-blue/60 transition-colors hover:bg-bili-blue/25 hover:text-bili-blue"
                          title="删除"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag inputs */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(event) => onChangeTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAddTag();
                    }
                  }}
                  placeholder="标签名，支持逗号批量输入"
                  className="flex-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/5 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onAddTag}
                  className={`${actionButtonClass} border border-white/8 bg-white/4 px-4 font-semibold text-gray-300 hover:bg-white/8 hover:text-white`}
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  className={`${actionButtonClass} border border-bili-blue/20 bg-bili-blue/10 px-5 text-bili-blue active:scale-95 hover:bg-bili-blue hover:text-white`}
                >
                  保存标签
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RTMP Server info */}
        {rtmp && (
          <div className="glass-panel overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#0a1815] to-[#070b0e] p-6 shadow-lg shadow-emerald-950/20">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Link className="h-4 w-4 text-emerald-400" />
                <span className="text-[10px] font-extrabold tracking-widest text-emerald-400 uppercase">
                  RTMP STREAM ENDPOINTS
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                推流密钥已就绪
              </span>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/5 bg-[#05090a] p-4 space-y-3 font-mono text-[11px]">
                
                {/* Server URL field */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 px-3.5 py-2.5">
                  <div className="flex items-center space-x-2 truncate">
                    <Server className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-400 shrink-0">推流地址:</span>
                    <span className="truncate text-gray-300 select-text">{primaryEndpoint?.addr || "未获取"}</span>
                  </div>
                  <button
                    onClick={() => void onCopyToClipboard(primaryEndpoint?.addr || "", "server")}
                    disabled={!primaryEndpoint?.addr}
                    className="flex items-center rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-bold text-gray-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                  >
                    {copiedKey === "server" ? (
                      <Check className="mr-1 h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    复制
                  </button>
                </div>

                {/* Key field */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/2 px-3.5 py-2.5">
                  <div className="flex items-center space-x-2 truncate">
                    <Key className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-400 shrink-0">串流密钥:</span>
                    <span className="truncate text-gray-300 select-text">
                      {primaryEndpoint?.stream_key || primaryEndpoint?.code ? "••••••••••••••••••••••••" : "未获取"}
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      void onCopyToClipboard(
                        primaryEndpoint?.stream_key || primaryEndpoint?.code || "",
                        "key",
                      )
                    }
                    disabled={!primaryEndpoint?.code && !primaryEndpoint?.stream_key}
                    className="flex items-center rounded-lg bg-white/5 px-2.5 py-1 text-[10px] font-bold text-gray-300 transition-all hover:bg-white/10 hover:text-white active:scale-95"
                  >
                    {copiedKey === "key" ? (
                      <Check className="mr-1 h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    复制
                  </button>
                </div>

              </div>

              {primaryEndpoint && (
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-1 text-[10px] text-gray-500 font-mono">
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>协议:</span>
                    <span className="text-gray-300 uppercase">{(primaryEndpoint.protocol || "rtmp")}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>线路商:</span>
                    <span className="text-gray-300">{primaryEndpoint.provider || "Bilibili"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>分流规则:</span>
                    <span className="text-gray-300">{primaryEndpoint.schedule || "默认"}</span>
                  </div>
                  <div className="flex justify-between border-b border-white/5 pb-1">
                    <span>Live Key:</span>
                    <span className="text-gray-300 truncate max-w-[80px]">{rtmp.live_key || "-"}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right Column: Live cockpit control */}
      <div className="lg:col-span-5">
        <div className="glass-panel flex h-full flex-col justify-between space-y-6 rounded-3xl p-6 text-center">
          <div>
            <div className="mb-6 flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                LIVE CONTROLLER
              </span>
              <span
                className={`rounded-full border px-2.5 py-0.5 text-[9px] font-bold tracking-wide ${statusColorPill}`}
              >
                {statusLabel}
              </span>
            </div>

            {/* Reactor Core Indicator */}
            <div className="flex flex-col items-center py-6">
              <div
                className={`flex h-28 w-28 items-center justify-center rounded-full border-2 transition-all duration-500 ${reactorRingClass}`}
              >
                <div className={`flex h-22 w-22 items-center justify-center rounded-full border border-white/5 bg-[#0a0d14] ${isLive ? "shadow-[inset_0_0_20px_rgba(16,185,129,0.1)]" : ""}`}>
                  <Radio className={`h-11 w-11 ${isLive ? "text-emerald-400 animate-pulse" : "text-gray-600"}`} />
                </div>
              </div>
              <h4 className="mt-5 text-sm font-bold text-white tracking-wide">
                B站开播状态: {statusLabel}
              </h4>
              <p className="mt-2 max-w-xs text-[11px] leading-relaxed text-gray-500">
                {statusHint}
              </p>
              {(hasUnsavedChanges || hasAttentionStatus) && (
                <div className="mt-3 w-full max-w-sm rounded-2xl border border-white/8 bg-white/3 p-3 text-left">
                  {hasUnsavedChanges ? (
                    <div className="mb-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[10px] leading-relaxed text-amber-300">
                      <p>检测到未保存信息：{unsavedItems.join("、")}。请先保存后再开播。</p>
                      <p className="mt-1 text-amber-200/90">
                        标题：{dirtyStatus.title ? "已修改" : "未修改"} · 分区：{dirtyStatus.area ? "已修改" : "未修改"} · 标签：{dirtyStatus.tags ? "已修改" : "未修改"}
                      </p>
                    </div>
                  ) : (
                    <p className="mb-3 text-[10px] leading-relaxed text-gray-400">
                      当前没有未保存内容，但部分项目仍在等待审核、确认或需要处理。
                    </p>
                  )}
                  <div className="space-y-2">
                    <SectionBadge label="标题" state={sectionStatus.title} />
                    <SectionBadge label="分区" state={sectionStatus.area} />
                    <SectionBadge label="标签" state={sectionStatus.tags} />
                  </div>
                </div>
              )}
            </div>

            {/* Linkage status dashboards */}
            <div className="space-y-3.5 rounded-2xl border border-white/5 bg-[#05070a] p-4 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase">
                    EQUIPMENT LINKAGE
                  </span>
                  <p className="mt-1 text-[11px] text-gray-500">
                    {linkageHint}
                  </p>
                </div>
              </div>

              {!hasActiveLinkage ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-white/2 p-4">
                  <p className="text-sm font-bold text-gray-200">未配置联动</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
                    当前不会触发任何本地串流或设备动作。
                  </p>
                  <button
                    onClick={() => onSelectTab("settings")}
                    className="mt-3 inline-flex items-center text-[11px] font-bold text-bili-blue hover:underline"
                  >
                    前往设置配置联动
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="rounded-xl border border-white/5 bg-white/2 p-3 font-mono text-[11px] transition-all hover:bg-white/4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-gray-300">{linkageTitle}</span>
                      <p className="mt-1 text-[10px] font-sans text-gray-500">
                        {activeLinkageMode === "obs_ws" ? "当前开停播将同步到 OBS。" : "当前开停播将执行本地命令。"}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-extrabold ${linkageStateClass}`}>
                      {linkageStateText}
                    </span>
                  </div>

                  {activeLinkageMode === "obs_ws" && (
                    <div className="space-y-1">
                      <p className="truncate text-[10px] text-gray-500">
                        地址: {obsStatus?.url || "ws://127.0.0.1:4455"}
                      </p>
                      {obsStatus?.last_error && (
                        <p className="truncate text-[9px] text-rose-400 leading-tight">
                          ERR: {obsStatus.last_error}
                        </p>
                      )}
                    </div>
                  )}

                  {activeLinkageMode === "command" && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${
                          commandStatus?.start_configured
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-white/8 bg-white/4 text-gray-500"
                        }`}>
                          开播命令{commandStatus?.start_configured ? "已配置" : "未配置"}
                        </span>
                        <span className={`rounded-md border px-2 py-1 text-[9px] font-bold ${
                          commandStatus?.stop_configured
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-white/8 bg-white/4 text-gray-500"
                        }`}>
                          停播命令{commandStatus?.stop_configured ? "已配置" : "未配置"}
                        </span>
                      </div>

                      {commandStatus?.template_preview && (
                        <p className="truncate rounded bg-black/40 px-2 py-1 text-[9px] text-gray-500 select-text">
                          CMD: {commandStatus.template_preview}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={() => void onStartLive()}
              disabled={isLive}
              className={`flex h-13 w-full items-center justify-center rounded-2xl text-xs font-bold transition-all duration-200 ${
                isLive
                  ? "cursor-not-allowed border border-white/5 bg-white/3 text-gray-600"
                  : "bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-lg shadow-emerald-500/20 active:scale-98 hover:opacity-95 hover:shadow-emerald-500/30"
              }`}
            >
              <Radio className="mr-2 h-4 w-4 shrink-0" />
              开启直播并同步联动
            </button>
            
            <button
              onClick={() => void onStopLive()}
              disabled={!isLive}
              className={`flex h-13 w-full items-center justify-center rounded-2xl border text-xs font-bold transition-all duration-200 ${
                !isLive
                  ? "cursor-not-allowed border-white/5 bg-transparent text-gray-600"
                  : "border-rose-500/20 bg-rose-500/8 text-rose-400 active:scale-98 hover:bg-rose-500/15"
              }`}
            >
              <Trash2 className="mr-2 h-4 w-4 shrink-0" />
              停止直播 / 联动设备
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildStreamEndpoints(rtmp: StreamInfo | null): StreamEndpoint[] {
  if (!rtmp) {
    return [];
  }
  if (rtmp.endpoints && rtmp.endpoints.length > 0) {
    return rtmp.endpoints;
  }

  if (rtmp.rtmp1?.addr || rtmp.rtmp1?.code) {
    return [
      {
        protocol: "rtmp",
        addr: rtmp.rtmp1?.addr || "",
        code: rtmp.rtmp1?.code || "",
        full_url: `${rtmp.rtmp1?.addr || ""}${rtmp.rtmp1?.code || ""}`,
        provider: "",
        new_link: "",
        stream_name: "",
        stream_key: "",
        schedule: "rtmp",
        pflag: "",
        query: {},
      },
    ];
  }

  return [];
}
