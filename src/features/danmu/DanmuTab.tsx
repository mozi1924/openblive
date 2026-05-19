import { MessageSquare, Send, Trash2, Radio, Gift, Shield, Terminal } from "lucide-react";
import type { DanmuMsg, User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type DanmuTabProps = {
  locale: LocaleSetting;
  currentUser: User | null;
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
  locale,
  currentUser,
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
    <div className="flex flex-col flex-1 h-full overflow-hidden max-w-5xl mx-auto w-full glass-panel rounded-3xl shadow-2xl bg-[#070a0f]/60 backdrop-blur-xl border border-white/5">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 bg-[#090d16]/80 px-6 py-4 gap-4">
        {/* Left: Title & Count */}
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-bili-blue/10 border border-bili-blue/20">
            <MessageSquare className="h-5 w-5 text-bili-blue" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-bold text-white tracking-wide">
                {t(locale, "ui.danmu.feed_title")}
              </span>
              <span className="rounded-full bg-bili-blue/10 px-2 py-0.5 text-[10px] font-mono font-bold text-bili-blue border border-bili-blue/20">
                {tf(locale, "ui.danmu.feed_count", { count: danmus.length })}
              </span>
            </div>
            <p className="text-[10px] text-gray-500 font-medium">WebSocket Event Stream</p>
          </div>
        </div>

        {/* Right: Condensed Listening Controls & Actions */}
        <div className="flex items-center flex-wrap gap-3">
          {/* Status Indicator */}
          <div className="flex items-center space-x-2 rounded-xl bg-[#05070a] border border-white/5 px-3 py-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                danmuListening
                  ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"
                  : "bg-gray-600"
              }`}
            />
            <span className="text-xs font-semibold text-gray-300">
              {danmuListening ? t(locale, "ui.danmu.status.on") : t(locale, "ui.danmu.status.off")}
            </span>
          </div>

          {/* Start/Stop Buttons */}
          <div className="flex items-center space-x-2">
            {!danmuListening ? (
              <button
                onClick={() => void onStartDanmu()}
                className="flex items-center space-x-1.5 rounded-xl bg-bili-blue px-3.5 py-1.5 text-xs font-bold text-white transition-all hover:bg-bili-blue/90 active:scale-95 shadow-[0_4px_12px_rgba(0,174,236,0.25)]"
              >
                <Radio className="h-3.5 w-3.5" />
                <span>{t(locale, "ui.danmu.start")}</span>
              </button>
            ) : (
              <button
                onClick={() => void onStopDanmu()}
                className="flex items-center space-x-1.5 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3.5 py-1.5 text-xs font-bold text-rose-400 transition-all hover:bg-rose-500/20 active:scale-95"
              >
                <Radio className="h-3.5 w-3.5 text-rose-400 animate-pulse" />
                <span>{t(locale, "ui.danmu.stop")}</span>
              </button>
            )}

            {/* Clear Button */}
            <button
              onClick={onClearDanmus}
              className="rounded-xl border border-white/5 bg-white/3 p-2 text-gray-400 transition-all hover:border-white/10 hover:bg-white/5 hover:text-white active:scale-95"
              title={t(locale, "ui.danmu.clear_wall")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Message Feed Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin flex flex-col-reverse bg-[#06080d]/40">
        <div ref={danmuEndRef} />

        {danmus.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center py-20 text-center flex-1">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/5 bg-white/2 text-gray-700 animate-pulse">
              <Terminal className="h-6 w-6" />
            </div>
            <p className="text-xs text-gray-500 font-bold">{t(locale, "ui.danmu.empty.title")}</p>
            <p className="mt-1.5 text-[10px] text-gray-600 max-w-xs leading-relaxed">
              {t(locale, "ui.danmu.empty.desc")}
            </p>
          </div>
        ) : (
          danmus.map((msg) => (
            <DanmuCard key={msg.id} message={msg} locale={locale} currentUser={currentUser} />
          ))
        )}
      </div>

      {/* Bottom Chat Input Bar */}
      <div className="border-t border-white/5 bg-[#090d16]/80 p-4">
        <form
          onSubmit={(event) => void onSendDanmu(event)}
          className="relative flex items-center space-x-2 rounded-2xl border border-white/8 bg-[#06080d] p-2 focus-within:border-bili-blue/40 focus-within:bg-[#090c15] transition-all duration-200"
        >
          <textarea
            value={danmuText}
            onChange={(event) => onChangeDanmuText(event.target.value)}
            placeholder={t(locale, "ui.danmu.placeholder")}
            rows={1}
            className="selectable-text flex-1 resize-none bg-transparent px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none max-h-24 scrollbar-thin"
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all ${
              danmuText.trim()
                ? "bg-bili-blue text-white hover:bg-bili-blue/90 active:scale-95 shadow-[0_2px_8px_rgba(0,174,236,0.3)]"
                : "cursor-not-allowed bg-white/3 text-gray-600"
            }`}
            title={t(locale, "ui.danmu.send")}
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-2 px-3 text-[10px] text-gray-500 leading-normal">
          {t(locale, "ui.danmu.fast_desc")}
        </p>
      </div>
    </div>
  );
}

