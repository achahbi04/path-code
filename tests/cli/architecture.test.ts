import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as rootPublic from "../../src/index.js";

const cliDir = fileURLToPath(new URL("../../src/cli", import.meta.url));
const platformDir = fileURLToPath(new URL("../../src/platform", import.meta.url));

const CLI_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+workspace\//,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["'](?:\.\.\/)+config\//,
  /from\s+["'](?:\.\.\/)+domain\/provider/,
  /from\s+["'](?:\.\.\/)+domain\/tool/,
  /from\s+["'](?:\.\.\/)+domain\/session/,
  /from\s+["'](?:\.\.\/)+domain\/policy/,
  /createWorkspaceBoundary|discoverGitRepository|loadProjectConfig/,
  /CommandRunner|ProcessService|ShellExecutor|ExecutionEngine/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
];

const PLATFORM_FORBIDDEN = [
  /from\s+["'](?:\.\.\/)+workspace\//,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["'](?:\.\.\/)+config\//,
  /from\s+["'](?:\.\.\/)+cli\//,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:fs["']/,
  /from\s+["']node:net["']/,
];

const MAIN_FORBIDDEN_EXTRA = [
  /process\.version/,
  /process\.platform/,
  /process\.argv/,
  /process\.exit/,
];

function listTsFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => join(dir, name));
}

describe("CLI / platform architecture", () => {
  it("keeps src/cli free of workspace/Git/config/provider/execution imports", () => {
    expect(statSync(cliDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(cliDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of CLI_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps src/platform free of capability and CLI imports", () => {
    expect(statSync(platformDir).isDirectory()).toBe(true);
    const violations: string[] = [];
    for (const filePath of listTsFiles(platformDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const pattern of PLATFORM_FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${filePath} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps runCli free of process runtime/platform/argv/exit access", () => {
    const mainPath = join(cliDir, "main.ts");
    const source = readFileSync(mainPath, "utf8");
    for (const pattern of MAIN_FORBIDDEN_EXTRA) {
      expect(pattern.test(source)).toBe(false);
    }
  });

  it("does not export CLI helpers from the package root", () => {
    expect(Object.prototype.hasOwnProperty.call(rootPublic, "runCli")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rootPublic, "evaluateStartup")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rootPublic, "detectPlatform")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(rootPublic, "getCurrentPlatform")).toBe(false);
  });

  it("keeps entry as the process adapter owning version/platform/argv reads", () => {
    const entry = readFileSync(join(cliDir, "entry.ts"), "utf8");
    const startup = readFileSync(join(cliDir, "startup.ts"), "utf8");
    expect(entry).toContain("process.version");
    expect(entry).toContain("process.platform");
    expect(entry).toContain("process.argv");
    expect(entry).toContain("evaluateStartup");
    expect(entry).toContain("runCli");
    expect(startup).toContain("evaluateNodeVersion");
    expect(startup).toContain("detectPlatform");
    expect(startup).not.toContain("process.version");
    expect(startup).not.toContain("process.platform");
  });
});
