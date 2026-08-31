import { describe, expect, it, vi } from "vitest";

describe("inventory import side-effect contract", () => {
  it("imports inventory without fs, cwd, env, or process side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const inventoryModule = await import("../../src/inventory/index.js");

      expect(typeof inventoryModule.inventory).toBe("function");
      expect(typeof inventoryModule.MAX_TRAVERSAL_DEPTH).toBe("number");
      expect(typeof inventoryModule.MAX_INVENTORY_OBSERVATIONS).toBe("number");
      expect(Array.isArray(inventoryModule.DEFAULT_SYSTEM_PRUNED_DIRECTORIES)).toBe(true);
      expect(
        Object.prototype.hasOwnProperty.call(inventoryModule, "brandRepositoryEntry"),
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(inventoryModule, "brandRepositoryInventory"),
      ).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(inventoryModule, "loadProjectConfig")).toBe(
        false,
      );

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
