import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const gitDir = fileURLToPath(new URL("../../src/git", import.meta.url));

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("git architecture", () => {
  it("keeps src/git free of shell, generic process APIs, and private brand deep imports", () => {
    expect(statSync(gitDir).isDirectory()).toBe(true);
    const files = listTsFiles(gitDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const filePath of files) {
      const source = readFileSync(filePath, "utf8");
      if (/shell:\s*true/.test(source)) {
        violations.push(`${filePath}: shell:true`);
      }
      if (/from\s+["'].*workspace\/canonical-path/.test(source)) {
        violations.push(`${filePath}: deep-import canonical-path`);
      }
      if (/brandCanonicalPath/.test(source)) {
        violations.push(`${filePath}: brandCanonicalPath reference`);
      }
      if (/CommandRunner|ProcessService|ShellExecutor|ExecutionEngine/.test(source)) {
        violations.push(`${filePath}: generic process abstraction`);
      }
      if (/bash -c|sh -c|powershell/i.test(source)) {
        violations.push(`${filePath}: shell command string`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("uses execFile rather than shell exec", () => {
    const runner = readFileSync(join(gitDir, "runner.ts"), "utf8");
    expect(runner).toContain("execFile");
    expect(runner).toContain("shell: false");
    expect(runner).not.toMatch(/\bexec\(/);
  });

  it("imports src/git without spawning Git or mutating process state", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      // Fresh specifier avoids relying on ESM spy limitations for execFile.
      const git = await import("../../src/git/index.js");
      expect(typeof git.discoverGitRepository).toBe("function");
      expect(Object.prototype.hasOwnProperty.call(git, "runGit")).toBe(false);
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });
});
