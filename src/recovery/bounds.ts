/**
 * Phase 6A recovery ceilings — a caller may narrow, never widen.
 */

import { MAX_EDIT_FILE_BYTES } from "../editing/bounds.js";

/**
 * A checkpoint blob can only ever hold bytes Path Code was allowed to read or
 * write, so the editing ceiling is the correct bound.
 */
export const MAX_CHECKPOINT_BLOB_BYTES = MAX_EDIT_FILE_BYTES;

/** Manifests stay small; a larger one is a corruption signal, not a payload. */
export const MAX_CHECKPOINT_MANIFEST_BYTES = 1_048_576;

export const RECOVERY_RECORD_SCHEMA_VERSION = 1;
