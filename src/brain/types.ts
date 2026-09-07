/**
 * Phase 5D1 Engineering Brain — types.
 * Application facade above ModelProvider; no action authority.
 */

import type { ModelToolCallProposal } from "../domain/provider.js";
import type {
  BRAIN_RECEIPT_SCHEMA_VERSION,
  ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION,
  REASONING_PROPOSAL_SCHEMA_VERSION,
} from "./bounds.js";

/**
 * Data-only reference descriptor projection for brain context packets.
 * Spelling matches Gate 1 `ReferenceEvidenceKind` without importing reasoning
 * into the brain runtime graph (keeps earlier-layer import bans intact).
 */
export type BrainReferenceEvidenceKind = "ENTRY" | "CONTENT" | "MANIFEST";

/** Data-only copy of a Gate 1 descriptor — not live catalog authority. */
export type BrainReferenceDescriptor = {
  readonly handle: string;
  readonly evidenceKind: BrainReferenceEvidenceKind;
  readonly relativePath?: string;
};

export type BrainContextBlockRole = "REFERENCE_MATERIAL" | "DIAGNOSTIC";

export type BrainContextBlock = {
  readonly blockId: string;
  readonly role: BrainContextBlockRole;
  readonly text: string;
  readonly referenceHandles: readonly string[];
};

export type BrainContextPacket = {
  readonly references: readonly BrainReferenceDescriptor[];
  readonly blocks: readonly BrainContextBlock[];
};

export type BrainInvocationPurpose =
  | "PROPOSE_REASONING"
  | "REVISE_REASONING"
  | "PROPOSE_EDIT";

export type BrainResponseProfile =
  | {
      readonly kind: "REASONING_PROPOSAL_JSON";
      readonly schemaVersion: typeof REASONING_PROPOSAL_SCHEMA_VERSION;
    }
  | {
      readonly kind: "ENGINEERING_EDIT_PROPOSAL_JSON";
      readonly schemaVersion: typeof ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION;
    };

export type BrainInvocationRequest = {
  readonly correlationId: string;
  readonly purpose: BrainInvocationPurpose;
  readonly taskText: string;
  readonly context: BrainContextPacket;
  readonly responseProfile?: BrainResponseProfile;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  readonly maxResponseUtf8Bytes?: number;
};

export type EngineeringBrainCapabilities = {
  readonly textInput: true;
  readonly textOutput: true;
  readonly acceptedResponseProfiles: readonly BrainResponseProfile[];
  readonly honorsOutputTokenLimit: boolean;
  readonly cancellationDeclared: boolean;
  readonly maxInputUtf8Bytes?: number;
  readonly maxOutputUtf8Bytes?: number;
  readonly maxOutputTokens?: number;
  readonly maxTimeoutMs?: number;
  readonly contextWindowTokens?: number;
  readonly nativeSchemaConstrainedGeneration?: boolean;
};

export type EngineeringBrainAdapterDescriptor = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: EngineeringBrainCapabilities;
};

export type EngineeringBrainNarrowingLimits = {
  readonly maxDispatches?: number;
  readonly maxTimeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxResponseUtf8Bytes?: number;
  readonly maxPreparedRequestUtf8Bytes?: number;
};

export type FrozenNormalizedAdapterPacket = {
  readonly invocationId: string;
  readonly correlationId: string;
  readonly purpose: BrainInvocationPurpose;
  readonly taskText: string;
  readonly context: {
    readonly references: readonly BrainReferenceDescriptor[];
    readonly blocks: readonly BrainContextBlock[];
  };
  readonly responseProfile: BrainResponseProfile;
  readonly maxOutputTokens: number;
  readonly maxResponseUtf8Bytes: number;
  readonly preparedRequestUtf8Bytes: number;
};

export type AdapterUsageReport = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheTokens?: number;
  readonly provenance: "PROVIDER_REPORTED" | "TEST_FIXTURE";
};

export type EngineeringBrainAdapterReply =
  | {
      readonly kind: "COMPLETE";
      readonly invocationId: string;
      readonly text: string;
      readonly toolCalls?: readonly ModelToolCallProposal[];
      readonly providerRequestId?: string;
      readonly providerReportedModelId?: string;
      readonly usage?: AdapterUsageReport;
    }
  | {
      readonly kind: "REFUSAL";
      readonly invocationId: string;
      readonly reasonCode?: string;
      readonly providerRequestId?: string;
      readonly providerReportedModelId?: string;
      readonly usage?: AdapterUsageReport;
    }
  | {
      readonly kind: "INCOMPLETE";
      readonly invocationId: string;
      readonly partialText?: string;
      readonly stopReason?: string;
      readonly providerRequestId?: string;
      readonly providerReportedModelId?: string;
      readonly usage?: AdapterUsageReport;
    }
  | {
      readonly kind: "FAILURE";
      readonly invocationId: string;
      readonly failureClass:
        | "AUTHENTICATION"
        | "RATE_LIMIT"
        | "UNAVAILABLE"
        | "TRANSPORT"
        | "OTHER";
      readonly retryAfterMs?: number;
      readonly providerRequestId?: string;
      readonly providerReportedModelId?: string;
      readonly usage?: AdapterUsageReport;
    };

