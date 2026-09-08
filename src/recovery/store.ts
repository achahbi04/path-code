/**
 * Phase 6A durable checkpoint store — filesystem layout and I/O only.
 *
 * The store is injected by the host and rooted OUTSIDE the target workspace,
 * so a checkpoint survives any mutation of (or damage to) the repository it
 * protects. It never invokes Git, never holds credentials, and makes no
 * encryption-at-rest claim.
 *
 * Layout under the store root:
 *   checkpoints/<checkpointId>/manifest.json
 *   checkpoints/<checkpointId>/blobs/<blobId>
 *
 * The manifest is published last, so a manifest on disk implies every blob it
 * names was already published.
 */

import path from "node:path";

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { MAX_CHECKPOINT_BLOB_BYTES } from "./bounds.js";
import {
  areOwnerOnlyModesSupported,
  productionRecoveryStoreFs,
  type RecoveryStoreFsOps,
} from "./store-fs.js";
import type {
  RecoveryFailure,
  RecoveryStore,
  RecoveryStoreDescriptor,
  StoredCheckpointWrite,
} from "./types.js";

const CHECKPOINTS_DIRECTORY = "checkpoints";
const BLOBS_DIRECTORY = "blobs";
const MANIFEST_FILE_NAME = "manifest.json";

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export type CreateRecoveryStoreInput = {
  /** Absolute directory outside the target workspace. */
  readonly rootDirectory: string;
  /** Test seam for store-level fault injection. */
  readonly fs?: RecoveryStoreFsOps;
};

function storeFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : "unknown store error";
}

function isSafeName(value: string): boolean {
  return (
    typeof value === "string" &&
    SAFE_NAME.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

export function createRecoveryStore(
  input: CreateRecoveryStoreInput,
): Result<RecoveryStore, RecoveryFailure> {
  if (
    typeof input.rootDirectory !== "string" ||
    input.rootDirectory.length === 0 ||
    !path.isAbsolute(input.rootDirectory)
  ) {
    return failure(
      storeFailure(
        "STORE_ROOT_UNAVAILABLE",
        "recovery store rootDirectory must be an absolute path",
      ),
    );
  }
  const root = path.resolve(input.rootDirectory);
  const fs = input.fs ?? productionRecoveryStoreFs;

  const checkpointDirectory = (checkpointId: string): string =>
    path.join(root, CHECKPOINTS_DIRECTORY, checkpointId);

  const descriptor: RecoveryStoreDescriptor = Object.freeze({
    rootDirectory: root,
    ownerOnlyModesApplied: areOwnerOnlyModesSupported(),
    usesGit: false as const,
    storesCredentials: false as const,
    encryptsAtRest: false as const,
  });

  const store: RecoveryStore = {
    describe(): RecoveryStoreDescriptor {
      return descriptor;
    },

    async writeCheckpoint(
      write: StoredCheckpointWrite,
    ): Promise<Result<true, RecoveryFailure>> {
      if (!isSafeName(write.checkpointId)) {
        return failure(
          storeFailure(
            "STORE_WRITE_FAILED",
            "checkpointId is not a safe store-local name",
          ),
        );
      }
      for (const blob of write.blobs) {
        if (!isSafeName(blob.blobId)) {
          return failure(
            storeFailure(
              "STORE_WRITE_FAILED",
              `blobId '${blob.blobId}' is not a safe store-local name`,
            ),
          );
        }
        if (blob.bytes.byteLength > MAX_CHECKPOINT_BLOB_BYTES) {
          return failure(
            storeFailure(
              "BOUNDS_EXCEEDED",
              `blob '${blob.blobId}' exceeds the checkpoint blob ceiling`,
            ),
          );
        }
      }

      const directory = checkpointDirectory(write.checkpointId);
      try {
        await fs.ensureDirectory(root);
        await fs.ensureDirectory(directory);
        const blobDirectory = path.join(directory, BLOBS_DIRECTORY);
        await fs.ensureDirectory(blobDirectory);
        for (const blob of write.blobs) {
          await fs.writeFileAtomic(blobDirectory, blob.blobId, blob.bytes);
        }
        // Manifest last: its presence implies the blobs are already durable.
        await fs.writeFileAtomic(
          directory,
          MANIFEST_FILE_NAME,
          new TextEncoder().encode(write.manifestJson),
        );
      } catch (error) {
        return failure(
          storeFailure(
            "STORE_WRITE_FAILED",
            `checkpoint persistence failed: ${describeError(error)}`,
          ),
        );
      }
      return success(true);
    },

    async readManifestJson(
      checkpointId: string,
    ): Promise<Result<string, RecoveryFailure>> {
      if (!isSafeName(checkpointId)) {
        return failure(
          storeFailure(
            "CHECKPOINT_NOT_FOUND",
            "checkpointId is not a safe store-local name",
          ),
        );
      }
      const manifestPath = path.join(
        checkpointDirectory(checkpointId),
        MANIFEST_FILE_NAME,
      );
      try {
        const bytes = await fs.readFileBytes(
          manifestPath,
          MAX_CHECKPOINT_BLOB_BYTES,
        );
        return success(new TextDecoder("utf-8", { fatal: false }).decode(bytes));
      } catch (error) {
        return failure(
          storeFailure(
            "CHECKPOINT_NOT_FOUND",
            `checkpoint manifest unavailable: ${describeError(error)}`,
          ),
        );
      }
    },

    async readBlob(
      checkpointId: string,
      blobId: string,
    ): Promise<Result<Uint8Array, RecoveryFailure>> {
      if (!isSafeName(checkpointId) || !isSafeName(blobId)) {
        return failure(
          storeFailure(
            "STORE_READ_FAILED",
            "checkpoint blob reference is not a safe store-local name",
          ),
        );
      }
      const blobPath = path.join(
        checkpointDirectory(checkpointId),
        BLOBS_DIRECTORY,
        blobId,
      );
      try {
        const bytes = await fs.readFileBytes(
          blobPath,
          MAX_CHECKPOINT_BLOB_BYTES,
        );
        return success(bytes);
      } catch (error) {
        return failure(
          storeFailure(
            "STORE_READ_FAILED",
            `checkpoint blob unavailable: ${describeError(error)}`,
          ),
        );
      }
    },
  };

  return success(store);
}
