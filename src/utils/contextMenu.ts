const CONTEXT_MENU_ALLOW_SELECTOR = [
  "input",
  "textarea",
  "[contenteditable='true']",
  "[contenteditable='plaintext-only']",
  ".selectable-text",
].join(", ");

const CONTEXT_MENU_GUARD_FLAG = "__openbliveContextMenuGuardInstalled__";

const canOpenContextMenu = (target: EventTarget | null) => {
  const element =
    target instanceof HTMLElement
      ? target
      : target instanceof Node
        ? target.parentElement
        : null;

  if (!element) {
    return false;
  }

  if (element.closest(CONTEXT_MENU_ALLOW_SELECTOR)) {
    return true;
  }

  const userSelect = window.getComputedStyle(element).userSelect;
  return userSelect === "text" || userSelect === "all";
};

export function installContextMenuGuard() {
  const guardState = window as Window & { [CONTEXT_MENU_GUARD_FLAG]?: boolean };
  if (guardState[CONTEXT_MENU_GUARD_FLAG]) {
    return;
  }

  document.addEventListener(
    "contextmenu",
    (event) => {
      if (canOpenContextMenu(event.target)) {
        return;
      }

      event.preventDefault();
    },
    true,
  );

  guardState[CONTEXT_MENU_GUARD_FLAG] = true;
}
