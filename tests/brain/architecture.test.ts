/**
 * Phase 5D1 Engineering Brain architecture assertions.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const brainDir = fileURLToPath(new URL("../../src/brain", import.meta.url));
const srcDir = fileURLToPath(new URL("../../src", import.meta.url));
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const ALLOWED_FILES = new Set([
  "src/brain/bounds.ts",
  "src/brain/clock.ts",
  "src/brain/controller.ts",
  "src/brain/failures.ts",
  "src/brain/index.ts",
  "src/brain/normalize.ts",
  "src/brain/receipt.ts",
  "src/brain/types.ts",
]);

const ALLOWED_VALUE_EXPORTS = new Set([
  "BRAIN_RECEIPT_SCHEMA_VERSION",
  "DEFAULT_MAX_DISPATCHES",
  "DEFAULT_MAX_OUTPUT_TOKENS",
  "DEFAULT_TIMEOUT_MS",
  "HARD_MAX_DISPATCHES",
  "HARD_MAX_OUTPUT_TOKENS",
  "HARD_MAX_TIMEOUT_MS",
  "MAX_CONTEXT_BLOCKS",
  "MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES",
  "MAX_ID_UTF8_BYTES",
  "MAX_PREPARED_REQUEST_UTF8_BYTES",
  "MAX_REFERENCE_DESCRIPTORS",
  "MAX_REFS_PER_BLOCK",
  "MAX_RELATIVE_PATH_UTF8_BYTES",
  "MAX_RESPONSE_UTF8_BYTES",
  "MAX_TASK_TEXT_UTF8_BYTES",
  "MIN_MAX_DISPATCHES",
  "REASONING_PROPOSAL_SCHEMA_VERSION",
  "ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION",
  "utf8ByteLength",
  "createEngineeringBrain",
  "readMonotonicMs",
  "readWallMs",
  "configurationFailure",
  "invocationFailure",
  "summarizeBrainInvocation",
]);

const ALLOWED_IMPORT_PREFIXES = [
      "../domain/",
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

describe("engineering brain architecture", () => {
  it("D22: allowlisted brain modules only; no forbidden I/O or reverse imports", () => {
    const files = listTsFiles(brainDir).map((f) =>
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
      expect(src).not.toMatch(
        /from ["']\.\.\/(editing|execution|validation|engineering-run|run-evidence)\//,
      );
      expect(src).not.toMatch(/from ["']\.\.\/reasoning\/(bind|gate2|parse)/);

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

    // Earlier layers must not import brain. Orchestrator (5D2) and adapters (5E1)
    // are later consumers — see PHASE_5E1_OPENAI_TRANSPORT_AMENDMENT_1.
    for (const file of listTsFiles(srcDir)) {
      const rel = relative(repoRoot, file).replaceAll("\\", "/");
      if (rel.startsWith("src/brain/")) continue;
      if (rel.startsWith("src/orchestrator/")) continue;
      if (rel.startsWith("src/orchestrator/mutation/")) continue;
      if (rel.startsWith("src/adapters/")) continue;
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/from ["']\.\/brain|from ["']\.\.\/brain/);
    }
  });

  it("D22: finite package-internal exports; not on src/index", async () => {
    const mod = await import("../../src/brain/index.js");
    const valueKeys = Object.keys(mod).sort();
    expect(valueKeys).toEqual([...ALLOWED_VALUE_EXPORTS].sort());

    const root = await import("../../src/index.js");
    expect(root).not.toHaveProperty("createEngineeringBrain");
    expect(root).not.toHaveProperty("summarizeBrainInvocation");
  });

  it("D22: barrel loads without import-time invocation side effects", async () => {
    const mod = await import("../../src/brain/index.js");
    expect(typeof mod.createEngineeringBrain).toBe("function");
    expect(typeof mod.summarizeBrainInvocation).toBe("function");
  });
});
