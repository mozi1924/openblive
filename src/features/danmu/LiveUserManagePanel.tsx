import { useEffect } from "react";
import { Ban, RefreshCw, Shield, ShieldX, UserX, X } from "lucide-react";
import type { LiveBlackUserItem, LiveRoomAdminItem, LiveSilentUserItem } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";
import { LiveUserAvatar } from "./LiveUserAvatar";

type LiveUserManagePanelProps = {
  locale: LocaleSetting;
  activeTab: "silent" | "blacklist" | "room_admin";
  onChangeTab: (tab: "silent" | "blacklist" | "room_admin") => void;
  silentListLoading: boolean;
  silentList: LiveSilentUserItem[];
  silentTotal: number;
  silentPage: number;
  silentPageSize: number;
  silentTotalPage: number;
  onRefreshSilentList: () => Promise<void>;
  onChangeSilentPage: (page: number) => void;
  onRequestRemoveSilentUser: (item: LiveSilentUserItem) => Promise<void>;
  blackListLoading: boolean;
  blackList: LiveBlackUserItem[];
  blackTotal: number;
  blackPage: number;
  blackPageSize: number;
  blackTotalPage: number;
  onRefreshBlackList: () => Promise<void>;
  onChangeBlackPage: (page: number) => void;
  onRequestRemoveBlackUser: (item: LiveBlackUserItem) => Promise<void>;
  roomAdminListLoading: boolean;
  roomAdminList: LiveRoomAdminItem[];
  roomAdminTotal: number;
  roomAdminPage: number;
  roomAdminPageSize: number;
  roomAdminTotalPage: number;
  onRefreshRoomAdminList: () => Promise<void>;
  onChangeRoomAdminPage: (page: number) => void;
  onRequestRemoveRoomAdmin: (item: LiveRoomAdminItem) => Promise<void>;
  onClose: () => void;
};

