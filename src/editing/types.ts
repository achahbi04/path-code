/**
 * Phase 3A edit contract types — preparation, authorization, future records.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { GitStateBaseline } from "../git/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { ContentFingerprint } from "../reader/types.js";

export type MutationAction = "MODIFY_EXISTING_FILE" | "CREATE_FILE";

/** Deferred actions are intentionally absent from Phase 3A vocabulary. */
export type DeferredMutationAction =
  | "DELETE_FILE"
  | "CREATE_DIRECTORY"
  | "MOVE"
  | "RENAME"
  | "SYMLINK"
  | "GIT_MUTATION"
  | "EXECUTE_COMMAND";

export type CreationPrecondition = {
  readonly kind: "NON_EXISTENT";
  readonly parent: RepositoryEntry;
  readonly leafName: string;
  readonly targetRelativePath: string;
  readonly observedAtMs: number;
};

export type PreparedMutationData = {
  readonly preparedId: string;
  readonly action: "MODIFY_EXISTING_FILE";
  readonly target: RepositoryEntry;
  readonly beforeFingerprint: ContentFingerprint;
  readonly beforeByteLength: number;
  readonly afterFingerprint: ContentFingerprint;
  readonly afterByteLength: number;
  readonly proposedBytes: Readonly<Uint8Array>;
  readonly config: ResolvedProjectConfig;
  readonly workspace: WorkspaceBoundary;
};

export type PreparedMutation = PreparedMutationData & {
  readonly __preparedMutationBrand: never;
};

export type PreparedCreationData = {
  readonly preparedId: string;
  readonly action: "CREATE_FILE";
  readonly parent: RepositoryEntry;
  readonly leafName: string;
  readonly targetRelativePath: string;
  readonly precondition: CreationPrecondition;
  readonly afterFingerprint: ContentFingerprint;
  readonly afterByteLength: number;
  readonly proposedBytes: Readonly<Uint8Array>;
  readonly config: ResolvedProjectConfig;
  readonly workspace: WorkspaceBoundary;
};

export type PreparedCreation = PreparedCreationData & {
  readonly __preparedCreationBrand: never;
};

export type PreparedChange = PreparedMutation | PreparedCreation;

/** Explicit human/caller approval at the sole authorization boundary. */
export type ExplicitEditApproval = {
  readonly kind: "EXPLICIT_EDIT_APPROVAL";
};

export type PreparationFailureCode =
  | "TARGET_DENIED"
  | "BEFORE_STATE_UNAVAILABLE"
  | "FILE_TOO_LARGE"
  | "PARENT_NOT_ADMITTED"
  | "INVALID_LEAF_NAME"
  | "CREATION_ABSENCE_UNPROVEN"
  | "TARGET_ALREADY_OBSERVED"
  | "BOUNDS_EXCEEDED"
  | "NOT_REGULAR_FILE"
  | "ACTION_DISABLED";

export type PreparationFailure = {
  readonly code: PreparationFailureCode;
  readonly message: string;
};

export type AuthorizationFailureCode =
  | "APPROVAL_REQUIRED"
  | "ACTION_DISABLED"
  | "TARGET_DENIED"
  | "GIT_UNMERGED"
  | "PREPARED_IDENTITY_MISMATCH"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "PREPARED_SNAPSHOT_MISMATCH";

export type AuthorizationFailure = {
  readonly code: AuthorizationFailureCode;
  readonly message: string;
};

declare const editAuthorizationBrand: unique symbol;

export type EditAuthorization = {
  readonly [editAuthorizationBrand]: true;
  readonly authorizationId: string;
  readonly preparedRef: PreparedChange;
  readonly action: MutationAction;
  readonly targetRelativePath: string;
  readonly beforeFingerprint: ContentFingerprint | null;
  readonly afterFingerprint: ContentFingerprint;
  readonly afterByteLength: number;
  readonly issuedAtMs: number;
};

declare const editCommitGrantBrand: unique symbol;

/** Internal one-shot handoff token for Phase 3B — not public authority. */
export type EditCommitGrant = {
  readonly [editCommitGrantBrand]: true;
  readonly authorization: EditAuthorization;
  readonly preparedRef: PreparedChange;
};

export type EditOutcome =
  | "SUCCESS"
  | "REFUSED_PRECOMMIT"
  | "FAILED_PRECOMMIT"
  | "COMMITTED_FAILURE"
  | "PARTIAL_APPLICATION";

/** Terminal record for existing-file replacement — issued only by the editing engine. */
export type EditRecordExistingFile = {
  readonly kind: "EXISTING_FILE";
  readonly target: RepositoryEntry;
  readonly authorizationId: string;
  readonly beforeFingerprint: ContentFingerprint;
  readonly beforeByteLength: number;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly expectedAfterByteLength: number;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly observedAfterByteLength: number | null;
  readonly outcome: EditOutcome;
  readonly commitPointReached: boolean;
  readonly provenance: "PATH_CODE_MODIFIED" | null;
  readonly durabilityVerified: boolean;
  readonly gitContext?: GitStateBaseline;
};

export type EditRecordCreation = {
  readonly kind: "CREATION";
  readonly parent: RepositoryEntry;
  readonly leafName: string;
  readonly targetRelativePath: string;
  readonly authorizationId: string;
  readonly beforePrecondition: CreationPrecondition;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly expectedAfterByteLength: number;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly observedAfterByteLength: number | null;
  readonly outcome: EditOutcome;
  readonly commitPointReached: boolean;
  readonly provenance: "PATH_CODE_MODIFIED" | null;
  readonly durabilityVerified: boolean;
  readonly gitContext?: GitStateBaseline;
};