export type EngineeringBrainAdapterInvoke = (
  packet: FrozenNormalizedAdapterPacket,
  control: {
    readonly signal: AbortSignal;
    readonly invocationId: string;
  },
) => Promise<EngineeringBrainAdapterReply>;

/**
 * Reviewed adapter selected by trusted composition.
 * REVIEWED CALLABLE SEAM: `invoke` — data + cancellation only.
 */
export type EngineeringBrainAdapter = {
  readonly descriptor: EngineeringBrainAdapterDescriptor;
  readonly invoke: EngineeringBrainAdapterInvoke;
};

export type UntrustedBrainResponse = {
  readonly meaning: "UNTRUSTED_RESPONSE_TEXT";
  readonly text: string;
  readonly responseProfile: BrainResponseProfile;
};

export type AdapterSettlementObservation =
  | { readonly status: "NOT_DISPATCHED" }
  | { readonly status: "PENDING" }
  | { readonly status: "SETTLED"; readonly settledAtWallMs: number };

export type UsageObservation =
  | { readonly availability: "UNKNOWN" }
  | { readonly availability: "INVALID"; readonly warning: string }
  | {
      readonly availability: "REPORTED";
      readonly provenance: "PROVIDER_REPORTED" | "TEST_FIXTURE";
      readonly inputTokens?: number;
      readonly outputTokens?: number;
      readonly cacheTokens?: number;
    };

export type BrainInvocationReceipt = {
  readonly schemaVersion: typeof BRAIN_RECEIPT_SCHEMA_VERSION;
  readonly invocationId: string | null;
  readonly correlationId: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly responseProfile: BrainResponseProfile | null;
  readonly purpose: BrainInvocationPurpose | null;
  readonly configuredMaxOutputTokens: number | null;
  readonly configuredTimeoutMs: number | null;
  readonly configuredMaxResponseUtf8Bytes: number | null;
  readonly preparedRequestUtf8Bytes: number | null;
  readonly responseUtf8Bytes: number | null;
  readonly startedAtWallMs: number;
  readonly finishedAtWallMs: number;
  readonly elapsedMs: number;
  readonly adapterDispatched: boolean;
  readonly attemptCount: 0 | 1;
  readonly budgetConsumed: 0 | 1;
  readonly outcome:
    | "SUCCESS"
    | "FAILURE";
  readonly failureCode: string | null;
  readonly abortRequested: boolean;
  readonly adapterSettlement: AdapterSettlementObservation;
  readonly usage: UsageObservation;
  readonly providerRequestId: string | null;
  readonly providerReportedModelId: string | null;
  readonly telemetryWarnings: readonly string[];
};

export type BrainInvocationSummary = {
  readonly schemaVersion: typeof BRAIN_RECEIPT_SCHEMA_VERSION;
  readonly invocationId: string | null;
  readonly correlationId: string | null;
  readonly providerId: string;
  readonly modelId: string;
  readonly outcome: "SUCCESS" | "FAILURE";
  readonly failureCode: string | null;
  readonly adapterDispatched: boolean;
  readonly attemptCount: 0 | 1;
  readonly budgetConsumed: 0 | 1;
  readonly elapsedMs: number;
  readonly abortRequested: boolean;
  readonly adapterSettlementStatus: AdapterSettlementObservation["status"];
  readonly usageAvailability: UsageObservation["availability"];
};

export type BrainInvocationSuccess = {
  readonly response: UntrustedBrainResponse;
  readonly receipt: BrainInvocationReceipt;
};

export type BrainDescriptorView = {
  readonly providerId: string;
  readonly modelId: string;
  readonly capabilities: EngineeringBrainCapabilities;
  readonly maxDispatches: number;
  readonly dispatchedCount: number;
  readonly disposed: boolean;
  readonly busy: boolean;
};

export type EngineeringBrain = {
  readonly invoke: (
    request: BrainInvocationRequest,
    options?: { readonly signal?: AbortSignal },
  ) => Promise<
    import("../domain/result.js").Result<
      BrainInvocationSuccess,
      import("./failures.js").BrainInvocationFailure
    >
  >;
  readonly dispose: () => void;
  readonly describe: () => BrainDescriptorView;
};
