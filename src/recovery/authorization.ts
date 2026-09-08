/**
 * Phase 6A recovery authorization — the sole minting boundary.
 *
 * Only a host holding an `ExplicitRecoveryApproval` can mint a
 * `RecoveryAuthorization`, and only over entries the review itself classified
 * ELIGIBLE_RESTORE. The model and the Brain never reach this module: it is not
 * exported from the package root, and the authorization is a WeakMap-registered
 * one-shot object identity that cannot be reconstructed from data.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  lookupReview,
  nextRecoveryAuthorizationId,
  registerRecoveryAuthorization,
} from "./internal/registry.js";
import type {
  ExplicitRecoveryApproval,
  RecoveryAuthorization,
  RecoveryFailure,
  RecoveryReview,
} from "./types.js";

function authorizationFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

/** Host-only explicit approval token. */
export function explicitRecoveryApproval(): ExplicitRecoveryApproval {
  return Object.freeze({ kind: "EXPLICIT_RECOVERY_APPROVAL" as const });
}

export function authorizeRecoveryReview(
  review: RecoveryReview,
  selectedEligibleEntryIds: readonly string[],
  approval: ExplicitRecoveryApproval,
): Result<RecoveryAuthorization, RecoveryFailure> {
  if (
    typeof approval !== "object" ||
    approval === null ||
    approval.kind !== "EXPLICIT_RECOVERY_APPROVAL"
  ) {
    return failure(
      authorizationFailure(
        "APPROVAL_REQUIRED",
        "explicit recovery approval is required for authorization",
      ),
    );
  }

  const registered = lookupReview(review);
  if (registered === undefined) {
    return failure(
      authorizationFailure(
        "REVIEW_NOT_REGISTERED",
        "recovery review is not registered or was reconstructed",
      ),
    );
  }

  if (
    !Array.isArray(selectedEligibleEntryIds) ||
    selectedEligibleEntryIds.length === 0
  ) {
    return failure(
      authorizationFailure(
        "NO_ELIGIBLE_ENTRY_SELECTED",
        "at least one eligible entry must be selected for recovery",
      ),
    );
  }

  const selected = new Set<string>();
  for (const entryId of selectedEligibleEntryIds) {
    if (typeof entryId !== "string" || entryId.length === 0) {
      return failure(
        authorizationFailure(
          "ENTRY_NOT_ELIGIBLE",
          "selected recovery entry id is invalid",
        ),
      );
    }
    if (selected.has(entryId)) {
      return failure(
        authorizationFailure(
          "ENTRY_NOT_ELIGIBLE",
          `recovery entry '${entryId}' was selected more than once`,
        ),
      );
    }
    const entryView = review.view.entries.find(
      (candidate) => candidate.entryId === entryId,
    );
    if (entryView === undefined) {
      return failure(
        authorizationFailure(
          "ENTRY_NOT_ELIGIBLE",
          `recovery entry '${entryId}' is not part of this review`,
        ),
      );
    }
    if (entryView.disposition !== "ELIGIBLE_RESTORE") {
      return failure(
        authorizationFailure(
          "ENTRY_NOT_ELIGIBLE",
          `recovery entry '${entryId}' is ${entryView.disposition} and cannot be authorized`,
        ),
      );
    }
    selected.add(entryId);
  }

  const authorization = Object.freeze({
    authorizationId: nextRecoveryAuthorizationId(),
    reviewId: review.reviewId,
    checkpointId: review.view.checkpointId,
    authorizedEntryIds: Object.freeze([...selected]),
    issuedAtMs: Date.now(),
  }) as unknown as RecoveryAuthorization;

  registerRecoveryAuthorization(authorization, {
    reviewRef: review,
    authorizedEntryIds: selected,
    consumed: false,
  });
  return success(authorization);
}
