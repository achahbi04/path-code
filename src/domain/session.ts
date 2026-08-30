/**
 * Data-only session state shape.
 * No persistence, resume, or serialization behavior in Phase 1B.
 */

import type { AuthorityDecision } from "./authority.js";
import type { EvidenceRecord, IsoTimestamp } from "./evidence.js";
import type { KnowledgeRecord } from "./knowledge.js";
import type { JsonValue } from "./json.js";

export type DecisionLogEntry = {
  readonly at: IsoTimestamp;
  readonly decision: AuthorityDecision;
  readonly subject: string;
  readonly detail: JsonValue;
};

export type SessionState = {
  readonly taskRef: string;
  readonly workspaceRef: string;
  readonly knowledge: readonly KnowledgeRecord[];
  readonly evidence: readonly EvidenceRecord[];
  readonly decisions: readonly DecisionLogEntry[];
};
