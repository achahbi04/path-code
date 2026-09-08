/**
 * Phase 6A recovery review — classify live state against the checkpoint.
 *
 * The review is the only thing a human is asked to approve, so it must be
 * honest about what recovery would do and refuse anything it cannot prove:
 *
 *   exact intended-post bytes on disk  → ELIGIBLE_RESTORE
 *   exact pre bytes on disk            → ALREADY_PRE_STATE
 *   CREATE target still absent         → NOT_APPLIED
 *   anything else                      → RECOVERY_CONFLICT
 *   unusable checkpoint blob / path    → RECOVERY_ENTRY_INVALID
 *
 * Classification uses SHA-256 byte identity only. A file that kept its size
 * and mtime but changed content is a conflict, not a restore candidate.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  digestBytes,
  verifyCheckpointWorkspaceBinding,
} from "./checkpoint.js";
import {
  lookupCheckpointStore,
  nextReviewId,
  registerReview,
  type ReviewEntryState,
} from "./internal/registry.js";
import {
  loadFreshInventory,
  observeRecoveryTarget,
  verifyEntryPathBinding,
  type RecoveryTargetObservation,
} from "./observe.js";
import type {
  Checkpoint,
  CheckpointEntryManifest,
  RecoveryBlobRef,
  RecoveryEntryDisposition,
  RecoveryFailure,
  RecoveryObservationView,
  RecoveryProposedAction,
  RecoveryReview,
  RecoveryReviewEntryView,
  RecoveryStore,
} from "./types.js";

function reviewFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

async function loadVerifiedBlob(
  store: RecoveryStore,
  checkpointId: string,
  ref: RecoveryBlobRef,
): Promise<Result<Uint8Array, RecoveryFailure>> {
  const stored = await store.readBlob(checkpointId, ref.blobId);
  if (!stored.ok) {
    return failure(stored.error);
  }
  const digest = digestBytes(stored.value);
  if (
    digest.hex !== ref.digest.hex ||
    digest.byteLength !== ref.digest.byteLength
  ) {
    return failure(
      reviewFailure(
        "STORE_READ_FAILED",
        `checkpoint blob '${ref.blobId}' failed independent digest verification`,
      ),
    );
  }
  return success(stored.value);
}

function observationView(
  observation: RecoveryTargetObservation | null,
): RecoveryObservationView {
  if (observation === null) {
    return Object.freeze({
      present: false,
      digestHex: null,
      byteLength: null,
      canonicalPath: null,
    });
  }
  return Object.freeze({
    present: observation.present,
    digestHex: observation.digestHex,
    byteLength: observation.byteLength,
    canonicalPath: observation.present ? observation.canonicalPath : null,
  });
}

type Classification = {
  readonly disposition: RecoveryEntryDisposition;
  readonly proposedAction: RecoveryProposedAction;
  readonly detail: string;
};

function classify(
  manifest: CheckpointEntryManifest,
  observation: RecoveryTargetObservation,
  preBytes: Readonly<Uint8Array> | null,
): Classification {
  const none: RecoveryProposedAction = Object.freeze({ kind: "NONE" as const });

  if (manifest.kind === "REPLACE_TEXT") {
    if (preBytes === null) {
      return {
        disposition: "RECOVERY_ENTRY_INVALID",
        proposedAction: none,
        detail: "pre-state bytes are unavailable",
      };
    }
    if (!observation.present) {
      return {
        disposition: "RECOVERY_CONFLICT",
        proposedAction: none,
        detail: "target file is absent; recovery does not recreate removed files",
      };
    }
    const preHex = manifest.preState.kind === "BYTES"
      ? manifest.preState.blob.digest.hex
      : null;
    // Pre-state is checked first so a no-op edit resolves to ALREADY_PRE_STATE
    // rather than proposing a write that would change nothing.
    if (preHex !== null && observation.digestHex === preHex) {
      return {
        disposition: "ALREADY_PRE_STATE",
        proposedAction: none,
        detail: "target already holds the captured pre-state bytes",
      };
    }
    if (observation.digestHex === manifest.intendedPost.digest.hex) {
      return {
        disposition: "ELIGIBLE_RESTORE",
        proposedAction: Object.freeze({
          kind: "WRITE_PRE_BYTES" as const,
          byteLength: preBytes.byteLength,
        }),
        detail: "target holds exactly the bytes Path Code wrote",
      };
    }
    return {
      disposition: "RECOVERY_CONFLICT",
      proposedAction: none,
      detail:
        "target content matches neither the captured pre-state nor the bytes Path Code wrote",
    };
  }

  if (!observation.present) {
    return {
      disposition: "NOT_APPLIED",
      proposedAction: none,
      detail: "created file is absent; nothing to remove",
    };
  }
  if (observation.digestHex === manifest.intendedPost.digest.hex) {
    return {
      disposition: "ELIGIBLE_RESTORE",
      proposedAction: Object.freeze({ kind: "REMOVE_CREATED_FILE" as const }),
      detail: "file holds exactly the bytes Path Code created",
    };
  }
  return {
    disposition: "RECOVERY_CONFLICT",
    proposedAction: none,
    detail: "created file was modified after Path Code wrote it",
  };
}

/**
 * Build an immutable review bound to this checkpoint, these observations and
 * these proposed actions. The review mints nothing.
 */
