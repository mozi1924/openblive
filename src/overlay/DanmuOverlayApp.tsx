import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pin, Send, SmilePlus, X } from "lucide-react";
import { studioApi } from "../services/studioApi";
import type { AppConfig, LiveEmoticonPackage, StudioStateEvent, User } from "../types/studio";
import { createLiveEmoticonIndex, createSelfDanmuMessage } from "../utils/danmu";
import { t, type LocaleSetting } from "../utils/i18n";
import { useWindowDrag } from "../hooks/useWindowDrag";
import { useDanmuMessageFeed } from "../hooks/studio/useDanmuMessageFeed";
import { DanmuOverlayMessageRow } from "../features/danmu/DanmuOverlayMessageRow";
import { useTauriEvent } from "../hooks/useTauriEvent";

const resolveEmoticonStyle = (width: number, height: number, targetHeight: number) => {
  const ratio = width > 0 && height > 0 ? width / height : 1;
  const resolvedWidth = Math.max(targetHeight, Math.round(targetHeight * ratio));
  return {
    width: `${Math.min(resolvedWidth, targetHeight * 3.4)}px`,
    height: `${targetHeight}px`,
  };
};

export function DanmuOverlayApp() {
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [danmuText, setDanmuText] = useState("");
  const [liveEmoticonPackages, setLiveEmoticonPackages] = useState<LiveEmoticonPackage[]>([]);
  const [liveEmoticonsLoading, setLiveEmoticonsLoading] = useState(false);
  const [openPanel, setOpenPanel] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const headerDragRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const floatingPanelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const locale = (appConfig?.locale || "auto") as LocaleSetting;
  const liveEmoticonMap = useMemo(
    () => createLiveEmoticonIndex(liveEmoticonPackages),
    [liveEmoticonPackages],
  );
  const { danmus, setDanmus } = useDanmuMessageFeed({
    localeSetting: locale,
    liveEmoticonMap,
    currentUserUid: currentUser?.uid,
    maxMessages: 160,
  });
  const orderedDanmus = useMemo(() => [...danmus].slice(0, 160).reverse(), [danmus]);
  const panelOpacity = Math.max(40, Math.min(appConfig?.danmu_overlay_opacity ?? 55, 100));
  const panelOpacityRatio = panelOpacity / 100;
  const controlSurface = `rgba(8, 12, 19, ${Math.max(panelOpacityRatio, 0.24)})`;
  const controlBorder = `rgba(255, 255, 255, ${Math.max(panelOpacityRatio * 0.15, 0.05)})`;
  const controlButtonBg = `rgba(255, 255, 255, ${Math.max(panelOpacityRatio * 0.1, 0.03)})`;

  const refreshCurrentUser = useCallback(async () => {
    const res = await studioApi.loadSavedConfig().catch(() => null);
    if (!res || res.code !== 0) {
      return;
    }
    setCurrentUser(res.data ?? null);
  }, []);

  useWindowDrag(headerDragRef);

  useEffect(() => {
    void (async () => {
      const [configRes, userRes] = await Promise.all([
        studioApi.getAppConfig(),
        studioApi.loadSavedConfig(),
      ]);

      if (configRes.code === 0 && configRes.data) {
        setAppConfig(configRes.data);
        setAlwaysOnTop(Boolean(configRes.data.danmu_overlay_always_on_top));
      }
      if (userRes.code === 0) {
        setCurrentUser(userRes.data ?? null);
      }
    })();
  }, []);

  useEffect(() => {
    const uid = currentUser?.uid?.trim();
    if (!uid) {
      setLiveEmoticonPackages([]);
      setLiveEmoticonsLoading(false);
      return;
    }

    let active = true;
    setLiveEmoticonsLoading(true);

    void studioApi.getLiveEmoticons().then((res) => {
      if (!active) {
        return;
      }
      setLiveEmoticonPackages(res.code === 0 && Array.isArray(res.data) ? res.data : []);
      setLiveEmoticonsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  useTauriEvent(studioApi.listenStudioState, (event: StudioStateEvent) => {
    if (event.kind !== "runtime.snapshot") {
      return;
    }

    const nextUidRaw = event.data?.session?.uid;
    const nextUid = typeof nextUidRaw === "number" && Number.isFinite(nextUidRaw)
      ? String(nextUidRaw)
      : "";
    const currentUid = currentUser?.uid?.trim() || "";

    // Refresh only when auth context changes or after explicit account commands.
    if (
      nextUid !== currentUid ||
      event.source === "command.poll_login_status" ||
      event.source === "command.switch_account" ||
      event.source === "command.logout"
    ) {
      void refreshCurrentUser();
    }
  });

  useTauriEvent(studioApi.listenDanmuOverlaySettings, (payload) => {
    setAppConfig((prev) =>
      prev
        ? {
            ...prev,
            danmu_overlay_enabled: payload.enabled,
            danmu_overlay_opacity: payload.opacity,
            danmu_overlay_always_on_top: payload.always_on_top,
          }
        : prev,
    );
    setAlwaysOnTop(payload.always_on_top);
  });

  useEffect(() => {
    if (!openPanel) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      if (floatingPanelRef.current?.contains(event.target as Node)) {
        return;
      }
      if (composerRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpenPanel(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenPanel(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPanel]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [orderedDanmus.length]);

  const insertEmoticon = (text: string) => {
    const input = textareaRef.current;
    const start = input?.selectionStart ?? danmuText.length;
    const end = input?.selectionEnd ?? danmuText.length;

    setDanmuText((prev) => `${prev.slice(0, start)}${text}${prev.slice(end)}`);

    window.requestAnimationFrame(() => {
      const nextInput = textareaRef.current;
      if (!nextInput) {
        return;
      }
      const nextCursor = start + text.length;
      nextInput.focus();
      nextInput.setSelectionRange(nextCursor, nextCursor);
    });
  };

  const submitDanmu = async () => {
    const message = danmuText.trim();
    if (!message || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await studioApi.sendDanmu(message);
      if (res.code === 0) {
        setDanmus((prev) => [
          createSelfDanmuMessage(
            message,
            currentUser?.uname || t(locale, "ui.ctrl.me"),
            liveEmoticonMap,
            currentUser?.uid
              ? {
                  sender_uid: Number(currentUser.uid),
                  sender_role: "anchor",
                  sender_face: currentUser.face,
                }
              : undefined,
          ),
          ...prev,
        ].slice(0, 160));
        setDanmuText("");
        setOpenPanel(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="flex h-screen w-screen overflow-hidden rounded-[22px] text-[#eaf2ff]"
      style={{
        backgroundColor: `rgba(8, 12, 19, ${panelOpacityRatio})`,
      }}
    >
      <div className="relative flex h-full w-full flex-col">
        <header
          ref={headerDragRef}
          className="drag-region flex items-center justify-between px-3 py-2.5"
        >
          <div data-tauri-drag-region="false" className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void studioApi.hideDanmuOverlay()}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-gray-200 transition-all hover:bg-white/10"
              style={{
                backgroundColor: controlButtonBg,
                borderColor: controlBorder,
              }}
              title={t(locale, "ui.overlay.hide")}
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={async () => {
                const nextValue = !alwaysOnTop;
                setAlwaysOnTop(nextValue);
                const res = await studioApi.setDanmuOverlayPinned(nextValue);
                if (res.code !== 0) {
                  setAlwaysOnTop((prev) => !prev);
                }
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full border transition-all ${
                alwaysOnTop
                  ? "border-bili-pink/40 bg-bili-pink/15 text-bili-pink"
                  : "text-gray-200 hover:bg-white/10"
              }`}
              style={
                alwaysOnTop
                  ? undefined
                  : {
                      backgroundColor: controlButtonBg,
                      borderColor: controlBorder,
                    }
              }
              title={alwaysOnTop ? t(locale, "ui.overlay.unpin") : t(locale, "ui.overlay.pin")}
            >
              <Pin className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.24em] text-gray-300">
            <span className="inline-flex h-2 w-2 rounded-full bg-bili-blue shadow-[0_0_12px_rgba(0,174,236,0.85)]" />
            Danmu Overlay
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 pb-2 app-scrollbar">
          {orderedDanmus.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] text-gray-400">
                {t(locale, "ui.danmu.empty.title")}
              </div>
              <p className="mt-3 max-w-[18rem] text-[10px] leading-5 text-gray-500">
                {t(locale, "ui.overlay.empty_hint")}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {orderedDanmus.map((message) => (
                <DanmuOverlayMessageRow
                  key={message.id}
                  message={message}
                  currentUser={currentUser}
                  locale={locale}
                />
              ))}
              <div ref={messageEndRef} />
            </div>
          )}
        </div>

        <div
          className="border-t px-3 py-3"
          style={{
            borderColor: controlBorder,
          }}
        >
          <div ref={composerRef} className="relative">
            {openPanel ? (
              <div
                ref={floatingPanelRef}
                data-tauri-drag-region="false"
                className="absolute bottom-[calc(100%+10px)] right-0 z-20 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-3xl border border-white/10 bg-[#0b1018]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
              >
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {t(locale, "ui.danmu.emoticon.panel_title")}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {t(locale, "ui.danmu.emoticon.panel_desc")}
                    </p>
                  </div>
                  <span className="rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-gray-400">
                    {liveEmoticonPackages.reduce((count, pkg) => count + pkg.emoticons.length, 0)}
                  </span>
                </div>
                <div className="max-h-[18rem] overflow-y-auto px-4 py-4 app-scrollbar">
                  {liveEmoticonsLoading ? (
                    <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-xs text-gray-400">
                      {t(locale, "ui.danmu.emoticon.loading")}
                    </div>
                  ) : liveEmoticonPackages.every((pkg) => pkg.emoticons.length === 0) ? (
                    <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/8 bg-white/[0.02] px-4 py-10 text-center text-xs text-gray-400">
                      {t(locale, "ui.danmu.emoticon.empty")}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {liveEmoticonPackages.map((pkg) => (
                        <section key={pkg.pkg_id} className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <p className="text-xs font-semibold text-gray-200">{pkg.pkg_name}</p>
                            {pkg.pkg_descript ? (
                              <span className="text-[10px] text-gray-500">{pkg.pkg_descript}</span>
                            ) : null}
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {pkg.emoticons.map((emoticon) => (
                              <button
                                key={emoticon.emoticon_unique || `${pkg.pkg_id}-${emoticon.emoticon_id}`}
                                type="button"
                                onClick={() => insertEmoticon(emoticon.text)}
                                className="group flex min-h-22 flex-col items-center justify-between rounded-2xl border border-white/6 bg-white/[0.03] px-2 py-3 text-center transition-all hover:border-bili-blue/30 hover:bg-bili-blue/8"
                                title={emoticon.text}
                              >
                                <img
                                  src={emoticon.url}
                                  alt={emoticon.text}
                                  className="pointer-events-none object-contain"
                                  style={resolveEmoticonStyle(emoticon.width, emoticon.height, 30)}
                                />
                                <span className="mt-2 text-[10px] font-medium text-gray-400 transition-colors group-hover:text-gray-100">
                                  {emoticon.label || emoticon.text}
                                </span>
                              </button>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div
              data-tauri-drag-region="false"
              className="flex items-center gap-2 rounded-[20px] border p-2"
              style={{
                borderColor: controlBorder,
                backgroundColor: controlSurface,
              }}
            >
              <textarea
                ref={textareaRef}
                value={danmuText}
                onChange={(event) => setDanmuText(event.target.value)}
                placeholder={t(locale, "ui.danmu.placeholder")}
                rows={1}
                className="selectable-text no-drag max-h-24 flex-1 resize-none bg-transparent px-2.5 py-2 text-xs text-white placeholder-gray-500 focus:outline-none app-scrollbar"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && openPanel) {
                    event.preventDefault();
                    setOpenPanel(false);
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submitDanmu();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => setOpenPanel((prev) => !prev)}
                className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                  openPanel
                    ? "border-bili-blue/40 bg-bili-blue/15 text-bili-blue"
                    : "text-gray-400 hover:border-white/10 hover:bg-white/5 hover:text-white"
                }`}
                style={
                  openPanel
                    ? undefined
                    : {
                        borderColor: controlBorder,
                        backgroundColor: controlButtonBg,
                      }
                }
                title={t(locale, "ui.danmu.emoticon.toggle")}
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                disabled={!danmuText.trim() || submitting}
                onClick={() => void submitDanmu()}
                className={`flex h-9 w-9 items-center justify-center rounded-xl transition-all ${
                  danmuText.trim() && !submitting
                    ? "bg-bili-blue text-white hover:bg-bili-blue/90 active:scale-95 shadow-[0_2px_8px_rgba(0,174,236,0.3)]"
                    : "cursor-not-allowed text-gray-600"
                }`}
                style={
                  danmuText.trim() && !submitting
                    ? undefined
                    : {
                        backgroundColor: controlButtonBg,
                      }
                }
                title={t(locale, "ui.danmu.send")}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
