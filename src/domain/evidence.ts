/**
 * Evidence and validation outcome contracts.
 * Claims require evidence. Evidence is recorded outside model narrative.
 */

import type { JsonValue } from "./json.js";
import type { Provenance } from "./knowledge.js";

/** Explicit ISO-8601 UTC timestamp string (e.g. `2026-08-30T19:57:00.000Z`). */
export type IsoTimestamp = string;

export type EvidenceKind =
  | "TOOL_CALL"
  | "FILE_HASH"
  | "BEFORE_AFTER_STATE"
  | "GIT_STATUS"
  | "GIT_DIFF"
  | "EXIT_CODE"
  | "STDOUT"
  | "STDERR"
  | "UNIT_TEST"
  | "INTEGRATION_TEST"
  | "TYPECHECK"
  | "LINT"
  | "BUILD"
  | "BROWSER_OBSERVATION"
  | "DATABASE_RESULT"
  | "MIGRATION_VERIFICATION"
  | "ENVIRONMENT_METADATA"
  | "CHECKPOINT"
  | "RECOVERY_ACTION";

export type EvidenceRecord = {
  readonly kind: EvidenceKind;
  readonly subject: string;
  readonly payload: JsonValue;
  readonly capturedAt: IsoTimestamp;
  readonly provenance: Provenance;
};

export type ValidationOutcome =
  | "PROVEN"
  | "PARTIALLY_VALIDATED"
  | "UNVERIFIED"
  | "FAILED"
  | "PREVIOUSLY_FAILING";
