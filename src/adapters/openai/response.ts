/**
 * Phase 5E1 — PURE bounded wire response + local correlation → Brain reply.
 * No I/O, clock, environment, or action. Responses output[] grammar, not choices.
 */

import type {
  AdapterUsageReport,
  EngineeringBrainAdapterReply,
} from "../../brain/types.js";
import { utf8ByteLength } from "../../brain/bounds.js";
import {
  MAX_CONTENT_PARTS_PER_MESSAGE,
  MAX_OUTPUT_ITEMS,
} from "./types.js";

export type TranslateContext = {
  readonly invocationId: string;
  readonly maxProposalTextUtf8Bytes: number;
  readonly credentialCanary?: string;
  /** Captured receive-time for optional Retry-After date interpretation (unused in V1 delta-only). */
  readonly receivedAtWallMs?: number;
  /**
   * When ENGINEERING_EDIT_PROPOSAL_JSON, COMPLETE provider text is translated from
   * the OpenAI-native nested reasoningProposal object into the Path Code
   * application envelope (reasoningProposalJson string). Reasoning profile is unchanged.
   */
  readonly profileKind?:
    | "REASONING_PROPOSAL_JSON"
    | "ENGINEERING_EDIT_PROPOSAL_JSON"
    /** Scope plans need no wire translation: core owns parsing end to end. */
    | "ENGINEERING_SCOPE_PLAN_JSON";
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

const OWN = Object.prototype.hasOwnProperty;

function safeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0 || value.length > 128) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (header === null || header.trim() === "") return undefined;
  const seconds = Number(header.trim());
  if (
    Number.isSafeInteger(seconds) &&
    seconds >= 0 &&
    seconds <= 86_400
  ) {
    return seconds * 1000;
  }
  return undefined;
}

function isSafeNonneg(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function extractUsage(root: Record<string, unknown>): AdapterUsageReport | undefined {
  const usage = root.usage;
  if (usage === undefined || usage === null) return undefined;
  if (!isPlainObject(usage)) {
    return { provenance: "PROVIDER_REPORTED" };
  }
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  // Map cache / reasoning dimensions without double-counting into totals.
  const cached = isPlainObject(usage.input_tokens_details)
    ? usage.input_tokens_details.cached_tokens
    : undefined;
  const report: {
    inputTokens?: number;
    outputTokens?: number;
    cacheTokens?: number;
    provenance: "PROVIDER_REPORTED";
  } = { provenance: "PROVIDER_REPORTED" };

  let invalid = false;
  if (inputTokens !== undefined) {
    if (!isSafeNonneg(inputTokens)) invalid = true;
    else report.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    if (!isSafeNonneg(outputTokens)) invalid = true;
    else report.outputTokens = outputTokens;
  }
  if (cached !== undefined) {
    if (!isSafeNonneg(cached)) invalid = true;
    else report.cacheTokens = cached;
  }
  if (invalid) {
    // Invalid optional usage still returns a provenance marker; Brain observeUsage handles INVALID.
    return { provenance: "PROVIDER_REPORTED" };
  }
  return report;
}

function containsCredential(
  text: string,
  canary: string | undefined,
): boolean {
  if (canary === undefined || canary.length === 0) return false;
  return text.includes(canary);
}

const EDIT_NATIVE_ROOT_KEYS = new Set([
  "schemaVersion",
  "proposalId",
  "reasoningProposal",
  "changes",
]);

export type NativeEditEnvelopeTranslateResult =
  | { readonly ok: true; readonly applicationText: string }
  | { readonly ok: false; readonly safeReasonCode: string };

/**
 * Provider-native edit envelope (nested reasoningProposal object) → Path Code
 * application edit envelope (reasoningProposalJson string). Fail closed; no repair.
 */
export function translateNativeEditEnvelopeToApplication(
  providerText: string,
): NativeEditEnvelopeTranslateResult {
  let decoded: unknown;
  try {
    decoded = JSON.parse(providerText) as unknown;
  } catch {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_MALFORMED_JSON" };
  }
  if (!isPlainObject(decoded)) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_NOT_OBJECT" };
  }

  // String-mode / ambiguous dual fields: never repair into nested form.
  if (OWN.call(decoded, "reasoningProposalJson")) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_STRING_MODE_REJECTED" };
  }

  for (const key of Object.keys(decoded)) {
    if (!EDIT_NATIVE_ROOT_KEYS.has(key)) {
      return { ok: false, safeReasonCode: "EDIT_ENVELOPE_UNKNOWN_FIELD" };
    }
  }
  for (const required of EDIT_NATIVE_ROOT_KEYS) {
    if (!OWN.call(decoded, required)) {
      return { ok: false, safeReasonCode: "EDIT_ENVELOPE_MISSING_FIELD" };
    }
  }

  if (decoded.schemaVersion !== 1) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_UNSUPPORTED_VERSION" };
  }
  if (typeof decoded.proposalId !== "string" || decoded.proposalId.length === 0) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_INVALID_PROPOSAL_ID" };
  }

  const reasoning = decoded.reasoningProposal;
  if (typeof reasoning === "string") {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_STRING_MODE_REJECTED" };
  }
  if (Array.isArray(reasoning)) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_AMBIGUOUS_REASONING" };
  }
  if (!isPlainObject(reasoning)) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_MISSING_REASONING_OBJECT" };
  }
  if (reasoning.schemaVersion !== 1) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_REASONING_VERSION" };
  }
  if (!Array.isArray(reasoning.claims) || reasoning.claims.length < 1) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_REASONING_CLAIMS" };
  }
  if (!Array.isArray(reasoning.hypotheses)) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_REASONING_HYPOTHESES" };
  }
  if (typeof reasoning.proposalId !== "string" || reasoning.proposalId.length === 0) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_REASONING_PROPOSAL_ID" };
  }
  if (typeof reasoning.requestedOutcome !== "string") {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_REASONING_OUTCOME" };
  }
  if (!Array.isArray(decoded.changes)) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_CHANGES" };
  }

  let reasoningProposalJson: string;
  try {
    reasoningProposalJson = JSON.stringify(reasoning);
  } catch {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_SERIALIZE_FAILED" };
  }
  if (reasoningProposalJson.length === 0) {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_SERIALIZE_FAILED" };
  }

  try {
    const applicationText = JSON.stringify({
      schemaVersion: 1,
      proposalId: decoded.proposalId,
      reasoningProposalJson,
      changes: decoded.changes,
    });
    return { ok: true, applicationText };
  } catch {
    return { ok: false, safeReasonCode: "EDIT_ENVELOPE_SERIALIZE_FAILED" };
  }
}

