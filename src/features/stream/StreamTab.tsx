import {
  Compass,
  Radio,
  RefreshCw,
  Trash2,
} from "lucide-react";
import type {
  ActiveTab,
  LinkageStatus,
  LiveCoverAdvice,
  LiveCoverHistoryItem,
  LiveProfileState,
  Session,
  StreamInfo,
} from "../../types/studio";
import type { LocaleSetting } from "../../utils/i18n";
import { t, tf } from "../../utils/i18n";
import { resolveSessionLiveState } from "../../utils/liveStatus";

import { CoverPanel } from "./components/CoverPanel";
import { TitlePanel } from "./components/TitlePanel";
import { RoomNewsPanel } from "./components/RoomNewsPanel";
import { LiveReservePanel } from "./components/LiveReservePanel";
import { PartitionPanel } from "./components/PartitionPanel";
import { TagsPanel } from "./components/TagsPanel";
import { StreamEndpointsPanel } from "./components/StreamEndpointsPanel";
import { LinkageStatusPanel } from "./components/LinkageStatusPanel";

type StreamTabState = {
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
  title: string;
  roomNews: string;
  liveReserveTitle: string;
  liveReserveStartAt: string;
  liveReserveCreateDynamic: boolean;
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
  dirtyStatus?: { cover: boolean; title: boolean; area: boolean; tags: boolean };
  unsavedItems: string[];
};

type StreamTabActions = {
  onSelectTab: (tab: ActiveTab) => void;
  onChangeChild: (value: string) => void;
  onChangeParent: (value: string) => void;
  onChangeTagInput: React.Dispatch<React.SetStateAction<string>>;
  onChangeTitle: React.Dispatch<React.SetStateAction<string>>;
  onChangeRoomNews: React.Dispatch<React.SetStateAction<string>>;
  onChangeLiveReserveTitle: React.Dispatch<React.SetStateAction<string>>;
  onChangeLiveReserveStartAt: React.Dispatch<React.SetStateAction<string>>;
  onChangeLiveReserveCreateDynamic: React.Dispatch<React.SetStateAction<boolean>>;
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
  onSubmitRoomNews: (event: React.FormEvent) => Promise<void>;
  onSubmitLiveReserve: (event: React.FormEvent) => Promise<void>;
};

type StreamTabProps = {
  locale: LocaleSetting;
  state: StreamTabState;
  actions: StreamTabActions;
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

export function StreamTab({ locale, state, actions }: StreamTabProps) {
  const {
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
    title,
    roomNews,
    liveReserveTitle,
    liveReserveStartAt,
    liveReserveCreateDynamic,
    recentAreas,
    hasUnsavedChanges,
    hasAttentionStatus,
    profileState,
    sectionStatus,
    unsavedItems,
  } = state;

  const {
    onSelectTab,
    onChangeChild,
    onChangeParent,
    onChangeTagInput,
    onChangeTitle,
    onChangeRoomNews,
    onChangeLiveReserveTitle,
    onChangeLiveReserveStartAt,
    onChangeLiveReserveCreateDynamic,
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
    onSubmitRoomNews,
    onSubmitLiveReserve,
  } = actions;
  const liveSessionState = resolveSessionLiveState(session);
  const isLive = liveSessionState.isLive;
  const isRoundPlay = liveSessionState.isRound;
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

  const handleLiveToggle = async () => {
    if (isLive) {
      await onStopLive();
      return;
    }
    await onStartLive();
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
              <CoverPanel
                locale={locale}
                cover={cover}
                coverRenderSrc={coverRenderSrc}
                coverAdvice={coverAdvice}
                coverAdviceLoading={coverAdviceLoading}
                coverHistory={coverHistory}
                coverHistoryLoading={coverHistoryLoading}
                pendingCoverUpload={pendingCoverUpload}
                sectionStatus={sectionStatus.cover}
                onSelectCoverFile={onSelectCoverFile}
                onSelectHistoryCover={onSelectHistoryCover}
                onSubmitCover={onSubmitCover}
              />

              <div className="h-px bg-white/5" />

              <TitlePanel
                locale={locale}
                title={title}
                sectionStatus={sectionStatus.title}
                profileState={profileState}
                onChangeTitle={onChangeTitle}
                onSubmitTitle={onSubmitTitle}
              />

              <div className="h-px bg-white/5" />

              <RoomNewsPanel
                locale={locale}
                roomNews={roomNews}
                onChangeRoomNews={onChangeRoomNews}
                onSubmitRoomNews={onSubmitRoomNews}
              />

              <div className="h-px bg-white/5" />

              <LiveReservePanel
                locale={locale}
                liveReserveTitle={liveReserveTitle}
                liveReserveStartAt={liveReserveStartAt}
                liveReserveCreateDynamic={liveReserveCreateDynamic}
                onChangeLiveReserveTitle={onChangeLiveReserveTitle}
                onChangeLiveReserveStartAt={onChangeLiveReserveStartAt}
                onChangeLiveReserveCreateDynamic={onChangeLiveReserveCreateDynamic}
                onSubmitLiveReserve={onSubmitLiveReserve}
              />

              <div className="h-px bg-white/5" />

              <PartitionPanel
                locale={locale}
                parent={parent}
                child={child}
                children={children}
                partitions={partitions}
                recentAreas={recentAreas}
                sectionStatus={sectionStatus.area}
                onChangeParent={onChangeParent}
                onChangeChild={onChangeChild}
                onApplyRecentArea={onApplyRecentArea}
                onSubmitArea={onSubmitArea}
              />

              <div className="h-px bg-white/5" />

              <TagsPanel
                locale={locale}
                tags={tags}
                tagInput={tagInput}
                sectionStatus={sectionStatus.tags}
                onChangeTagInput={onChangeTagInput}
                onAddTag={onAddTag}
                onRemoveTag={onRemoveTag}
              />
            </div>
          </div>
        </div>

        {/* Right Column: Live cockpit control */}
        <div className="lg:col-span-5 lg:self-start">
          <div className="flat-panel flex flex-col justify-between space-y-5 rounded-xl p-5 text-center lg:fixed lg:right-[calc(2rem+max(0px,((100vw-20rem-72rem)/2)))] lg:top-[5rem] lg:z-20 lg:w-[min(29.125rem,calc(((100vw-20rem)*0.4166667)-0.875rem))] lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto app-scrollbar">
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
                <h4 className="mt-3 text-[11px] font-bold text-white tracking-wide">
                  {tf(locale, "ui.stream.live_status", { status: statusLabel })}
                </h4>
                <p className="mt-1 max-w-[17rem] text-[10px] leading-tight text-gray-500 font-medium">
                  {statusHint}
                </p>
                
                <StreamEndpointsPanel
                  locale={locale}
                  rtmp={rtmp}
                  copiedKey={copiedKey}
                  onCopyToClipboard={onCopyToClipboard}
                />
                
                {(hasUnsavedChanges || hasAttentionStatus) && (
                  <div className="mt-3.5 w-full max-w-sm rounded-lg border border-white/8 bg-white/2.5 p-3 text-left">
                    {hasUnsavedChanges ? (
                      <div className="mb-2.5 rounded border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-amber-300 font-medium">
                        <p>{tf(locale, "ui.stream.unsaved.detected", { items: unsavedItems.join("、") })}</p>
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
              <LinkageStatusPanel
                locale={locale}
                linkageStatus={linkageStatus}
                onSelectTab={onSelectTab}
              />
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
    </>
  );
}
