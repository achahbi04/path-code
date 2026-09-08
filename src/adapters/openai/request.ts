/**
 * Phase 5E1 — PURE packet/config → owned Responses HTTP body.
 * No fs/env/clock/network/credential/prior-response access.
 * Explicit field construction; no object spreads of input into the request.
 */

import type { FrozenNormalizedAdapterPacket } from "../../brain/types.js";
import {
  EDIT_PROFILE_INSTRUCTIONS,
  EDIT_SCHEMA_NAME,
  ENGINEERING_EDIT_PROPOSAL_NATIVE_SCHEMA,
  ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA,
  REASONING_PROFILE_INSTRUCTIONS,
  REASONING_SCHEMA_NAME,
  REASONING_PROPOSAL_NATIVE_SCHEMA,
  SCOPE_PROFILE_INSTRUCTIONS,
  SCOPE_SCHEMA_NAME,
} from "./profiles.js";
import type { OpenAIReasoningEffort } from "./types.js";

export type OpenAIRequestBuildFailureCode =
  | "UNSUPPORTED_PROFILE"
  | "INVALID_OUTPUT_LIMIT";

export type OpenAIRequestBuildFailure = {
  readonly code: OpenAIRequestBuildFailureCode;
  readonly message: string;
};

export type OpenAIRequestBuildSuccess = {
  readonly bodyObject: Record<string, unknown>;
  readonly bodyBytes: Uint8Array;
  readonly bodyUtf8: string;
  readonly profileKind:
    | "REASONING_PROPOSAL_JSON"
    | "ENGINEERING_EDIT_PROPOSAL_JSON"
    | "ENGINEERING_SCOPE_PLAN_JSON";
};

export type OpenAIRequestBuildConfig = {
  readonly modelId: string;
  readonly maxOutputTokensCeiling: number;
  readonly reasoningEffort: OpenAIReasoningEffort | null;
};

function serializeReference(
  ref: FrozenNormalizedAdapterPacket["context"]["references"][number],
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    handle: ref.handle,
    evidenceKind: ref.evidenceKind,
  };
  if (ref.relativePath !== undefined) {
    out.relativePath = ref.relativePath;
  }
  return out;
}

function serializeBlock(
  block: FrozenNormalizedAdapterPacket["context"]["blocks"][number],
): Record<string, unknown> {
  return {
    blockId: block.blockId,
    role: block.role,
    text: block.text,
    referenceHandles: [...block.referenceHandles],
  };
}

/**
 * Deterministic owned input payload. Same packet + config → identical JSON bytes.
 * No timestamps or invocation IDs in the disclosed body.
 */
function buildInputText(packet: FrozenNormalizedAdapterPacket): string {
  const payload = {
    purpose: packet.purpose,
    responseProfile: {
      kind: packet.responseProfile.kind,
      schemaVersion: packet.responseProfile.schemaVersion,
    },
    taskText: packet.taskText,
    context: {
      references: packet.context.references.map(serializeReference),
      blocks: packet.context.blocks.map(serializeBlock),
    },
    limits: {
      maxOutputTokens: packet.maxOutputTokens,
      maxResponseUtf8Bytes: packet.maxResponseUtf8Bytes,
    },
  };
  return JSON.stringify(payload);
}

export function buildOpenAIResponsesRequest(
  packet: FrozenNormalizedAdapterPacket,
  config: OpenAIRequestBuildConfig,
): OpenAIRequestBuildSuccess | OpenAIRequestBuildFailure {
  const profile = packet.responseProfile;
  if (
    profile.kind !== "REASONING_PROPOSAL_JSON" &&
    profile.kind !== "ENGINEERING_EDIT_PROPOSAL_JSON" &&
    profile.kind !== "ENGINEERING_SCOPE_PLAN_JSON"
  ) {
    return {
      code: "UNSUPPORTED_PROFILE",
      message: "unsupported response profile",
    };
  }
  if (
    !Number.isSafeInteger(packet.maxOutputTokens) ||
    packet.maxOutputTokens < 1 ||
    packet.maxOutputTokens > config.maxOutputTokensCeiling
  ) {
    return {
      code: "INVALID_OUTPUT_LIMIT",
      message: "requested maxOutputTokens exceeds configured ceiling",
    };
  }

  // Transport only: each profile selects owned instructions plus the owned
  // native schema. The adapter never adds semantics of its own.
  const instructions =
    profile.kind === "REASONING_PROPOSAL_JSON"
      ? REASONING_PROFILE_INSTRUCTIONS
      : profile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON"
        ? EDIT_PROFILE_INSTRUCTIONS
        : SCOPE_PROFILE_INSTRUCTIONS;
  const schemaName =
    profile.kind === "REASONING_PROPOSAL_JSON"
      ? REASONING_SCHEMA_NAME
      : profile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON"
        ? EDIT_SCHEMA_NAME
        : SCOPE_SCHEMA_NAME;
  const schema =
    profile.kind === "REASONING_PROPOSAL_JSON"
      ? REASONING_PROPOSAL_NATIVE_SCHEMA
      : profile.kind === "ENGINEERING_EDIT_PROPOSAL_JSON"
        ? ENGINEERING_EDIT_PROPOSAL_NATIVE_SCHEMA
        : ENGINEERING_SCOPE_PLAN_NATIVE_SCHEMA;

  const bodyObject: Record<string, unknown> = {
    model: config.modelId,
    instructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildInputText(packet),
          },
        ],
      },
    ],
    max_output_tokens: packet.maxOutputTokens,
    text: {
      format: {
        type: "json_schema",
        name: schemaName,
        schema,
        strict: true,
      },
    },
    store: false,
    stream: false,
    background: false,
    truncation: "disabled",
    tools: [],
    tool_choice: "none",
    parallel_tool_calls: false,
  };

  if (config.reasoningEffort !== null) {
    bodyObject.reasoning = { effort: config.reasoningEffort };
  }

  const bodyUtf8 = JSON.stringify(bodyObject);
  const bodyBytes = Buffer.from(bodyUtf8, "utf8");
  return {
    bodyObject,
    bodyBytes,
    bodyUtf8,
    profileKind: profile.kind,
  };
}