type FailureClass =
  | "AUTHENTICATION"
  | "RATE_LIMIT"
  | "UNAVAILABLE"
  | "TRANSPORT"
  | "OTHER";

type FailureExtra = {
  readonly retryAfterMs?: number;
  readonly providerRequestId?: string;
  readonly usage?: AdapterUsageReport;
};

function failureExtra(args: {
  readonly retryAfterMs?: number | undefined;
  readonly providerRequestId?: string | undefined;
  readonly usage?: AdapterUsageReport | undefined;
}): FailureExtra {
  const out: {
    retryAfterMs?: number;
    providerRequestId?: string;
    usage?: AdapterUsageReport;
  } = {};
  if (args.retryAfterMs !== undefined) out.retryAfterMs = args.retryAfterMs;
  if (args.providerRequestId !== undefined) {
    out.providerRequestId = args.providerRequestId;
  }
  if (args.usage !== undefined) out.usage = args.usage;
  return out;
}

function failure(
  invocationId: string,
  failureClass: FailureClass,
  extra?: FailureExtra,
): EngineeringBrainAdapterReply {
  return {
    kind: "FAILURE",
    invocationId,
    failureClass,
    ...extra,
  };
}

type LocalDiag = {
  safeReasonCode: string;
  httpStatus: number | null;
};

export type TranslateResult = {
  readonly reply: EngineeringBrainAdapterReply;
  readonly diag: LocalDiag;
  readonly proposalTextUtf8Bytes: number | null;
};

function toolLikeType(type: string): boolean {
  return (
    type === "function_call" ||
    type === "function_call_output" ||
    type === "custom_tool_call" ||
    type === "custom_tool_call_output" ||
    type === "computer_call" ||
    type === "computer_call_output" ||
    type === "shell_call" ||
    type === "shell_call_output" ||
    type === "mcp_call" ||
    type === "mcp_list_tools" ||
    type === "mcp_approval_request" ||
    type === "web_search_call" ||
    type === "file_search_call" ||
    type === "code_interpreter_call" ||
    type === "image_generation_call" ||
    type === "local_shell_call" ||
    type === "tool_call" ||
    type === "tool"
  );
}

