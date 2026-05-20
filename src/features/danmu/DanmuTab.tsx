import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Gift,
  MessageSquare,
  Radio,
  Send,
  Shield,
  SmilePlus,
  Terminal,
  Trash2,
} from "lucide-react";
import type { DanmuMsg, LiveEmoticonPackage, User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { resolveBackendMessage, t, tf } from "../../utils/i18n";
import { CompactEventStrip } from "./CompactEventStrip";

type DanmuTabProps = {
  locale: LocaleSetting;
  currentUser: User | null;
  danmuEndRef: React.RefObject<HTMLDivElement | null>;
  danmuListening: boolean;
  danmuText: string;
  danmus: DanmuMsg[];
  liveEmoticonPackages: LiveEmoticonPackage[];
  liveEmoticonsLoading: boolean;
  onChangeDanmuText: React.Dispatch<React.SetStateAction<string>>;
  onClearDanmus: () => void;
  onSendDanmu: (event: React.FormEvent) => Promise<void>;
  onStartDanmu: () => Promise<void>;
  onStopDanmu: () => Promise<void>;
};

type DanmuRenderState = {
  message: DanmuMsg;
  mergeWithAbove: boolean;
  mergeWithBelow: boolean;
  showSenderMeta: boolean;
};

const resolveEmoticonStyle = (width: number, height: number, targetHeight: number) => {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  const resolvedWidth = Math.max(targetHeight, Math.round(targetHeight * ratio));
  return {
    width: `${Math.min(resolvedWidth, targetHeight * 3.4)}px`,
    height: `${targetHeight}px`,
  };
};

const isSelfMessage = (message: DanmuMsg, currentUser: User | null, locale: LocaleSetting) =>
  Boolean(
    currentUser &&
      (message.sender === currentUser.uname ||
        message.sender_uid === Number(currentUser.uid) ||
        message.sender === t(locale, "ui.ctrl.me") ||
        message.sender === "我" ||
        message.sender === "Me"),
  );

const canMergeDanmu = (
  current: DanmuMsg | undefined,
  neighbor: DanmuMsg | undefined,
  currentUser: User | null,
  locale: LocaleSetting,
) => {
  if (!current || !neighbor) {
    return false;
  }
  if (current.type !== "danmu" || neighbor.type !== "danmu") {
    return false;
  }

  const currentIsSelf = isSelfMessage(current, currentUser, locale);
  const neighborIsSelf = isSelfMessage(neighbor, currentUser, locale);
  if (currentIsSelf !== neighborIsSelf) {
    return false;
  }

  const sameSender =
    typeof current.sender_uid === "number" && typeof neighbor.sender_uid === "number"
      ? current.sender_uid === neighbor.sender_uid
      : current.sender === neighbor.sender;

  return sameSender;
};

const resolveDanmuBubbleShape = (
  isSelf: boolean,
  mergeWithAbove: boolean,
  mergeWithBelow: boolean,
) => {
  if (isSelf) {
    if (mergeWithAbove && mergeWithBelow) {
      return "rounded-2xl rounded-tr-md rounded-br-md";
    }
    if (mergeWithAbove) {
      return "rounded-2xl rounded-tr-md rounded-br-none";
    }
    if (mergeWithBelow) {
      return "rounded-2xl rounded-tr-none rounded-br-md";
    }
    return "rounded-2xl rounded-tr-none";
  }

  if (mergeWithAbove && mergeWithBelow) {
    return "rounded-2xl rounded-tl-md rounded-bl-md";
  }
  if (mergeWithAbove) {
    return "rounded-2xl rounded-tl-md rounded-bl-none";
  }
  if (mergeWithBelow) {
    return "rounded-2xl rounded-tl-none rounded-bl-md";
  }
  return "rounded-2xl rounded-tl-none";
};

const formatGiftPrice = (rawValue: number) => {
  const yuan = rawValue / 1000;
  return (Number.isInteger(yuan) ? yuan.toFixed(0) : yuan.toFixed(yuan >= 100 ? 1 : 2)).replace(
    /\.0+$|(\.\d*[1-9])0+$/,
    "$1",
  );
};

const resolveGiftAmountLabel = (message: DanmuMsg, locale: LocaleSetting) => {
  const count = Math.max(message.gift_count ?? 1, 1);
  if (message.type === "guard") {
    const total = Math.max(message.gift_total_coin ?? (message.gift_unit_price ?? 0) * count, 0);
    return total > 0 ? `¥${formatGiftPrice(total)}` : t(locale, "ui.danmu.gift.free");
  }

  const totalCoin = Math.max(
    message.gift_total_coin ?? (message.gift_unit_price ?? 0) * count,
    0,
  );
  if (totalCoin <= 0) {
    return t(locale, "ui.danmu.gift.free");
  }
  if (message.gift_coin_type === "silver") {
    return tf(locale, "ui.danmu.gift.silver", { amount: totalCoin.toLocaleString() });
  }
  return `¥${formatGiftPrice(totalCoin)}`;
};

export function DanmuTab({
  locale,
  currentUser,
  danmuEndRef,
  danmuListening,
  danmuText,
  danmus,
  liveEmoticonPackages,
  liveEmoticonsLoading,
  onChangeDanmuText,
  onClearDanmus,
  onSendDanmu,
  onStartDanmu,
  onStopDanmu,
}: DanmuTabProps) {
  const [emoticonPanelOpen, setEmoticonPanelOpen] = useState(false);
  const composerRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoticonPanelRef = useRef<HTMLDivElement>(null);
  const hasEmoticons = useMemo(
    () => liveEmoticonPackages.some((pkg) => pkg.emoticons.length > 0),
    [liveEmoticonPackages],
  );
  const renderedDanmus = useMemo<DanmuRenderState[]>(
    () =>
      danmus.map((message, index) => {
        const newerMessage = danmus[index - 1];
        const olderMessage = danmus[index + 1];
        const mergeWithBelow = canMergeDanmu(message, newerMessage, currentUser, locale);
        const mergeWithAbove = canMergeDanmu(message, olderMessage, currentUser, locale);

        return {
          message,
          mergeWithAbove,
          mergeWithBelow,
          showSenderMeta: !mergeWithAbove,
        };
      }),
    [currentUser, danmus, locale],
  );

  useEffect(() => {
    if (!emoticonPanelOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (emoticonPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      if (composerRef.current?.contains(event.target as Node)) {
        return;
      }
      setEmoticonPanelOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEmoticonPanelOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [emoticonPanelOpen]);

  const insertEmoticon = (text: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? danmuText.length;
    const end = input?.selectionEnd ?? danmuText.length;

    onChangeDanmuText((prev) => `${prev.slice(0, start)}${text}${prev.slice(end)}`);

    window.requestAnimationFrame(() => {
      const nextInput = textareaRef.current;
      if (!nextInput) {
        return;
      }
      const nextCursor = start + text.length;
      nextInput.focus();
      nextInput.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="flex flex-col flex-1 h-full overflow-hidden max-w-5xl mx-auto w-full glass-panel rounded-3xl shadow-2xl bg-[#070a0f]/60 backdrop-blur-xl border border-white/5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 bg-[#090d16]/80 px-6 py-4 gap-4">
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

        <div className="flex items-center flex-wrap gap-3">
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

      <div className="flex-1 overflow-y-auto p-6 scrollbar-thin flex flex-col-reverse bg-[#06080d]/40">
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
          renderedDanmus.map((item) => (
            <DanmuCard
              key={item.message.id}
              message={item.message}
              locale={locale}
              currentUser={currentUser}
              mergeWithAbove={item.mergeWithAbove}
              mergeWithBelow={item.mergeWithBelow}
              showSenderMeta={item.showSenderMeta}
            />
          ))
        )}
      </div>

      <div className="border-t border-white/5 bg-[#090d16]/80 p-4">
        <form
          ref={composerRef}
          onSubmit={(event) => {
            setEmoticonPanelOpen(false);
            void onSendDanmu(event);
          }}
          className="relative"
        >
          <div className="flex items-center space-x-2 rounded-2xl border border-white/8 bg-[#06080d] p-2 focus-within:border-bili-blue/40 focus-within:bg-[#090c15] transition-all duration-200">
            <textarea
              ref={textareaRef}
              value={danmuText}
              onChange={(event) => onChangeDanmuText(event.target.value)}
              placeholder={t(locale, "ui.danmu.placeholder")}
              rows={1}
              className="selectable-text flex-1 resize-none bg-transparent px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none max-h-24 scrollbar-thin"
              onKeyDown={(event) => {
                if (event.key === "Escape" && emoticonPanelOpen) {
                  event.preventDefault();
                  setEmoticonPanelOpen(false);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  const form = event.currentTarget.form;
                  form?.requestSubmit();
                }
              }}
            />
            <button
              type="button"
              onClick={() => setEmoticonPanelOpen((prev) => !prev)}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                emoticonPanelOpen
                  ? "border-bili-blue/40 bg-bili-blue/15 text-bili-blue"
                  : "border-white/5 bg-white/3 text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
              }`}
              title={t(locale, "ui.danmu.emoticon.toggle")}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
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
          </div>

          {emoticonPanelOpen && (
            <div
              ref={emoticonPanelRef}
              className="absolute bottom-[calc(100%+12px)] right-0 z-20 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
            >
              <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {t(locale, "ui.danmu.emoticon.panel_title")}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {t(locale, "ui.danmu.emoticon.panel_desc")}
                  </p>
                </div>
                <span className="rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-gray-400">
                  {liveEmoticonPackages.reduce((count, pkg) => count + pkg.emoticons.length, 0)}
                </span>
              </div>

              <div className="max-h-[24rem] overflow-y-auto px-4 py-4 scrollbar-thin">
                {liveEmoticonsLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-xs text-gray-400">
                    {t(locale, "ui.danmu.emoticon.loading")}
                  </div>
                ) : !hasEmoticons ? (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-xs text-gray-400">
                    {t(locale, "ui.danmu.emoticon.empty")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {liveEmoticonPackages.map((pkg) => (
                      <section key={pkg.pkg_id} className="space-y-2">
                        <div className="flex items-center justify-between px-1">
                          <p className="text-xs font-semibold text-gray-200">{pkg.pkg_name}</p>
                          {pkg.pkg_descript ? (
                            <span className="text-[10px] text-gray-500">{pkg.pkg_descript}</span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                          {pkg.emoticons.map((emoticon) => (
                            <button
                              key={emoticon.emoticon_unique || `${pkg.pkg_id}-${emoticon.emoticon_id}`}
                              type="button"
                              onClick={() => insertEmoticon(emoticon.text)}
                              className="group flex min-h-24 flex-col items-center justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-2 py-3 text-center transition-all hover:border-bili-blue/30 hover:bg-bili-blue/8"
                              title={emoticon.text}
                            >
                              <img
                                src={emoticon.url}
                                alt={emoticon.text}
                                className="pointer-events-none object-contain"
                                style={resolveEmoticonStyle(emoticon.width, emoticon.height, 36)}
                              />
                              <span className="mt-2 text-[10px] font-medium text-gray-400 transition-colors group-hover:text-gray-100">
                                {emoticon.label || emoticon.text}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
        <p className="mt-2 px-3 text-[10px] text-gray-500 leading-normal">
          {t(locale, "ui.danmu.fast_desc")}
        </p>
      </div>
    </div>
  );
}

function DanmuBubbleContent({
  message,
  locale,
  className,
  emoticonHeight = 24,
}: {
  message: DanmuMsg;
  locale: LocaleSetting;
  className: string;
  emoticonHeight?: number;
}) {
  if (!message.segments?.length) {
    return <div className={className}>{resolveBackendMessage(message.content, locale)}</div>;
  }

  return (
    <div className={className}>
      {message.segments.map((segment, index) =>
        segment.type === "text" ? (
          <span key={`${message.id}-text-${index}`} className="whitespace-pre-wrap break-all">
            {resolveBackendMessage(segment.text, locale)}
          </span>
        ) : (
          <img
            key={`${message.id}-emoticon-${index}`}
            src={segment.emoticon.url}
            alt={segment.text}
            title={segment.text}
            className="mx-0.5 inline-block select-none object-contain align-[-0.35rem]"
            style={resolveEmoticonStyle(
              segment.emoticon.width,
              segment.emoticon.height,
              emoticonHeight,
            )}
          />
        ),
      )}
    </div>
  );
}

function DanmuSenderMeta({
  align,
  sender,
  senderNameClass,
  senderNameStyle,
  senderBadge,
  time,
}: {
  align: "left" | "right";
  sender: string;
  senderNameClass: string;
  senderNameStyle?: CSSProperties;
  senderBadge:
    | {
        icon: ReactNode;
        text: string;
        className: string;
      }
    | null;
  time: string;
}) {
  return (
    <div
      className={`mb-1.5 flex items-center gap-2 text-[10px] leading-none ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <span className={`font-semibold tracking-[0.01em] ${senderNameClass}`} style={senderNameStyle}>
        {sender}
      </span>
      {senderBadge ? (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-1 text-[8px] font-black tracking-[0.14em] ${senderBadge.className}`}
        >
          {senderBadge.icon}
          <span>{senderBadge.text}</span>
        </span>
      ) : null}
      <span className="font-mono text-[9px] text-gray-500">{time}</span>
    </div>
  );
}

function DanmuAvatar({
  sender,
  avatarUrl,
  className,
}: {
  sender: string;
  avatarUrl?: string;
  className: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl]);

  const firstChar = sender.trim().charAt(0) || "?";
  if (avatarUrl && !imageFailed) {
    return (
      <img
        src={avatarUrl}
        alt={sender}
        loading="lazy"
        onError={() => setImageFailed(true)}
        className={`${className} rounded-full border border-white/10 bg-[#0f1622] object-cover shadow-[0_8px_18px_rgba(0,0,0,0.18)]`}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-full border text-xs font-black uppercase shadow-[0_8px_18px_rgba(0,0,0,0.18)] ${pickAvatarColorBySender(sender)}`}
    >
      {firstChar}
    </div>
  );
}

function pickColorBySender(sender: string) {
  const palette = [
    "text-red-300",
    "text-orange-300",
    "text-amber-300",
    "text-emerald-300",
    "text-teal-300",
    "text-blue-300",
    "text-indigo-300",
    "text-violet-300",
    "text-purple-300",
    "text-pink-300",
  ];
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function pickAvatarColorBySender(sender: string) {
  const palette = [
    "bg-red-500/20 text-red-300 border-red-500/30",
    "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "bg-amber-500/20 text-amber-300 border-amber-500/30",
    "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    "bg-teal-500/20 text-teal-300 border-teal-500/30",
    "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
    "bg-violet-500/20 text-violet-300 border-violet-500/30",
    "bg-purple-500/20 text-purple-300 border-purple-500/30",
    "bg-pink-500/20 text-pink-300 border-pink-500/30",
  ];
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function DanmuCard({
  message,
  locale,
  currentUser,
  mergeWithAbove,
  mergeWithBelow,
  showSenderMeta,
}: {
  message: DanmuMsg;
  locale: LocaleSetting;
  currentUser: User | null;
  mergeWithAbove: boolean;
  mergeWithBelow: boolean;
  showSenderMeta: boolean;
}) {
  const rawType = String(message.type ?? "");
  const localizedSender = resolveBackendMessage(message.sender, locale);
  const localizedContent = resolveBackendMessage(message.content, locale);
  const isMe = isSelfMessage(message, currentUser, locale);
  const resolvedSenderFace = isMe ? message.sender_face || currentUser?.face : message.sender_face;
  const senderUid =
    typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
  const currentUid = currentUser?.uid ? Number(currentUser.uid) : Number.NaN;
  const isAnchor =
    Number.isFinite(senderUid) && Number.isFinite(currentUid) && senderUid === currentUid;
  const isAdmin = message.sender_role === "admin";
  const isGuard = message.sender_role === "guard" || (message.sender_guard_level ?? 0) > 0;

  const senderNameClass = isAnchor
    ? "text-amber-300"
    : isAdmin
      ? "text-cyan-300"
      : isGuard
        ? "text-violet-300"
        : pickColorBySender(localizedSender);
  const senderNameStyle = !isAnchor && !isAdmin && !isGuard && message.sender_name_color
    ? { color: message.sender_name_color }
    : undefined;

  const senderBadge = isAnchor
    ? {
        icon: <Radio className="h-3 w-3" />,
        text: "ANCHOR",
        className: "bg-amber-400/12 border-amber-300/28 text-amber-200",
      }
    : isAdmin
      ? {
          icon: <Shield className="h-3 w-3" />,
          text: "ADMIN",
          className: "bg-cyan-400/12 border-cyan-300/28 text-cyan-200",
        }
      : isGuard
        ? {
            icon: <Gift className="h-3 w-3" />,
            text: "GUARD",
            className: "bg-violet-400/12 border-violet-300/28 text-violet-200",
          }
        : null;
  const meNameClass = senderBadge ? senderNameClass : "text-bili-blue";
  const bubbleShapeClass = resolveDanmuBubbleShape(isMe, mergeWithAbove, mergeWithBelow);
  const stackGapClass = mergeWithAbove ? "mt-1" : "mt-4";

  if (
    rawType === "system" ||
    rawType === "interact" ||
    rawType === "moderation" ||
    rawType === "live_state" ||
    rawType === "recall"
  ) {
    return <CompactEventStrip locale={locale} message={message} />;
  }

  if (rawType === "superchat") {
    const superchatAmount = Math.max(message.superchat_price ?? 0, 0);
    const superchatAmountLabel =
      superchatAmount > 0 ? `¥${superchatAmount}` : t(locale, "ui.danmu.superchat.amount_fallback");
    const cardToneClass =
      superchatAmount >= 100
        ? "border-amber-300/30 bg-[linear-gradient(145deg,rgba(251,191,36,0.16),rgba(180,83,9,0.12))]"
        : "border-sky-300/30 bg-[linear-gradient(145deg,rgba(56,189,248,0.16),rgba(14,116,144,0.12))]";
    const badgeToneClass =
      superchatAmount >= 100
        ? "border-amber-300/35 bg-amber-500/15 text-amber-100"
        : "border-sky-300/35 bg-sky-500/15 text-sky-100";

    return (
      <div className="mt-4 flex max-w-[84%] items-start gap-3 self-start transition-all duration-300">
        <DanmuAvatar
          sender={localizedSender}
          avatarUrl={resolvedSenderFace}
          className="mt-0.5 h-8 w-8 shrink-0"
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-black ${senderNameClass}`} style={senderNameStyle}>
              {localizedSender}
            </span>
            {senderBadge ? (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wider ${senderBadge.className}`}
              >
                {senderBadge.icon}
                <span>{senderBadge.text}</span>
              </span>
            ) : null}
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${badgeToneClass}`}
            >
              {t(locale, "ui.danmu.badge.superchat")}
            </span>
            <span className="text-[9px] font-mono text-gray-500">{message.time}</span>
          </div>
          <div
            className={`mt-1.5 min-w-0 rounded-[22px] rounded-tl-none border px-4 py-3 text-gray-100 shadow-[0_10px_24px_rgba(0,0,0,0.2)] ${cardToneClass}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">
                {resolveBackendMessage(
                  message.gift_name || t(locale, "ui.danmu.superchat.default_title"),
                  locale,
                )}
              </p>
              <span className="shrink-0 rounded-full border border-white/15 bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white">
                {superchatAmountLabel}
              </span>
            </div>
            <DanmuBubbleContent
              message={message}
              locale={locale}
              emoticonHeight={22}
              className="select-text break-all text-[13px] leading-[1.45] text-gray-100"
            />
            {message.superchat_message_jpn ? (
              <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[11px] text-gray-200">
                {resolveBackendMessage(message.superchat_message_jpn, locale)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (rawType === "gift") {
    const giftName = resolveBackendMessage(message.gift_name || message.content, locale);
    const giftCount = Math.max(message.gift_count ?? 1, 1);
    const giftAmountLabel = resolveGiftAmountLabel(message, locale);

    return (
      <div className="mt-4 flex items-start gap-3 max-w-[82%] self-start transition-all duration-300">
        <DanmuAvatar
          sender={localizedSender}
          avatarUrl={resolvedSenderFace}
          className="mt-0.5 h-8 w-8 shrink-0"
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-black ${senderNameClass}`} style={senderNameStyle}>
              {localizedSender}
            </span>
            {senderBadge ? (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wider ${senderBadge.className}`}
              >
                {senderBadge.icon}
                <span>{senderBadge.text}</span>
              </span>
            ) : null}
            <span className="flex items-center rounded bg-bili-pink/15 border border-bili-pink/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-bili-pink tracking-wider">
              {t(locale, "ui.danmu.badge.gift")}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">{message.time}</span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 rounded-[22px] rounded-tl-none border border-bili-pink/20 bg-[linear-gradient(145deg,rgba(255,102,153,0.14),rgba(255,102,153,0.05))] px-4 py-3 text-gray-100 shadow-[0_10px_24px_rgba(255,102,153,0.08)]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{giftName}</p>
              <p className="mt-1 text-xs text-gray-300">x{giftCount}</p>
            </div>
            <div className="shrink-0 rounded-full border border-bili-pink/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-bili-pink">
              {giftAmountLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (rawType === "guard") {
    const guardName = resolveBackendMessage(message.gift_name || message.content, locale);
    const guardCount = Math.max(message.gift_count ?? 1, 1);
    const guardAmountLabel = resolveGiftAmountLabel(message, locale);

    return (
      <div className="mt-4 flex items-start gap-3 max-w-[82%] self-start transition-all duration-300">
        <DanmuAvatar
          sender={localizedSender}
          avatarUrl={resolvedSenderFace}
          className="mt-0.5 h-8 w-8 shrink-0"
        />
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-black ${senderNameClass}`} style={senderNameStyle}>
              {localizedSender}
            </span>
            {senderBadge ? (
              <span
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-black tracking-wider ${senderBadge.className}`}
              >
                {senderBadge.icon}
                <span>{senderBadge.text}</span>
              </span>
            ) : null}
            <span className="flex items-center rounded bg-[#8b5cf6]/15 border border-[#8b5cf6]/25 px-1.5 py-0.5 text-[8px] font-black uppercase text-violet-400 tracking-wider">
              {t(locale, "ui.danmu.badge.guard")}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">{message.time}</span>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 rounded-[22px] rounded-tl-none border border-violet-400/20 bg-[linear-gradient(145deg,rgba(139,92,246,0.16),rgba(139,92,246,0.05))] px-4 py-3 text-gray-100 shadow-[0_10px_24px_rgba(139,92,246,0.08)]">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{guardName}</p>
              <p className="mt-1 text-xs text-gray-300">x{guardCount}</p>
            </div>
            <div className="shrink-0 rounded-full border border-violet-400/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
              {guardAmountLabel}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (rawType !== "danmu") {
    return (
      <CompactEventStrip
        locale={locale}
        message={{ ...message, content: localizedContent || rawType }}
      />
    );
  }

  if (isMe) {
    return (
      <div className={`flex flex-col items-end max-w-[78%] self-end transition-all duration-300 ${stackGapClass}`}>
        {showSenderMeta ? (
          <DanmuSenderMeta
            align="right"
            sender={localizedSender}
            senderNameClass={meNameClass}
            senderNameStyle={senderNameStyle}
            senderBadge={senderBadge}
            time={message.time}
          />
        ) : null}
        <DanmuBubbleContent
          message={message}
          locale={locale}
          className={`${bubbleShapeClass} bg-[linear-gradient(135deg,rgba(0,174,236,0.96),rgba(0,144,214,0.92))] px-4 py-2.5 text-[13px] leading-[1.45] text-white shadow-[0_10px_24px_rgba(0,174,236,0.14)] select-text break-all border border-bili-blue/18`}
        />
      </div>
    );
  }

  return (
    <div className={`flex items-end space-x-2.5 max-w-[82%] self-start transition-all duration-300 ${stackGapClass}`}>
      {showSenderMeta ? (
        <DanmuAvatar
          sender={localizedSender}
          avatarUrl={resolvedSenderFace}
          className="mt-0.5 h-8 w-8 shrink-0"
        />
      ) : (
        <div className="h-8 w-8 shrink-0" />
      )}
      <div className="flex flex-col items-start">
        {showSenderMeta ? (
          <DanmuSenderMeta
            align="left"
            sender={localizedSender}
            senderNameClass={senderNameClass}
            senderNameStyle={senderNameStyle}
            senderBadge={senderBadge}
            time={message.time}
          />
        ) : null}
        <DanmuBubbleContent
          message={message}
          locale={locale}
          className={`${bubbleShapeClass} bg-[rgba(20,26,36,0.92)] border border-white/6 px-4 py-2.5 text-[13px] leading-[1.45] text-gray-100 shadow-[0_10px_24px_rgba(0,0,0,0.14)] select-text break-all hover:bg-[rgba(24,31,43,0.96)] hover:border-white/10 transition-all duration-150`}
        />
      </div>
    </div>
  );
}
