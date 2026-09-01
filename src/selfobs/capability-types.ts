/**
 * Capability record types — no authoritative writable status field.
 */

import type {
  DocumentCitation,
  FreezeEvidence,
  GapCitation,
  ModuleCitation,
  ObligationCitation,
  PhaseAuditEvidence,
  RecordedFigure,
} from "./types.js";

export type CapabilityRecord = Readonly<{
  readonly capabilityId: string;
  readonly title: string;
  readonly phaseId: string;
  readonly declarationEvidence: readonly DocumentCitation[];
  readonly implementationEvidence: readonly ModuleCitation[];
  readonly freezeEvidence?: FreezeEvidence;
  readonly phaseAuditEvidence?: PhaseAuditEvidence;
  readonly proofObligations: readonly ObligationCitation[];
  readonly dependencies: readonly string[];
  readonly knownLimitations: readonly GapCitation[];
  readonly recordedFigures?: readonly RecordedFigure[];
}>;

export type CapabilityLedger = Readonly<{
  readonly revision: string;
  readonly records: readonly CapabilityRecord[];
}>;

export const MAX_CAPABILITIES = 64;
export const MAX_GAPS = 256;
export const MAX_TOTAL_CITATIONS = 2048;
export const MAX_EVIDENCE_DOCUMENT_BYTES = 2 * 1024 * 1024;

export const BOOTSTRAP_FORBIDDEN_CAPABILITY_IDS = new Set([
  "capability-ledger-v1",
  "gap-ledger-v1",
  "ledger-verify",
  "engineering-self-observation-runtime",
  "self-observation-foundation",
]);

export const BOOTSTRAP_FORBIDDEN_IMPLEMENTATION_PREFIX = "src/selfobs/";

export const BOOTSTRAP_FORBIDDEN_TITLE_PATTERNS = [
  /capability ledger/i,
  /gap ledger v1/i,
  /ledger:verify/i,
  /self-observation runtime foundation/i,
] as const;
