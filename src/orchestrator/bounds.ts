/**
 * Phase 5D2 Engineering Orchestrator — finite local bounds.
 */

export const CYCLE_RECORD_SCHEMA_VERSION = 1 as const;

export const DEFAULT_MAX_BRAIN_ATTEMPTS = 3;
export const MIN_MAX_BRAIN_ATTEMPTS = 1;
export const MAX_MAX_BRAIN_ATTEMPTS = 5;

export const DEFAULT_CYCLE_ADMISSION_MS = 600_000;
export const MIN_CYCLE_ADMISSION_MS = 1;
export const MAX_CYCLE_ADMISSION_MS = 1_800_000;

export const DEFAULT_BRAIN_ATTEMPT_TIMEOUT_MS = 60_000;

export const MAX_DIAGNOSTIC_UTF8_BYTES = 4_096;
export const MAX_RETAINED_ATTEMPT_RECORDS = 5;

export const COORDINATOR_DIAGNOSTIC_BLOCK_ID = "pathcode-cycle-diagnostic-v1";

export function isSafePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}
