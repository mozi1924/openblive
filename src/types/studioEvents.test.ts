import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { EVENT_NAMES } from "./studio";

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);

describe("EVENT_NAMES cross-end alignment", () => {
  it("should have matching event name strings in Rust backend files", () => {
    const danmuRs = readFileSync(
      resolve(__dir, "../../src-tauri/src/danmu.rs"),
      "utf-8",
    );
    const systemRs = readFileSync(
      resolve(__dir, "../../src-tauri/src/commands/system.rs"),
      "utf-8",
    );
    const stateEventRs = readFileSync(
      resolve(__dir, "../../src-tauri/src/state_event.rs"),
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
