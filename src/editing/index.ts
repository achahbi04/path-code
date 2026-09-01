/**
 * Phase 3A edit contracts — public surface (no writes, no authority issuers).
 */

export {
  MAX_EDIT_FILE_BYTES,
  MAX_FILES_PER_EDIT_OPERATION,
  MAX_TOTAL_PROPOSED_AFTER_BYTES,
} from "./bounds.js";

export {
  authorizePreparedChange,
  explicitEditApproval,
} from "./authorization.js";

export {
  prepareCreateFile,
  prepareModifyExistingFile,
} from "./preparation.js";

export {
  validatePreparedBatchBounds,
  validateReaderByteLimit,
} from "./batch-bounds.js";

export {
  DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE,
  isModifyExistingFileDisabled,
  isMutationActionDisabledByConfig,
} from "./policy.js";

export type {
  AuthorizationFailure,
  AuthorizationFailureCode,
  AuthorizePreparedChangeOptions,
  CreationPrecondition,
  DeferredMutationAction,
  EditAuthorization,
  EditOutcome,
  EditRecord,
  EditRecordCreation,
  EditRecordExistingFile,
  ExplicitEditApproval,
  KnowledgeInvalidation,
  MutationAction,
  PreparationFailure,
  PreparationFailureCode,
  PreparedChange,
  PreparedCreation,
  PreparedCreationData,
  PreparedMutation,
  PreparedMutationData,
} from "./types.js";
