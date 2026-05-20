import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Gift, Radio, Shield } from "lucide-react";
import type { DanmuMsg, User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { resolveBackendMessage, t, tf } from "../../utils/i18n";
import { CompactEventStrip } from "./CompactEventStrip";

export const resolveEmoticonStyle = (width: number, height: number, targetHeight: number) => {
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

export const canMergeDanmu = (
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


function DanmuBubbleContent({
  message,
  locale,
  className,
  emoticonHeight = 24,
  style,
}: {
  message: DanmuMsg;
  locale: LocaleSetting;
  className: string;
  emoticonHeight?: number;
  style?: CSSProperties;
}) {
  if (!message.segments?.length) {
    return <div className={className} style={style}>{resolveBackendMessage(message.content, locale)}</div>;
  }

  return (
    <div className={className} style={style}>
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

function pickBorderColorBySender(sender: string) {
  const palette = [
    "border-red-500/80",
    "border-orange-500/80",
    "border-amber-500/80",
    "border-emerald-500/80",
    "border-teal-500/80",
    "border-blue-500/80",
    "border-indigo-500/80",
    "border-violet-500/80",
    "border-purple-500/80",
    "border-pink-500/80",
  ];
  let hash = 0;
  for (let i = 0; i < sender.length; i++) {
    hash = sender.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

export function DanmuCard({
  message,
  locale,
  currentUser,
  mergeWithAbove: _mergeWithAbove,
  mergeWithBelow: _mergeWithBelow,
  showSenderMeta: _showSenderMeta,
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
  
  // Flatten bubble shapes with clean rounded corners instead of extreme merge logic
  const bubbleShapeClass = isMe ? "rounded-xl rounded-tr-none" : "rounded-xl rounded-tl-none";
  const stackGapClass = "mt-3.5";

  // Determine border accent colors and styles
  let borderInlineStyle: CSSProperties | undefined = undefined;
  let borderClass = "";

  if (isAnchor) {
    borderClass = "border-amber-400";
  } else if (isAdmin) {
    borderClass = "border-cyan-400";
  } else if (isGuard) {
    borderClass = "border-violet-400";
  } else if (message.sender_name_color) {
    borderInlineStyle = { borderColor: message.sender_name_color };
  } else {
    borderClass = pickBorderColorBySender(localizedSender);
  }

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
        ? "border-amber-300/30 bg-amber-500/[0.03]"
        : "border-sky-300/30 bg-sky-500/[0.03]";
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
            className={`mt-1.5 min-w-0 rounded-xl rounded-tl-none border px-4 py-3 text-gray-100 ${cardToneClass}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">
                {resolveBackendMessage(
                  message.gift_name || t(locale, "ui.danmu.superchat.default_title"),
                  locale,
                )}
              </p>
              <span className="shrink-0 rounded-md border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-semibold text-white">
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
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 rounded-xl rounded-tl-none border border-bili-pink/20 bg-bili-pink/[0.03] px-4 py-3 text-gray-100">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{giftName}</p>
              <p className="mt-1 text-xs text-gray-300 font-medium">x{giftCount}</p>
            </div>
            <div className="shrink-0 rounded border border-bili-pink/20 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-bili-pink">
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
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-3 rounded-xl rounded-tl-none border border-violet-400/20 bg-violet-500/[0.03] px-4 py-3 text-gray-100">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{guardName}</p>
              <p className="mt-1 text-xs text-gray-300 font-medium">x{guardCount}</p>
            </div>
            <div className="shrink-0 rounded border border-violet-400/20 bg-black/20 px-2 py-0.5 text-[10px] font-semibold text-violet-200">
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
      <div className={`flex items-start space-x-3 space-x-reverse max-w-[82%] self-end transition-all duration-300 ${stackGapClass}`}>
        <DanmuAvatar
          sender={localizedSender}
          avatarUrl={resolvedSenderFace}
          className="mt-0.5 h-8 w-8 shrink-0"
        />
        <div className="flex flex-col items-end">
          <DanmuSenderMeta
            align="right"
            sender={localizedSender}
            senderNameClass={meNameClass}
            senderNameStyle={senderNameStyle}
            senderBadge={senderBadge}
            time={message.time}
          />
          <DanmuBubbleContent
            message={message}
            locale={locale}
            style={borderInlineStyle}
            className={`${bubbleShapeClass} bg-bili-blue/[0.08] hover:bg-bili-blue/[0.12] text-white border-r-4 ${borderClass || ""} border-t border-l border-b border-white/5 px-4 py-2.5 text-[13px] leading-[1.45] select-text break-all transition-all duration-150`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-start space-x-3 max-w-[82%] self-start transition-all duration-300 ${stackGapClass}`}>
      <DanmuAvatar
        sender={localizedSender}
        avatarUrl={resolvedSenderFace}
        className="mt-0.5 h-8 w-8 shrink-0"
      />
      <div className="flex flex-col items-start">
        <DanmuSenderMeta
          align="left"
          sender={localizedSender}
          senderNameClass={senderNameClass}
          senderNameStyle={senderNameStyle}
          senderBadge={senderBadge}
          time={message.time}
        />
        <DanmuBubbleContent
          message={message}
          locale={locale}
          style={borderInlineStyle}
          className={`${bubbleShapeClass} bg-[rgba(20,26,36,0.5)] border-l-4 ${borderClass || ""} border-t border-r border-b border-white/5 px-4 py-2.5 text-[13px] leading-[1.45] text-gray-100 select-text break-all hover:bg-[rgba(24,31,43,0.7)] hover:border-white/10 transition-all duration-150`}
        />
      </div>
    </div>
  );
}
