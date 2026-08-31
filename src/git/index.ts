/**
 * Path Code Git workspace discovery and state baseline.
 * Side-effect free on import — Git runs only on explicit calls.
 */

export { discoverGitRepository, type GitRepository } from "./discovery.js";
export type {
  GitDiscoveryFailure,
  GitDiscoveryFailureCode,
} from "./failure.js";
export {
  collectGitStateBaseline,
  parsePorcelainV2Status,
  buildGitVisibilityScope,
  assertGitPathVisible,
} from "./baseline.js";
export type {
  GitBaselineFailure,
  GitBaselineFailureCode,
} from "./baseline-failure.js";
export {
  GIT_STATE_COMMAND_TIMEOUT_MS,
  MAX_GIT_STATE_COMMAND_OUTPUT_BYTES,
} from "./constants.js";
export type {
  CommandExclusionStatus,
  GitBranchState,
  GitChangeKind,
  GitEntryAnnotation,
  GitEntryState,
  GitHeadState,
  GitObjectId,
  GitPathObservation,
  GitRepositoryAvailability,
  GitStateBaseline,
  GitStateBaselineData,
  UnmappedVisibleGitObservation,
} from "./types.js";
