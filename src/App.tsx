import "./App.css";
import { HeaderBar } from "./components/layout/HeaderBar";
import { LogDrawer } from "./components/layout/LogDrawer";
import { Sidebar } from "./components/layout/Sidebar";
import { FaceAuthModal } from "./components/shared/FaceAuthModal";
import { AccountTab } from "./features/account/AccountTab";
import { DanmuTab } from "./features/danmu/DanmuTab";
import { StreamTab } from "./features/stream/StreamTab";
import { useStudioController } from "./hooks/useStudioController";

function App() {
  const controller = useStudioController();
  const { actions, refs, state } = controller;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#080b10] text-[#eaeef6] select-none">
      <Sidebar
        activeTab={state.activeTab}
        danmuListening={state.danmuListening}
        roomId={state.session?.room_id}
        sessionLive={state.session?.is_live ?? false}
        showLogs={state.showLogs}
        sidebarDragRef={refs.sidebarDragRef}
        onSelectTab={actions.setActiveTab}
        onToggleLogs={actions.toggleLogs}
      />

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <HeaderBar
          activeTab={state.activeTab}
          headerDragRef={refs.headerDragRef}
          onRefreshAccounts={actions.loadAccounts}
          onRefreshPartitions={actions.loadPartitions}
        />

        <div className="flex-1 overflow-y-auto p-8">
          {state.activeTab === "account" && (
            <AccountTab
              accounts={state.accounts}
              currentUser={state.currentUser}
              qrcode={state.qrcode}
              onLoadQrcode={actions.loadQrcode}
              onLogout={actions.logout}
              onPollLogin={actions.pollLogin}
              onRefreshCurrentUser={actions.refreshCurrentUser}
              onSwitchAccount={actions.switchAccount}
            />
          )}

          {state.activeTab === "stream" && (
            <StreamTab
              child={state.child}
              children={state.children}
              copiedKey={state.copiedKey}
              parent={state.parent}
              partitions={state.partitions}
              rtmp={state.rtmp}
              session={state.session}
              showStreamKey={state.showStreamKey}
              tagInput={state.tagInput}
              tags={state.tags}
              title={state.title}
              onChangeChild={actions.setChild}
              onChangeParent={actions.changeParent}
              onChangeShowStreamKey={actions.setShowStreamKey}
              onChangeTagInput={actions.setTagInput}
              onChangeTitle={actions.setTitle}
              onAddTag={actions.addTag}
              onRemoveTag={actions.removeTag}
              onCopyToClipboard={actions.copyToClipboard}
              onSyncProfile={actions.syncLiveRoomProfile}
              onStartLive={actions.startLive}
              onStopLive={actions.stopLive}
              onSubmitArea={actions.submitArea}
              onSubmitTags={actions.submitTags}
              onSubmitTitle={actions.submitTitle}
            />
          )}

          {state.activeTab === "danmu" && (
            <DanmuTab
              danmuEndRef={refs.danmuEndRef}
              danmuListening={state.danmuListening}
              danmuText={state.danmuText}
              danmus={state.danmus}
              onChangeDanmuText={actions.setDanmuText}
              onClearDanmus={actions.clearDanmus}
              onSendDanmu={actions.submitDanmu}
              onStartDanmu={actions.startDanmu}
              onStopDanmu={actions.stopDanmu}
            />
          )}
        </div>

        {state.showLogs && (
          <LogDrawer
            logs={state.logs}
            onClearLogs={actions.clearLogs}
            onClose={actions.closeLogs}
          />
        )}
      </main>

      {state.showFaceModal && (
        <FaceAuthModal
          faceQr={state.faceQr}
          onClose={actions.closeFaceModal}
          onRetry={actions.retryStartLive}
        />
      )}
    </div>
  );
}

export default App;
