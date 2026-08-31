import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { MINIMUM_SUPPORTED_NODE_MAJOR } from "../../src/core/runtime.js";
import { evaluateStartup } from "../../src/cli/startup.js";
import { runCli, type CliIo } from "../../src/cli/main.js";

function createIo(): CliIo & { out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    writeOut: (text) => {
      out.push(text);
    },
    writeErr: (text) => {
      err.push(text);
    },
  };
}

describe("evaluateStartup", () => {
  it("succeeds for supported runtime and supported platform", () => {
    const result = evaluateStartup("v22.0.0", "darwin");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.runtime.major).toBe(22);
      expect(result.value.platform.id).toBe("macos");
    }
  });

  it("fails for unsupported/old runtime", () => {
    const result = evaluateStartup("v20.19.0", "linux");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_RUNTIME");
      expect(result.error.message).toContain(String(MINIMUM_SUPPORTED_NODE_MAJOR));
    }
  });

  it("fails for unsupported platform", () => {
    const result = evaluateStartup("v22.11.0", "freebsd" as NodeJS.Platform);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("UNSUPPORTED_PLATFORM");
    }
  });

  it("uses existing runtime contract threshold rather than a duplicate", () => {
    const atMinimum = evaluateStartup(`v${MINIMUM_SUPPORTED_NODE_MAJOR}.0.0`, "linux");
    const below = evaluateStartup(`v${MINIMUM_SUPPORTED_NODE_MAJOR - 1}.9.9`, "linux");
    expect(atMinimum.ok).toBe(true);
    expect(below.ok).toBe(false);
  });

  it("uses detectPlatform rather than duplicate platform mapping", () => {
    const darwin = evaluateStartup("v22.0.0", "darwin");
    const win32 = evaluateStartup("v22.0.0", "win32");
    expect(darwin.ok && darwin.value.platform.pathFlavor).toBe("posix");
    expect(win32.ok && win32.value.platform.id).toBe("windows");
  });
});

describe("runCli", () => {
  it("prints help and returns 0 with no arguments", () => {
    const io = createIo();
    const code = runCli([], io);
    expect(code).toBe(0);
    expect(io.out.join("")).toContain("Path Code");
    expect(io.out.join("")).toContain("pathcode [--help]");
    expect(io.err).toEqual([]);
  });

  it("prints help and returns 0 for --help", () => {
    const io = createIo();
    expect(runCli(["--help"], io)).toBe(0);
    expect(io.out.join("")).toContain("Usage:");
  });

  it("prints help and returns 0 for -h", () => {
    const io = createIo();
    expect(runCli(["-h"], io)).toBe(0);
    expect(io.out.join("")).toContain("Path Code");
  });

  it("rejects unknown arguments with stderr and non-zero exit code", () => {
    const io = createIo();
    const code = runCli(["--unknown"], io);
    expect(code).toBe(1);
    expect(io.err.join("")).toContain("Unknown argument: --unknown");
    expect(io.err.join("")).toContain("--help");
  });

  it("rejects task-looking arguments as a regression tripwire", () => {
    const io = createIo();
    const code = runCli(["build-something"], io);
    expect(code).toBe(1);
    expect(io.err.join("")).toContain("Unknown argument: build-something");
    expect(io.out).toEqual([]);
  });

  it("does not call process.exit", () => {
    const io = createIo();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit must not be called");
    }) as never);
    try {
      expect(runCli(["--help"], io)).toBe(0);
      expect(runCli(["nope"], io)).toBe(1);
      expect(exitSpy).not.toHaveBeenCalled();
    } finally {
      exitSpy.mockRestore();
    }
  });

  it("source does not read process.version, process.platform, or process.argv", () => {
    const mainPath = fileURLToPath(new URL("../../src/cli/main.ts", import.meta.url));
    const source = readFileSync(mainPath, "utf8");
    expect(source).not.toMatch(/process\.version/);
    expect(source).not.toMatch(/process\.platform/);
    expect(source).not.toMatch(/process\.argv/);
    expect(source).not.toMatch(/process\.exit/);
  });
});
