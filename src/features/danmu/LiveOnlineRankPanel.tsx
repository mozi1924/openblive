import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { LiveOnlineRankItem } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type LiveOnlineRankPanelProps = {
  locale: LocaleSetting;
  liveOnlineRankLoading: boolean;
  liveOnlineRankItems: LiveOnlineRankItem[];
  onlineAudienceCount: number;
  onRefresh: () => Promise<void>;
  onClose: () => void;
};

function RankAvatar({ face, name }: { face: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0) || "?";

  return (
    <div className="relative h-9 w-9 overflow-hidden rounded-full border border-white/10 bg-white/5">
      {!failed && face ? (
        <img
          src={face}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-300">
          {initial}
        </div>
      )}
    </div>
  );
}

export function LiveOnlineRankPanel({
  locale,
  liveOnlineRankLoading,
  liveOnlineRankItems,
  onlineAudienceCount,
  onRefresh,
  onClose,
}: LiveOnlineRankPanelProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-start justify-center bg-black/55 px-6 py-16 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">{t(locale, "ui.danmu.online_rank.panel_title")}</p>
            <p className="mt-1 text-[10px] text-gray-500">{t(locale, "ui.danmu.online_rank.panel_desc")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-bili-blue/20 bg-bili-blue/10 px-2 py-1 text-[10px] font-mono text-bili-blue">
              {tf(locale, "ui.danmu.online_rank.online_count", { count: onlineAudienceCount })}
            </span>
            <button
              type="button"
              onClick={() => void onRefresh()}
              disabled={liveOnlineRankLoading}
              className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${liveOnlineRankLoading ? "animate-spin" : ""}`} />
              {t(locale, "ui.danmu.online_rank.refresh")}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/8 bg-white/5 p-1.5 text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white"
              title={t(locale, "ui.log.close")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5 app-scrollbar">
          <div className="grid grid-cols-[5rem_3.75rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            <span>{t(locale, "ui.danmu.online_rank.rank")}</span>
            <span>{t(locale, "ui.danmu.online_rank.avatar")}</span>
            <span>{t(locale, "ui.danmu.online_rank.username")}</span>
          </div>

          {liveOnlineRankLoading ? (
            <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
              {t(locale, "ui.danmu.online_rank.loading")}
            </div>
          ) : liveOnlineRankItems.length === 0 ? (
            <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
              {t(locale, "ui.danmu.online_rank.empty")}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {liveOnlineRankItems.map((item, index) => {
                const rank = item.user_rank > 0 ? item.user_rank : index + 1;
                const name = item.name.trim() || t(locale, "ui.danmu.sender.anonymous");
                return (
                  <div
                    key={`${item.uid}-${rank}-${index}`}
                    className="grid grid-cols-[5rem_3.75rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/6 bg-[#070b11]/70 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-white">#{rank}</span>
                    <RankAvatar face={item.face} name={name} />
                    <p className="truncate text-sm text-gray-100">{name}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
