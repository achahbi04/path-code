/**
 * Phase 5E1 OpenAI Responses adapter — local configuration / result views.
 * No I/O. Credential material never stored here.
 */

export const OPENAI_PROVIDER_ID = "openai" as const;

export const OPENAI_RESPONSES_URL =
  "https://api.openai.com/v1/responses" as const;

export const DEFAULT_MAX_TRANSPORT_ATTEMPTS = 8;
export const HARD_MAX_TRANSPORT_ATTEMPTS = 8;
export const MAX_IN_FLIGHT = 1;

export const DEFAULT_MAX_REQUEST_BODY_BYTES = 1_048_576;
export const HARD_MAX_REQUEST_BODY_BYTES = 1_048_576;
export const DEFAULT_CUMULATIVE_REQUEST_BODY_BYTES = 4_194_304;
export const HARD_CUMULATIVE_REQUEST_BODY_BYTES = 4_194_304;

export const HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT = 8_192;
export const DEFAULT_CUMULATIVE_OUTPUT_TOKENS = 32_768;
export const HARD_CUMULATIVE_OUTPUT_TOKENS = 32_768;

export const DEFAULT_MAX_RESPONSE_ENVELOPE_BYTES = 1_048_576;
export const HARD_MAX_RESPONSE_ENVELOPE_BYTES = 1_048_576;

export const DEFAULT_MAX_PROPOSAL_TEXT_UTF8_BYTES = 65_536;
export const HARD_MAX_PROPOSAL_TEXT_UTF8_BYTES = 65_536;

export const MAX_MODEL_ID_UTF8_BYTES = 128;
export const MAX_CREDENTIAL_UTF8_BYTES = 8_192;

export const MAX_OUTPUT_ITEMS = 32;
export const MAX_CONTENT_PARTS_PER_MESSAGE = 64;

export type OpenAIReasoningEffort = "low" | "medium" | "high";

export type OpenAIModelConfiguration = {
  readonly modelId: string;
  readonly compatibleWithStructuredOutputs: true;
  readonly maxOutputTokensCeiling?: number;
  readonly reasoningEffort?: OpenAIReasoningEffort;
};

export type OpenAIAdapterNarrowingLimits = {
  readonly maxTransportAttempts?: number;
  readonly maxRequestBodyBytes?: number;
  readonly cumulativeRequestBodyBytes?: number;
  readonly maxOutputTokensPerAttempt?: number;
  readonly cumulativeOutputTokens?: number;
  readonly maxResponseEnvelopeBytes?: number;
  readonly maxProposalTextUtf8Bytes?: number;
};

export type OpenAIAdapterConfigurationFailureCode =
  | "INVALID_MODEL"
  | "INVALID_CREDENTIAL"
  | "INVALID_CAPABILITY_DECLARATION"
  | "INVALID_LIMIT"
  | "UNSUPPORTED_REASONING_EFFORT";

export type OpenAIAdapterConfigurationFailure = {
  readonly code: OpenAIAdapterConfigurationFailureCode;
  readonly message: string;
};

export type OpenAIBudgetSnapshot = {
  readonly reservedAttempts: number;
  readonly maxTransportAttempts: number;
  readonly reservedRequestBytes: number;
  readonly cumulativeRequestBodyBytes: number;
  readonly reservedOutputTokens: number;
  readonly cumulativeOutputTokens: number;
  readonly inFlight: number;
};

export type OpenAIAdapterDiagnostics = {
  readonly providerId: typeof OPENAI_PROVIDER_ID;
  readonly modelId: string;
  readonly profiles: readonly [
    "REASONING_PROPOSAL_JSON",
    "ENGINEERING_EDIT_PROPOSAL_JSON",
    "ENGINEERING_SCOPE_PLAN_JSON",
  ];
  readonly endpoint: typeof OPENAI_RESPONSES_URL;
  readonly reasoningEffort: OpenAIReasoningEffort | null;
  readonly limits: {
    readonly maxTransportAttempts: number;
    readonly maxRequestBodyBytes: number;
    readonly cumulativeRequestBodyBytes: number;
    readonly maxOutputTokensPerAttempt: number;
    readonly cumulativeOutputTokens: number;
    readonly maxResponseEnvelopeBytes: number;
    readonly maxProposalTextUtf8Bytes: number;
  };
  readonly budget: OpenAIBudgetSnapshot;
  readonly lastSafeHttpStatus: number | null;
  readonly lastSafeReasonCode: string | null;
  readonly lastProviderRequestId: string | null;
  readonly lastResponseEnvelopeBytes: number | null;
  readonly lastProposalTextUtf8Bytes: number | null;
  readonly knownUsageAttempts: number;
  readonly unknownUsageAttempts: number;
  readonly fetchStartedCount: number;
};

export type OpenAITransportOutcome =
  | {
      readonly kind: "HTTP";
      readonly status: number;
      readonly contentType: string | null;
      readonly bodyBytes: Uint8Array;
      readonly retryAfterHeader: string | null;
      readonly fetchStarted: true;
    }
  | {
      readonly kind: "ABORT";
      readonly fetchStarted: boolean;
    }
  | {
      readonly kind: "TRANSPORT_ERROR";
      readonly safeReason: string;
      readonly fetchStarted: boolean;
    }
  | {
      readonly kind: "DESTINATION_REJECTED";
      readonly safeReason: string;
      readonly fetchStarted: false;
    }
  | {
      readonly kind: "REDIRECT_REJECTED";
      readonly status: number;
      readonly fetchStarted: true;
    }
  | {
      readonly kind: "BODY_OVERFLOW";
      readonly fetchStarted: true;
    }
  | {
      readonly kind: "INVALID_CONTENT_TYPE";
      readonly status: number;
      readonly fetchStarted: true;
    }
  | {
      readonly kind: "INVALID_UTF8";
      readonly fetchStarted: true;
    };
