/**
 * Phase 5D1 — request normalization and data-only validation.
 * Reject unknown/control-bearing fields; reconstruct owned records.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
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
  REASONING_PROPOSAL_SCHEMA_VERSION,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TIMEOUT_MS,
  isNonemptyBoundedId,
  isSafePositiveInt,
  utf8ByteLength,
} from "./bounds.js";
import type {
  BrainContextBlock,
  BrainContextPacket,
  BrainInvocationPurpose,
  BrainInvocationRequest,
  BrainReferenceDescriptor,
  BrainResponseProfile,
  EngineeringBrainNarrowingLimits,
  FrozenNormalizedAdapterPacket,
} from "./types.js";

const OWN_DATA = Object.prototype.hasOwnProperty;

const EVIDENCE_KINDS = new Set(["ENTRY", "CONTENT", "MANIFEST"]);
const PURPOSES = new Set(["PROPOSE_REASONING", "REVISE_REASONING"]);
const BLOCK_ROLES = new Set(["REFERENCE_MATERIAL", "DIAGNOSTIC"]);

const REQUEST_KEYS = new Set([
  "correlationId",
  "purpose",
  "taskText",
  "context",
  "responseProfile",
  "maxOutputTokens",
  "timeoutMs",
  "maxResponseUtf8Bytes",
]);

const CONTEXT_KEYS = new Set(["references", "blocks"]);
const DESCRIPTOR_KEYS = new Set(["handle", "evidenceKind", "relativePath"]);
const BLOCK_KEYS = new Set(["blockId", "role", "text", "referenceHandles"]);
const PROFILE_KEYS = new Set(["kind", "schemaVersion"]);

export type NormalizedRequestLimits = {
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxResponseUtf8Bytes: number;
  readonly maxPreparedRequestUtf8Bytes: number;
  readonly maxOutputTokensCeiling: number;
  readonly timeoutMsCeiling: number;
};

export type PreparedInvocationRequest = {
  readonly correlationId: string;
  readonly purpose: BrainInvocationPurpose;
  readonly taskText: string;
  readonly context: BrainContextPacket;
  readonly responseProfile: BrainResponseProfile;
  readonly limits: NormalizedRequestLimits;
  readonly preparedRequestUtf8Bytes: number;
  readonly packetWithoutInvocationId: Omit<
    FrozenNormalizedAdapterPacket,
    "invocationId"
  >;
};

export type NormalizeFailure = {
  readonly code: "INVALID_REQUEST" | "LIMIT_EXCEEDED" | "UNSUPPORTED_CAPABILITY";
  readonly message: string;
};

function isPlainOwnObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function rejectUnknownKeys(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): NormalizeFailure | undefined {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        code: "INVALID_REQUEST",
        message: `${label} contains unknown or control-bearing field '${key}'`,
      };
    }
  }
  return undefined;
}

function readOwnString(
  obj: Record<string, unknown>,
  key: string,
  label: string,
): Result<string, NormalizeFailure> {
  if (!OWN_DATA.call(obj, key)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} is required`,
    });
  }
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (desc !== undefined && (desc.get !== undefined || desc.set !== undefined)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a data property`,
    });
  }
  const value = obj[key];
  if (typeof value !== "string") {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a string`,
    });
  }
  return success(value);
}

function readOwnOptionalString(
  obj: Record<string, unknown>,
  key: string,
  label: string,
): Result<string | undefined, NormalizeFailure> {
  if (!OWN_DATA.call(obj, key)) {
    return success(undefined);
  }
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (desc !== undefined && (desc.get !== undefined || desc.set !== undefined)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a data property`,
    });
  }
  const value = obj[key];
  if (typeof value !== "string") {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a string`,
    });
  }
  return success(value);
}

function readOwnOptionalPositiveInt(
  obj: Record<string, unknown>,
  key: string,
  label: string,
): Result<number | undefined, NormalizeFailure> {
  if (!OWN_DATA.call(obj, key)) {
    return success(undefined);
  }
  const desc = Object.getOwnPropertyDescriptor(obj, key);
  if (desc !== undefined && (desc.get !== undefined || desc.set !== undefined)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a data property`,
    });
  }
  const value = obj[key];
  if (!isSafePositiveInt(value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.${key} must be a safe positive integer`,
    });
  }
  return success(value);
}

function parseDescriptor(
  value: unknown,
  index: number,
): Result<BrainReferenceDescriptor, NormalizeFailure> {
  const label = `context.references[${index}]`;
  if (!isPlainOwnObject(value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label} must be a plain data object`,
    });
  }
  const unknown = rejectUnknownKeys(value, DESCRIPTOR_KEYS, label);
  if (unknown) {
    return failure(unknown);
  }
  const handleResult = readOwnString(value, "handle", label);
  if (!handleResult.ok) {
    return handleResult;
  }
  if (!isNonemptyBoundedId(handleResult.value)) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: `${label}.handle exceeds id bounds`,
    });
  }
  const kindResult = readOwnString(value, "evidenceKind", label);
  if (!kindResult.ok) {
    return kindResult;
  }
  if (!EVIDENCE_KINDS.has(kindResult.value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.evidenceKind is not a Gate 1 evidence kind`,
    });
  }
  const pathResult = readOwnOptionalString(value, "relativePath", label);
  if (!pathResult.ok) {
    return pathResult;
  }
  if (
    pathResult.value !== undefined &&
    utf8ByteLength(pathResult.value) > MAX_RELATIVE_PATH_UTF8_BYTES
  ) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: `${label}.relativePath exceeds path bounds`,
    });
  }
  const descriptor: BrainReferenceDescriptor = {
    handle: handleResult.value,
    evidenceKind: kindResult.value as BrainReferenceDescriptor["evidenceKind"],
    ...(pathResult.value !== undefined
      ? { relativePath: pathResult.value }
      : {}),
  };
  return success(Object.freeze(descriptor));
}

function parseBlock(
  value: unknown,
  index: number,
  handleSet: ReadonlySet<string>,
): Result<BrainContextBlock, NormalizeFailure> {
  const label = `context.blocks[${index}]`;
  if (!isPlainOwnObject(value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label} must be a plain data object`,
    });
  }
  const unknown = rejectUnknownKeys(value, BLOCK_KEYS, label);
  if (unknown) {
    return failure(unknown);
  }
  const idResult = readOwnString(value, "blockId", label);
  if (!idResult.ok) {
    return idResult;
  }
  if (!isNonemptyBoundedId(idResult.value)) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: `${label}.blockId exceeds id bounds`,
    });
  }
  const roleResult = readOwnString(value, "role", label);
  if (!roleResult.ok) {
    return roleResult;
  }
  if (!BLOCK_ROLES.has(roleResult.value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.role is invalid`,
    });
  }
  const textResult = readOwnString(value, "text", label);
  if (!textResult.ok) {
    return textResult;
  }
  if (utf8ByteLength(textResult.value) > MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: `${label}.text exceeds block text bounds`,
    });
  }
  if (!OWN_DATA.call(value, "referenceHandles")) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.referenceHandles is required`,
    });
  }
  const handlesRaw = value.referenceHandles;
  if (!Array.isArray(handlesRaw)) {
    return failure({
      code: "INVALID_REQUEST",
      message: `${label}.referenceHandles must be an array`,
    });
  }
  if (handlesRaw.length > MAX_REFS_PER_BLOCK) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: `${label}.referenceHandles exceeds per-block bound`,
    });
  }
  const handles: string[] = [];
  for (let i = 0; i < handlesRaw.length; i += 1) {
    const h = handlesRaw[i];
    if (typeof h !== "string" || !isNonemptyBoundedId(h)) {
      return failure({
        code: "INVALID_REQUEST",
        message: `${label}.referenceHandles[${i}] is invalid`,
      });
    }
    if (!handleSet.has(h)) {
      return failure({
        code: "INVALID_REQUEST",
        message: `${label}.referenceHandles[${i}] does not resolve in packet`,
      });
    }
    handles.push(h);
  }
  return success(
    Object.freeze({
      blockId: idResult.value,
      role: roleResult.value as BrainContextBlock["role"],
      text: textResult.value,
      referenceHandles: Object.freeze(handles),
    }),
  );
}

function parseContext(
  value: unknown,
): Result<BrainContextPacket, NormalizeFailure> {
  if (!isPlainOwnObject(value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "context must be a plain data object",
    });
  }
  const unknown = rejectUnknownKeys(value, CONTEXT_KEYS, "context");
  if (unknown) {
    return failure(unknown);
  }
  if (!OWN_DATA.call(value, "references") || !Array.isArray(value.references)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "context.references must be an array",
    });
  }
  if (!OWN_DATA.call(value, "blocks") || !Array.isArray(value.blocks)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "context.blocks must be an array",
    });
  }
  if (value.references.length > MAX_REFERENCE_DESCRIPTORS) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "context.references exceed descriptor bound",
    });
  }
  if (value.blocks.length > MAX_CONTEXT_BLOCKS) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "context.blocks exceed block bound",
    });
  }

  const references: BrainReferenceDescriptor[] = [];
  const handleSet = new Set<string>();
  for (let i = 0; i < value.references.length; i += 1) {
    const parsed = parseDescriptor(value.references[i], i);
    if (!parsed.ok) {
      return parsed;
    }
    if (handleSet.has(parsed.value.handle)) {
      return failure({
        code: "INVALID_REQUEST",
        message: `duplicate reference handle '${parsed.value.handle}'`,
      });
    }
    handleSet.add(parsed.value.handle);
    references.push(parsed.value);
  }

  const blocks: BrainContextBlock[] = [];
  const blockIds = new Set<string>();
  for (let i = 0; i < value.blocks.length; i += 1) {
    const parsed = parseBlock(value.blocks[i], i, handleSet);
    if (!parsed.ok) {
      return parsed;
    }
    if (blockIds.has(parsed.value.blockId)) {
      return failure({
        code: "INVALID_REQUEST",
        message: `duplicate blockId '${parsed.value.blockId}'`,
      });
    }
    blockIds.add(parsed.value.blockId);
    blocks.push(parsed.value);
  }

  return success(
    Object.freeze({
      references: Object.freeze(references),
      blocks: Object.freeze(blocks),
    }),
  );
}

function parseResponseProfile(
  value: unknown | undefined,
): Result<BrainResponseProfile, NormalizeFailure> {
  if (value === undefined) {
    return success(
      Object.freeze({
        kind: "REASONING_PROPOSAL_JSON" as const,
        schemaVersion: REASONING_PROPOSAL_SCHEMA_VERSION,
      }),
    );
  }
  if (!isPlainOwnObject(value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "responseProfile must be a plain data object",
    });
  }
  const unknown = rejectUnknownKeys(value, PROFILE_KEYS, "responseProfile");
  if (unknown) {
    return failure(unknown);
  }
  const kindResult = readOwnString(value, "kind", "responseProfile");
  if (!kindResult.ok) {
    return kindResult;
  }
  if (kindResult.value !== "REASONING_PROPOSAL_JSON") {
    return failure({
      code: "UNSUPPORTED_CAPABILITY",
      message: "responseProfile.kind is not supported by V1",
    });
  }
  if (!OWN_DATA.call(value, "schemaVersion")) {
    return failure({
      code: "INVALID_REQUEST",
      message: "responseProfile.schemaVersion is required",
    });
  }
  const version = value.schemaVersion;
  if (version !== REASONING_PROPOSAL_SCHEMA_VERSION) {
    return failure({
      code: "UNSUPPORTED_CAPABILITY",
      message: "responseProfile.schemaVersion is not supported",
    });
  }
  return success(
    Object.freeze({
      kind: "REASONING_PROPOSAL_JSON" as const,
      schemaVersion: REASONING_PROPOSAL_SCHEMA_VERSION,
    }),
  );
}

export function resolveEffectiveCeilings(
  narrowing: EngineeringBrainNarrowingLimits | undefined,
  adapterMaxOutputTokens: number | undefined,
  adapterMaxTimeoutMs: number | undefined,
  adapterMaxResponseUtf8Bytes: number | undefined,
  adapterMaxPreparedRequestUtf8Bytes: number | undefined,
): Result<NormalizedRequestLimits, NormalizeFailure> {
  let maxPrepared = MAX_PREPARED_REQUEST_UTF8_BYTES;
  if (narrowing?.maxPreparedRequestUtf8Bytes !== undefined) {
    if (
      !isSafePositiveInt(narrowing.maxPreparedRequestUtf8Bytes) ||
      narrowing.maxPreparedRequestUtf8Bytes > MAX_PREPARED_REQUEST_UTF8_BYTES
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "configured prepared-request ceiling is invalid",
      });
    }
    maxPrepared = Math.min(maxPrepared, narrowing.maxPreparedRequestUtf8Bytes);
  }
  if (adapterMaxPreparedRequestUtf8Bytes !== undefined) {
    if (
      !isSafePositiveInt(adapterMaxPreparedRequestUtf8Bytes) ||
      adapterMaxPreparedRequestUtf8Bytes > MAX_PREPARED_REQUEST_UTF8_BYTES
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "adapter prepared-request ceiling is invalid",
      });
    }
    maxPrepared = Math.min(maxPrepared, adapterMaxPreparedRequestUtf8Bytes);
  }

  let tokenCeiling = HARD_MAX_OUTPUT_TOKENS;
  if (narrowing?.maxOutputTokens !== undefined) {
    if (
      !isSafePositiveInt(narrowing.maxOutputTokens) ||
      narrowing.maxOutputTokens > HARD_MAX_OUTPUT_TOKENS
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "configured output-token ceiling is invalid",
      });
    }
    tokenCeiling = Math.min(tokenCeiling, narrowing.maxOutputTokens);
  }
  if (adapterMaxOutputTokens !== undefined) {
    if (
      !isSafePositiveInt(adapterMaxOutputTokens) ||
      adapterMaxOutputTokens > HARD_MAX_OUTPUT_TOKENS
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "adapter output-token ceiling is invalid",
      });
    }
    tokenCeiling = Math.min(tokenCeiling, adapterMaxOutputTokens);
  }

  let timeoutCeiling = HARD_MAX_TIMEOUT_MS;
  if (narrowing?.maxTimeoutMs !== undefined) {
    if (
      !isSafePositiveInt(narrowing.maxTimeoutMs) ||
      narrowing.maxTimeoutMs > HARD_MAX_TIMEOUT_MS
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "configured timeout ceiling is invalid",
      });
    }
    timeoutCeiling = Math.min(timeoutCeiling, narrowing.maxTimeoutMs);
  }
  if (adapterMaxTimeoutMs !== undefined) {
    if (
      !isSafePositiveInt(adapterMaxTimeoutMs) ||
      adapterMaxTimeoutMs > HARD_MAX_TIMEOUT_MS
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "adapter timeout ceiling is invalid",
      });
    }
    timeoutCeiling = Math.min(timeoutCeiling, adapterMaxTimeoutMs);
  }

  let responseCeiling = MAX_RESPONSE_UTF8_BYTES;
  if (narrowing?.maxResponseUtf8Bytes !== undefined) {
    if (
      !isSafePositiveInt(narrowing.maxResponseUtf8Bytes) ||
      narrowing.maxResponseUtf8Bytes > MAX_RESPONSE_UTF8_BYTES
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "configured response ceiling is invalid",
      });
    }
    responseCeiling = Math.min(responseCeiling, narrowing.maxResponseUtf8Bytes);
  }
  if (adapterMaxResponseUtf8Bytes !== undefined) {
    if (
      !isSafePositiveInt(adapterMaxResponseUtf8Bytes) ||
      adapterMaxResponseUtf8Bytes > MAX_RESPONSE_UTF8_BYTES
    ) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "adapter response ceiling is invalid",
      });
    }
    responseCeiling = Math.min(responseCeiling, adapterMaxResponseUtf8Bytes);
  }

  return success({
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxResponseUtf8Bytes: responseCeiling,
    maxPreparedRequestUtf8Bytes: maxPrepared,
    maxOutputTokensCeiling: tokenCeiling,
    timeoutMsCeiling: timeoutCeiling,
  });
}

/**
 * Validate request shapes/bounds and reconstruct owned frozen data
 * BEFORE any adapter await.
 */
