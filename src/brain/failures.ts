/**
 * Phase 5D1 Engineering Brain — local normalized failures.
 * Not new global KnowledgeState / ValidationOutcome / ledger states.
 */

import type { BrainInvocationReceipt } from "./types.js";

export type BrainConfigurationFailureCode =
  | "INVALID_ADAPTER"
  | "INVALID_DESCRIPTOR"
  | "INVALID_CAPABILITIES"
  | "INVALID_LIMITS";

export type BrainConfigurationFailure = {
  readonly kind: "CONFIGURATION";
  readonly code: BrainConfigurationFailureCode;
  readonly message: string;
};

export type BrainInvocationFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "UNSUPPORTED_CAPABILITY"
  | "DISPOSED"
  | "BUSY"
  | "BUDGET_EXHAUSTED"
  | "CANCELLED"
  | "TIMED_OUT"
  | "AUTHENTICATION_FAILURE"
  | "RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "TRANSPORT_FAILURE"
  | "PROVIDER_REFUSAL"
  | "INCOMPLETE_OUTPUT"
  | "UNEXPECTED_TOOL_CALLS"
  | "MALFORMED_ADAPTER_RESPONSE"
  | "ADAPTER_EXCEPTION"
  | "EMPTY_RESPONSE"
  | "RESPONSE_TOO_LARGE";

export type BrainInvocationFailure = {
  readonly kind: "INVOCATION";
  readonly code: BrainInvocationFailureCode;
  readonly message: string;
  readonly receipt: BrainInvocationReceipt;
  readonly retryAfterMs?: number;
};

export function configurationFailure(
  code: BrainConfigurationFailureCode,
  message: string,
): BrainConfigurationFailure {
  return { kind: "CONFIGURATION", code, message };
}

export function invocationFailure(
  code: BrainInvocationFailureCode,
  message: string,
  receipt: BrainInvocationReceipt,
  retryAfterMs?: number,
): BrainInvocationFailure {
  const failure: BrainInvocationFailure = {
    kind: "INVOCATION",
    code,
    message,
    receipt,
  };
  if (retryAfterMs !== undefined) {
    return { ...failure, retryAfterMs };
  }
  return failure;
}
