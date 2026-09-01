/**
 * Pure bootstrap integrity checks for the canonical capability ledger.
 */

import type { CapabilityLedger, CapabilityRecord } from "./capability-types.js";
import {
  BOOTSTRAP_FORBIDDEN_CAPABILITY_IDS,
  BOOTSTRAP_FORBIDDEN_IMPLEMENTATION_PREFIX,
  BOOTSTRAP_FORBIDDEN_TITLE_PATTERNS,
} from "./capability-types.js";

export type BootstrapViolation = Readonly<{
  readonly code: string;
  readonly message: string;
}>;

export function checkBootstrapIntegrity(
  ledger: CapabilityLedger,
): readonly BootstrapViolation[] {
  const violations: BootstrapViolation[] = [];

  for (const record of ledger.records) {
    if (BOOTSTRAP_FORBIDDEN_CAPABILITY_IDS.has(record.capabilityId)) {
      violations.push({
        code: "BOOTSTRAP_SELF_RECORD",
        message: `Forbidden self-record capabilityId: ${record.capabilityId}`,
      });
    }

    for (const pattern of BOOTSTRAP_FORBIDDEN_TITLE_PATTERNS) {
      if (pattern.test(record.title)) {
        violations.push({
          code: "BOOTSTRAP_FORBIDDEN_TITLE",
          message: `Forbidden bootstrap title alias: ${record.capabilityId}`,
        });
      }
    }

    for (const moduleCitation of record.implementationEvidence) {
      if (moduleCitation.path.startsWith(BOOTSTRAP_FORBIDDEN_IMPLEMENTATION_PREFIX)) {
        violations.push({
          code: "BOOTSTRAP_SELF_IMPLEMENTATION",
          message: `${record.capabilityId} cites ${moduleCitation.path}`,
        });
      }
      if (
        moduleCitation.path.startsWith("scripts/") &&
        moduleCitation.path.includes("ledger-verify")
      ) {
        violations.push({
          code: "BOOTSTRAP_VERIFIER_CITATION",
          message: `${record.capabilityId} cites verifier script`,
        });
      }
    }
  }

  return violations;
}

export function findDuplicateCapabilityIds(
  records: readonly CapabilityRecord[],
): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const record of records) {
    if (seen.has(record.capabilityId)) {
      duplicates.push(record.capabilityId);
    }
    seen.add(record.capabilityId);
  }
  return duplicates;
}

export function findDependencyCycles(records: readonly CapabilityRecord[]): string[] {
  const byId = new Map(records.map((r) => [r.capabilityId, r]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[] = [];

  function visit(id: string, stack: string[]): void {
    if (visiting.has(id)) {
      cycles.push([...stack, id].join(" -> "));
      return;
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    const record = byId.get(id);
    if (record) {
      for (const dep of record.dependencies) {
        visit(dep, [...stack, id]);
      }
    }
    visiting.delete(id);
    visited.add(id);
  }

  for (const record of records) {
    visit(record.capabilityId, []);
  }
  return cycles;
}

export function findMissingDependencies(records: readonly CapabilityRecord[]): string[] {
  const ids = new Set(records.map((r) => r.capabilityId));
  const missing: string[] = [];
  for (const record of records) {
    for (const dep of record.dependencies) {
      if (!ids.has(dep)) {
        missing.push(`${record.capabilityId} -> ${dep}`);
      }
    }
  }
  return missing;
}

export function detectImpossibleProgression(
  record: CapabilityRecord,
): string | undefined {
  if (record.phaseAuditEvidence && !record.implementationEvidence.length) {
    return `${record.capabilityId}: phase audit without implementation evidence`;
  }
  if (record.phaseAuditEvidence && !record.declarationEvidence.length) {
    return `${record.capabilityId}: phase audit without declaration evidence`;
  }
  if (record.freezeEvidence && !record.implementationEvidence.length) {
    return `${record.capabilityId}: freeze evidence without implementation evidence`;
  }
  return undefined;
}
