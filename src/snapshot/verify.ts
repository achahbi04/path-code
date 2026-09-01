/**
 * Snapshot verification orchestration.
 */

import type { ResolvedProjectConfig } from "../config/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { RepositoryEntry } from "../inventory/types.js";
import {
  MAX_CONTENT_VERIFICATION_CONCURRENCY,
  MAX_CONTENT_VERIFICATIONS_PER_OPERATION,
  MAX_ENTRY_VERIFICATION_CONCURRENCY,
  MAX_ENTRY_VERIFICATIONS_PER_OPERATION,
} from "./constants.js";
import {
  contentRevalidationRequired,
  noBaselineContentUnverifiable,
  notVerifiedContent,
  staleContentFromMetadata,
  verifyEntryContent,
} from "./content-verify.js";
import {
  notVerifiedEntry,
  sortEntriesForVerification,
  verifyEntryIdentity,
} from "./entry-verify.js";
import { snapshotFailure, type SnapshotFailure } from "./failure.js";
import { propagateDerivedKnowledge } from "./propagate.js";
import type {
  AssessmentCompletion,
  ContentVerificationResult,
  ContentVerificationState,
  EffectiveVerificationLimits,
  EntryVerificationResult,
  FreshnessAssessment,
  FreshnessAssessmentData,
  RepositorySnapshot,
  VerificationOptions,
  VerificationRequest,
} from "./types.js";

function brandFreshnessAssessment(data: FreshnessAssessmentData): FreshnessAssessment {
  return data as FreshnessAssessment;
}

export function validateVerificationOptions(
  options: VerificationOptions | undefined,
): Result<EffectiveVerificationLimits, SnapshotFailure> {
  const maxEntryVerifications =
    options?.maxEntryVerifications ?? MAX_ENTRY_VERIFICATIONS_PER_OPERATION;
  const maxContentVerifications =
    options?.maxContentVerifications ?? MAX_CONTENT_VERIFICATIONS_PER_OPERATION;
  const maxEntryConcurrency =
    options?.maxEntryConcurrency ?? MAX_ENTRY_VERIFICATION_CONCURRENCY;
  const maxContentConcurrency =
    options?.maxContentConcurrency ?? MAX_CONTENT_VERIFICATION_CONCURRENCY;

  for (const [name, value, ceiling] of [
    ["maxEntryVerifications", maxEntryVerifications, MAX_ENTRY_VERIFICATIONS_PER_OPERATION],
    ["maxContentVerifications", maxContentVerifications, MAX_CONTENT_VERIFICATIONS_PER_OPERATION],
    ["maxEntryConcurrency", maxEntryConcurrency, MAX_ENTRY_VERIFICATION_CONCURRENCY],
    ["maxContentConcurrency", maxContentConcurrency, MAX_CONTENT_VERIFICATION_CONCURRENCY],
  ] as const) {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
      return failure(
        snapshotFailure(
          "INVALID_VERIFICATION_OPTIONS",
          `${name} must be a finite positive integer`,
        ),
      );
    }
    if (value > ceiling) {
      return failure(
        snapshotFailure(
          "INVALID_VERIFICATION_OPTIONS",
          `${name} cannot exceed the hard production ceiling`,
          { hardCeiling: ceiling },
        ),
      );
    }
  }

  return success({
    maxEntryVerifications,
    maxContentVerifications,
    maxEntryConcurrency,
    maxContentConcurrency,
  });
}

function admittedEntries(snapshot: RepositorySnapshot): RepositoryEntry[] {
  const entries: RepositoryEntry[] = [];
  for (const observation of snapshot.inventory.observations) {
    if (observation.disposition === "ADMITTED") {
      entries.push(observation.entry);
    }
  }
  return entries;
}

function resolveEntryScope(
  snapshot: RepositorySnapshot,
  request: VerificationRequest,
): Result<RepositoryEntry[], SnapshotFailure> {
  const admitted = admittedEntries(snapshot);
  if (request.entries === "ALL") {
    return success(sortEntriesForVerification(admitted));
  }
  for (const entry of request.entries) {
    if (!admitted.includes(entry)) {
      return failure(
        snapshotFailure(
          "ENTRY_NOT_IN_SNAPSHOT",
          "Verification request references an entry outside the snapshot inventory",
        ),
      );
    }
  }
  return success(sortEntriesForVerification(request.entries));
}

