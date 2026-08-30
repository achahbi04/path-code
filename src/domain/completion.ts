/**
 * Completion reporting contract.
 * Report what was not proven — notValidated is non-optional.
 */

import type { EvidenceRecord, ValidationOutcome } from "./evidence.js";

export type CompletionReport = {
  readonly completed: boolean;
  readonly outcome: ValidationOutcome;
  readonly evidence: readonly EvidenceRecord[];
  /**
   * Explicit list of claims/items that were not validated.
   * Callers must provide `notValidated: []` when nothing remains unvalidated.
   */
  readonly notValidated: readonly string[];
};
