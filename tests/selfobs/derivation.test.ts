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

  it("derives safe-editing as candidate DECLARED without verification", () => {
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
      candidateState: "DECLARED",
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
    "derives Phase 3 editing capabilities after public authority-surface downgrade",
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
        state: "DECLARED",
      });

      const existingFileReplacement = observations.find(
        (o) => o.capabilityId === "existing-file-replacement",
      );
      expect(existingFileReplacement).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "existing-file-replacement",
        state: "IMPLEMENTED",
      });

      const safeFileCreation = observations.find(
        (o) => o.capabilityId === "safe-file-creation",
      );
      expect(safeFileCreation).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "safe-file-creation",
        state: "IMPLEMENTED",
      });

      const multiFile = observations.find(
        (o) => o.capabilityId === "multi-file-coordination",
      );
      expect(multiFile).toMatchObject({
        kind: "VERIFIED_CAPABILITY_STATE",
        capabilityId: "multi-file-coordination",
        state: "IMPLEMENTED",
      });
    },
    60_000,
  );

  it(
    "downgrade falsification — restored freezeEvidence yields PASS_FROZEN not IMPLEMENTED",
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

      const restorations = [
        {
          capabilityId: "existing-file-replacement",
          freezeEvidence: {
            kind: "twoCommit" as const,
            implementationCommit: "ad85c9f1262635f9a81b5608b20c198a7b8b489d",
            evidenceCommit: "2b635316f7f08c0cf08ef42ec40ab2cd513d3969",
            reportPath: "docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md",
            productionScopes: ["src/editing/"],
          },
        },
        {
          capabilityId: "safe-file-creation",
          freezeEvidence: {
            kind: "twoCommit" as const,
            implementationCommit: "1136c40ab1667e4a5b70185c8bef68ce67d675a2",
            evidenceCommit: "2a573301f871ae506491ddbfa8f6407521b4b956",
            reportPath: "docs/reports/PHASE_3C_H1_REPORT.md",
            productionScopes: ["src/editing/"],
          },
        },
        {
          capabilityId: "multi-file-coordination",
          freezeEvidence: {
            kind: "sameCommit" as const,
            implementationCommit: "4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9",
            reportPath: "docs/reports/PHASE_3D_REPORT.md",
          },
        },
      ];

      for (const restoration of restorations) {
        const original = capabilityLedger.records.find(
          (r) => r.capabilityId === restoration.capabilityId,
        )!;
        expect(original.freezeEvidence).toBeUndefined();
        const forged = {
          ...original,
          freezeEvidence: restoration.freezeEvidence,
        };
        const forgedLedger = {
          ...capabilityLedger,
          records: capabilityLedger.records.map((r) =>
            r.capabilityId === restoration.capabilityId ? forged : r,
          ),
        };
        // Re-verify against forged freezeEvidence citations at the restored commits.
        const forgedResult = await verifyLedgers(repoRoot, forgedLedger, gapLedger);
        expect(forgedResult.ok).toBe(true);
        if (!forgedResult.verification) {
          return;
        }
        const obs = deriveCapabilityObservation(
          forged,
          forgedResult.verification,
          forgedLedger,
          gapLedger,
        );
        // Focused expectation IMPLEMENTED must fail: restored freeze yields PASS_FROZEN.
        expect(obs).toMatchObject({
          kind: "VERIFIED_CAPABILITY_STATE",
          capabilityId: restoration.capabilityId,
          state: "PASS_FROZEN",
        });
        expect(obs).not.toMatchObject({ state: "IMPLEMENTED" });
      }
    },
    120_000,
  );
});
