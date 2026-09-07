/**
 * Phase 5D2 Engineering Orchestrator — package-internal barrel.
 * Not exported from src/index.ts.
 */

export {
  CYCLE_RECORD_SCHEMA_VERSION,
  DEFAULT_BRAIN_ATTEMPT_TIMEOUT_MS,
  DEFAULT_CYCLE_ADMISSION_MS,
  DEFAULT_MAX_BRAIN_ATTEMPTS,
  MAX_CYCLE_ADMISSION_MS,
  MAX_DIAGNOSTIC_UTF8_BYTES,
  MAX_MAX_BRAIN_ATTEMPTS,
  MAX_RETAINED_ATTEMPT_RECORDS,
  MIN_CYCLE_ADMISSION_MS,
  MIN_MAX_BRAIN_ATTEMPTS,
  COORDINATOR_DIAGNOSTIC_BLOCK_ID,
} from "./bounds.js";

export {
  configurationFailure,
  cycleFailure,
  type CycleConfigurationFailure,
  type CycleConfigurationFailureCode,
  type CycleFailure,
  type CycleFailureCode,
  type CycleOriginCode,
  type CycleTerminalState,
} from "./failures.js";

export { openEngineeringCycle } from "./cycle.js";
export { summarizeEngineeringCycle } from "./summary.js";

export type {
  AttemptGate1Outcome,
  BindAndValidateSession,
  BindOnlySession,
  CycleArtifacts,
  CycleAttemptRecord,
  CycleControlPhase,
  CycleDescriptorView,
  CycleOutcome,
  CycleRecord,
  CycleSummary,
  EngineeringCycle,
  EngineeringCycleMode,
  EngineeringCycleOptions,
  EngineeringCycleSession,
  EngineeringCycleTask,
  OpenEngineeringCycleResult,
  ValidationDisposition,
} from "./types.js";
