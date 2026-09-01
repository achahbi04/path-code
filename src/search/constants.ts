/**
 * Phase 2E search hard production ceilings.
 */

export const MAX_SEARCH_TERMS = 16;
export const MAX_SEARCH_TERM_BYTES = 64;
export const MAX_SEARCH_QUERY_BYTES = 256;
export const MAX_SEARCH_EXTENSIONS = 16;
export const MAX_SEARCH_EXTENSION_BYTES = 24;
export const MAX_SEARCH_BASENAME_BYTES = 255;
export const MAX_SEARCH_SCOPE_PREFIX_BYTES = 1024;
export const MAX_SEARCH_RESULTS = 64;

/** Per-term lexical match strength for deterministic ranking. */
export const MATCH_STRENGTH = {
  BASENAME_STEM_EXACT: 4,
  PATH_COMPONENT_EXACT: 3,
  BASENAME_SUBSTRING: 2,
  PATH_SUBSTRING: 1,
  NO_MATCH: 0,
} as const;

/** Bonus added when exactBasename hard filter matches. */
export const EXACT_BASENAME_SCORE_BONUS = 100;
