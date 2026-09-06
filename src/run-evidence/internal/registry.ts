/**
 * In-memory Run Evidence registry — authenticates assembled records.
 */

import type {
  PreparedValidationPlan,
  ValidationPlanResult,
} from "../../validation/types.js";
import type { LocalProcessResult } from "../../execution/types.js";
import type { RunEvidenceAssociation, RunEvidenceRecord } from "../types.js";

type Entry = {
  readonly association: RunEvidenceAssociation;
};

const registry = new WeakMap<RunEvidenceRecord, Entry>();
let evidenceCounter = 0;

export function nextEvidenceId(): string {
  evidenceCounter += 1;
  return `run-evidence-${evidenceCounter}`;
}

export function registerRunEvidence(
  evidence: RunEvidenceRecord,
  plan: PreparedValidationPlan,
  result: ValidationPlanResult,
  processResults: ReadonlyMap<string, LocalProcessResult | null>,
): void {
  registry.set(evidence, {
    association: { evidence, plan, result, processResults },
  });
}

export function lookupRunEvidence(
  evidence: RunEvidenceRecord,
): RunEvidenceAssociation | undefined {
  return registry.get(evidence)?.association;
}

/** Test-only. */
export function resetRunEvidenceRegistryForTests(): void {
  evidenceCounter = 0;
}