function validateContentScope(
  request: VerificationRequest,
): Result<"NONE" | "ALL" | readonly RepositoryEntry[], SnapshotFailure> {
  if (request.content === "NONE") {
    return success("NONE");
  }
  if (request.content === "ALL") {
    if (request.entries !== "ALL") {
      return failure(
        snapshotFailure(
          "INVALID_VERIFICATION_OPTIONS",
          'content: "ALL" requires entries: "ALL"',
        ),
      );
    }
    return success("ALL");
  }
  return success(request.content);
}

function mapEntryStateToContentState(
  entry: RepositoryEntry,
  entryState: EntryVerificationResult["state"],
  verifiedAt: number,
  baseline?: import("../reader/types.js").ContentObservation,
): ContentVerificationResult {
  let state: ContentVerificationState = "NOT_VERIFIED";
  switch (entryState) {
    case "DENIED":
      state = "DENIED";
      break;
    case "UNREADABLE":
      state = "UNREADABLE";
      break;
    case "STALE_DELETED":
    case "STALE_TARGET_CHANGED":
    case "STALE_TYPE_CHANGED":
    case "STALE_OUTSIDE_WORKSPACE":
      state = "STALE_CONTENT";
      break;
    default:
      state = "NOT_VERIFIED";
  }
  return {
    entry,
    relativePath: entry.relativePath,
    state,
    verifiedAt,
    ...(baseline === undefined ? {} : { baselineObservation: baseline }),
  } as ContentVerificationResult;
}

function contentSelected(
  entry: RepositoryEntry,
  contentScope: "NONE" | "ALL" | readonly RepositoryEntry[],
  entryScopeSet: Set<RepositoryEntry>,
): boolean {
  if (contentScope === "NONE" || !entryScopeSet.has(entry)) {
    return false;
  }
  if (contentScope === "ALL") {
    return true;
  }
  return contentScope.includes(entry);
}

