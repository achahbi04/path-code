/**
 * In-memory Engineering Run registry — authenticates composed records.
 */

import type { RunEvidenceRecord } from "../../run-evidence/types.js";
import type {
  PreparedValidationPlan,
  ValidationPlanResult,
} from "../../validation/types.js";
import type {
  EngineeringRunAssociation,
  EngineeringRunRecord,
} from "../types.js";

type Entry = {
  readonly association: EngineeringRunAssociation;
};

const registry = new WeakMap<EngineeringRunRecord, Entry>();
let runCounter = 0;

export function nextEngineeringRunId(): string {
  runCounter += 1;
  return `engineering-run-${runCounter}`;
}

export function registerEngineeringRun(
  run: EngineeringRunRecord,
  plan: PreparedValidationPlan,
  validationResult: ValidationPlanResult,
  runEvidence: RunEvidenceRecord,
): void {
  registry.set(run, {
    association: { run, plan, validationResult, runEvidence },
  });
}

export function lookupEngineeringRun(
  run: EngineeringRunRecord,
): EngineeringRunAssociation | undefined {
  return registry.get(run)?.association;
}

/** Test-only. */
export function resetEngineeringRunRegistryForTests(): void {
  runCounter = 0;
}
