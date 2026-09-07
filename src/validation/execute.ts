/**
 * Execute an authorized validation plan sequentially through Phase 4A.
 */

import { loadProjectConfig } from "../config/loader.js";
import type { ValidationOutcome } from "../domain/evidence.js";
import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { executeAuthorizedLocalProcess } from "../execution/index.js";
import { classifyLocalProcessForValidation } from "./classifier.js";
import {
  consumeValidationAuthorization,
  nextValidationResultId,
  registerValidationResult,
} from "./internal/registry.js";
import { isValidationExecutionDisabled } from "./policy.js";
import { verifyDeclaredInputsCurrent } from "./subject.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
  ValidationCheckResult,
  ValidationExecutionFailure,
  ValidationPlanResult,
} from "./types.js";

function execFailure(
  code: ValidationExecutionFailure["code"],
  message: string,
  authorizationConsumed?: boolean,
): ValidationExecutionFailure {
  if (authorizationConsumed === undefined) {
    return { code, message };
  }
  return { code, message, authorizationConsumed };
}

function aggregateOutcome(
  checks: readonly ValidationCheckResult[],
  planCriterionSatisfied: boolean,
): ValidationOutcome {
  if (planCriterionSatisfied) {
    return "PROVEN";
  }
  if (checks.some((item) => item.verdict === "FAIL")) {
    return "FAILED";
  }
  if (checks.some((item) => item.verdict === "PASS")) {
    return "PARTIALLY_VALIDATED";
  }
  if (checks.every((item) => item.verdict === "NOT_ATTEMPTED")) {
    return "UNVERIFIED";
  }
  return "UNVERIFIED";
}

