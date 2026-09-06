import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const validationDir = fileURLToPath(
  new URL("../../src/validation", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

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

describe("validation architecture", () => {
  it("contains no child_process or shell:true", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(validationDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/from\s+["']node:child_process["']/.test(source)) {
        violations.push(filePath);
      }
      if (/shell:\s*true/.test(source)) {
        violations.push(`${filePath}: shell:true`);
      }
      if (/bash -c|sh -c/.test(source)) {
        violations.push(`${filePath}: shell string`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not mint process approval", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(validationDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/explicitLocalProcessApproval\s*\(/.test(source)) {
        violations.push(filePath);
      }
    }
    expect(violations).toEqual([]);
  });

  it("package exports map has no validation subpath", () => {
    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);
  });

  it("imports without mutating host process state", async () => {
    const envSnapshot = { ...process.env };
    const cwdSnapshot = process.cwd();
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const mod = await import("../../src/validation/index.js");
      expect(typeof mod.prepareValidationPlan).toBe("function");
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });
});
