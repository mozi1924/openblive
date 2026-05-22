import { useEffect, useState } from "react";
import { Ban, RefreshCw, ShieldX, X } from "lucide-react";
import type { LiveSilentUserItem } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type LiveUserManagePanelProps = {
  locale: LocaleSetting;
  activeTab: "silent";
  onChangeTab: (tab: "silent") => void;
  silentListLoading: boolean;
  silentList: LiveSilentUserItem[];
  silentTotal: number;
  onRefreshSilentList: () => Promise<void>;
  onRequestRemoveSilentUser: (item: LiveSilentUserItem) => Promise<void>;
  onClose: () => void;
};

function SilentUserAvatar({ face, name }: { face: string; name: string }) {
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

export function LiveUserManagePanel({
  locale,
  activeTab,
  onChangeTab,
  silentListLoading,
  silentList,
  silentTotal,
  onRefreshSilentList,
  onRequestRemoveSilentUser,
  onClose,
}: LiveUserManagePanelProps) {
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
        className="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018] shadow-[0_24px_80px_rgba(0,0,0,0.5)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-white">{t(locale, "ui.danmu.user_manage.panel_title")}</p>
            <p className="mt-1 text-[10px] text-gray-500">{t(locale, "ui.danmu.user_manage.panel_desc")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-[10px] font-mono text-rose-200">
              {tf(locale, "ui.danmu.user_manage.silent_count", { count: silentTotal })}
            </span>
            <button
              type="button"
              onClick={() => void onRefreshSilentList()}
              disabled={silentListLoading}
              className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${silentListLoading ? "animate-spin" : ""}`} />
              {t(locale, "ui.danmu.user_manage.refresh")}
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

        <div className="border-b border-white/8 px-5 py-3">
          <button
            type="button"
            onClick={() => onChangeTab("silent")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              activeTab === "silent"
                ? "border-rose-300/28 bg-rose-500/18 text-rose-100"
                : "border-white/8 bg-white/5 text-gray-300 hover:border-white/15 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Ban className="h-3.5 w-3.5" />
            <span>{t(locale, "ui.danmu.user_manage.tab.silent")}</span>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-5 app-scrollbar">
          <div className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
            <span>{t(locale, "ui.danmu.user_manage.silent.rank")}</span>
            <span>{t(locale, "ui.danmu.online_rank.avatar")}</span>
            <span>{t(locale, "ui.danmu.online_rank.username")}</span>
            <span>{t(locale, "ui.danmu.user_manage.silent.time")}</span>
            <span>{t(locale, "ui.danmu.user_manage.silent.action")}</span>
          </div>

          {silentListLoading ? (
            <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
              {t(locale, "ui.danmu.user_manage.silent.loading")}
            </div>
          ) : silentList.length === 0 ? (
            <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
              {t(locale, "ui.danmu.user_manage.silent.empty")}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {silentList.map((item, index) => {
                const userName = item.tname.trim() || t(locale, "ui.danmu.sender.anonymous");
                return (
                  <div
                    key={`${item.id}-${item.tuid}-${index}`}
                    className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-[#070b11]/70 px-3 py-2"
                  >
                    <span className="text-sm font-semibold text-white">#{index + 1}</span>
                    <SilentUserAvatar face={item.face} name={userName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm text-gray-100">{userName}</p>
                      <p className="truncate text-[10px] text-gray-500">UID: {item.tuid}</p>
                    </div>
                    <p className="truncate text-xs text-gray-300">{item.ctime || "-"}</p>
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => void onRequestRemoveSilentUser(item)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 transition-all hover:bg-emerald-500/18"
                      >
                        <ShieldX className="h-3.5 w-3.5" />
                        <span>{t(locale, "ui.danmu.user_manage.silent.unmute")}</span>
                      </button>
                    </div>
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
