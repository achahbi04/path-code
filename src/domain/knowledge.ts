/**
 * Knowledge state and provenance vocabulary.
 * Stale knowledge is not current knowledge.
 */

import type { JsonValue } from "./json.js";

export type KnowledgeState =
  | "KNOWN"
  | "UNKNOWN"
  | "INSPECTED"
  | "CHANGED"
  | "STALE"
  | "RE_READ_REQUIRED"
  | "VERIFIED"
  | "FAILED"
  | "PARTIALLY_VERIFIED";

export type Provenance = "PRE_EXISTING" | "PATH_CODE_MODIFIED";

/**
 * Binds a subject identifier to current knowledge state and provenance.
 */
export type KnowledgeRecord = {
  readonly subject: string;
  readonly state: KnowledgeState;
  readonly provenance: Provenance;
  /** Observation/context that produced the recorded state (JSON-safe). */
  readonly observation: JsonValue;
};

/**
 * Pure predicate: STALE and RE_READ_REQUIRED require re-reading before dependent use.
 */
export function requiresReRead(record: KnowledgeRecord): boolean {
  return record.state === "STALE" || record.state === "RE_READ_REQUIRED";
}
