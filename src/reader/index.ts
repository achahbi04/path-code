/**
 * Public repository-content reader surface.
 *
 * No package-root export. No configuration loading. No content mutation.
 */

export { readRepositoryContent } from "./read.js";
export { MAX_REPOSITORY_CONTENT_BYTES } from "./constants.js";
export type {
  ReaderFailure,
  ReaderFailureCode,
} from "./failure.js";
export type {
  BinaryClassificationReason,
  ContentFingerprint,
  ContentObservation,
  ContentObservationData,
  ReaderOptions,
  ReaderWarning,
  ReaderWarningCode,
  RepositoryReadOutcome,
  StaleEntryReason,
  UnreadableStage,
} from "./types.js";
