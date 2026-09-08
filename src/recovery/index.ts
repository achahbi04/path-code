/**
 * Phase 6A Recovery Floor — package-internal barrel for hosts and tests.
 *
 * Deliberately NOT re-exported from `src/index.ts`: minting a
 * RecoveryAuthorization is a host act, and the package root must not offer it.
 */

export {
  MAX_CHECKPOINT_BLOB_BYTES,
  MAX_CHECKPOINT_MANIFEST_BYTES,
  RECOVERY_RECORD_SCHEMA_VERSION,
} from "./bounds.js";

export { createRecoveryStore } from "./store.js";
export type { CreateRecoveryStoreInput } from "./store.js";

export {
  digestBytes,
  loadCheckpoint,
  persistCheckpoint,
  prepareCheckpoint,
  serializeCheckpointManifest,
  validateCheckpointManifest,
  verifyCheckpointWorkspaceBinding,
} from "./checkpoint.js";

export { prepareRecoveryReview } from "./review.js";

export {
  authorizeRecoveryReview,
  explicitRecoveryApproval,
} from "./authorization.js";

export { inspectRecoveryAuthorizationCompatibility } from "./binding.js";
export type { RecoveryAuthorizationCompatibility } from "./binding.js";

export { executeRecovery } from "./execute.js";

export {
  MAX_CHECKPOINT_ENTRIES,
  RECOVERY_MANIFEST_SCHEMA_VERSION,
} from "./types.js";

export type {
  Checkpoint,
  CheckpointEntryManifest,
  CheckpointManifest,
  CheckpointPreState,
  CheckpointTargetInput,
  ExplicitRecoveryApproval,
  PrepareCheckpointInput,
  PreparedCheckpoint,
  RecoveryAuthorization,
  RecoveryBlobDigest,
  RecoveryBlobRef,
  RecoveryDisposition,
  RecoveryEntryDisposition,
  RecoveryEntryKind,
  RecoveryExecutionEntryDisposition,
  RecoveryExecutionEntryRecord,
  RecoveryExecutionRecord,
  RecoveryFailure,
  RecoveryFailureCode,
  RecoveryObservationView,
  RecoveryProposedAction,
  RecoveryProtectionMode,
  RecoveryReview,
  RecoveryReviewEntryView,
  RecoveryReviewView,
  RecoveryStore,
  RecoveryStoreDescriptor,
  StoredCheckpointWrite,
} from "./types.js";
