import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { studioApi } from "../../services/studioApi";
import type {
  LiveProfileState,
  User,
} from "../../types/studio";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";
import { isValidUser, normalizeProfileState } from "./controllerHelpers";

type RequestConfirmPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: "primary" | "danger";
};

type UseAccountControllerParams = {
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  qrcode: string;
  qrcodeKey: string;
  activeUidRef: MutableRefObject<string | null>;
  currentUserRef: MutableRefObject<User | null>;
  titleDirtyRef: MutableRefObject<boolean>;
  areaDirtyRef: MutableRefObject<boolean>;
  tagsDirtyRef: MutableRefObject<boolean>;
  coverDirtyRef: MutableRefObject<boolean>;
  roomNewsDirtyRef: MutableRefObject<boolean>;
  coverDraftVersionRef: MutableRefObject<number>;
  loginPollBusyRef: MutableRefObject<boolean>;
  loginStatusCodeRef: MutableRefObject<number | null>;
  qrcodeRefreshBusyRef: MutableRefObject<boolean>;
  qrLoginExpiresAtRef: MutableRefObject<number | null>;
  qrLoginSessionNonceRef: MutableRefObject<number>;
  setQrLoginExpiresAt: Dispatch<SetStateAction<number | null>>;
  setQrLoginRemainingSeconds: Dispatch<SetStateAction<number>>;
  setQrcode: Dispatch<SetStateAction<string>>;
  setQrcodeKey: Dispatch<SetStateAction<string>>;
  setQrLoginTimedOut: Dispatch<SetStateAction<boolean>>;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  setDanmuListening: Dispatch<SetStateAction<boolean>>;
  setDanmus: Dispatch<SetStateAction<import("../../types/studio").DanmuMsg[]>>;
  setTitle: Dispatch<SetStateAction<string>>;
  setParent: Dispatch<SetStateAction<string>>;
  setChild: Dispatch<SetStateAction<string>>;
  setTags: Dispatch<SetStateAction<string[]>>;
  setCover: Dispatch<SetStateAction<string>>;
  setTagInput: Dispatch<SetStateAction<string>>;
  setRecentAreas: Dispatch<SetStateAction<import("./controllerHelpers").RecentArea[]>>;
  setAccounts: Dispatch<SetStateAction<User[]>>;
  setShowFaceModal: Dispatch<SetStateAction<boolean>>;
  applyProfileState: (nextState?: LiveProfileState | null) => void;
  applyUserDraftValues: (
    user: User,
    options?: {
      allowCover?: boolean;
      forceTitle?: boolean;
      forceArea?: boolean;
      forceTags?: boolean;
      forceCover?: boolean;
      forceRoomNews?: boolean;
    },
  ) => void;
  clearDanmuAssetsAndVoteState: () => void;
  resetQrLoginStateExternal?: () => void;
  refreshSession: () => Promise<void>;
  syncTrayMenu: () => Promise<void>;
  requestConfirm: (payload: RequestConfirmPayload) => Promise<boolean>;
};

const QR_LOGIN_TIMEOUT_MS = 2 * 60 * 1000;

