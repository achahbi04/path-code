/**
 * Authorize a prepared validation plan using caller-supplied process approvals.
 * Validation never mints ExplicitLocalProcessApproval.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { authorizePreparedLocalProcess } from "../execution/index.js";
import type { LocalProcessAuthorization } from "../execution/types.js";
import {
  nextValidationAuthId,
  registerValidationAuthorization,
} from "./internal/registry.js";
import { isValidationExecutionDisabled } from "./policy.js";
import type {
  PreparedValidationPlan,
  ValidationApprovalMap,
  ValidationAuthorization,
  ValidationAuthorizationFailure,
} from "./types.js";

function authFailure(
  code: ValidationAuthorizationFailure["code"],
  message: string,
): ValidationAuthorizationFailure {
  return { code, message };
}

export async function authorizeValidationPlan(
  plan: PreparedValidationPlan,
  approvals: ValidationApprovalMap,
): Promise<Result<ValidationAuthorization, ValidationAuthorizationFailure>> {
  const processAuthorizations = new Map<string, LocalProcessAuthorization>();

  for (const check of plan.checks) {
    if (isValidationExecutionDisabled(check.kind, plan.config)) {
      return failure(
        authFailure(
          "ACTION_DISABLED",
          `Check ${check.id} is disabled by configuration`,
        ),
      );
    }
    const approval = approvals.get(check.id);
    if (approval === undefined) {
      return failure(
        authFailure(
          "APPROVAL_INCOMPLETE",
          `Missing explicit process approval for check ${check.id}`,
        ),
      );
    }
    if (
      approval === null ||
      typeof approval !== "object" ||
      approval.kind !== "EXPLICIT_LOCAL_PROCESS_APPROVAL"
    ) {
      return failure(
        authFailure(
          "APPROVAL_REQUIRED",
          `Invalid process approval for check ${check.id}`,
        ),
      );
    }

    const authorized = await authorizePreparedLocalProcess(
      check.preparedProcess,
      approval,
      plan.config,
    );
    if (!authorized.ok) {
      return failure(
        authFailure(
          "PROCESS_AUTHORIZE_FAILED",
          `Check ${check.id}: ${authorized.error.message}`,
        ),
      );
    }
    processAuthorizations.set(check.id, authorized.value);
  }

  if (processAuthorizations.size !== plan.checks.length) {
    return failure(
      authFailure("APPROVAL_INCOMPLETE", "Not all checks received process authorization"),
    );
  }

  const authorization = Object.freeze({
    authorizationId: nextValidationAuthId(),
    planRef: plan,
    processAuthorizations,
    issuedAtMs: Date.now(),
  }) as unknown as ValidationAuthorization;

  registerValidationAuthorization(authorization, plan);
  return success(authorization);
}
