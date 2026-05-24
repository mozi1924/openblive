import { describe, expect, it } from "vitest";
import { resolveBackendMessage } from "./i18n";

describe("resolveBackendMessage", () => {
  it("translates all i18n keys in one message", () => {
    const raw =
      "i18n.live.error.start_linkage_failed_with_rollback:i18n.live.error.command_start_template_missing";

    expect(resolveBackendMessage(raw, "zh-CN")).toBe(
      "开播联动失败，已尝试回滚开播状态:开播联动命令未配置，请先填写开播命令",
    );
  });

  it("keeps plain text and only replaces key fragments", () => {
    const raw =
      "first=i18n.live.error.command_fallback_failed, second=i18n.live.error.command_process_wait_failed";

    expect(resolveBackendMessage(raw, "en-US")).toBe(
      "first=Both the primary command and fallback command failed, second=Failed to wait for command process",
    );
  });

  it("returns original text when no i18n key exists", () => {
    const raw = "network timeout";
    expect(resolveBackendMessage(raw, "zh-CN")).toBe(raw);
  });
});