export type EditRecord = EditRecordExistingFile | EditRecordCreation;

/** Knowledge invalidation contract — emitted only after successful mutation in later phases. */
export type KnowledgeInvalidation = {
  readonly kind: "KNOWLEDGE_INVALIDATION";
  readonly targetRelativePath: string;
  readonly invalidatedAtMs: number;
  readonly editRecordKind: EditRecord["kind"];
};

export type AuthorizePreparedChangeOptions = {
  readonly gitContext?: GitStateBaseline;
};

export type ReplaceExistingFileFailureCode =
  | AuthorizationFailureCode
  | PreparationFailureCode
  | "UNSUPPORTED_ATOMIC_REPLACE_PLATFORM"
  | "STALE_BEFORE_STATE"
  | "HARD_LINK_UNSUPPORTED"
  | "NOT_REGULAR_FILE"
  | "TARGET_TYPE_CHANGED"
  | "IDENTITY_CHANGED"
  | "WORKSPACE_INCOMPATIBLE"
  | "TEMP_CREATE_FAILED"
  | "TEMP_WRITE_FAILED"
  | "TEMP_FSYNC_FAILED"
  | "METADATA_PRESERVATION_FAILED"
  | "CANDIDATE_VERIFICATION_FAILED"
  | "RENAME_FAILED"
  | "DIRECTORY_FSYNC_FAILED"
  | "AFTER_STATE_READ_FAILED"
  | "AFTER_STATE_MISMATCH";

export type ReplaceExistingFileFailure = {
  readonly code: ReplaceExistingFileFailureCode;
  readonly message: string;
};

/**
 * Mutation-time config freshness.
 *
 * `MUTATION_TIME_RE_RESOLVED` — `loadProjectConfig` succeeded at mutation time
 * (including successful ABSENT when PATHCODE.md is missing).
 *
 * `SUPPLIED_ONLY` — retained only for terminal outcomes that refuse *before*
 * mutation-time config reload is attempted (bounds/platform/auth gates). It is
 * never used as a stale-config fallback to continue mutation after reload failure.
 */
export type ConfigFreshness = "MUTATION_TIME_RE_RESOLVED" | "SUPPLIED_ONLY";

/**
 * Distinguishing refusal reasons required for mutation-time policy evidence.
 * Optional on other terminal outcomes that do not need this discrimination.
 */
export type MutationTimeRefusalReason =
  | "CONFIG_RELOAD_FAILED"
  | "TARGET_DENIED"
  | "ACTION_DISABLED"
  | "TARGET_STALE";

export type ReplaceExistingFileSuccess = {
  readonly outcome: "SUCCESS";
  readonly commitPointReached: true;
  readonly durabilityVerified: true;
  readonly editRecord: EditRecordExistingFile;
  readonly knowledgeInvalidation: KnowledgeInvalidation;
  readonly configFreshness: "MUTATION_TIME_RE_RESOLVED";
};

export type ReplaceExistingFileTerminalFailure = {
  readonly outcome: "REFUSED_PRECOMMIT" | "FAILED_PRECOMMIT" | "COMMITTED_FAILURE";
  readonly commitPointReached: boolean;
  readonly durabilityVerified: boolean;
  readonly editRecord: EditRecordExistingFile;
  readonly knowledgeInvalidation: KnowledgeInvalidation | null;
  readonly cleanupFailure?: boolean;
  readonly configFreshness: ConfigFreshness;
  readonly refusalReason?: MutationTimeRefusalReason;
};

export type ReplaceExistingFileResult =
  | ReplaceExistingFileSuccess
  | ReplaceExistingFileTerminalFailure;

export type CreateFileFailureCode =
  | AuthorizationFailureCode
  | PreparationFailureCode
  | "UNSUPPORTED_ATOMIC_CREATE_PLATFORM"
  | "TARGET_ALREADY_EXISTS"
  | "ABSENCE_UNVERIFIABLE"
  | "PARENT_NOT_ADMITTED"
  | "PARENT_IDENTITY_CHANGED"
  | "WORKSPACE_INCOMPATIBLE"
  | "TEMP_CREATE_FAILED"
  | "TEMP_WRITE_FAILED"
  | "TEMP_FSYNC_FAILED"
  | "MODE_APPLY_FAILED"
  | "CANDIDATE_VERIFICATION_FAILED"
  | "LINK_FAILED"
  | "DIRECTORY_FSYNC_FAILED"
  | "AFTER_STATE_READ_FAILED"
  | "AFTER_STATE_MISMATCH"
  | "GIT_UNMERGED";

export type CreateFileFailure = {
  readonly code: CreateFileFailureCode;
  readonly message: string;
};

export type CreateFileSuccess = {
  readonly outcome: "SUCCESS";
  readonly commitPointReached: true;
  readonly durabilityVerified: true;
  readonly editRecord: EditRecordCreation;
  readonly knowledgeInvalidation: KnowledgeInvalidation;
  readonly configFreshness: "MUTATION_TIME_RE_RESOLVED";
};

export type CreateFileTerminalFailure = {
  readonly outcome: "REFUSED_PRECOMMIT" | "FAILED_PRECOMMIT" | "COMMITTED_FAILURE";
  readonly commitPointReached: boolean;
  readonly durabilityVerified: boolean;
  readonly editRecord: EditRecordCreation;
  readonly knowledgeInvalidation: KnowledgeInvalidation | null;
  readonly cleanupFailure?: boolean;
  readonly configFreshness: ConfigFreshness;
  readonly refusalReason?: MutationTimeRefusalReason;
  readonly failureCode?: CreateFileFailureCode;
};

export type CreateFileResult = CreateFileSuccess | CreateFileTerminalFailure;
