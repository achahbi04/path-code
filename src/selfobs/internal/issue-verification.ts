/**
 * Internal LedgerVerification issuance — verifier tooling only.
 */

import type { CapabilityLedger } from "../capability-types.js";
import type { GapLedger } from "../gap-types.js";
import type { CitationResolutionOutcome } from "../types.js";
import {
  ledgerVerificationBrand,
  type LedgerVerification,
} from "../verification-types.js";

export type { LedgerVerification };

export type LedgerVerificationIssueInput = Readonly<{
  readonly verifiedAtHead: string;
  readonly capabilityLedger: CapabilityLedger;
  readonly gapLedger: GapLedger;
  readonly citationOutcomes: readonly CitationResolutionOutcome[];
}>;

export function issueLedgerVerification(
  input: LedgerVerificationIssueInput,
): LedgerVerification {
  return Object.freeze({
    [ledgerVerificationBrand]: true as const,
    verifiedAtHead: input.verifiedAtHead,
    capabilityLedgerRef: input.capabilityLedger,
    gapLedgerRef: input.gapLedger,
    citationOutcomes: Object.freeze([...input.citationOutcomes]),
  });
}
