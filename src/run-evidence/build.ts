/**
 * Assemble immutable Run Evidence from a registered Validation result.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import type { WorkspaceBoundary } from "../domain/workspace.js";
import type { LocalProcessResult } from "../execution/types.js";
import { resolveRegisteredValidationBinding } from "../validation/index.js";
import type {
  PreparedValidationPlan,
  ValidationCheckResult,
  ValidationPlanResult,
} from "../validation/types.js";
import { nextEvidenceId, registerRunEvidence } from "./internal/registry.js";
import {
  RUN_EVIDENCE_SCHEMA_VERSION,
  type RunEvidenceBuildFailure,
  type RunEvidenceCheckRow,
  type RunEvidenceCounts,
  type RunEvidenceProcessSummary,
  type RunEvidenceRecord,
} from "./types.js";

const LIMITATIONS: readonly string[] = Object.freeze([
  "DECLARED_OBSERVED_INPUTS scope only — not a full repository seal",
  "Exit 0 does not prove product correctness, test discovery, or coverage",
  "Unobserved files, external services, and undeclared inputs remain outside assurance",
  "Historical record is not current applicability; use checkRunEvidenceApplicability",
  "Summary/JSON copies are informational only and are not authenticated evidence",
]);

function buildFailure(
  code: RunEvidenceBuildFailure["code"],
  message: string,
): RunEvidenceBuildFailure {
  return { code, message };
}

function processSummary(
  processResult: LocalProcessResult | null,
): RunEvidenceProcessSummary {
  if (processResult === null) {
    return Object.freeze({
      present: false,
      resultId: null,
      outcome: null,
      exitCode: null,
      signal: null,
      timedOut: null,
      overflow: null,
      durationMs: null,
      stdoutComplete: null,
      stderrComplete: null,
      stdoutCapturedBytes: null,
      stderrCapturedBytes: null,
      stdoutTruncated: null,
      stderrTruncated: null,
      terminationNotConfirmed: null,
      descendantMayRemainAlive: null,
    });
  }
  return Object.freeze({
    present: true,
    resultId: processResult.resultId,
    outcome: processResult.outcome,
    exitCode: processResult.exitCode,
    signal: processResult.signal,
    timedOut: processResult.timedOut,
    overflow: processResult.overflow,
    durationMs: processResult.durationMs,
    stdoutComplete: processResult.stdout.complete,
    stderrComplete: processResult.stderr.complete,
    stdoutCapturedBytes: processResult.stdout.capturedBytes,
    stderrCapturedBytes: processResult.stderr.capturedBytes,
    stdoutTruncated: processResult.stdout.truncated,
    stderrTruncated: processResult.stderr.truncated,
    terminationNotConfirmed: processResult.cleanup.terminationNotConfirmed,
    descendantMayRemainAlive: processResult.cleanup.descendantMayRemainAlive,
  });
}

function toCheckRow(check: ValidationCheckResult): RunEvidenceCheckRow {
  return Object.freeze({
    checkId: check.checkId,
    kind: check.kind,
    verdict: check.verdict,
    refusalCode: check.refusalCode,
    refusalMessage: check.refusalMessage,
    subjectVerifiedBefore: check.subjectVerifiedBefore,
    subjectVerifiedAfter: check.subjectVerifiedAfter,
    process: processSummary(check.processResult),
  });
}

function deriveCounts(
  rows: readonly RunEvidenceCheckRow[],
): RunEvidenceCounts {
  let checksWithProcessResult = 0;
  let pass = 0;
  let fail = 0;
  let executionInconclusive = 0;
  let refused = 0;
  let notAttempted = 0;
  for (const row of rows) {
    if (row.process.present) {
      checksWithProcessResult += 1;
    }
    switch (row.verdict) {
      case "PASS":
        pass += 1;
        break;
      case "FAIL":
        fail += 1;
        break;
      case "EXECUTION_INCONCLUSIVE":
        executionInconclusive += 1;
        break;
      case "REFUSED":
        refused += 1;
        break;
      case "NOT_ATTEMPTED":
        notAttempted += 1;
        break;
      default: {
        const _exhaustive: never = row.verdict;
        void _exhaustive;
      }
    }
  }
  return Object.freeze({
    plannedChecks: rows.length,
    checksWithProcessResult,
    pass,
    fail,
    executionInconclusive,
    refused,
    notAttempted,
  });
}

export function buildRunEvidence(
  result: ValidationPlanResult,
  plan: PreparedValidationPlan,
  workspace: WorkspaceBoundary,
): Result<RunEvidenceRecord, RunEvidenceBuildFailure> {
  const binding = resolveRegisteredValidationBinding(result, plan);
  if (!binding.ok) {
    return failure(
      buildFailure(
        binding.error.code === "PLAN_MISMATCH"
          ? "PLAN_MISMATCH"
          : "RESULT_NOT_REGISTERED",
        binding.error.message,
      ),
    );
  }
  if (
    binding.value.plan.workspace !== workspace ||
    binding.value.result.workspaceRoot !== plan.workspaceRoot
  ) {
    return failure(
      buildFailure(
        "WORKSPACE_MISMATCH",
        "Result/plan workspace does not match caller workspace",
      ),
    );
  }

  const checkRows = Object.freeze(
    binding.value.result.checkResults.map(toCheckRow),
  );
  const processResults = new Map<string, LocalProcessResult | null>();
  for (const check of binding.value.result.checkResults) {
    processResults.set(check.checkId, check.processResult);
  }

  const declaredObservationPaths = Object.freeze(
    binding.value.plan.declaredObservations.map(
      (observation) => observation.entry.relativePath,
    ),
  );

  const evidence = Object.freeze({
    evidenceId: nextEvidenceId(),
    schemaVersion: RUN_EVIDENCE_SCHEMA_VERSION,
    planId: binding.value.plan.planId,
    validationResultId: binding.value.result.resultId,
    criterionId: binding.value.result.criterionId,
    scopeId: binding.value.result.scopeId,
    workspaceRoot: binding.value.result.workspaceRoot,
    snapshotGeneration: binding.value.result.snapshotGeneration,
    declaredObservationPaths,
    checkRows,
    counts: deriveCounts(checkRows),
    aggregateOutcome: binding.value.result.aggregateOutcome,
    planCriterionSatisfied: binding.value.result.planCriterionSatisfied,
    originalApplicabilityValid: binding.value.result.applicabilityValid,
    startedAtMs: binding.value.result.startedAtMs,
    finishedAtMs: binding.value.result.finishedAtMs,
    wallDurationMs: binding.value.result.wallDurationMs,
    accumulatedProcessDurationMs:
      binding.value.result.accumulatedProcessDurationMs,
    limitations: LIMITATIONS,
    assembledAtMs: Date.now(),
  }) as unknown as RunEvidenceRecord;

  registerRunEvidence(
    evidence,
    binding.value.plan,
    binding.value.result,
    processResults,
  );
  return success(evidence);
}
