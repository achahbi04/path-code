/**
 * Phase 6A recovery execution — authorized, per-file, verified.
 *
 * Every authorized entry is re-observed IMMEDIATELY before it is acted on, so
 * a change that lands between review and execution becomes a conflict rather
 * than a silent overwrite. After acting, the entry is re-observed again and
 * must prove the intended end state (pre-bytes restored, or created file
 * absent) before it may be recorded as RESTORED.
 *
 * Structural denials:
 * - no Git checkout/restore/reset participates
 * - directories are never removed, only regular files Path Code created
 * - only REPLACE_TEXT and CREATE_TEXT are reversible; nothing else is attempted
 * - the resulting record is operator evidence, never validation (Gate 2) evidence
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  isAtomicReplacePlatformSupported,
  productionAtomicReplaceFs,
  type TargetFileMetadata,
} from "../editing/atomic-fs.js";
import { RECOVERY_RECORD_SCHEMA_VERSION } from "./bounds.js";
import { digestBytes } from "./checkpoint.js";
import { consumeRecoveryAuthorization } from "./internal/consume-authorization.js";
import {
  lookupReview,
  nextRecoveryId,
  type ReviewEntryState,
} from "./internal/registry.js";
import { observeRecoveryTarget, verifyEntryPathBinding } from "./observe.js";
import type {
  RecoveryAuthorization,
  RecoveryDisposition,
  RecoveryEntryDisposition,
  RecoveryExecutionEntryDisposition,
  RecoveryExecutionEntryRecord,
  RecoveryExecutionRecord,
  RecoveryFailure,
  RecoveryReview,
  RecoveryReviewEntryView,
  RecoveryStore,
} from "./types.js";

/** Recovery temporaries are distinct from replace/create temporaries. */
const PATH_CODE_RECOVERY_TEMP_PREFIX = ".path-code-recover-";

function executionFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

function carryReviewDisposition(
  disposition: RecoveryEntryDisposition,
): RecoveryExecutionEntryDisposition {
  switch (disposition) {
    case "ELIGIBLE_RESTORE":
      return "SKIPPED_NOT_AUTHORIZED";
    case "ALREADY_PRE_STATE":
      return "ALREADY_PRE_STATE";
    case "NOT_APPLIED":
      return "NOT_APPLIED";
    case "RECOVERY_CONFLICT":
      return "RECOVERY_CONFLICT";
    default:
      return "RECOVERY_ENTRY_INVALID";
  }
}

type EntryOutcome = {
  readonly disposition: RecoveryExecutionEntryDisposition;
  readonly verifiedDigestHex: string | null;
  readonly verifiedAbsent: boolean;
  readonly detail: string;
};

async function reloadVerifiedPreBytes(
  store: RecoveryStore,
  checkpointId: string,
  state: ReviewEntryState,
): Promise<Result<Uint8Array, RecoveryFailure>> {
  if (state.manifest.preState.kind !== "BYTES") {
    return failure(
      executionFailure(
        "INTERNAL_CONTRACT",
        "REPLACE restore requires captured pre-state bytes",
      ),
    );
  }
  const ref = state.manifest.preState.blob;
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
      executionFailure(
        "STORE_READ_FAILED",
        `pre-state blob '${ref.blobId}' failed digest verification before restore`,
      ),
    );
  }
  return success(stored.value);
}

async function writePreBytes(
  absolutePath: string,
  parentDirectory: string,
  bytes: Readonly<Uint8Array>,
  expectedDigestHex: string,
): Promise<Result<true, RecoveryFailure>> {
  const fsOps = productionAtomicReplaceFs;
  let metadata: TargetFileMetadata;
  try {
    metadata = await fsOps.lstatTarget(absolutePath);
  } catch (error) {
    return failure(
      executionFailure(
        "OBSERVATION_FAILED",
        `restore target could not be stat'ed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      ),
    );
  }
  if (!metadata.isFile || metadata.isSymbolicLink || metadata.isDirectory) {
    return failure(
      executionFailure(
        "OBSERVATION_FAILED",
        "restore target is not a regular file",
      ),
    );
  }

  let temp: Awaited<ReturnType<typeof fsOps.createTempExclusive>> | null = null;
  let closed = false;
  try {
    temp = await fsOps.createTempExclusive(
      parentDirectory,
      PATH_CODE_RECOVERY_TEMP_PREFIX,
    );
    await fsOps.writeAll(temp.handle, bytes);
    await fsOps.fsyncHandle(temp.handle);
    await fsOps.fchown(temp.handle, metadata.uid, metadata.gid);
    await fsOps.fchmod(temp.handle, metadata.mode);
    await fsOps.fsyncHandle(temp.handle);
    const readBack = await fsOps.readCandidateBytes(
      temp.handle,
      bytes.byteLength,
    );
    if (digestBytes(readBack).hex !== expectedDigestHex) {
      throw new Error("restore candidate failed read-back verification");
    }
    await fsOps.closeHandle(temp.handle);
    closed = true;
    await fsOps.renameAtomic(temp.tempPath, absolutePath);
    await fsOps.fsyncDirectory(parentDirectory);
    return success(true);
  } catch (error) {
    if (temp !== null) {
      if (!closed) {
        try {
          await fsOps.closeHandle(temp.handle);
        } catch {
          // Close failure does not change the reported restore outcome.
        }
      }
      try {
        await fsOps.unlink(temp.tempPath);
      } catch {
        // Best-effort candidate cleanup; the write failure is what we report.
      }
    }
    return failure(
      executionFailure(
        "INTERNAL_CONTRACT",
        `pre-state write failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      ),
    );
  }
}

