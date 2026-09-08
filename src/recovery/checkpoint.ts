/**
 * Phase 6A checkpoint construction, persistence, load and integrity.
 *
 * A checkpoint binds a versioned manifest to independently digested blobs:
 *
 * - REPLACE_TEXT captures the exact pre-bytes plus the intended post-bytes
 * - CREATE_TEXT captures proven absence plus the intended post-bytes
 *
 * Fail-closed asymmetry, by design:
 * - a manifest that fails structural/version/workspace validation refuses the
 *   ENTIRE checkpoint
 * - a single corrupt or missing blob invalidates only that entry; siblings may
 *   still be reviewed and restored
 *
 * No Git object, index or ref participates in any of this.
 */

import { createHash, randomUUID } from "node:crypto";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { CanonicalPath, WorkspaceBoundary } from "../domain/workspace.js";
import {
  MAX_CHECKPOINT_BLOB_BYTES,
  MAX_CHECKPOINT_MANIFEST_BYTES,
} from "./bounds.js";
import { bindCheckpointStore } from "./internal/registry.js";
import {
  MAX_CHECKPOINT_ENTRIES,
  RECOVERY_MANIFEST_SCHEMA_VERSION,
  type Checkpoint,
  type CheckpointEntryManifest,
  type CheckpointManifest,
  type CheckpointTargetInput,
  type PrepareCheckpointInput,
  type PreparedCheckpoint,
  type RecoveryBlobDigest,
  type RecoveryFailure,
  type RecoveryStore,
} from "./types.js";

type BlobPayload = {
  readonly blobId: string;
  readonly bytes: Readonly<Uint8Array>;
  readonly digest: RecoveryBlobDigest;
};

function recoveryFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

export function digestBytes(bytes: Readonly<Uint8Array>): RecoveryBlobDigest {
  return {
    algorithm: "sha256",
    hex: createHash("sha256").update(bytes).digest("hex"),
    byteLength: bytes.byteLength,
  };
}

function copyBytes(source: Readonly<Uint8Array>): Uint8Array {
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy;
}

function isPlainRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized.includes("\0") ||
    normalized === "." ||
    normalized === ".."
  ) {
    return false;
  }
  return !normalized.split("/").some((segment) => segment === "..");
}

/**
 * Build an unpersisted checkpoint from exact captured bytes. Performs no I/O:
 * the caller is responsible for having observed the pre-state immediately
 * before mutation.
 */
