/**
 * Safe cycle telemetry summary — allowlisted fields only.
 */

import type { CycleRecord, CycleSummary } from "./types.js";

export function summarizeEngineeringCycle(record: CycleRecord): CycleSummary {
  return Object.freeze({
    schemaVersion: record.schemaVersion,
    cycleId: record.cycleId,
    callerCorrelationId: record.callerCorrelationId,
    mode: record.mode,
    terminalState: record.terminalState,
    originCode: record.originCode,
    brainAttemptCount: record.brainAttemptCount,
    brainDispatchCount: record.brainDispatchCount,
    revisionCount: record.revisionCount,
    validationDisposition: record.validationDisposition,
    planId: record.planId,
    engineeringRunId: record.engineeringRunId,
    assessmentCorrelationId: record.assessmentCorrelationId,
    gate2Decision: record.gate2Decision,
    outstandingExecutionClaimIds: Object.freeze([
      ...record.outstandingExecutionClaimIds,
    ]),
    deferredContainsClaimIds: Object.freeze([
      ...record.deferredContainsClaimIds,
    ]),
    durationMs: record.durationMs,
    stopCause: record.stopCause,
  });
}