export function normalizeInvocationRequest(
  request: BrainInvocationRequest,
  ceilings: NormalizedRequestLimits,
  acceptedProfiles: readonly BrainResponseProfile[],
  honorsOutputTokenLimit: boolean,
): Result<PreparedInvocationRequest, NormalizeFailure> {
  if (!isPlainOwnObject(request as unknown)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "request must be a plain data object",
    });
  }
  const reqObj = request as unknown as Record<string, unknown>;
  const unknown = rejectUnknownKeys(reqObj, REQUEST_KEYS, "request");
  if (unknown) {
    return failure(unknown);
  }

  const correlationResult = readOwnString(reqObj, "correlationId", "request");
  if (!correlationResult.ok) {
    return correlationResult;
  }
  if (!isNonemptyBoundedId(correlationResult.value)) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "correlationId exceeds id bounds",
    });
  }

  const purposeResult = readOwnString(reqObj, "purpose", "request");
  if (!purposeResult.ok) {
    return purposeResult;
  }
  if (!PURPOSES.has(purposeResult.value)) {
    return failure({
      code: "INVALID_REQUEST",
      message: "purpose is invalid",
    });
  }

  const taskResult = readOwnString(reqObj, "taskText", "request");
  if (!taskResult.ok) {
    return taskResult;
  }
  const taskBytes = utf8ByteLength(taskResult.value);
  if (taskBytes < 1 || taskBytes > MAX_TASK_TEXT_UTF8_BYTES) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "taskText exceeds task text bounds",
    });
  }

  if (!OWN_DATA.call(reqObj, "context")) {
    return failure({
      code: "INVALID_REQUEST",
      message: "context is required",
    });
  }
  const contextResult = parseContext(reqObj.context);
  if (!contextResult.ok) {
    return contextResult;
  }

  const profileResult = parseResponseProfile(reqObj.responseProfile);
  if (!profileResult.ok) {
    return profileResult;
  }
  const profileAccepted = acceptedProfiles.some(
    (p) =>
      p.kind === profileResult.value.kind &&
      p.schemaVersion === profileResult.value.schemaVersion,
  );
  if (!profileAccepted) {
    return failure({
      code: "UNSUPPORTED_CAPABILITY",
      message: "adapter does not accept the requested response profile",
    });
  }

  const tokensOpt = readOwnOptionalPositiveInt(
    reqObj,
    "maxOutputTokens",
    "request",
  );
  if (!tokensOpt.ok) {
    return tokensOpt;
  }
  const timeoutOpt = readOwnOptionalPositiveInt(reqObj, "timeoutMs", "request");
  if (!timeoutOpt.ok) {
    return timeoutOpt;
  }
  const responseOpt = readOwnOptionalPositiveInt(
    reqObj,
    "maxResponseUtf8Bytes",
    "request",
  );
  if (!responseOpt.ok) {
    return responseOpt;
  }

  let maxOutputTokens =
    tokensOpt.value === undefined ? DEFAULT_MAX_OUTPUT_TOKENS : tokensOpt.value;
  if (tokensOpt.value === undefined) {
    if (DEFAULT_MAX_OUTPUT_TOKENS > ceilings.maxOutputTokensCeiling) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message:
          "default maxOutputTokens exceeds configured ceiling; supply an explicit supported value",
      });
    }
  } else if (tokensOpt.value > ceilings.maxOutputTokensCeiling) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "maxOutputTokens exceeds effective ceiling",
    });
  }
  if (tokensOpt.value !== undefined && !honorsOutputTokenLimit) {
    return failure({
      code: "UNSUPPORTED_CAPABILITY",
      message: "adapter cannot honor requested output-token limit",
    });
  }
  // Even defaults require honors when we send a token limit to the adapter.
  if (!honorsOutputTokenLimit) {
    return failure({
      code: "UNSUPPORTED_CAPABILITY",
      message: "adapter cannot honor output-token limits required by this profile",
    });
  }

  let timeoutMs =
    timeoutOpt.value === undefined ? DEFAULT_TIMEOUT_MS : timeoutOpt.value;
  if (timeoutOpt.value === undefined) {
    if (DEFAULT_TIMEOUT_MS > ceilings.timeoutMsCeiling) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message:
          "default timeoutMs exceeds configured ceiling; supply an explicit supported value",
      });
    }
  } else if (timeoutOpt.value > ceilings.timeoutMsCeiling) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "timeoutMs exceeds effective ceiling",
    });
  }

  let maxResponseUtf8Bytes = ceilings.maxResponseUtf8Bytes;
  if (responseOpt.value !== undefined) {
    if (responseOpt.value > ceilings.maxResponseUtf8Bytes) {
      return failure({
        code: "LIMIT_EXCEEDED",
        message: "maxResponseUtf8Bytes exceeds effective ceiling",
      });
    }
    maxResponseUtf8Bytes = responseOpt.value;
  }

  const ownedContext = contextResult.value;
  const ownedProfile = profileResult.value;
  const serialization = JSON.stringify({
    correlationId: correlationResult.value,
    purpose: purposeResult.value,
    taskText: taskResult.value,
    context: ownedContext,
    responseProfile: ownedProfile,
    maxOutputTokens,
    timeoutMs,
    maxResponseUtf8Bytes,
  });
  const preparedBytes = utf8ByteLength(serialization);
  if (preparedBytes > ceilings.maxPreparedRequestUtf8Bytes) {
    return failure({
      code: "LIMIT_EXCEEDED",
      message: "prepared request exceeds size ceiling",
    });
  }
  if (
    ceilings.maxPreparedRequestUtf8Bytes < MAX_PREPARED_REQUEST_UTF8_BYTES &&
    // adapter/input bound check against capability advertisement
    false
  ) {
    // placeholder retained for clarity; prepared size already checked
  }

  const packetWithoutInvocationId = Object.freeze({
    correlationId: correlationResult.value,
    purpose: purposeResult.value as BrainInvocationPurpose,
    taskText: taskResult.value,
    context: ownedContext,
    responseProfile: ownedProfile,
    maxOutputTokens,
    maxResponseUtf8Bytes,
    preparedRequestUtf8Bytes: preparedBytes,
  });

  return success(
    Object.freeze({
      correlationId: correlationResult.value,
      purpose: purposeResult.value as BrainInvocationPurpose,
      taskText: taskResult.value,
      context: ownedContext,
      responseProfile: ownedProfile,
      limits: Object.freeze({
        maxOutputTokens,
        timeoutMs,
        maxResponseUtf8Bytes,
        maxPreparedRequestUtf8Bytes: ceilings.maxPreparedRequestUtf8Bytes,
        maxOutputTokensCeiling: ceilings.maxOutputTokensCeiling,
        timeoutMsCeiling: ceilings.timeoutMsCeiling,
      }),
      preparedRequestUtf8Bytes: preparedBytes,
      packetWithoutInvocationId,
    }),
  );
}

export function assertIdBounds(value: string, label: string): string | undefined {
  if (!isNonemptyBoundedId(value)) {
    return `${label} must be a nonempty id ≤${MAX_ID_UTF8_BYTES} UTF-8 bytes`;
  }
  return undefined;
}