export function prepareCheckpoint(
  input: PrepareCheckpointInput,
): Result<PreparedCheckpoint, RecoveryFailure> {
  if (
    typeof input.workspaceRoot !== "string" ||
    input.workspaceRoot.length === 0
  ) {
    return failure(
      recoveryFailure(
        "INVALID_CHECKPOINT_INPUT",
        "checkpoint requires a canonical workspace root",
      ),
    );
  }
  if (
    typeof input.sessionId !== "string" ||
    input.sessionId.length === 0 ||
    typeof input.reviewId !== "string" ||
    input.reviewId.length === 0
  ) {
    return failure(
      recoveryFailure(
        "INVALID_CHECKPOINT_INPUT",
        "checkpoint requires sessionId and reviewId",
      ),
    );
  }
  if (
    !Array.isArray(input.targets) ||
    input.targets.length === 0 ||
    input.targets.length > MAX_CHECKPOINT_ENTRIES
  ) {
    return failure(
      recoveryFailure(
        "INVALID_CHECKPOINT_INPUT",
        `checkpoint targets must be 1..${MAX_CHECKPOINT_ENTRIES}`,
      ),
    );
  }

  const checkpointId = randomUUID();
  const entries: CheckpointEntryManifest[] = [];
  const blobs: BlobPayload[] = [];
  const seenPaths = new Set<string>();

  for (let index = 0; index < input.targets.length; index += 1) {
    const target = input.targets[index] as CheckpointTargetInput;
    if (!isPlainRelativePath(target.relativePath)) {
      return failure(
        recoveryFailure(
          "INVALID_CHECKPOINT_INPUT",
          `checkpoint target path '${target.relativePath}' is not a plain relative path`,
        ),
      );
    }
    if (seenPaths.has(target.relativePath)) {
      return failure(
        recoveryFailure(
          "INVALID_CHECKPOINT_INPUT",
          `duplicate checkpoint target '${target.relativePath}'`,
        ),
      );
    }
    seenPaths.add(target.relativePath);

    if (target.intendedPostBytes.byteLength > MAX_CHECKPOINT_BLOB_BYTES) {
      return failure(
        recoveryFailure(
          "BOUNDS_EXCEEDED",
          `intended post bytes for '${target.relativePath}' exceed the checkpoint ceiling`,
        ),
      );
    }

    const entryId = `entry-${index + 1}`;
    const postBlobId = `${entryId}.post`;
    const postBytes = copyBytes(target.intendedPostBytes);
    const postDigest = digestBytes(postBytes);
    blobs.push({ blobId: postBlobId, bytes: postBytes, digest: postDigest });

    if (target.kind === "REPLACE_TEXT") {
      if (target.preBytes.byteLength > MAX_CHECKPOINT_BLOB_BYTES) {
        return failure(
          recoveryFailure(
            "BOUNDS_EXCEEDED",
            `pre bytes for '${target.relativePath}' exceed the checkpoint ceiling`,
          ),
        );
      }
      const preBlobId = `${entryId}.pre`;
      const preBytes = copyBytes(target.preBytes);
      const preDigest = digestBytes(preBytes);
      blobs.push({ blobId: preBlobId, bytes: preBytes, digest: preDigest });
      entries.push({
        entryId,
        kind: "REPLACE_TEXT",
        relativePath: target.relativePath,
        targetCanonicalPath: target.targetCanonicalPath,
        parentCanonicalPath: null,
        leafName: null,
        preState: {
          kind: "BYTES",
          blob: { blobId: preBlobId, digest: preDigest },
        },
        intendedPost: { blobId: postBlobId, digest: postDigest },
      });
      continue;
    }

    if (
      typeof target.leafName !== "string" ||
      target.leafName.length === 0 ||
      target.leafName.includes("/") ||
      target.leafName.includes("\\") ||
      target.leafName.includes("\0") ||
      target.leafName === "." ||
      target.leafName === ".."
    ) {
      return failure(
        recoveryFailure(
          "INVALID_CHECKPOINT_INPUT",
          "CREATE_TEXT checkpoint leafName is invalid",
        ),
      );
    }
    entries.push({
      entryId,
      kind: "CREATE_TEXT",
      relativePath: target.relativePath,
      targetCanonicalPath: null,
      parentCanonicalPath: target.parentCanonicalPath,
      leafName: target.leafName,
      preState: { kind: "ABSENT" },
      intendedPost: { blobId: postBlobId, digest: postDigest },
    });
  }

  const manifest: CheckpointManifest = Object.freeze({
    schemaVersion: RECOVERY_MANIFEST_SCHEMA_VERSION,
    checkpointId,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    reviewId: input.reviewId,
    capturedAtMs: Date.now(),
    noGitRecovery: true as const,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });

  const prepared = Object.freeze({
    checkpointId,
    manifest,
    blobs: Object.freeze(blobs),
  });
  return success(prepared as unknown as PreparedCheckpoint);
}

export function serializeCheckpointManifest(
  manifest: CheckpointManifest,
): string {
  return JSON.stringify(manifest);
}

function brandCheckpoint(manifest: CheckpointManifest): Checkpoint {
  return Object.freeze({
    checkpointId: manifest.checkpointId,
    manifest,
  }) as unknown as Checkpoint;
}

function validateBlobRef(value: unknown): value is {
  blobId: string;
  digest: RecoveryBlobDigest;
} {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as { blobId?: unknown; digest?: unknown };
  if (typeof ref.blobId !== "string" || ref.blobId.length === 0) {
    return false;
  }
  const digest = ref.digest as Partial<RecoveryBlobDigest> | undefined;
  return (
    typeof digest === "object" &&
    digest !== null &&
    digest.algorithm === "sha256" &&
    typeof digest.hex === "string" &&
    /^[0-9a-f]{64}$/.test(digest.hex) &&
    Number.isSafeInteger(digest.byteLength) &&
    (digest.byteLength as number) >= 0 &&
    (digest.byteLength as number) <= MAX_CHECKPOINT_BLOB_BYTES
  );
}

/**
 * Whole-manifest structural validation. Any defect refuses the entire
 * checkpoint: a manifest we cannot fully trust cannot authorize any restore.
 */
