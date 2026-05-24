import { lazy, Suspense } from "react";
import "./App.css";
import { HeaderBar } from "./components/layout/HeaderBar";
import { LogDrawer } from "./components/layout/LogDrawer";
import { Sidebar } from "./components/layout/Sidebar";
import { ConfirmActionModal } from "./components/shared/ConfirmActionModal";
import { FaceAuthModal } from "./components/shared/FaceAuthModal";
import { TopNoticeStack } from "./components/shared/TopNoticeStack";
import { AccountTab } from "./features/account/AccountTab";
import { DanmuTab } from "./features/danmu/DanmuTab";
import { LiveOnlineRankPanel } from "./features/danmu/LiveOnlineRankPanel";
import { LiveUserManagePanel } from "./features/danmu/LiveUserManagePanel";
import { SettingsTab } from "./features/settings/SettingsTab";
import { ProjectTab } from "./features/project/ProjectTab";
import { StreamTab } from "./features/stream/StreamTab";
import { useStudioController } from "./hooks/useStudioController";
import type { LocaleSetting } from "./utils/i18n";
import { resolveSessionLiveState } from "./utils/liveStatus";

const DashboardTab = lazy(() =>
  import("./features/dashboard/DashboardTab").then((module) => ({
    default: module.DashboardTab,
  })),
);

