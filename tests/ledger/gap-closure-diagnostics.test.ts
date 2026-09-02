import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  getCanonicalCapabilityLedger,
  getCanonicalGapLedger,
  isReviewedGap,
  type GapLedger,
  type GapRecord,
  type ReviewedGapRecord,
} from "../../src/selfobs/index.js";
import { verifyLedgers } from "../../scripts/lib/ledger-verifier.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const FAKE_SHA = "0000000000000000000000000000000000000001";
const LEDGER_VERIFY_TIMEOUT_MS = 60_000;

function cloneGapLedger(): GapLedger {
  const canonical = getCanonicalGapLedger();
  return {
    ...canonical,
    records: canonical.records.map((record) => ({ ...record })),
  };
}

function patchGap030(
  ledger: GapLedger,
  patch: Partial<Pick<ReviewedGapRecord, "closedByCommit" | "closureEvidence">>,
): GapLedger {
  return {
    ...ledger,
    records: ledger.records.map((record): GapRecord => {
      if (record.id !== "GAP-030" || !isReviewedGap(record)) {
        return record;
      }
      return { ...record, ...patch };
    }),
  };
}

function gap030WithoutClosedByCommit(ledger: GapLedger): GapLedger {
  return {
    ...ledger,
    records: ledger.records.map((record): GapRecord => {
      if (record.id !== "GAP-030" || !isReviewedGap(record)) {
        return record;
      }
      const { closedByCommit: _closedByCommit, ...rest } = record;
      return rest;
    }),
  };
}

function failureCodes(result: Awaited<ReturnType<typeof verifyLedgers>>): string[] {
  return result.failures.map((failure) => failure.code);
}

function failureMessages(result: Awaited<ReturnType<typeof verifyLedgers>>): string[] {
  return result.failures.map((failure) => failure.message);
}

describe("gap closure commit diagnostics", () => {
  it(
    "accepts a CLOSED gap whose closedByCommit resolves to a real ancestor commit",
    async () => {
      const result = await verifyLedgers(
        repoRoot,
        getCanonicalCapabilityLedger(),
        getCanonicalGapLedger(),
      );

      expect(result.ok).toBe(true);
      expect(failureCodes(result)).not.toContain("GAP_CLOSURE_COMMIT_UNRESOLVED");
      expect(
        failureMessages(result).some((message) => message.includes("closedByCommit missing")),
      ).toBe(false);
    },
    LEDGER_VERIFY_TIMEOUT_MS,
  );

  it(
    "reports schema failure when closedByCommit is absent on a CLOSED gap",
    async () => {
      const gapLedger = gap030WithoutClosedByCommit(cloneGapLedger());
      const result = await verifyLedgers(
        repoRoot,
        getCanonicalCapabilityLedger(),
        gapLedger,
      );

      expect(result.ok).toBe(false);
      expect(failureCodes(result)).toContain("GAP_SCHEMA");
      expect(failureMessages(result)).toContain("GAP-030: CLOSED missing closure fields");
      expect(failureCodes(result)).not.toContain("GAP_CLOSURE_COMMIT_UNRESOLVED");
      expect(
        failureMessages(result).some((message) => message.includes("closedByCommit missing")),
      ).toBe(false);
    },
    LEDGER_VERIFY_TIMEOUT_MS,
  );

  it(
    "reports commit-resolution failure when closedByCommit is present but unresolvable",
    async () => {
      const gapLedger = patchGap030(cloneGapLedger(), {
        closedByCommit: FAKE_SHA,
      });
      const result = await verifyLedgers(
        repoRoot,
        getCanonicalCapabilityLedger(),
        gapLedger,
      );

      expect(result.ok).toBe(false);
      expect(failureCodes(result)).toContain("GAP_CLOSURE_COMMIT_UNRESOLVED");
      expect(failureMessages(result)).toContain(
        `GAP-030: closedByCommit ${FAKE_SHA} does not resolve to a Git commit`,
      );
      expect(
        failureMessages(result).some((message) => message.includes("closedByCommit missing")),
      ).toBe(false);
    },
    LEDGER_VERIFY_TIMEOUT_MS,
  );
});
