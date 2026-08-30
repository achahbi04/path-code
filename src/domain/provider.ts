/**
 * Provider-neutral model interaction contracts.
 * The model supplies intelligence; Path Code supplies engineering conduct.
 * Provider responses must never carry AuthorityDecision or grant ActionClass.
 */

import type { JsonObject, JsonValue } from "./json.js";

export type ModelCapabilityDescriptor = {
  readonly maxContextTokens: number;
  readonly supportsToolCalling: boolean;
  readonly supportsStreaming: boolean;
  readonly supportsMultimodal: boolean;
};

/**
 * Normalized tool-call proposal emitted by a model.
 * Authority is assigned by Path Code callers/policy — never by the provider.
 */
export type ModelToolCallProposal = {
  readonly id: string;
  readonly toolName: string;
  readonly input: JsonObject;
};

export type ModelRequest = {
  readonly modelId: string;
  readonly messages: readonly ModelMessage[];
  readonly tools?: readonly ModelToolDescriptor[];
};

export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage = {
  readonly role: ModelMessageRole;
  readonly content: string;
  readonly toolCallId?: string;
  readonly toolCalls?: readonly ModelToolCallProposal[];
};

export type ModelToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

export type ModelResponse = {
  readonly content: string;
  readonly toolCalls: readonly ModelToolCallProposal[];
  readonly raw?: JsonValue;
};

/**
 * Replaceable intelligence source. No vendor-specific fields.
 */
export interface ModelProvider {
  readonly id: string;
  readonly capabilities: ModelCapabilityDescriptor;
  complete(request: ModelRequest): Promise<ModelResponse>;
}
