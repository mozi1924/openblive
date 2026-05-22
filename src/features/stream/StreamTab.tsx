import {
  Check,
  ChevronDown,
  Compass,
  Copy,
  History,
  ImageUp,
  Link,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
  X,
  Server,
  Key,
  ExternalLink,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  ActiveTab,
  LinkageStatus,
  LiveCoverAdvice,
  LiveCoverHistoryItem,
  LiveProfileState,
  Session,
  StreamEndpoint,
  StreamInfo,
} from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { resolveBackendMessage, t, tf } from "../../utils/i18n";
import { normalizeCoverValue, normalizeRemoteAssetUrl } from "../../hooks/studio/controllerHelpers";

type StreamTabProps = {
  locale: LocaleSetting;
  child: string;
  children: string[];
  copiedKey: string | null;
  cover: string;
  coverRenderSrc: string;
  coverAdvice: LiveCoverAdvice | null;
  coverAdviceLoading: boolean;
  coverHistory: LiveCoverHistoryItem[];
  coverHistoryLoading: boolean;
  parent: string;
  partitions: Record<string, string[]>;
  pendingCoverUpload: { fileName: string; mimeType: string; dataUrl: string } | null;
  rtmp: StreamInfo | null;
  session: Session | null;
  linkageStatus: LinkageStatus | null;
  tagInput: string;
  tags: string[];
  tagAuditStatusMap: Record<string, number>;
  title: string;
  recentAreas: Array<{ parent: string; child: string }>;
  hasUnsavedChanges: boolean;
  hasAttentionStatus: boolean;
  profileState: LiveProfileState;
  sectionStatus: {
    cover: { tone: "green" | "yellow" | "red"; label: string; detail: string };
    title: { tone: "green" | "yellow" | "red"; label: string; detail: string };
    area: { tone: "green" | "yellow" | "red"; label: string; detail: string };
    tags: { tone: "green" | "yellow" | "red"; label: string; detail: string };
  };
  dirtyStatus: { cover: boolean; title: boolean; area: boolean; tags: boolean };
  unsavedItems: string[];
  onSelectTab: (tab: ActiveTab) => void;
  onChangeChild: (value: string) => void;
  onChangeParent: (value: string) => void;
  onChangeTagInput: React.Dispatch<React.SetStateAction<string>>;
  onChangeTitle: React.Dispatch<React.SetStateAction<string>>;
  onAddTag: () => void;
  onSelectCoverFile: (file: File | null) => Promise<void>;
  onSelectHistoryCover: (coverUrl: string, assetUrl?: string) => void;
  onRemoveTag: (tag: string) => void;
  onCopyToClipboard: (text: string, type: string) => Promise<void>;
  onSyncProfile: () => Promise<void>;
  onStartLive: () => Promise<void>;
  onStopLive: () => Promise<void>;
  onApplyRecentArea: (parent: string, child: string) => void;
  onSubmitArea: (event: React.FormEvent) => Promise<void>;
  onSubmitCover: () => Promise<void>;
  onSubmitTitle: (event: React.FormEvent) => Promise<void>;
};

function SectionBadge({
  label,
  state,
}: {
  label: string;
  state: { tone: "green" | "yellow" | "red"; label: string; detail: string };
}) {
  const toneClass =
    state.tone === "green"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
      : state.tone === "red"
        ? "border-rose-500/25 bg-rose-500/10 text-rose-300"
        : "border-amber-500/25 bg-amber-500/10 text-amber-300";
  const dotClass =
    state.tone === "green"
      ? "bg-emerald-400"
      : state.tone === "red"
        ? "bg-rose-400"
        : "bg-amber-400";

  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[11px] font-bold">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        <span>{label}</span>
        <span className="opacity-90">{state.label}</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed opacity-90">{state.detail}</p>
    </div>
  );
}