export async function prepareRecoveryReview(
  checkpoint: Checkpoint,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<RecoveryReview, RecoveryFailure>> {
  const store = lookupCheckpointStore(checkpoint);
  if (store === undefined) {
    return failure(
      reviewFailure(
        "CHECKPOINT_NOT_FOUND",
        "checkpoint is not bound to a recovery store; reload it from a store",
      ),
    );
  }

  const binding = await verifyCheckpointWorkspaceBinding(checkpoint, workspace);
  if (!binding.ok) {
    return failure(binding.error);
  }

  const inventoryResult = await loadFreshInventory(workspace, config);
  if (!inventoryResult.ok) {
    return failure(inventoryResult.error);
  }

  const entryViews: RecoveryReviewEntryView[] = [];
  const entryStateById = new Map<string, ReviewEntryState>();

  for (const manifest of checkpoint.manifest.entries) {
    const invalid = (detail: string): void => {
      entryViews.push(
        Object.freeze({
          entryId: manifest.entryId,
          kind: manifest.kind,
          relativePath: manifest.relativePath,
          disposition: "RECOVERY_ENTRY_INVALID" as const,
          observation: observationView(null),
          proposedAction: Object.freeze({ kind: "NONE" as const }),
          detail,
        }),
      );
      entryStateById.set(manifest.entryId, {
        manifest,
        preBytes: null,
        intendedPostDigestHex: manifest.intendedPost.digest.hex,
      });
    };

    const post = await loadVerifiedBlob(
      store,
      checkpoint.checkpointId,
      manifest.intendedPost,
    );
    if (!post.ok) {
      invalid(post.error.message);
      continue;
    }

    let preBytes: Uint8Array | null = null;
    if (manifest.preState.kind === "BYTES") {
      const pre = await loadVerifiedBlob(
        store,
        checkpoint.checkpointId,
        manifest.preState.blob,
      );
      if (!pre.ok) {
        invalid(pre.error.message);
        continue;
      }
      preBytes = pre.value;
    }

    const pathBinding = await verifyEntryPathBinding(manifest, workspace);
    if (!pathBinding.ok) {
      invalid(pathBinding.error.message);
      continue;
    }

    const observed = await observeRecoveryTarget({
      relativePath: manifest.relativePath,
      expectedCanonicalPath: pathBinding.value.expectedCanonicalPath,
      workspace,
      config,
      sharedInventory: inventoryResult.value,
    });
    if (!observed.ok) {
      invalid(observed.error.message);
      continue;
    }

    const classified = classify(manifest, observed.value, preBytes);
    entryViews.push(
      Object.freeze({
        entryId: manifest.entryId,
        kind: manifest.kind,
        relativePath: manifest.relativePath,
        disposition: classified.disposition,
        observation: observationView(observed.value),
        proposedAction: classified.proposedAction,
        detail: classified.detail,
      }),
    );
    entryStateById.set(manifest.entryId, {
      manifest,
      preBytes,
      intendedPostDigestHex: manifest.intendedPost.digest.hex,
    });
  }

  const reviewId = nextReviewId();
  const review = Object.freeze({
    reviewId,
    view: Object.freeze({
      reviewId,
      checkpointId: checkpoint.checkpointId,
      workspaceRoot: checkpoint.manifest.workspaceRoot,
      observedAtMs: Date.now(),
      entries: Object.freeze(entryViews),
    }),
  }) as unknown as RecoveryReview;

  registerReview(review, {
    checkpoint,
    store,
    entryStateById,
  });
  return success(review);
}