async function removeCreatedFile(
  absolutePath: string,
  parentDirectory: string,
): Promise<Result<true, RecoveryFailure>> {
  const fsOps = productionAtomicReplaceFs;
  let metadata: TargetFileMetadata;
  try {
    metadata = await fsOps.lstatTarget(absolutePath);
  } catch (error) {
    return failure(
      executionFailure(
        "OBSERVATION_FAILED",
        `created file could not be stat'ed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      ),
    );
  }
  // Directories are never removed by recovery, and a symlink is never followed.
  if (!metadata.isFile || metadata.isDirectory || metadata.isSymbolicLink) {
    return failure(
      executionFailure(
        "OBSERVATION_FAILED",
        "created target is not a regular file; recovery removes nothing else",
      ),
    );
  }
  try {
    await fsOps.unlink(absolutePath);
    await fsOps.fsyncDirectory(parentDirectory);
    return success(true);
  } catch (error) {
    return failure(
      executionFailure(
        "INTERNAL_CONTRACT",
        `created-file removal failed: ${
          error instanceof Error ? error.message : "unknown"
        }`,
      ),
    );
  }
}

async function restoreEntry(input: {
  readonly state: ReviewEntryState;
  readonly store: RecoveryStore;
  readonly checkpointId: string;
  readonly workspace: WorkspaceBoundary;
  readonly config: ResolvedProjectConfig;
}): Promise<EntryOutcome> {
  const { state } = input;
  const manifest = state.manifest;

  const pathBinding = await verifyEntryPathBinding(manifest, input.workspace);
  if (!pathBinding.ok) {
    return {
      disposition: "RECOVERY_ENTRY_INVALID",
      verifiedDigestHex: null,
      verifiedAbsent: false,
      detail: pathBinding.error.message,
    };
  }

  // FRESH observation immediately before acting — the TOCTOU window closes here.
  const observed = await observeRecoveryTarget({
    relativePath: manifest.relativePath,
    expectedCanonicalPath: pathBinding.value.expectedCanonicalPath,
    workspace: input.workspace,
    config: input.config,
  });
  if (!observed.ok) {
    return {
      disposition: "RECOVERY_ENTRY_INVALID",
      verifiedDigestHex: null,
      verifiedAbsent: false,
      detail: observed.error.message,
    };
  }
  if (!observed.value.present) {
    return manifest.kind === "CREATE_TEXT"
      ? {
          disposition: "NOT_APPLIED",
          verifiedDigestHex: null,
          verifiedAbsent: true,
          detail: "created file was already absent at execution time",
        }
      : {
          disposition: "RECOVERY_CONFLICT",
          verifiedDigestHex: null,
          verifiedAbsent: true,
          detail: "target file disappeared between review and execution",
        };
  }
  if (observed.value.digestHex !== state.intendedPostDigestHex) {
    return {
      disposition: "RECOVERY_CONFLICT",
      verifiedDigestHex: null,
      verifiedAbsent: false,
      detail:
        "target changed between review and execution; recovery refused to overwrite it",
    };
  }

  if (manifest.kind === "REPLACE_TEXT") {
    const preBytes = await reloadVerifiedPreBytes(
      input.store,
      input.checkpointId,
      state,
    );
    if (!preBytes.ok) {
      return {
        disposition: "RECOVERY_ENTRY_INVALID",
        verifiedDigestHex: null,
        verifiedAbsent: false,
        detail: preBytes.error.message,
      };
    }
    const expectedHex =
      manifest.preState.kind === "BYTES"
        ? manifest.preState.blob.digest.hex
        : "";
    const written = await writePreBytes(
      pathBinding.value.absolutePath,
      pathBinding.value.parentDirectory,
      preBytes.value,
      expectedHex,
    );
    if (!written.ok) {
      return {
        disposition: "RESTORE_FAILED",
        verifiedDigestHex: null,
        verifiedAbsent: false,
        detail: written.error.message,
      };
    }
    const proof = await observeRecoveryTarget({
      relativePath: manifest.relativePath,
      expectedCanonicalPath: pathBinding.value.expectedCanonicalPath,
      workspace: input.workspace,
      config: input.config,
    });
    if (!proof.ok || !proof.value.present || proof.value.digestHex !== expectedHex) {
      return {
        disposition: "RESTORE_OUTCOME_UNCONFIRMED",
        verifiedDigestHex: null,
        verifiedAbsent: false,
        detail: "pre-state bytes were written but could not be proved on disk",
      };
    }
    return {
      disposition: "RESTORED",
      verifiedDigestHex: proof.value.digestHex,
      verifiedAbsent: false,
      detail: "captured pre-state bytes restored and proved on disk",
    };
  }

  const removed = await removeCreatedFile(
    pathBinding.value.absolutePath,
    pathBinding.value.parentDirectory,
  );
  if (!removed.ok) {
    return {
      disposition: "RESTORE_FAILED",
      verifiedDigestHex: null,
      verifiedAbsent: false,
      detail: removed.error.message,
    };
  }
  const proof = await observeRecoveryTarget({
    relativePath: manifest.relativePath,
    expectedCanonicalPath: pathBinding.value.expectedCanonicalPath,
    workspace: input.workspace,
    config: input.config,
  });
  if (!proof.ok || proof.value.present) {
    return {
      disposition: "RESTORE_OUTCOME_UNCONFIRMED",
      verifiedDigestHex: null,
      verifiedAbsent: false,
      detail: "created file was removed but absence could not be proved",
    };
  }
  return {
    disposition: "RESTORED",
    verifiedDigestHex: null,
    verifiedAbsent: true,
    detail: "created file removed and absence proved on disk",
  };
}

export async function executeRecovery(
  authorization: RecoveryAuthorization,
  review: RecoveryReview,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
): Promise<Result<RecoveryExecutionRecord, RecoveryFailure>> {
  const registered = lookupReview(review);
  if (registered === undefined) {
    return failure(
      executionFailure(
        "REVIEW_NOT_REGISTERED",
        "recovery review is not registered or was reconstructed",
      ),
    );
  }

  const grant = consumeRecoveryAuthorization(authorization, review);
  if (!grant.ok) {
    return failure(grant.error);
  }

  if (!isAtomicReplacePlatformSupported()) {
    return failure(
      executionFailure(
        "UNSUPPORTED_RECOVERY_PLATFORM",
        "durable recovery requires POSIX same-directory rename and directory fsync",
      ),
    );
  }

  const authorizedIds = new Set(authorization.authorizedEntryIds);
  const entries: RecoveryExecutionEntryRecord[] = [];
  let restoredCount = 0;

  for (const entryView of review.view.entries as readonly RecoveryReviewEntryView[]) {
    const authorized = authorizedIds.has(entryView.entryId);
    if (!authorized) {
      entries.push(
        Object.freeze({
          entryId: entryView.entryId,
          kind: entryView.kind,
          relativePath: entryView.relativePath,
          authorized: false,
          disposition: carryReviewDisposition(entryView.disposition),
          verifiedDigestHex: null,
          verifiedAbsent: false,
          detail: entryView.detail,
        }),
      );
      continue;
    }

    const state = registered.entryStateById.get(entryView.entryId);
    if (state === undefined) {
      entries.push(
        Object.freeze({
          entryId: entryView.entryId,
          kind: entryView.kind,
          relativePath: entryView.relativePath,
          authorized: true,
          disposition: "RECOVERY_ENTRY_INVALID" as const,
          verifiedDigestHex: null,
          verifiedAbsent: false,
          detail: "authorized entry has no registered checkpoint state",
        }),
      );
      continue;
    }

    const outcome = await restoreEntry({
      state,
      store: registered.store,
      checkpointId: registered.checkpoint.checkpointId,
      workspace,
      config,
    });
    if (outcome.disposition === "RESTORED") {
      restoredCount += 1;
    }
    entries.push(
      Object.freeze({
        entryId: entryView.entryId,
        kind: entryView.kind,
        relativePath: entryView.relativePath,
        authorized: true,
        disposition: outcome.disposition,
        verifiedDigestHex: outcome.verifiedDigestHex,
        verifiedAbsent: outcome.verifiedAbsent,
        detail: outcome.detail,
      }),
    );
  }

  const authorizedCount = authorizedIds.size;
  const disposition: RecoveryDisposition =
    restoredCount === authorizedCount
      ? "RECOVERY_COMPLETE"
      : restoredCount === 0
        ? "RECOVERY_NONE"
        : "RECOVERY_PARTIAL";

  return success(
    Object.freeze({
      schemaVersion: RECOVERY_RECORD_SCHEMA_VERSION,
      recoveryId: nextRecoveryId(),
      checkpointId: review.view.checkpointId,
      reviewId: review.reviewId,
      authorizationId: authorization.authorizationId,
      disposition,
      authorizedCount,
      restoredCount,
      entries: Object.freeze(entries),
      noGitRecovery: true as const,
      notValidationEvidence: true as const,
      automaticRollback: false as const,
    }),
  );
}
