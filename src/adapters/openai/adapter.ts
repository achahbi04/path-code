/**
 * Phase 5E1 — OpenAI Responses adapter constructor + composition.
 * Implements EngineeringBrainAdapter. No public transport override.
 */

import { failure, success, type Result } from "../../domain/result.js";
import { utf8ByteLength } from "../../brain/bounds.js";
import type {
  EngineeringBrainAdapter,
  EngineeringBrainAdapterReply,
  FrozenNormalizedAdapterPacket,
} from "../../brain/types.js";
import { OpenAIAdmissionBudget, resolveOpenAILimits } from "./budget.js";
import { buildOpenAIResponsesRequest } from "./request.js";
import { translateOpenAITransportResult } from "./response.js";
import {
  capturePlatformFetch,
  sendOpenAIResponsesRequest,
} from "./transport.js";
import {
  HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT,
  MAX_CREDENTIAL_UTF8_BYTES,
  MAX_MODEL_ID_UTF8_BYTES,
  OPENAI_PROVIDER_ID,
  OPENAI_RESPONSES_URL,
  type OpenAIAdapterConfigurationFailure,
  type OpenAIAdapterDiagnostics,
  type OpenAIAdapterNarrowingLimits,
  type OpenAIModelConfiguration,
  type OpenAIReasoningEffort,
} from "./types.js";

export type OpenAIAdapter = EngineeringBrainAdapter & {
  readonly describeOpenAIAdapter: () => OpenAIAdapterDiagnostics;
};

function isHeaderSafeCredential(value: string): boolean {
  if (value.length === 0) return false;
  const bytes = utf8ByteLength(value);
  if (bytes < 1 || bytes > MAX_CREDENTIAL_UTF8_BYTES) return false;
  // Printable ASCII without whitespace; no CR/LF/control.
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x21 || c > 0x7e) return false;
  }
  return true;
}

function isValidModelId(value: string): boolean {
  if (value.length === 0) return false;
  const bytes = utf8ByteLength(value);
  if (bytes < 1 || bytes > MAX_MODEL_ID_UTF8_BYTES) return false;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return false;
  }
  return true;
}

function configFail(
  code: OpenAIAdapterConfigurationFailure["code"],
  message: string,
): Result<OpenAIAdapter, OpenAIAdapterConfigurationFailure> {
  return failure({ code, message });
}

function mapAdmissionFailure(
  invocationId: string,
): EngineeringBrainAdapterReply {
  return {
    kind: "FAILURE",
    invocationId,
    failureClass: "OTHER",
  };
}

