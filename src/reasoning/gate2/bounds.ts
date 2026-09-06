/**
 * Phase 5C Gate 2 V1 ceilings — reject, never silently truncate.
 */

import { MAX_CLAIMS, MAX_ID_UTF8_BYTES, utf8ByteLength } from "../bounds.js";
import { MAX_VALIDATION_CHECKS } from "../../validation/bounds.js";

export const MAX_EXECUTION_CLAIMS = MAX_CLAIMS;
export const MAX_ASSIGNMENT_ROWS = MAX_CLAIMS;
export const MAX_SELECTED_CHECKS_PER_CLAIM = MAX_VALIDATION_CHECKS;
export { MAX_ID_UTF8_BYTES, utf8ByteLength };

export function isNonEmptyIdWithinLimit(value: string): boolean {
  return value.length > 0 && utf8ByteLength(value) <= MAX_ID_UTF8_BYTES;
}
