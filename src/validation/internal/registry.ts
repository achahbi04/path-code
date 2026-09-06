/**
 * In-memory Validation plan/authorization/result registry.
 */

import type {
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationPlanResult,
} from "../types.js";

type AuthEntry = {
  readonly planRef: PreparedValidationPlan;
  consumed: boolean;
};

type ResultEntry = {
  readonly planRef: PreparedValidationPlan;
  readonly result: ValidationPlanResult;
};

type PlanEntry = {
  readonly plan: PreparedValidationPlan;
};

const planRegistry = new WeakMap<PreparedValidationPlan, PlanEntry>();
const authRegistry = new WeakMap<ValidationAuthorization, AuthEntry>();
const resultRegistry = new WeakMap<ValidationPlanResult, ResultEntry>();

let planCounter = 0;
let authCounter = 0;
let resultCounter = 0;

export function nextPlanId(): string {
  planCounter += 1;
  return `validation-plan-${planCounter}`;
}

export function nextValidationAuthId(): string {
  authCounter += 1;
  return `validation-auth-${authCounter}`;
}

export function nextValidationResultId(): string {
  resultCounter += 1;
  return `validation-result-${resultCounter}`;
}

export function registerPreparedValidationPlan(
  plan: PreparedValidationPlan,
): void {
  planRegistry.set(plan, { plan });
}

export function lookupPreparedValidationPlan(
  plan: PreparedValidationPlan,
): PlanEntry | undefined {
  return planRegistry.get(plan);
}

export function registerValidationAuthorization(
  authorization: ValidationAuthorization,
  planRef: PreparedValidationPlan,
): void {
  authRegistry.set(authorization, { planRef, consumed: false });
}

export function consumeValidationAuthorization(
  authorization: ValidationAuthorization,
  plan: PreparedValidationPlan,
): "ok" | "not_registered" | "already_consumed" | "plan_mismatch" {
  const entry = authRegistry.get(authorization);
  if (entry === undefined) {
    return "not_registered";
  }
  if (entry.consumed) {
    return "already_consumed";
  }
  if (entry.planRef !== plan || authorization.planRef !== plan) {
    return "plan_mismatch";
  }
  entry.consumed = true;
  return "ok";
}

export function registerValidationResult(
  result: ValidationPlanResult,
  planRef: PreparedValidationPlan,
): void {
  resultRegistry.set(result, { planRef, result });
}

export function lookupValidationResult(
  result: ValidationPlanResult,
): ResultEntry | undefined {
  return resultRegistry.get(result);
}

/** Test-only. */
export function resetValidationRegistryForTests(): void {
  planCounter = 0;
  authCounter = 0;
  resultCounter = 0;
}
