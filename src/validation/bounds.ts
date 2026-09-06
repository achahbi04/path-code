/**
 * Phase 4B Validation bounds.
 */

/** Default per-stream capture for a validation check (bytes). */
export const DEFAULT_VALIDATION_CAPTURE_BYTES = 1_048_576;

/** Aggregate configured stdout+stderr caps across the plan. */
export const MAX_VALIDATION_PLAN_CAPTURE_BYTES = 33_554_432; // 32 MiB

/** Maximum checks per plan. */
export const MAX_VALIDATION_CHECKS = 8;

/** Sum of configured process timeouts must be <= this (execution grace extra). */
export const MAX_VALIDATION_PLAN_TIMEOUT_SUM_MS = 1_800_000;

export const VALIDATION_CRITERION_ID =
  "EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE" as const;

export const VALIDATION_SCOPE_ID = "DECLARED_OBSERVED_INPUTS" as const;