function App() {
  const controller = useStudioController();
  const { actions, refs, state } = controller;
  const locale = (state.appConfig?.locale || "auto") as LocaleSetting;
  const liveSessionState = resolveSessionLiveState(state.session);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080b10] text-[#eaeef6] select-none">
      <TopNoticeStack notices={state.topNotices} onDismiss={actions.dismissTopNotice} />
      <Sidebar
        activeTab={state.activeTab}
        locale={locale}
        roomId={state.session?.room_id}
        roomBaseHost={state.appConfig?.host_live_web}
        liveSessionPhase={liveSessionState.phase}
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
          userManagePanelOpen={state.showUserManagePanel}
          onShowDanmuOverlay={actions.showDanmuOverlay}
          onHideDanmuOverlay={actions.hideDanmuOverlay}
          onToggleLiveOnlineRankPanel={() => {
            actions.toggleLiveOnlineRankPanel();
            if (!state.showLiveOnlineRankPanel) {
              void actions.refreshLiveOnlineRank();
            }
          }}
          onToggleUserManagePanel={() => {
            actions.toggleUserManagePanel();
          }}
          onClearDanmus={actions.clearDanmus}
        />

        <div className={`flex-1 ${state.activeTab === "danmu" ? "overflow-hidden flex flex-col" : "overflow-y-auto p-8 app-scrollbar"}`}>
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
              cover={state.cover}
              coverRenderSrc={state.coverRenderSrc}
              coverAdvice={state.coverAdvice}
              coverAdviceLoading={state.coverAdviceLoading}
              coverHistory={state.coverHistory}
              coverHistoryLoading={state.coverHistoryLoading}
              parent={state.parent}
              pendingCoverUpload={state.pendingCoverUpload}
              partitions={state.partitions}
              rtmp={state.rtmp}
              session={state.session}
              linkageStatus={state.linkageStatus}
              tagInput={state.tagInput}
              tags={state.tags}
              title={state.title}
              roomNews={state.roomNews}
              liveReserveTitle={state.liveReserveTitle}
              liveReserveStartAt={state.liveReserveStartAt}
              liveReserveCreateDynamic={state.liveReserveCreateDynamic}
              onSelectTab={actions.setActiveTab}
              onChangeChild={actions.setChild}
              onChangeParent={actions.changeParent}
              onChangeTagInput={actions.setTagInput}
              onChangeTitle={actions.setTitle}
              onChangeRoomNews={actions.setRoomNews}
              onChangeLiveReserveTitle={actions.setLiveReserveTitle}
              onChangeLiveReserveStartAt={actions.setLiveReserveStartAt}
              onChangeLiveReserveCreateDynamic={actions.setLiveReserveCreateDynamic}
              onAddTag={actions.addTag}
              onSelectCoverFile={actions.selectCoverFile}
              onSelectHistoryCover={actions.selectHistoryCover}
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
              onSubmitCover={actions.submitCover}
              onSubmitTitle={actions.submitTitle}
              onSubmitRoomNews={actions.submitRoomNews}
              onSubmitLiveReserve={actions.submitLiveReserve}
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
              silentUserIds={(state.liveSilentUserList?.items || []).map((item) => item.tuid)}
              blackUserIds={(state.liveBlackUserList?.items || []).map((item) => item.mid)}
              roomAdminUserIds={(state.liveRoomAdminList?.items || []).map((item) => item.uid)}
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
              onRequestMuteUser={actions.requestMuteUserByDanmu}
              onRequestBlackUser={actions.requestBlackUserByDanmu}
              onRequestRoomAdmin={actions.requestRoomAdminByDanmu}
              onRequestUnroomAdmin={actions.requestRemoveRoomAdminByDanmu}
            />
          )}

          {state.activeTab === "project" && (
            <ProjectTab
              locale={locale}
              appVersion={state.appVersion}
              appBundleType={state.appBundleType}
              availableAppUpdateVersion={state.availableAppUpdateVersion}
              checkingAppUpdate={state.checkingAppUpdate}
              installingAppUpdate={state.installingAppUpdate}
              onCheckAppUpdate={actions.checkAppUpdate}
              onRunPlatformUpdateAction={actions.runPlatformUpdateAction}
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

        {state.activeTab === "danmu" && state.showUserManagePanel && (
          <LiveUserManagePanel
            locale={locale}
            activeTab={state.userManageActiveTab}
            onChangeTab={actions.setUserManageActiveTab}
            silentListLoading={state.liveSilentUserListLoading}
            silentList={state.liveSilentUserList?.items || []}
            silentTotal={state.liveSilentUserList?.total || 0}
            silentPage={state.liveSilentUserList?.page || 1}
            silentPageSize={state.liveSilentUserList?.page_size || 20}
            silentTotalPage={state.liveSilentUserList?.total_page || 1}
            onRefreshSilentList={actions.refreshSilentUserList}
            onChangeSilentPage={actions.changeSilentUserPage}
            onRequestRemoveSilentUser={actions.requestRemoveSilentUser}
            blackListLoading={state.liveBlackUserListLoading}
            blackList={state.liveBlackUserList?.items || []}
            blackTotal={state.liveBlackUserList?.total || 0}
            blackPage={state.liveBlackUserList?.page || 1}
            blackPageSize={state.liveBlackUserList?.page_size || 50}
            blackTotalPage={state.liveBlackUserList?.total_page || 1}
            onRefreshBlackList={actions.refreshBlackUserList}
            onChangeBlackPage={actions.changeBlackUserPage}
            onRequestRemoveBlackUser={actions.requestRemoveBlackUser}
            roomAdminListLoading={state.liveRoomAdminListLoading}
            roomAdminList={state.liveRoomAdminList?.items || []}
            roomAdminTotal={state.liveRoomAdminList?.total || 0}
            roomAdminPage={state.liveRoomAdminList?.page || 1}
            roomAdminPageSize={state.liveRoomAdminList?.page_size || 20}
            roomAdminTotalPage={state.liveRoomAdminList?.total_page || 1}
            onRefreshRoomAdminList={actions.refreshRoomAdminList}
            onChangeRoomAdminPage={actions.changeRoomAdminPage}
            onRequestRemoveRoomAdmin={actions.requestRemoveRoomAdmin}
            onClose={actions.closeUserManagePanel}
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
          selectLabel={state.confirmModalSelectLabel}
          selectOptions={state.confirmModalSelectOptions}
          selectValue={state.confirmModalSelectValue}
          onSelectValueChange={actions.setConfirmSelectValue}
          onCancel={actions.cancelConfirmAction}
          onConfirm={actions.confirmAction}
        />
      )}
    </div>
  );
}

export default App;
