import { useState, useEffect, useMemo } from "react";
import { ImageUp, History, X } from "lucide-react";
import type { LiveCoverAdvice, LiveCoverHistoryItem } from "../../../types/studio";
import type { LocaleSetting } from "../../../utils/i18n";
import { t, tf } from "../../../utils/i18n";
import { normalizeCoverValue, normalizeRemoteAssetUrl } from "../../../hooks/studio/controllerHelpers";

type CoverPanelProps = {
  locale: LocaleSetting;
  cover: string;
  coverRenderSrc: string;
  coverAdvice: LiveCoverAdvice | null;
  coverAdviceLoading: boolean;
  coverHistory: LiveCoverHistoryItem[];
  coverHistoryLoading: boolean;
  pendingCoverUpload: { fileName: string; mimeType: string; dataUrl: string } | null;
  sectionStatus: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  onSelectCoverFile: (file: File | null) => Promise<void>;
  onSelectHistoryCover: (coverUrl: string, assetUrl?: string) => void;
  onSubmitCover: () => Promise<void>;
};

export function CoverPanel({
  locale,
  cover,
  coverRenderSrc,
  coverAdvice,
  coverAdviceLoading,
  coverHistory,
  coverHistoryLoading,
  pendingCoverUpload,
  sectionStatus,
  onSelectCoverFile,
  onSelectHistoryCover,
  onSubmitCover,
}: CoverPanelProps) {
  const [showCoverHistoryModal, setShowCoverHistoryModal] = useState(false);
  const [historyDraftUrl, setHistoryDraftUrl] = useState("");

  const coverPreview = normalizeCoverValue(
    coverRenderSrc || (cover.startsWith("data:") ? cover : ""),
  );
  const coverAdviceItems = coverAdvice?.advice || [];

  const normalizedCurrentCover = normalizeCoverValue(cover);
  const normalizedHistoryItems = useMemo(
    () =>
      coverHistory.map((item) => ({
        ...item,
        normalizedCoverUrl: normalizeRemoteAssetUrl(item.cover_url),
        normalizedCoverAssetUrl: normalizeCoverValue(item.cover_asset_url || ""),
      })),
    [coverHistory],
  );

  useEffect(() => {
    if (!showCoverHistoryModal) {
      return;
    }
    const exactMatch = normalizedHistoryItems.find((item) => item.normalizedCoverUrl === normalizedCurrentCover);
    setHistoryDraftUrl(exactMatch?.normalizedCoverUrl || normalizedCurrentCover || normalizedHistoryItems[0]?.normalizedCoverUrl || "");
  }, [normalizedCurrentCover, normalizedHistoryItems, showCoverHistoryModal]);

  const handleApplyHistoryCover = () => {
    const selectedItem = normalizedHistoryItems.find((item) => item.normalizedCoverUrl === historyDraftUrl);
    if (!selectedItem) {
      return;
    }
    onSelectHistoryCover(selectedItem.normalizedCoverUrl, selectedItem.normalizedCoverAssetUrl);
    setShowCoverHistoryModal(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
          {t(locale, "ui.stream.cover.title")}
        </label>
        <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
          <span className={`h-1.5 w-1.5 rounded-full ${
            sectionStatus.tone === "green"
              ? "bg-emerald-400"
              : sectionStatus.tone === "red"
                ? "bg-rose-400"
                : "bg-amber-400"
          }`} />
          <span className="text-gray-300 font-medium">{sectionStatus.label}</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.18fr)_minmax(0,0.82fr)] lg:items-stretch">
        <div className="flex h-full flex-col rounded-xl border border-white/8 bg-[#070b12] p-2">
          <div className="aspect-[16/10] overflow-hidden rounded-lg border border-white/5 bg-black/20">
            {coverPreview ? (
              <img
                src={coverPreview}
                alt={t(locale, "ui.stream.cover.preview_alt")}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs font-medium text-gray-500">
                {t(locale, "ui.stream.cover.empty")}
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs font-bold text-gray-200 transition-all hover:border-bili-blue/30 hover:bg-white/6 hover:text-white">
              <ImageUp className="mr-1.5 h-3.5 w-3.5" />
              {t(locale, "ui.stream.cover.upload")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  void onSelectCoverFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => void onSubmitCover()}
              className="inline-flex items-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-3 py-2 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white"
            >
              {t(locale, "ui.stream.cover.apply")}
            </button>
            <button
              type="button"
              onClick={() => setShowCoverHistoryModal(true)}
              className="inline-flex items-center rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs font-bold text-gray-200 transition-all hover:border-bili-blue/30 hover:bg-white/6 hover:text-white"
            >
              <History className="mr-1.5 h-3.5 w-3.5" />
              {t(locale, "ui.stream.cover.history_open")}
            </button>
            {pendingCoverUpload && (
              <span className="rounded border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-200">
                {tf(locale, "ui.stream.cover.pending_upload", { file: pendingCoverUpload.fileName })}
              </span>
            )}
          </div>
        </div>

        <div className="flex h-full flex-col rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase">
                {t(locale, "ui.stream.cover.advice")}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                {coverAdviceLoading
                  ? t(locale, "ui.stream.cover.advice_loading")
                  : coverAdvice?.score != null
                    ? tf(locale, "ui.stream.cover.score", { score: String(coverAdvice.score) })
                    : t(locale, "ui.stream.cover.advice_empty")}
              </p>
            </div>
            {coverAdvice?.score != null && (
              <span
                className="rounded-full border px-2.5 py-1 text-[10px] font-bold"
                style={{
                  borderColor: coverAdvice.score_color || "rgba(255,255,255,0.08)",
                  color: coverAdvice.score_color || "#f3f4f6",
                }}
              >
                {tf(locale, "ui.stream.cover.score_badge", { score: String(coverAdvice.score) })}
              </span>
            )}
          </div>
          {coverAdvice?.audit_reason && (
            <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90 font-medium">
              {coverAdvice.audit_reason}
            </p>
          )}
          {coverAdvice?.is_ban && coverAdvice?.ban_tips && (
            <p className="mt-2 text-[11px] leading-relaxed text-rose-300">
              {coverAdvice.ban_tips}
            </p>
          )}
          {coverAdviceItems.length > 0 && (
            <div className="mt-3 flex-1 space-y-2">
              {coverAdviceItems.map((item, index) => (
                <div key={`${item.title}-${index}`} className="rounded-lg border border-white/6 bg-black/20 px-3 py-2">
                  <p className="text-[11px] font-semibold text-gray-100">{item.title}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{item.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showCoverHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
          <div className="glass-panel flex max-h-[min(88vh,920px)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
              <div>
                <h3 className="text-base font-bold text-white">{t(locale, "ui.stream.cover.history_modal_title")}</h3>
                <p className="mt-1 text-xs leading-relaxed text-gray-400">
                  {t(locale, "ui.stream.cover.history_modal_desc")}
                </p>
                <p className="mt-2 text-[11px] text-gray-500">
                  {coverHistoryLoading
                    ? t(locale, "ui.stream.cover.history_loading")
                    : t(locale, "ui.stream.cover.history_modal_pick")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCoverHistoryModal(false)}
                className="rounded-lg border border-white/8 bg-white/4 p-2 text-gray-400 transition-all hover:border-white/12 hover:bg-white/7 hover:text-white"
                aria-label={t(locale, "ui.confirm.cancel")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="app-scrollbar flex-1 overflow-y-auto px-6 py-5">
              {normalizedHistoryItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center text-sm text-gray-500">
                  {coverHistoryLoading ? t(locale, "ui.stream.cover.history_loading") : t(locale, "ui.stream.cover.history_empty")}
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-3">
                  {normalizedHistoryItems.map((item) => {
                    const selected = historyDraftUrl === item.normalizedCoverUrl;
                    const using = item.use_status === 1;
                    return (
                      <button
                        key={`${item.cover_id || item.normalizedCoverUrl}-${item.upload_time || 0}`}
                        type="button"
                        onClick={() => setHistoryDraftUrl(item.normalizedCoverUrl)}
                        className={`w-full rounded-xl border p-2.5 text-left transition-all ${
                          selected
                            ? "border-bili-blue/40 bg-bili-blue/10 shadow-[0_0_0_1px_rgba(0,174,236,0.15)]"
                            : "border-white/8 bg-black/20 hover:border-white/14 hover:bg-white/4"
                        }`}
                      >
                        <div className="aspect-[16/10] overflow-hidden rounded-lg border border-white/5 bg-black/20">
                          {item.normalizedCoverAssetUrl ? (
                            <img
                              src={item.normalizedCoverAssetUrl}
                              alt={t(locale, "ui.stream.cover.preview_alt")}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[11px] text-gray-500">
                              {t(locale, "ui.stream.cover.empty")}
                            </div>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center justify-between gap-2">
                          <div className="text-[11px] font-medium text-gray-300">
                            {item.score != null
                              ? tf(locale, "ui.stream.cover.score_badge", { score: String(item.score) })
                              : t(locale, "ui.stream.cover.score_unknown")}
                          </div>
                          <div className="flex gap-1">
                            {using && (
                              <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                                {t(locale, "ui.stream.cover.using")}
                              </span>
                            )}
                            {selected && (
                              <span className="rounded border border-bili-blue/20 bg-bili-blue/10 px-1.5 py-0.5 text-[9px] font-bold text-bili-blue">
                                {t(locale, "ui.stream.cover.selected")}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/8 px-6 py-5">
              <button
                type="button"
                onClick={() => setShowCoverHistoryModal(false)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-semibold text-gray-200 transition-all duration-150 hover:border-white/20 hover:bg-white/10 active:scale-95"
              >
                {t(locale, "ui.confirm.cancel")}
              </button>
              <button
                type="button"
                onClick={handleApplyHistoryCover}
                disabled={!historyDraftUrl}
                className="rounded-xl bg-gradient-to-r from-bili-blue to-[#39c4f3] px-4 py-3 text-xs font-bold text-white transition-all duration-150 hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t(locale, "ui.stream.cover.history_apply")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
