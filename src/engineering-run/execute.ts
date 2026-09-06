/**
 * Compose Validation execution + Run Evidence into one Engineering Run.
 *
 * No approval minting, no spawn, no second classifier.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import { buildRunEvidence } from "../run-evidence/index.js";
import { executeValidationPlan } from "../validation/index.js";
import type {
  PreparedValidationPlan,
  ValidationAuthorization,
} from "../validation/types.js";
import {
  nextEngineeringRunId,
  registerEngineeringRun,
} from "./internal/registry.js";
import {
  ENGINEERING_RUN_SCHEMA_VERSION,
  type EngineeringRunFailure,
  type EngineeringRunRecord,
} from "./types.js";

const LIMITATIONS: readonly string[] = Object.freeze([
  "Engineering Run is composition over Validation + Run Evidence — not a new authority",
  "Historical record is not current applicability; use checkEngineeringRunApplicability",
  "Summary/JSON copies are informational only and are not authenticated Engineering Runs",
  "Does not implement Reasoning Ledger, providers, persistence, or autonomous repair",
  "DECLARED_OBSERVED_INPUTS scope only — not a full repository seal",
]);

function runFailure(
  code: EngineeringRunFailure["code"],
  message: string,
  causeCode?: string,
): EngineeringRunFailure {
  return causeCode === undefined
    ? { code, message }
    : { code, message, causeCode };
}

/**
 * Execute an authentic prepared Validation plan under its authentic
 * Validation authorization, assemble Run Evidence, and return one immutable
 * EngineeringRunRecord.
 *
 * A Validation plan that completes with FAIL/INCONCLUSIVE/NOT_ATTEMPTED is a
 * completed Engineering Run with historical failure preserved — not an
 * infrastructure failure.
 */
export async function executeEngineeringRun(
  plan: PreparedValidationPlan,
  authorization: ValidationAuthorization,
): Promise<Result<EngineeringRunRecord, EngineeringRunFailure>> {
  if (authorization.planRef !== plan) {
    return failure(
      runFailure(
        "PLAN_IDENTITY_MISMATCH",
        "ValidationAuthorization is not bound to the supplied PreparedValidationPlan",
      ),
    );
  }

  const executed = await executeValidationPlan(plan, authorization);
  if (!executed.ok) {
    return failure(
      runFailure(
        "VALIDATION_EXECUTION_FAILED",
        executed.error.message,
        executed.error.code,
      ),
    );
  }

  const validationResult = executed.value;
  if (validationResult.planId !== plan.planId) {
    return failure(
      runFailure(
        "INTERNAL_INVARIANT",
        "ValidationPlanResult planId does not match prepared plan",
      ),
    );
  }

  const evidence = buildRunEvidence(
    validationResult,
    plan,
    plan.workspace,
  );
  if (!evidence.ok) {
    return failure(
      runFailure(
        "RUN_EVIDENCE_BUILD_FAILED",
        evidence.error.message,
        evidence.error.code,
      ),
    );
  }

  const runEvidence = evidence.value;
  if (runEvidence.validationResultId !== validationResult.resultId) {
    return failure(
      runFailure(
        "INTERNAL_INVARIANT",
        "Run Evidence validationResultId does not match Validation result",
      ),
    );
  }

  const run = Object.freeze({
    schemaVersion: ENGINEERING_RUN_SCHEMA_VERSION,
    engineeringRunId: nextEngineeringRunId(),
    planId: plan.planId,
    validationResultId: validationResult.resultId,
    runEvidenceId: runEvidence.evidenceId,
    criterionId: validationResult.criterionId,
    scopeId: validationResult.scopeId,
    workspaceRoot: validationResult.workspaceRoot,
    snapshotGeneration: validationResult.snapshotGeneration,
    declaredObservationPaths: Object.freeze([
      ...runEvidence.declaredObservationPaths,
    ]),
    aggregateOutcome: validationResult.aggregateOutcome,
    planCriterionSatisfied: validationResult.planCriterionSatisfied,
    counts: Object.freeze({ ...runEvidence.counts }),
    startedAtMs: validationResult.startedAtMs,
    finishedAtMs: validationResult.finishedAtMs,
    wallDurationMs: validationResult.wallDurationMs,
    accumulatedProcessDurationMs:
      validationResult.accumulatedProcessDurationMs,
    composedAtMs: Date.now(),
    limitations: LIMITATIONS,
    validationResult,
    runEvidence,
  }) as unknown as EngineeringRunRecord;

  registerEngineeringRun(run, plan, validationResult, runEvidence);
  return success(run);
}
