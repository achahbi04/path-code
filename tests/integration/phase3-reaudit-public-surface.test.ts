/**
 * Phase 3 integration RE-AUDIT — public authority-surface dimensions P1–P14.
 *
 * Fresh full re-audit after public authority-surface hardening.
 * First audit at 696ef4f remains immutable; its COMPLETE conclusion is
 * superseded for progression.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS } from "../architecture/public-authority-approved-exceptions.js";
import {
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
  deriveAllCapabilityObservations,
} from "../../src/selfobs/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);

function readRepo(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("Phase 3 re-audit — public authority surface P1–P14", () => {
  it("P1 — supported public entry points are mechanically enumerable from package.json", () => {
    const pkg = JSON.parse(readRepo("package.json")) as {
      exports?: Record<string, unknown>;
      main?: string;
      types?: string;
    };
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);
    expect(pkg.main).toBe("./dist/index.js");
    expect(pkg.types).toBe("./dist/index.d.ts");
  });

  it("P2/P3 — standing guard represents public option surfaces without unapproved substitution fields", () => {
    const guard = readRepo("tests/architecture/public-authority-surface.test.ts");
    expect(guard).toMatch(/ReplaceExistingFileOptions/);
    expect(guard).toMatch(/CreateFileOptions/);
    expect(guard).toMatch(/ExecuteMultiFilePlanOptions/);
    expect(guard).toMatch(/fsOps/);
    expect(guard).toMatch(/targetOps/);
    expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toHaveLength(0);
  });

  it("P4/P5/P6/P7 — malicious public runtime proofs exist for replace/create/execute", () => {
    const malicious = readRepo("tests/editing/public-authority-malicious.test.ts");
    expect(malicious).toMatch(/replaceExistingFile ignores throwing fsOps/);
    expect(malicious).toMatch(/createFile ignores throwing fsOps/);
    expect(malicious).toMatch(/executeMultiFilePlan ignores throwing targetOps/);
  });

  it("P9 — internal WithDependencies executors are absent from public editing barrel", () => {
    const barrel = readRepo("src/editing/index.ts");
    expect(barrel).not.toMatch(/WithDependencies/);
    expect(barrel).not.toMatch(/\bfsOps\b/);
    expect(barrel).not.toMatch(/\btargetOps\b/);
  });

  it("P10 — package consumer cannot import authority-bearing internal modules via subpath", () => {
    const pkg = JSON.parse(readRepo("package.json")) as {
      exports?: Record<string, unknown>;
    };
    expect(Object.keys(pkg.exports ?? {})).toEqual(["."]);
    expect(pkg.exports).not.toHaveProperty("./editing");
    expect(pkg.exports).not.toHaveProperty("./src/editing/internal/consume-authorization.js");

    let failed = false;
    let code = "";
    try {
      require.resolve("path-code/editing");
    } catch (error) {
      failed = true;
      code = (error as NodeJS.ErrnoException).code ?? "";
    }
    expect(failed).toBe(true);
    expect(code).toMatch(/ERR_PACKAGE_PATH_NOT_EXPORTED|MODULE_NOT_FOUND/);
  });

  it("P11 — standing guard participates in npm run check via vitest suite", () => {
    const pkg = JSON.parse(readRepo("package.json")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.check).toMatch(/test/);
    expect(pkg.scripts?.test).toMatch(/vitest/);
    expect(PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS).toEqual([]);
  });

  it("P12 — public editing option types do not use any/unknown/rest/index escapes", () => {
    const checks: Array<{ file: string; typeName: string }> = [
      { file: "src/editing/replace-existing-file.ts", typeName: "ReplaceExistingFileOptions" },
      { file: "src/editing/create-file.ts", typeName: "CreateFileOptions" },
      { file: "src/editing/multi-file-types.ts", typeName: "ExecuteMultiFilePlanOptions" },
    ];
    for (const { file, typeName } of checks) {
      const source = readRepo(file);
      const match = source.match(
        new RegExp(`export type ${typeName} = \\{([\\s\\S]*?)\\};`),
      );
      expect(match).not.toBeNull();
      const body = match?.[1] ?? "";
      expect(body).not.toMatch(/\bany\b/);
      expect(body).not.toMatch(/\bunknown\b/);
      expect(body).not.toMatch(/\.\.\./);
      expect(body).not.toMatch(/\[key:/);
    }
  });

  it("P13/P14 — audit fault injection uses internal seams; first-audit public targetOps seam is gone", () => {
    const audit = readRepo("tests/integration/phase3-safe-editing-audit.test.ts");
    expect(audit).toMatch(/replaceExistingFileWithDependencies/);
    expect(audit).toMatch(/createFileWithDependencies/);
    expect(audit).toMatch(/executeMultiFilePlanWithDependencies/);
    // Public executeMultiFilePlan calls for composition remain; no public targetOps injection.
    expect(audit).not.toMatch(
      /executeMultiFilePlan\([^)]*\{[\s\S]*targetOps/,
    );
    const firstAuditReport = readRepo(
      "docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md",
    );
    expect(firstAuditReport).toMatch(/PHASE 3 SAFE EDITING — COMPLETE/);
  });

  it(
    "capability/gap ledger — affected caps PASS_FROZEN; GAP-048/049/050/051 CLOSED; safe-editing PHASE_VERIFIED",
    async () => {
      const { verifyLedgers } = await import("../../scripts/lib/ledger-verifier.js");
      const capabilityLedger = getCanonicalCapabilityLedger();
      const gapLedger = getCanonicalGapLedger();
      const result = await verifyLedgers(repoRoot, capabilityLedger, gapLedger);
      expect(result.ok).toBe(true);
      if (!result.verification) {
        return;
      }
      const observations = deriveAllCapabilityObservations(
        capabilityLedger,
        gapLedger,
        result.verification,
      );
      for (const id of [
        "edit-contracts",
        "existing-file-replacement",
        "safe-file-creation",
        "multi-file-coordination",
      ]) {
        expect(observations.find((o) => o.capabilityId === id)).toMatchObject({
          kind: "VERIFIED_CAPABILITY_STATE",
          state: "PASS_FROZEN",
        });
      }
      expect(observations.find((o) => o.capabilityId === "safe-editing")).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        state: "PHASE_VERIFIED",
      });

      const byId = Object.fromEntries(
        gapLedger.records.map((g) => [g.id, g]),
      );
      expect(byId["GAP-048"]?.lifecycle).toBe("CLOSED");
      expect(byId["GAP-049"]?.lifecycle).toBe("CLOSED");
      expect(byId["GAP-050"]?.lifecycle).toBe("CLOSED");
      expect(byId["GAP-051"]?.lifecycle).toBe("CLOSED");
    },
    60_000,
  );
});
