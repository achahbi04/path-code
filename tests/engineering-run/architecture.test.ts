import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

const engineeringRunDir = fileURLToPath(
  new URL("../../src/engineering-run", import.meta.url),
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

describe("engineering-run architecture", () => {
  it("contains no child_process, shell:true, or write primitives", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(engineeringRunDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/from\s+["']node:child_process["']/.test(source)) {
        violations.push(filePath);
      }
      if (/shell:\s*true/.test(source)) {
        violations.push(`${filePath}: shell:true`);
      }
      if (/\bwriteFile\b|\bappendFile\b|\bcreateWriteStream\b/.test(source)) {
        violations.push(`${filePath}: write`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("does not mint approvals, spawn processes, or reclassify Validation", () => {
    const violations: string[] = [];
    for (const filePath of listTsFiles(engineeringRunDir)) {
      const source = readFileSync(filePath, "utf8");
      if (/explicitLocalProcessApproval\s*\(/.test(source)) {
        violations.push(`${filePath}: approval`);
      }
      if (/executeAuthorizedLocalProcess\s*\(/.test(source)) {
        violations.push(`${filePath}: process-execute`);
      }
      if (/classifyLocalProcessForValidation\s*\(/.test(source)) {
        violations.push(`${filePath}: classifier`);
      }
      if (/EngineeringRunApproval|EngineeringRunAuthorization/.test(source)) {
        violations.push(`${filePath}: parallel-authority`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("package exports map has no engineering-run subpath", () => {
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
      const mod = await import("../../src/engineering-run/index.js");
      expect(typeof mod.executeEngineeringRun).toBe("function");
      expect(typeof mod.checkEngineeringRunApplicability).toBe("function");
      expect(typeof mod.summarizeEngineeringRun).toBe("function");
      expect(process.cwd()).toBe(cwdSnapshot);
      expect(process.env).toEqual(envSnapshot);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });
});
