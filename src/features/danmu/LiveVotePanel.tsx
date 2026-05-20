import { useEffect, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { LiveVoteInfo, LiveVotePanelData } from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";

type LiveVotePanelProps = {
  locale: LocaleSetting;
  panelRef: RefObject<HTMLDivElement | null>;
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
  onRefreshLiveVoteData: () => Promise<void>;
  onApplyLiveVoteTemplate: (templateId: number) => void;
  onClearLiveVoteDraft: () => void;
  onChangeLiveVoteQuestion: (value: string) => void;
  onChangeLiveVoteOptionA: (value: string) => void;
  onChangeLiveVoteOptionB: (value: string) => void;
  onChangeLiveVoteDuration: Dispatch<SetStateAction<number>>;
  onCreateLiveVote: () => Promise<void>;
  onTerminateLiveVote: (interactionId: number) => Promise<void>;
};

const LIVE_VOTE_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const isManageableVoteStatus = (status: number) => status === 1 || status === 4;

const formatVotePercent = (percent: number) => `${Math.round(Math.max(0, percent) * 100)}%`;

const formatRemainingDuration = (durationMs: number, locale: LocaleSetting) => {
  const totalSeconds = Math.max(0, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return locale === "en-US" ? `${minutes}m ${seconds}s` : `${minutes}分 ${seconds}秒`;
};

const resolveVoteStatusLabel = (status: number, locale: LocaleSetting) => {
  if (status === 1) {
    return t(locale, "ui.danmu.vote.status.pending");
  }
  if (status === 2) {
    return t(locale, "ui.danmu.vote.status.rejected");
  }
  if (status === 4) {
    return t(locale, "ui.danmu.vote.status.active");
  }
  if (status === 5) {
    return t(locale, "ui.danmu.vote.status.ended");
  }
  if (status === 6) {
    return t(locale, "ui.danmu.vote.status.stopped");
  }
  return t(locale, "ui.danmu.vote.status.unknown");
};

const resolveVoteStatusClassName = (status: number) => {
  if (status === 1) {
    return "border-amber-500/25 bg-amber-500/10 text-amber-300";
  }
  if (status === 2) {
    return "border-rose-500/25 bg-rose-500/10 text-rose-300";
  }
  if (status === 4) {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-300";
  }
  if (status === 5 || status === 6) {
    return "border-white/10 bg-white/5 text-gray-300";
  }
  return "border-white/10 bg-white/5 text-gray-400";
};

const alignedInputClassName =
  "h-11 w-full rounded-xl border border-white/8 bg-white/3 px-4 text-xs text-white transition-all hover:border-white/15 focus:border-bili-blue/40 focus:bg-white/5 focus:outline-none";

const alignedSelectClassName =
  "h-11 w-full appearance-none rounded-xl border border-white/8 bg-gradient-to-br from-[#0b111c] to-[#090b0f] px-3.5 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none";

export function LiveVotePanel({
  locale,
  panelRef,
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
  onRefreshLiveVoteData,
  onApplyLiveVoteTemplate,
  onClearLiveVoteDraft,
  onChangeLiveVoteQuestion,
  onChangeLiveVoteOptionA,
  onChangeLiveVoteOptionB,
  onChangeLiveVoteDuration,
  onCreateLiveVote,
  onTerminateLiveVote,
}: LiveVotePanelProps) {
  const activeVote = liveVotePanel?.vote_info ?? null;
  const hasActiveVote = isManageableVoteStatus(activeVote?.status ?? 0);
  const [remainingVoteMs, setRemainingVoteMs] = useState<number | null>(null);

  useEffect(() => {
    if (activeVote?.left_duration === undefined || activeVote.left_duration <= 0) {
      setRemainingVoteMs(null);
      return;
    }

    setRemainingVoteMs(activeVote.left_duration);
    const timer = window.setInterval(() => {
      setRemainingVoteMs((prev) => {
        if (prev === null) {
          return null;
        }
        return prev <= 1000 ? 0 : prev - 1000;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeVote?.interaction_id, activeVote?.left_duration]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-[calc(100%+12px)] right-0 z-20 w-[min(34rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">{t(locale, "ui.danmu.vote.panel_title")}</p>
          <p className="text-[10px] text-gray-500">{t(locale, "ui.danmu.vote.panel_desc")}</p>
        </div>
        <button
          type="button"
          onClick={() => void onRefreshLiveVoteData()}
          disabled={liveVoteLoading}
          className="rounded-xl border border-white/8 bg-white/5 px-3 py-1.5 text-[10px] font-semibold text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t(locale, "ui.danmu.vote.refresh")}
        </button>
      </div>

      <div className="max-h-[30rem] overflow-y-auto px-4 py-4 scrollbar-thin">
        {liveVoteLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-xs text-gray-400">
            {t(locale, "ui.danmu.vote.loading")}
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white">
                  {t(locale, "ui.danmu.vote.current_title")}
                </p>
                {activeVote ? (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${resolveVoteStatusClassName(
                      activeVote.status,
                    )}`}
                  >
                    {resolveVoteStatusLabel(activeVote.status, locale)}
                  </span>
                ) : null}
              </div>

              {activeVote ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{activeVote.question}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                      {activeVote.etime_str ? (
                        <span>
                          {t(locale, "ui.danmu.vote.ends_at")}: {activeVote.etime_str}
                        </span>
                      ) : null}
                      {remainingVoteMs !== null && activeVote.status === 4 ? (
                        <span>
                          {t(locale, "ui.danmu.vote.remaining")}:{" "}
                          {formatRemainingDuration(remainingVoteMs, locale)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {activeVote.options.map((option) => (
                      <div key={`${activeVote.interaction_id}-${option.idx}`} className="space-y-1">
                        <div className="flex items-center justify-between gap-3 text-[11px]">
                          <span className="font-medium text-gray-200">{option.desc}</span>
                          <span className="font-mono text-gray-400">
                            {formatVotePercent(option.percent)}
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/6">
                          <div
                            className="h-full rounded-full bg-bili-blue transition-all"
                            style={{ width: formatVotePercent(option.percent) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-gray-500">
                      {activeVote.result_text
                        ? `${t(locale, "ui.danmu.vote.result")}: ${activeVote.result_text}`
                        : `ID: ${activeVote.interaction_id}`}
                    </span>
                    {hasActiveVote ? (
                      <button
                        type="button"
                        onClick={() => void onTerminateLiveVote(activeVote.interaction_id)}
                        disabled={liveVoteTerminating}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[10px] font-semibold text-rose-300 transition-all hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {liveVoteTerminating
                          ? t(locale, "ui.danmu.vote.terminating")
                          : t(locale, "ui.danmu.vote.terminate")}
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-8 text-center text-xs text-gray-400">
                  {t(locale, "ui.danmu.vote.no_active")}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-white">
                  {t(locale, "ui.danmu.vote.templates_title")}
                </p>
                <button
                  type="button"
                  onClick={onClearLiveVoteDraft}
                  className="rounded-xl border border-white/8 bg-white/5 px-2.5 py-1 text-[10px] font-semibold text-gray-300 transition-all hover:border-white/15 hover:bg-white/8 hover:text-white"
                >
                  {t(locale, "ui.danmu.vote.template_clear")}
                </button>
              </div>

              {liveVotePanel?.templates?.length ? (
                <div className="mb-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                  {liveVotePanel.templates.map((template) => (
                    <button
                      key={template.template_id}
                      type="button"
                      onClick={() => onApplyLiveVoteTemplate(template.template_id)}
                      className={`min-w-40 shrink-0 rounded-2xl border px-3 py-2 text-left transition-all ${
                        liveVoteSelectedTemplateId === template.template_id
                          ? "border-bili-blue/35 bg-bili-blue/10"
                          : "border-white/6 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]"
                      }`}
                    >
                      <p className="line-clamp-1 text-[11px] font-semibold text-white">
                        {template.question}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[10px] text-gray-400">
                        {template.option_a} / {template.option_b}
                      </p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mb-4 rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-6 text-center text-xs text-gray-400">
                  {t(locale, "ui.danmu.vote.templates_empty")}
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                    {t(locale, "ui.danmu.vote.question")}
                  </label>
                  <input
                    value={liveVoteQuestion}
                    onChange={(event) => onChangeLiveVoteQuestion(event.target.value)}
                    placeholder={t(locale, "ui.danmu.vote.question.placeholder")}
                    className={alignedInputClassName}
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {t(locale, "ui.danmu.vote.option_a")}
                    </label>
                    <input
                      value={liveVoteOptionA}
                      onChange={(event) => onChangeLiveVoteOptionA(event.target.value)}
                      placeholder={t(locale, "ui.danmu.vote.option_a.placeholder")}
                      className={alignedInputClassName}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {t(locale, "ui.danmu.vote.option_b")}
                    </label>
                    <input
                      value={liveVoteOptionB}
                      onChange={(event) => onChangeLiveVoteOptionB(event.target.value)}
                      placeholder={t(locale, "ui.danmu.vote.option_b.placeholder")}
                      className={alignedInputClassName}
                    />
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                      {t(locale, "ui.danmu.vote.duration")}
                    </label>
                    <select
                      value={liveVoteDuration}
                      onChange={(event) => onChangeLiveVoteDuration(Number(event.target.value))}
                      className={alignedSelectClassName}
                    >
                      {LIVE_VOTE_DURATION_OPTIONS.map((duration) => (
                        <option key={duration} value={duration}>
                          {tf(locale, "ui.danmu.vote.duration_value", { count: duration })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onCreateLiveVote()}
                    disabled={
                      liveVoteSubmitting ||
                      hasActiveVote ||
                      !liveVoteQuestion.trim() ||
                      !liveVoteOptionA.trim() ||
                      !liveVoteOptionB.trim()
                    }
                    className="h-11 rounded-xl bg-bili-blue px-4 text-xs font-semibold text-white transition-all hover:bg-bili-blue/90 active:scale-95 disabled:cursor-not-allowed disabled:bg-white/6 disabled:text-gray-500"
                  >
                    {liveVoteSubmitting
                      ? t(locale, "ui.danmu.vote.creating")
                      : t(locale, "ui.danmu.vote.create")}
                  </button>
                </div>

                {hasActiveVote ? (
                  <p className="text-[10px] leading-relaxed text-amber-300/90">
                    {t(locale, "ui.danmu.vote.create_disabled_active")}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
              <p className="mb-3 text-xs font-semibold text-white">
                {t(locale, "ui.danmu.vote.history_title")}
              </p>

              {liveVoteHistory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-8 text-center text-xs text-gray-400">
                  {t(locale, "ui.danmu.vote.history_empty")}
                </div>
              ) : (
                <div className="space-y-3">
                  {liveVoteHistory.map((vote) => (
                    <article
                      key={vote.interaction_id}
                      className="rounded-2xl border border-white/6 bg-[#070b11]/70 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-white">{vote.question}</p>
                          <p className="mt-1 text-[10px] text-gray-500">
                            {vote.etime_str || `ID: ${vote.interaction_id}`}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${resolveVoteStatusClassName(
                            vote.status,
                          )}`}
                        >
                          {resolveVoteStatusLabel(vote.status, locale)}
                        </span>
                      </div>

                      <div className="mt-3 space-y-2">
                        {vote.options.map((option) => (
                          <div key={`${vote.interaction_id}-${option.idx}`} className="space-y-1">
                            <div className="flex items-center justify-between gap-3 text-[10px]">
                              <span className="text-gray-300">{option.desc}</span>
                              <span className="font-mono text-gray-500">
                                {formatVotePercent(option.percent)}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
                              <div
                                className="h-full rounded-full bg-white/25"
                                style={{ width: formatVotePercent(option.percent) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