export function createOpenAIAdapter(
  modelConfiguration: OpenAIModelConfiguration,
  credential: string,
  narrowingLimits?: OpenAIAdapterNarrowingLimits,
): Result<OpenAIAdapter, OpenAIAdapterConfigurationFailure> {
  if (
    modelConfiguration === null ||
    typeof modelConfiguration !== "object" ||
    modelConfiguration.compatibleWithStructuredOutputs !== true
  ) {
    return configFail(
      "INVALID_CAPABILITY_DECLARATION",
      "model must declare compatibleWithStructuredOutputs: true",
    );
  }
  if (
    typeof modelConfiguration.modelId !== "string" ||
    !isValidModelId(modelConfiguration.modelId)
  ) {
    return configFail("INVALID_MODEL", "modelId is invalid");
  }
  if (typeof credential !== "string" || !isHeaderSafeCredential(credential)) {
    return configFail("INVALID_CREDENTIAL", "credential is invalid");
  }

  let reasoningEffort: OpenAIReasoningEffort | null = null;
  if (modelConfiguration.reasoningEffort !== undefined) {
    const e = modelConfiguration.reasoningEffort;
    if (e !== "low" && e !== "medium" && e !== "high") {
      return configFail(
        "UNSUPPORTED_REASONING_EFFORT",
        "reasoningEffort must be low|medium|high when set",
      );
    }
    reasoningEffort = e;
  }

  const modelCeiling =
    modelConfiguration.maxOutputTokensCeiling ?? HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT;
  const limits = resolveOpenAILimits(narrowingLimits, modelCeiling);
  if ("error" in limits) {
    return configFail("INVALID_LIMIT", limits.error);
  }

  // Capture selected configuration and method identities before any await.
  const frozenModelId = modelConfiguration.modelId;
  const frozenReasoning = reasoningEffort;
  const frozenLimits = Object.freeze({ ...limits });
  const frozenCredential = credential;
  let fetchImpl: ReturnType<typeof capturePlatformFetch>;
  try {
    fetchImpl = capturePlatformFetch();
  } catch {
    return configFail(
      "INVALID_CAPABILITY_DECLARATION",
      "platform network primitive is unavailable",
    );
  }

  const budget = new OpenAIAdmissionBudget(frozenLimits);
  let lastSafeHttpStatus: number | null = null;
  let lastSafeReasonCode: string | null = null;
  let lastProviderRequestId: string | null = null;
  let lastResponseEnvelopeBytes: number | null = null;
  let lastProposalTextUtf8Bytes: number | null = null;
  let knownUsageAttempts = 0;
  let unknownUsageAttempts = 0;
  let fetchStartedCount = 0;

  const descriptor = Object.freeze({
    providerId: OPENAI_PROVIDER_ID,
    modelId: frozenModelId,
    capabilities: Object.freeze({
      textInput: true as const,
      textOutput: true as const,
      acceptedResponseProfiles: Object.freeze([
        Object.freeze({
          kind: "REASONING_PROPOSAL_JSON" as const,
          schemaVersion: 1 as const,
        }),
        Object.freeze({
          kind: "ENGINEERING_EDIT_PROPOSAL_JSON" as const,
          schemaVersion: 1 as const,
        }),
        Object.freeze({
          kind: "ENGINEERING_SCOPE_PLAN_JSON" as const,
          schemaVersion: 1 as const,
        }),
      ]),
      honorsOutputTokenLimit: true,
      cancellationDeclared: true,
      maxOutputTokens: frozenLimits.maxOutputTokensPerAttempt,
      maxOutputUtf8Bytes: frozenLimits.maxProposalTextUtf8Bytes,
      nativeSchemaConstrainedGeneration: true,
    }),
  });

  const describeOpenAIAdapter = (): OpenAIAdapterDiagnostics =>
    Object.freeze({
      providerId: OPENAI_PROVIDER_ID,
      modelId: frozenModelId,
      profiles: Object.freeze([
        "REASONING_PROPOSAL_JSON",
        "ENGINEERING_EDIT_PROPOSAL_JSON",
        "ENGINEERING_SCOPE_PLAN_JSON",
      ] as const),
      endpoint: OPENAI_RESPONSES_URL,
      reasoningEffort: frozenReasoning,
      limits: Object.freeze({ ...frozenLimits }),
      budget: budget.snapshot(),
      lastSafeHttpStatus,
      lastSafeReasonCode,
      lastProviderRequestId,
      lastResponseEnvelopeBytes,
      lastProposalTextUtf8Bytes,
      knownUsageAttempts,
      unknownUsageAttempts,
      fetchStartedCount,
    });

  const invoke = async (
    packet: FrozenNormalizedAdapterPacket,
    control: { readonly signal: AbortSignal; readonly invocationId: string },
  ): Promise<EngineeringBrainAdapterReply> => {
    const invocationId = control.invocationId;

    if (control.signal.aborted) {
      lastSafeReasonCode = "ABORTED_PRE_RESERVE";
      return { kind: "FAILURE", invocationId, failureClass: "TRANSPORT" };
    }

    const built = buildOpenAIResponsesRequest(packet, {
      modelId: frozenModelId,
      maxOutputTokensCeiling: frozenLimits.maxOutputTokensPerAttempt,
      reasoningEffort: frozenReasoning,
    });
    if ("code" in built) {
      lastSafeReasonCode = built.code;
      return mapAdmissionFailure(invocationId);
    }

    const textCeiling = Math.min(
      frozenLimits.maxProposalTextUtf8Bytes,
      packet.maxResponseUtf8Bytes,
    );

    const admitted = budget.tryAdmit({
      bodyBytes: built.bodyBytes.byteLength,
      requestedMaxOutputTokens: packet.maxOutputTokens,
    });
    if ("code" in admitted) {
      lastSafeReasonCode = admitted.code;
      return mapAdmissionFailure(invocationId);
    }

    // Recheck abort at final network admission point — reservation is kept.
    if (control.signal.aborted) {
      lastSafeReasonCode = "ABORTED_POST_RESERVE";
      try {
        admitted.releaseSlot();
      } finally {
        // counters never refunded
      }
      return { kind: "FAILURE", invocationId, failureClass: "TRANSPORT" };
    }

    let settled = false;
    try {
      const outcome = await sendOpenAIResponsesRequest({
        bodyBytes: built.bodyBytes,
        credential: frozenCredential,
        signal: control.signal,
        maxResponseEnvelopeBytes: frozenLimits.maxResponseEnvelopeBytes,
        fetchImpl,
      });

      if (outcome.fetchStarted) {
        fetchStartedCount += 1;
      }
      if (outcome.kind === "HTTP") {
        lastResponseEnvelopeBytes = outcome.bodyBytes.byteLength;
      }

      // Check cancellation before returning usable text.
      if (control.signal.aborted && outcome.kind === "HTTP" && outcome.status === 200) {
        lastSafeReasonCode = "ABORTED_BEFORE_RETURN";
        return { kind: "FAILURE", invocationId, failureClass: "TRANSPORT" };
      }

      const translated = translateOpenAITransportResult(outcome, {
        invocationId,
        maxProposalTextUtf8Bytes: textCeiling,
        credentialCanary: frozenCredential,
        profileKind: built.profileKind,
      });

      lastSafeReasonCode = translated.diag.safeReasonCode;
      lastSafeHttpStatus = translated.diag.httpStatus;
      lastProposalTextUtf8Bytes = translated.proposalTextUtf8Bytes;
      if (
        translated.reply.providerRequestId !== undefined &&
        typeof translated.reply.providerRequestId === "string"
      ) {
        lastProviderRequestId = translated.reply.providerRequestId;
      }

      const usage = "usage" in translated.reply ? translated.reply.usage : undefined;
      if (usage === undefined) {
        unknownUsageAttempts += 1;
      } else if (
        usage.inputTokens !== undefined ||
        usage.outputTokens !== undefined ||
        usage.cacheTokens !== undefined
      ) {
        knownUsageAttempts += 1;
      } else {
        unknownUsageAttempts += 1;
      }

      return translated.reply;
    } catch {
      lastSafeReasonCode = "ADAPTER_INTERNAL_TRANSPORT";
      return { kind: "FAILURE", invocationId, failureClass: "TRANSPORT" };
    } finally {
      if (!settled) {
        settled = true;
        admitted.releaseSlot();
      }
    }
  };

  const adapter: OpenAIAdapter = {
    descriptor,
    invoke,
    describeOpenAIAdapter,
  };
  return success(adapter);
}
