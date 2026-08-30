/**
 * Public Path Code domain contracts.
 * Side-effect free. Contracts only — no capability behavior.
 */

export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
} from "./json.js";
export { isJsonValue } from "./json.js";

export type { Failure, Result, Success } from "./result.js";
export { failure, success } from "./result.js";

export type {
  KnowledgeRecord,
  KnowledgeState,
  Provenance,
} from "./knowledge.js";
export { requiresReRead } from "./knowledge.js";

export type {
  EvidenceKind,
  EvidenceRecord,
  IsoTimestamp,
  ValidationOutcome,
} from "./evidence.js";

export type {
  ActionClass,
  AuthorityDecision,
  RiskClassification,
  RiskLevel,
} from "./authority.js";

export type { PolicyActionContext, PolicyContract } from "./policy.js";

export type {
  ModelCapabilityDescriptor,
  ModelMessage,
  ModelMessageRole,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelToolCallProposal,
  ModelToolDescriptor,
} from "./provider.js";

export type {
  RecoveryExpectation,
  ToolDescriptor,
  ToolInvocation,
  ToolResult,
} from "./tool.js";

export type {
  CanonicalPath,
  WorkspaceBoundary,
  WorkspacePathFailure,
  WorkspacePathFailureCode,
} from "./workspace.js";

export type {
  Diagnosis,
  FailureCode,
  FailureRecord,
  RetryAuthorization,
  RetryBudget,
  RetryRequest,
  StopCondition,
} from "./failure.js";

export type { CompletionReport } from "./completion.js";

export type { DecisionLogEntry, SessionState } from "./session.js";
