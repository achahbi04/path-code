/**
 * Phase 3B authorized low-level filesystem adapter — the sole production
 * import site for project mutation primitives (write/rename/chown/chmod/fsync).
 */

import { randomBytes } from "node:crypto";
import { fsync as fsyncCallback } from "node:fs";
import {
  constants,
  lstat,
  open,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

export const PATH_CODE_TEMP_PREFIX = ".path-code-replace-";

export const MAX_TEMP_COLLISION_ATTEMPTS = 10;

export type TargetFileMetadata = {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly nlink: number;
  readonly isFile: boolean;
  readonly isSymbolicLink: boolean;
};

export type TempCandidateHandle = {
  readonly handle: FileHandle;
  readonly tempPath: string;
};

export type AtomicReplaceFsOps = {
  readonly lstatTarget: (targetPath: string) => Promise<TargetFileMetadata>;
  readonly createTempExclusive: (
    parentDir: string,
    prefix: string,
  ) => Promise<TempCandidateHandle>;
  readonly writeAll: (
    handle: FileHandle,
    bytes: Readonly<Uint8Array>,
  ) => Promise<void>;
  readonly fsyncHandle: (handle: FileHandle) => Promise<void>;
  readonly fchown: (handle: FileHandle, uid: number, gid: number) => Promise<void>;
  readonly fchmod: (handle: FileHandle, mode: number) => Promise<void>;
  readonly readCandidateBytes: (
    handle: FileHandle,
    expectedLength: number,
  ) => Promise<Uint8Array>;
  readonly closeHandle: (handle: FileHandle) => Promise<void>;
  readonly renameAtomic: (tempPath: string, targetPath: string) => Promise<void>;
  readonly fsyncDirectory: (dirPath: string) => Promise<void>;
  readonly unlink: (filePath: string) => Promise<void>;
};

type NodeErrnoException = Error & { readonly code?: string };

function isNodeErrno(error: unknown): error is NodeErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

/** Reliability-first: POSIX same-directory rename + directory fsync only. */
export function isAtomicReplacePlatformSupported(): boolean {
  return process.platform === "darwin" || process.platform === "linux";
}

async function lstatTargetImpl(targetPath: string): Promise<TargetFileMetadata> {
  const statResult = await lstat(targetPath);
  return {
    dev: statResult.dev,
    ino: statResult.ino,
    mode: statResult.mode,
    uid: statResult.uid,
    gid: statResult.gid,
    nlink: statResult.nlink,
    isFile: statResult.isFile(),
    isSymbolicLink: statResult.isSymbolicLink(),
  };
}

async function createTempExclusiveImpl(
  parentDir: string,
  prefix: string,
): Promise<TempCandidateHandle> {
  for (let attempt = 0; attempt < MAX_TEMP_COLLISION_ATTEMPTS; attempt += 1) {
    const suffix = randomBytes(16).toString("hex");
    const tempPath = path.join(parentDir, `${prefix}${suffix}`);
    try {
      const handle = await open(
        tempPath,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL,
        0o600,
      );
      return { handle, tempPath };
    } catch (error) {
      if (isNodeErrno(error) && error.code === "EEXIST") {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Temporary candidate name collision attempts exhausted");
}

async function writeAllImpl(
  handle: FileHandle,
  bytes: Readonly<Uint8Array>,
): Promise<void> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const chunk = bytes.subarray(offset);
    const { bytesWritten } = await handle.write(chunk, 0, chunk.byteLength);
    if (bytesWritten === 0) {
      throw new Error("Write made zero progress");
    }
    offset += bytesWritten;
  }
}

async function fsyncHandleImpl(handle: FileHandle): Promise<void> {
  await handle.sync();
}

async function readCandidateBytesImpl(
  handle: FileHandle,
  expectedLength: number,
): Promise<Uint8Array> {
  const buffer = new Uint8Array(expectedLength);
  let offset = 0;
  while (offset < expectedLength) {
    const { bytesRead } = await handle.read(buffer, offset, expectedLength - offset, 0);
    if (bytesRead === 0) {
      throw new Error("Candidate read-back ended before expected length");
    }
    offset += bytesRead;
  }
  return buffer;
}

async function fsyncDirectoryImpl(dirPath: string): Promise<void> {
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

export const productionAtomicReplaceFs: AtomicReplaceFsOps = {
  lstatTarget: lstatTargetImpl,
  createTempExclusive: createTempExclusiveImpl,
  writeAll: writeAllImpl,
  fsyncHandle: fsyncHandleImpl,
  fchown: (handle, uid, gid) => handle.chown(uid, gid),
  fchmod: (handle, mode) => handle.chmod(mode),
  readCandidateBytes: readCandidateBytesImpl,
  closeHandle: (handle) => handle.close(),
  renameAtomic: (tempPath, targetPath) => rename(tempPath, targetPath),
  fsyncDirectory: fsyncDirectoryImpl,
  unlink: (filePath) => unlink(filePath),
};
