import { MessageSquare, Send, Trash2 } from "lucide-react";
import type { DanmuMsg } from "../../types/studio";

type DanmuTabProps = {
  danmuEndRef: React.RefObject<HTMLDivElement | null>;
  danmuListening: boolean;
  danmuText: string;
  danmus: DanmuMsg[];
  onChangeDanmuText: React.Dispatch<React.SetStateAction<string>>;
  onClearDanmus: () => void;
  onSendDanmu: (event: React.FormEvent) => Promise<void>;
  onStartDanmu: () => Promise<void>;
  onStopDanmu: () => Promise<void>;
};

export function DanmuTab({
  danmuEndRef,
  danmuListening,
  danmuText,
  danmus,
  onChangeDanmuText,
  onClearDanmus,
  onSendDanmu,
  onStartDanmu,
  onStopDanmu,
}: DanmuTabProps) {
  return (
    <div className="mx-auto grid h-[calc(100vh-180px)] max-w-6xl grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="flex flex-col justify-between space-y-6 lg:col-span-4">
        <div className="glass-panel space-y-6 rounded-3xl p-6">
          <h3 className="text-xs font-bold tracking-wider text-gray-400 uppercase">
            监听控制
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
              <div className="flex items-center space-x-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    danmuListening ? "animate-pulse bg-emerald-500" : "bg-gray-600"
                  }`}
                />
                <span className="text-xs font-bold">
                  {danmuListening ? "运行中" : "未启动"}
                </span>
              </div>
              <span className="text-[10px] font-semibold text-gray-500 uppercase">
                WebSocket
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void onStartDanmu()}
                disabled={danmuListening}
                className={`rounded-xl py-3 text-xs font-bold transition-all duration-150 ${
                  danmuListening
                    ? "cursor-not-allowed border border-white/5 bg-white/5 text-gray-500"
                    : "bg-bili-blue text-white active:scale-95 hover:opacity-95"
                }`}
              >
                启动监听
              </button>
              <button
                onClick={() => void onStopDanmu()}
                disabled={!danmuListening}
                className={`rounded-xl border py-3 text-xs font-bold transition-all duration-150 ${
                  !danmuListening
                    ? "cursor-not-allowed border-white/5 bg-transparent text-gray-600"
                    : "border-rose-500/20 bg-rose-500/10 text-rose-400 active:scale-95 hover:bg-rose-500/20"
                }`}
              >
                停止监听
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel flex flex-1 flex-col justify-between rounded-3xl p-6">
          <div>
            <h3 className="mb-4 text-xs font-bold tracking-wider text-gray-400 uppercase">
              快捷发言
            </h3>
            <p className="text-[11px] leading-relaxed text-gray-500">
              直接在此键入信息并回车，能以当前直播间主播身份向直播间快速发射弹幕。
            </p>
          </div>

          <form
            onSubmit={(event) => void onSendDanmu(event)}
            className="mt-6 flex flex-col space-y-3"
          >
            <textarea
              value={danmuText}
              onChange={(event) => onChangeDanmuText(event.target.value)}
              placeholder="说点什么吧..."
              rows={4}
              className="selectable-text w-full resize-none rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white transition-all focus:border-bili-blue/50 focus:outline-none hover:border-white/15"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const form = event.currentTarget.form;
                  form?.requestSubmit();
                }
              }}
            />
            <button
              type="submit"
              disabled={!danmuText.trim()}
              className={`flex items-center justify-center rounded-xl py-3 text-xs font-bold transition-all ${
                danmuText.trim()
                  ? "bg-gradient-to-r from-bili-blue to-teal-400 text-white active:scale-95"
                  : "cursor-not-allowed bg-white/5 text-gray-600"
              }`}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              发射弹幕
            </button>
          </form>
        </div>
      </div>

      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-[#1a2336] bg-[#0d121c]/60 lg:col-span-8">
        <div className="flex items-center justify-between border-b border-[#1a2336] bg-[#0a0f18]/80 px-6 py-4">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-4 w-4 text-bili-blue" />
            <span className="text-xs font-bold tracking-wider text-white uppercase">
              实时互动流
            </span>
          </div>
          <button
            onClick={onClearDanmus}
            className="p-1 text-gray-500 transition-colors hover:text-white"
            title="清空互动墙"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col-reverse space-y-4 overflow-y-auto p-6">
          <div ref={danmuEndRef} />

          {danmus.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center">
              <MessageSquare className="mb-3 h-12 w-12 animate-pulse text-gray-700" />
              <p className="text-xs text-gray-600">等待弹幕传入...</p>
              <p className="mt-1 text-[10px] text-gray-700">
                确保已点击启动监听并且直播间有互动
              </p>
            </div>
          ) : (
            danmus.map((msg) => <DanmuCard key={msg.id} message={msg} />)
          )}
        </div>
      </div>
    </div>
  );
}

function DanmuCard({ message }: { message: DanmuMsg }) {
  const typeClassName = {
    danmu: "bg-white/5 text-gray-100",
    gift: "glow-pink border-bili-pink/20 bg-gradient-to-r from-bili-pink/10 to-bili-pink/5 text-bili-pink/90",
    guard: "glow-pink border-purple-500/20 bg-purple-950/20 text-purple-400",
    system: "border-dashed bg-white/5 text-gray-500",
  }[message.type];

  return (
    <div
      className={`max-w-lg rounded-2xl border border-white/5 p-3.5 text-xs leading-relaxed transition-all duration-300 ${typeClassName}`}
    >
      <div className="mb-1.5 flex items-center space-x-2">
        <span className="max-w-[120px] truncate font-extrabold tracking-wide text-gray-200">
          {message.sender}
        </span>

        {message.type === "gift" && (
          <span className="rounded bg-bili-pink/20 px-1.5 py-0.5 text-[9px] font-bold text-bili-pink">
            礼物
          </span>
        )}
        {message.type === "guard" && (
          <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-bold text-purple-400">
            航海
          </span>
        )}

        <span className="ml-auto shrink-0 text-[9px] font-medium text-gray-500">
          {message.time}
        </span>
      </div>

      <p className="select-text break-all font-medium text-gray-300">
        {message.content}
      </p>
    </div>
  );
}
