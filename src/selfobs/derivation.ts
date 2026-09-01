/**
 * Pure capability status derivation from ledger shape and verification outcomes.
 */

import type { CapabilityLedger, CapabilityRecord } from "./capability-types.js";
import type { LedgerVerification } from "./verification-types.js";
import { isLedgerVerificationBoundToLedgers } from "./verification-types.js";
import type { GapLedger } from "./gap-types.js";
import type {
  CapabilityObservation,
  CitationResolutionOutcome,
  DerivedCapabilityState,
} from "./types.js";

function citationKey(parts: readonly string[]): string {
  return parts.join("|");
}

function buildResolutionIndex(
  outcomes: readonly CitationResolutionOutcome[],
): Map<string, boolean> {
  const index = new Map<string, boolean>();
  for (const outcome of outcomes) {
    index.set(outcome.citationKey, outcome.resolved);
  }
  return index;
}

function isResolved(index: Map<string, boolean>, key: string): boolean {
  return index.get(key) === true;
}

function documentKey(path: string, atCommit: string): string {
  return citationKey(["document", path, atCommit]);
}

function moduleKey(path: string, atCommit: string): string {
  return citationKey(["module", path, atCommit]);
}

function deriveCandidateState(record: CapabilityRecord): DerivedCapabilityState {
  if (record.phaseAuditEvidence) {
    return "PHASE_VERIFIED";
  }
  if (record.freezeEvidence) {
    return "PASS_FROZEN";
  }
  if (record.implementationEvidence.length > 0) {
    return "IMPLEMENTED";
  }
  if (record.declarationEvidence.length > 0) {
    return "DECLARED";
  }
  return "DECLARED";
}

function declarationResolved(
  record: CapabilityRecord,
  index: Map<string, boolean>,
): boolean {
  if (record.declarationEvidence.length === 0) {
    return false;
  }
  return record.declarationEvidence.every((c) =>
    isResolved(index, documentKey(c.path, c.atCommit)),
  );
}

function implementationResolved(
  record: CapabilityRecord,
  index: Map<string, boolean>,
): boolean {
  if (record.implementationEvidence.length === 0) {
    return false;
  }
  return record.implementationEvidence.every((c) =>
    isResolved(index, moduleKey(c.path, c.atCommit)),
  );
}

function freezeResolved(
  record: CapabilityRecord,
  index: Map<string, boolean>,
): boolean {
  if (!record.freezeEvidence) {
    return false;
  }
  const key =
    record.freezeEvidence.kind === "sameCommit"
      ? citationKey([
          "freeze",
          record.freezeEvidence.kind,
          record.freezeEvidence.implementationCommit,
          record.freezeEvidence.reportPath,
        ])
      : citationKey([
          "freeze",
          record.freezeEvidence.kind,
          record.freezeEvidence.implementationCommit,
          record.freezeEvidence.evidenceCommit,
          record.freezeEvidence.reportPath,
        ]);
  return isResolved(index, key);
}

function phaseAuditResolved(
  record: CapabilityRecord,
  index: Map<string, boolean>,
): boolean {
  if (!record.phaseAuditEvidence) {
    return false;
  }
  const audit = record.phaseAuditEvidence;
  return (
    isResolved(
      index,
      citationKey(["phaseAudit", audit.auditReportPath, audit.auditCommit]),
    ) &&
    isResolved(
      index,
      citationKey(["phaseClosure", audit.closureDocumentPath, audit.closureCommit]),
    )
  );
}

function deriveVerifiedState(
  record: CapabilityRecord,
  index: Map<string, boolean>,
): DerivedCapabilityState {
  const declared = declarationResolved(record, index);
  const implemented = declared && implementationResolved(record, index);
  const frozen = implemented && freezeResolved(record, index);
  const phaseVerified = implemented && phaseAuditResolved(record, index);

  if (phaseVerified) {
    return "PHASE_VERIFIED";
  }
  if (frozen) {
    return "PASS_FROZEN";
  }
  if (implemented) {
    return "IMPLEMENTED";
  }
  if (declared) {
    return "DECLARED";
  }
  return "DECLARED";
}

export function deriveCapabilityObservation(
  record: CapabilityRecord,
  verification: LedgerVerification | undefined,
  capabilityLedger: CapabilityLedger,
  gapLedger: GapLedger,
): CapabilityObservation {
  const candidateState = deriveCandidateState(record);

  if (!verification) {
    return {
      kind: "UNVERIFIED_DERIVATION",
      capabilityId: record.capabilityId,
      candidateState,
    };
  }

  if (
    !isLedgerVerificationBoundToLedgers(
      verification,
      capabilityLedger,
      gapLedger,
    )
  ) {
    return {
      kind: "UNVERIFIED_DERIVATION",
      capabilityId: record.capabilityId,
      candidateState,
    };
  }

  const index = buildResolutionIndex(verification.citationOutcomes);
  const state = deriveVerifiedState(record, index);

  return {
    kind: "VERIFIED_CAPABILITY_STATE",
    capabilityId: record.capabilityId,
    state,
    verifiedAtHead: verification.verifiedAtHead,
  };
}

export function deriveAllCapabilityObservations(
  capabilityLedger: CapabilityLedger,
  gapLedger: GapLedger,
  verification: LedgerVerification | undefined,
): readonly CapabilityObservation[] {
  return capabilityLedger.records.map((record) =>
    deriveCapabilityObservation(record, verification, capabilityLedger, gapLedger),
  );
}

export function findCapabilityObservation(
  observations: readonly CapabilityObservation[],
  capabilityId: string,
): CapabilityObservation | undefined {
  return observations.find((o) => o.capabilityId === capabilityId);
}
