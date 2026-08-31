import { describe, expect, it, vi } from "vitest";

describe("import side-effect contract", () => {
  it("imports domain, workspace, and package entry without intentional observable side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => undefined);

    try {
      const domain = await import("../../src/domain/index.js");
      const workspace = await import("../../src/workspace/index.js");
      const git = await import("../../src/git/index.js");
      const config = await import("../../src/config/index.js");
      const root = await import("../../src/index.js");

      expect(typeof domain.success).toBe("function");
      expect(typeof domain.requiresReRead).toBe("function");
      expect(typeof workspace.createWorkspaceBoundary).toBe("function");
      expect(typeof git.discoverGitRepository).toBe("function");
      expect(typeof config.loadProjectConfig).toBe("function");
      expect(typeof root.isNodeVersionSupported).toBe("function");
      expect(typeof root.createWorkspaceBoundary).toBe("function");
      expect(typeof root.discoverGitRepository).toBe("function");
      expect(typeof root.loadProjectConfig).toBe("function");
      expect(
        Object.prototype.hasOwnProperty.call(workspace, "brandCanonicalPath"),
      ).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(root, "brandCanonicalPath"),
      ).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(git, "runGit")).toBe(false);
      expect(
        Object.prototype.hasOwnProperty.call(config, "readBoundedConfigFile"),
      ).toBe(false);

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
