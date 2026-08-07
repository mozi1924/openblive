import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  BarChart3,
  Send,
  Shield,
  SmilePlus,
  Terminal,
  UserX,
} from "lucide-react";
import { DanmuCard, isSelfMessage, resolveEmoticonStyle } from "./DanmuMessageCard";
import type {
  AppConfig,
  DanmuMsg,
  LiveEmoticonPackage,
  LiveVoteInfo,
  LiveVotePanelData,
  User,
} from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";
import { shouldFilterDanmuMessage } from "../../utils/danmu";
import { LiveVotePanel } from "./LiveVotePanel";

type DanmuTabProps = {
  locale: LocaleSetting;
  appConfig?: AppConfig | null;
  currentUser: User | null;

  danmuEndRef: React.RefObject<HTMLDivElement | null>;
  danmuText: string;
  danmus: DanmuMsg[];
  liveEmoticonPackages: LiveEmoticonPackage[];
  liveEmoticonsLoading: boolean;
  liveVotePanel: LiveVotePanelData | null;
  liveVoteHistory: LiveVoteInfo[];
  liveVoteLoading: boolean;
  liveVoteSubmitting: boolean;
  liveVoteTerminating: boolean;
  liveVoteQuestion: string;
  liveVoteOptionA: string;
  liveVoteOptionB: string;
  liveVoteDuration: number;
  liveVoteSelectedTemplateId: number | null;
  silentUserIds: number[];
  blackUserIds: number[];
  roomAdminUserIds: number[];
  onChangeDanmuText: React.Dispatch<React.SetStateAction<string>>;
  onRefreshLiveVoteData: () => Promise<void>;
  onApplyLiveVoteTemplate: (templateId: number) => void;
  onClearLiveVoteDraft: () => void;
  onChangeLiveVoteQuestion: (value: string) => void;
  onChangeLiveVoteOptionA: (value: string) => void;
  onChangeLiveVoteOptionB: (value: string) => void;
  onChangeLiveVoteDuration: React.Dispatch<React.SetStateAction<number>>;
  onCreateLiveVote: () => Promise<void>;
  onTerminateLiveVote: (interactionId: number) => Promise<void>;
  onSendDanmu: (event: React.FormEvent) => Promise<void>;
  onRequestMuteUser: (message: DanmuMsg) => Promise<void>;
  onRequestBlackUser: (message: DanmuMsg) => Promise<void>;
  onRequestRoomAdmin: (message: DanmuMsg) => Promise<void>;
  onRequestUnroomAdmin: (message: DanmuMsg) => Promise<void>;
};

