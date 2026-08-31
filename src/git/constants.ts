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

/**
 * Maximum pathname arguments per check-ignore --stdin -z invocation.
 *
 * Conservative batch size for inventories near the Phase 2A observation
 * ceiling. Callers cannot widen this.
 */
export const MAX_CHECK_IGNORE_PATHS_PER_BATCH = 64;

/**
 * Conservative UTF-8 stdin-byte ceiling for one check-ignore --stdin -z
 * invocation (NUL-framed pathname payload).
 *
 * Path Code safety bound — not an exact OS pipe/argv proof. Callers cannot
 * widen this.
 *
 * Naming note: Git rejects `check-ignore -z` without `--stdin`, so the H1
 * transport bound applies to the stdin pathname payload rather than argv.
 */
export const MAX_CHECK_IGNORE_ARGUMENT_BYTES = 16_384;
