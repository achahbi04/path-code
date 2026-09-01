/**
 * Content verification — Phase 2B reader only, SHA-256 comparison only.
 */

import { lstat } from "node:fs/promises";

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { RepositoryEntry } from "../inventory/types.js";
import { readRepositoryContent } from "../reader/index.js";
import type { RepositoryReadOutcome } from "../reader/types.js";
import { snapshotFailure, type SnapshotFailure } from "./failure.js";
import type {
  ContentVerificationResult,
  ContentVerificationResultData,
  ContentVerificationState,
  NotVerifiedReason,
  RepositorySnapshot,
} from "./types.js";

function brandContentVerification(
  data: ContentVerificationResultData,
): ContentVerificationResult {
  return data as ContentVerificationResult;
}

export function notVerifiedContent(
  entry: RepositoryEntry,
  verifiedAt: number,
  reason: NotVerifiedReason,
): ContentVerificationResult {
  return brandContentVerification({
    entry,
    relativePath: entry.relativePath,
    state: "NOT_VERIFIED",
    verifiedAt,
    notVerifiedReason: reason,
  });
}

function mapReadOutcomeToContentState(
  outcome: Exclude<RepositoryReadOutcome, { readonly status: "READ" }>,
): ContentVerificationState {
  switch (outcome.status) {
    case "DENIED":
      return "DENIED";
    case "TOO_LARGE":
      return "UNVERIFIABLE";
    case "STALE_ENTRY":
      return "STALE_CONTENT";
    case "NOT_REGULAR_FILE":
      return "STALE_CONTENT";
    case "UNREADABLE":
      return "UNREADABLE";
  }
}

export async function verifyEntryContent(
  entry: RepositoryEntry,
  snapshot: RepositorySnapshot,
  workspace: WorkspaceBoundary,
  config: ResolvedProjectConfig,
  verifiedAt: number,
): Promise<Result<ContentVerificationResult, SnapshotFailure>> {
  const baseline = snapshot.contentObservationByEntry.get(entry);
  if (baseline === undefined) {
    return success(
      brandContentVerification({
        entry,
        relativePath: entry.relativePath,
        state: "UNVERIFIABLE",
        verifiedAt,
        unverifiableReason: "NO_BASELINE_CONTENT_OBSERVATION",
      }),
    );
  }

  try {
    const stats = await lstat(entry.canonicalPath);
    if (stats.isFile() && stats.size !== baseline.byteLength) {
      return success(
        brandContentVerification({
          entry,
          relativePath: entry.relativePath,
          state: "STALE_CONTENT",
          verifiedAt,
          baselineObservation: baseline,
        }),
      );
    }
  } catch {
    return success(
      brandContentVerification({
        entry,
        relativePath: entry.relativePath,
        state: "STALE_CONTENT",
        verifiedAt,
        baselineObservation: baseline,
      }),
    );
  }

  const read = await readRepositoryContent(entry, workspace, config);
  if (!read.ok) {
    return failure(
      snapshotFailure(
        "VERIFICATION_FAILED",
        "Content verification reader failed",
        { code: read.error.code },
      ),
    );
  }

  const outcome = read.value;
  if (outcome.status !== "READ") {
    const state = mapReadOutcomeToContentState(outcome);
    return success(
      brandContentVerification({
        entry,
        relativePath: entry.relativePath,
        state,
        verifiedAt,
        baselineObservation: baseline,
        ...(outcome.status === "TOO_LARGE"
          ? { unverifiableReason: "TOO_LARGE" as const }
          : {}),
      }),
    );
  }

  const observed = outcome.observation;
  if (observed.fingerprint.hex !== baseline.fingerprint.hex) {
    return success(
      brandContentVerification({
        entry,
        relativePath: entry.relativePath,
        state: "STALE_CONTENT",
        verifiedAt,
        baselineObservation: baseline,
        observedContent: observed,
      }),
    );
  }

  return success(
    brandContentVerification({
      entry,
      relativePath: entry.relativePath,
      state: "VERIFIED_CURRENT",
      verifiedAt,
      baselineObservation: baseline,
      observedContent: observed,
    }),
  );
}

export function contentRevalidationRequired(
  entry: RepositoryEntry,
  snapshot: RepositorySnapshot,
  verifiedAt: number,
): ContentVerificationResult {
  const baseline = snapshot.contentObservationByEntry.get(entry);
  return brandContentVerification({
    entry,
    relativePath: entry.relativePath,
    state: "REVALIDATION_REQUIRED",
    verifiedAt,
    ...(baseline === undefined ? {} : { baselineObservation: baseline }),
  });
}

export function noBaselineContentUnverifiable(
  entry: RepositoryEntry,
  verifiedAt: number,
): ContentVerificationResult {
  return brandContentVerification({
    entry,
    relativePath: entry.relativePath,
    state: "UNVERIFIABLE",
    verifiedAt,
    unverifiableReason: "NO_BASELINE_CONTENT_OBSERVATION",
  });
}

export function staleContentFromMetadata(
  entry: RepositoryEntry,
  baseline: import("../reader/types.js").ContentObservation,
  verifiedAt: number,
): ContentVerificationResult {
  return brandContentVerification({
    entry,
    relativePath: entry.relativePath,
    state: "STALE_CONTENT",
    verifiedAt,
    baselineObservation: baseline,
  });
}
