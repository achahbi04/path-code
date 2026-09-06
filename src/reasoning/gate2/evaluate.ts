/**
 * Evaluate authentic Engineering Run evidence against a frozen Gate 2 plan.
 * Does not execute, approve, edit, or retry.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import {
  checkEngineeringRunApplicability,
  resolveRegisteredEngineeringRunBinding,
} from "../../engineering-run/index.js";
import { checkReferenceBoundReasoningApplicability } from "../applicability.js";
import { requireLiveCatalog } from "../catalog.js";
import type { ReasoningApplicabilityFailure } from "../failures.js";
import { lookupBoundReasoning } from "../internal/registry.js";
import type { EngineeringRunCitation } from "../types.js";
import {
  assertExactPreparedPlanAssociation,
  assertInheritedValidationSuccess,
  assertOrderedCheckAndRequestAssociation,
  assertRunEmbedsAuthenticResult,
} from "./association.js";
import { evidenceFailure, type ExecutionEvidenceFailure } from "./failures.js";
import {
  lookupExecutionEvidencePlan,
  nextAssessmentCorrelationId,
  registerExecutionEvidenceAssessment,
} from "./registry.js";
import type {
  ClaimEvidenceStatus,
  ExecutionEvidenceAssessment,
  ExecutionEvidenceDecision,
  ExecutionEvidencePlan,
} from "./types.js";
import type { EngineeringRunRecord } from "../../engineering-run/types.js";

function formatReasoningApplicabilityFailure(
  error: ReasoningApplicabilityFailure,
): { message: string; causeCode: string } {
  if (error.kind === "REFUSAL") {
    return {
      message: error.refusal.reason,
      causeCode: error.refusal.code,
    };
  }
  return { message: error.message, causeCode: error.code };
}

function buildClaimStatuses(
  registration: NonNullable<ReturnType<typeof lookupExecutionEvidencePlan>>,
  validationOk: boolean,
): ClaimEvidenceStatus[] {
  return registration.assignments.map((assignment) =>
    Object.freeze({
      claimId: assignment.claimId,
      claimKind: assignment.claimKind,
      selectedCheckIds: assignment.selectedCheckIds,
      evidenceEstablished: validationOk,
    }),
  );
}

function selectedChecksPassed(
  registration: NonNullable<ReturnType<typeof lookupExecutionEvidencePlan>>,
  validationResult: {
    readonly checkResults: readonly {
      readonly checkId: string;
      readonly verdict: string;
    }[];
  },
): boolean {
  const byId = new Map(
    validationResult.checkResults.map((row) => [row.checkId, row]),
  );
  for (const assignment of registration.assignments) {
    for (const checkId of assignment.selectedCheckIds) {
      const row = byId.get(checkId);
      if (row === undefined || row.verdict !== "PASS") {
        return false;
      }
    }
  }
  return true;
}

/**
 * Assess a registered Engineering Run against an ExecutionEvidencePlan.
 */
