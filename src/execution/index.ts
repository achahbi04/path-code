/**
 * Phase 4 local-process execution — internal Path Code surface.
 * Not exported from the package root.
 */

export {
  DEFAULT_LOCAL_PROCESS_TIMEOUT_MS,
  LOCAL_PROCESS_ENV_POLICY_ID,
  LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS,
  LOCAL_PROCESS_PLATFORM_POLICY_ID,
  LOCAL_PROCESS_TERMINATION_GRACE_MS,
  MAX_LOCAL_PROCESS_ARGV_COUNT,
  MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES,
  MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES,
  MAX_LOCAL_PROCESS_STDERR_BYTES,
  MAX_LOCAL_PROCESS_STDOUT_BYTES,
  MAX_LOCAL_PROCESS_TIMEOUT_MS,
} from "./bounds.js";

export {
  explicitLocalProcessApproval,
  authorizePreparedLocalProcess,
} from "./authorization.js";

export {
  isLocalProcessPlatformSupported,
  prepareLocalProcess,
} from "./preparation.js";

export { executeAuthorizedLocalProcess } from "./execute.js";

export { runWithProcessObservationRunner } from "./internal/observation-runner.js";

export {
  DISABLE_ACTION_FOR_EXECUTE_PROCESS,
  isExecuteProcessDisabled,
} from "./policy.js";

export type {
  ExecutableIdentity,
  ExplicitLocalProcessApproval,
  LocalProcessAuthorization,
  LocalProcessAuthorizationFailure,
  LocalProcessAuthorizationFailureCode,
  LocalProcessCleanupResult,
  LocalProcessExecutionFailure,
  LocalProcessExecutionFailureCode,
  LocalProcessOutcome,
  LocalProcessPreparationFailure,
  LocalProcessPreparationFailureCode,
  LocalProcessRequest,
  LocalProcessResult,
  LocalProcessStreamCapture,
  PreparedLocalProcess,
} from "./types.js";
