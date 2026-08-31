import { describe, expect, it, vi } from "vitest";

import { detectPlatform, getCurrentPlatform } from "../../src/platform/index.js";

describe("detectPlatform", () => {
  it("maps darwin to macos with posix path flavor", () => {
    const result = detectPlatform("darwin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: "macos",
        nodePlatform: "darwin",
        pathFlavor: "posix",
      });
    }
  });

  it("maps linux to linux with posix path flavor", () => {
    const result = detectPlatform("linux");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: "linux",
        nodePlatform: "linux",
        pathFlavor: "posix",
      });
    }
  });

  it("maps win32 to windows with win32 path flavor", () => {
    const result = detectPlatform("win32");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        id: "windows",
        nodePlatform: "win32",
        pathFlavor: "win32",
      });
    }
  });

  it("rejects unsupported Node platforms with UNSUPPORTED_PLATFORM", () => {
    const result = detectPlatform("freebsd" as NodeJS.Platform);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_PLATFORM");
      expect(result.error.details?.nodePlatform).toBe("freebsd");
    }
  });

  it("returns Result failure rather than throwing for unsupported platforms", () => {
    expect(() => detectPlatform("aix" as NodeJS.Platform)).not.toThrow();
    const result = detectPlatform("aix" as NodeJS.Platform);
    expect(result.ok).toBe(false);
  });
});

describe("getCurrentPlatform", () => {
  it("succeeds on the current supported development host", () => {
    const result = getCurrentPlatform();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(["macos", "linux", "windows"]).toContain(result.value.id);
      expect(result.value.nodePlatform).toBe(process.platform);
    }
  });
});

describe("platform import side effects", () => {
  it("imports platform module without intentional external side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const platform = await import("../../src/platform/index.js");
      expect(typeof platform.detectPlatform).toBe("function");
      expect(typeof platform.getCurrentPlatform).toBe("function");
      expect(consoleLog).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
    } finally {
      consoleLog.mockRestore();
      consoleError.mockRestore();
    }
  });
});
