/**
 * Bounded repository-content reader.
 *
 * Reads only through earned RepositoryEntry after JIT authority and
 * visibility revalidation. Full-byte observation within the effective bound
 * is required before ContentObservation / SHA-256 may exist.
 */

import { createHash } from "node:crypto";
import { open, stat, type FileHandle } from "node:fs/promises";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import {
  isLexicallyDenied,
  isPhysicallyDenied,
  prepareDenyPathPlan,
} from "../inventory/denial.js";
import type { RepositoryEntry } from "../inventory/types.js";
import { MAX_REPOSITORY_CONTENT_BYTES } from "./constants.js";
import { readerFailure, type ReaderFailure } from "./failure.js";
import type {
  BinaryClassificationReason,
  ContentFingerprint,
  ContentObservation,
  ContentObservationData,
  ReaderOptions,
  ReaderWarning,
  RepositoryReadOutcome,
  StaleEntryReason,
  UnreadableStage,
} from "./types.js";

type NodeErrnoException = Error & {
  readonly code?: string;
};

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

function fsCodeOf(error: unknown): string | undefined {
  return isNodeErrnoException(error) ? error.code : undefined;
}

function contentObservation(data: ContentObservationData): ContentObservation {
  return data as ContentObservation;
}

function fingerprintOf(bytes: Uint8Array): ContentFingerprint {
  const hex = createHash("sha256").update(bytes).digest("hex");
  return {
    algorithm: "sha256",
    hex,
    byteLength: bytes.byteLength,
  };
}

function validateReaderOptions(
  options: ReaderOptions | undefined,
): Result<number, ReaderFailure> {
  const requested = options?.maxBytes ?? MAX_REPOSITORY_CONTENT_BYTES;

  if (
    !Number.isFinite(requested) ||
    !Number.isInteger(requested) ||
    requested <= 0
  ) {
    return failure(
      readerFailure(
        "INVALID_READER_OPTIONS",
        "maxBytes must be a finite positive integer",
      ),
    );
  }

  if (requested > MAX_REPOSITORY_CONTENT_BYTES) {
    return failure(
      readerFailure(
        "INVALID_READER_OPTIONS",
        "maxBytes cannot exceed the hard production ceiling",
        { hardCeiling: MAX_REPOSITORY_CONTENT_BYTES },
      ),
    );
  }

  return success(requested);
}

function classifyBytes(
  bytes: Uint8Array,
):
  | { readonly kind: "TEXT"; readonly text: string }
  | { readonly kind: "BINARY"; readonly binaryReason: BinaryClassificationReason } {
  for (let index = 0; index < bytes.byteLength; index += 1) {
    if (bytes[index] === 0) {
      return { kind: "BINARY", binaryReason: "NUL_BYTE" };
    }
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    const text = decoder.decode(bytes);
    return { kind: "TEXT", text };
  } catch {
    return { kind: "BINARY", binaryReason: "INVALID_UTF8" };
  }
}

function withWarnings(
  outcome: RepositoryReadOutcome,
  warnings: readonly ReaderWarning[],
): RepositoryReadOutcome {
  if (warnings.length === 0) {
    return outcome;
  }
  return { ...outcome, warnings };
}

async function closeHandle(
  handle: FileHandle,
  warnings: ReaderWarning[],
): Promise<void> {
  try {
    await handle.close();
  } catch (error: unknown) {
    const fsCode = fsCodeOf(error);
    warnings.push({
      code: "HANDLE_CLOSE_FAILED",
      message: "Failed to close repository content file handle",
      ...(fsCode === undefined ? {} : { details: { fsCode } }),
    });
  }
}

function unreadable(
  stage: UnreadableStage,
  error: unknown,
): RepositoryReadOutcome {
  const fsCode = fsCodeOf(error);
  return {
    status: "UNREADABLE",
    stage,
    ...(fsCode === undefined ? {} : { fsCode }),
  };
}

function stale(reason: StaleEntryReason): RepositoryReadOutcome {
  return { status: "STALE_ENTRY", reason };
}

