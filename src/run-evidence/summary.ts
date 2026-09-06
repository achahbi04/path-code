/**
 * Informational allowlisted summary — not authority after copy/JSON.
 */

import { lookupRunEvidence } from "./internal/registry.js";
import type { RunEvidenceRecord, RunEvidenceSummary } from "./types.js";

export function summarizeRunEvidence(
  evidence: RunEvidenceRecord,
): RunEvidenceSummary | null {
  const association = lookupRunEvidence(evidence);
  if (association === undefined || association.evidence !== evidence) {
    return null;
  }

  return Object.freeze({
    historicalInformationalOnly: true as const,
    notAuthority: true as const,
    schemaVersion: evidence.schemaVersion,
    evidenceId: evidence.evidenceId,
    planId: evidence.planId,
    validationResultId: evidence.validationResultId,
    criterionId: evidence.criterionId,
    scopeId: evidence.scopeId,
    snapshotGeneration: evidence.snapshotGeneration,
    declaredObservationPaths: Object.freeze([
      ...evidence.declaredObservationPaths,
    ]),
    checkRows: Object.freeze(
      evidence.checkRows.map((row) =>
        Object.freeze({
          checkId: row.checkId,
          kind: row.kind,
          verdict: row.verdict,
          refusalCode: row.refusalCode,
          subjectVerifiedBefore: row.subjectVerifiedBefore,
          subjectVerifiedAfter: row.subjectVerifiedAfter,
          process: Object.freeze({ ...row.process }),
        }),
      ),
    ),
    counts: Object.freeze({ ...evidence.counts }),
    aggregateOutcome: evidence.aggregateOutcome,
    planCriterionSatisfied: evidence.planCriterionSatisfied,
    originalApplicabilityValid: evidence.originalApplicabilityValid,
    wallDurationMs: evidence.wallDurationMs,
    accumulatedProcessDurationMs: evidence.accumulatedProcessDurationMs,
    limitations: Object.freeze([...evidence.limitations]),
  });
}
