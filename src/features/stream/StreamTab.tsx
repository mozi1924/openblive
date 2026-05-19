import {
  Check,
  Compass,
  Copy,
  Link,
  Plus,
  Radio,
  RefreshCw,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import type {
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
    ? "当前正在向哔哩哔哩直播服务器发送信号。修改标题和分区在直播中也会生效。"
    : isRoundPlay
      ? "直播间当前处于轮播状态。可直接开始正式直播，开播后会切换为直播中。"
      : "开始直播后将从 B 站请求专属推流信息。";
  const statusPillClass = isLive
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
    : isRoundPlay
      ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
      : "border-gray-500/30 bg-gray-500/15 text-gray-300";
  const statusRingClass = isLive
    ? "animate-pulse border-emerald-500/20 bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10"
    : isRoundPlay
      ? "border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-lg shadow-amber-500/10"
      : "border-gray-500/20 bg-gray-500/10 text-gray-500";
  const linkageModeLabel =
    linkageStatus?.mode === "obs_ws"
      ? "OBS WebSocket 联动"
      : linkageStatus?.mode === "command"
        ? "命令联动"
        : "不联动";
  const obsStatus = linkageStatus?.obs_ws;
  const commandStatus = linkageStatus?.command;
  const obsStateText =
    linkageStatus?.mode === "obs_ws"
      ? obsStatus?.connected
        ? "已连接"
        : "未连接"
      : "未启用";
  const obsStateClass =
    linkageStatus?.mode === "obs_ws"
      ? obsStatus?.connected
        ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
        : "text-rose-300 border-rose-500/30 bg-rose-500/10"
      : "text-gray-300 border-gray-500/30 bg-gray-500/10";
  const commandStateText =
    linkageStatus?.mode === "command"
      ? commandStatus?.start_configured
        ? "可用"
        : "未配置开播命令"
      : commandStatus?.start_configured
        ? "已配置(未启用)"
        : "未配置";
  const commandStateClass =
    linkageStatus?.mode === "command"
      ? commandStatus?.start_configured
        ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10"
        : "text-amber-300 border-amber-500/30 bg-amber-500/10"
      : "text-gray-300 border-gray-500/30 bg-gray-500/10";

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-7">
        <div className="glass-panel rounded-3xl p-6">
          <h3 className="mb-6 flex items-center text-xs font-bold tracking-wider text-gray-400 uppercase">
            <Compass className="mr-2 h-4 w-4 text-bili-blue" />
            直播参数设置
          </h3>

          <div className="mb-4 flex justify-end">
            <button
              onClick={() => void onSyncProfile()}
              className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-semibold text-gray-300 transition-all duration-150 active:scale-95 hover:border-bili-blue/25 hover:text-white"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              同步直播间信息
            </button>
          </div>

          <div className="space-y-6">
            <form onSubmit={(event) => void onSubmitTitle(event)} className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                直播标题
              </label>
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => onChangeTitle(event.target.value)}
                  placeholder="给您的直播间起一个炫酷的标题吧"
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-all focus:border-bili-blue/50 focus:outline-none hover:border-white/15"
                />
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue/20"
                >
                  更新标题
                </button>
              </div>
            </form>

            <form onSubmit={(event) => void onSubmitArea(event)} className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                直播分区
              </label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-medium text-gray-500">
                    主分区
                  </span>
                  <select
                    value={parent}
                    onChange={(event) => onChangeParent(event.target.value)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition-all focus:border-bili-blue/50 focus:outline-none"
                  >
                    {Object.keys(partitions).map((partition) => (
                      <option
                        key={partition}
                        value={partition}
                        className="bg-[#0b0e14]"
                      >
                        {partition}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-medium text-gray-500">
                    子二级分区
                  </span>
                  <select
                    value={child}
                    onChange={(event) => onChangeChild(event.target.value)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white transition-all focus:border-bili-blue/50 focus:outline-none"
                  >
                    {children.map((partition) => (
                      <option
                        key={partition}
                        value={partition}
                        className="bg-[#0b0e14]"
                      >
                        {partition}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-3">
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-5 py-2.5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue/20"
                >
                  设置分区
                </button>
              </div>
            </form>

            <form onSubmit={(event) => void onSubmitTags(event)} className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase">
                直播间标签
              </label>
              <div className="min-h-10 rounded-xl border border-white/10 bg-white/5 p-2">
                {tags.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-gray-500">
                    暂无标签，可在下方输入后添加
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded-lg border border-bili-blue/25 bg-bili-blue/10 px-2.5 py-1 text-xs text-bili-blue"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => onRemoveTag(tag)}
                          className="ml-1.5 rounded p-0.5 text-bili-blue/80 transition-colors hover:bg-bili-blue/20 hover:text-bili-blue"
                          title="删除标签"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex space-x-3">
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
                  placeholder="输入标签后回车或点添加，支持逗号批量添加"
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white transition-all focus:border-bili-blue/50 focus:outline-none hover:border-white/15"
                />
                <button
                  type="button"
                  onClick={onAddTag}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 text-xs font-semibold text-gray-300 transition-all duration-150 active:scale-95 hover:border-white/20 hover:text-white"
                >
                  <span className="inline-flex items-center">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    添加
                  </span>
                </button>
                <button
                  type="submit"
                  className="rounded-xl border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all duration-150 active:scale-95 hover:bg-bili-blue/20"
                >
                  <span className="inline-flex items-center">
                    <Tags className="mr-1.5 h-3.5 w-3.5" />
                    更新标签
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {rtmp && (
          <div className="glass-panel glow-blue rounded-3xl border border-emerald-500/20 p-6 shadow-emerald-500/5">
            <h3 className="mb-5 flex items-center text-xs font-bold tracking-wider text-emerald-400 uppercase">
              <Link className="mr-2 h-4 w-4 animate-bounce" />
              当前推流信息
            </h3>

            <div className="space-y-4 rounded-2xl border border-emerald-500/10 bg-emerald-950/20 p-4">
              <p className="text-xs text-emerald-400/85">
                推流地址与密钥属于敏感信息，默认不在界面明文展示。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() =>
                    void onCopyToClipboard(primaryEndpoint?.addr || "", "server")
                  }
                  className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 transition-all duration-150 active:scale-95 hover:border-white/20 hover:text-white"
                  disabled={!primaryEndpoint?.addr}
                >
                  {copiedKey === "server" ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  复制推流服务器
                </button>
                <button
                  onClick={() =>
                    void onCopyToClipboard(
                      primaryEndpoint?.stream_key || primaryEndpoint?.code || "",
                      "key",
                    )
                  }
                  className="inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 transition-all duration-150 active:scale-95 hover:border-white/20 hover:text-white"
                  disabled={!primaryEndpoint?.code}
                >
                  {copiedKey === "key" ? (
                    <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  复制串流密钥
                </button>
              </div>
              {primaryEndpoint && (
                <div className="grid grid-cols-1 gap-2 text-[11px] text-emerald-400/80 md:grid-cols-2">
                  <p>协议: {(primaryEndpoint.protocol || "unknown").toUpperCase()}</p>
                  <p>
                    服务商: {primaryEndpoint.provider || "未知"}
                  </p>
                  <p>schedule: {primaryEndpoint.schedule || "-"}</p>
                  <p>live_key: {rtmp.live_key || "-"}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-5">
        <div className="glass-panel flex h-full flex-col justify-between space-y-8 rounded-3xl p-6 text-center">
          <div>
            <div className="mb-6 flex items-center justify-between gap-3">
              <h3 className="text-left text-xs font-bold tracking-wider text-gray-400 uppercase">
                开播状态控制台
              </h3>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${statusPillClass}`}
              >
                当前状态: {statusLabel}
              </span>
            </div>

            <div className="flex flex-col items-center py-8">
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-full border-4 ${statusRingClass}`}
              >
                <Radio className="h-12 w-12" />
              </div>
              <h4 className="mt-5 text-base font-bold text-white">
                直播状态: {statusLabel}
              </h4>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-500">
                {statusHint}
              </p>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold tracking-wide text-gray-400 uppercase">
                  当前联动模式
                </span>
                <span className="rounded-full border border-bili-blue/30 bg-bili-blue/10 px-2 py-0.5 text-[10px] text-bili-blue">
                  {linkageModeLabel}
                </span>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b1220]/70 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-gray-300">OBS WS 连接状态</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${obsStateClass}`}>
                    {obsStateText}
                  </span>
                </div>
                {linkageStatus?.mode === "obs_ws" && (
                  <>
                    <p className="truncate text-[11px] text-gray-500">
                      {obsStatus?.url || "ws://127.0.0.1:4455"}
                    </p>
                    {obsStatus?.last_error && (
                      <p className="mt-1 text-[11px] text-rose-300">
                        {obsStatus.last_error}
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0b1220]/70 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs text-gray-300">命令联动状态</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${commandStateClass}`}
                  >
                    {commandStateText}
                  </span>
                </div>
                <p className="truncate text-[11px] text-gray-500">
                  {commandStatus?.template_preview || "未设置开播命令模板"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => void onStartLive()}
              disabled={isLive}
              className={`glow-blue flex w-full items-center justify-center rounded-2xl py-4 text-xs font-bold transition-all duration-200 ${
                isLive
                  ? "cursor-not-allowed border border-white/5 bg-white/5 text-gray-500"
                  : "bg-gradient-to-r from-emerald-500 to-teal-400 text-white active:scale-98 hover:opacity-95"
              }`}
            >
              <Radio className="mr-2 h-4 w-4" />
              开始直播
            </button>
            <button
              onClick={() => void onStopLive()}
              disabled={!isLive}
              className={`flex w-full items-center justify-center rounded-2xl border py-4 text-xs font-bold transition-all duration-200 ${
                !isLive
                  ? "cursor-not-allowed border-white/5 bg-transparent text-gray-600"
                  : "border-rose-500/25 bg-rose-500/10 text-rose-400 active:scale-98 hover:bg-rose-500/20"
              }`}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              停止直播
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