export function DanmuTab({
  locale,
  appConfig,
  currentUser,
  danmuEndRef,
  danmuText,
  danmus,
  liveEmoticonPackages,
  liveEmoticonsLoading,
  liveVotePanel,
  liveVoteHistory,
  liveVoteLoading,
  liveVoteSubmitting,
  liveVoteTerminating,
  liveVoteQuestion,
  liveVoteOptionA,
  liveVoteOptionB,
  liveVoteDuration,
  liveVoteSelectedTemplateId,
  silentUserIds,
  blackUserIds,
  roomAdminUserIds,
  onChangeDanmuText,
  onRefreshLiveVoteData,
  onApplyLiveVoteTemplate,
  onClearLiveVoteDraft,
  onChangeLiveVoteQuestion,
  onChangeLiveVoteOptionA,
  onChangeLiveVoteOptionB,
  onChangeLiveVoteDuration,
  onCreateLiveVote,
  onTerminateLiveVote,
  onSendDanmu,
  onRequestMuteUser,
  onRequestBlackUser,
  onRequestRoomAdmin,
  onRequestUnroomAdmin,
}: DanmuTabProps) {
  const [openPanel, setOpenPanel] = useState<"emoticon" | "vote" | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    message: DanmuMsg;
  } | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const floatingPanelRef = useRef<HTMLDivElement>(null);
  const hasEmoticons = useMemo(
    () => liveEmoticonPackages.some((pkg) => pkg.emoticons.length > 0),
    [liveEmoticonPackages],
  );
  const silentUidSet = useMemo(() => new Set(silentUserIds), [silentUserIds]);
  const blackUidSet = useMemo(() => new Set(blackUserIds), [blackUserIds]);
  const roomAdminUidSet = useMemo(() => new Set(roomAdminUserIds), [roomAdminUserIds]);
  type DanmuGroupItem = {
    id: string;
    messages: DanmuMsg[];
  };

  const hasSameRenderMeta = (left: DanmuMsg, right: DanmuMsg) =>
    (left.sender_role || "viewer") === (right.sender_role || "viewer") &&
    (left.sender_guard_level ?? 0) === (right.sender_guard_level ?? 0) &&
    (left.sender_name_color || "") === (right.sender_name_color || "");

  const visibleDanmus = useMemo(
    () => danmus.filter((msg) => !shouldFilterDanmuMessage(msg, appConfig ?? null)),
    [danmus, appConfig],
  );

  const groupedDanmus = useMemo<DanmuGroupItem[]>(() => {
    const result: DanmuGroupItem[] = [];
    let currentGroup: DanmuGroupItem | null = null;

    // Build the groups chronologically (oldest to newest)
    for (let i = visibleDanmus.length - 1; i >= 0; i--) {
      const msg = visibleDanmus[i];
      const rawType = String(msg.type ?? "");


      const isEvent = (
        rawType === "system" ||
        rawType === "interact" ||
        rawType === "moderation" ||
        rawType === "live_state" ||
        rawType === "recall"
      );
      const isSpecial = (
        rawType === "superchat" ||
        rawType === "gift" ||
        rawType === "guard"
      );

      if (isEvent || isSpecial) {
        currentGroup = null;
        result.push({
          id: msg.id,
          messages: [msg],
        });
        continue;
      }

      // Standard chat message
      const isMe = isSelfMessage(msg, currentUser, locale);
      const groupIsMe = currentGroup && isSelfMessage(currentGroup.messages[0], currentUser, locale);
      
      const sameSender = currentGroup && (
        typeof currentGroup.messages[0].sender_uid === "number" && typeof msg.sender_uid === "number"
          ? currentGroup.messages[0].sender_uid === msg.sender_uid
          : currentGroup.messages[0].sender === msg.sender
      );
      const sameRenderMeta = currentGroup && hasSameRenderMeta(currentGroup.messages[0], msg);

      if (currentGroup && groupIsMe === isMe && sameSender && sameRenderMeta) {
        currentGroup.messages.push(msg);
      } else {
        currentGroup = {
          id: msg.id,
          messages: [msg],
        };
        result.push(currentGroup);
      }
    }

    return result.reverse().slice(0, 100);
  }, [danmus, currentUser, locale]);

  useEffect(() => {
    if (!openPanel) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (floatingPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      if (composerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpenPanel(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const onPointerDown = () => setContextMenu(null);
    const onScroll = () => setContextMenu(null);
    const onResize = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

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

  const handleBubbleContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
    message: DanmuMsg,
  ) => {
    const rawType = String(message.type ?? "");
    if (rawType !== "danmu") {
      return;
    }
    const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
    if (!Number.isFinite(senderUid) || senderUid <= 0 || isSelfMessage(message, currentUser, locale)) {
      return;
    }
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      message,
    });
  };

  return (
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-[#070a0f]">
      <div className="flex-1 overflow-y-auto p-6 app-scrollbar flex flex-col-reverse bg-[#06080d]/40" style={{ contain: "content" }}>
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
          groupedDanmus.map((item) => (
            <DanmuCard
              key={item.id}
              messages={item.messages}
              locale={locale}
              currentUser={currentUser}
              onBubbleContextMenu={handleBubbleContextMenu}
            />
          ))
        )}
      </div>
      {contextMenu ? (
        <div
          className="fixed z-50 min-w-[9rem] rounded-xl border border-white/12 bg-[#0a0f17]/95 p-1.5 shadow-[0_14px_36px_rgba(0,0,0,0.5)] backdrop-blur-md"
          style={{ top: contextMenu.y + 6, left: contextMenu.x + 6 }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {(() => {
            const senderUid =
              typeof contextMenu.message.sender_uid === "number"
                ? contextMenu.message.sender_uid
                : Number.NaN;
            const isMuted = Number.isFinite(senderUid) ? silentUidSet.has(senderUid) : false;
            const isBlocked = Number.isFinite(senderUid) ? blackUidSet.has(senderUid) : false;
            const isRoomAdminByRole = contextMenu.message.sender_role === "admin";
            const isRoomAdminByList = Number.isFinite(senderUid)
              ? roomAdminUidSet.has(senderUid)
              : false;
            const isRoomAdmin = isRoomAdminByRole || isRoomAdminByList;

            return (
              <>
          <button
            type="button"
            disabled={isMuted}
            onClick={() => {
              if (isMuted) {
                return;
              }
              const target = contextMenu.message;
              setContextMenu(null);
              void onRequestMuteUser(target);
            }}
            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all ${
              isMuted
                ? "cursor-not-allowed text-gray-500"
                : "text-rose-200 hover:bg-rose-500/14"
            }`}
          >
            <Ban className="h-3.5 w-3.5" />
            <span>{t(locale, "ui.danmu.user_manage.context.silent")}</span>
          </button>
          <button
            type="button"
            disabled={isBlocked}
            onClick={() => {
              if (isBlocked) {
                return;
              }
              const target = contextMenu.message;
              setContextMenu(null);
              void onRequestBlackUser(target);
            }}
            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all ${
              isBlocked
                ? "cursor-not-allowed text-gray-500"
                : "text-amber-100 hover:bg-amber-500/14"
            }`}
          >
            <UserX className="h-3.5 w-3.5" />
            <span>{t(locale, "ui.danmu.user_manage.context.blacklist")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const target = contextMenu.message;
              setContextMenu(null);
              if (isRoomAdmin) {
                void onRequestUnroomAdmin(target);
                return;
              }
              void onRequestRoomAdmin(target);
            }}
            className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-all ${
              isRoomAdmin
                ? "text-emerald-100 hover:bg-emerald-500/14"
                : "text-cyan-100 hover:bg-cyan-500/14"
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>
              {isRoomAdmin
                ? t(locale, "ui.danmu.user_manage.context.unroom_admin")
                : t(locale, "ui.danmu.user_manage.context.room_admin")}
            </span>
          </button>
              </>
            );
          })()}
        </div>
      ) : null}

      <div className="border-t border-white/5 bg-[#090d16]/80 p-4">
        <div ref={composerRef} className="relative">
          {openPanel === "emoticon" && (
            <div
              ref={floatingPanelRef}
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

              <div className="max-h-[24rem] overflow-y-auto px-4 py-4 app-scrollbar">
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

          {openPanel === "vote" ? (
            <LiveVotePanel
              locale={locale}
              panelRef={floatingPanelRef}
              liveVotePanel={liveVotePanel}
              liveVoteHistory={liveVoteHistory}
              liveVoteLoading={liveVoteLoading}
              liveVoteSubmitting={liveVoteSubmitting}
              liveVoteTerminating={liveVoteTerminating}
              liveVoteQuestion={liveVoteQuestion}
              liveVoteOptionA={liveVoteOptionA}
              liveVoteOptionB={liveVoteOptionB}
              liveVoteDuration={liveVoteDuration}
              liveVoteSelectedTemplateId={liveVoteSelectedTemplateId}
              onRefreshLiveVoteData={onRefreshLiveVoteData}
              onApplyLiveVoteTemplate={onApplyLiveVoteTemplate}
              onClearLiveVoteDraft={onClearLiveVoteDraft}
              onChangeLiveVoteQuestion={onChangeLiveVoteQuestion}
              onChangeLiveVoteOptionA={onChangeLiveVoteOptionA}
              onChangeLiveVoteOptionB={onChangeLiveVoteOptionB}
              onChangeLiveVoteDuration={onChangeLiveVoteDuration}
              onCreateLiveVote={onCreateLiveVote}
              onTerminateLiveVote={onTerminateLiveVote}
            />
          ) : null}

          <form
            onSubmit={(event) => {
              setOpenPanel(null);
              void onSendDanmu(event);
            }}
          >
            <div className="flex items-center space-x-2 rounded-2xl border border-white/8 bg-[#06080d] p-2 focus-within:border-bili-blue/40 focus-within:bg-[#090c15] transition-all duration-200">
              <textarea
                ref={textareaRef}
                value={danmuText}
                onChange={(event) => onChangeDanmuText(event.target.value)}
                placeholder={t(locale, "ui.danmu.placeholder")}
                rows={1}
                className="selectable-text flex-1 resize-none bg-transparent px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none max-h-24 app-scrollbar"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && openPanel) {
                    event.preventDefault();
                    setOpenPanel(null);
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
                onClick={() => setOpenPanel((prev) => (prev === "emoticon" ? null : "emoticon"))}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                  openPanel === "emoticon"
                    ? "border-bili-blue/40 bg-bili-blue/15 text-bili-blue"
                    : "border-white/5 bg-white/3 text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
                title={t(locale, "ui.danmu.emoticon.toggle")}
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setOpenPanel((prev) => (prev === "vote" ? null : "vote"))}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-all ${
                  openPanel === "vote"
                    ? "border-bili-blue/40 bg-bili-blue/15 text-bili-blue"
                    : "border-white/5 bg-white/3 text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
                title={t(locale, "ui.danmu.vote.toggle")}
              >
                <BarChart3 className="h-4 w-4" />
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
          </form>
        </div>
        <p className="mt-2 px-3 text-[10px] text-gray-500 leading-normal">
          {t(locale, "ui.danmu.fast_desc")}
        </p>
      </div>
    </div>
  );
}
