/**
 * Authorized low-level filesystem adapter for the recovery checkpoint store.
 *
 * This is the sole production import site for store-write primitives
 * (mkdir/open-exclusive/write/fsync/rename/chmod). It writes ONLY under the
 * store root the host supplies, which must live outside the target workspace;
 * project mutation primitives remain confined to `src/editing/atomic-fs.ts`.
 *
 * POSIX owner-only modes (0o700 directories, 0o600 files) are applied where
 * the platform supports them. Nothing here encrypts anything.
 */

import { randomBytes } from "node:crypto";
import { fsync as fsyncCallback } from "node:fs";
import {
  chmod,
  constants,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";

/** Owner-only directory mode applied where the platform supports it. */
export const RECOVERY_DIRECTORY_MODE = 0o700;

/** Owner-only file mode applied where the platform supports it. */
export const RECOVERY_FILE_MODE = 0o600;

const RECOVERY_TEMP_PREFIX = ".path-code-checkpoint-";

const MAX_TEMP_COLLISION_ATTEMPTS = 10;

type NodeErrnoException = Error & { readonly code?: string };

function isNodeErrno(error: unknown): error is NodeErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/** POSIX mode bits and directory fsync are honored on darwin/linux only. */
export function areOwnerOnlyModesSupported(): boolean {
  return process.platform === "darwin" || process.platform === "linux";
}

export type RecoveryStoreFsOps = {
  readonly ensureDirectory: (dirPath: string) => Promise<void>;
  readonly writeFileAtomic: (
    dirPath: string,
    fileName: string,
    bytes: Readonly<Uint8Array>,
  ) => Promise<void>;
  readonly readFileBytes: (
    filePath: string,
    maxBytes: number,
  ) => Promise<Uint8Array>;
};

async function ensureDirectoryImpl(dirPath: string): Promise<void> {
  const owner = areOwnerOnlyModesSupported();
  await mkdir(dirPath, {
    recursive: true,
    ...(owner ? { mode: RECOVERY_DIRECTORY_MODE } : {}),
  });
  if (owner) {
    // An existing directory keeps its original mode after `mkdir`; narrow it.
    await chmod(dirPath, RECOVERY_DIRECTORY_MODE);
  }
}

function exclusiveCreateFlags(): number {
  let flags = constants.O_RDWR | constants.O_CREAT | constants.O_EXCL;
  if (
    "O_NOFOLLOW" in constants &&
    typeof (constants as { O_NOFOLLOW?: number }).O_NOFOLLOW === "number"
  ) {
    flags |= (constants as { O_NOFOLLOW: number }).O_NOFOLLOW;
  }
  return flags;
}

async function fsyncDirectory(dirPath: string): Promise<void> {
  if (!areOwnerOnlyModesSupported()) {
    return;
  }
  const handle = await open(dirPath, constants.O_RDONLY | constants.O_DIRECTORY);
  try {
    await new Promise<void>((resolve, reject) => {
      fsyncCallback(handle.fd, (error) => {
        if (error !== null && error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  } finally {
    await handle.close();
  }
}

async function writeFileAtomicImpl(
  dirPath: string,
  fileName: string,
  bytes: Readonly<Uint8Array>,
): Promise<void> {
  await ensureDirectoryImpl(dirPath);
  const flags = exclusiveCreateFlags();
  let tempPath: string | null = null;
  for (let attempt = 0; attempt < MAX_TEMP_COLLISION_ATTEMPTS; attempt += 1) {
    const candidate = path.join(
      dirPath,
      `${RECOVERY_TEMP_PREFIX}${randomBytes(16).toString("hex")}`,
    );
    let handle;
    try {
      handle = await open(candidate, flags, RECOVERY_FILE_MODE);
    } catch (error) {
      if (isNodeErrno(error) && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
    tempPath = candidate;
    try {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const chunk = bytes.subarray(offset);
        const { bytesWritten } = await handle.write(chunk, 0, chunk.byteLength);
        if (bytesWritten === 0) {
          throw new Error("checkpoint write made zero progress");
        }
        offset += bytesWritten;
      }
      await handle.sync();
      if (areOwnerOnlyModesSupported()) {
        await handle.chmod(RECOVERY_FILE_MODE);
      }
    } finally {
      await handle.close();
    }
    break;
  }
  if (tempPath === null) {
    throw new Error("checkpoint temporary name collision attempts exhausted");
  }
  try {
    await rename(tempPath, path.join(dirPath, fileName));
  } catch (error) {
    try {
      await unlink(tempPath);
    } catch {
      // Cleanup is best-effort; the rename failure is the reported outcome.
    }
    throw error;
  }
  await fsyncDirectory(dirPath);
}

async function readFileBytesImpl(
  filePath: string,
  maxBytes: number,
): Promise<Uint8Array> {
  const info = await stat(filePath);
  if (!info.isFile()) {
    throw new Error("checkpoint store path is not a regular file");
  }
  if (info.size > maxBytes) {
    throw new Error("checkpoint store file exceeds the read ceiling");
  }
  const buffer = await readFile(filePath);
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}

export const productionRecoveryStoreFs: RecoveryStoreFsOps = {
  ensureDirectory: ensureDirectoryImpl,
  writeFileAtomic: writeFileAtomicImpl,
  readFileBytes: readFileBytesImpl,
};