function translateCompletedOutput(
  root: Record<string, unknown>,
  ctx: TranslateContext,
  usage: AdapterUsageReport | undefined,
  providerRequestId: string | undefined,
): TranslateResult {
  const output = root.output;
  if (!Array.isArray(output)) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "MALFORMED_OUTPUT", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (output.length > MAX_OUTPUT_ITEMS) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "EXCESSIVE_OUTPUT_ITEMS", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }

  let assistantMessages = 0;
  let refusalSeen = false;
  let toolSeen = false;
  let unknownControl = false;
  const textParts: string[] = [];

  for (const item of output) {
    if (!isPlainObject(item)) {
      unknownControl = true;
      break;
    }
    const type = item.type;
    if (typeof type !== "string") {
      unknownControl = true;
      break;
    }
    if (type === "reasoning") {
      // Bounded inert metadata — ignored for proposal text.
      continue;
    }
    if (toolLikeType(type)) {
      toolSeen = true;
      continue;
    }
    if (type !== "message") {
      unknownControl = true;
      break;
    }
    const role = item.role;
    if (role !== undefined && role !== "assistant") {
      unknownControl = true;
      break;
    }
    const status = item.status;
    if (status !== undefined && status !== "completed") {
      return {
        reply: {
          kind: "INCOMPLETE",
          invocationId: ctx.invocationId,
          stopReason: "MESSAGE_NONTERMINAL",
          ...(providerRequestId !== undefined ? { providerRequestId } : {}),
          ...(usage !== undefined ? { usage } : {}),
        },
        diag: { safeReasonCode: "MESSAGE_NONTERMINAL", httpStatus: 200 },
        proposalTextUtf8Bytes: null,
      };
    }
    assistantMessages += 1;
    const content = item.content;
    if (!Array.isArray(content)) {
      return {
        reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
        diag: { safeReasonCode: "MALFORMED_CONTENT", httpStatus: 200 },
        proposalTextUtf8Bytes: null,
      };
    }
    if (content.length > MAX_CONTENT_PARTS_PER_MESSAGE) {
      return {
        reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
        diag: { safeReasonCode: "EXCESSIVE_CONTENT_PARTS", httpStatus: 200 },
        proposalTextUtf8Bytes: null,
      };
    }
    for (const part of content) {
      if (!isPlainObject(part)) {
        return {
          reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
          diag: { safeReasonCode: "MALFORMED_CONTENT_PART", httpStatus: 200 },
          proposalTextUtf8Bytes: null,
        };
      }
      const partType = part.type;
      if (partType === "refusal") {
        refusalSeen = true;
        continue;
      }
      if (partType === "output_text") {
        if (typeof part.text !== "string") {
          return {
            reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
            diag: { safeReasonCode: "MALFORMED_OUTPUT_TEXT", httpStatus: 200 },
            proposalTextUtf8Bytes: null,
          };
        }
        textParts.push(part.text);
        continue;
      }
      // Unknown content part kinds fail closed.
      return {
        reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
        diag: { safeReasonCode: "UNKNOWN_CONTENT_PART", httpStatus: 200 },
        proposalTextUtf8Bytes: null,
      };
    }
  }

  if (unknownControl) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "UNKNOWN_OUTPUT_ITEM", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (toolSeen) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "UNSUPPORTED_TOOL_OUTPUT", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (refusalSeen) {
    return {
      reply: {
        kind: "REFUSAL",
        invocationId: ctx.invocationId,
        reasonCode: "PROVIDER_REFUSAL",
        ...(providerRequestId !== undefined ? { providerRequestId } : {}),
        ...(usage !== undefined ? { usage } : {}),
      },
      diag: { safeReasonCode: "PROVIDER_REFUSAL", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (assistantMessages !== 1) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: {
        safeReasonCode:
          assistantMessages === 0 ? "MISSING_ASSISTANT_MESSAGE" : "MULTIPLE_ASSISTANT_MESSAGES",
        httpStatus: 200,
      },
      proposalTextUtf8Bytes: null,
    };
  }

  const textJoined = textParts.join("");
  if (textJoined.length === 0) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "EMPTY_TEXT", httpStatus: 200 },
      proposalTextUtf8Bytes: 0,
    };
  }

  let text = textJoined;
  if (ctx.profileKind === "ENGINEERING_EDIT_PROPOSAL_JSON") {
    const translated = translateNativeEditEnvelopeToApplication(textJoined);
    if (!translated.ok) {
      return {
        reply: failure(
          ctx.invocationId,
          "OTHER",
          failureExtra({ providerRequestId, usage }),
        ),
        diag: { safeReasonCode: translated.safeReasonCode, httpStatus: 200 },
        proposalTextUtf8Bytes: null,
      };
    }
    text = translated.applicationText;
  }

  const bytes = utf8ByteLength(text);
  if (bytes > ctx.maxProposalTextUtf8Bytes) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "PROPOSAL_TEXT_TOO_LARGE", httpStatus: 200 },
      proposalTextUtf8Bytes: bytes,
    };
  }
  if (containsCredential(text, ctx.credentialCanary)) {
    return {
      reply: {
        kind: "REFUSAL",
        invocationId: ctx.invocationId,
        reasonCode: "CREDENTIAL_REFLECTION",
        ...(providerRequestId !== undefined ? { providerRequestId } : {}),
        ...(usage !== undefined ? { usage } : {}),
      },
      diag: { safeReasonCode: "CREDENTIAL_REFLECTION", httpStatus: 200 },
      proposalTextUtf8Bytes: null,
    };
  }

  return {
    reply: {
      kind: "COMPLETE",
      invocationId: ctx.invocationId,
      text,
      ...(providerRequestId !== undefined ? { providerRequestId } : {}),
      ...(usage !== undefined ? { usage } : {}),
    },
    diag: { safeReasonCode: "COMPLETE", httpStatus: 200 },
    proposalTextUtf8Bytes: bytes,
  };
}

