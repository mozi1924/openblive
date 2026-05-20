import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeDollarSign,
  Bell,
  CircleSlash,
  Heart,
  MessageSquare,
  Share2,
  Shield,
  Terminal,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { DanmuMsg } from "../../types/studio";
import { resolveBackendMessage, t, type LocaleSetting } from "../../utils/i18n";

type CompactEventMeta = {
  labelKey: string;
  icon: LucideIcon;
  className: string;
};

const resolveCompactEventMeta = (message: DanmuMsg): CompactEventMeta => {
  if (message.type === "moderation") {
    if (message.cmd === "WARNING") {
      return {
        labelKey: "ui.danmu.event.badge.warning",
        icon: AlertTriangle,
        className: "border-rose-400/28 bg-rose-500/12 text-rose-100",
      };
    }
    if (message.cmd === "ROOM_BLOCK_MSG") {
      return {
        labelKey: "ui.danmu.event.badge.block",
        icon: CircleSlash,
        className: "border-orange-400/28 bg-orange-500/12 text-orange-100",
      };
    }
    if (message.cmd === "CUT_OFF" || message.cmd === "CUT_OFF_V2") {
      return {
        labelKey: "ui.danmu.event.badge.cut_off",
        icon: AlertTriangle,
        className: "border-rose-400/28 bg-rose-500/12 text-rose-100",
      };
    }
    if (message.cmd === "ROOM_SILENT_ON" || message.cmd === "ROOM_SILENT_OFF") {
      return {
        labelKey: "ui.danmu.event.badge.silent",
        icon: CircleSlash,
        className: "border-yellow-400/28 bg-yellow-500/12 text-yellow-100",
      };
    }
    if (message.cmd === "SUPER_CHAT_MESSAGE_DELETE") {
      return {
        labelKey: "ui.danmu.event.badge.sc_delete",
        icon: BadgeDollarSign,
        className: "border-amber-400/28 bg-amber-500/12 text-amber-100",
      };
    }
    return {
      labelKey: "ui.danmu.event.badge.mod",
      icon: Shield,
      className: "border-orange-400/28 bg-orange-500/12 text-orange-100",
    };
  }

  if (message.type === "interact") {
    if (message.cmd === "ENTRY_EFFECT" || message.cmd === "ENTRY_EFFECT_MUST_RECEIVE") {
      return {
        labelKey: "ui.danmu.event.badge.entry_fx",
        icon: UserPlus,
        className: "border-indigo-400/28 bg-indigo-500/12 text-indigo-100",
      };
    }
    if (message.interact_type === "follow") {
      return {
        labelKey: "ui.danmu.event.badge.follow",
        icon: Heart,
        className: "border-fuchsia-400/28 bg-fuchsia-500/12 text-fuchsia-100",
      };
    }
    if (message.interact_type === "share") {
      return {
        labelKey: "ui.danmu.event.badge.share",
        icon: Share2,
        className: "border-cyan-400/28 bg-cyan-500/12 text-cyan-100",
      };
    }
    return {
      labelKey: "ui.danmu.event.badge.enter",
      icon: UserPlus,
      className: "border-emerald-400/28 bg-emerald-500/12 text-emerald-100",
    };
  }

  if (message.type === "live_state") {
    if (message.cmd === "ROOM_CHANGE") {
      return {
        labelKey: "ui.danmu.event.badge.room",
        icon: MessageSquare,
        className: "border-teal-400/28 bg-teal-500/12 text-teal-100",
      };
    }
    if (message.cmd === "GUARD_HONOR_THOUSAND") {
      return {
        labelKey: "ui.danmu.event.badge.thousand",
        icon: Shield,
        className: "border-lime-400/28 bg-lime-500/12 text-lime-100",
      };
    }
    return {
      labelKey:
        message.cmd === "LIVE"
          ? "ui.danmu.event.badge.live"
          : "ui.danmu.event.badge.prep",
      icon: Bell,
      className: "border-sky-400/28 bg-sky-500/12 text-sky-100",
    };
  }

  if (message.type === "recall") {
    return {
      labelKey: "ui.danmu.event.badge.recall",
      icon: Trash2,
      className: "border-gray-300/28 bg-gray-500/10 text-gray-200",
    };
  }

  return {
    labelKey: "ui.danmu.event.badge.system",
    icon: Terminal,
    className: "border-white/15 bg-white/5 text-gray-200",
  };
};

export function CompactEventStrip({
  locale,
  message,
}: {
  locale: LocaleSetting;
  message: DanmuMsg;
}) {
  const meta = resolveCompactEventMeta(message);
  const Icon = meta.icon;
  const content = resolveBackendMessage(message.content, locale);

  return (
    <div className="mt-2.5 flex w-full justify-center">
      <div
        className={`inline-flex max-w-[92%] items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] leading-none shadow-[0_8px_18px_rgba(0,0,0,0.2)] ${meta.className}`}
      >
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black/25 px-1.5 py-0.5 text-[8px] font-black tracking-[0.14em]">
          <Icon className="h-3.5 w-3.5" />
          <span>{t(locale, meta.labelKey)}</span>
        </span>
        <span className="truncate text-[11px] font-medium text-gray-100">{content}</span>
        <span className="font-mono text-[9px] text-gray-300/90">{message.time}</span>
      </div>
    </div>
  );
}
