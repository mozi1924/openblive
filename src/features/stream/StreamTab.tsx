import {
  Check,
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
  onSubmitArea: (event: React.FormEvent) => Promise<void>;
  onSubmitTags: (event: React.FormEvent) => Promise<void>;
  onSubmitTitle: (event: React.FormEvent) => Promise<void>;
};

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
  onSubmitArea,
  onSubmitTags,
  onSubmitTitle,
}: StreamTabProps) {
  const streamEndpoints = buildStreamEndpoints(rtmp);
  const primaryEndpoint = streamEndpoints[0];
  const liveStatus = session?.live_status ?? (session?.is_live ? 1 : 0);
  const isLive = liveStatus === 1;
  const isRoundPlay = liveStatus === 2;
  const statusLabel = isLive ? "直播中" : isRoundPlay ? "轮播中" : "未开播";
  
  const statusHint = isLive
    ? "当前正在向哔哩哔哩直播服务器发送信号。修改标题和分区在直播中也会立即生效。"
    : isRoundPlay
      ? "直播间当前处于轮播状态。开始直播后将接管轮播切换为正式直播中。"
      : "开始直播后，程序将自动向 B 站请求推流参数并根据设置自动开启联动设备。";

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

  const obsStateText =
    linkageStatus?.mode === "obs_ws"
      ? obsStatus?.connected
        ? "已连接"
        : "连接断开"
      : "未启用";

  const obsStateClass =
    linkageStatus?.mode === "obs_ws"
      ? obsStatus?.connected
        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
        : "text-rose-400 border-rose-500/20 bg-rose-500/10 animate-pulse"
      : "text-gray-500 border-white/5 bg-white/2";

  const commandStateText =
    linkageStatus?.mode === "command"
      ? commandStatus?.start_configured
        ? "已部署"
        : "未配置命令"
      : commandStatus?.start_configured
        ? "就绪"
        : "未配置";

  const commandStateClass =
    linkageStatus?.mode === "command"
      ? commandStatus?.start_configured
        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
        : "text-amber-400 border-amber-500/20 bg-amber-500/10"
      : "text-gray-500 border-white/5 bg-white/2";

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-12">
      {/* Parameters Setup */}
      <div className="space-y-6 lg:col-span-7">
        <div className="glass-panel rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Compass className="h-4.5 w-4.5 text-bili-blue" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                ROOM MANAGEMENT
              </span>
            </div>
            
            <button
              onClick={() => void onSyncProfile()}
              className="flex items-center rounded-xl border border-white/8 bg-white/4 px-3.5 py-2 text-xs font-bold text-gray-300 transition-all duration-150 active:scale-95 hover:border-bili-blue/30 hover:bg-white/8 hover:text-white"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              同步B站设置
            </button>
          </div>

          <div className="space-y-6">
            {/* Title setting */}
            <form onSubmit={(event) => void onSubmitTitle(event)} className="space-y-2">
              <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                直播间标题
              </label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => onChangeTitle(event.target.value)}
                  placeholder="给您的直播间起一个炫酷的标题吧"
                  className="flex-1 rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/5 focus:outline-none hover:border-white/15"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue hover:text-white"
                >
                  更新
                </button>
              </div>
            </form>

            <div className="h-px bg-white/5" />

            {/* Partition Area setting */}
            <form onSubmit={(event) => void onSubmitArea(event)} className="space-y-3">
              <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                开播分区设置
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">主分区</span>
                  <select
                    value={parent}
                    onChange={(event) => onChangeParent(event.target.value)}
                    className="rounded-xl border border-white/8 bg-[#090b0f] px-3 py-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:outline-none"
                  >
                    {Object.keys(partitions).map((partition) => (
                      <option key={partition} value={partition} className="bg-[#090b0f]">
                        {partition}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">子分区</span>
                  <select
                    value={child}
                    onChange={(event) => onChangeChild(event.target.value)}
                    className="rounded-xl border border-white/8 bg-[#090b0f] px-3 py-3 text-xs text-white transition-all focus:border-bili-blue/40 focus:outline-none"
                  >
                    {children.map((partition) => (
                      <option key={partition} value={partition} className="bg-[#090b0f]">
                        {partition}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-6 py-2.5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue hover:text-white"
                >
                  保存分区
                </button>
              </div>
            </form>

            <div className="h-px bg-white/5" />

            {/* Tags setting */}
            <form onSubmit={(event) => void onSubmitTags(event)} className="space-y-3">
              <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                直播间标签
              </label>
              
              {/* Display Current Tags */}
              <div className="min-h-12 rounded-xl border border-white/5 bg-white/2 p-2.5">
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
              <div className="flex space-x-2">
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
                  className="rounded-xl border border-white/8 bg-white/4 px-4 text-xs font-semibold text-gray-300 transition-all duration-150 hover:bg-white/8 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue hover:text-white"
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
            </div>

            {/* Linkage status dashboards */}
            <div className="space-y-3.5 rounded-2xl border border-white/5 bg-[#05070a] p-4 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase">
                  EQUIPMENT LINKAGE
                </span>
                
                <button
                  onClick={() => onSelectTab("settings")}
                  className="flex items-center text-[10px] font-bold text-bili-blue hover:underline"
                >
                  配置联动
                  <ExternalLink className="ml-1 h-3 w-3" />
                </button>
              </div>

              {/* OBS WS Status */}
              <div className="rounded-xl border border-white/5 bg-white/2 p-3 font-mono text-[11px] transition-all hover:bg-white/4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300">OBS WebSocket</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold ${obsStateClass}`}>
                    {obsStateText}
                  </span>
                </div>
                {linkageStatus?.mode === "obs_ws" && (
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
              </div>

              {/* Command Link */}
              <div className="rounded-xl border border-white/5 bg-white/2 p-3 font-mono text-[11px] transition-all hover:bg-white/4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300">命令联动</span>
                  <span className={`rounded-md border px-2 py-0.5 text-[9px] font-extrabold ${commandStateClass}`}>
                    {commandStateText}
                  </span>
                </div>
                {commandStatus?.template_preview && (
                  <p className="truncate rounded bg-black/40 px-2 py-1 text-[9px] text-gray-500 select-text">
                    CMD: {commandStatus.template_preview}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={() => void onStartLive()}
              disabled={isLive}
              className={`flex w-full items-center justify-center rounded-2xl py-4 text-xs font-bold transition-all duration-200 ${
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
              className={`flex w-full items-center justify-center rounded-2xl border py-4 text-xs font-bold transition-all duration-200 ${
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

