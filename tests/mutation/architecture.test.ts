/**
 * Phase 5D3 mutation architecture / type boundary proofs (M30).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const mutationDir = fileURLToPath(
  new URL("../../src/orchestrator/mutation", import.meta.url),
);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const ALLOWED_FILES = new Set([
  "src/orchestrator/mutation/bounds.ts",
  "src/orchestrator/mutation/envelope.ts",
  "src/orchestrator/mutation/failures.ts",
  "src/orchestrator/mutation/index.ts",
  "src/orchestrator/mutation/registry.ts",
  "src/orchestrator/mutation/session.ts",
  "src/orchestrator/mutation/types.ts",
]);

const ALLOWED_VALUE_EXPORTS = new Set([
  "DEFAULT_POST_EDIT_BRAIN_ATTEMPTS",
  "EDIT_ENVELOPE_SCHEMA_VERSION",
  "MAX_AFTER_TEXT_UTF8_BYTES",
  "MAX_EMBEDDED_REASONING_UTF8_BYTES",
  "MAX_MUTATION_TARGETS",
  "MAX_POST_EDIT_BRAIN_ATTEMPTS",
  "MAX_POST_EDIT_CONTENT_INPUTS",
  "MAX_REOBSERVATION_CONTENT_BYTES",
  "MAX_SUPPORTING_CLAIM_IDS",
  "MAX_TOTAL_AFTER_TEXT_UTF8_BYTES",
  "MIN_MUTATION_TARGETS",
  "MIN_POST_EDIT_BRAIN_ATTEMPTS",
  "MIN_SUPPORTING_CLAIM_IDS",
  "MUTATION_RECORD_SCHEMA_VERSION",
  "PATHCODE_POLICY_FILENAME",
  "utf8ByteLength",
  "configurationFailure",
  "sessionFailure",
  "openEngineeringMutationSession",
  "summarizeMutationSession",
]);

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

describe("mutation architecture M30", () => {
  it("M30: allowlisted modules; no fs/mint/provider; not on package root", async () => {
    const files = listTsFiles(mutationDir).map((f) =>
      relative(repoRoot, f).replaceAll("\\", "/"),
    );
    expect(new Set(files)).toEqual(ALLOWED_FILES);

    for (const rel of files) {
      const src = readFileSync(join(repoRoot, rel), "utf8");
      expect(src).not.toMatch(
        /from ["']node:(fs|path|child_process|worker_threads|http|https|net|dns|tls)["']/,
      );
      expect(src).not.toMatch(/explicitEditApproval\s*\(/);
      expect(src).not.toMatch(/authorizePreparedChange\s*\(/);
      expect(src).not.toMatch(/authorizeValidationPlan\s*\(/);
      expect(src).not.toMatch(/explicitLocalProcessApproval\s*\(/);
      expect(src).not.toMatch(/openai|@google\/generative|fetch\s*\(/i);
    }

    const mod = await import("../../src/orchestrator/mutation/index.js");
    expect(Object.keys(mod).sort()).toEqual([...ALLOWED_VALUE_EXPORTS].sort());

    const root = await import("../../src/index.js");
    expect(root).not.toHaveProperty("openEngineeringMutationSession");

    const orch = await import("../../src/orchestrator/index.js");
    expect(orch).not.toHaveProperty("openEngineeringMutationSession");
  });
});