export async function executeValidationPlan(
  plan: PreparedValidationPlan,
  authorization: ValidationAuthorization,
  options?: { readonly signal?: AbortSignal },
): Promise<Result<ValidationPlanResult, ValidationExecutionFailure>> {
  const signal = options?.signal;

  if (signal !== undefined && signal.aborted) {
    // Pre-aborted: do not consume authorization; report actual unused state.
    return failure(
      execFailure(
        "STOP_REQUESTED",
        "Validation execution refused before authorization consumption",
        false,
      ),
    );
  }

  const consumed = consumeValidationAuthorization(authorization, plan);
  if (consumed === "not_registered") {
    return failure(
      execFailure(
        "AUTHORIZATION_NOT_REGISTERED",
        "ValidationAuthorization is not registered or was reconstructed",
        false,
      ),
    );
  }
  if (consumed === "already_consumed") {
    return failure(
      execFailure(
        "AUTHORIZATION_ALREADY_CONSUMED",
        "ValidationAuthorization has already been consumed",
        false,
      ),
    );
  }
  if (consumed === "plan_mismatch") {
    return failure(
      execFailure(
        "PLAN_IDENTITY_MISMATCH",
        "ValidationAuthorization is not bound to this plan",
        false,
      ),
    );
  }

  const startedAtMs = Date.now();
  const checkResults: ValidationCheckResult[] = [];
  let stop = false;
  let stopReason: string | null = null;
  let accumulatedProcessDurationMs = 0;
  let applicabilityValid = true;

  for (const check of plan.checks) {
    if (stop) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "NOT_ATTEMPTED",
        processResult: null,
        refusalCode: null,
        refusalMessage: null,
        subjectVerifiedBefore: false,
        subjectVerifiedAfter: null,
      });
      continue;
    }

    if (signal !== undefined && signal.aborted) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "NOT_ATTEMPTED",
        processResult: null,
        refusalCode: "STOP_REQUESTED",
        refusalMessage: "Validation stop requested before check dispatch",
        subjectVerifiedBefore: false,
        subjectVerifiedAfter: null,
      });
      stop = true;
      stopReason = "STOP_REQUESTED";
      applicabilityValid = false;
      continue;
    }

    const reloaded = await loadProjectConfig(plan.workspace);
    if (!reloaded.ok) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "REFUSED",
        processResult: null,
        refusalCode: "CONFIG_UNREADABLE",
        refusalMessage: reloaded.error.message,
        subjectVerifiedBefore: false,
        subjectVerifiedAfter: null,
      });
      stop = true;
      applicabilityValid = false;
      continue;
    }
    if (isValidationExecutionDisabled(check.kind, reloaded.value)) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "REFUSED",
        processResult: null,
        refusalCode: "ACTION_DISABLED",
        refusalMessage: `Check ${check.id} disabled by current configuration`,
        subjectVerifiedBefore: false,
        subjectVerifiedAfter: null,
      });
      stop = true;
      applicabilityValid = false;
      continue;
    }

    const before = await verifyDeclaredInputsCurrent(
      plan.snapshot,
      plan.workspace,
      reloaded.value,
      plan.declaredEntries,
    );
    if (!before.ok) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "REFUSED",
        processResult: null,
        refusalCode: before.error.code,
        refusalMessage: before.error.message,
        subjectVerifiedBefore: false,
        subjectVerifiedAfter: null,
      });
      stop = true;
      applicabilityValid = false;
      continue;
    }

    // Recheck stop after awaited pre-dispatch work, before spawning.
    if (signal !== undefined && signal.aborted) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "NOT_ATTEMPTED",
        processResult: null,
        refusalCode: "STOP_REQUESTED",
        refusalMessage: "Validation stop requested before process dispatch",
        subjectVerifiedBefore: true,
        subjectVerifiedAfter: null,
      });
      stop = true;
      stopReason = "STOP_REQUESTED";
      applicabilityValid = false;
      continue;
    }

    const processAuth = authorization.processAuthorizations.get(check.id);
    if (processAuth === undefined) {
      return failure(
        execFailure(
          "PROCESS_EXECUTE_FAILED",
          `Missing process authorization for ${check.id}`,
          true,
        ),
      );
    }

    const executed = await executeAuthorizedLocalProcess(
      check.preparedProcess,
      processAuth,
    );
    if (!executed.ok) {
      checkResults.push({
        checkId: check.id,
        kind: check.kind,
        verdict: "REFUSED",
        processResult: null,
        refusalCode: executed.error.code,
        refusalMessage: executed.error.message,
        subjectVerifiedBefore: true,
        subjectVerifiedAfter: null,
      });
      stop = true;
      applicabilityValid = false;
      continue;
    }

    accumulatedProcessDurationMs += executed.value.durationMs;
    const verdict = classifyLocalProcessForValidation(executed.value);

    const after = await verifyDeclaredInputsCurrent(
      plan.snapshot,
      plan.workspace,
      reloaded.value,
      plan.declaredEntries,
    );
    const subjectVerifiedAfter = after.ok;
    if (!after.ok) {
      applicabilityValid = false;
    }

    checkResults.push({
      checkId: check.id,
      kind: check.kind,
      verdict,
      processResult: executed.value,
      refusalCode: null,
      refusalMessage: null,
      subjectVerifiedBefore: true,
      subjectVerifiedAfter,
    });

    if (verdict !== "PASS" || !after.ok) {
      stop = true;
    } else if (signal !== undefined && signal.aborted) {
      // Active command completed; do not dispatch later checks.
      stop = true;
      stopReason = "STOP_REQUESTED";
      applicabilityValid = false;
    }
  }

  // Silence unused when stopReason only set on signal path (kept for clarity).
  void stopReason;

  const planCriterionSatisfied =
    applicabilityValid &&
    checkResults.length === plan.checks.length &&
    checkResults.every((item) => item.verdict === "PASS") &&
    checkResults.every((item) => item.subjectVerifiedAfter === true);

  const finishedAtMs = Date.now();
  const result = Object.freeze({
    resultId: nextValidationResultId(),
    planId: plan.planId,
    criterionId: plan.criterionId,
    scopeId: plan.scopeId,
    workspaceRoot: plan.workspaceRoot,
    snapshotGeneration: plan.snapshot.generation,
    checkResults: Object.freeze([...checkResults]),
    aggregateOutcome: aggregateOutcome(checkResults, planCriterionSatisfied),
    planCriterionSatisfied,
    startedAtMs,
    finishedAtMs,
    wallDurationMs: finishedAtMs - startedAtMs,
    accumulatedProcessDurationMs,
    applicabilityValid,
  }) as unknown as ValidationPlanResult;

  registerValidationResult(result, plan);
  return success(result);
}
