import { getCurrentWindow } from "@tauri-apps/api/window";
import { RefObject, useEffect, useMemo } from "react";

type DragTarget = RefObject<HTMLElement | null>;

export function useWindowDrag(...targets: DragTarget[]) {
  const appWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    const dragTargets = targets
      .map((target) => target.current)
      .filter((node): node is HTMLElement => node !== null);

    const startWindowDrag = async (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (
        target.closest('[data-tauri-drag-region="false"]') ||
        target.closest("button, a, input, textarea, select, option, label")
      ) {
        return;
      }

      try {
        await appWindow.startDragging();
      } catch (error) {
        console.error("failed to start dragging", error);
      }
    };

    dragTargets.forEach((node) => {
      node.addEventListener("mousedown", startWindowDrag);
    });

    return () => {
      dragTargets.forEach((node) => {
        node.removeEventListener("mousedown", startWindowDrag);
      });
    };
  }, [appWindow, targets]);
}
