/**
 * Reasoning-local input/catalog failures and claim-refusal helpers.
 * Does not expand global foundation error unions.
 */

import type { ReasoningRefusal, ReasoningRefusalCode } from "./types.js";

export type ReasoningInputFailureCode =
  | "NON_STRING_INPUT"
  | "INVALID_JSON"
  | "SCHEMA_INVALID"
  | "LIMIT_EXCEEDED"
  | "FORBIDDEN_FIELD"
  | "DUPLICATE_CLAIM_ID"
  | "DUPLICATE_HYPOTHESIS_ID"
  | "DANGLING_INFERENCE_BASIS";

export type ReasoningCatalogFailureCode =
  | "INVALID_CATALOG"
  | "DISPOSED_CATALOG"
  | "INCOMPATIBLE_CONTEXT"
  | "SELECTION_REJECTED"
  | "CONFIG_FAILURE"
  | "RESTRICTIONS_CHANGED"
  | "RESULT_NOT_REGISTERED"
  | "CATALOG_MISMATCH";

export type ReasoningInputFailure = {
  readonly kind: "INPUT";
  readonly code: ReasoningInputFailureCode;
  readonly message: string;
};

export type ReasoningCatalogFailure = {
  readonly kind: "CATALOG";
  readonly code: ReasoningCatalogFailureCode;
  readonly message: string;
};

export type ReasoningClaimRefusalFailure = {
  readonly kind: "REFUSAL";
  readonly refusal: ReasoningRefusal;
};

export type ReasoningBindFailure =
  | ReasoningInputFailure
  | ReasoningCatalogFailure
  | ReasoningClaimRefusalFailure;

export type ReasoningApplicabilityFailure =
  | ReasoningCatalogFailure
  | ReasoningClaimRefusalFailure
  | ReasoningInputFailure;

export function inputFailure(
  code: ReasoningInputFailureCode,
  message: string,
): ReasoningInputFailure {
  return { kind: "INPUT", code, message };
}

export function catalogFailure(
  code: ReasoningCatalogFailureCode,
  message: string,
): ReasoningCatalogFailure {
  return { kind: "CATALOG", code, message };
}

export function claimRefusal(
  code: ReasoningRefusalCode,
  claimId: string,
  reason: string,
  referenceCorrelation?: string,
): ReasoningClaimRefusalFailure {
  const refusal: ReasoningRefusal =
    referenceCorrelation === undefined
      ? { code, claimId, reason }
      : { code, claimId, reason, referenceCorrelation };
  return { kind: "REFUSAL", refusal };
}
