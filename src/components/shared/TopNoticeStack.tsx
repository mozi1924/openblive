import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import {
  TOP_NOTICE_DURATION_MS,
  TOP_NOTICE_ENTER_MS,
  TOP_NOTICE_EXIT_MS,
  type TopNoticeItem,
} from "../../types/topNotice";

type TopNoticeStackProps = {
  notices: TopNoticeItem[];
  onDismiss: (id: number) => void;
};

type RenderedTopNotice = TopNoticeItem & {
  phase: "enter" | "idle" | "exit";
};

export function TopNoticeStack({ notices, onDismiss }: TopNoticeStackProps) {
  const [renderedNotices, setRenderedNotices] = useState<RenderedTopNotice[]>([]);
  const enterTimersRef = useRef<Map<number, number>>(new Map());
  const exitTimersRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    setRenderedNotices((prev) => {
      const nextById = new Map(notices.map((notice) => [notice.id, notice]));
      const nextIds = new Set(nextById.keys());
      let changed = false;

      const merged = prev.map((item) => {
        const next = nextById.get(item.id);
        if (next) {
          nextById.delete(item.id);
          if (item.text !== next.text || item.tone !== next.tone || item.phase === "exit") {
            changed = true;
            return { ...next, phase: "idle" as const };
          }
          return item;
        }

        if (item.phase !== "exit") {
          changed = true;
          return { ...item, phase: "exit" as const };
        }
        return item;
      });

      for (const notice of notices) {
        if (nextIds.has(notice.id) && !prev.some((item) => item.id === notice.id)) {
          changed = true;
          merged.push({ ...notice, phase: "enter" });
        }
      }

      return changed ? merged : prev;
    });
  }, [notices]);

  useEffect(() => {
    const renderedIds = new Set(renderedNotices.map((notice) => notice.id));

    for (const [id, timer] of enterTimersRef.current) {
      const notice = renderedNotices.find((item) => item.id === id);
      if (!notice || notice.phase !== "enter") {
        window.clearTimeout(timer);
        enterTimersRef.current.delete(id);
      }
    }

    for (const [id, timer] of exitTimersRef.current) {
      const notice = renderedNotices.find((item) => item.id === id);
      if (!notice || notice.phase !== "exit") {
        window.clearTimeout(timer);
        exitTimersRef.current.delete(id);
      }
    }

    for (const notice of renderedNotices) {
      if (notice.phase === "enter" && !enterTimersRef.current.has(notice.id)) {
        const timer = window.setTimeout(() => {
          enterTimersRef.current.delete(notice.id);
          setRenderedNotices((prev) =>
            prev.map((item) =>
              item.id === notice.id && item.phase === "enter"
                ? { ...item, phase: "idle" }
                : item,
            ),
          );
        }, TOP_NOTICE_ENTER_MS);
        enterTimersRef.current.set(notice.id, timer);
      }

      if (notice.phase === "exit" && !exitTimersRef.current.has(notice.id)) {
        const timer = window.setTimeout(() => {
          exitTimersRef.current.delete(notice.id);
          setRenderedNotices((prev) => prev.filter((item) => item.id !== notice.id));
        }, TOP_NOTICE_EXIT_MS);
        exitTimersRef.current.set(notice.id, timer);
      }
    }

    for (const id of enterTimersRef.current.keys()) {
      if (!renderedIds.has(id)) {
        enterTimersRef.current.delete(id);
      }
    }

    for (const id of exitTimersRef.current.keys()) {
      if (!renderedIds.has(id)) {
        exitTimersRef.current.delete(id);
      }
    }
  }, [renderedNotices]);

  useEffect(
    () => () => {
      for (const timer of enterTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      for (const timer of exitTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      enterTimersRef.current.clear();
      exitTimersRef.current.clear();
    },
    [],
  );

  if (renderedNotices.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-4"
      aria-live="polite"
      aria-atomic="true"
    >
      {renderedNotices.map((notice) => {
        const isSuccess = notice.tone === "success";
        const paletteClass = isSuccess
          ? "border-emerald-300/28 bg-[linear-gradient(135deg,rgba(16,185,129,0.24),rgba(6,10,18,0.9))] text-emerald-50"
          : "border-rose-300/28 bg-[linear-gradient(135deg,rgba(244,63,94,0.22),rgba(9,10,18,0.9))] text-rose-50";
        const iconWrapClass = isSuccess
          ? "bg-emerald-400/14 text-emerald-200 ring-1 ring-emerald-200/18"
          : "bg-rose-400/14 text-rose-200 ring-1 ring-rose-200/18";
        const progressClass = isSuccess ? "bg-emerald-300/80" : "bg-rose-300/80";
        const motionClass =
          notice.phase === "enter"
            ? "animate-top-notice-in"
            : notice.phase === "exit"
              ? "animate-top-notice-out"
              : "";

        return (
          <div
            key={notice.id}
            data-notice-id={notice.id}
            data-notice-state={notice.phase}
            className={`pointer-events-auto relative w-full max-w-xl overflow-hidden rounded-2xl border shadow-[0_22px_52px_rgba(0,0,0,0.42)] backdrop-blur-xl ${paletteClass} ${motionClass}`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.16),transparent_58%)] opacity-70" />
            <div className="relative flex items-start gap-3 px-3.5 py-3">
              <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${iconWrapClass}`}>
                {isSuccess ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="min-w-0 text-sm leading-relaxed text-current/95">{notice.text}</p>
              </div>
              <button
                type="button"
                onClick={() => onDismiss(notice.id)}
                className="mt-0.5 rounded-full bg-white/6 p-1.5 text-current/70 transition hover:bg-white/12 hover:text-white"
                aria-label="dismiss notice"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="relative h-[3px] w-full overflow-hidden bg-white/8">
              <div
                data-notice-progress="true"
                className={`h-full origin-left animate-top-notice-progress ${progressClass}`}
                style={{ animationDuration: `${TOP_NOTICE_DURATION_MS}ms` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
