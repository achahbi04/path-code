/**
 * Phase 6A Recovery Floor — contract types.
 *
 * Recovery is durable, explicit and human-authorized. It restores exactly the
 * bytes Path Code captured before it mutated them, and nothing else:
 *
 * - no Git checkout / restore / reset participates in recovery
 * - no automatic rollback: validation failure never triggers recovery
 * - a recovery result is an operator-facing record, never Gate 2 evidence
 * - checkpoints live OUTSIDE the target workspace and are never auto-deleted
 * - nothing here claims encryption at rest; POSIX owner-only modes only
 */

import type { Result } from "../domain/result.js";
import type { CanonicalPath } from "../domain/workspace.js";

/** Manifest schema version — a mismatch refuses the entire checkpoint. */
export const RECOVERY_MANIFEST_SCHEMA_VERSION = 1;

/** V1 ceiling on entries per checkpoint (mutation sessions permit at most 4). */
export const MAX_CHECKPOINT_ENTRIES = 8;

/**
 * Whether a mutation arc must establish a durable checkpoint before writing.
 * `NONE` preserves pre-6A behavior; there is no silent downgrade from
 * `REQUIRED` to `NONE`.
 */
export type RecoveryProtectionMode = "REQUIRED" | "NONE";

/** Only the two mutation kinds Path Code can currently reverse. */
export type RecoveryEntryKind = "REPLACE_TEXT" | "CREATE_TEXT";

export type RecoveryFailureCode =
  | "STORE_ROOT_UNAVAILABLE"
  | "STORE_WRITE_FAILED"
  | "STORE_READ_FAILED"
  | "CHECKPOINT_NOT_FOUND"
  | "CHECKPOINT_MANIFEST_INVALID"
  | "CHECKPOINT_WORKSPACE_MISMATCH"
  | "CHECKPOINT_READBACK_FAILED"
  | "INVALID_CHECKPOINT_INPUT"
  | "PRE_STATE_UNAVAILABLE"
  | "CONFIG_UNAVAILABLE"
  | "OBSERVATION_FAILED"
  | "REVIEW_NOT_REGISTERED"
  | "APPROVAL_REQUIRED"
  | "NO_ELIGIBLE_ENTRY_SELECTED"
  | "ENTRY_NOT_ELIGIBLE"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_REVIEW_MISMATCH"
  | "UNSUPPORTED_RECOVERY_PLATFORM"
  | "BOUNDS_EXCEEDED"
  | "INTERNAL_CONTRACT";

export type RecoveryFailure = {
  readonly code: RecoveryFailureCode;
  readonly message: string;
};

/** Independent content digest for one stored blob. */
export type RecoveryBlobDigest = {
  readonly algorithm: "sha256";
  readonly hex: string;
  readonly byteLength: number;
};

export type RecoveryBlobRef = {
  /** Store-local blob name — deliberately independent of the digest. */
  readonly blobId: string;
  readonly digest: RecoveryBlobDigest;
};

export type CheckpointPreState =
  | { readonly kind: "BYTES"; readonly blob: RecoveryBlobRef }
  | { readonly kind: "ABSENT" };

export type CheckpointEntryManifest = {
  readonly entryId: string;
  readonly kind: RecoveryEntryKind;
  readonly relativePath: string;
  /**
   * REPLACE_TEXT: canonical path of the target file at capture.
   * CREATE_TEXT: `null` — the target did not exist, so the parent is bound.
   */
  readonly targetCanonicalPath: string | null;
  /** CREATE_TEXT: canonical parent directory + leaf name at capture. */
  readonly parentCanonicalPath: string | null;
  readonly leafName: string | null;
  readonly preState: CheckpointPreState;
  /** Bytes Path Code intended to publish — the only state we may reverse. */
  readonly intendedPost: RecoveryBlobRef;
};

export type CheckpointManifest = {
  readonly schemaVersion: number;
  readonly checkpointId: string;
  /** Canonical workspace root at capture — binds the checkpoint to a tree. */
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly reviewId: string;
  readonly capturedAtMs: number;
  readonly noGitRecovery: true;
  readonly entries: readonly CheckpointEntryManifest[];
};

declare const checkpointBrand: unique symbol;

/**
 * A structurally validated, workspace-bound checkpoint. Produced only by
 * `persistCheckpoint` / `loadCheckpoint` — never by structural construction.
 */
export type Checkpoint = {
  readonly [checkpointBrand]: true;
  readonly checkpointId: string;
  readonly manifest: CheckpointManifest;
};

declare const preparedCheckpointBrand: unique symbol;

/** Built-but-unpersisted checkpoint: manifest plus the blob payloads. */
export type PreparedCheckpoint = {
  readonly [preparedCheckpointBrand]: true;
  readonly checkpointId: string;
  readonly manifest: CheckpointManifest;
  readonly blobs: readonly {
    readonly blobId: string;
    readonly bytes: Readonly<Uint8Array>;
    readonly digest: RecoveryBlobDigest;
  }[];
};

export type CheckpointTargetInput =
  | {
      readonly kind: "REPLACE_TEXT";
      readonly relativePath: string;
      readonly targetCanonicalPath: CanonicalPath;
      /** Exact bytes observed on disk immediately before mutation. */
      readonly preBytes: Readonly<Uint8Array>;
      readonly intendedPostBytes: Readonly<Uint8Array>;
    }
  | {
      readonly kind: "CREATE_TEXT";
      readonly relativePath: string;
      readonly parentCanonicalPath: CanonicalPath;
      readonly leafName: string;
      readonly intendedPostBytes: Readonly<Uint8Array>;
    };

