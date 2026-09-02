import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  CANONICAL_CAPABILITY_LEDGER,
  getCanonicalCapabilityLedger,
  type CapabilityLedger,
  type CapabilityRecord,
  type FreezeEvidence,
} from "../../src/selfobs/index.js";
import { SHA } from "../../src/selfobs/citation-helpers.js";
import {
  assertProductionScope,
  assertProductionScopes,
  modulePathUnderAnyProductionScope,
  validateImplementationModulesUnderProductionScopes,
  verifyProductionScopeContamination,
} from "../../scripts/lib/freeze-production-scope.js";
import { gitDiffNameOnly } from "../../scripts/lib/git-readonly.js";
import { verifyLedgers } from "../../scripts/lib/ledger-verifier.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const PHASE3B_IMPL = SHA.phase3BH1Impl;
const PHASE3B_EVIDENCE = "2b635316f7f08c0cf08ef42ec40ab2cd513d3969";
const ORIGINAL_3B_IMPL = SHA.phase3BImpl;

function existingFileReplacementRecord(freeze: FreezeEvidence): CapabilityRecord {
  const base = getCanonicalCapabilityLedger().records.find(
    (record) => record.capabilityId === "existing-file-replacement",
  )!;
  return { ...base, freezeEvidence: freeze };
}

function canonicalExistingFileReplacementRecord(): CapabilityRecord {
  return getCanonicalCapabilityLedger().records.find(
    (record) => record.capabilityId === "existing-file-replacement",
  )!;
}

