/**
 * Authorized low-level filesystem adapter — the sole production import site
 * for project mutation primitives (write/rename/link/chown/chmod/fsync).
 *
 * Phase 3B: same-directory rename publication.
 * Phase 3C: same-directory hard-link no-overwrite publication.
 */

import { randomBytes } from "node:crypto";
import { fsync as fsyncCallback } from "node:fs";
import {
  constants,
  link,
  lstat,
  open,
  rename,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

/** Phase 3B temporary candidate prefix. */
export const PATH_CODE_TEMP_PREFIX = ".path-code-replace-";

/** Phase 3C temporary candidate prefix — distinct from replacement temps. */
export const PATH_CODE_CREATE_TEMP_PREFIX = ".path-code-create-";

export const MAX_TEMP_COLLISION_ATTEMPTS = 10;

/** POSIX base mode for newly created files before umask application. */
export const CREATED_FILE_BASE_MODE = 0o666;

export type TargetFileMetadata = {
  readonly dev: number;
  readonly ino: number;
  readonly mode: number;
  readonly uid: number;
  readonly gid: number;
  readonly nlink: number;
  readonly isFile: boolean;
  readonly isDirectory: boolean;
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
  /** Hard-link publication: fails with EEXIST if target already exists. */
  readonly linkNoOverwrite: (
    candidatePath: string,
    targetPath: string,
  ) => Promise<void>;
  readonly fsyncDirectory: (dirPath: string) => Promise<void>;
  readonly unlink: (filePath: string) => Promise<void>;
  /** Bounded read of a published path for creation after-state verification. */
  readonly readPublishedBytes: (
    filePath: string,
    expectedLength: number,
  ) => Promise<Uint8Array>;
};

/** Alias used by creation orchestration — same production seam. */
export type AtomicCreateFsOps = AtomicReplaceFsOps;

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

/**
 * Creation requires proven hard-link no-overwrite + directory fsync.
 * Evaluated independently from replace support.
 */
export function isAtomicCreatePlatformSupported(): boolean {
  return process.platform === "darwin" || process.platform === "linux";
}

/**
 * Final created-file mode: base 0o666 masked by the process umask.
 * Does not mutate process.umask().
 */
export function computeCreatedFileMode(): number {
  return CREATED_FILE_BASE_MODE & ~process.umask();
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
    isDirectory: statResult.isDirectory(),
    isSymbolicLink: statResult.isSymbolicLink(),
  };
}

async function createTempExclusiveImpl(
  parentDir: string,
  prefix: string,
): Promise<TempCandidateHandle> {
  const flags = exclusiveCreateFlags();
  for (let attempt = 0; attempt < MAX_TEMP_COLLISION_ATTEMPTS; attempt += 1) {
    const suffix = randomBytes(16).toString("hex");
    const tempPath = path.join(parentDir, `${prefix}${suffix}`);
    try {
      const handle = await open(tempPath, flags, 0o600);
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
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      expectedLength - offset,
      0,
    );
    if (bytesRead === 0) {
      throw new Error("Candidate read-back ended before expected length");
    }
    offset += bytesRead;
  }
  return buffer;
}

async function readPublishedBytesImpl(
  filePath: string,
  expectedLength: number,
): Promise<Uint8Array> {
  const handle = await open(filePath, "r");
  try {
    const buffer = new Uint8Array(expectedLength);
    let offset = 0;
    while (offset < expectedLength) {
      const { bytesRead } = await handle.read(
        buffer,
        offset,
        expectedLength - offset,
        offset,
      );
      if (bytesRead === 0) {
        throw new Error("Published-file read ended before expected length");
      }
      offset += bytesRead;
    }
    return buffer;
  } finally {
    await handle.close();
  }
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

async function linkNoOverwriteImpl(
  candidatePath: string,
  targetPath: string,
): Promise<void> {
  await link(candidatePath, targetPath);
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
  linkNoOverwrite: linkNoOverwriteImpl,
  fsyncDirectory: fsyncDirectoryImpl,
  unlink: (filePath) => unlink(filePath),
  readPublishedBytes: readPublishedBytesImpl,
};

export const productionAtomicCreateFs: AtomicCreateFsOps = productionAtomicReplaceFs;
