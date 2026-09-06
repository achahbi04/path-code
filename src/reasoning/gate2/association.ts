/**
 * Owner-private association predicates for Gate 2.
 * Bypass probes target named exports below — not production DI.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import type { EngineeringRunRecord } from "../../engineering-run/types.js";
import type {
  PreparedValidationPlan,
  ValidationCheckResult,
  ValidationPlanResult,
} from "../../validation/types.js";
import { VALIDATION_CRITERION_ID } from "../../validation/bounds.js";
import { evidenceFailure, type ExecutionEvidenceFailure } from "./failures.js";
import type { ExecutionEvidencePlanRegistration } from "./registry.js";

/**
 * Require the Engineering Run's retained plan to be the exact prepared plan
 * frozen into the evidence plan registration (object identity).
 */
export function assertExactPreparedPlanAssociation(
  registration: ExecutionEvidencePlanRegistration,
  runPlan: PreparedValidationPlan,
): Result<true, ExecutionEvidenceFailure> {
  if (runPlan !== registration.validationPlan) {
    return failure(
      evidenceFailure(
        "PLAN_RUN_MISMATCH",
        "Engineering Run is not bound to the evidence plan's prepared Validation plan",
      ),
    );
  }
  return success(true);
}

/**
 * Require inherited Validation criterion success for aggregate acceptance.
 * Does not recompute from exit codes or stdout.
 */
export function assertInheritedValidationSuccess(
  validationResult: ValidationPlanResult,
  requiredCheckIds: readonly string[],
): Result<true, ExecutionEvidenceFailure> {
  if (validationResult.criterionId !== VALIDATION_CRITERION_ID) {
    return failure(
      evidenceFailure(
        "UNSUPPORTED_CRITERION",
        "Validation criterion is not EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE",
      ),
    );
  }
  if (!validationResult.planCriterionSatisfied) {
    return failure(
      evidenceFailure(
        "CHECK_NOT_PASSED",
        "Inherited planCriterionSatisfied is false",
      ),
    );
  }

  const byId = new Map<string, ValidationCheckResult>();
  for (const row of validationResult.checkResults) {
    if (byId.has(row.checkId)) {
      return failure(
        evidenceFailure(
          "CHECK_NOT_PASSED",
          "Duplicate check result rows cannot establish acceptance",
        ),
      );
    }
    byId.set(row.checkId, row);
  }

  for (const checkId of requiredCheckIds) {
    const row = byId.get(checkId);
    if (row === undefined) {
      return failure(
        evidenceFailure(
          "CHECK_NOT_PASSED",
          "Required plan check is absent from Validation result",
        ),
      );
    }
    if (row.verdict !== "PASS") {
      return failure(
        evidenceFailure(
          "CHECK_NOT_PASSED",
          "Required plan check did not PASS under inherited Validation criterion",
        ),
      );
    }
  }

  return success(true);
}

/**
 * Compare ordered check IDs/kinds and prepared-process identity between
 * the evidence plan's frozen checks and the authentic Validation result rows.
 */
export function assertOrderedCheckAndRequestAssociation(
  registration: ExecutionEvidencePlanRegistration,
  validationResult: ValidationPlanResult,
): Result<true, ExecutionEvidenceFailure> {
  const expected = registration.orderedChecks;
  const actual = validationResult.checkResults;
  if (actual.length !== expected.length) {
    return failure(
      evidenceFailure(
        "PLAN_RUN_MISMATCH",
        "Validation result check count does not match prepared plan",
      ),
    );
  }
  for (let i = 0; i < expected.length; i += 1) {
    const exp = expected[i]!;
    const row = actual[i]!;
    if (row.checkId !== exp.id || row.kind !== exp.kind) {
      return failure(
        evidenceFailure(
          "PLAN_RUN_MISMATCH",
          "Ordered check ID/kind association does not match prepared plan",
        ),
      );
    }
  }
  return success(true);
}

/**
 * Confirm run object still embeds the authentic Validation result identity.
 */
export function assertRunEmbedsAuthenticResult(
  run: EngineeringRunRecord,
  validationResult: ValidationPlanResult,
): Result<true, ExecutionEvidenceFailure> {
  if (run.validationResult !== validationResult) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "Engineering Run does not embed the authentic ValidationPlanResult",
      ),
    );
  }
  return success(true);
}
