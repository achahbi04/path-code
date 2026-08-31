import { describe, expect, it, vi } from "vitest";

describe("reader import side-effect contract", () => {
  it("imports reader modules without filesystem, cwd, env, or process side effects", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      const reader = await import("../../src/reader/index.js");
      expect(typeof reader.readRepositoryContent).toBe("function");
      expect(reader.MAX_REPOSITORY_CONTENT_BYTES).toBe(1_048_576);
      expect(Object.prototype.hasOwnProperty.call(reader, "contentObservation")).toBe(
        false,
      );

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
