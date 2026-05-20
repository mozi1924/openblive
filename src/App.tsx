import "./App.css";
import { HeaderBar } from "./components/layout/HeaderBar";
import { LogDrawer } from "./components/layout/LogDrawer";
import { Sidebar } from "./components/layout/Sidebar";
import { ConfirmActionModal } from "./components/shared/ConfirmActionModal";
import { FaceAuthModal } from "./components/shared/FaceAuthModal";
import { AccountTab } from "./features/account/AccountTab";
import { DanmuTab } from "./features/danmu/DanmuTab";
import { SettingsTab } from "./features/settings/SettingsTab";
import { StreamTab } from "./features/stream/StreamTab";
import { useStudioController } from "./hooks/useStudioController";
import type { LocaleSetting } from "./utils/i18n";

function App() {
  const controller = useStudioController();
  const { actions, refs, state } = controller;
  const locale = (state.appConfig?.locale || "auto") as LocaleSetting;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080b10] text-[#eaeef6] select-none">
      <Sidebar
        activeTab={state.activeTab}
        locale={locale}
        danmuListening={state.danmuListening}
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
        />

        <div className={`flex-1 ${state.activeTab === "danmu" ? "overflow-hidden flex flex-col p-4 md:p-6" : "overflow-y-auto p-8"}`}>
          {state.activeTab === "account" && (
            <AccountTab
              locale={locale}
              accounts={state.accounts}
              currentUser={state.currentUser}
              qrcode={state.qrcode}
              onLoadQrcode={actions.loadQrcode}
              onRequestLogout={actions.requestLogout}
              onPollLogin={actions.pollLogin}
              onRefreshCurrentUser={actions.refreshCurrentUser}
              onSwitchAccount={actions.switchAccount}
            />
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
              danmuListening={state.danmuListening}
              danmuText={state.danmuText}
              danmus={state.danmus}
              liveEmoticonPackages={state.liveEmoticonPackages}
              liveEmoticonsLoading={state.liveEmoticonsLoading}
              onChangeDanmuText={actions.setDanmuText}
              onClearDanmus={actions.clearDanmus}
              onSendDanmu={actions.submitDanmu}
              onStartDanmu={actions.startDanmu}
              onStopDanmu={actions.stopDanmu}
            />
          )}

          {state.activeTab === "settings" && (
            <SettingsTab
              appConfig={state.appConfig}
              locale={locale}
              savingConfig={state.savingConfig}
              savingLocale={state.savingLocale}
              onChangeConfig={actions.updateAppConfig}
              onChangeLocale={actions.updateLocaleConfig}
              onSaveConfig={actions.saveAppConfig}
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
