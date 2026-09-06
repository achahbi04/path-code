/**
 * Narrow read-only projection of Engineering Run registry association.
 * Does not execute, approve, reclassify, or mutate registry entries.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { RunEvidenceRecord } from "../run-evidence/types.js";
import type {
  PreparedValidationPlan,
  ValidationPlanResult,
} from "../validation/types.js";
import { lookupEngineeringRun } from "./internal/registry.js";
import type { EngineeringRunRecord } from "./types.js";

export type EngineeringRunBindingFailureCode =
  | "RUN_NOT_REGISTERED"
  | "ASSOCIATION_INVARIANT";

export type EngineeringRunBindingFailure = {
  readonly code: EngineeringRunBindingFailureCode;
  readonly message: string;
};

export type RegisteredEngineeringRunBinding = {
  readonly run: EngineeringRunRecord;
  readonly plan: PreparedValidationPlan;
  readonly validationResult: ValidationPlanResult;
  readonly runEvidence: RunEvidenceRecord;
};

/**
 * Authenticate an Engineering Run and project retained Validation /
 * Run Evidence / plan association. Read-only; no reconstruction.
 */
export function resolveRegisteredEngineeringRunBinding(
  run: EngineeringRunRecord,
): Result<RegisteredEngineeringRunBinding, EngineeringRunBindingFailure> {
  const association = lookupEngineeringRun(run);
  if (association === undefined || association.run !== run) {
    return failure({
      code: "RUN_NOT_REGISTERED",
      message:
        "EngineeringRunRecord is not registered or was reconstructed/copied",
    });
  }
  if (
    association.validationResult !== run.validationResult ||
    association.runEvidence !== run.runEvidence
  ) {
    return failure({
      code: "ASSOCIATION_INVARIANT",
      message:
        "Engineering Run does not retain authentic Validation/Run Evidence identity",
    });
  }
  return success({
    run: association.run,
    plan: association.plan,
    validationResult: association.validationResult,
    runEvidence: association.runEvidence,
  });
}
