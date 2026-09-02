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
    "derives edit-contracts PASS_FROZEN and safe-editing DECLARED with verification",
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
        state: "PASS_FROZEN",
      });
    },
    30_000,
  );
});
