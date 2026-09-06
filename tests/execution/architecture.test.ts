import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const executionDir = fileURLToPath(
  new URL("../../src/execution", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const AUTHORIZED_HOST = "internal/process-host.ts";

function listTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

describe("execution architecture", () => {
  it("allows node:child_process only in the authorized process-host module", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(executionDir)) {
      const source = readFileSync(filePath, "utf8");
      const relative = filePath.slice(executionDir.length + 1);
      const importsChild =
        /from\s+["']node:child_process["']/.test(source) ||
        /from\s+["']child_process["']/.test(source);
      if (importsChild && relative !== AUTHORIZED_HOST) {
        violations.push(relative);
      }
      if (relative === AUTHORIZED_HOST) {
        expect(importsChild).toBe(true);
        expect(source).toMatch(/\bspawn\b/);
        expect(source).toMatch(/shell:\s*false/);
        expect(source).not.toMatch(/shell:\s*true/);
      }
    }
    expect(violations).toEqual([]);
  });

  it("contains no shell command strings", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(executionDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/bash -c|sh -c|powershell/i.test(source)) {
        violations.push(filePath);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not export internal registry/consume/host from the execution barrel", () => {
    const barrel = readFileSync(join(executionDir, "index.ts"), "utf8");
    expect(barrel).not.toMatch(/consumeLocalProcessAuthorization/);
    expect(barrel).not.toMatch(/registerAuthorization/);
    expect(barrel).not.toMatch(/runDetachedProcess/);
    expect(barrel).not.toMatch(/process-host/);
    expect(barrel).not.toMatch(/resetLocalProcessRegistryForTests/);
  });

  it("package root does not export execution authority mechanisms", async () => {
    const root = await import("../../src/index.js");
    const forbidden = [
      "explicitLocalProcessApproval",
      "authorizePreparedLocalProcess",
      "prepareLocalProcess",
      "executeAuthorizedLocalProcess",
      "LocalProcessAuthorization",
      "runDetachedProcess",
    ];
    for (const name of forbidden) {
      expect(Object.prototype.hasOwnProperty.call(root, name)).toBe(false);
    }
  });

  it("package exports map has no execution subpath", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(pkg.exports).toBeDefined();
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);
  });

  it("imports execution barrel without spawning or mutating process state", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const mod = await import("../../src/execution/index.js");
      expect(typeof mod.prepareLocalProcess).toBe("function");
      expect(typeof mod.explicitLocalProcessApproval).toBe("function");
      expect(typeof mod.executeAuthorizedLocalProcess).toBe("function");
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

  it("does not expose public process adapter or DI seams on the barrel", () => {
    const barrel = readFileSync(join(executionDir, "index.ts"), "utf8");
    expect(barrel).not.toMatch(/ProcessAdapter|processOps|executorCallback|fsOps/);
    expect(barrel).not.toMatch(/child_process/);
  });
});
