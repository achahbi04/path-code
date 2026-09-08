/**
 * Internal one-shot recovery authorization handoff — performs no I/O.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import type {
  RecoveryAuthorization,
  RecoveryCommitGrant,
  RecoveryFailure,
  RecoveryReview,
} from "../types.js";
import {
  lookupRecoveryAuthorizationEntry,
  markRecoveryAuthorizationConsumed,
} from "./registry.js";

function consumeFailure(
  code: RecoveryFailure["code"],
  message: string,
): RecoveryFailure {
  return { code, message };
}

export function consumeRecoveryAuthorization(
  authorization: RecoveryAuthorization,
  review: RecoveryReview,
): Result<RecoveryCommitGrant, RecoveryFailure> {
  const entry = lookupRecoveryAuthorizationEntry(authorization);
  if (entry === undefined) {
    return failure(
      consumeFailure(
        "AUTHORIZATION_NOT_REGISTERED",
        "RecoveryAuthorization is not registered or was reconstructed",
      ),
    );
  }
  if (entry.consumed) {
    return failure(
      consumeFailure(
        "AUTHORIZATION_ALREADY_CONSUMED",
        "RecoveryAuthorization has already been consumed",
      ),
    );
  }
  if (entry.reviewRef !== review || authorization.reviewId !== review.reviewId) {
    return failure(
      consumeFailure(
        "AUTHORIZATION_REVIEW_MISMATCH",
        "RecoveryAuthorization is not bound to this review identity",
      ),
    );
  }

  markRecoveryAuthorizationConsumed(authorization);
  return success(
    Object.freeze({
      authorization,
      reviewRef: review,
    }) as unknown as RecoveryCommitGrant,
  );
}
