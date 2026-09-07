/**
 * Phase 5D1 Engineering Brain — finite local bounds.
 * Does not modify Phase 4 execution limits.
 */

export const BRAIN_RECEIPT_SCHEMA_VERSION = 1 as const;

export const MAX_PREPARED_REQUEST_UTF8_BYTES = 262_144;
export const MAX_TASK_TEXT_UTF8_BYTES = 8_192;
export const MAX_REFERENCE_DESCRIPTORS = 128;
export const MAX_CONTEXT_BLOCKS = 32;
export const MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES = 32_768;
export const MAX_ID_UTF8_BYTES = 128;
export const MAX_RELATIVE_PATH_UTF8_BYTES = 1_024;
export const MAX_REFS_PER_BLOCK = 32;

/** Aligned with Gate 1 `MAX_PROPOSAL_JSON_UTF8_BYTES`. */
export const MAX_RESPONSE_UTF8_BYTES = 65_536;

export const DEFAULT_MAX_OUTPUT_TOKENS = 2_048;
export const HARD_MAX_OUTPUT_TOKENS = 8_192;
export const DEFAULT_TIMEOUT_MS = 60_000;
export const HARD_MAX_TIMEOUT_MS = 300_000;

export const DEFAULT_MAX_DISPATCHES = 8;
export const HARD_MAX_DISPATCHES = 8;
export const MIN_MAX_DISPATCHES = 1;

export const REASONING_PROPOSAL_SCHEMA_VERSION = 1 as const;
export const ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION = 1 as const;

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function isNonemptyBoundedId(value: string): boolean {
  return value.length > 0 && utf8ByteLength(value) <= MAX_ID_UTF8_BYTES;
}

export function isSafePositiveInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
  );
}

export function isSafeNonnegativeInt(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}
