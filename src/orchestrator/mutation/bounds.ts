/**
 * Phase 5D3 Authorized Mutation Arc — V1 bounds.
 */

export const MUTATION_RECORD_SCHEMA_VERSION = 1 as const;

export const MIN_MUTATION_TARGETS = 1;
export const MAX_MUTATION_TARGETS = 4;
export const MAX_AFTER_TEXT_UTF8_BYTES = 16_384;
export const MAX_TOTAL_AFTER_TEXT_UTF8_BYTES = 32_768;
export const MAX_EMBEDDED_REASONING_UTF8_BYTES = 16_384;
export const MAX_SUPPORTING_CLAIM_IDS = 8;
export const MIN_SUPPORTING_CLAIM_IDS = 1;
export const MAX_POST_EDIT_CONTENT_INPUTS = 24;
export const MAX_REOBSERVATION_CONTENT_BYTES = 16 * 1024 * 1024;
export const DEFAULT_POST_EDIT_BRAIN_ATTEMPTS = 2;
export const MIN_POST_EDIT_BRAIN_ATTEMPTS = 1;
export const MAX_POST_EDIT_BRAIN_ATTEMPTS = 3;

export const EDIT_ENVELOPE_SCHEMA_VERSION = 1 as const;

export const PATHCODE_POLICY_FILENAME = "PATHCODE.md";

export function utf8ByteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export function isNonemptyBoundedId(value: string, maxBytes = 128): boolean {
  return value.length > 0 && utf8ByteLength(value) <= maxBytes;
}

export function textToUtf8Bytes(text: string): Uint8Array | undefined {
  if (text.includes("\u0000")) {
    return undefined;
  }
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return undefined;
      }
      i += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return undefined;
    }
  }
  return Buffer.from(text, "utf8");
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
