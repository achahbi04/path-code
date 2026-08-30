/**
 * Path Code package entrypoint.
 *
 * Phase 1A: runtime compatibility contract.
 * Phase 1B: core domain contracts.
 * No process side effects occur on import.
 */

export {
  MINIMUM_SUPPORTED_NODE_MAJOR,
  evaluateNodeVersion,
  isNodeVersionSupported,
  parseNodeVersion,
  type NodeVersionEvaluation,
  type ParsedNodeVersion,
} from "./core/runtime.js";

export {
  failure,
  isJsonValue,
  requiresReRead,
  success,
  type ActionClass,
  type AuthorityDecision,
  type CanonicalPath,
  type CompletionReport,
  type DecisionLogEntry,
  type Diagnosis,
  type EvidenceKind,
  type EvidenceRecord,
  type Failure,
  type FailureCode,
  type FailureRecord,
  type IsoTimestamp,
  type JsonArray,
  type JsonObject,
  type JsonPrimitive,
  type JsonValue,
  type KnowledgeRecord,
  type KnowledgeState,
  type ModelCapabilityDescriptor,
  type ModelMessage,
  type ModelMessageRole,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
  type ModelToolCallProposal,
  type ModelToolDescriptor,
  type PolicyActionContext,
  type PolicyContract,
  type Provenance,
  type RecoveryExpectation,
  type Result,
  type RetryAuthorization,
  type RetryBudget,
  type RetryRequest,
  type RiskClassification,
  type RiskLevel,
  type SessionState,
  type StopCondition,
  type Success,
  type ToolDescriptor,
  type ToolInvocation,
  type ToolResult,
  type ValidationOutcome,
  type WorkspaceBoundary,
} from "./domain/index.js";