async function readOpenedContent(
  entry: RepositoryEntry,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  handle: FileHandle,
  maxBytes: number,
): Promise<Result<RepositoryReadOutcome, ReaderFailure>> {
  let handleStat;
  try {
    handleStat = await handle.stat();
  } catch (error: unknown) {
    return success(unreadable("STAT", error));
  }

  if (!handleStat.isFile()) {
    return success(stale("TARGET_KIND_CHANGED"));
  }

  const postCanonical = await workspace.canonicalize(entry.relativePath);
  if (!postCanonical.ok) {
    if (postCanonical.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return success(stale("PATH_OUTSIDE_WORKSPACE"));
    }
    if (postCanonical.error.code === "PATH_NOT_FOUND") {
      return success(stale("PATH_NOT_FOUND"));
    }
    return success(stale("CANONICALIZATION_FAILED"));
  }

  if (postCanonical.value !== entry.canonicalPath) {
    return success(stale("CANONICAL_PATH_CHANGED"));
  }

  const postPlanResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!postPlanResult.ok) {
    return failure(
      readerFailure(
        "DENIAL_ROOT_RESOLUTION_FAILED",
        "Unexpected failure resolving configured deny-path boundary after open",
        postPlanResult.error.details,
      ),
    );
  }

  if (isPhysicallyDenied(postCanonical.value, postPlanResult.value)) {
    return success({
      status: "DENIED",
      relativePath: entry.relativePath,
    });
  }

  let pathStat;
  try {
    pathStat = await stat(postCanonical.value);
  } catch (error: unknown) {
    return success(unreadable("PATH_STAT", error));
  }

  if (handleStat.dev !== pathStat.dev || handleStat.ino !== pathStat.ino) {
    return success(stale("OPEN_HANDLE_IDENTITY_MISMATCH"));
  }

  // Bounded MAX+1 read — single allocation, no unbounded chunk list.
  const buffer = new Uint8Array(maxBytes + 1);
  let total = 0;
  let eofObserved = false;

  while (total < buffer.byteLength) {
    let bytesRead: number;
    try {
      const result = await handle.read(
        buffer,
        total,
        buffer.byteLength - total,
        total,
      );
      bytesRead = result.bytesRead;
    } catch (error: unknown) {
      return success(unreadable("READ", error));
    }

    if (bytesRead === 0) {
      eofObserved = true;
      break;
    }
    total += bytesRead;
  }

  if (total === maxBytes + 1 || !eofObserved) {
    return success({
      status: "TOO_LARGE",
      byteLengthObserved: total,
      maxBytes,
    });
  }

  const observed = buffer.subarray(0, total);
  const classification = classifyBytes(observed);
  const fingerprint = fingerprintOf(observed);

  const observation =
    classification.kind === "TEXT"
      ? contentObservation({
          kind: "TEXT",
          entry,
          byteLength: total,
          encoding: "UTF-8",
          text: classification.text,
          fingerprint,
        })
      : contentObservation({
          kind: "BINARY",
          entry,
          byteLength: total,
          binaryReason: classification.binaryReason,
          fingerprint,
        });

  return success({
    status: "READ",
    observation,
  });
}

/**
 * Read repository file content through an earned RepositoryEntry.
 *
 * Requires ResolvedProjectConfig for visibility revalidation.
 * Does not call loadProjectConfig.
 */
export async function readRepositoryContent(
  entry: RepositoryEntry,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  options?: ReaderOptions,
): Promise<Result<RepositoryReadOutcome, ReaderFailure>> {
  const limits = validateReaderOptions(options);
  if (!limits.ok) {
    return limits;
  }
  const maxBytes = limits.value;

  if (entry.physicalKind !== "FILE") {
    return success({
      status: "NOT_REGULAR_FILE",
      physicalKind: entry.physicalKind,
    });
  }

  const planResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!planResult.ok) {
    return failure(
      readerFailure(
        "DENIAL_ROOT_RESOLUTION_FAILED",
        "Unexpected failure resolving configured deny-path boundary",
        planResult.error.details,
      ),
    );
  }
  const plan = planResult.value;

  // Lexical denial before any canonicalize / open / read / hash.
  if (isLexicallyDenied(entry.relativePath, plan)) {
    return success({
      status: "DENIED",
      relativePath: entry.relativePath,
    });
  }

  const preCanonical = await workspace.canonicalize(entry.relativePath);
  if (!preCanonical.ok) {
    if (preCanonical.error.code === "PATH_OUTSIDE_WORKSPACE") {
      return success(stale("PATH_OUTSIDE_WORKSPACE"));
    }
    if (preCanonical.error.code === "PATH_NOT_FOUND") {
      return success(stale("PATH_NOT_FOUND"));
    }
    return success(stale("CANONICALIZATION_FAILED"));
  }

  if (preCanonical.value !== entry.canonicalPath) {
    return success(stale("CANONICAL_PATH_CHANGED"));
  }

  if (isPhysicallyDenied(preCanonical.value, plan)) {
    return success({
      status: "DENIED",
      relativePath: entry.relativePath,
    });
  }

  let handle: FileHandle;
  try {
    handle = await open(preCanonical.value, "r");
  } catch (error: unknown) {
    return success(unreadable("OPEN", error));
  }

  const warnings: ReaderWarning[] = [];
  let primary: Result<RepositoryReadOutcome, ReaderFailure>;
  try {
    primary = await readOpenedContent(
      entry,
      workspace,
      config,
      handle,
      maxBytes,
    );
  } finally {
    await closeHandle(handle, warnings);
  }

  if (!primary.ok) {
    return primary;
  }

  return success(withWarnings(primary.value, warnings));
}
