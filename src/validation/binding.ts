/**
 * Narrow read-only projection of Validation registry association.
 * Does not mint approvals, execute, reclassify, or mutate registry entries.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { lookupValidationResult } from "./internal/registry.js";
import type { PreparedValidationPlan, ValidationPlanResult } from "./types.js";

export type ValidationBindingFailureCode =
  | "RESULT_NOT_REGISTERED"
  | "PLAN_MISMATCH";

export type ValidationBindingFailure = {
  readonly code: ValidationBindingFailureCode;
  readonly message: string;
};

export type RegisteredValidationBinding = {
  readonly result: ValidationPlanResult;
  readonly plan: PreparedValidationPlan;
};

/**
 * Verify that `result` is the live registered object bound to `plan`.
 * Returns a read-only view of already recorded association only.
 */
export function resolveRegisteredValidationBinding(
  result: ValidationPlanResult,
  plan: PreparedValidationPlan,
): Result<RegisteredValidationBinding, ValidationBindingFailure> {
  const entry = lookupValidationResult(result);
  if (entry === undefined) {
    return failure({
      code: "RESULT_NOT_REGISTERED",
      message:
        "ValidationPlanResult is not registered or was reconstructed/copied",
    });
  }
  if (entry.planRef !== plan || entry.result !== result) {
    return failure({
      code: "PLAN_MISMATCH",
      message: "Result is not bound to the supplied plan",
    });
  }
  return success({ result: entry.result, plan: entry.planRef });
}
