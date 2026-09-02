/**
 * Phase 3 edit contracts — public surface.
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
  DISABLE_ACTION_FOR_CREATE_FILE,
  DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE,
  isCreateFileDisabled,
  isModifyExistingFileDisabled,
  isMutationActionDisabledByConfig,
} from "./policy.js";

export { replaceExistingFile } from "./replace-existing-file.js";
export type { ReplaceExistingFileOptions } from "./replace-existing-file.js";

export { createFile } from "./create-file.js";
export type { CreateFileOptions } from "./create-file.js";

export {
  computeCreatedFileMode,
  CREATED_FILE_BASE_MODE,
  isAtomicCreatePlatformSupported,
  isAtomicReplacePlatformSupported,
  PATH_CODE_CREATE_TEMP_PREFIX,
  PATH_CODE_TEMP_PREFIX,
} from "./atomic-fs.js";

export type {
  AuthorizationFailure,
  AuthorizationFailureCode,
  AuthorizePreparedChangeOptions,
  ConfigFreshness,
  CreateFileFailure,
  CreateFileFailureCode,
  CreateFileResult,
  CreateFileSuccess,
  CreateFileTerminalFailure,
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
  MutationTimeRefusalReason,
  PreparationFailure,
  PreparationFailureCode,
  PreparedChange,
  PreparedCreation,
  PreparedCreationData,
  PreparedMutation,
  PreparedMutationData,
  ReplaceExistingFileResult,
  ReplaceExistingFileSuccess,
  ReplaceExistingFileTerminalFailure,
} from "./types.js";
