import { describe, expect, it } from "vitest";

import {
  CANONICAL_CAPABILITY_LEDGER,
  CANONICAL_GAP_LEDGER,
  deriveAllCapabilityObservations,
  deriveCapabilityObservation,
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
} from "../../src/selfobs/index.js";
import { issueLedgerVerification } from "../../src/selfobs/internal/issue-verification.js";

describe("selfobs derivation", () => {
  it("returns UNVERIFIED_DERIVATION without verification", () => {
    const observations = deriveAllCapabilityObservations(
      getCanonicalCapabilityLedger(),
      getCanonicalGapLedger(),
      undefined,
    );
    expect(observations.every((o) => o.kind === "UNVERIFIED_DERIVATION")).toBe(true);
    expect(
      observations.some(
        (o) => o.kind === "UNVERIFIED_DERIVATION" && o.candidateState === "PHASE_VERIFIED",
      ),
    ).toBe(true);
  });

  it("never returns VERIFIED_CAPABILITY_STATE without verification", () => {
    for (const record of getCanonicalCapabilityLedger().records) {
      const observation = deriveCapabilityObservation(
        record,
        undefined,
        getCanonicalCapabilityLedger(),
        getCanonicalGapLedger(),
      );
      expect(observation.kind).toBe("UNVERIFIED_DERIVATION");
    }
  });

  it("derives safe-editing as candidate IMPLEMENTED without verification", () => {
    const observation = deriveCapabilityObservation(
      getCanonicalCapabilityLedger().records.find(
        (r) => r.capabilityId === "safe-editing",
      )!,
      undefined,
      getCanonicalCapabilityLedger(),
      getCanonicalGapLedger(),
    );
    expect(observation).toEqual({
      kind: "UNVERIFIED_DERIVATION",
      capabilityId: "safe-editing",
      candidateState: "IMPLEMENTED",
    });
  });

  it("rejects verification bound to a different ledger object", () => {
    const verification = issueLedgerVerification({
      verifiedAtHead: "56440e68bade7edd5b19778695e8783a18337566",
      capabilityLedger: CANONICAL_CAPABILITY_LEDGER,
      gapLedger: CANONICAL_GAP_LEDGER,
      citationOutcomes: [],
    });
    const foreignLedger = {
      revision: "foreign",
      records: CANONICAL_CAPABILITY_LEDGER.records,
    };
    const observation = deriveCapabilityObservation(
      getCanonicalCapabilityLedger().records.find(
        (r) => r.capabilityId === "safe-editing",
      )!,
      verification,
      foreignLedger,
      getCanonicalGapLedger(),
    );
    expect(observation.kind).toBe("UNVERIFIED_DERIVATION");
  });

  it("lowers to IMPLEMENTED when freeze evidence is unresolved", () => {
    const record = getCanonicalCapabilityLedger().records.find(
      (r) => r.capabilityId === "freshness-snapshot",
    )!;
    const freeze = record.freezeEvidence!;
    expect(freeze.kind).toBe("twoCommit");
    if (freeze.kind !== "twoCommit") {
      throw new Error("expected twoCommit freeze");
    }
    const verification = issueLedgerVerification({
      verifiedAtHead: "56440e68bade7edd5b19778695e8783a18337566",
      capabilityLedger: CANONICAL_CAPABILITY_LEDGER,
      gapLedger: CANONICAL_GAP_LEDGER,
      citationOutcomes: [
        ...record.declarationEvidence.map((c) => ({
          citationKey: `document|${c.path}|${c.atCommit}`,
          resolved: true,
        })),
        ...record.implementationEvidence.map((c) => ({
          citationKey: `module|${c.path}|${c.atCommit}`,
          resolved: true,
        })),
        {
          citationKey: `freeze|twoCommit|${freeze.implementationCommit}|${freeze.evidenceCommit}|${freeze.reportPath}`,
          resolved: false,
        },
      ],
    });
    const observation = deriveCapabilityObservation(
      record,
      verification,
      getCanonicalCapabilityLedger(),
      getCanonicalGapLedger(),
    );
    expect(observation).toMatchObject({
      kind: "VERIFIED_CAPABILITY_STATE",
      state: "IMPLEMENTED",
    });
  });

  it(
    "derives Phase 3 editing capabilities after public authority-surface relink",
    async () => {
      const { verifyLedgers } = await import("../../scripts/lib/ledger-verifier.js");
      const repoRoot = new URL("../..", import.meta.url).pathname;
      const capabilityLedger = getCanonicalCapabilityLedger();
      const gapLedger = getCanonicalGapLedger();
      const result = await verifyLedgers(repoRoot, capabilityLedger, gapLedger);
      expect(result.ok).toBe(true);
      expect(result.verification).toBeDefined();
      if (!result.verification) {
        return;
      }

      const observations = deriveAllCapabilityObservations(
        capabilityLedger,
        gapLedger,
        result.verification,
      );
      const editContracts = observations.find((o) => o.capabilityId === "edit-contracts");
      const safeEditing = observations.find((o) => o.capabilityId === "safe-editing");

      expect(editContracts).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "edit-contracts",
        state: "PASS_FROZEN",
      });
      expect(safeEditing).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "safe-editing",
        state: "IMPLEMENTED",
      });

      for (const id of [
        "existing-file-replacement",
        "safe-file-creation",
        "multi-file-coordination",
      ] as const) {
        const obs = observations.find((o) => o.capabilityId === id);
        expect(obs).toMatchObject({
          kind: "VERIFIED_CAPABILITY_STATE",
          capabilityId: id,
          state: "PASS_FROZEN",
        });
      }

      for (const id of ["GAP-048", "GAP-049", "GAP-050"] as const) {
        const gap = gapLedger.records.find((r) => r.id === id);
        expect(gap?.lifecycle).toBe("CLOSED");
      }
      expect(gapLedger.records.find((r) => r.id === "GAP-051")).toMatchObject({
        lifecycle: "OPEN",
      });
      expect(gapLedger.records.find((r) => r.id === "GAP-052")?.lifecycle).toBe(
        "OPEN",
      );
      expect(gapLedger.records.find((r) => r.id === "GAP-053")?.lifecycle).toBe(
        "CLOSED",
      );
      expect(gapLedger.records.find((r) => r.id === "GAP-054")?.lifecycle).toBe(
        "CLOSED",
      );
      expect(gapLedger.records.find((r) => r.id === "GAP-055")?.lifecycle).toBe(
        "OPEN",
      );
      expect(gapLedger.records.find((r) => r.id === "GAP-056")?.lifecycle).toBe(
        "OPEN",
      );
    },
    60_000,
  );

  it(
    "phase-promotion falsification — removing phaseAuditEvidence lowers safe-editing to DECLARED/IMPLEMENTED",
    async () => {
      const { verifyLedgers } = await import("../../scripts/lib/ledger-verifier.js");
      const repoRoot = new URL("../..", import.meta.url).pathname;
      const capabilityLedger = getCanonicalCapabilityLedger();
      const gapLedger = getCanonicalGapLedger();
      const result = await verifyLedgers(repoRoot, capabilityLedger, gapLedger);
      expect(result.ok).toBe(true);
      if (!result.verification) {
        return;
      }

      // After Stage 1 downgrade, live safe-editing already lacks phaseAuditEvidence.
      // Restore a forged phaseAuditEvidence then remove it to prove the direction.
      const original = capabilityLedger.records.find(
        (r) => r.capabilityId === "safe-editing",
      )!;
      expect(original.phaseAuditEvidence).toBeUndefined();
      const withPhase = {
        ...original,
        phaseAuditEvidence: {
          auditReportPath: "docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md",
          auditCommit: "5606b49ec753b8988213b6c912d7de5de51d52ee",
          auditConclusionNeedle: "**Conclusion:** PHASE 3 SAFE EDITING — COMPLETE",
          closureDocumentPath: "docs/PHASE_3_CLOSURE.md",
          closureCommit: "04591e400f6b8efe7190ce01faef4da97d0eb984",
          auditCheckpointNeedle: "5606b49ec753b8988213b6c912d7de5de51d52ee",
        },
      };
      const raisedLedger = {
        ...capabilityLedger,
        records: capabilityLedger.records.map((r) =>
          r.capabilityId === "safe-editing" ? withPhase : r,
        ),
      };
      const raisedResult = await verifyLedgers(repoRoot, raisedLedger, gapLedger);
      expect(raisedResult.ok).toBe(true);
      if (!raisedResult.verification) {
        return;
      }
      const raisedObs = deriveCapabilityObservation(
        withPhase,
        raisedResult.verification,
        raisedLedger,
        gapLedger,
      );
      expect(raisedObs).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "safe-editing",
        state: "PHASE_VERIFIED",
      });

      const { phaseAuditEvidence: _removed, ...withoutPhase } = withPhase;
      const forgedLedger = {
        ...capabilityLedger,
        records: capabilityLedger.records.map((r) =>
          r.capabilityId === "safe-editing" ? withoutPhase : r,
        ),
      };
      const forgedResult = await verifyLedgers(repoRoot, forgedLedger, gapLedger);
      expect(forgedResult.ok).toBe(true);
      if (!forgedResult.verification) {
        return;
      }
      const obs = deriveCapabilityObservation(
        withoutPhase,
        forgedResult.verification,
        forgedLedger,
        gapLedger,
      );
      expect(obs).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "safe-editing",
      });
      expect(obs).not.toMatchObject({ state: "PHASE_VERIFIED" });
      if (obs.kind === "VERIFIED_CAPABILITY_STATE") {
        expect(["DECLARED", "IMPLEMENTED"]).toContain(obs.state);
      }
    },
    180_000,
  );

  it(
    "relink falsification — removing freezeEvidence lowers trio to IMPLEMENTED",
    async () => {
      const { verifyLedgers } = await import("../../scripts/lib/ledger-verifier.js");
      const repoRoot = new URL("../..", import.meta.url).pathname;
      const capabilityLedger = getCanonicalCapabilityLedger();
      const gapLedger = getCanonicalGapLedger();
      const result = await verifyLedgers(repoRoot, capabilityLedger, gapLedger);
      expect(result.ok).toBe(true);
      if (!result.verification) {
        return;
      }

      for (const capabilityId of [
        "existing-file-replacement",
        "safe-file-creation",
        "multi-file-coordination",
      ] as const) {
        const original = capabilityLedger.records.find(
          (r) => r.capabilityId === capabilityId,
        )!;
        expect(original.freezeEvidence).toBeDefined();
        expect(original.freezeEvidence).toMatchObject({
          kind: "sameCommit",
          implementationCommit: "5386f349eccd7c69ff696619ffc426757e3e91d0",
          reportPath:
            "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md",
        });

        const { freezeEvidence: _removed, ...withoutFreeze } = original;
        const strippedLedger = {
          ...capabilityLedger,
          records: capabilityLedger.records.map((r) =>
            r.capabilityId === capabilityId ? withoutFreeze : r,
          ),
        };
        const strippedResult = await verifyLedgers(
          repoRoot,
          strippedLedger,
          gapLedger,
        );
        expect(strippedResult.ok).toBe(true);
        if (!strippedResult.verification) {
          return;
        }
        const strippedObs = deriveCapabilityObservation(
          withoutFreeze,
          strippedResult.verification,
          strippedLedger,
          gapLedger,
        );
        // Focused PASS_FROZEN expectation must fail: without freeze → IMPLEMENTED.
        expect(strippedObs).toMatchObject({
          kind: "VERIFIED_CAPABILITY_STATE",
          capabilityId,
          state: "IMPLEMENTED",
        });
        expect(strippedObs).not.toMatchObject({ state: "PASS_FROZEN" });

        // Restore: original freezeEvidence still present on canonical record.
        const restoredObs = deriveCapabilityObservation(
          original,
          result.verification,
          capabilityLedger,
          gapLedger,
        );
        expect(restoredObs).toMatchObject({
          kind: "VERIFIED_CAPABILITY_STATE",
          capabilityId,
          state: "PASS_FROZEN",
        });
      }
    },
    120_000,
  );
});
