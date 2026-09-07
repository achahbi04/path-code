/**
 * Narrow read-only projection of Validation registry association.
 * Does not mint approvals, execute, reclassify, or mutate registry entries.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { ContentObservation } from "../reader/types.js";
import type { RepositoryEntry } from "../inventory/types.js";
import type { PreparedLocalProcess } from "../execution/types.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { RepositorySnapshot } from "../snapshot/types.js";
import type { ResolvedProjectConfig } from "../config/types.js";
import {
  lookupPreparedValidationPlan,
  lookupValidationAuthorization,
  lookupValidationResult,
} from "./internal/registry.js";
import type {
  PreparedValidationCheck,
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationCheckKind,
  ValidationCriterionId,
  ValidationPlanResult,
  ValidationScopeId,
} from "./types.js";

export type ValidationBindingFailureCode =
  | "RESULT_NOT_REGISTERED"
  | "PLAN_NOT_REGISTERED"
  | "PLAN_MISMATCH"
  | "AUTHORIZATION_NOT_REGISTERED"
  | "AUTHORIZATION_ALREADY_CONSUMED"
  | "AUTHORIZATION_PLAN_MISMATCH";

export type ValidationBindingFailure = {
  readonly code: ValidationBindingFailureCode;
  readonly message: string;
};

export type RegisteredValidationBinding = {
  readonly result: ValidationPlanResult;
  readonly plan: PreparedValidationPlan;
};

export type PreparedCheckAssociation = {
  readonly id: string;
  readonly kind: ValidationCheckKind;
  readonly preparedProcess: PreparedLocalProcess;
};

/**
 * Read-only projection of already-retained plan fields.
 * Authenticity requires WeakMap registration from prepareValidationPlan.
 */
export type RegisteredPreparedValidationPlan = {
  readonly plan: PreparedValidationPlan;
  readonly planId: string;
  readonly checks: readonly PreparedCheckAssociation[];
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
  readonly config: ResolvedProjectConfig;
  readonly declaredObservations: readonly ContentObservation[];
  readonly declaredEntries: readonly RepositoryEntry[];
  readonly criterionId: ValidationCriterionId;
  readonly scopeId: ValidationScopeId;
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

/**
 * Authenticate a prepared Validation plan and project retained
 * check / subject / prepared-process association. Does not reconstruct
 * original LocalProcessRequest objects (not retained by the owner).
 */
export function resolveRegisteredPreparedValidationPlan(
  plan: PreparedValidationPlan,
): Result<RegisteredPreparedValidationPlan, ValidationBindingFailure> {
  const entry = lookupPreparedValidationPlan(plan);
  if (entry === undefined || entry.plan !== plan) {
    return failure({
      code: "PLAN_NOT_REGISTERED",
      message:
        "PreparedValidationPlan is not registered or was reconstructed/copied",
    });
  }
  const checks: PreparedCheckAssociation[] = entry.plan.checks.map(
    (check: PreparedValidationCheck) =>
      Object.freeze({
        id: check.id,
        kind: check.kind,
        preparedProcess: check.preparedProcess,
      }),
  );
  return success(
    Object.freeze({
      plan: entry.plan,
      planId: entry.plan.planId,
      checks: Object.freeze(checks),
      workspace: entry.plan.workspace,
      snapshot: entry.plan.snapshot,
      config: entry.plan.config,
      declaredObservations: entry.plan.declaredObservations,
      declaredEntries: entry.plan.declaredEntries,
      criterionId: entry.plan.criterionId,
      scopeId: entry.plan.scopeId,
    }),
  );
}

/**
 * Read-only compatibility check for an existing plan + authorization.
 * Reports unused status. Does not consume authorization, execute, or mint.
 */
export type ValidationPlanAuthorizationCompatibility = {
  readonly plan: PreparedValidationPlan;
  readonly authorization: ValidationAuthorization;
  readonly unused: true;
  readonly planId: string;
  readonly authorizationId: string;
  readonly checks: readonly PreparedCheckAssociation[];
  readonly workspace: WorkspaceBoundary;
  readonly snapshot: RepositorySnapshot;
};

export function inspectValidationPlanAuthorizationCompatibility(
  plan: PreparedValidationPlan,
  authorization: ValidationAuthorization,
): Result<
  ValidationPlanAuthorizationCompatibility,
  ValidationBindingFailure
> {
  const prepared = resolveRegisteredPreparedValidationPlan(plan);
  if (!prepared.ok) {
    return prepared;
  }
  const authEntry = lookupValidationAuthorization(authorization);
  if (authEntry === undefined) {
    return failure({
      code: "AUTHORIZATION_NOT_REGISTERED",
      message:
        "ValidationAuthorization is not registered or was reconstructed/copied",
    });
  }
  if (authEntry.consumed) {
    return failure({
      code: "AUTHORIZATION_ALREADY_CONSUMED",
      message: "ValidationAuthorization has already been consumed",
    });
  }
  if (
    authEntry.planRef !== plan ||
    authorization.planRef !== plan ||
    authEntry.planRef !== authorization.planRef
  ) {
    return failure({
      code: "AUTHORIZATION_PLAN_MISMATCH",
      message: "ValidationAuthorization is not bound to the supplied plan",
    });
  }
  return success(
    Object.freeze({
      plan: prepared.value.plan,
      authorization,
      unused: true as const,
      planId: prepared.value.planId,
      authorizationId: authorization.authorizationId,
      checks: prepared.value.checks,
      workspace: prepared.value.workspace,
      snapshot: prepared.value.snapshot,
    }),
  );
}
