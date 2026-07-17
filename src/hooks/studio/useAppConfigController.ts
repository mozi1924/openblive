import { useCallback, useMemo, useState } from "react";
import { studioApi } from "../../services/studioApi";
import type { AppConfig, LinkageStatus } from "../../types/studio";
import { resolveBackendMessage, t, tf, type LocaleSetting } from "../../utils/i18n";

const MANUAL_SAVE_APP_CONFIG_KEYS = [
  "min_to_tray",
  "hide_dock_on_minimize",
  "danmu_overlay_enabled",
  "danmu_overlay_opacity",
  "danmu_overlay_always_on_top",
  "live_control_mode",
  "obs_ws_url",
  "obs_ws_password",
  "obs_ws_auto_start_on_live",
  "obs_ws_auto_stop_on_live_end",
  "on_live_start_command",
  "on_live_stop_command",
  "ws_server_enabled",
  "ws_server_listen_addr",
  "ws_server_auth_token",
  "ws_server_bypass_token_for_loopback",
  "host_www",
  "host_api",
  "host_live_api",
  "host_passport",
  "host_live_web",
  "cookie_domain",
  "danmu_host",
  "app_key",
  "app_sec",
  "http_user_agent",
  "livehime_version_override",
  "livehime_build_override",
  "live_platform",
] as const satisfies ReadonlyArray<keyof AppConfig>;

type ManualSaveConfigKey = (typeof MANUAL_SAVE_APP_CONFIG_KEYS)[number];
type AppConfigSnapshot = Pick<AppConfig, ManualSaveConfigKey>;

const buildAppConfigSnapshot = (config: AppConfig): AppConfigSnapshot =>
  MANUAL_SAVE_APP_CONFIG_KEYS.reduce((acc, key) => {
    (
      acc as Record<ManualSaveConfigKey, AppConfig[ManualSaveConfigKey]>
    )[key] = config[key];
    return acc;
  }, {} as AppConfigSnapshot);

type UseAppConfigControllerParams = {
  append: (line: string) => void;
  syncTrayMenu: () => Promise<void>;
};

export function useAppConfigController({ append, syncTrayMenu }: UseAppConfigControllerParams) {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [savedAppConfigSnapshot, setSavedAppConfigSnapshot] = useState<AppConfigSnapshot | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [linkageStatus, setLinkageStatus] = useState<LinkageStatus | null>(null);
  const [danmuOverlayVisible, setDanmuOverlayVisible] = useState(false);

  const localeSetting = (appConfig?.locale || "auto") as LocaleSetting;

  const hasPendingConfigChanges = useMemo(() => {
    if (!appConfig || !savedAppConfigSnapshot) {
      return false;
    }
    return MANUAL_SAVE_APP_CONFIG_KEYS.some((key) => appConfig[key] !== savedAppConfigSnapshot[key]);
  }, [appConfig, savedAppConfigSnapshot]);

  const loadAppConfig = useCallback(async () => {
    const res = await studioApi.getAppConfig();
    if (res.code === 0 && res.data) {
      setAppConfig(res.data);
      setSavedAppConfigSnapshot(buildAppConfigSnapshot(res.data));
      setDanmuOverlayVisible(Boolean(res.data.danmu_overlay_enabled));
    }
  }, []);

  const loadLinkageStatus = useCallback(async () => {
    const res = await studioApi.getLinkageStatus();
    if (res.code === 0 && res.data) {
      setLinkageStatus(res.data);
    }
  }, []);

  const updateAppConfig = useCallback(
    <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      setAppConfig((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    [],
  );

  const generateHttpUserAgent = useCallback(async () => {
    try {
      const res = await studioApi.generateHttpUserAgent();
      const userAgent = res.data?.user_agent?.trim() || "";
      if (res.code === 0 && userAgent) {
        updateAppConfig("http_user_agent", userAgent);
        append(t(localeSetting, "ui.settings.advanced.http_user_agent.generated"));
        return;
      }
      append(
        tf(localeSetting, "ui.settings.advanced.http_user_agent.generate_failed", {
          msg: resolveBackendMessage(res.msg || "empty user-agent", localeSetting),
        }),
      );
    } catch (error) {
      append(
        tf(localeSetting, "ui.settings.advanced.http_user_agent.generate_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    }
  }, [append, localeSetting, updateAppConfig]);

  const updateLocaleConfig = useCallback(
    async (nextLocale: AppConfig["locale"]) => {
      if (!appConfig) {
        return;
      }
      const prevLocale = appConfig.locale;
      setAppConfig((prev) => (prev ? { ...prev, locale: nextLocale } : prev));
      setSavingLocale(true);
      try {
        await studioApi.setAppConfig("locale", nextLocale);
        await loadAppConfig();
        await syncTrayMenu();
      } catch (error) {
        setAppConfig((prev) => (prev ? { ...prev, locale: prevLocale } : prev));
        append(
          `${t(prevLocale, "ui.settings.save.failed")}: ${resolveBackendMessage(
            String(error),
            prevLocale,
          )}`,
        );
      } finally {
        setSavingLocale(false);
      }
    },
    [appConfig, append, loadAppConfig, syncTrayMenu],
  );

  const showDanmuOverlay = useCallback(async () => {
    await studioApi.showDanmuOverlay().then(() => {
      setDanmuOverlayVisible(true);
    }).catch((error) => {
      append(
        tf(localeSetting, "ui.settings.overlay.action_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);

  const hideDanmuOverlay = useCallback(async () => {
    await studioApi.hideDanmuOverlay().then(() => {
      setDanmuOverlayVisible(false);
    }).catch((error) => {
      append(
        tf(localeSetting, "ui.settings.overlay.action_failed", {
          msg: resolveBackendMessage(String(error), localeSetting),
        }),
      );
    });
  }, [append, localeSetting]);

  const saveAppConfig = useCallback(async () => {
    if (!appConfig) {
      return;
    }
    setSavingConfig(true);
    try {
      const values = MANUAL_SAVE_APP_CONFIG_KEYS.reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = appConfig[key];
        return acc;
      }, {});
      await studioApi.setAppConfigs(values);
      append(t(localeSetting, "ui.settings.save.done"));
      await loadAppConfig();
      await loadLinkageStatus();
      await syncTrayMenu();
    } catch (error) {
      append(
        `${t(localeSetting, "ui.settings.save.failed")}: ${resolveBackendMessage(
          String(error),
          localeSetting,
        )}`,
      );
    } finally {
      setSavingConfig(false);
    }
  }, [appConfig, append, loadAppConfig, loadLinkageStatus, localeSetting, syncTrayMenu]);

  return {
    state: {
      appConfig,
      localeSetting,
      linkageStatus,
      danmuOverlayVisible,
      savingConfig,
      savingLocale,
      hasPendingConfigChanges,
    },
    actions: {
      setDanmuOverlayVisible,
      setLinkageStatus,
      loadAppConfig,
      loadLinkageStatus,
      updateAppConfig,
      generateHttpUserAgent,
      updateLocaleConfig,
      showDanmuOverlay,
      hideDanmuOverlay,
      saveAppConfig,
    },
  };
}
