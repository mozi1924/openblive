import { vi } from "vitest";

vi.stubGlobal("alert", vi.fn());
vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
