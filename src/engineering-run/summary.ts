/**
 * Informational allowlisted Engineering Run summary — not authority after copy/JSON.
 */

import { lookupEngineeringRun } from "./internal/registry.js";
import type { EngineeringRunRecord, EngineeringRunSummary } from "./types.js";

export function summarizeEngineeringRun(
  run: EngineeringRunRecord,
): EngineeringRunSummary | null {
  const association = lookupEngineeringRun(run);
  if (association === undefined || association.run !== run) {
    return null;
  }

  return Object.freeze({
    historicalInformationalOnly: true as const,
    notAuthority: true as const,
    schemaVersion: run.schemaVersion,
    engineeringRunId: run.engineeringRunId,
    planId: run.planId,
    validationResultId: run.validationResultId,
    runEvidenceId: run.runEvidenceId,
    criterionId: run.criterionId,
    scopeId: run.scopeId,
    snapshotGeneration: run.snapshotGeneration,
    declaredObservationPaths: Object.freeze([
      ...run.declaredObservationPaths,
    ]),
    checkCount: run.counts.plannedChecks,
    counts: Object.freeze({ ...run.counts }),
    aggregateOutcome: run.aggregateOutcome,
    planCriterionSatisfied: run.planCriterionSatisfied,
    wallDurationMs: run.wallDurationMs,
    accumulatedProcessDurationMs: run.accumulatedProcessDurationMs,
    limitations: Object.freeze([...run.limitations]),
  });
}
