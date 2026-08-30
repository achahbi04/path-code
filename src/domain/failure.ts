/**
 * Failure, diagnosis, retry, and stop contracts.
 * Failures trigger diagnosis; retry without diagnosis is not representable.
 */

import type { ActionClass } from "./authority.js";
import type { EvidenceRecord } from "./evidence.js";
import type { JsonObject } from "./json.js";

/** Deliberately small foundational failure vocabulary. */
export type FailureCode =
  | "INVALID_INPUT"
  | "UNSUPPORTED_RUNTIME"
  | "INVARIANT_VIOLATION"
  | "INTERNAL_ERROR";

export type Diagnosis = {
  readonly summary: string;
  readonly causeCategory: FailureCode;
  readonly recommendedAction: string;
};

export type FailureRecord = {
  readonly action: ActionClass;
  readonly code: FailureCode;
  readonly message: string;
  readonly evidence: readonly EvidenceRecord[];
  /** Required — blind retry without diagnosis is not representable. */
  readonly diagnosis: Diagnosis;
  readonly details?: JsonObject;
};

/**
 * A retry request must reference a diagnosed FailureRecord.
 */
export type RetryRequest = {
  readonly failure: FailureRecord;
  readonly attempt: number;
};

export type RetryAuthorization = {
  readonly request: RetryRequest;
  readonly authorized: boolean;
  readonly reason: string;
};

export type RetryBudget = {
  readonly maxAttempts: number;
  readonly attemptsUsed: number;
};

export type StopCondition =
  | { readonly kind: "RETRY_BUDGET_EXHAUSTED" }
  | { readonly kind: "DIAGNOSIS_REQUIRES_ESCALATION" }
  | { readonly kind: "AUTHORITY_DENIED" }
  | { readonly kind: "OPERATOR_STOP" };
