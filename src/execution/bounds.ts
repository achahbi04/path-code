/**
 * Phase 4 local-process execution bounds.
 * Callers may lower timeouts/limits; they cannot widen these ceilings.
 */

/** Default wall-clock timeout when the request omits timeoutMs. */
export const DEFAULT_LOCAL_PROCESS_TIMEOUT_MS = 120_000;

/** Hard maximum authorized execution duration (30 minutes). */
export const MAX_LOCAL_PROCESS_TIMEOUT_MS = 1_800_000;

/** Grace after SIGTERM before SIGKILL. */
export const LOCAL_PROCESS_TERMINATION_GRACE_MS = 2_000;

/** Final wait after SIGKILL before TERMINATION_NOT_CONFIRMED. */
export const LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS = 5_000;

export const MAX_LOCAL_PROCESS_ARGV_COUNT = 256;

export const MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES = 65_536;

export const MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES = 65_536;

export const MAX_LOCAL_PROCESS_STDOUT_BYTES = 16_777_216;

export const MAX_LOCAL_PROCESS_STDERR_BYTES = 16_777_216;

/** Environment policy identity for V1 allowlist/denylist snapshot. */
export const LOCAL_PROCESS_ENV_POLICY_ID = "local-process-env-v1";

/** Platform policy identity for V1 macOS/Linux-only support. */
export const LOCAL_PROCESS_PLATFORM_POLICY_ID = "local-process-posix-v1";
