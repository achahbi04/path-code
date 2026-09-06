/**
 * Phase 5B V1 ceilings — reject, never silently truncate or widen.
 */

export const MAX_PROPOSAL_JSON_UTF8_BYTES = 65_536;
export const MAX_CLAIMS = 32;
export const MIN_CLAIMS = 1;
export const MAX_HYPOTHESES = 16;
export const MAX_CITATIONS_PER_CLAIM = 8;
export const MAX_INFERENCE_BASIS_LINKS = 32;
export const MAX_CATALOG_RECORDS = 128;
export const MAX_ID_UTF8_BYTES = 128;
export const MAX_RELATIVE_PATH_HINT_UTF8_BYTES = 1_024;
export const MAX_TEXT_FIELD_UTF8_BYTES = 4_096;
export const MAX_DEPENDENCY_OR_SYMBOL_UTF8_BYTES = 256;
export const MAX_CONTAINS_NEEDLE_UTF8_BYTES = 1_024;
export const MAX_UNIQUE_CONTENT_INPUTS_PER_CALL = 32;
export const MAX_CUMULATIVE_CONTENT_VERIFICATION_BYTES = 16 * 1024 * 1024;

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function isNonEmptyIdWithinLimit(value: string): boolean {
  return value.length > 0 && utf8ByteLength(value) <= MAX_ID_UTF8_BYTES;
}

export function isTextFieldWithinLimit(value: string): boolean {
  return utf8ByteLength(value) <= MAX_TEXT_FIELD_UTF8_BYTES;
}
