import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Send,
  SmilePlus,
  Terminal,
} from "lucide-react";
import { DanmuCard, canMergeDanmu, resolveEmoticonStyle } from "./DanmuMessageCard";
import type {
  DanmuMsg,
  LiveEmoticonPackage,
  LiveVoteInfo,
  LiveVotePanelData,
  User,
} from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t } from "../../utils/i18n";
import { LiveVotePanel } from "./LiveVotePanel";

type DanmuTabProps = {
  locale: LocaleSetting;
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
};

type DanmuRenderState = {
  message: DanmuMsg;
  mergeWithAbove: boolean;
  mergeWithBelow: boolean;
  showSenderMeta: boolean;
};

export function DanmuTab({
  locale,
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
}: DanmuTabProps) {
  const [openPanel, setOpenPanel] = useState<"emoticon" | "vote" | null>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const floatingPanelRef = useRef<HTMLDivElement>(null);
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
          showSenderMeta: true,
        };
      }),
    [currentUser, danmus, locale],
  );

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
    <div className="flex h-full w-full flex-1 flex-col overflow-hidden bg-[#070a0f]">
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
                className="selectable-text flex-1 resize-none bg-transparent px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none max-h-24 scrollbar-thin"
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
