/**
 * Phase 5D1 Engineering Brain — package-internal barrel.
 * Not exported from src/index.ts.
 */

export {
  BRAIN_RECEIPT_SCHEMA_VERSION,
  DEFAULT_MAX_DISPATCHES,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  HARD_MAX_DISPATCHES,
  HARD_MAX_OUTPUT_TOKENS,
  HARD_MAX_TIMEOUT_MS,
  MAX_CONTEXT_BLOCKS,
  MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES,
  MAX_ID_UTF8_BYTES,
  MAX_PREPARED_REQUEST_UTF8_BYTES,
  MAX_REFERENCE_DESCRIPTORS,
  MAX_REFS_PER_BLOCK,
  MAX_RELATIVE_PATH_UTF8_BYTES,
  MAX_RESPONSE_UTF8_BYTES,
  MAX_TASK_TEXT_UTF8_BYTES,
  MIN_MAX_DISPATCHES,
  REASONING_PROPOSAL_SCHEMA_VERSION,
  utf8ByteLength,
} from "./bounds.js";

export { createEngineeringBrain } from "./controller.js";
export { readMonotonicMs, readWallMs } from "./clock.js";
export {
  configurationFailure,
  invocationFailure,
  type BrainConfigurationFailure,
  type BrainConfigurationFailureCode,
  type BrainInvocationFailure,
  type BrainInvocationFailureCode,
} from "./failures.js";
export { summarizeBrainInvocation } from "./receipt.js";
export type {
  AdapterSettlementObservation,
  AdapterUsageReport,
  BrainContextBlock,
  BrainContextBlockRole,
  BrainContextPacket,
  BrainDescriptorView,
  BrainInvocationPurpose,
  BrainInvocationReceipt,
  BrainInvocationRequest,
  BrainInvocationSuccess,
  BrainInvocationSummary,
  BrainReferenceDescriptor,
  BrainReferenceEvidenceKind,
  BrainResponseProfile,
  EngineeringBrain,
  EngineeringBrainAdapter,
  EngineeringBrainAdapterDescriptor,
  EngineeringBrainAdapterInvoke,
  EngineeringBrainAdapterReply,
  EngineeringBrainCapabilities,
  EngineeringBrainNarrowingLimits,
  FrozenNormalizedAdapterPacket,
  UntrustedBrainResponse,
  UsageObservation,
} from "./types.js";
