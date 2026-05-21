import type { CSSProperties, ReactNode } from "react";
import type { DanmuMsg, User } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { resolveBackendMessage, t } from "../../utils/i18n";

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

const pickColorBySender = (sender: string) => {
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
};

const renderInlineSegments = (message: DanmuMsg, locale: LocaleSetting, emoticonHeight = 18) => {
  if (!message.segments?.length) {
    return resolveBackendMessage(message.content, locale);
  }

  return message.segments.map((segment, index) =>
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
        className="mx-0.5 inline-block select-none object-contain align-[-0.3rem]"
        style={resolveEmoticonStyle(
          segment.emoticon.width,
          segment.emoticon.height,
          emoticonHeight,
        )}
      />
    ),
  );
};

const resolveOverlayContent = (message: DanmuMsg, locale: LocaleSetting): ReactNode => {
  const content = resolveBackendMessage(message.content, locale).trim();

  switch (message.type) {
    case "danmu":
      return renderInlineSegments(message, locale);
    case "gift": {
      const giftName = resolveBackendMessage(message.gift_name || message.content, locale).trim();
      const giftCount = Math.max(message.gift_count ?? 1, 1);
      return `[${t(locale, "ui.danmu.badge.gift")}] ${giftName}${giftCount > 1 ? ` x${giftCount}` : ""}`;
    }
    case "guard": {
      const guardName = resolveBackendMessage(message.gift_name || message.content, locale).trim();
      const guardCount = Math.max(message.gift_count ?? 1, 1);
      return `[${t(locale, "ui.danmu.badge.guard")}] ${guardName}${guardCount > 1 ? ` x${guardCount}` : ""}`;
    }
    case "superchat": {
      const price = Math.max(message.superchat_price ?? 0, 0);
      const amount = price > 0 ? `¥${price}` : t(locale, "ui.danmu.superchat.amount_fallback");
      return `[${t(locale, "ui.danmu.badge.superchat")} ${amount}] ${content || t(locale, "ui.danmu.superchat.default_title")}`;
    }
    default:
      return content || message.type.toUpperCase();
  }
};

const isEventStyleMessage = (message: DanmuMsg) => {
  const rawType = String(message.type ?? "");
  return (
    rawType === "system" ||
    rawType === "interact" ||
    rawType === "moderation" ||
    rawType === "live_state" ||
    rawType === "recall"
  );
};

const resolveSenderTone = (
  message: DanmuMsg,
  currentUser: User | null,
  locale: LocaleSetting,
  localizedSender: string,
): { className: string; style?: CSSProperties } => {
  const isMe = isSelfMessage(message, currentUser, locale);
  const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
  const currentUid = currentUser?.uid ? Number(currentUser.uid) : Number.NaN;
  const isAnchor =
    Number.isFinite(senderUid) && Number.isFinite(currentUid) && senderUid === currentUid;
  const isAdmin = message.sender_role === "admin";
  const isGuard = message.sender_role === "guard" || (message.sender_guard_level ?? 0) > 0;

  if (isAnchor) {
    return { className: "text-amber-300" };
  }
  if (isAdmin) {
    return { className: "text-cyan-300" };
  }
  if (isGuard) {
    return { className: "text-violet-300" };
  }
  if (isMe) {
    return { className: "text-bili-blue" };
  }
  if (message.sender_name_color) {
    return {
      className: pickColorBySender(localizedSender),
      style: { color: message.sender_name_color },
    };
  }
  return { className: pickColorBySender(localizedSender) };
};

export function DanmuOverlayMessageRow({
  message,
  currentUser,
  locale,
}: {
  message: DanmuMsg;
  currentUser: User | null;
  locale: LocaleSetting;
}) {
  const localizedSender = resolveBackendMessage(message.sender, locale).trim();
  const content = resolveOverlayContent(message, locale);
  const senderTone = resolveSenderTone(message, currentUser, locale, localizedSender);
  const hasSender = localizedSender.length > 0 && !isEventStyleMessage(message);

  return (
    <div className="rounded-xl px-2.5 py-1.5 text-[12px] leading-5 text-gray-100 transition-colors hover:bg-white/[0.04]">
      {hasSender ? (
        <span className={`font-black tracking-[0.01em] ${senderTone.className}`} style={senderTone.style}>
          {localizedSender}:
        </span>
      ) : null}
      {hasSender ? " " : null}
      <span className="text-gray-100">{content}</span>
    </div>
  );
}
