/**
 * Phase 4C Run Evidence — internal Path Code surface.
 * Not exported from the package root.
 */

export { buildRunEvidence } from "./build.js";
export { checkRunEvidenceApplicability } from "./applicability.js";
export { summarizeRunEvidence } from "./summary.js";
export { RUN_EVIDENCE_SCHEMA_VERSION } from "./types.js";

export type {
  RunEvidenceApplicabilityFailure,
  RunEvidenceApplicabilityFailureCode,
  RunEvidenceApplicabilityObservation,
  RunEvidenceBuildFailure,
  RunEvidenceBuildFailureCode,
  RunEvidenceCheckRow,
  RunEvidenceCounts,
  RunEvidenceProcessSummary,
  RunEvidenceRecord,
  RunEvidenceSchemaVersion,
  RunEvidenceSummary,
} from "./types.js";