export function LiveUserManagePanel({
  locale,
  activeTab,
  onChangeTab,
  silentListLoading,
  silentList,
  silentTotal,
  silentPage,
  silentPageSize,
  silentTotalPage,
  onRefreshSilentList,
  onChangeSilentPage,
  onRequestRemoveSilentUser,
  blackListLoading,
  blackList,
  blackTotal,
  blackPage,
  blackPageSize,
  blackTotalPage,
  onRefreshBlackList,
  onChangeBlackPage,
  onRequestRemoveBlackUser,
  roomAdminListLoading,
  roomAdminList,
  roomAdminTotal,
  roomAdminPage,
  roomAdminPageSize,
  roomAdminTotalPage,
  onRefreshRoomAdminList,
  onChangeRoomAdminPage,
  onRequestRemoveRoomAdmin,
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

  const currentListLoading =
    activeTab === "silent"
      ? silentListLoading
      : activeTab === "blacklist"
        ? blackListLoading
        : roomAdminListLoading;
  const currentTotal =
    activeTab === "silent" ? silentTotal : activeTab === "blacklist" ? blackTotal : roomAdminTotal;
  const refreshCurrentTab = () => {
    if (activeTab === "silent") {
      return onRefreshSilentList();
    }
    if (activeTab === "blacklist") {
      return onRefreshBlackList();
    }
    return onRefreshRoomAdminList();
  };
  const formatBlackMtime = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return "-";
    }
    return new Date(value * 1000).toLocaleString(locale === "en-US" ? "en-US" : "zh-CN", {
      hour12: false,
    });
  };
  const renderPagination = (
    page: number,
    totalPage: number,
    loading: boolean,
    onChange: (nextPage: number) => void,
  ) => {
    if (totalPage <= 1) {
      return null;
    }
    return (
      <div className="mt-4 flex items-center justify-end gap-2 text-xs text-gray-300">
        <button
          type="button"
          disabled={page <= 1 || loading}
          onClick={() => onChange(page - 1)}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 transition-all hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(locale, "ui.danmu.user_manage.page.prev")}
        </button>
        <span className="rounded-lg border border-white/8 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-gray-200">
          {page} / {totalPage}
        </span>
        <button
          type="button"
          disabled={page >= totalPage || loading}
          onClick={() => onChange(page + 1)}
          className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 transition-all hover:border-white/20 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t(locale, "ui.danmu.user_manage.page.next")}
        </button>
      </div>
    );
  };
  const resolveDisplayRank = (page: number, pageSize: number, index: number) => {
    const safePage = Number.isFinite(page) ? Math.max(Math.floor(page), 1) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.max(Math.floor(pageSize), 1) : 1;
    return (safePage - 1) * safePageSize + index + 1;
  };

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
              {activeTab === "silent"
                ? tf(locale, "ui.danmu.user_manage.silent_count", { count: currentTotal })
                : activeTab === "blacklist"
                  ? tf(locale, "ui.danmu.user_manage.black_count", { count: currentTotal })
                  : tf(locale, "ui.danmu.user_manage.room_admin_count", { count: currentTotal })}
            </span>
            <button
              type="button"
              onClick={() => void refreshCurrentTab()}
              disabled={currentListLoading}
              className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${currentListLoading ? "animate-spin" : ""}`} />
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
          <button
            type="button"
            onClick={() => onChangeTab("blacklist")}
            className={`ml-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              activeTab === "blacklist"
                ? "border-amber-300/28 bg-amber-500/16 text-amber-100"
                : "border-white/8 bg-white/5 text-gray-300 hover:border-white/15 hover:bg-white/8 hover:text-white"
            }`}
          >
            <UserX className="h-3.5 w-3.5" />
            <span>{t(locale, "ui.danmu.user_manage.tab.blacklist")}</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab("room_admin")}
            className={`ml-2 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
              activeTab === "room_admin"
                ? "border-cyan-300/28 bg-cyan-500/16 text-cyan-100"
                : "border-white/8 bg-white/5 text-gray-300 hover:border-white/15 hover:bg-white/8 hover:text-white"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>{t(locale, "ui.danmu.user_manage.tab.room_admin")}</span>
          </button>
        </div>

        {activeTab === "silent" ? (
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
                      <span className="text-sm font-semibold text-white">
                        #{resolveDisplayRank(silentPage, silentPageSize, index)}
                      </span>
                      <LiveUserAvatar face={item.face} name={userName} />
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
            {renderPagination(
              silentPage,
              silentTotalPage,
              silentListLoading,
              onChangeSilentPage,
            )}
          </div>
        ) : activeTab === "blacklist" ? (
          <div className="max-h-[60vh] overflow-y-auto p-5 app-scrollbar">
            <div className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <span>{t(locale, "ui.danmu.user_manage.black.rank")}</span>
              <span>{t(locale, "ui.danmu.online_rank.avatar")}</span>
              <span>{t(locale, "ui.danmu.online_rank.username")}</span>
              <span>{t(locale, "ui.danmu.user_manage.black.time")}</span>
              <span>{t(locale, "ui.danmu.user_manage.black.action")}</span>
            </div>

            {blackListLoading ? (
              <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
                {t(locale, "ui.danmu.user_manage.black.loading")}
              </div>
            ) : blackList.length === 0 ? (
              <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
                {t(locale, "ui.danmu.user_manage.black.empty")}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {blackList.map((item, index) => {
                  const userName = item.uname.trim() || t(locale, "ui.danmu.sender.anonymous");
                  return (
                    <div
                      key={`${item.mid}-${index}`}
                      className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-[#070b11]/70 px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-white">
                        #{resolveDisplayRank(blackPage, blackPageSize, index)}
                      </span>
                      <LiveUserAvatar face={item.face} name={userName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-100">{userName}</p>
                        <p className="truncate text-[10px] text-gray-500">UID: {item.mid}</p>
                      </div>
                      <p className="truncate text-xs text-gray-300">{formatBlackMtime(item.mtime)}</p>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void onRequestRemoveBlackUser(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 transition-all hover:bg-emerald-500/18"
                        >
                          <ShieldX className="h-3.5 w-3.5" />
                          <span>{t(locale, "ui.danmu.user_manage.black.unblock")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {renderPagination(blackPage, blackTotalPage, blackListLoading, onChangeBlackPage)}
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto p-5 app-scrollbar">
            <div className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              <span>{t(locale, "ui.danmu.user_manage.room_admin.rank")}</span>
              <span>{t(locale, "ui.danmu.online_rank.avatar")}</span>
              <span>{t(locale, "ui.danmu.online_rank.username")}</span>
              <span>{t(locale, "ui.danmu.user_manage.room_admin.time")}</span>
              <span>{t(locale, "ui.danmu.user_manage.room_admin.action")}</span>
            </div>

            {roomAdminListLoading ? (
              <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
                {t(locale, "ui.danmu.user_manage.room_admin.loading")}
              </div>
            ) : roomAdminList.length === 0 ? (
              <div className="mt-3 flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-12 text-xs text-gray-400">
                {t(locale, "ui.danmu.user_manage.room_admin.empty")}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {roomAdminList.map((item, index) => {
                  const userName = item.uname.trim() || t(locale, "ui.danmu.sender.anonymous");
                  return (
                    <div
                      key={`${item.uid}-${index}`}
                      className="grid grid-cols-[4.5rem_3.75rem_minmax(0,1.1fr)_minmax(0,0.8fr)_7.5rem] items-center gap-2 rounded-xl border border-white/6 bg-[#070b11]/70 px-3 py-2"
                    >
                      <span className="text-sm font-semibold text-white">
                        #{resolveDisplayRank(roomAdminPage, roomAdminPageSize, index)}
                      </span>
                      <LiveUserAvatar face={item.face} name={userName} />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-gray-100">{userName}</p>
                        <p className="truncate text-[10px] text-gray-500">UID: {item.uid}</p>
                      </div>
                      <p className="truncate text-xs text-gray-300">{item.ctime || "-"}</p>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => void onRequestRemoveRoomAdmin(item)}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-200 transition-all hover:bg-emerald-500/18"
                        >
                          <ShieldX className="h-3.5 w-3.5" />
                          <span>{t(locale, "ui.danmu.user_manage.room_admin.remove")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {renderPagination(
              roomAdminPage,
              roomAdminTotalPage,
              roomAdminListLoading,
              onChangeRoomAdminPage,
            )}
          </div>
        )}
      </div>
    </div>
  );
}
