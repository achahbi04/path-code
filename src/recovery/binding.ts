/**
 * Narrow read-only projection — non-consuming RecoveryAuthorization readiness.
 * Mints nothing, consumes nothing, rewrites no registry entry.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { lookupRecoveryAuthorizationEntry } from "./internal/registry.js";
import type {
  RecoveryAuthorization,
  RecoveryFailure,
  RecoveryReview,
} from "./types.js";

export type RecoveryAuthorizationCompatibility = {
  readonly unused: true;
  readonly reviewMatches: true;
  readonly authorizedEntryIds: readonly string[];
};

export function inspectRecoveryAuthorizationCompatibility(
  authorization: RecoveryAuthorization,
  review: RecoveryReview,
): Result<RecoveryAuthorizationCompatibility, RecoveryFailure> {
  const entry = lookupRecoveryAuthorizationEntry(authorization);
  if (entry === undefined) {
    return failure({
      code: "AUTHORIZATION_NOT_REGISTERED",
      message:
        "RecoveryAuthorization is not registered or was reconstructed from data",
    });
  }
  if (entry.consumed) {
    return failure({
      code: "AUTHORIZATION_ALREADY_CONSUMED",
      message: "RecoveryAuthorization has already been consumed",
    });
  }
  if (entry.reviewRef !== review || authorization.reviewId !== review.reviewId) {
    return failure({
      code: "AUTHORIZATION_REVIEW_MISMATCH",
      message: "RecoveryAuthorization is not bound to this review identity",
    });
  }
  return success({
    unused: true,
    reviewMatches: true,
    authorizedEntryIds: authorization.authorizedEntryIds,
  });
}
