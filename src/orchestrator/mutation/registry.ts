/**
 * Private registration for mutation reviews — association only, not authority.
 */

import { randomUUID } from "node:crypto";

import type { BrainInvocationReceipt } from "../../brain/types.js";
import type { PreparedChange } from "../../editing/types.js";
import type { ReferenceBoundReasoning } from "../../reasoning/types.js";
import type { ReferenceCatalog } from "../../reasoning/catalog.js";
import type { RepositorySnapshot } from "../../snapshot/types.js";
import type { PreparedValidationPlan } from "../../validation/types.js";
import type { ClaimCheckAssignmentInput } from "../../reasoning/gate2/types.js";
import type {
  MutationArtifacts,
  MutationReview,
  MutationTargetKind,
  MutationValidationReview,
} from "./types.js";

type ReviewEntry = {
  readonly sessionId: string;
  readonly preparedInOrder: readonly PreparedChange[];
  readonly afterTexts: readonly string[];
  readonly changeIds: readonly string[];
  readonly targetIds: readonly string[];
  readonly kinds: readonly MutationTargetKind[];
  readonly relativePaths: readonly string[];
  readonly boundReasoning: ReferenceBoundReasoning;
  readonly brainReceipt: BrainInvocationReceipt;
  readonly originalCatalog: ReferenceCatalog;
  readonly originalSnapshot: RepositorySnapshot;
};

type ValidationReviewEntry = {
  readonly sessionId: string;
  readonly plan: PreparedValidationPlan;
  readonly snapshot: RepositorySnapshot;
  readonly catalog: ReferenceCatalog;
  readonly assignments: readonly ClaimCheckAssignmentInput[];
  readonly mutationArtifacts: MutationArtifacts;
  readonly afterByteComparisons: readonly {
    readonly targetId: string;
    readonly matched: true;
    readonly relativePath: string;
  }[];
  readonly ownedCatalog: ReferenceCatalog;
};

const reviewRegistry = new WeakMap<object, ReviewEntry>();
const validationReviewRegistry = new WeakMap<object, ValidationReviewEntry>();

export function nextSessionId(): string {
  return `mut-${randomUUID()}`;
}

export function nextReviewId(): string {
  return `mrev-${randomUUID()}`;
}

export function registerMutationReview(
  sessionId: string,
  entry: Omit<ReviewEntry, "sessionId">,
): MutationReview {
  const reviewId = nextReviewId();
  const order = entry.preparedInOrder.map((prepared, index) =>
    Object.freeze({
      changeId: entry.changeIds[index]!,
      targetId: entry.targetIds[index]!,
      kind: entry.kinds[index]!,
      relativePath: entry.relativePaths[index]!,
      afterText: entry.afterTexts[index]!,
      prepared,
    }),
  );
  const view = Object.freeze({
    reviewId,
    order: Object.freeze(order),
    boundReasoning: entry.boundReasoning,
    brainReceipt: entry.brainReceipt,
  });
  const review = Object.freeze({
    reviewId,
    view,
  }) as MutationReview;
  reviewRegistry.set(review, { sessionId, ...entry });
  return review;
}

export function lookupMutationReview(
  review: MutationReview,
  sessionId: string,
): ReviewEntry | undefined {
  const entry = reviewRegistry.get(review);
  if (entry === undefined || entry.sessionId !== sessionId) {
    return undefined;
  }
  return entry;
}

export function registerValidationReview(
  sessionId: string,
  entry: Omit<ValidationReviewEntry, "sessionId">,
): MutationValidationReview {
  const reviewId = nextReviewId();
  const view = Object.freeze({
    reviewId,
    preparedPlan: entry.plan,
    postEditSnapshot: entry.snapshot,
    postEditCatalog: entry.catalog,
    claimCheckAssignments: entry.assignments,
    mutationArtifacts: entry.mutationArtifacts,
    afterByteComparisons: entry.afterByteComparisons,
  });
  const review = Object.freeze({
    reviewId,
    view,
  }) as MutationValidationReview;
  validationReviewRegistry.set(review, { sessionId, ...entry });
  return review;
}

export function lookupValidationReview(
  review: MutationValidationReview,
  sessionId: string,
): ValidationReviewEntry | undefined {
  const entry = validationReviewRegistry.get(review);
  if (entry === undefined || entry.sessionId !== sessionId) {
    return undefined;
  }
  return entry;
}

/** Test-only: weaken prepared association for P1 falsification. */
export function __testOnly_rebindReviewPrepared(
  review: MutationReview,
  preparedInOrder: readonly PreparedChange[],
): void {
  const entry = reviewRegistry.get(review);
  if (entry === undefined) {
    return;
  }
  reviewRegistry.set(review, { ...entry, preparedInOrder });
}

/** Test-only: mark after-byte comparisons as matching without checking (P2). */
export function __testOnly_forceAfterByteMatchFlag(): {
  bypass: boolean;
} {
  return { bypass: true };
}
