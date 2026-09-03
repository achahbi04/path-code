/**
 * Permanent falsifications for the universal phaseAuditEvidence shape rule
 * used by scripts/ledger-verify.ts.
 */

import { describe, expect, it } from "vitest";

import {
  deriveAllCapabilityObservations,
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
} from "../../src/selfobs/index.js";
import type { CapabilityObservation } from "../../src/selfobs/types.js";
import { checkPhaseAuditEvidenceShapeConsistency } from "../../scripts/lib/phase-audit-shape.js";

function syntheticVerified(
  capabilityId: string,
  state: "DECLARED" | "IMPLEMENTED" | "PASS_FROZEN" | "PHASE_VERIFIED",
): CapabilityObservation {
  return {
    kind: "VERIFIED_CAPABILITY_STATE",
    capabilityId,
    state,
    verifiedAtHead: "0000000000000000000000000000000000000000",
  };
}

describe("phaseAuditEvidence shape consistency (ledger:verify helper)", () => {
  it("1-F1 — phaseAuditEvidence present with non-PHASE_VERIFIED state is rejected", () => {
    const capabilityLedger = getCanonicalCapabilityLedger();
    const foundation = capabilityLedger.records.find(
      (r) => r.capabilityId === "foundation-kernel",
    )!;
    expect(foundation.phaseAuditEvidence).toBeDefined();

    const forgedObservations: CapabilityObservation[] =
      capabilityLedger.records.map((r) =>
        r.capabilityId === "foundation-kernel"
          ? syntheticVerified("foundation-kernel", "IMPLEMENTED")
          : syntheticVerified(
              r.capabilityId,
              r.phaseAuditEvidence
                ? "PHASE_VERIFIED"
                : r.freezeEvidence
                  ? "PASS_FROZEN"
                  : r.implementationEvidence.length > 0
                    ? "IMPLEMENTED"
                    : "DECLARED",
            ),
      );

    const failures = checkPhaseAuditEvidenceShapeConsistency(
      capabilityLedger,
      forgedObservations,
    );
    expect(
      failures.some(
        (f) =>
          f.capabilityId === "foundation-kernel" &&
          f.message.includes("phaseAuditEvidence present"),
      ),
    ).toBe(true);
  });

  it("1-F2 — phaseAuditEvidence absent with PHASE_VERIFIED state is rejected", () => {
    const capabilityLedger = getCanonicalCapabilityLedger();
    const editContracts = capabilityLedger.records.find(
      (r) => r.capabilityId === "edit-contracts",
    )!;
    expect(editContracts.phaseAuditEvidence).toBeUndefined();

    const forgedObservations: CapabilityObservation[] =
      capabilityLedger.records.map((r) =>
        r.capabilityId === "edit-contracts"
          ? syntheticVerified("edit-contracts", "PHASE_VERIFIED")
          : syntheticVerified(
              r.capabilityId,
              r.phaseAuditEvidence
                ? "PHASE_VERIFIED"
                : r.freezeEvidence
                  ? "PASS_FROZEN"
                  : r.implementationEvidence.length > 0
                    ? "IMPLEMENTED"
                    : "DECLARED",
            ),
      );

    const failures = checkPhaseAuditEvidenceShapeConsistency(
      capabilityLedger,
      forgedObservations,
    );
    expect(
      failures.some(
        (f) =>
          f.capabilityId === "edit-contracts" &&
          f.message.includes("phaseAuditEvidence absent"),
      ),
    ).toBe(true);
  });

  it(
    "accepts truthful matching observations from verified derivation",
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
      const observations = deriveAllCapabilityObservations(
        capabilityLedger,
        gapLedger,
        result.verification,
      );
      expect(
        checkPhaseAuditEvidenceShapeConsistency(capabilityLedger, observations),
      ).toEqual([]);
    },
    120_000,
  );
});
