/**
 * Phase 5E1 OpenAI Responses adapter — finite package-internal export list.
 * Not exported from src/index.ts or the Brain barrel.
 */

export { createOpenAIAdapter, type OpenAIAdapter } from "./adapter.js";
export {
  OPENAI_PROVIDER_ID,
  OPENAI_RESPONSES_URL,
  DEFAULT_MAX_TRANSPORT_ATTEMPTS,
  HARD_MAX_TRANSPORT_ATTEMPTS,
  DEFAULT_MAX_REQUEST_BODY_BYTES,
  HARD_MAX_REQUEST_BODY_BYTES,
  DEFAULT_CUMULATIVE_REQUEST_BODY_BYTES,
  HARD_CUMULATIVE_REQUEST_BODY_BYTES,
  HARD_MAX_OUTPUT_TOKENS_PER_ATTEMPT,
  DEFAULT_CUMULATIVE_OUTPUT_TOKENS,
  HARD_CUMULATIVE_OUTPUT_TOKENS,
  DEFAULT_MAX_RESPONSE_ENVELOPE_BYTES,
  HARD_MAX_RESPONSE_ENVELOPE_BYTES,
  DEFAULT_MAX_PROPOSAL_TEXT_UTF8_BYTES,
  HARD_MAX_PROPOSAL_TEXT_UTF8_BYTES,
} from "./types.js";
export type {
  OpenAIModelConfiguration,
  OpenAIAdapterNarrowingLimits,
  OpenAIAdapterConfigurationFailure,
  OpenAIAdapterConfigurationFailureCode,
  OpenAIAdapterDiagnostics,
  OpenAIBudgetSnapshot,
  OpenAIReasoningEffort,
} from "./types.js";
export {
  REASONING_PROPOSAL_NATIVE_SCHEMA,
  ENGINEERING_EDIT_PROPOSAL_NATIVE_SCHEMA,
  ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA,
  REASONING_SCHEMA_NAME,
  EDIT_SCHEMA_NAME,
  SCOPE_SCHEMA_NAME,
  REASONING_PROFILE_INSTRUCTIONS,
  EDIT_PROFILE_INSTRUCTIONS,
  SCOPE_PROFILE_INSTRUCTIONS,
} from "./profiles.js";
export { buildOpenAIResponsesRequest } from "./request.js";
export { translateOpenAITransportResult } from "./response.js";
