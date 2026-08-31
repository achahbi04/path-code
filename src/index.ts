/**
 * Path Code package entrypoint.
 *
 * Phase 1A: runtime compatibility contract.
 * Phase 1B: core domain contracts.
 * Phase 1C: workspace + canonical path foundation.
 * Phase 1D: Git + workspace discovery.
 * Phase 1E: PATHCODE.md + configuration (load/represent only).
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
  type WorkspacePathFailure,
  type WorkspacePathFailureCode,
} from "./domain/index.js";

export { createWorkspaceBoundary } from "./workspace/index.js";

export {
  discoverGitRepository,
  type GitDiscoveryFailure,
  type GitDiscoveryFailureCode,
  type GitRepository,
} from "./git/index.js";

export {
  loadProjectConfig,
  type ConfigFailure,
  type ConfigFailureCode,
  type ProjectConfig,
  type ProjectConfigSource,
  type ProjectRestrictions,
  type RepositoryGuidance,
  type RepositoryGuidanceTrust,
  type UnknownDirective,
} from "./config/index.js";
