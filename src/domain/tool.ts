/**
 * Tool description, invocation, and result contracts.
 * Capability adapters must pass through these shapes.
 * ToolResult requires evidence at the type level.
 */

import type { ActionClass, AuthorityDecision, RiskClassification } from "./authority.js";
import type { EvidenceRecord } from "./evidence.js";
import type { JsonObject, JsonValue } from "./json.js";
import type { Provenance } from "./knowledge.js";

export type RecoveryExpectation =
  | "NONE"
  | "CHECKPOINT"
  | "ROLLBACK_SUPPORTED"
  | "MANUAL";

export type ToolDescriptor = {
  readonly name: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
  readonly actionClass: ActionClass;
  readonly risk: RiskClassification;
  readonly recoveryExpectation: RecoveryExpectation;
};

/**
 * Invocation authority is supplied by the caller/policy, never by a model response.
 */
export type ToolInvocation = {
  readonly toolName: string;
  readonly input: JsonObject;
  readonly authority: AuthorityDecision;
};

export type ToolResult = {
  readonly toolName: string;
  readonly actionClass: ActionClass;
  readonly outcome: JsonValue;
  readonly evidence: readonly EvidenceRecord[];
  readonly provenance: Provenance;
};
