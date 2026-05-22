import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Update as TauriUpdate } from "@tauri-apps/plugin-updater";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ActiveTab } from "../../types/studio";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";

const APP_UPDATE_POLL_INTERVAL_MS = 60 * 60 * 1000;
const RELEASES_PAGE_URL = "https://github.com/mozi1924/openblive/releases";

type ConfirmPayload = {
  title: string;
  description: string;
  confirmText: string;
  tone: "primary" | "danger";
};

type AlertPayload = ConfirmPayload;

type UseAppUpdateControllerParams = {
  localeSetting: LocaleSetting;
  append: (line: string) => void;
  requestConfirm: (payload: ConfirmPayload) => Promise<boolean>;
  requestAlert: (payload: AlertPayload) => Promise<void>;
  revealMainWindowForAction: () => Promise<void>;
  setActiveTab: Dispatch<SetStateAction<ActiveTab>>;
};

export function useAppUpdateController({
  localeSetting,
  append,
  requestConfirm,
  requestAlert,
  revealMainWindowForAction,
  setActiveTab,
}: UseAppUpdateControllerParams) {
  const [appVersion, setAppVersion] = useState("");
  const [appBundleType, setAppBundleType] = useState<string | null>(null);
  const [availableAppUpdateVersion, setAvailableAppUpdateVersion] = useState<string | null>(null);
  const [checkingAppUpdate, setCheckingAppUpdate] = useState(false);
  const [installingAppUpdate, setInstallingAppUpdate] = useState(false);

  const appUpdateRef = useRef<TauriUpdate | null>(null);
  const appUpdatePromptedVersionRef = useRef<string | null>(null);
  const appUpdateCheckBusyRef = useRef(false);

  const replacePendingAppUpdate = useCallback((next: TauriUpdate | null) => {
    const previous = appUpdateRef.current;
    appUpdateRef.current = next;
    if (previous && previous !== next) {
      void previous.close().catch(() => undefined);
    }
  }, []);

  const loadAppMetadata = useCallback(async () => {
    try {
      const { getVersion, getBundleType } = await import("@tauri-apps/api/app");
      const [version, bundleType] = await Promise.all([getVersion(), getBundleType()]);
      setAppVersion(version.trim());
      setAppBundleType(bundleType);
    } catch {
      setAppVersion("");
      setAppBundleType(null);
    }
  }, []);

  const checkAppUpdate = useCallback(
    async (options?: { promptOnAvailable?: boolean; silent?: boolean }) => {
      if (appUpdateCheckBusyRef.current) {
        return;
      }
      appUpdateCheckBusyRef.current = true;
      setCheckingAppUpdate(true);
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const update = await check();
        if (!update) {
          setAvailableAppUpdateVersion(null);
          appUpdatePromptedVersionRef.current = null;
          replacePendingAppUpdate(null);
          if (!options?.silent) {
            append(
              tf(localeSetting, "ui.project.update.none", {
                version: appVersion || "--",
              }),
            );
          }
          return;
        }

        setAvailableAppUpdateVersion(update.version);
        replacePendingAppUpdate(update);

        if (options?.promptOnAvailable === false) {
          return;
        }
        if (appUpdatePromptedVersionRef.current === update.version) {
          return;
        }

        appUpdatePromptedVersionRef.current = update.version;
        const accepted = await requestConfirm({
          title: t(localeSetting, "ui.project.update.popup.title"),
          description: tf(localeSetting, "ui.project.update.popup.desc", {
            current: update.currentVersion,
            version: update.version,
          }),
          confirmText: t(localeSetting, "ui.project.update.popup.confirm"),
          tone: "primary",
        });
        if (accepted) {
          await revealMainWindowForAction();
          setActiveTab("project");
        }
      } catch (error) {
        if (!options?.silent) {
          append(
            tf(localeSetting, "ui.project.update.error.check", {
              msg: resolveBackendMessage(String(error), localeSetting),
            }),
          );
        }
      } finally {
        setCheckingAppUpdate(false);
        appUpdateCheckBusyRef.current = false;
      }
    },
    [
      appVersion,
      append,
      localeSetting,
      replacePendingAppUpdate,
      requestConfirm,
      revealMainWindowForAction,
      setActiveTab,
    ],
  );

  const downloadAndInstallAppUpdate = useCallback(async () => {
    if (installingAppUpdate) {
      return;
    }

    let update = appUpdateRef.current;
    if (!update) {
      await checkAppUpdate({ promptOnAvailable: false, silent: false });
      update = appUpdateRef.current;
    }
    if (!update) {
      return;
    }

    setInstallingAppUpdate(true);
    try {
      await update.downloadAndInstall();
      append(tf(localeSetting, "ui.project.update.install.done", { version: update.version }));
      setAvailableAppUpdateVersion(null);
      replacePendingAppUpdate(null);
    } catch (error) {
      append(
        tf(localeSetting, "ui.project.update.error.install", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    } finally {
      setInstallingAppUpdate(false);
    }
  }, [append, checkAppUpdate, installingAppUpdate, localeSetting, replacePendingAppUpdate]);

  const openReleasePage = useCallback(async () => {
    try {
      await openUrl(RELEASES_PAGE_URL);
    } catch {
      window.open(RELEASES_PAGE_URL, "_blank", "noopener,noreferrer");
    }
  }, []);

  const runPlatformUpdateAction = useCallback(async () => {
    if (!availableAppUpdateVersion) {
      await checkAppUpdate({ promptOnAvailable: false, silent: false });
      return;
    }

    if (appBundleType === "deb" || appBundleType === "rpm") {
      await requestAlert({
        title: t(localeSetting, "ui.project.update.pkg.title"),
        description: t(localeSetting, "ui.project.update.pkg.desc"),
        confirmText: t(localeSetting, "ui.project.update.pkg.confirm"),
        tone: "primary",
      });
      return;
    }

    if (appBundleType === "app") {
      await openReleasePage();
      append(t(localeSetting, "ui.project.update.dmg.opened"));
      return;
    }

    await downloadAndInstallAppUpdate();
  }, [
    appBundleType,
    append,
    availableAppUpdateVersion,
    checkAppUpdate,
    downloadAndInstallAppUpdate,
    localeSetting,
    openReleasePage,
    requestAlert,
  ]);

  useEffect(() => {
    void loadAppMetadata();
  }, [loadAppMetadata]);

  useEffect(() => {
    void checkAppUpdate({ promptOnAvailable: true, silent: true });
    const timer = window.setInterval(() => {
      void checkAppUpdate({ promptOnAvailable: true, silent: true });
    }, APP_UPDATE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
      replacePendingAppUpdate(null);
    };
  }, [checkAppUpdate, replacePendingAppUpdate]);

  return {
    state: {
      appVersion,
      appBundleType,
      availableAppUpdateVersion,
      checkingAppUpdate,
      installingAppUpdate,
    },
    actions: {
      checkAppUpdate,
      downloadAndInstallAppUpdate,
      runPlatformUpdateAction,
    },
  };
}
