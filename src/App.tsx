import { lazy, Suspense } from "react";
import "./App.css";
import { HeaderBar } from "./components/layout/HeaderBar";
import { LogDrawer } from "./components/layout/LogDrawer";
import { Sidebar } from "./components/layout/Sidebar";
import { ConfirmActionModal } from "./components/shared/ConfirmActionModal";
import { FaceAuthModal } from "./components/shared/FaceAuthModal";
import { AccountTab } from "./features/account/AccountTab";
import { DanmuTab } from "./features/danmu/DanmuTab";
import { LiveOnlineRankPanel } from "./features/danmu/LiveOnlineRankPanel";
import { SettingsTab } from "./features/settings/SettingsTab";
import { StreamTab } from "./features/stream/StreamTab";
import { useStudioController } from "./hooks/useStudioController";
import type { LocaleSetting } from "./utils/i18n";

const DashboardTab = lazy(() =>
  import("./features/dashboard/DashboardTab").then((module) => ({
    default: module.DashboardTab,
  })),
);

function App() {
  const controller = useStudioController();
  const { actions, refs, state } = controller;
  const locale = (state.appConfig?.locale || "auto") as LocaleSetting;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080b10] text-[#eaeef6] select-none">
      <Sidebar
        activeTab={state.activeTab}
        locale={locale}
        roomId={state.session?.room_id}
        roomBaseHost={state.appConfig?.host_live_web}
        sessionLive={state.session?.is_live ?? false}
        showLogs={state.showLogs}
        sidebarDragRef={refs.sidebarDragRef}
        currentUser={state.currentUser}
        onSelectTab={actions.setActiveTab}
        onToggleLogs={actions.toggleLogs}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <HeaderBar
          activeTab={state.activeTab}
          locale={locale}
          headerDragRef={refs.headerDragRef}
          onRefreshAccounts={actions.loadAccounts}
          onRefreshPartitions={actions.loadPartitions}
          danmuCount={state.danmus.length}
          danmuOverlayVisible={state.danmuOverlayVisible}
          liveOnlineRankPanelOpen={state.showLiveOnlineRankPanel}
          onShowDanmuOverlay={actions.showDanmuOverlay}
          onHideDanmuOverlay={actions.hideDanmuOverlay}
          onToggleLiveOnlineRankPanel={() => {
            actions.toggleLiveOnlineRankPanel();
            if (!state.showLiveOnlineRankPanel) {
              void actions.refreshLiveOnlineRank();
            }
          }}
          onClearDanmus={actions.clearDanmus}
        />

        <div className={`flex-1 ${state.activeTab === "danmu" ? "overflow-hidden flex flex-col" : "overflow-y-auto p-8"}`}>
          {state.activeTab === "account" && (
            <AccountTab
              locale={locale}
              accounts={state.accounts}
              currentUser={state.currentUser}
              qrcode={state.qrcode}
              qrLoginRemainingSeconds={state.qrLoginRemainingSeconds}
              qrLoginTimedOut={state.qrLoginTimedOut}
              onLoadQrcode={actions.loadQrcode}
              onCancelQrcodeLogin={actions.cancelQrcodeLogin}
              onRequestLogout={actions.requestLogout}
              onPollLogin={actions.pollLogin}
              onRefreshCurrentUser={actions.refreshCurrentUser}
              onSwitchAccount={actions.switchAccount}
            />
          )}

          {state.activeTab === "dashboard" && (
            <Suspense
              fallback={
                <div className="flat-panel rounded-3xl px-8 py-14 text-center text-sm text-gray-400">
                  Loading dashboard...
                </div>
              }
            >
              <DashboardTab
                locale={locale}
                currentUid={state.currentUser?.uid ?? null}
              />
            </Suspense>
          )}

          {state.activeTab === "stream" && (
            <StreamTab
              locale={locale}
              child={state.child}
              children={state.children}
              copiedKey={state.copiedKey}
              parent={state.parent}
              partitions={state.partitions}
              rtmp={state.rtmp}
              session={state.session}
              linkageStatus={state.linkageStatus}
              tagInput={state.tagInput}
              tags={state.tags}
              title={state.title}
              onSelectTab={actions.setActiveTab}
              onChangeChild={actions.setChild}
              onChangeParent={actions.changeParent}
              onChangeTagInput={actions.setTagInput}
              onChangeTitle={actions.setTitle}
              onAddTag={actions.addTag}
              onRemoveTag={actions.removeTag}
              onCopyToClipboard={actions.copyToClipboard}
              onSyncProfile={actions.syncLiveRoomProfile}
              onStartLive={actions.startLive}
              onStopLive={actions.stopLive}
              recentAreas={state.recentAreas}
              hasUnsavedChanges={state.hasUnsavedChanges}
              hasAttentionStatus={state.hasAttentionStatus}
              profileState={state.profileState}
              sectionStatus={state.sectionStatus}
              dirtyStatus={state.dirtyStatus}
              unsavedItems={state.unsavedItems}
              onApplyRecentArea={actions.applyRecentArea}
              onSubmitArea={actions.submitArea}
              onSubmitTags={actions.submitTags}
              onSubmitTitle={actions.submitTitle}
            />
          )}

          {state.activeTab === "danmu" && (
            <DanmuTab
              locale={locale}
              currentUser={state.currentUser}
              danmuEndRef={refs.danmuEndRef}
              danmuText={state.danmuText}
              danmus={state.danmus}
              liveEmoticonPackages={state.liveEmoticonPackages}
              liveEmoticonsLoading={state.liveEmoticonsLoading}
              liveVotePanel={state.liveVotePanel}
              liveVoteHistory={state.liveVoteHistory}
              liveVoteLoading={state.liveVoteLoading}
              liveVoteSubmitting={state.liveVoteSubmitting}
              liveVoteTerminating={state.liveVoteTerminating}
              liveVoteQuestion={state.liveVoteQuestion}
              liveVoteOptionA={state.liveVoteOptionA}
              liveVoteOptionB={state.liveVoteOptionB}
              liveVoteDuration={state.liveVoteDuration}
              liveVoteSelectedTemplateId={state.liveVoteSelectedTemplateId}
              onChangeDanmuText={actions.setDanmuText}
              onRefreshLiveVoteData={actions.refreshLiveVoteData}
              onApplyLiveVoteTemplate={actions.applyLiveVoteTemplate}
              onClearLiveVoteDraft={actions.clearLiveVoteDraft}
              onChangeLiveVoteQuestion={actions.setLiveVoteQuestion}
              onChangeLiveVoteOptionA={actions.setLiveVoteOptionA}
              onChangeLiveVoteOptionB={actions.setLiveVoteOptionB}
              onChangeLiveVoteDuration={actions.setLiveVoteDuration}
              onCreateLiveVote={actions.createLiveVote}
              onTerminateLiveVote={actions.terminateLiveVote}
              onSendDanmu={actions.submitDanmu}
            />
          )}

          {state.activeTab === "settings" && (
            <SettingsTab
              appConfig={state.appConfig}
              hasPendingConfigChanges={state.hasPendingConfigChanges}
              locale={locale}
              savingConfig={state.savingConfig}
              savingLocale={state.savingLocale}
              onChangeConfig={actions.updateAppConfig}
              onChangeLocale={actions.updateLocaleConfig}
              onSaveConfig={actions.saveAppConfig}
              onGenerateHttpUserAgent={actions.generateHttpUserAgent}
            />
          )}
        </div>

        {state.showLogs && (
          <LogDrawer
            locale={locale}
            logs={state.logs}
            onClearLogs={actions.clearLogs}
            onClose={actions.closeLogs}
          />
        )}

        {state.activeTab === "danmu" && state.showLiveOnlineRankPanel && (
          <LiveOnlineRankPanel
            locale={locale}
            liveOnlineRankLoading={state.liveOnlineRankLoading}
            liveOnlineRankItems={state.liveOnlineRankData?.online_rank_items || []}
            onlineAudienceCount={state.liveOnlineRankData?.online_num || 0}
            onRefresh={actions.refreshLiveOnlineRank}
            onClose={actions.closeLiveOnlineRankPanel}
          />
        )}
      </main>

      {state.showFaceModal && (
        <FaceAuthModal
          locale={locale}
          faceQr={state.faceQr}
          faceQrContent={state.faceQrContent}
          onClose={actions.closeFaceModal}
          onRetry={actions.retryStartLive}
        />
      )}
      {state.showConfirmModal && (
        <ConfirmActionModal
          locale={locale}
          title={state.confirmModalTitle}
          description={state.confirmModalDescription}
          confirmText={state.confirmModalConfirmText}
          showCancel={state.confirmModalShowCancel}
          tone={state.confirmModalTone}
          onCancel={actions.cancelConfirmAction}
          onConfirm={actions.confirmAction}
        />
      )}
    </div>
  );
}

export default App;
