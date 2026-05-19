import { MessageSquare, Send, Trash2, Radio, Gift, Shield, Terminal } from "lucide-react";
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
      {/* Left Control Panel */}
      <div className="flex flex-col justify-between space-y-6 lg:col-span-4">
        
        {/* Connection status */}
        <div className="glass-panel space-y-6 rounded-3xl p-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
              MONITOR CONTROL
            </span>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-gray-400">
              WebSocket
            </span>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#05070a] p-4">
              <div className="flex items-center space-x-2.5">
                <span
                  className={`h-3 w-3 rounded-full ${
                    danmuListening
                      ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)] animate-pulse"
                      : "bg-gray-600"
                  }`}
                />
                <span className="text-xs font-bold text-gray-200">
                  {danmuListening ? "弹幕监听运行中" : "监听已停止"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void onStartDanmu()}
                disabled={danmuListening}
                className={`rounded-xl py-3 text-xs font-bold transition-all duration-150 active:scale-95 ${
                  danmuListening
                    ? "cursor-not-allowed border border-white/5 bg-white/3 text-gray-600"
                    : "btn-primary text-white"
                }`}
              >
                启动监听
              </button>
              <button
                onClick={() => void onStopDanmu()}
                disabled={!danmuListening}
                className={`rounded-xl border py-3 text-xs font-bold transition-all duration-150 active:scale-95 ${
                  !danmuListening
                    ? "cursor-not-allowed border-white/5 bg-transparent text-gray-600"
                    : "border-rose-500/20 bg-rose-500/8 text-rose-400 hover:bg-rose-500/15"
                }`}
              >
                停止监听
              </button>
            </div>
          </div>
        </div>

        {/* Quick chat sender */}
        <div className="glass-panel flex flex-1 flex-col justify-between rounded-3xl p-6">
          <div>
            <div className="mb-4 flex items-center space-x-2">
              <Radio className="h-4 w-4 text-bili-pink animate-pulse" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                FAST BROADCAST
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-gray-500">
              在此直接输入弹幕内容并回车，将以当前主播账号身份实时发送到直播间弹幕姬。
            </p>
          </div>

          <form
            onSubmit={(event) => void onSendDanmu(event)}
            className="mt-6 flex flex-col space-y-3"
          >
            <textarea
              value={danmuText}
              onChange={(event) => onChangeDanmuText(event.target.value)}
              placeholder="发送一条弹幕互动一下..."
              rows={4}
              className="selectable-text w-full resize-none rounded-2xl border border-white/8 bg-[#090c14] p-4 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-[#0c0f1a] focus:outline-none hover:border-white/12"
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
              className={`flex items-center justify-center rounded-2xl py-3.5 text-xs font-bold transition-all ${
                danmuText.trim()
                  ? "btn-primary text-white active:scale-95"
                  : "cursor-not-allowed bg-white/4 text-gray-600"
              }`}
            >
              <Send className="mr-2 h-3.5 w-3.5" />
              发射弹幕
            </button>
          </form>
        </div>
      </div>

      {/* Right Interaction stream feed */}
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/5 bg-[#070a0f]/60 backdrop-blur-xl lg:col-span-8 shadow-xl">
        <div className="flex items-center justify-between border-b border-white/5 bg-[#090d16]/80 px-6 py-4">
          <div className="flex items-center space-x-2">
            <MessageSquare className="h-4.5 w-4.5 text-bili-blue" />
            <span className="text-xs font-extrabold tracking-widest text-white uppercase">
              实时互动流
            </span>
            <span className="rounded-full bg-bili-blue/10 px-2.5 py-0.5 text-[9px] font-bold text-bili-blue font-mono border border-bili-blue/20">
              已收: {danmus.length}
            </span>
          </div>
          
          <button
            onClick={onClearDanmus}
            className="rounded-xl border border-transparent p-2 text-gray-500 transition-all hover:border-white/8 hover:bg-white/5 hover:text-white"
            title="清空互动墙"
          >
            <Trash2 className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Message Feed area */}
        <div className="flex flex-1 flex-col-reverse gap-3 overflow-y-auto p-6 scrollbar-thin">
          <div ref={danmuEndRef} />

          {danmus.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/5 bg-white/2 text-gray-700 animate-pulse">
                <Terminal className="h-6 w-6" />
              </div>
              <p className="text-xs text-gray-500 font-bold">等待弹幕流信号接入...</p>
              <p className="mt-1.5 text-[10px] text-gray-600 max-w-xs leading-relaxed">
                请确保左侧监听已开启，并且在直播间中有观众发送弹幕、送礼或投喂。
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
  const typeStyles = {
    danmu: {
      card: "bg-white/3 border border-white/5 text-gray-100 hover:bg-white/5 hover:border-white/8",
      sender: "text-bili-blue/90 font-extrabold",
      badge: null
    },
    gift: {
      card: "bg-gradient-to-r from-bili-pink/8 via-[#ff8bb2]/4 to-transparent border border-bili-pink/15 text-bili-pink/90 shadow-[0_0_12px_rgba(255,102,153,0.03)]",
      sender: "text-bili-pink font-extrabold",
      badge: (
        <span className="flex items-center rounded bg-bili-pink/15 border border-bili-pink/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-bili-pink tracking-wider">
          <Gift className="mr-0.5 h-2.5 w-2.5" />
          礼物
        </span>
      )
    },
    guard: {
      card: "bg-gradient-to-r from-[#8b5cf6]/8 via-[#a78bfa]/4 to-transparent border border-[#8b5cf6]/15 text-[#c4b5fd]/95 shadow-[0_0_12px_rgba(139,92,246,0.03)]",
      sender: "text-violet-400 font-extrabold",
      badge: (
        <span className="flex items-center rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-violet-400 tracking-wider">
          <Shield className="mr-0.5 h-2.5 w-2.5" />
          航海
        </span>
      )
    },
    system: {
      card: "bg-black/20 border border-dashed border-white/5 text-gray-500 font-mono italic",
      sender: "text-gray-400 font-bold",
      badge: (
        <span className="rounded bg-white/5 border border-white/10 px-1 py-0.2 text-[8px] font-bold text-gray-500">
          SYS
        </span>
      )
    }
  }[message.type];

  return (
    <div
      className={`max-w-xl self-start rounded-2xl p-4 text-xs leading-relaxed transition-all duration-300 ${typeStyles.card}`}
    >
      <div className="mb-2 flex items-center space-x-2">
        <span className={`max-w-[150px] truncate tracking-wide text-xs ${typeStyles.sender}`}>
          {message.sender}
        </span>

        {typeStyles.badge}

        <span className="ml-auto shrink-0 text-[9px] font-semibold text-gray-500 font-mono">
          {message.time}
        </span>
      </div>

      <p className="select-text break-all text-xs text-gray-300 font-medium">
        {message.content}
      </p>
    </div>
  );
}