export async function verifyRepositorySnapshot(
  snapshot: RepositorySnapshot,
  workspace: WorkspaceBoundary,
  currentConfig: ResolvedProjectConfig,
  request: VerificationRequest,
): Promise<Result<FreshnessAssessment, SnapshotFailure>> {
  const limitsResult = validateVerificationOptions(request.options);
  if (!limitsResult.ok) {
    return limitsResult;
  }
  const limits = limitsResult.value;

  const entryScopeResult = resolveEntryScope(snapshot, request);
  if (!entryScopeResult.ok) {
    return entryScopeResult;
  }
  const entryScope = entryScopeResult.value;
  const entryScopeSet = new Set(entryScope);

  const contentScopeResult = validateContentScope(request);
  if (!contentScopeResult.ok) {
    return contentScopeResult;
  }
  const contentScope = contentScopeResult.value;

  if (contentScope !== "NONE" && Array.isArray(contentScope)) {
    for (const entry of contentScope) {
      if (!entryScopeSet.has(entry)) {
        return failure(
          snapshotFailure(
            "INVALID_VERIFICATION_OPTIONS",
            "Content verification entry is outside the selected entry scope",
          ),
        );
      }
    }
  }

  const verifiedAt = Date.now();
  const entryResults: EntryVerificationResult[] = [];
  const contentResults: ContentVerificationResult[] = [];
  const contentByEntry = new Map<RepositoryEntry, ContentVerificationResult>();

  let entryAttempts = 0;
  let contentAttempts = 0;
  let entryBudgetExhausted = false;
  let contentBudgetExhausted = false;

  for (const entry of sortEntriesForVerification(admittedEntries(snapshot))) {
    const inEntryScope = entryScopeSet.has(entry);
    const baseline = snapshot.contentObservationByEntry.get(entry);

    if (!inEntryScope) {
      entryResults.push(notVerifiedEntry(entry, verifiedAt, "NOT_REQUESTED"));
      if (contentScope !== "NONE") {
        const skipped = notVerifiedContent(entry, verifiedAt, "NOT_REQUESTED");
        contentResults.push(skipped);
        contentByEntry.set(entry, skipped);
      }
      continue;
    }

    if (entryAttempts >= limits.maxEntryVerifications) {
      entryBudgetExhausted = true;
      entryResults.push(notVerifiedEntry(entry, verifiedAt, "BUDGET_EXHAUSTED"));
      if (contentSelected(entry, contentScope, entryScopeSet)) {
        const exhausted = notVerifiedContent(entry, verifiedAt, "BUDGET_EXHAUSTED");
        contentResults.push(exhausted);
        contentByEntry.set(entry, exhausted);
      } else if (contentScope === "NONE") {
        const exhausted = notVerifiedContent(entry, verifiedAt, "BUDGET_EXHAUSTED");
        contentResults.push(exhausted);
        contentByEntry.set(entry, exhausted);
      }
      continue;
    }

    entryAttempts += 1;
    const entryResult = await verifyEntryIdentity(
      entry,
      snapshot,
      workspace,
      currentConfig,
      verifiedAt,
    );
    if (!entryResult.ok) {
      return entryResult;
    }
    entryResults.push(entryResult.value);

    if (contentScope === "NONE") {
      if (entryResult.value.state === "CURRENT_IDENTITY") {
        if (baseline === undefined) {
          const unverifiable = noBaselineContentUnverifiable(entry, verifiedAt);
          contentResults.push(unverifiable);
          contentByEntry.set(entry, unverifiable);
        } else if (entry.size !== null && baseline.byteLength !== entry.size) {
          const stale = staleContentFromMetadata(entry, baseline, verifiedAt);
          contentResults.push(stale);
          contentByEntry.set(entry, stale);
        } else {
          const revalidation = contentRevalidationRequired(entry, snapshot, verifiedAt);
          contentResults.push(revalidation);
          contentByEntry.set(entry, revalidation);
        }
      }
      continue;
    }

    if (!contentSelected(entry, contentScope, entryScopeSet)) {
      const skipped = notVerifiedContent(entry, verifiedAt, "NOT_REQUESTED");
      contentResults.push(skipped);
      contentByEntry.set(entry, skipped);
      continue;
    }

    if (entryResult.value.state !== "CURRENT_IDENTITY") {
      const mapped = mapEntryStateToContentState(
        entry,
        entryResult.value.state,
        verifiedAt,
        baseline,
      );
      contentResults.push(mapped);
      contentByEntry.set(entry, mapped);
      continue;
    }

    if (contentAttempts >= limits.maxContentVerifications) {
      contentBudgetExhausted = true;
      const exhausted = notVerifiedContent(entry, verifiedAt, "BUDGET_EXHAUSTED");
      contentResults.push(exhausted);
      contentByEntry.set(entry, exhausted);
      continue;
    }

    contentAttempts += 1;
    const contentResult = await verifyEntryContent(
      entry,
      snapshot,
      workspace,
      currentConfig,
      verifiedAt,
    );
    if (!contentResult.ok) {
      return contentResult;
    }
    contentResults.push(contentResult.value);
    contentByEntry.set(entry, contentResult.value);
  }

  const reasons: Array<
    | { readonly kind: "ENTRY_BUDGET_EXHAUSTED" }
    | { readonly kind: "CONTENT_BUDGET_EXHAUSTED" }
  > = [];
  if (entryBudgetExhausted) {
    reasons.push({ kind: "ENTRY_BUDGET_EXHAUSTED" });
  }
  if (contentBudgetExhausted) {
    reasons.push({ kind: "CONTENT_BUDGET_EXHAUSTED" });
  }

  const assessmentCompletion: AssessmentCompletion =
    reasons.length === 0
      ? { kind: "COMPLETE" }
      : { kind: "PARTIAL", reasons: [reasons[0]!, ...reasons.slice(1)] };

  return success(
    brandFreshnessAssessment({
      snapshot,
      generation: snapshot.generation,
      assessedAt: verifiedAt,
      entryResults,
      contentResults,
      derivedResults: propagateDerivedKnowledge(snapshot, contentByEntry),
      ...(snapshot.gitBaseline === undefined
        ? {}
        : { gitBaselineState: "POINT_IN_TIME" as const }),
      assessmentCompletion,
      honesty: {
        verifiedObservationsOnly: true,
        newEntriesNotDetectable: true,
        repositoryUnchangedClaim: false,
      },
    }),
  );
}
