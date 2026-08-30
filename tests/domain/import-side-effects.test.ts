import { describe, expect, it, vi } from "vitest";

describe("domain import side-effect contract", () => {
  it("imports public domain modules without intentional observable side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const domain = await import("../../src/domain/index.js");
      const root = await import("../../src/index.js");

      expect(typeof domain.success).toBe("function");
      expect(typeof domain.requiresReRead).toBe("function");
      expect(typeof root.isNodeVersionSupported).toBe("function");
      expect(typeof root.isJsonValue).toBe("function");

      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
      expect(consoleInfo).not.toHaveBeenCalled();
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
      consoleWarn.mockRestore();
      consoleInfo.mockRestore();
    }
  });
});
