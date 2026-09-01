import { describe, expect, it } from "vitest";

import { getCanonicalGapLedger, renderGapLedgerMarkdown } from "../../src/selfobs/index.js";
import { isReviewedGap } from "../../src/selfobs/gap-types.js";

describe("selfobs type construction proofs", () => {
  it("documents that plain objects are not LedgerVerification", () => {
    const plain = {
      verifiedAtHead: "56440e68bade7edd5b19778695e8783a18337566",
    };
    expect(Object.keys(plain)).toEqual(["verifiedAtHead"]);
  });

  it("supports reviewed and unreviewed gap discriminated shapes", () => {
    const reviewed = getCanonicalGapLedger().records.find((r) => r.id === "GAP-001")!;
    expect(isReviewedGap(reviewed)).toBe(true);
  });

  it("renders gap ledger deterministically", () => {
    const first = renderGapLedgerMarkdown(getCanonicalGapLedger());
    const second = renderGapLedgerMarkdown(getCanonicalGapLedger());
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });
});