export function validateCheckpointManifest(
  value: unknown,
): Result<CheckpointManifest, RecoveryFailure> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest is not a JSON object",
      ),
    );
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== RECOVERY_MANIFEST_SCHEMA_VERSION) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        `unsupported checkpoint manifest schemaVersion ${String(raw.schemaVersion)}`,
      ),
    );
  }
  if (raw.noGitRecovery !== true) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest must declare noGitRecovery",
      ),
    );
  }
  for (const field of [
    "checkpointId",
    "workspaceRoot",
    "sessionId",
    "reviewId",
  ]) {
    const candidate = raw[field];
    if (typeof candidate !== "string" || candidate.length === 0) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_MANIFEST_INVALID",
          `checkpoint manifest field '${field}' is missing or invalid`,
        ),
      );
    }
  }
  if (!Number.isSafeInteger(raw.capturedAtMs) || (raw.capturedAtMs as number) < 0) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest capturedAtMs is invalid",
      ),
    );
  }
  if (
    !Array.isArray(raw.entries) ||
    raw.entries.length === 0 ||
    raw.entries.length > MAX_CHECKPOINT_ENTRIES
  ) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest entries are missing or out of bounds",
      ),
    );
  }

  const entries: CheckpointEntryManifest[] = [];
  const seenEntryIds = new Set<string>();
  for (const candidate of raw.entries as unknown[]) {
    if (typeof candidate !== "object" || candidate === null) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_MANIFEST_INVALID",
          "checkpoint entry is not a JSON object",
        ),
      );
    }
    const entry = candidate as Record<string, unknown>;
    if (
      typeof entry.entryId !== "string" ||
      entry.entryId.length === 0 ||
      seenEntryIds.has(entry.entryId)
    ) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_MANIFEST_INVALID",
          "checkpoint entryId is missing or duplicated",
        ),
      );
    }
    seenEntryIds.add(entry.entryId);
    if (
      typeof entry.relativePath !== "string" ||
      !isPlainRelativePath(entry.relativePath)
    ) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_MANIFEST_INVALID",
          "checkpoint entry relativePath is invalid",
        ),
      );
    }
    if (!validateBlobRef(entry.intendedPost)) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_MANIFEST_INVALID",
          "checkpoint entry intendedPost blob reference is invalid",
        ),
      );
    }
    if (entry.kind === "REPLACE_TEXT") {
      const preState = entry.preState as { kind?: unknown; blob?: unknown };
      if (
        typeof entry.targetCanonicalPath !== "string" ||
        entry.targetCanonicalPath.length === 0 ||
        typeof preState !== "object" ||
        preState === null ||
        preState.kind !== "BYTES" ||
        !validateBlobRef(preState.blob)
      ) {
        return failure(
          recoveryFailure(
            "CHECKPOINT_MANIFEST_INVALID",
            "REPLACE_TEXT checkpoint entry is structurally invalid",
          ),
        );
      }
      entries.push(
        Object.freeze({
          entryId: entry.entryId,
          kind: "REPLACE_TEXT" as const,
          relativePath: entry.relativePath,
          targetCanonicalPath: entry.targetCanonicalPath,
          parentCanonicalPath: null,
          leafName: null,
          preState: {
            kind: "BYTES" as const,
            blob: preState.blob as { blobId: string; digest: RecoveryBlobDigest },
          },
          intendedPost: entry.intendedPost as {
            blobId: string;
            digest: RecoveryBlobDigest;
          },
        }),
      );
      continue;
    }
    if (entry.kind === "CREATE_TEXT") {
      const preState = entry.preState as { kind?: unknown };
      if (
        typeof entry.parentCanonicalPath !== "string" ||
        entry.parentCanonicalPath.length === 0 ||
        typeof entry.leafName !== "string" ||
        entry.leafName.length === 0 ||
        typeof preState !== "object" ||
        preState === null ||
        preState.kind !== "ABSENT"
      ) {
        return failure(
          recoveryFailure(
            "CHECKPOINT_MANIFEST_INVALID",
            "CREATE_TEXT checkpoint entry is structurally invalid",
          ),
        );
      }
      entries.push(
        Object.freeze({
          entryId: entry.entryId,
          kind: "CREATE_TEXT" as const,
          relativePath: entry.relativePath,
          targetCanonicalPath: null,
          parentCanonicalPath: entry.parentCanonicalPath,
          leafName: entry.leafName,
          preState: { kind: "ABSENT" as const },
          intendedPost: entry.intendedPost as {
            blobId: string;
            digest: RecoveryBlobDigest;
          },
        }),
      );
      continue;
    }
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        `unsupported checkpoint entry kind '${String(entry.kind)}'`,
      ),
    );
  }

  return success(
    Object.freeze({
      schemaVersion: RECOVERY_MANIFEST_SCHEMA_VERSION,
      checkpointId: raw.checkpointId as string,
      workspaceRoot: raw.workspaceRoot as string,
      sessionId: raw.sessionId as string,
      reviewId: raw.reviewId as string,
      capturedAtMs: raw.capturedAtMs as number,
      noGitRecovery: true as const,
      entries: Object.freeze(entries),
    }),
  );
}

