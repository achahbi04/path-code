/**
 * LedgerVerification type and binding checks — no issuance constructor.
 */

import type { CapabilityLedger } from "./capability-types.js";
import type { GapLedger } from "./gap-types.js";
import type { CitationResolutionOutcome } from "./types.js";

const ledgerVerificationBrand: unique symbol = Symbol("LedgerVerification");

export type LedgerVerification = Readonly<{
  readonly [ledgerVerificationBrand]: true;
  readonly verifiedAtHead: string;
  readonly capabilityLedgerRef: CapabilityLedger;
  readonly gapLedgerRef: GapLedger;
  readonly citationOutcomes: readonly CitationResolutionOutcome[];
}>;

export function isLedgerVerificationBoundToLedgers(
  verification: LedgerVerification,
  capabilityLedger: CapabilityLedger,
  gapLedger: GapLedger,
): boolean {
  return (
    verification.capabilityLedgerRef === capabilityLedger &&
    verification.gapLedgerRef === gapLedger
  );
}

export { ledgerVerificationBrand };
