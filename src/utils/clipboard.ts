export async function writeClipboardText(text: string): Promise<void> {
  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return;
  } catch {
    // Fall through to browser clipboard as a compatibility fallback.
  }

  const clipboard = globalThis.navigator?.clipboard;
  if (!clipboard?.writeText) {
    throw new Error("Clipboard API unavailable");
  }

  await clipboard.writeText(text);
}