export async function evaluateExecutionEvidence(
  plan: ExecutionEvidencePlan,
  engineeringRun: EngineeringRunRecord,
): Promise<Result<ExecutionEvidenceAssessment, ExecutionEvidenceFailure>> {
  const registration = lookupExecutionEvidencePlan(plan);
  if (registration === undefined || registration.plan !== plan) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "ExecutionEvidencePlan is not registered or was reconstructed/copied",
      ),
    );
  }

  const liveCatalog = requireLiveCatalog(registration.catalogHandle);
  if (!liveCatalog.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        liveCatalog.error.message,
        liveCatalog.error.code,
      ),
    );
  }
  const bound = lookupBoundReasoning(registration.reasoning);
  if (
    bound === undefined ||
    bound.reasoning !== registration.reasoning ||
    bound.catalog !== registration.catalog
  ) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "Bound reasoning is no longer registered with its catalog",
      ),
    );
  }

  const runBinding = resolveRegisteredEngineeringRunBinding(engineeringRun);
  if (!runBinding.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        runBinding.error.message,
        runBinding.error.code,
      ),
    );
  }

  const planAssociation = assertExactPreparedPlanAssociation(
    registration,
    runBinding.value.plan,
  );
  if (!planAssociation.ok) {
    return planAssociation;
  }

  const embed = assertRunEmbedsAuthenticResult(
    runBinding.value.run,
    runBinding.value.validationResult,
  );
  if (!embed.ok) {
    return embed;
  }

  if (
    runBinding.value.plan.workspace !== registration.validationPlan.workspace ||
    runBinding.value.plan.snapshot !== registration.validationPlan.snapshot
  ) {
    return failure(
      evidenceFailure(
        "CONTEXT_MISMATCH",
        "Run plan context does not match evidence plan Validation context",
      ),
    );
  }

  // Declared-input identity: plan retained observations must still be the run's plan observations.
  if (
    runBinding.value.plan.declaredObservations !==
    registration.declaredObservations
  ) {
    // Same plan object already enforced; array identity follows. Defensive check:
    if (
      runBinding.value.plan.declaredObservations.length !==
        registration.declaredObservations.length ||
      runBinding.value.plan.declaredObservations.some(
        (obs, index) => obs !== registration.declaredObservations[index],
      )
    ) {
      return failure(
        evidenceFailure(
          "CONTEXT_MISMATCH",
          "Declared observed inputs do not match the evidence plan association",
        ),
      );
    }
  }

  const ordered = assertOrderedCheckAndRequestAssociation(
    registration,
    runBinding.value.validationResult,
  );
  if (!ordered.ok) {
    return ordered;
  }

  // Prepared-process identity: each ordered check must retain the same preparedProcess.
  for (let i = 0; i < registration.orderedChecks.length; i += 1) {
    const retained = registration.orderedChecks[i]!;
    const planCheck = runBinding.value.plan.checks[i];
    if (
      planCheck === undefined ||
      planCheck.preparedProcess !== retained.preparedProcess ||
      planCheck.id !== retained.id ||
      planCheck.kind !== retained.kind
    ) {
      return failure(
        evidenceFailure(
          "PLAN_RUN_MISMATCH",
          "Prepared process / check definition association does not match",
        ),
      );
    }
  }

  const requiredCheckIds = registration.orderedChecks.map((c) => c.id);
  const inherited = assertInheritedValidationSuccess(
    runBinding.value.validationResult,
    requiredCheckIds,
  );

  const claimSelectedOk = selectedChecksPassed(
    registration,
    runBinding.value.validationResult,
  );

  const engApp = await checkEngineeringRunApplicability(
    runBinding.value.run,
    runBinding.value.plan,
    runBinding.value.plan.workspace,
  );
  if (!engApp.ok) {
    return failure(
      evidenceFailure(
        "APPLICABILITY_NOT_ESTABLISHED",
        engApp.error.message,
        engApp.error.code,
      ),
    );
  }

  const reasoningApp = await checkReferenceBoundReasoningApplicability(
    registration.reasoning,
    registration.catalogHandle,
  );
  if (!reasoningApp.ok) {
    const formatted = formatReasoningApplicabilityFailure(reasoningApp.error);
    return failure(
      evidenceFailure(
        "APPLICABILITY_NOT_ESTABLISHED",
        formatted.message,
        formatted.causeCode,
      ),
    );
  }

  // Recheck live registration after awaits.
  const stillPlan = lookupExecutionEvidencePlan(plan);
  if (stillPlan === undefined || stillPlan.plan !== plan) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "ExecutionEvidencePlan registration lost during evaluation",
      ),
    );
  }
  const stillCatalog = requireLiveCatalog(registration.catalogHandle);
  if (!stillCatalog.ok) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "Reference catalog disposed during evaluation",
        stillCatalog.error.code,
      ),
    );
  }
  const stillBound = lookupBoundReasoning(registration.reasoning);
  if (stillBound === undefined || stillBound.reasoning !== registration.reasoning) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "Bound reasoning registration lost during evaluation",
      ),
    );
  }
  const stillRun = resolveRegisteredEngineeringRunBinding(engineeringRun);
  if (!stillRun.ok || stillRun.value.run !== engineeringRun) {
    return failure(
      evidenceFailure(
        "UNREGISTERED_ARTIFACT",
        "Engineering Run registration lost during evaluation",
      ),
    );
  }

  const engApplicable = engApp.value.applicable === true;
  const reasoningApplicable = reasoningApp.value.applicable === true;
  const currentnessOk = engApplicable && reasoningApplicable;

  let decision: ExecutionEvidenceDecision = "EXECUTION_EVIDENCE_NOT_ESTABLISHED";
  let currentnessReasonCode: string | null = null;

  if (!currentnessOk) {
    currentnessReasonCode = !engApplicable
      ? engApp.value.code ?? "ENGINEERING_RUN_NOT_APPLICABLE"
      : "REASONING_NOT_APPLICABLE";
    decision = "EXECUTION_EVIDENCE_NOT_ESTABLISHED";
  } else if (!inherited.ok || !claimSelectedOk) {
    decision = "EXECUTION_EVIDENCE_NOT_ESTABLISHED";
  } else {
    decision = "EXECUTION_EVIDENCE_ACCEPTED";
  }

  // Invalid association already returned failures above. Inherited criterion mismatch
  // that is structural (unsupported criterion) remains a hard failure:
  if (
    !inherited.ok &&
    inherited.error.code === "UNSUPPORTED_CRITERION"
  ) {
    return inherited;
  }

  const validationOk =
    decision === "EXECUTION_EVIDENCE_ACCEPTED" && inherited.ok && claimSelectedOk;

  const claimStatuses = Object.freeze(
    buildClaimStatuses(registration, validationOk),
  );

  const citations: EngineeringRunCitation[] = registration.assignments.map(
    (assignment) =>
      Object.freeze({
        meaning: "CITED_RUN_ONLY" as const,
        claimId: assignment.claimId,
        run: runBinding.value.run,
        selectedCheckIds: assignment.selectedCheckIds,
      }),
  );

  const verdictMap = new Map<string, string>();
  for (const row of runBinding.value.validationResult.checkResults) {
    verdictMap.set(row.checkId, row.verdict);
  }

  const assessment = Object.freeze({
    assessmentCorrelationId: nextAssessmentCorrelationId(),
    evidencePlanCorrelationId: plan.planCorrelationId,
    engineeringRunId: runBinding.value.run.engineeringRunId,
    validationPlanId: registration.validationPlan.planId,
    decision,
    criterionId: runBinding.value.validationResult.criterionId,
    scopeId: runBinding.value.validationResult.scopeId,
    claimStatuses,
    assessedAtMs: Date.now(),
    currentnessApplicable: currentnessOk,
    currentnessReasonCode,
    outstandingNonExecutionClaimIds: registration.nonExecutionClaimIds,
    limitations: Object.freeze([
      "Configured-check evidence only; not semantic truth or action authority",
      "Non-EXECUTION claims remain REFERENCES_ONLY / deferred / observational",
      ...runBinding.value.run.limitations,
    ]),
  }) as unknown as ExecutionEvidenceAssessment;

  registerExecutionEvidenceAssessment(assessment, {
    assessment,
    planRegistration: registration,
    engineeringRun: runBinding.value.run,
    citations: Object.freeze(citations),
    originalPlanCriterionSatisfied:
      runBinding.value.validationResult.planCriterionSatisfied,
    originalCheckVerdicts: verdictMap,
  });

  return success(assessment);
}
