/**
 * Phase 3 editing hard ceilings — caller may narrow, never widen.
 */

import { MAX_REPOSITORY_CONTENT_BYTES } from "../reader/constants.js";

/** Must equal the frozen Phase 2B full-read ceiling. */
export const MAX_EDIT_FILE_BYTES = MAX_REPOSITORY_CONTENT_BYTES;

export const MAX_FILES_PER_EDIT_OPERATION = 16;

export const MAX_TOTAL_PROPOSED_AFTER_BYTES = 8_388_608;