function DanmuCard({
  message,
  locale,
  currentUser,
}: {
  message: DanmuMsg;
  locale: LocaleSetting;
  currentUser: User | null;
}) {
  const isMe =
    currentUser &&
    (message.sender === currentUser.uname ||
      message.sender === t(locale, "ui.ctrl.me") ||
      message.sender === "我" ||
      message.sender === "Me");

  if (message.type === "system") {
    return (
      <div className="flex justify-center w-full my-1">
        <div className="flex items-center space-x-2 rounded-full bg-black/35 border border-dashed border-white/5 px-4 py-1.5 text-[10px] text-gray-500 font-mono italic">
          <span className="rounded bg-white/5 border border-white/10 px-1 py-0.2 text-[8px] font-bold text-gray-500 scale-90 uppercase">
            SYS
          </span>
          <span>{message.content}</span>
          <span className="text-[9px] text-gray-600 font-semibold">{message.time}</span>
        </div>
      </div>
    );
  }

  if (message.type === "gift") {
    return (
      <div className="flex items-start space-x-2.5 max-w-[85%] self-start transition-all duration-300">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-bili-pink/30 bg-bili-pink/15 text-bili-pink shadow-[0_0_8px_rgba(255,102,153,0.15)]">
          <Gift className="h-4 w-4" />
        </div>
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-bili-pink">{message.sender}</span>
            <span className="flex items-center rounded bg-bili-pink/15 border border-bili-pink/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-bili-pink tracking-wider">
              {t(locale, "ui.danmu.badge.gift")}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">{message.time}</span>
          </div>
          <div className="rounded-2xl rounded-tl-none bg-gradient-to-br from-bili-pink/15 via-bili-pink/5 to-transparent border border-bili-pink/20 px-4 py-2.5 text-xs text-gray-200 shadow-sm font-semibold select-text break-all">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  if (message.type === "guard") {
    return (
      <div className="flex items-start space-x-2.5 max-w-[85%] self-start transition-all duration-300">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-500/30 bg-violet-500/15 text-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.15)]">
          <Shield className="h-4 w-4" />
        </div>
        <div className="flex flex-col space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-black text-violet-400">{message.sender}</span>
            <span className="flex items-center rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-violet-400 tracking-wider">
              {t(locale, "ui.danmu.badge.guard")}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">{message.time}</span>
          </div>
          <div className="rounded-2xl rounded-tl-none bg-gradient-to-br from-[#8b5cf6]/15 via-[#8b5cf6]/5 to-transparent border border-[#8b5cf6]/20 px-4 py-2.5 text-xs text-gray-200 shadow-sm font-semibold select-text break-all">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Normal Danmaku messages
  if (isMe) {
    return (
      <div className="flex flex-col items-end space-y-1 max-w-[85%] self-end transition-all duration-300">
        <div className="flex items-center space-x-1.5 text-[9px] text-gray-500 font-mono">
          <span>{message.time}</span>
          <span className="font-bold text-bili-blue">{message.sender}</span>
        </div>
        <div className="rounded-2xl rounded-tr-none bg-gradient-to-br from-bili-blue to-[#0092c7] px-4 py-2.5 text-xs text-white shadow-md select-text break-all border border-bili-blue/20">
          {message.content}
        </div>
      </div>
    );
  }

  // Audience Danmaku message
  const firstChar = message.sender.trim().charAt(0) || "?";
  const colors = [
    "bg-red-500/20 text-red-300 border-red-500/30",
    "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "bg-teal-500/20 text-teal-300 border-teal-500/30",
    "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    "bg-violet-500/20 text-violet-300 border-violet-500/30",
    "bg-purple-500/20 text-purple-300 border-purple-500/30",
    "bg-pink-500/20 text-pink-300 border-pink-500/30"
  ];
  let hash = 0;
  for (let i = 0; i < message.sender.length; i++) {
    hash = message.sender.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colorClass = colors[Math.abs(hash) % colors.length];

  return (
    <div className="flex items-start space-x-2.5 max-w-[85%] self-start transition-all duration-300">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black uppercase ${colorClass}`}>
        {firstChar}
      </div>
      <div className="flex flex-col space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-gray-300">{message.sender}</span>
          <span className="text-[9px] text-gray-500 font-mono">{message.time}</span>
        </div>
        <div className="rounded-2xl rounded-tl-none bg-white/5 border border-white/5 px-4 py-2.5 text-xs text-gray-200 shadow-sm select-text break-all hover:bg-white/8 hover:border-white/10 transition-all duration-150">
          {message.content}
        </div>
      </div>
    </div>
  );
}