export function StreamTab({
  locale,
  child,
  children,
  copiedKey,
  cover,
  coverRenderSrc,
  coverAdvice,
  coverAdviceLoading,
  coverHistory,
  coverHistoryLoading,
  parent,
  partitions,
  pendingCoverUpload,
  rtmp,
  session,
  linkageStatus,
  tagInput,
  tags,
  tagAuditStatusMap,
  title,
  recentAreas,
  hasUnsavedChanges,
  hasAttentionStatus,
  profileState,
  sectionStatus,
  dirtyStatus,
  unsavedItems,
  onSelectTab,
  onChangeChild,
  onChangeParent,
  onChangeTagInput,
  onChangeTitle,
  onAddTag,
  onSelectCoverFile,
  onSelectHistoryCover,
  onRemoveTag,
  onCopyToClipboard,
  onSyncProfile,
  onStartLive,
  onStopLive,
  onApplyRecentArea,
  onSubmitArea,
  onSubmitCover,
  onSubmitTitle,
}: StreamTabProps) {
  const streamEndpoints = buildStreamEndpoints(rtmp);
  const primaryEndpoint = streamEndpoints[0];
  const liveStatus = session?.live_status ?? (session?.is_live ? 1 : 0);
  const isLive = liveStatus === 1;
  const isRoundPlay = liveStatus === 2;
  const statusLabel = isLive
    ? t(locale, "ui.stream.status.live")
    : isRoundPlay
      ? t(locale, "ui.stream.status.round")
      : t(locale, "ui.stream.status.off");
  
  const statusHint = isLive
    ? t(locale, "ui.stream.status.hint.live")
    : isRoundPlay
      ? t(locale, "ui.stream.status.hint.round")
      : t(locale, "ui.stream.status.hint.off");

  const statusColorPill = isLive
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : isRoundPlay
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-gray-500/30 bg-white/5 text-gray-400";

  // Reactor ring color/animations
  const reactorRingClass = isLive
    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.2)] animate-pulse-glow"
    : isRoundPlay
      ? "border-amber-500/30 bg-amber-500/5 text-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
      : "border-white/5 bg-white/2 text-gray-500";


  const obsStatus = linkageStatus?.obs_ws;
  const commandStatus = linkageStatus?.command;
  const activeLinkageMode = linkageStatus?.mode ?? "none";
  const isObsConfigured = Boolean(obsStatus?.url);
  const isCommandConfigured = Boolean(
    commandStatus?.start_configured || commandStatus?.stop_configured || commandStatus?.template_preview,
  );
  const hasActiveLinkage = activeLinkageMode === "obs_ws"
    ? isObsConfigured
    : activeLinkageMode === "command"
      ? isCommandConfigured
      : false;

  const linkageTitle = activeLinkageMode === "obs_ws"
    ? "OBS WebSocket"
    : activeLinkageMode === "command"
      ? t(locale, "ui.stream.linkage.command")
      : t(locale, "ui.stream.linkage.none");

  const linkageStateText = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? t(locale, "ui.stream.linkage.state.connected")
      : t(locale, "ui.stream.linkage.state.disconnected")
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured
        ? t(locale, "ui.stream.linkage.state.deployed")
        : commandStatus?.stop_configured
          ? t(locale, "ui.stream.linkage.state.stop_only")
          : t(locale, "ui.stream.linkage.state.not_configured")
      : t(locale, "ui.stream.linkage.state.pending");

  const linkageStateClass = activeLinkageMode === "obs_ws"
    ? obsStatus?.connected
      ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
      : "text-rose-400 border-rose-500/20 bg-rose-500/10"
    : activeLinkageMode === "command"
      ? commandStatus?.start_configured || commandStatus?.stop_configured
        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
        : "text-amber-400 border-amber-500/20 bg-amber-500/10"
      : "text-gray-400 border-white/8 bg-white/4";
  const linkageHint = activeLinkageMode === "obs_ws"
    ? t(locale, "ui.stream.linkage.hint.obs")
    : activeLinkageMode === "command"
      ? t(locale, "ui.stream.linkage.hint.command")
      : t(locale, "ui.stream.linkage.hint.none");
  const coverPreview = normalizeCoverValue(
    coverRenderSrc || (cover.startsWith("data:") ? cover : ""),
  );
  const coverAdviceItems = coverAdvice?.advice || [];
  const titleAuditDetail = profileState.title.message && sectionStatus.title.tone !== "green"
    ? tf(locale, "ui.stream.last_submit", { value: profileState.title.submitted || t(locale, "ui.stream.last_submit.none") })
    : "";
  const [showCoverHistoryModal, setShowCoverHistoryModal] = useState(false);
  const [historyDraftUrl, setHistoryDraftUrl] = useState("");

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

  const handleLiveToggle = async () => {
    if (isLive) {
      await onStopLive();
      return;
    }
    await onStartLive();
  };

  const handleApplyHistoryCover = () => {
    const selectedItem = normalizedHistoryItems.find((item) => item.normalizedCoverUrl === historyDraftUrl);
    if (!selectedItem) {
      return;
    }
    onSelectHistoryCover(selectedItem.normalizedCoverUrl, selectedItem.normalizedCoverAssetUrl);
    setShowCoverHistoryModal(false);
  };

  return (
    <>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Parameters Setup */}
      <div className="space-y-6 lg:col-span-7">
        <div className="flat-panel rounded-xl p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-2">
              <Compass className="h-4 w-4 text-bili-blue" />
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                ROOM MANAGEMENT
              </span>
            </div>
            
            <button
              onClick={() => void onSyncProfile()}
              className="flex h-9 items-center justify-center rounded-lg border border-white/8 bg-white/3 px-3.5 text-xs font-bold text-gray-300 transition-all hover:border-bili-blue/30 hover:bg-white/6 hover:text-white active:scale-95"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              {t(locale, "ui.stream.sync_profile")}
            </button>
          </div>

          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  {t(locale, "ui.stream.cover.title")}
                </label>
                <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    sectionStatus.cover.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.cover.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-300 font-medium">{sectionStatus.cover.label}</span>
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
                    <p className="mt-2 text-[11px] leading-relaxed text-amber-200/90">
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
            </div>

            <div className="h-px bg-white/5" />

            {/* Title setting */}
            <form onSubmit={(event) => void onSubmitTitle(event)} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  {t(locale, "ui.stream.title.label")}
                </label>
                <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    sectionStatus.title.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.title.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-300 font-medium">{sectionStatus.title.label}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => onChangeTitle(event.target.value)}
                  placeholder={t(locale, "ui.stream.title.placeholder")}
                  className="flex-1 rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none hover:border-white/12"
                />
                <button
                  type="submit"
                  className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-4 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
                >
                  {t(locale, "ui.stream.title.update")}
                </button>
              </div>
              {titleAuditDetail && (
                <p className="text-[10px] leading-relaxed text-amber-200/90 font-medium">
                  {titleAuditDetail} · {profileState.title.message}
                </p>
              )}
            </form>

            <div className="h-px bg-white/5" />

            {/* Partition Area setting */}
            <form onSubmit={(event) => void onSubmitArea(event)} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  {t(locale, "ui.stream.area.title")}
                </label>
                <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    sectionStatus.area.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.area.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-200">{sectionStatus.area.label}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">{t(locale, "ui.stream.area.parent")}</span>
                  <div className="relative">
                    <select
                      value={parent}
                      onChange={(event) => onChangeParent(event.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
                    >
                      {Object.keys(partitions).map((partition) => (
                        <option key={partition} value={partition} className="bg-[#090b0f]">
                          {partition}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                </div>
                <div className="flex flex-col space-y-1">
                  <span className="text-[9px] font-bold text-gray-500">{t(locale, "ui.stream.area.child")}</span>
                  <div className="relative">
                    <select
                      value={child}
                      onChange={(event) => onChangeChild(event.target.value)}
                      className="h-10 w-full appearance-none rounded-lg border border-white/8 bg-[#0b111c] px-3 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all hover:border-white/12 focus:border-bili-blue/40 focus:outline-none"
                    >
                      {children.map((partition) => (
                        <option key={partition} value={partition} className="bg-[#090b0f]">
                          {partition}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex min-h-9 flex-1 flex-wrap items-center gap-1.5">
                  {recentAreas.map((area) => {
                    const key = `${area.parent}/${area.child}`;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onApplyRecentArea(area.parent, area.child)}
                        className="rounded border border-white/10 bg-white/2 px-2 py-0.5 text-[10px] text-gray-400 transition-all hover:border-bili-blue/30 hover:bg-bili-blue/10 hover:text-bili-blue font-medium"
                        title={`${area.parent} / ${area.child}`}
                      >
                        {area.parent} / {area.child}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="submit"
                  className="flex h-9 items-center justify-center rounded-lg border border-bili-blue/20 bg-bili-blue/10 px-5 text-xs font-bold text-bili-blue transition-all hover:bg-bili-blue hover:text-white active:scale-95"
                >
                  {t(locale, "ui.stream.area.save")}
                </button>
              </div>
            </form>

            <div className="h-px bg-white/5" />

            {/* Tags setting */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-[10px] font-extrabold tracking-wider text-gray-500 uppercase">
                  {t(locale, "ui.stream.tags.title")}
                </label>
                <div className="flex items-center gap-1.5 rounded-md border border-white/8 bg-white/3 px-2 py-0.5 text-[10px]">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    sectionStatus.tags.tone === "green"
                      ? "bg-emerald-400"
                      : sectionStatus.tags.tone === "red"
                        ? "bg-rose-400"
                        : "bg-amber-400"
                  }`} />
                  <span className="text-gray-300 font-medium">{sectionStatus.tags.label}</span>
                </div>
              </div>
              
              {/* Display Current Tags */}
              <div className="min-h-11 rounded-lg border border-white/5 bg-white/1.5 p-2">
                {tags.length === 0 ? (
                  <p className="px-1.5 py-1 text-xs text-gray-500 font-medium">
                    {t(locale, "ui.stream.tags.empty")}
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center rounded border border-bili-blue/20 bg-bili-blue/8 px-2 py-0.5 text-xs font-semibold text-bili-blue"
                      >
                        {tag}
                        <span className="ml-1 rounded bg-white/10 px-1.5 py-[1px] text-[10px] font-medium text-gray-300">
                          {t(locale, `ui.stream.tags.audit.status.${String(tagAuditStatusMap[tag] ?? -1)}`)}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveTag(tag)}
                          className="ml-1.5 rounded p-0.5 text-bili-blue/60 transition-colors hover:bg-bili-blue/20 hover:text-bili-blue"
                          title={t(locale, "ui.stream.tags.delete")}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Tag inputs */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(event) => onChangeTagInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onAddTag();
                    }
                  }}
                  placeholder={t(locale, "ui.stream.tags.placeholder")}
                  className="flex-1 rounded-lg border border-white/8 bg-white/1.5 px-3.5 py-2 text-xs text-white transition-all focus:border-bili-blue/40 focus:bg-white/3 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={onAddTag}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/3 text-gray-300 hover:bg-white/6 hover:text-white"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RTMP Server info */}
        {rtmp && (
          <div className="flat-panel rounded-xl border border-emerald-500/20 bg-emerald-500/[0.01] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Link className="h-4 w-4 text-emerald-400" />
                <span className="text-[10px] font-extrabold tracking-widest text-emerald-400 uppercase">
                  RTMP STREAM ENDPOINTS
                </span>
              </div>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/20">
                {t(locale, "ui.stream.ready")}
              </span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-white/5 bg-[#05090a] p-3.5 space-y-2.5 font-mono text-[11px]">
                
                {/* Server URL field */}
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/2 px-3 py-1.5">
                  <div className="flex items-center space-x-2 truncate">
                    <Server className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-400 shrink-0">{t(locale, "ui.stream.addr")}</span>
                    <span className="truncate text-gray-300 select-text">{primaryEndpoint?.addr || t(locale, "ui.stream.unavailable")}</span>
                  </div>
                  <button
                    onClick={() => void onCopyToClipboard(primaryEndpoint?.addr || "", "server")}
                    disabled={!primaryEndpoint?.addr}
                    className="flex items-center rounded bg-white/4 px-2 py-1 text-[10px] font-bold text-gray-300 transition-all hover:bg-white/8 hover:text-white active:scale-95"
                  >
                    {copiedKey === "server" ? (
                      <Check className="mr-1 h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    {t(locale, "ui.stream.copy")}
                  </button>
                </div>

                {/* Key field */}
                <div className="flex items-center justify-between gap-3 rounded-md border border-white/5 bg-white/2 px-3 py-1.5">
                  <div className="flex items-center space-x-2 truncate">
                    <Key className="h-3.5 w-3.5 text-gray-500 shrink-0" />
                    <span className="text-gray-400 shrink-0">{t(locale, "ui.stream.key")}</span>
                    <span className="truncate text-gray-300 select-text">
                      {primaryEndpoint?.code ? "••••••••••••••••••••••••" : t(locale, "ui.stream.unavailable")}
                    </span>
                  </div>
                  <button
                    onClick={() => void onCopyToClipboard(primaryEndpoint?.code || "", "key")}
                    disabled={!primaryEndpoint?.code}
                    className="flex items-center rounded bg-white/4 px-2 py-1 text-[10px] font-bold text-gray-300 transition-all hover:bg-white/8 hover:text-white active:scale-95"
                  >
                    {copiedKey === "key" ? (
                      <Check className="mr-1 h-3 w-3 text-emerald-400" />
                    ) : (
                      <Copy className="mr-1 h-3 w-3" />
                    )}
                    {t(locale, "ui.stream.copy")}
                  </button>
                </div>

              </div>

            </div>
          </div>
        )}
      </div>

      {/* Right Column: Live cockpit control */}
      <div className="lg:col-span-5 lg:self-start">
        <div className="flat-panel flex flex-col justify-between space-y-5 rounded-xl p-5 text-center lg:sticky lg:top-6 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto app-scrollbar">
          <div>
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[10px] font-extrabold tracking-widest text-gray-400 uppercase">
                LIVE CONTROLLER
              </span>
              <span
                className={`rounded border px-2.5 py-0.5 text-[9px] font-bold tracking-wide ${statusColorPill}`}
              >
                {statusLabel}
              </span>
            </div>

            {/* Reactor Core Indicator */}
            <div className="flex flex-col items-center py-4">
              <div
                className={`flex h-24 w-24 items-center justify-center rounded-full border-2 transition-all duration-300 ${reactorRingClass}`}
              >
                <div className={`flex h-20 w-20 items-center justify-center rounded-full border border-white/5 bg-[#0a0d14] ${isLive ? "shadow-[inset_0_0_15px_rgba(16,185,129,0.1)]" : ""}`}>
                  <Radio className={`h-10 w-10 ${isLive ? "text-emerald-400 animate-pulse" : "text-gray-600"}`} />
                </div>
              </div>
              <h4 className="mt-4 text-xs font-bold text-white tracking-wide">
                {tf(locale, "ui.stream.live_status", { status: statusLabel })}
              </h4>
              <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-gray-500 font-medium">
                {statusHint}
              </p>
              {(hasUnsavedChanges || hasAttentionStatus) && (
                <div className="mt-3.5 w-full max-w-sm rounded-lg border border-white/8 bg-white/2.5 p-3 text-left">
                  {hasUnsavedChanges ? (
                    <div className="mb-2.5 rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-amber-300 font-medium">
                      <p>{tf(locale, "ui.stream.unsaved.detected", { items: unsavedItems.join("、") })}</p>
                      <p className="mt-1 text-amber-200/90 font-medium">
                        {tf(locale, "ui.stream.unsaved.detail", {
                          cover: dirtyStatus.cover ? t(locale, "ui.stream.changed") : t(locale, "ui.stream.unchanged"),
                          title: dirtyStatus.title ? t(locale, "ui.stream.changed") : t(locale, "ui.stream.unchanged"),
                          area: dirtyStatus.area ? t(locale, "ui.stream.changed") : t(locale, "ui.stream.unchanged"),
                          tags: dirtyStatus.tags ? t(locale, "ui.stream.changed") : t(locale, "ui.stream.unchanged"),
                        })}
                      </p>
                    </div>
                  ) : (
                    <p className="mb-2.5 text-[10px] leading-relaxed text-gray-400 font-medium">
                      {t(locale, "ui.stream.pending_desc")}
                    </p>
                  )}
                  <div className="space-y-2">
                    <SectionBadge label={t(locale, "ui.stream.section.cover")} state={sectionStatus.cover} />
                    <SectionBadge label={t(locale, "ui.stream.section.title")} state={sectionStatus.title} />
                    <SectionBadge label={t(locale, "ui.stream.section.area")} state={sectionStatus.area} />
                    <SectionBadge label={t(locale, "ui.stream.section.tags")} state={sectionStatus.tags} />
                  </div>
                </div>
              )}
            </div>

            {/* Linkage status dashboards */}
            <div className="space-y-3 rounded-lg border border-white/5 bg-[#05070a] p-3.5 text-left">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-extrabold tracking-widest text-gray-500 uppercase">
                    EQUIPMENT LINKAGE
                  </span>
                  <p className="mt-0.5 text-[11px] text-gray-500 font-medium">
                    {linkageHint}
                  </p>
                </div>
              </div>

              {!hasActiveLinkage ? (
                <div className="rounded border border-dashed border-white/10 bg-white/2 p-3 text-center">
                  <p className="text-xs font-bold text-gray-200">{t(locale, "ui.stream.no_linkage")}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-500 font-medium">
                    {t(locale, "ui.stream.no_linkage.desc")}
                  </p>
                  <button
                    onClick={() => onSelectTab("settings")}
                    className="mt-2 inline-flex items-center text-[11px] font-bold text-bili-blue hover:underline"
                  >
                    {t(locale, "ui.stream.no_linkage.goto")}
                    <ExternalLink className="ml-1 h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="rounded border border-white/5 bg-white/2 p-2.5 font-mono text-[11px] transition-all hover:bg-white/4">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-bold text-gray-300">{linkageTitle}</span>
                      <p className="mt-0.5 text-[10px] font-sans text-gray-500 font-medium">
                        {activeLinkageMode === "obs_ws" ? t(locale, "ui.stream.linkage.current.obs") : t(locale, "ui.stream.linkage.current.command")}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-extrabold ${linkageStateClass}`}>
                      {linkageStateText}
                    </span>
                  </div>

                  {activeLinkageMode === "obs_ws" && (
                    <div className="space-y-1">
                      <p className="truncate text-[10px] text-gray-500 font-medium">
                        {tf(locale, "ui.stream.linkage.address", { value: obsStatus?.url || "ws://127.0.0.1:4455" })}
                      </p>
                      {obsStatus?.last_error && (
                        <p className="truncate text-[9px] text-rose-400 leading-tight">
                          ERR: {resolveBackendMessage(obsStatus.last_error, locale)}
                        </p>
                      )}
                    </div>
                  )}

                  {activeLinkageMode === "command" && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                          commandStatus?.start_configured
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-white/8 bg-white/4 text-gray-500"
                        }`}>
                          {tf(locale, "ui.stream.command.start", {
                            status: commandStatus?.start_configured
                              ? t(locale, "ui.stream.command.configured")
                              : t(locale, "ui.stream.command.unconfigured"),
                          })}
                        </span>
                        <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${
                          commandStatus?.stop_configured
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                            : "border-white/8 bg-white/4 text-gray-500"
                        }`}>
                          {tf(locale, "ui.stream.command.stop", {
                            status: commandStatus?.stop_configured
                              ? t(locale, "ui.stream.command.configured")
                              : t(locale, "ui.stream.command.unconfigured"),
                          })}
                        </span>
                      </div>

                      {commandStatus?.template_preview && (
                        <p className="truncate rounded bg-black/40 px-2 py-1 text-[9px] text-gray-500 select-text font-medium">
                          CMD: {commandStatus.template_preview}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Action button */}
          <div className="space-y-2.5">
            <button
              onClick={() => void handleLiveToggle()}
              className={`flex h-11 w-full items-center justify-center rounded-lg border text-xs font-bold transition-all duration-200 active:scale-98 ${
                isLive
                  ? "border-rose-500/20 bg-rose-500/8 text-rose-400 hover:bg-rose-500/15"
                  : "border-emerald-500/20 bg-gradient-to-r from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/10 hover:opacity-95 hover:shadow-emerald-500/20"
              }`}
            >
              {isLive ? (
                <Trash2 className="mr-2 h-4 w-4 shrink-0" />
              ) : (
                <Radio className="mr-2 h-4 w-4 shrink-0" />
              )}
              {isLive ? t(locale, "ui.stream.stop") : t(locale, "ui.stream.start")}
            </button>
          </div>
        </div>
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
    </>
  );
}

function buildStreamEndpoints(rtmp: StreamInfo | null): StreamEndpoint[] {
  if (!rtmp) {
    return [];
  }
  if (rtmp.endpoints && rtmp.endpoints.length > 0) {
    return rtmp.endpoints;
  }

  if (rtmp.rtmp1?.addr || rtmp.rtmp1?.code) {
    return [
      {
        protocol: "rtmp",
        addr: rtmp.rtmp1?.addr || "",
        code: rtmp.rtmp1?.code || "",
        full_url: `${rtmp.rtmp1?.addr || ""}${rtmp.rtmp1?.code || ""}`,
      },
    ];
  }

  return [];
}
