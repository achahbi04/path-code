/**
 * Entry identity verification — canonicalize + stat/lstat only.
 */

import { lstat } from "node:fs/promises";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  isLexicallyDenied,
  isPhysicallyDenied,
  prepareDenyPathPlan,
} from "../inventory/denial.js";
import type { RepositoryEntry } from "../inventory/types.js";
import { LOCALE_INDEPENDENT_NAME_COMPARE } from "../inventory/constants.js";
import { snapshotFailure, type SnapshotFailure } from "./failure.js";
import type {
  EntryVerificationResult,
  EntryVerificationResultData,
  EntryVerificationState,
  NotVerifiedReason,
  RepositorySnapshot,
} from "./types.js";

function brandEntryVerification(
  data: EntryVerificationResultData,
): EntryVerificationResult {
  return data as EntryVerificationResult;
}

function notVerifiedEntry(
  entry: RepositoryEntry,
  verifiedAt: number,
  reason: NotVerifiedReason,
): EntryVerificationResult {
  return brandEntryVerification({
    entry,
    relativePath: entry.relativePath,
    state: "NOT_VERIFIED",
    verifiedAt,
    notVerifiedReason: reason,
  });
}

function physicalKindFromStats(isFile: boolean, isDirectory: boolean, isSymbolicLink: boolean) {
  if (isFile) {
    return "FILE" as const;
  }
  if (isDirectory) {
    return "DIRECTORY" as const;
  }
  if (isSymbolicLink) {
    return "OTHER" as const;
  }
  return "OTHER" as const;
}

export function sortEntriesForVerification(
  entries: readonly RepositoryEntry[],
): RepositoryEntry[] {
  return [...entries].sort((a, b) =>
    LOCALE_INDEPENDENT_NAME_COMPARE(a.relativePath, b.relativePath),
  );
}

export async function verifyEntryIdentity(
  entry: RepositoryEntry,
  snapshot: RepositorySnapshot,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  verifiedAt: number,
): Promise<Result<EntryVerificationResult, SnapshotFailure>> {
  const planResult = await prepareDenyPathPlan(
    workspace,
    config.restrictions.deniedPaths,
  );
  if (!planResult.ok) {
    return failure(
      snapshotFailure(
        "VERIFICATION_FAILED",
        "Configured deny-path boundary could not be resolved for verification",
        planResult.error.details,
      ),
    );
  }
  const plan = planResult.value;

  if (isLexicallyDenied(entry.relativePath, plan)) {
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state: "DENIED",
        verifiedAt,
      }),
    );
  }

  const canonical = await workspace.canonicalize(entry.relativePath);
  if (!canonical.ok) {
    const state: EntryVerificationState =
      canonical.error.code === "PATH_OUTSIDE_WORKSPACE"
        ? "STALE_OUTSIDE_WORKSPACE"
        : canonical.error.code === "PATH_NOT_FOUND"
          ? "STALE_DELETED"
          : "UNREADABLE";
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state,
        verifiedAt,
      }),
    );
  }

  if (canonical.value !== entry.canonicalPath) {
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state: "STALE_TARGET_CHANGED",
        verifiedAt,
      }),
    );
  }

  if (isPhysicallyDenied(canonical.value, plan)) {
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state: "DENIED",
        verifiedAt,
      }),
    );
  }

  let stats;
  try {
    stats = await lstat(canonical.value);
  } catch {
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state: "STALE_DELETED",
        verifiedAt,
      }),
    );
  }

  const physicalKind = physicalKindFromStats(
    stats.isFile(),
    stats.isDirectory(),
    stats.isSymbolicLink(),
  );

  if (physicalKind !== entry.physicalKind) {
    return success(
      brandEntryVerification({
        entry,
        relativePath: entry.relativePath,
        state: "STALE_TYPE_CHANGED",
        verifiedAt,
      }),
    );
  }

  const baselineIdentity = snapshot.entryStatIdentities.get(entry);
  if (baselineIdentity !== undefined) {
    if (stats.dev !== baselineIdentity.dev || stats.ino !== baselineIdentity.ino) {
      return success(
        brandEntryVerification({
          entry,
          relativePath: entry.relativePath,
          state: "STALE_TARGET_CHANGED",
          verifiedAt,
        }),
      );
    }
  }

  return success(
    brandEntryVerification({
      entry,
      relativePath: entry.relativePath,
      state: "CURRENT_IDENTITY",
      verifiedAt,
    }),
  );
}

export { notVerifiedEntry };
