/**
 * Phase 6A recovery architecture / boundary proofs.
 *
 * 6A-S  the mutation session cannot recover: it never imports recovery review,
 *       authorization or execution, so a validation failure has no path to an
 *       automatic rollback
 * 6A-T  a recovery result is not validation (Gate 2) evidence: recovery never
 *       touches the evidence registries and carries an explicit denial
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const recoveryDir = join(repoRoot, "src/recovery");
const mutationDir = join(repoRoot, "src/orchestrator/mutation");

const ALLOWED_RECOVERY_FILES = new Set([
  "src/recovery/bounds.ts",
  "src/recovery/authorization.ts",
  "src/recovery/binding.ts",
  "src/recovery/checkpoint.ts",
  "src/recovery/execute.ts",
  "src/recovery/index.ts",
  "src/recovery/internal/consume-authorization.ts",
  "src/recovery/internal/registry.ts",
  "src/recovery/observe.ts",
  "src/recovery/review.ts",
  "src/recovery/store-fs.ts",
  "src/recovery/store.ts",
  "src/recovery/types.ts",
]);

const ALLOWED_BARREL_VALUE_EXPORTS = new Set([
  "MAX_CHECKPOINT_BLOB_BYTES",
  "MAX_CHECKPOINT_ENTRIES",
  "MAX_CHECKPOINT_MANIFEST_BYTES",
  "RECOVERY_MANIFEST_SCHEMA_VERSION",
  "RECOVERY_RECORD_SCHEMA_VERSION",
  "authorizeRecoveryReview",
  "createRecoveryStore",
  "digestBytes",
  "executeRecovery",
  "explicitRecoveryApproval",
  "inspectRecoveryAuthorizationCompatibility",
  "loadCheckpoint",
  "persistCheckpoint",
  "prepareCheckpoint",
  "prepareRecoveryReview",
  "serializeCheckpointManifest",
  "validateCheckpointManifest",
  "verifyCheckpointWorkspaceBinding",
]);

/** Anything that would make recovery a Git operation instead of a byte restore. */
const FORBIDDEN_GIT_PATTERNS = [
  /git\s+checkout/i,
  /git\s+restore/i,
  /reset\s+--hard/i,
  /\brunGit\b/,
  /from\s+["'](?:\.\.\/)+git\//,
  /from\s+["']node:child_process["']/,
];

/** Anything that would let a recovery result masquerade as validation evidence. */
const FORBIDDEN_EVIDENCE_PATTERNS = [
  /from\s+["'](?:\.\.\/)+reasoning\//,
  /from\s+["'](?:\.\.\/)+validation\//,
  /from\s+["'](?:\.\.\/)+execution\//,
  /from\s+["'](?:\.\.\/)+run-evidence\//,
  /from\s+["'](?:\.\.\/)+engineering-run\//,
  /ExecutionEvidence/,
  /ValidationAuthorization/,
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

/**
 * Doc comments state the prohibitions in prose ("no git checkout"), so the
 * scanner reads code only.
 */
function stripComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "")
    .replaceAll(/(^|\s)\/\/.*$/gm, "$1");
}

function recoveryFiles(): { rel: string; source: string }[] {
  return listTsFiles(recoveryDir).map((file) => ({
    rel: relative(repoRoot, file).replaceAll("\\", "/"),
    source: stripComments(readFileSync(file, "utf8")),
  }));
}

describe("6A recovery architecture", () => {
  it("is exactly the allowlisted module set", () => {
    expect(new Set(recoveryFiles().map((f) => f.rel))).toEqual(
      ALLOWED_RECOVERY_FILES,
    );
  });

  it("never recovers through Git", () => {
    const violations: string[] = [];
    for (const { rel, source } of recoveryFiles()) {
      for (const pattern of FORBIDDEN_GIT_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${rel} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("6A-T: never participates in validation evidence", () => {
    const violations: string[] = [];
    for (const { rel, source } of recoveryFiles()) {
      for (const pattern of FORBIDDEN_EVIDENCE_PATTERNS) {
        if (pattern.test(source)) {
          violations.push(`${rel} matched ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);

    // The record says so on its face, in a field that cannot be omitted.
    const types = readFileSync(join(recoveryDir, "types.ts"), "utf8");
    expect(types).toMatch(/readonly notValidationEvidence: true;/);
    expect(types).toMatch(/readonly automaticRollback: false;/);
    expect(types).toMatch(/readonly noGitRecovery: true;/);
  });

  it("6A-S: the mutation session has no path to automatic recovery", () => {
    const mutationSources = listTsFiles(mutationDir).map((file) =>
      readFileSync(file, "utf8"),
    );
    for (const source of mutationSources) {
      expect(source).not.toMatch(/prepareRecoveryReview/);
      expect(source).not.toMatch(/authorizeRecoveryReview/);
      expect(source).not.toMatch(/explicitRecoveryApproval/);
      expect(source).not.toMatch(/executeRecovery/);
    }
    // The session may only capture and persist a checkpoint.
    const session = readFileSync(join(mutationDir, "session.ts"), "utf8");
    expect(session).toMatch(/persistCheckpoint/);
    expect(session).toMatch(/prepareCheckpoint/);
  });

  it("6A-P: only the mutation session may reach the recovery module", () => {
    const importers = listTsFiles(join(repoRoot, "src"))
      .map((file) => ({
        rel: relative(repoRoot, file).replaceAll("\\", "/"),
        source: readFileSync(file, "utf8"),
      }))
      .filter(
        (f) =>
          !f.rel.startsWith("src/recovery/") &&
          /from\s+["'][^"']*recovery\//.test(f.source),
      )
      .map((f) => f.rel);
    expect(new Set(importers)).toEqual(
      new Set([
        "src/orchestrator/mutation/session.ts",
        "src/orchestrator/mutation/types.ts",
      ]),
    );
    // Nothing the model drives — brain, reasoning, adapters — can see it.
    for (const rel of importers) {
      expect(rel).not.toMatch(/^src\/(brain|reasoning|adapters)\//);
    }
  });

  it("keeps recovery off the package root and out of package exports", async () => {
    const root = await import("../../src/index.js");
    for (const name of [
      "authorizeRecoveryReview",
      "explicitRecoveryApproval",
      "executeRecovery",
      "prepareRecoveryReview",
      "createRecoveryStore",
      "prepareCheckpoint",
      "persistCheckpoint",
    ]) {
      expect(root).not.toHaveProperty(name);
    }

    const rootSource = readFileSync(join(repoRoot, "src/index.ts"), "utf8");
    expect(rootSource).not.toMatch(/from\s+["']\.\/recovery\//);
    expect(rootSource).not.toMatch(/RecoveryAuthorization|RecoveryReview/);

    const pkg = JSON.parse(
      readFileSync(join(repoRoot, "package.json"), "utf8"),
    ) as { exports: Record<string, unknown> };
    expect(Object.keys(pkg.exports)).toEqual(["."]);
  });

  it("exposes exactly the host-facing recovery surface", async () => {
    const barrel = await import("../../src/recovery/index.js");
    expect(new Set(Object.keys(barrel))).toEqual(ALLOWED_BARREL_VALUE_EXPORTS);
    // Registry and consume internals are not on the barrel.
    expect(barrel).not.toHaveProperty("registerRecoveryAuthorization");
    expect(barrel).not.toHaveProperty("consumeRecoveryAuthorization");
    expect(barrel).not.toHaveProperty("resetRecoveryRegistryForTests");
  });

  it("keeps store persistence free of credentials and encryption claims", () => {
    for (const { source } of recoveryFiles()) {
      expect(source).not.toMatch(/OPENAI_API_KEY|Authorization:\s*Bearer/);
      expect(source).not.toMatch(/createCipher|encrypt\(/);
    }
    const store = readFileSync(join(recoveryDir, "store.ts"), "utf8");
    expect(store).toMatch(/encryptsAtRest: false/);
    expect(store).toMatch(/usesGit: false/);
  });

  it("never deletes checkpoints or expires them on a timer", () => {
    for (const { rel, source } of recoveryFiles()) {
      if (rel === "src/recovery/store-fs.ts") {
        // Temporary write candidates are cleaned up; published files are not.
        continue;
      }
      expect(source).not.toMatch(/\brm\b|rmdir|prune|expire|retentionDays/i);
    }
  });
});