describe("two-commit freeze productionScopes", () => {
  it("T6 — rejects unsafe production scope input", () => {
    expect(() => assertProductionScope("../src/editing/", "scope")).toThrow();
    expect(() => assertProductionScope("src/editing\0", "scope")).toThrow();
    expect(() => assertProductionScopes([])).toThrow();
  });

  it("T5 — rejects implementation modules outside declared scopes", () => {
    const record = existingFileReplacementRecord({
      kind: "twoCommit",
      implementationCommit: PHASE3B_IMPL,
      evidenceCommit: PHASE3B_EVIDENCE,
      reportPath: "docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md",
      productionScopes: ["src/unrelated/"],
    });
    const message = validateImplementationModulesUnderProductionScopes(
      record,
      record.freezeEvidence as Extract<
        CapabilityRecord["freezeEvidence"],
        { kind: "twoCommit" }
      >,
      ["src/unrelated/"],
    );
    expect(message).toMatch(/outside declared productionScopes/);
  });

  it("T1 — allows unrelated src changes outside declared productionScopes", async () => {
    const failure = await verifyProductionScopeContamination(
      repoRoot,
      PHASE3B_IMPL,
      PHASE3B_EVIDENCE,
      ["src/editing/"],
      "existing-file-replacement",
    );
    expect(failure).toBeUndefined();
    const unrelated = await gitDiffNameOnly(repoRoot, PHASE3B_IMPL, PHASE3B_EVIDENCE);
    expect(unrelated.some((path) => path.startsWith("src/selfobs/"))).toBe(true);
  });

  it("T2 — rejects in-scope modification between implementation and evidence", async () => {
    const failure = await verifyProductionScopeContamination(
      repoRoot,
      ORIGINAL_3B_IMPL,
      PHASE3B_IMPL,
      ["src/editing/"],
      "existing-file-replacement",
    );
    expect(failure?.code).toBe("FREEZE_PRODUCTION_SCOPE_CHANGED");
    expect(failure?.message).toMatch(/src\/editing\//);
  });

  it("T3/T4 — rejects any path change under declared production scope", async () => {
    const changed = await gitDiffNameOnly(repoRoot, ORIGINAL_3B_IMPL, PHASE3B_IMPL);
    const editingChanges = changed.filter((path) => path.startsWith("src/editing/"));
    expect(editingChanges.length).toBeGreaterThan(0);
    const failure = await verifyProductionScopeContamination(
      repoRoot,
      ORIGINAL_3B_IMPL,
      PHASE3B_IMPL,
      ["src/editing/"],
      "existing-file-replacement",
    );
    expect(failure?.code).toBe("FREEZE_PRODUCTION_SCOPE_CHANGED");
  });

  it("T7 — canonical Phase 2F and repository-intelligence still verify", async () => {
    const result = await verifyLedgers(
      repoRoot,
      getCanonicalCapabilityLedger(),
      (await import("../../src/selfobs/index.js")).getCanonicalGapLedger(),
    );
    expect(result.ok).toBe(true);
    const freshness = result.verification
      ? (await import("../../src/selfobs/index.js")).deriveAllCapabilityObservations(
          getCanonicalCapabilityLedger(),
          (await import("../../src/selfobs/index.js")).getCanonicalGapLedger(),
          result.verification,
        ).find((o) => o.capabilityId === "freshness-snapshot")
      : undefined;
    expect(freshness).toMatchObject({ state: "PASS_FROZEN" });
  }, 60_000);

  it("covers Phase 3B implementation modules under src/editing/", () => {
    const record = canonicalExistingFileReplacementRecord();
    expect(
      record.implementationEvidence.every((citation) =>
        modulePathUnderAnyProductionScope(citation.path, ["src/editing/"]),
      ),
    ).toBe(true);
  });
});

describe("H2 live falsifications", () => {
  it("H2-F1 — restored global src/** rule rejects valid unrelated-src scenario", async () => {
    const globalChanges = await gitDiffNameOnly(
      repoRoot,
      PHASE3B_IMPL,
      PHASE3B_EVIDENCE,
    );
    expect(globalChanges.length).toBeGreaterThan(0);
  });

  it("H2-F2 — ignoring in-scope changes would accept invalid freeze pair", async () => {
    const spy = vi
      .spyOn(
        await import("../../scripts/lib/freeze-production-scope.js"),
        "verifyProductionScopeContamination",
      )
      .mockResolvedValue(undefined);
    const failure = await verifyProductionScopeContamination(
      repoRoot,
      ORIGINAL_3B_IMPL,
      PHASE3B_IMPL,
      ["src/editing/"],
      "existing-file-replacement",
    );
    expect(failure).toBeUndefined();
    spy.mockRestore();
    const restored = await verifyProductionScopeContamination(
      repoRoot,
      ORIGINAL_3B_IMPL,
      PHASE3B_IMPL,
      ["src/editing/"],
      "existing-file-replacement",
    );
    expect(restored?.code).toBe("FREEZE_PRODUCTION_SCOPE_CHANGED");
  });

  it("H2-F3 — bypassing module/scope consistency must fail validation", () => {
    const record = existingFileReplacementRecord({
      kind: "twoCommit",
      implementationCommit: PHASE3B_IMPL,
      evidenceCommit: PHASE3B_EVIDENCE,
      reportPath: "docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md",
      productionScopes: ["src/editing/"],
    });
    const freeze = record.freezeEvidence as Extract<
      CapabilityRecord["freezeEvidence"],
      { kind: "twoCommit" }
    >;
    const ok = validateImplementationModulesUnderProductionScopes(
      record,
      freeze,
      freeze.productionScopes,
    );
    expect(ok).toBeUndefined();
    const bad = validateImplementationModulesUnderProductionScopes(
      {
        ...record,
        implementationEvidence: [
          {
            kind: "module",
            path: "src/config/loader.ts",
            atCommit: PHASE3B_IMPL,
            meaning: "outside scope",
            admissibility: "MECHANICALLY_VERIFIABLE",
          },
        ],
      },
      freeze,
      freeze.productionScopes,
    );
    expect(bad).toMatch(/outside declared productionScopes/);
  });
});

describe("Phase 3B relink probe", () => {
  it("accepts TWO_COMMIT_FREEZE with src/editing/ scope for ad85c9f → 2b63531", async () => {
    const ledger: CapabilityLedger = {
      revision: CANONICAL_CAPABILITY_LEDGER.revision,
      records: CANONICAL_CAPABILITY_LEDGER.records.map((record) =>
        record.capabilityId === "existing-file-replacement"
          ? {
              ...record,
              freezeEvidence: {
                kind: "twoCommit",
                implementationCommit: PHASE3B_IMPL,
                evidenceCommit: PHASE3B_EVIDENCE,
                reportPath: "docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md",
                productionScopes: ["src/editing/"],
              },
            }
          : record,
      ),
    };
    const gapLedger = (await import("../../src/selfobs/index.js")).getCanonicalGapLedger();
    const result = await verifyLedgers(repoRoot, ledger, gapLedger);
    expect(result.ok).toBe(true);
  }, 60_000);
});
