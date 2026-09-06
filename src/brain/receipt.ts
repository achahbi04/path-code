/**
 * Phase 5D1 — immutable invocation receipts and safe summaries.
 * Telemetry only — not EvidenceRecord / CompletionReport / gate acceptance.
 */

import {
  BRAIN_RECEIPT_SCHEMA_VERSION,
  isSafeNonnegativeInt,
  isNonemptyBoundedId,
  MAX_ID_UTF8_BYTES,
  utf8ByteLength,
} from "./bounds.js";
import type {
  AdapterSettlementObservation,
  AdapterUsageReport,
  BrainInvocationPurpose,
  BrainInvocationReceipt,
  BrainInvocationSummary,
  BrainResponseProfile,
  UsageObservation,
} from "./types.js";

export type ReceiptDraft = {
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
  readonly startedMonoMs: number;
  readonly finishedMonoMs: number;
  readonly adapterDispatched: boolean;
  readonly attemptCount: 0 | 1;
  readonly budgetConsumed: 0 | 1;
  readonly outcome: "SUCCESS" | "FAILURE";
  readonly failureCode: string | null;
  readonly abortRequested: boolean;
  readonly adapterSettlement: AdapterSettlementObservation;
  readonly usage: UsageObservation;
  readonly providerRequestId: string | null;
  readonly providerReportedModelId: string | null;
  readonly telemetryWarnings: readonly string[];
};

function sanitizeOptionalId(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (!isNonemptyBoundedId(value)) {
    return null;
  }
  return value;
}

export function observeUsage(
  usage: AdapterUsageReport | undefined,
): { usage: UsageObservation; warnings: string[] } {
  if (usage === undefined) {
    return { usage: { availability: "UNKNOWN" }, warnings: [] };
  }
  const warnings: string[] = [];
  const check = (label: string, value: unknown): number | undefined => {
    if (value === undefined) {
      return undefined;
    }
    if (!isSafeNonnegativeInt(value)) {
      warnings.push(`invalid usage field '${label}'`);
      return undefined;
    }
    return value;
  };
  if (
    usage.provenance !== "PROVIDER_REPORTED" &&
    usage.provenance !== "TEST_FIXTURE"
  ) {
    return {
      usage: {
        availability: "INVALID",
        warning: "usage provenance is invalid",
      },
      warnings: ["usage provenance is invalid"],
    };
  }
  const inputTokens = check("inputTokens", usage.inputTokens);
  const outputTokens = check("outputTokens", usage.outputTokens);
  const cacheTokens = check("cacheTokens", usage.cacheTokens);
  if (warnings.length > 0) {
    return {
      usage: {
        availability: "INVALID",
        warning: warnings[0] ?? "invalid usage",
      },
      warnings,
    };
  }
  return {
    usage: {
      availability: "REPORTED",
      provenance: usage.provenance,
      ...(inputTokens !== undefined ? { inputTokens } : {}),
      ...(outputTokens !== undefined ? { outputTokens } : {}),
      ...(cacheTokens !== undefined ? { cacheTokens } : {}),
    },
    warnings: [],
  };
}

export function finalizeReceipt(draft: ReceiptDraft): BrainInvocationReceipt {
  const elapsedMs = Math.max(0, draft.finishedMonoMs - draft.startedMonoMs);
  const receipt: BrainInvocationReceipt = {
    schemaVersion: BRAIN_RECEIPT_SCHEMA_VERSION,
    invocationId: sanitizeOptionalId(draft.invocationId),
    correlationId: sanitizeOptionalId(draft.correlationId),
    providerId:
      utf8ByteLength(draft.providerId) <= MAX_ID_UTF8_BYTES
        ? draft.providerId
        : "invalid-provider-id",
    modelId:
      utf8ByteLength(draft.modelId) <= MAX_ID_UTF8_BYTES
        ? draft.modelId
        : "invalid-model-id",
    responseProfile: draft.responseProfile,
    purpose: draft.purpose,
    configuredMaxOutputTokens: draft.configuredMaxOutputTokens,
    configuredTimeoutMs: draft.configuredTimeoutMs,
    configuredMaxResponseUtf8Bytes: draft.configuredMaxResponseUtf8Bytes,
    preparedRequestUtf8Bytes: draft.preparedRequestUtf8Bytes,
    responseUtf8Bytes: draft.responseUtf8Bytes,
    startedAtWallMs: draft.startedAtWallMs,
    finishedAtWallMs: draft.finishedAtWallMs,
    elapsedMs,
    adapterDispatched: draft.adapterDispatched,
    attemptCount: draft.attemptCount,
    budgetConsumed: draft.budgetConsumed,
    outcome: draft.outcome,
    failureCode: draft.failureCode,
    abortRequested: draft.abortRequested,
    adapterSettlement: draft.adapterSettlement,
    usage: draft.usage,
    providerRequestId: sanitizeOptionalId(draft.providerRequestId),
    providerReportedModelId: sanitizeOptionalId(draft.providerReportedModelId),
    telemetryWarnings: Object.freeze([...draft.telemetryWarnings]),
  };
  return Object.freeze(receipt);
}

export function summarizeBrainInvocation(
  receipt: BrainInvocationReceipt,
): BrainInvocationSummary {
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    invocationId: receipt.invocationId,
    correlationId: receipt.correlationId,
    providerId: receipt.providerId,
    modelId: receipt.modelId,
    outcome: receipt.outcome,
    failureCode: receipt.failureCode,
    adapterDispatched: receipt.adapterDispatched,
    attemptCount: receipt.attemptCount,
    budgetConsumed: receipt.budgetConsumed,
    elapsedMs: receipt.elapsedMs,
    abortRequested: receipt.abortRequested,
    adapterSettlementStatus: receipt.adapterSettlement.status,
    usageAvailability: receipt.usage.availability,
  });
}