function translateResponsesJson(
  root: Record<string, unknown>,
  ctx: TranslateContext,
  httpStatus: number,
): TranslateResult {
  const providerRequestId = safeId(root.id);
  const usage = extractUsage(root);
  const status = root.status;

  if (root.error !== undefined && root.error !== null) {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "PROVIDER_ERROR", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  if (status === "queued" || status === "in_progress") {
    return {
      reply: {
        kind: "INCOMPLETE",
        invocationId: ctx.invocationId,
        stopReason: "NONTERMINAL_STATUS",
        ...(providerRequestId !== undefined ? { providerRequestId } : {}),
        ...(usage !== undefined ? { usage } : {}),
      },
      diag: { safeReasonCode: "NONTERMINAL_STATUS", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  if (status === "incomplete") {
    return {
      reply: {
        kind: "INCOMPLETE",
        invocationId: ctx.invocationId,
        stopReason: "OUTPUT_LIMIT",
        ...(providerRequestId !== undefined ? { providerRequestId } : {}),
        ...(usage !== undefined ? { usage } : {}),
      },
      diag: { safeReasonCode: "INCOMPLETE_STATUS", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  if (status === "failed" || status === "cancelled") {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "ROOT_FAILED", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  if (status !== "completed") {
    return {
      reply: failure(ctx.invocationId, "OTHER", failureExtra({ providerRequestId, usage })),
      diag: { safeReasonCode: "UNRECOGNIZED_STATUS", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  if (root.incomplete_details !== undefined && root.incomplete_details !== null) {
    return {
      reply: {
        kind: "INCOMPLETE",
        invocationId: ctx.invocationId,
        stopReason: "INCOMPLETE_DETAILS",
        ...(providerRequestId !== undefined ? { providerRequestId } : {}),
        ...(usage !== undefined ? { usage } : {}),
      },
      diag: { safeReasonCode: "INCOMPLETE_DETAILS", httpStatus },
      proposalTextUtf8Bytes: null,
    };
  }

  return translateCompletedOutput(root, ctx, usage, providerRequestId);
}

function classifyHttpError(
  status: number,
  bodyText: string,
  retryAfterHeader: string | null,
  ctx: TranslateContext,
): TranslateResult {
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);

  if (status === 401) {
    return {
      reply: failure(ctx.invocationId, "AUTHENTICATION"),
      diag: { safeReasonCode: "HTTP_401", httpStatus: 401 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status === 403) {
    // Distinguished locally from bad credentials via reason code; nearest envelope is OTHER.
    return {
      reply: failure(ctx.invocationId, "OTHER"),
      diag: { safeReasonCode: "HTTP_403_PERMISSION", httpStatus: 403 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status === 429) {
    const lower = bodyText.toLowerCase();
    const billing =
      lower.includes("insufficient_quota") ||
      lower.includes("billing") ||
      lower.includes("spend") ||
      lower.includes("quota") ||
      lower.includes("credit");
    if (billing) {
      return {
        reply: failure(ctx.invocationId, "RATE_LIMIT"),
        diag: { safeReasonCode: "HTTP_429_QUOTA", httpStatus: 429 },
        proposalTextUtf8Bytes: null,
      };
    }
    return {
      reply: failure(ctx.invocationId, "RATE_LIMIT", {
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      }),
      diag: { safeReasonCode: "HTTP_429_RATE_LIMITED", httpStatus: 429 },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status === 408 || status === 409) {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: `HTTP_${status}`, httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status === 400 || status === 404 || status === 422) {
    return {
      reply: failure(ctx.invocationId, "OTHER"),
      diag: { safeReasonCode: `HTTP_${status}_REQUEST_REJECTED`, httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status >= 500 && status <= 599) {
    return {
      reply: failure(ctx.invocationId, "UNAVAILABLE"),
      diag: { safeReasonCode: `HTTP_${status}`, httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  if (status >= 300 && status <= 399) {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "REDIRECT_REJECTED", httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  return {
    reply: failure(ctx.invocationId, "OTHER"),
    diag: { safeReasonCode: `HTTP_${status}_UNSUPPORTED`, httpStatus: status },
    proposalTextUtf8Bytes: null,
  };
}

export function translateOpenAITransportResult(
  outcome: {
    readonly kind: string;
    readonly status?: number;
    readonly contentType?: string | null;
    readonly bodyBytes?: Uint8Array;
    readonly retryAfterHeader?: string | null;
    readonly safeReason?: string;
    readonly fetchStarted?: boolean;
  },
  ctx: TranslateContext,
): TranslateResult {
  if (outcome.kind === "ABORT") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "ABORTED", httpStatus: null },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "DESTINATION_REJECTED") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "DESTINATION_REJECTED", httpStatus: null },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "REDIRECT_REJECTED") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: {
        safeReasonCode: "REDIRECT_REJECTED",
        httpStatus: outcome.status ?? null,
      },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "BODY_OVERFLOW") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "BODY_OVERFLOW", httpStatus: null },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "INVALID_CONTENT_TYPE") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: {
        safeReasonCode: "INVALID_CONTENT_TYPE",
        httpStatus: outcome.status ?? null,
      },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "INVALID_UTF8") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "INVALID_UTF8", httpStatus: null },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind === "TRANSPORT_ERROR") {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: {
        safeReasonCode: outcome.safeReason ?? "TRANSPORT_ERROR",
        httpStatus: null,
      },
      proposalTextUtf8Bytes: null,
    };
  }
  if (outcome.kind !== "HTTP" || outcome.status === undefined) {
    return {
      reply: failure(ctx.invocationId, "OTHER"),
      diag: { safeReasonCode: "UNSUPPORTED_OUTCOME", httpStatus: null },
      proposalTextUtf8Bytes: null,
    };
  }

  const status = outcome.status;
  const bodyBytes = outcome.bodyBytes ?? new Uint8Array();
  let bodyText = "";
  try {
    bodyText = Buffer.from(bodyBytes).toString("utf8");
  } catch {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "INVALID_UTF8", httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }

  if (status < 200 || status >= 300) {
    return classifyHttpError(
      status,
      bodyText,
      outcome.retryAfterHeader ?? null,
      ctx,
    );
  }

  const ct = outcome.contentType ?? "";
  const ctLower = ct.toLowerCase();
  if (!ctLower.startsWith("application/json")) {
    return {
      reply: failure(ctx.invocationId, "TRANSPORT"),
      diag: { safeReasonCode: "INVALID_CONTENT_TYPE", httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText) as unknown;
  } catch {
    return {
      reply: failure(ctx.invocationId, "OTHER"),
      diag: { safeReasonCode: "MALFORMED_JSON", httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  if (!isPlainObject(parsed)) {
    return {
      reply: failure(ctx.invocationId, "OTHER"),
      diag: { safeReasonCode: "MALFORMED_ROOT", httpStatus: status },
      proposalTextUtf8Bytes: null,
    };
  }
  return translateResponsesJson(parsed, ctx, status);
}