export type PrepareCheckpointInput = {
  readonly workspaceRoot: CanonicalPath;
  readonly sessionId: string;
  readonly reviewId: string;
  readonly targets: readonly CheckpointTargetInput[];
};

/* ------------------------------------------------------------------ store */

export type RecoveryStoreDescriptor = {
  readonly rootDirectory: string;
  readonly ownerOnlyModesApplied: boolean;
  readonly usesGit: false;
  readonly storesCredentials: false;
  readonly encryptsAtRest: false;
};

export type StoredCheckpointWrite = {
  readonly checkpointId: string;
  readonly manifestJson: string;
  readonly blobs: readonly {
    readonly blobId: string;
    readonly bytes: Readonly<Uint8Array>;
  }[];
};

/**
 * Injectable durable checkpoint store. Implementations persist outside the
 * target workspace and never invoke Git.
 */
export type RecoveryStore = {
  describe(): RecoveryStoreDescriptor;
  writeCheckpoint(
    write: StoredCheckpointWrite,
  ): Promise<Result<true, RecoveryFailure>>;
  readManifestJson(
    checkpointId: string,
  ): Promise<Result<string, RecoveryFailure>>;
  readBlob(
    checkpointId: string,
    blobId: string,
  ): Promise<Result<Uint8Array, RecoveryFailure>>;
};

/* ----------------------------------------------------------------- review */

/** Per-entry classification of live state against pre/intended-post state. */
export type RecoveryEntryDisposition =
  | "ELIGIBLE_RESTORE"
  | "ALREADY_PRE_STATE"
  | "NOT_APPLIED"
  | "RECOVERY_CONFLICT"
  | "RECOVERY_ENTRY_INVALID";

export type RecoveryProposedAction =
  | { readonly kind: "WRITE_PRE_BYTES"; readonly byteLength: number }
  | { readonly kind: "REMOVE_CREATED_FILE" }
  | { readonly kind: "NONE" };

export type RecoveryObservationView = {
  readonly present: boolean;
  readonly digestHex: string | null;
  readonly byteLength: number | null;
  readonly canonicalPath: string | null;
};

export type RecoveryReviewEntryView = {
  readonly entryId: string;
  readonly kind: RecoveryEntryKind;
  readonly relativePath: string;
  readonly disposition: RecoveryEntryDisposition;
  readonly observation: RecoveryObservationView;
  readonly proposedAction: RecoveryProposedAction;
  /** Operator-facing reason for a non-eligible disposition. */
  readonly detail: string;
};

export type RecoveryReviewView = {
  readonly reviewId: string;
  readonly checkpointId: string;
  readonly workspaceRoot: string;
  readonly observedAtMs: number;
  readonly entries: readonly RecoveryReviewEntryView[];
};

declare const recoveryReviewBrand: unique symbol;

export type RecoveryReview = {
  readonly [recoveryReviewBrand]: true;
  readonly reviewId: string;
  readonly view: RecoveryReviewView;
};

/* ---------------------------------------------------------- authorization */

/** Explicit human approval at the sole recovery authorization boundary. */
export type ExplicitRecoveryApproval = {
  readonly kind: "EXPLICIT_RECOVERY_APPROVAL";
};

declare const recoveryAuthorizationBrand: unique symbol;

export type RecoveryAuthorization = {
  readonly [recoveryAuthorizationBrand]: true;
  readonly authorizationId: string;
  readonly reviewId: string;
  readonly checkpointId: string;
  readonly authorizedEntryIds: readonly string[];
  readonly issuedAtMs: number;
};

declare const recoveryCommitGrantBrand: unique symbol;

/** Internal one-shot handoff token — not public authority. */
export type RecoveryCommitGrant = {
  readonly [recoveryCommitGrantBrand]: true;
  readonly authorization: RecoveryAuthorization;
  readonly reviewRef: RecoveryReview;
};

/* -------------------------------------------------------------- execution */

export type RecoveryExecutionEntryDisposition =
  | "RESTORED"
  | "SKIPPED_NOT_AUTHORIZED"
  | "ALREADY_PRE_STATE"
  | "NOT_APPLIED"
  | "RECOVERY_CONFLICT"
  | "RECOVERY_ENTRY_INVALID"
  | "RESTORE_FAILED"
  | "RESTORE_OUTCOME_UNCONFIRMED";

export type RecoveryDisposition =
  | "RECOVERY_COMPLETE"
  | "RECOVERY_PARTIAL"
  | "RECOVERY_NONE";

export type RecoveryExecutionEntryRecord = {
  readonly entryId: string;
  readonly kind: RecoveryEntryKind;
  readonly relativePath: string;
  readonly authorized: boolean;
  readonly disposition: RecoveryExecutionEntryDisposition;
  /** Digest proved on disk after the action, when re-observation succeeded. */
  readonly verifiedDigestHex: string | null;
  readonly verifiedAbsent: boolean;
  readonly detail: string;
};

export type RecoveryExecutionRecord = {
  readonly schemaVersion: number;
  readonly recoveryId: string;
  readonly checkpointId: string;
  readonly reviewId: string;
  readonly authorizationId: string;
  readonly disposition: RecoveryDisposition;
  readonly authorizedCount: number;
  readonly restoredCount: number;
  readonly entries: readonly RecoveryExecutionEntryRecord[];
  /** Structural denials carried on the record itself. */
  readonly noGitRecovery: true;
  readonly notValidationEvidence: true;
  readonly automaticRollback: false;
};
