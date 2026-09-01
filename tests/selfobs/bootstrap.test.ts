import { describe, expect, it } from "vitest";

import { checkBootstrapIntegrity, getCanonicalCapabilityLedger } from "../../src/selfobs/index.js";

describe("ledger bootstrap falsification", () => {
  it("fails bootstrap when a self-record is injected", () => {
    const ledger = getCanonicalCapabilityLedger();
    const corrupted = {
      ...ledger,
      records: [
        ...ledger.records,
        {
          capabilityId: "engineering-self-observation-runtime",
          title: "Self Observation",
          phaseId: "selfobs",
          declarationEvidence: [],
          implementationEvidence: [],
          proofObligations: [],
          dependencies: [],
          knownLimitations: [],
        },
      ],
    };
    const violations = checkBootstrapIntegrity(corrupted);
    expect(violations.some((v) => v.code === "BOOTSTRAP_SELF_RECORD")).toBe(true);
  });
});
