/**
 * Phase 5G scope plan — finite local bounds.
 *
 * A scope plan is untrusted model output. Every bound here exists so that a
 * hostile plan cannot exhaust the host before the plan is even inspected.
 */

export const ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION = 1 as const;

export const MAX_SCOPE_PLAN_UTF8_BYTES = 32_768;
export const MAX_SCOPE_TASK_SUMMARY_UTF8_BYTES = 2_048;
export const MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES = 1_024;
export const MAX_SCOPE_REASON_UTF8_BYTES = 512;
export const MAX_SCOPE_NOTE_UTF8_BYTES = 512;

/** Mirrors MAX_MUTATION_TARGETS: the mutation session refuses more than four. */
export const MAX_SCOPE_EDITABLE_TARGETS = 4;
export const MAX_SCOPE_CONTEXT_PATHS = 16;
/** H may cover E ∪ P (and optional extras); bound ≥ E + P ceilings. */
export const MAX_SCOPE_HYDRATION_PATHS =
  MAX_SCOPE_EDITABLE_TARGETS + MAX_SCOPE_CONTEXT_PATHS;
export const MAX_SCOPE_VALIDATION_CANDIDATE_IDS = 8;
export const MAX_SCOPE_NOTES = 8;

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}
