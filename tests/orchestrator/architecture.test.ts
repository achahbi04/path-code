/**
 * Phase 5D2 orchestrator architecture assertions.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const orchDir = fileURLToPath(new URL("../../src/orchestrator", import.meta.url));
const srcDir = fileURLToPath(new URL("../../src", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const ALLOWED_FILES = new Set([
  "src/orchestrator/bounds.ts",
  "src/orchestrator/cycle.ts",
  "src/orchestrator/failures.ts",
  "src/orchestrator/feedback.ts",
  "src/orchestrator/index.ts",
  "src/orchestrator/packet.ts",
  "src/orchestrator/seams.ts",
  "src/orchestrator/summary.ts",
  "src/orchestrator/types.ts",
]);

const ALLOWED_VALUE_EXPORTS = new Set([
  "CYCLE_RECORD_SCHEMA_VERSION",
  "DEFAULT_BRAIN_ATTEMPT_TIMEOUT_MS",
  "DEFAULT_CYCLE_ADMISSION_MS",
  "DEFAULT_MAX_BRAIN_ATTEMPTS",
  "MAX_CYCLE_ADMISSION_MS",
  "MAX_DIAGNOSTIC_UTF8_BYTES",
  "MAX_MAX_BRAIN_ATTEMPTS",
  "MAX_RETAINED_ATTEMPT_RECORDS",
  "MIN_CYCLE_ADMISSION_MS",
  "MIN_MAX_BRAIN_ATTEMPTS",
  "COORDINATOR_DIAGNOSTIC_BLOCK_ID",
  "configurationFailure",
  "cycleFailure",
  "openEngineeringCycle",
  "summarizeEngineeringCycle",
]);

const ALLOWED_IMPORT_PREFIXES = [
  "../brain/",
  "../domain/",
  "../engineering-run/",
  "../execution/",
  "../reasoning/",
  "../snapshot/",
  "../validation/",
  "./",
  "node:crypto",
];

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

describe("orchestrator architecture", () => {
  it("E22: allowlisted modules; no forbidden I/O/mint/reverse imports", () => {
    const files = listTsFiles(orchDir).map((f) =>
      relative(repoRoot, f).replaceAll("\\", "/"),
    );
    expect(new Set(files)).toEqual(ALLOWED_FILES);

    for (const rel of files) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).not.toMatch(
        /from ["']node:(fs|path|child_process|worker_threads|http|https|net|dns|tls)["']/,
      );
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/process\.env/);
      expect(src).not.toMatch(/explicitLocalProcessApproval\s*\(/);
      expect(src).not.toMatch(/authorizeValidationPlan\s*\(/);
      expect(src).not.toMatch(/from ["']\.\.\/editing\//);

      for (const line of src.split("\n")) {
        const m = line.match(/from ["']([^"']+)["']/);
        if (!m) continue;
        if (line.trimStart().startsWith("import type")) continue;
        const spec = m[1]!;
        if (spec.startsWith("node:")) {
          expect(spec).toBe("node:crypto");
          continue;
        }
        const allowed = ALLOWED_IMPORT_PREFIXES.some((p) => spec.startsWith(p));
        expect(allowed, `${rel} imports ${spec}`).toBe(true);
      }
    }

    for (const file of listTsFiles(srcDir)) {
      const rel = relative(repoRoot, file).replaceAll("\\", "/");
      if (rel.startsWith("src/orchestrator/")) continue;
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(
        /from ["']\.\/orchestrator|from ["']\.\.\/orchestrator/,
      );
    }
  });

  it("E22: finite package-internal exports; not on src/index", async () => {
    const mod = await import("../../src/orchestrator/index.js");
    const valueKeys = Object.keys(mod).sort();
    expect(valueKeys).toEqual([...ALLOWED_VALUE_EXPORTS].sort());

    const root = await import("../../src/index.js");
    expect(root).not.toHaveProperty("openEngineeringCycle");
    expect(root).not.toHaveProperty("summarizeEngineeringCycle");
  });
});