/**
 * Persist a prepared checkpoint and prove it durable by reading it back:
 * manifest byte-identity plus an independent digest check of every blob.
 */
export async function persistCheckpoint(
  prepared: PreparedCheckpoint,
  store: RecoveryStore,
): Promise<Result<Checkpoint, RecoveryFailure>> {
  const manifestJson = serializeCheckpointManifest(prepared.manifest);
  if (manifestJson.length > MAX_CHECKPOINT_MANIFEST_BYTES) {
    return failure(
      recoveryFailure(
        "BOUNDS_EXCEEDED",
        "checkpoint manifest exceeds the manifest ceiling",
      ),
    );
  }

  const written = await store.writeCheckpoint({
    checkpointId: prepared.checkpointId,
    manifestJson,
    blobs: prepared.blobs.map((blob) => ({
      blobId: blob.blobId,
      bytes: blob.bytes,
    })),
  });
  if (!written.ok) {
    return failure(written.error);
  }

  const readBack = await store.readManifestJson(prepared.checkpointId);
  if (!readBack.ok) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_READBACK_FAILED",
        `checkpoint manifest read-back failed: ${readBack.error.message}`,
      ),
    );
  }
  if (readBack.value !== manifestJson) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_READBACK_FAILED",
        "persisted checkpoint manifest does not match the prepared manifest",
      ),
    );
  }

  for (const blob of prepared.blobs) {
    const stored = await store.readBlob(prepared.checkpointId, blob.blobId);
    if (!stored.ok) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_READBACK_FAILED",
          `checkpoint blob '${blob.blobId}' read-back failed: ${stored.error.message}`,
        ),
      );
    }
    const digest = digestBytes(stored.value);
    if (
      digest.hex !== blob.digest.hex ||
      digest.byteLength !== blob.digest.byteLength
    ) {
      return failure(
        recoveryFailure(
          "CHECKPOINT_READBACK_FAILED",
          `checkpoint blob '${blob.blobId}' failed read-back integrity`,
        ),
      );
    }
  }

  const parsedReadBack = validateCheckpointManifest(
    JSON.parse(readBack.value) as unknown,
  );
  if (!parsedReadBack.ok) {
    return failure(parsedReadBack.error);
  }

  const checkpoint = brandCheckpoint(parsedReadBack.value);
  bindCheckpointStore(checkpoint, store);
  return success(checkpoint);
}

/**
 * Reopen a persisted checkpoint through any store instance rooted at the same
 * directory — including a fresh instance in a new process.
 */
export async function loadCheckpoint(
  store: RecoveryStore,
  checkpointId: string,
): Promise<Result<Checkpoint, RecoveryFailure>> {
  const manifestJson = await store.readManifestJson(checkpointId);
  if (!manifestJson.ok) {
    return failure(manifestJson.error);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestJson.value) as unknown;
  } catch {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest is not parseable JSON",
      ),
    );
  }
  const validated = validateCheckpointManifest(parsed);
  if (!validated.ok) {
    return failure(validated.error);
  }
  if (validated.value.checkpointId !== checkpointId) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_MANIFEST_INVALID",
        "checkpoint manifest identity does not match its store location",
      ),
    );
  }
  const checkpoint = brandCheckpoint(validated.value);
  bindCheckpointStore(checkpoint, store);
  return success(checkpoint);
}

/**
 * Workspace binding: the live canonical root must equal the root captured in
 * the manifest. A mismatch refuses the entire checkpoint.
 */
export async function verifyCheckpointWorkspaceBinding(
  checkpoint: Checkpoint,
  workspace: WorkspaceBoundary,
): Promise<Result<CanonicalPath, RecoveryFailure>> {
  const root = await workspace.canonicalize(".");
  if (!root.ok) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_WORKSPACE_MISMATCH",
        `workspace root is not canonicalizable: ${root.error.code}`,
      ),
    );
  }
  if (root.value !== checkpoint.manifest.workspaceRoot) {
    return failure(
      recoveryFailure(
        "CHECKPOINT_WORKSPACE_MISMATCH",
        "checkpoint was captured against a different workspace root",
      ),
    );
  }
  return success(root.value);
}