export function useAccountController({
  localeSetting,
  append,
  qrcode,
  qrcodeKey,
  activeUidRef,
  currentUserRef,
  titleDirtyRef,
  areaDirtyRef,
  tagsDirtyRef,
  coverDirtyRef,
  roomNewsDirtyRef,
  coverDraftVersionRef,
  loginPollBusyRef,
  loginStatusCodeRef,
  qrcodeRefreshBusyRef,
  qrLoginExpiresAtRef,
  qrLoginSessionNonceRef,
  setQrLoginExpiresAt,
  setQrLoginRemainingSeconds,
  setQrcode,
  setQrcodeKey,
  setQrLoginTimedOut,
  setCurrentUser,
  setDanmuListening,
  setDanmus,
  setTitle,
  setParent,
  setChild,
  setTags,
  setCover,
  setTagInput,
  setRecentAreas,
  setAccounts,
  setShowFaceModal,
  applyProfileState,
  applyUserDraftValues,
  clearDanmuAssetsAndVoteState,
  resetQrLoginStateExternal,
  refreshSession,
  syncTrayMenu,
  requestConfirm,
}: UseAccountControllerParams) {
  const resetQrLoginState = useCallback(() => {
    qrLoginSessionNonceRef.current += 1;
    qrLoginExpiresAtRef.current = null;
    setQrLoginExpiresAt(null);
    setQrLoginRemainingSeconds(0);
    setQrcode("");
    setQrcodeKey("");
    loginStatusCodeRef.current = null;
    resetQrLoginStateExternal?.();
  }, [
    loginStatusCodeRef,
    qrLoginExpiresAtRef,
    qrLoginSessionNonceRef,
    resetQrLoginStateExternal,
    setQrcode,
    setQrcodeKey,
    setQrLoginExpiresAt,
    setQrLoginRemainingSeconds,
  ]);

  const cancelQrcodeLogin = useCallback(
    (reason: "timeout" | "manual" = "manual") => {
      if (!qrcodeKey && !qrcode) {
        return;
      }
      resetQrLoginState();
      setQrLoginTimedOut(reason === "timeout");
      if (reason === "timeout") {
        append(t(localeSetting, "ui.ctrl.qr_login_timeout"));
      }
    },
    [append, localeSetting, qrcode, qrcodeKey, resetQrLoginState, setQrLoginTimedOut],
  );

  const applyUserSession = useCallback(
    async (user: User, options?: { forceAll?: boolean; clearDanmu?: boolean }) => {
      const force = options?.forceAll ?? false;
      const clearDanmu = options?.clearDanmu ?? false;
      const isAccountSwitched = force || activeUidRef.current !== user.uid;

      activeUidRef.current = user.uid;
      setCurrentUser(user);
      applyProfileState(user.live_profile_state);

      if (clearDanmu) {
        setDanmus([]);
        clearDanmuAssetsAndVoteState();
      }

      applyUserDraftValues(user, {
        forceTitle: isAccountSwitched,
        forceArea: isAccountSwitched,
        forceTags: isAccountSwitched,
        forceCover: isAccountSwitched,
        forceRoomNews: isAccountSwitched,
      });

      if (isAccountSwitched) {
        titleDirtyRef.current = false;
        areaDirtyRef.current = false;
        tagsDirtyRef.current = false;
        coverDirtyRef.current = false;
        roomNewsDirtyRef.current = false;
      }

      setRecentAreas(user.recent_areas || []);
      await syncTrayMenu();
    },
    [
      activeUidRef,
      applyProfileState,
      applyUserDraftValues,
      areaDirtyRef,
      clearDanmuAssetsAndVoteState,
      coverDirtyRef,
      roomNewsDirtyRef,
      setDanmus,
      setRecentAreas,
      setCurrentUser,
      syncTrayMenu,
      tagsDirtyRef,
      titleDirtyRef,
    ],
  );

  const loadSavedUser = useCallback(async () => {
    const res = await studioApi.loadSavedConfig();
    const user = isValidUser(res.data) ? res.data : null;

    if (!user) {
      setCurrentUser(null);
      clearDanmuAssetsAndVoteState();
      applyProfileState();
      activeUidRef.current = null;
      setDanmuListening(false);
      titleDirtyRef.current = false;
      areaDirtyRef.current = false;
      tagsDirtyRef.current = false;
      coverDirtyRef.current = false;
      roomNewsDirtyRef.current = false;
      setTitle(t(localeSetting, "ui.ctrl.default_title"));
      setParent("");
      setChild("");
      setTags([]);
      setCover("");
      setTagInput("");
      setRecentAreas([]);
      await syncTrayMenu();
      return;
    }

    await applyUserSession(user);
  }, [
    activeUidRef,
    applyProfileState,
    applyUserSession,
    areaDirtyRef,
    clearDanmuAssetsAndVoteState,
    coverDirtyRef,
    localeSetting,
    roomNewsDirtyRef,
    setChild,
    setCover,
    setCurrentUser,
    setDanmuListening,
    setParent,
    setRecentAreas,
    setTagInput,
    setTags,
    setTitle,
    syncTrayMenu,
    tagsDirtyRef,
    titleDirtyRef,
  ]);

  const loadAccounts = useCallback(async () => {
    const res = await studioApi.getAccountList();
    if (res.code === 0 && res.data) {
      setAccounts(res.data.list || []);
      const backendCurrentUid = res.data.current_uid || null;
      if (backendCurrentUid !== activeUidRef.current) {
        await loadSavedUser();
      }
    }
  }, [activeUidRef, loadSavedUser, setAccounts]);

  const syncLiveRoomProfile = useCallback(async (forceAllDrafts = false) => {
    const requestUid = activeUidRef.current;
    const coverDraftVersionAtRequest = coverDraftVersionRef.current;
    try {
      const res = await studioApi.syncLiveRoomProfile();
      if (res.code !== 0 || !res.data) {
        return null;
      }
      if (requestUid !== activeUidRef.current) {
        return null;
      }

      const nextProfileState = normalizeProfileState(res.data.profile_state);
      applyProfileState(nextProfileState);
      const profilePatch = {
        last_title: res.data.title || nextProfileState.title.submitted,
        last_room_news: res.data.room_news ?? currentUserRef.current?.last_room_news ?? "",
        last_area_name: [
          res.data.parent || nextProfileState.area.submitted_parent,
          res.data.child || nextProfileState.area.submitted_child,
        ].filter(Boolean),
        last_tags: Array.isArray(res.data.tags) ? res.data.tags : nextProfileState.tags.submitted,
        last_cover: res.data.cover || nextProfileState.cover.submitted,
        last_cover_asset: res.data.cover_asset_url || currentUserRef.current?.last_cover_asset || "",
        live_profile_state: nextProfileState,
      } as Pick<
        User,
        | "last_title"
        | "last_room_news"
        | "last_area_name"
        | "last_tags"
        | "last_cover"
        | "last_cover_asset"
        | "live_profile_state"
      >;
      const draftUser = {
        ...(currentUserRef.current || {
          uid: activeUidRef.current || "",
          uname: "",
          face: "",
          level: 0,
          follower: 0,
          last_title: "",
          last_area_name: [],
          last_tags: [],
          last_cover: "",
          last_cover_asset: "",
          live_profile_state: nextProfileState,
        }),
        ...profilePatch,
      } as User;
      applyUserDraftValues(draftUser, {
        allowCover: coverDraftVersionAtRequest === coverDraftVersionRef.current,
        forceTitle: forceAllDrafts,
        forceArea: forceAllDrafts,
        forceTags: forceAllDrafts,
        forceCover: forceAllDrafts,
        forceRoomNews: forceAllDrafts,
      });
      if (forceAllDrafts) {
        roomNewsDirtyRef.current = false;
      }
      setCurrentUser((prev) => {
        if (!prev) {
          return draftUser;
        }
        return {
          ...prev,
          ...profilePatch,
        };
      });

      append(
        res.data.from_cache
          ? t(localeSetting, "ui.ctrl.sync_profile_failed_rollback")
          : t(localeSetting, "ui.ctrl.sync_profile_ok"),
      );
      return res.data;
    } catch {
      append(t(localeSetting, "ui.ctrl.sync_profile_failed_keep"));
      return null;
    }
  }, [
    activeUidRef,
    append,
    applyProfileState,
    applyUserDraftValues,
    coverDraftVersionRef,
    currentUserRef,
    localeSetting,
    setCurrentUser,
  ]);

  const loadQrcode = useCallback(async (options?: { preserveDeadline?: boolean }) => {
    if (qrcodeRefreshBusyRef.current) {
      return;
    }

    const now = Date.now();
    const nextExpiresAt =
      options?.preserveDeadline && qrLoginExpiresAtRef.current
        ? qrLoginExpiresAtRef.current
        : now + QR_LOGIN_TIMEOUT_MS;
    if (nextExpiresAt <= now) {
      cancelQrcodeLogin("timeout");
      return;
    }

    if (!options?.preserveDeadline) {
      qrLoginSessionNonceRef.current += 1;
      setQrLoginTimedOut(false);
    }
    const requestNonce = qrLoginSessionNonceRef.current;

    qrcodeRefreshBusyRef.current = true;
    setQrcode("");
    setQrcodeKey("");
    loginStatusCodeRef.current = null;
    qrLoginExpiresAtRef.current = nextExpiresAt;
    setQrLoginExpiresAt(nextExpiresAt);
    setQrLoginRemainingSeconds(Math.ceil((nextExpiresAt - now) / 1000));

    try {
      const res = await studioApi.getLoginQrcode();
      if (requestNonce !== qrLoginSessionNonceRef.current) {
        return;
      }
      if (Date.now() >= nextExpiresAt) {
        cancelQrcodeLogin("timeout");
        return;
      }
      if (res.code === 0 && res.data?.content) {
        if (!res.data.image_src) {
          append(t(localeSetting, "ui.ctrl.qr_render_failed"));
          return;
        }
        setQrcode(res.data.image_src);
        setQrcodeKey(res.data.qrcode_key || "");
        append(t(localeSetting, "ui.ctrl.qr_ready"));
        return;
      }

      append(
        tf(localeSetting, "ui.ctrl.qr_fetch_failed", {
          msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.api_error"), localeSetting),
        }),
      );
    } catch (error) {
      append(
        tf(localeSetting, "ui.ctrl.qr_fetch_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      qrcodeRefreshBusyRef.current = false;
    }
  }, [
    append,
    cancelQrcodeLogin,
    localeSetting,
    loginStatusCodeRef,
    qrLoginExpiresAtRef,
    qrLoginSessionNonceRef,
    qrcodeRefreshBusyRef,
    setQrcode,
    setQrcodeKey,
    setQrLoginExpiresAt,
    setQrLoginRemainingSeconds,
    setQrLoginTimedOut,
  ]);

  const pollLogin = useCallback(async (silent = false) => {
    if (!qrcodeKey) {
      return;
    }
    const expiresAt = qrLoginExpiresAtRef.current;
    if (!expiresAt || Date.now() >= expiresAt) {
      cancelQrcodeLogin("timeout");
      return;
    }
    if (loginPollBusyRef.current) {
      return;
    }
    loginPollBusyRef.current = true;

    try {
      const res = await studioApi.pollLoginStatus(qrcodeKey);
      if (res.code === 0 && res.data) {
        loginStatusCodeRef.current = 0;
        await applyUserSession(res.data, { forceAll: true, clearDanmu: true });
        append(
          tf(localeSetting, "ui.ctrl.login_success", {
            name: res.data.uname || t(localeSetting, "ui.ctrl.user_fallback"),
          }),
        );
        await refreshSession();
        await loadAccounts();
        await syncLiveRoomProfile(true);
        resetQrLoginState();
        setQrLoginTimedOut(false);
        return;
      }

      const code = res.code;
      const statusChanged = loginStatusCodeRef.current !== code;
      loginStatusCodeRef.current = code;

      if (code === 86038) {
        if (!silent || statusChanged) {
          append(t(localeSetting, "ui.ctrl.qr_expired_refreshing"));
        }
        await loadQrcode({ preserveDeadline: true });
        return;
      }

      if (!silent || statusChanged) {
        append(
          tf(localeSetting, "ui.ctrl.login_status", {
            msg: resolveBackendMessage(res.msg || t(localeSetting, "ui.ctrl.login_pending"), localeSetting),
            code,
          }),
        );
      }
    } finally {
      loginPollBusyRef.current = false;
    }
  }, [
    activeUidRef,
    append,
    applyProfileState,
    applyUserDraftValues,
    areaDirtyRef,
    cancelQrcodeLogin,
    clearDanmuAssetsAndVoteState,
    loadAccounts,
    loadQrcode,
    localeSetting,
    loginPollBusyRef,
    loginStatusCodeRef,
    qrcodeKey,
    qrLoginExpiresAtRef,
    refreshSession,
    resetQrLoginState,
    setCurrentUser,
    setDanmuListening,
    setDanmus,
    setQrLoginTimedOut,
    setRecentAreas,
    syncLiveRoomProfile,
    tagsDirtyRef,
    titleDirtyRef,
    roomNewsDirtyRef,
  ]);

  const switchAccount = useCallback(
    async (uid: string) => {
      try {
        const res = await studioApi.switchAccount(uid);
        if (res.code === 0 && res.data) {
          await applyUserSession(res.data, { forceAll: true, clearDanmu: true });
          setShowFaceModal(false);
          append(tf(localeSetting, "ui.ctrl.switched_account", { name: res.data.uname }));
          await refreshSession();
          await loadAccounts();
          await syncLiveRoomProfile(true);
        }
      } catch (error) {
        append(
          tf(localeSetting, "ui.ctrl.switch_failed", {
            msg: resolveBackendMessage(String(error), localeSetting),
          }),
        );
      }
    },
    [
      activeUidRef,
      append,
      applyProfileState,
      applyUserDraftValues,
      areaDirtyRef,
      clearDanmuAssetsAndVoteState,
      loadAccounts,
      localeSetting,
      refreshSession,
      setCurrentUser,
      setDanmuListening,
      setDanmus,
      setRecentAreas,
      setShowFaceModal,
      syncLiveRoomProfile,
      tagsDirtyRef,
      titleDirtyRef,
      roomNewsDirtyRef,
    ],
  );

  const logout = useCallback(
    async (uid: string) => {
      if (activeUidRef.current === uid) {
        setDanmuListening(false);
        setDanmus([]);
        clearDanmuAssetsAndVoteState();
      }
      const res = await studioApi.logout(uid);
      if (res.code === 0) {
        append(t(localeSetting, "ui.ctrl.logged_out"));
        await loadAccounts();
        await loadSavedUser();
        await refreshSession();
      }
    },
    [
      activeUidRef,
      append,
      clearDanmuAssetsAndVoteState,
      loadAccounts,
      loadSavedUser,
      localeSetting,
      refreshSession,
      setDanmuListening,
      setDanmus,
    ],
  );

  const requestLogout = useCallback(
    async (user: User, current: boolean) => {
      const confirmed = await requestConfirm({
        title: current
          ? t(localeSetting, "ui.account.logout_current")
          : t(localeSetting, "ui.account.delete"),
        description: current
          ? t(localeSetting, "ui.account.confirm.logout_current")
          : tf(localeSetting, "ui.account.confirm.delete_account", { name: user.uname }),
        confirmText: current
          ? t(localeSetting, "ui.account.logout_current")
          : t(localeSetting, "ui.account.delete"),
        tone: "danger",
      });
      if (!confirmed) {
        return;
      }
      await logout(user.uid);
    },
    [localeSetting, logout, requestConfirm],
  );

  return {
    actions: {
      resetQrLoginState,
      cancelQrcodeLogin,
      loadSavedUser,
      loadAccounts,
      refreshCurrentUser: async () => {
        const requestUid = activeUidRef.current;
        try {
          const res = await studioApi.refreshCurrentUser();
          if (res.code === 0 && res.data) {
            if (requestUid !== activeUidRef.current) {
              return;
            }
            await applyUserSession(res.data);
            append(t(localeSetting, "ui.ctrl.user_refreshed"));
            await loadAccounts();
            await studioApi.syncLiveRoomProfile().catch(() => undefined);
          }
        } catch (error) {
          append(
            tf(localeSetting, "ui.ctrl.user_refresh_failed", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
          await loadAccounts();
        }
      },
      syncLiveRoomProfile,
      loadQrcode,
      pollLogin,
      switchAccount,
      logout,
      requestLogout,
    },
  };
}
