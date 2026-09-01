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
  | "REFUSED"
  | "PARTIAL_APPLICATION"
  | "AFTER_STATE_UNVERIFIED";

/** Future terminal record contract — not issuable in Phase 3A. */
export type EditRecordExistingFile = {
  readonly kind: "EXISTING_FILE";
  readonly target: RepositoryEntry;
  readonly authorizationId: string;
  readonly beforeFingerprint: ContentFingerprint;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly outcome: EditOutcome;
  readonly gitContext?: GitStateBaseline;
};

export type EditRecordCreation = {
  readonly kind: "CREATION";
  readonly parent: RepositoryEntry;
  readonly leafName: string;
  readonly authorizationId: string;
  readonly beforePrecondition: CreationPrecondition;
  readonly expectedAfterFingerprint: ContentFingerprint;
  readonly observedAfterFingerprint: ContentFingerprint | null;
  readonly outcome: EditOutcome;
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
