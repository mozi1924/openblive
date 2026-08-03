import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENT_NAMES } from "./studio";

describe("EVENT_NAMES cross-end alignment", () => {
  it("should have matching event name strings in Rust backend files", () => {
    const danmuRs = readFileSync(
      resolve(__dirname, "../../src-tauri/src/danmu.rs"),
      "utf-8",
    );
    const systemRs = readFileSync(
      resolve(__dirname, "../../src-tauri/src/commands/system.rs"),
      "utf-8",
    );
    const stateEventRs = readFileSync(
      resolve(__dirname, "../../src-tauri/src/state_event.rs"),
      "utf-8",
    );

    const rustSourceCombined = `${danmuRs}\n${systemRs}\n${stateEventRs}`;

    for (const [key, eventName] of Object.entries(EVENT_NAMES)) {
      expect(
        rustSourceCombined.includes(`"${eventName}"`),
        `Rust backend source should contain event name string "${eventName}" (for EVENT_NAMES.${key})`,
      ).toBe(true);
    }
  });
});
