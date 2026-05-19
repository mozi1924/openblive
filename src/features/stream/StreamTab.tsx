import {
  Check,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Link,
  Plus,
  Radio,
  RefreshCw,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import type { Session, StreamInfo } from "../../types/studio";

type StreamTabProps = {
  child: string;
  children: string[];
  copiedKey: "server" | "key" | null;
  parent: string;
  partitions: Record<string, string[]>;
  rtmp: StreamInfo | null;
  session: Session | null;
  showStreamKey: boolean;
  tagInput: string;
  tags: string[];
  title: string;
  onChangeChild: (value: string) => void;
  onChangeParent: (value: string) => void;
  onChangeShowStreamKey: React.Dispatch<React.SetStateAction<boolean>>;
  onChangeTagInput: React.Dispatch<React.SetStateAction<string>>;
  onChangeTitle: React.Dispatch<React.SetStateAction<string>>;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onCopyToClipboard: (text: string, type: "server" | "key") => Promise<void>;
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
  showStreamKey,
  tagInput,
  tags,
  title,
  onChangeChild,
  onChangeParent,
  onChangeShowStreamKey,
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
              当前推流信息 (RTMP/FLV)
            </h3>

            <div className="space-y-4">
              <StreamField
                label="推流服务器"
                value={rtmp.rtmp1?.addr || ""}
                action={
                  <button
                    onClick={() =>
                      void onCopyToClipboard(rtmp.rtmp1?.addr || "", "server")
                    }
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors active:scale-95 hover:bg-white/10 hover:text-white"
                    title="复制服务器"
                  >
                    {copiedKey === "server" ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                }
              />

              <StreamField
                label="串流密钥 (Stream Key)"
                value={rtmp.rtmp1?.code || ""}
                type={showStreamKey ? "text" : "password"}
                className="tracking-widest"
                action={
                  <>
                    <button
                      onClick={() => onChangeShowStreamKey((prev) => !prev)}
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors active:scale-95 hover:bg-white/10 hover:text-white"
                      title={showStreamKey ? "隐藏" : "显示"}
                    >
                      {showStreamKey ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() =>
                        void onCopyToClipboard(rtmp.rtmp1?.code || "", "key")
                      }
                      className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors active:scale-95 hover:bg-white/10 hover:text-white"
                      title="复制密钥"
                    >
                      {copiedKey === "key" ? (
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </>
                }
              />

              {rtmp.protocols && rtmp.protocols.length > 0 && (
                <div className="mt-4 space-y-1 rounded-2xl border border-emerald-500/10 bg-emerald-950/20 p-4 text-[11px] text-emerald-400/80">
                  <p className="font-bold text-emerald-400">✅ 直播拉流就绪</p>
                  <p>
                    您现在可以将上述地址和密钥粘贴至 OBS、RTMP
                    直播源或第三方编码器中开始推流。
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="lg:col-span-5">
        <div className="glass-panel flex h-full flex-col justify-between space-y-8 rounded-3xl p-6 text-center">
          <div>
            <h3 className="mb-6 text-left text-xs font-bold tracking-wider text-gray-400 uppercase">
              开播状态控制台
            </h3>

            <div className="flex flex-col items-center py-8">
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-full border-4 ${
                  session?.is_live
                    ? "animate-pulse border-emerald-500/20 bg-emerald-500/10 text-emerald-500 shadow-lg shadow-emerald-500/10"
                    : "border-gray-500/20 bg-gray-500/10 text-gray-500"
                }`}
              >
                <Radio className="h-12 w-12" />
              </div>
              <h4 className="mt-5 text-base font-bold text-white">
                {session?.is_live ? "直播状态: 正在推流中" : "直播状态: 离线"}
              </h4>
              <p className="mt-2 max-w-xs text-xs leading-relaxed text-gray-500">
                {session?.is_live
                  ? "当前正在向哔哩哔哩直播服务器发送信号。修改标题和分区在直播中也会生效。"
                  : "开始直播后将从B站请求专属的推流RTMP地址及密钥。"}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => void onStartLive()}
              disabled={session?.is_live}
              className={`glow-blue flex w-full items-center justify-center rounded-2xl py-4 text-xs font-bold transition-all duration-200 ${
                session?.is_live
                  ? "cursor-not-allowed border border-white/5 bg-white/5 text-gray-500"
                  : "bg-gradient-to-r from-emerald-500 to-teal-400 text-white active:scale-98 hover:opacity-95"
              }`}
            >
              <Radio className="mr-2 h-4 w-4" />
              开始直播
            </button>
            <button
              onClick={() => void onStopLive()}
              disabled={!session?.is_live}
              className={`flex w-full items-center justify-center rounded-2xl border py-4 text-xs font-bold transition-all duration-200 ${
                !session?.is_live
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

type StreamFieldProps = {
  action: React.ReactNode;
  className?: string;
  label: string;
  type?: "password" | "text";
  value: string;
};

function StreamField({
  action,
  className,
  label,
  type = "text",
  value,
}: StreamFieldProps) {
  return (
    <div className="space-y-1.5">
      <span className="text-[10px] font-semibold text-gray-500 uppercase">
        {label}
      </span>
      <div className="flex items-center space-x-2 rounded-xl border border-white/5 bg-white/5 px-4 py-2">
        <input
          type={type}
          readOnly
          value={value}
          className={`selectable-text flex-1 border-none bg-transparent text-xs text-white outline-none ${className || ""}`}
        />
        {action}
      </div>
    </div>
  );
}
