/**
 * Phase 2C Git state command bounds.
 *
 * Discovery retains Phase 1D's smaller bounds. Path-bearing state commands use
 * these larger but finite ceilings. Callers cannot widen them.
 */
export const MAX_GIT_STATE_COMMAND_OUTPUT_BYTES = 16_777_216;

export const GIT_STATE_COMMAND_TIMEOUT_MS = 15_000;

/**
 * Characters that make a deny-path unsafe to express as a Git pathspec
 * exclusion without risking glob reinterpretation.
 */
export const GIT_PATHSPEC_UNSAFE_CHARS = /[[\]*?]/;
