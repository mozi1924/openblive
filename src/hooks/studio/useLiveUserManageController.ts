import { useCallback, useMemo, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type {
  DanmuMsg,
  LiveBlackUserItem,
  LiveBlackUserListData,
  LiveRoomAdminItem,
  LiveRoomAdminListData,
  LiveSilentUserItem,
  LiveSilentUserListData,
} from "../../types/studio";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";

type ConfirmModalTone = "primary" | "danger";
type ConfirmModalSelectOption = {
  value: string;
  label: string;
};

type ConfirmRequestPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: ConfirmModalTone;
  selectLabel?: string;
  selectOptions?: ConfirmModalSelectOption[];
  selectValue?: string;
};

type UseLiveUserManageControllerParams = {
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  currentUserUid?: string;
  showUserManagePanel: boolean;
  requestConfirm: (payload: ConfirmRequestPayload) => Promise<boolean>;
  getConfirmSelectValue: () => string;
};

export function useLiveUserManageController({
  localeSetting,
  append,
  currentUserUid,
  showUserManagePanel,
  requestConfirm,
  getConfirmSelectValue,
}: UseLiveUserManageControllerParams) {
  const [userManageActiveTab, setUserManageActiveTab] = useState<
    "silent" | "blacklist" | "room_admin"
  >("silent");
  const [liveSilentUserListLoading, setLiveSilentUserListLoading] = useState(false);
  const [liveSilentUserList, setLiveSilentUserList] = useState<LiveSilentUserListData | null>(null);
  const [liveBlackUserListLoading, setLiveBlackUserListLoading] = useState(false);
  const [liveBlackUserList, setLiveBlackUserList] = useState<LiveBlackUserListData | null>(null);
  const [liveRoomAdminListLoading, setLiveRoomAdminListLoading] = useState(false);
  const [liveRoomAdminList, setLiveRoomAdminList] = useState<LiveRoomAdminListData | null>(null);

  const muteDurationOptions = useMemo<ConfirmModalSelectOption[]>(
    () => [
      { value: "10", label: t(localeSetting, "ui.danmu.user_manage.duration.10m") },
      { value: "30", label: t(localeSetting, "ui.danmu.user_manage.duration.30m") },
      { value: "60", label: t(localeSetting, "ui.danmu.user_manage.duration.1h") },
      { value: "360", label: t(localeSetting, "ui.danmu.user_manage.duration.6h") },
      { value: "0", label: t(localeSetting, "ui.danmu.user_manage.duration.session") },
      { value: "-1", label: t(localeSetting, "ui.danmu.user_manage.duration.forever") },
    ],
    [localeSetting],
  );

  const refreshSilentUserList = useCallback(
    async (options?: { silent?: boolean; page?: number }) => {
      const page = Math.max(options?.page ?? liveSilentUserList?.page ?? 1, 1);
      setLiveSilentUserListLoading(true);
      try {
        const res = await studioApi.getSilentUserList(page);
        if (res.code === 0 && res.data) {
          setLiveSilentUserList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_silent_user_list_load_failed", {
              msg: resolveBackendMessage(res.msg, localeSetting),
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_silent_user_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveSilentUserListLoading(false);
      }
    },
    [append, liveSilentUserList?.page, localeSetting],
  );

  const refreshBlackUserList = useCallback(
    async (options?: { silent?: boolean; page?: number; pageSize?: number }) => {
      const page = Math.max(options?.page ?? liveBlackUserList?.page ?? 1, 1);
      const pageSize = Math.max(options?.pageSize ?? liveBlackUserList?.page_size ?? 50, 1);
      setLiveBlackUserListLoading(true);
      try {
        const res = await studioApi.getBlackUserList(page, pageSize);
        if (res.code === 0 && res.data) {
          setLiveBlackUserList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_black_user_list_load_failed", {
              msg: resolveBackendMessage(res.msg, localeSetting),
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_black_user_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveBlackUserListLoading(false);
      }
    },
    [append, liveBlackUserList?.page, liveBlackUserList?.page_size, localeSetting],
  );

  const refreshRoomAdminList = useCallback(
    async (options?: { silent?: boolean; page?: number }) => {
      const page = Math.max(options?.page ?? liveRoomAdminList?.page ?? 1, 1);
      setLiveRoomAdminListLoading(true);
      try {
        const res = await studioApi.getRoomAdminList(page);
        if (res.code === 0 && res.data) {
          setLiveRoomAdminList(res.data);
          return;
        }
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_room_admin_list_load_failed", {
              msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
            }),
          );
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.ctrl.live_room_admin_list_load_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setLiveRoomAdminListLoading(false);
      }
    },
    [append, liveRoomAdminList?.page, localeSetting],
  );

  const requestMuteUserByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUserUid ? Number(currentUserUid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_silent_user_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.silent.title", { name: senderName }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.silent.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.silent.confirm"),
        tone: "danger",
        selectLabel: t(localeSetting, "ui.danmu.user_manage.confirm.silent.duration"),
        selectOptions: muteDurationOptions,
        selectValue: "-1",
      });
      if (!accepted) {
        return;
      }

      const duration = Number.parseInt(getConfirmSelectValue() || "-1", 10);
      const muteHours = Number.isFinite(duration) ? duration : -1;
      const res = await studioApi.addSilentUser(
        senderUid,
        muteHours,
        resolveBackendMessage(message.content, localeSetting).trim() || undefined,
      );
      if (res.code === 0) {
        const durationLabel =
          muteDurationOptions.find((option) => option.value === String(muteHours))?.label ||
          String(muteHours);
        append(
          tf(localeSetting, "ui.ctrl.live_silent_user_added", {
            name: senderName,
            duration: durationLabel,
          }),
        );
        if (showUserManagePanel) {
          void refreshSilentUserList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_silent_user_add_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [
      append,
      currentUserUid,
      getConfirmSelectValue,
      localeSetting,
      muteDurationOptions,
      refreshSilentUserList,
      requestConfirm,
      showUserManagePanel,
    ],
  );

  const requestBlackUserByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUserUid ? Number(currentUserUid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_black_user_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.black.title", { name: senderName }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.black.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.black.confirm"),
        tone: "danger",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.addBlackUser(senderUid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_black_user_added", { name: senderName }));
        if (showUserManagePanel) {
          void refreshBlackUserList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_black_user_add_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [append, currentUserUid, localeSetting, refreshBlackUserList, requestConfirm, showUserManagePanel],
  );

  const requestRoomAdminByDanmu = useCallback(
    async (message: DanmuMsg) => {
      const senderUid = typeof message.sender_uid === "number" ? message.sender_uid : Number.NaN;
      const currentUid = currentUserUid ? Number(currentUserUid) : Number.NaN;
      if (!Number.isFinite(senderUid) || senderUid <= 0 || senderUid === currentUid) {
        append(t(localeSetting, "ui.ctrl.live_room_admin_invalid_target"));
        return;
      }

      const senderName =
        resolveBackendMessage(message.sender, localeSetting).trim() ||
        t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.room_admin.title", {
          name: senderName,
        }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.room_admin.desc", {
          name: senderName,
          uid: senderUid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.room_admin.confirm"),
        tone: "danger",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.addRoomAdmin(senderUid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_room_admin_added", { name: senderName }));
        if (showUserManagePanel) {
          void refreshRoomAdminList({ silent: true });
        }
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_room_admin_add_failed", {
          msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
        }),
      );
    },
    [append, currentUserUid, localeSetting, refreshRoomAdminList, requestConfirm, showUserManagePanel],
  );

  const requestRemoveSilentUser = useCallback(
    async (item: LiveSilentUserItem) => {
      const name = item.tname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unsilent.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unsilent.desc", {
          name,
          uid: item.tuid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unsilent.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeSilentUser(item.id);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_silent_user_removed", { name }));
        await refreshSilentUserList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_silent_user_remove_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [append, localeSetting, refreshSilentUserList, requestConfirm],
  );

  const requestRemoveBlackUser = useCallback(
    async (item: LiveBlackUserItem) => {
      const name = item.uname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unblack.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unblack.desc", {
          name,
          uid: item.mid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unblack.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeBlackUser(item.mid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_black_user_removed", { name }));
        await refreshBlackUserList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_black_user_remove_failed", {
          msg: resolveBackendMessage(res.msg, localeSetting),
        }),
      );
    },
    [append, localeSetting, refreshBlackUserList, requestConfirm],
  );

  const requestRemoveRoomAdmin = useCallback(
    async (item: LiveRoomAdminItem) => {
      const name = item.uname.trim() || t(localeSetting, "ui.danmu.sender.anonymous");
      const accepted = await requestConfirm({
        title: tf(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.title", { name }),
        description: tf(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.desc", {
          name,
          uid: item.uid,
        }),
        confirmText: t(localeSetting, "ui.danmu.user_manage.confirm.unroom_admin.confirm"),
        tone: "primary",
      });
      if (!accepted) {
        return;
      }

      const res = await studioApi.removeRoomAdmin(item.uid);
      if (res.code === 0) {
        append(tf(localeSetting, "ui.ctrl.live_room_admin_removed", { name }));
        await refreshRoomAdminList({ silent: true });
        return;
      }
      append(
        tf(localeSetting, "ui.ctrl.live_room_admin_remove_failed", {
          msg: `${resolveBackendMessage(res.msg, localeSetting)} (code: ${res.code})`,
        }),
      );
    },
    [append, localeSetting, refreshRoomAdminList, requestConfirm],
  );

  const changeRoomAdminPage = useCallback(
    (page: number) => {
      void refreshRoomAdminList({ page, silent: true });
    },
    [refreshRoomAdminList],
  );

  const changeSilentUserPage = useCallback(
    (page: number) => {
      void refreshSilentUserList({ page, silent: true });
    },
    [refreshSilentUserList],
  );

  const changeBlackUserPage = useCallback(
    (page: number) => {
      void refreshBlackUserList({ page, silent: true });
    },
    [refreshBlackUserList],
  );

  const changeUserManageTab = useCallback(
    (tab: "silent" | "blacklist" | "room_admin") => {
      setUserManageActiveTab(tab);
      if (tab === "silent") {
        void refreshSilentUserList({ silent: true });
      } else if (tab === "blacklist") {
        void refreshBlackUserList({ silent: true });
      } else {
        void refreshRoomAdminList({ silent: true });
      }
    },
    [refreshBlackUserList, refreshRoomAdminList, refreshSilentUserList],
  );

  return {
    state: {
      userManageActiveTab,
      liveSilentUserList,
      liveSilentUserListLoading,
      liveBlackUserList,
      liveBlackUserListLoading,
      liveRoomAdminList,
      liveRoomAdminListLoading,
    },
    actions: {
      refreshSilentUserList,
      refreshBlackUserList,
      refreshRoomAdminList,
      requestMuteUserByDanmu,
      requestBlackUserByDanmu,
      requestRoomAdminByDanmu,
      requestRemoveSilentUser,
      requestRemoveBlackUser,
      requestRemoveRoomAdmin,
      changeRoomAdminPage,
      changeSilentUserPage,
      changeBlackUserPage,
      changeUserManageTab,
    },
  };
}
