/**
 * Universal phaseAuditEvidence shape-consistency rule for ledger:verify.
 *
 * For every capability record:
 * - if phaseAuditEvidence is present, verified derivation MUST be PHASE_VERIFIED;
 * - if phaseAuditEvidence is absent, verified derivation MUST NOT be PHASE_VERIFIED.
 */

import type { CapabilityLedger } from "../../src/selfobs/capability-types.js";
import type { CapabilityObservation } from "../../src/selfobs/types.js";

export type PhaseAuditShapeFailure = Readonly<{
  readonly capabilityId: string;
  readonly message: string;
}>;

export function checkPhaseAuditEvidenceShapeConsistency(
  capabilityLedger: CapabilityLedger,
  observations: readonly CapabilityObservation[],
): readonly PhaseAuditShapeFailure[] {
  const failures: PhaseAuditShapeFailure[] = [];
  for (const record of capabilityLedger.records) {
    const observation = observations.find(
      (o) => o.capabilityId === record.capabilityId,
    );
    if (observation === undefined) {
      failures.push({
        capabilityId: record.capabilityId,
        message: `missing observation for capability ${record.capabilityId}`,
      });
      continue;
    }
    if (observation.kind !== "VERIFIED_CAPABILITY_STATE") {
      failures.push({
        capabilityId: record.capabilityId,
        message: `expected VERIFIED_CAPABILITY_STATE, got ${observation.kind}`,
      });
      continue;
    }
    const hasPhaseAudit = record.phaseAuditEvidence !== undefined;
    if (hasPhaseAudit && observation.state !== "PHASE_VERIFIED") {
      failures.push({
        capabilityId: record.capabilityId,
        message: `phaseAuditEvidence present but derived state is ${observation.state}, not PHASE_VERIFIED`,
      });
    }
    if (!hasPhaseAudit && observation.state === "PHASE_VERIFIED") {
      failures.push({
        capabilityId: record.capabilityId,
        message:
          "phaseAuditEvidence absent but derived state is PHASE_VERIFIED",
      });
    }
  }
  return failures;
}
