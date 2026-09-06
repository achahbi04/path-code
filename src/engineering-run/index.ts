/**
 * Phase 4D Engineering Run — internal Path Code composition surface.
 * Not exported from the package root.
 *
 * CompletionReport mapping: DEFERRED. Domain CompletionReport requires
 * EvidenceRecord payloads (stdout/stderr/etc.) that this composition
 * deliberately does not duplicate. Inventing incomplete EvidenceRecord
 * trees would overclaim. Future Phase 5 / CLI may map when a truthful
 * payload policy exists. See PHASE_4D implementation report.
 */

export { executeEngineeringRun } from "./execute.js";
export { checkEngineeringRunApplicability } from "./applicability.js";
export { summarizeEngineeringRun } from "./summary.js";
export { ENGINEERING_RUN_SCHEMA_VERSION } from "./types.js";

export type {
  EngineeringRunApplicabilityFailure,
  EngineeringRunApplicabilityFailureCode,
  EngineeringRunApplicabilityObservation,
  EngineeringRunFailure,
  EngineeringRunFailureCode,
  EngineeringRunRecord,
  EngineeringRunSchemaVersion,
  EngineeringRunSummary,
} from "./types.js";
