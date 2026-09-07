/**
 * Strict ENGINEERING_EDIT_PROPOSAL_JSON outer envelope parser.
 * Does not parse or repair embedded reasoning JSON.
 */

import type { Result } from "../../domain/result.js";
import { failure, success } from "../../domain/result.js";
import {
  EDIT_ENVELOPE_SCHEMA_VERSION,
  MAX_AFTER_TEXT_UTF8_BYTES,
  MAX_EMBEDDED_REASONING_UTF8_BYTES,
  MAX_MUTATION_TARGETS,
  MAX_SUPPORTING_CLAIM_IDS,
  MAX_TOTAL_AFTER_TEXT_UTF8_BYTES,
  MIN_MUTATION_TARGETS,
  MIN_SUPPORTING_CLAIM_IDS,
  isNonemptyBoundedId,
  textToUtf8Bytes,
  utf8ByteLength,
} from "./bounds.js";

const OWN = Object.prototype.hasOwnProperty;
const ROOT_KEYS = new Set([
  "schemaVersion",
  "proposalId",
  "reasoningProposalJson",
  "changes",
]);
const CHANGE_KEYS = new Set([
  "changeId",
  "kind",
  "targetId",
  "supportingClaimIds",
  "afterText",
]);
const KINDS = new Set(["REPLACE_TEXT", "CREATE_TEXT"]);

export type ParsedEditChange = {
  readonly changeId: string;
  readonly kind: "REPLACE_TEXT" | "CREATE_TEXT";
  readonly targetId: string;
  readonly supportingClaimIds: readonly string[];
  readonly afterText: string;
  readonly afterBytes: Uint8Array;
};

export type ParsedEditEnvelope = {
  readonly schemaVersion: 1;
  readonly proposalId: string;
  readonly reasoningProposalJson: string;
  readonly changes: readonly ParsedEditChange[];
};

export type EnvelopeParseFailure = {
  readonly code: "ENVELOPE_INVALID";
  readonly message: string;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function rejectUnknown(
  obj: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): EnvelopeParseFailure | undefined {
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      return {
        code: "ENVELOPE_INVALID",
        message: `${label} contains forbidden or unknown field '${key}'`,
      };
    }
  }
  return undefined;
}

export function parseEditProposalEnvelope(
  text: string,
): Result<ParsedEditEnvelope, EnvelopeParseFailure> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "edit proposal is not valid JSON",
    });
  }
  if (!isPlainObject(decoded)) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "edit proposal root must be a plain object",
    });
  }
  const unknown = rejectUnknown(decoded, ROOT_KEYS, "edit envelope");
  if (unknown) {
    return failure(unknown);
  }
  if (decoded.schemaVersion !== EDIT_ENVELOPE_SCHEMA_VERSION) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "unsupported edit envelope schemaVersion",
    });
  }
  if (typeof decoded.proposalId !== "string" || !isNonemptyBoundedId(decoded.proposalId)) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "proposalId is invalid",
    });
  }
  if (typeof decoded.reasoningProposalJson !== "string") {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "reasoningProposalJson must be a string",
    });
  }
  if (
    utf8ByteLength(decoded.reasoningProposalJson) < 1 ||
    utf8ByteLength(decoded.reasoningProposalJson) > MAX_EMBEDDED_REASONING_UTF8_BYTES
  ) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "reasoningProposalJson exceeds byte bounds",
    });
  }
  if (!Array.isArray(decoded.changes)) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "changes must be an array",
    });
  }
  if (
    decoded.changes.length < MIN_MUTATION_TARGETS ||
    decoded.changes.length > MAX_MUTATION_TARGETS
  ) {
    return failure({
      code: "ENVELOPE_INVALID",
      message: "changes count outside 1..4",
    });
  }

  const changes: ParsedEditChange[] = [];
  const changeIds = new Set<string>();
  const targetIds = new Set<string>();
  let totalAfter = 0;

  for (let i = 0; i < decoded.changes.length; i += 1) {
    const raw = decoded.changes[i];
    const label = `changes[${i}]`;
    if (!isPlainObject(raw)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label} must be a plain object`,
      });
    }
    const bad = rejectUnknown(raw, CHANGE_KEYS, label);
    if (bad) {
      return failure(bad);
    }
    if (typeof raw.changeId !== "string" || !isNonemptyBoundedId(raw.changeId)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.changeId is invalid`,
      });
    }
    if (changeIds.has(raw.changeId)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `duplicate changeId '${raw.changeId}'`,
      });
    }
    changeIds.add(raw.changeId);
    if (typeof raw.kind !== "string" || !KINDS.has(raw.kind)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.kind is unsupported`,
      });
    }
    if (typeof raw.targetId !== "string" || !isNonemptyBoundedId(raw.targetId)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.targetId is invalid`,
      });
    }
    if (targetIds.has(raw.targetId)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `duplicate targetId '${raw.targetId}'`,
      });
    }
    targetIds.add(raw.targetId);
    if (!OWN.call(raw, "supportingClaimIds") || !Array.isArray(raw.supportingClaimIds)) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.supportingClaimIds must be an array`,
      });
    }
    if (
      raw.supportingClaimIds.length < MIN_SUPPORTING_CLAIM_IDS ||
      raw.supportingClaimIds.length > MAX_SUPPORTING_CLAIM_IDS
    ) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.supportingClaimIds count outside bounds`,
      });
    }
    const claimIds: string[] = [];
    const seenClaims = new Set<string>();
    for (const item of raw.supportingClaimIds) {
      if (typeof item !== "string" || !isNonemptyBoundedId(item)) {
        return failure({
          code: "ENVELOPE_INVALID",
          message: `${label}.supportingClaimIds entry invalid`,
        });
      }
      if (seenClaims.has(item)) {
        return failure({
          code: "ENVELOPE_INVALID",
          message: `${label}.supportingClaimIds contains duplicates`,
        });
      }
      seenClaims.add(item);
      claimIds.push(item);
    }
    if (typeof raw.afterText !== "string") {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.afterText must be a string`,
      });
    }
    const afterBytes = textToUtf8Bytes(raw.afterText);
    if (afterBytes === undefined) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.afterText is not valid UTF-8 text (NUL or lone surrogate)`,
      });
    }
    if (afterBytes.byteLength > MAX_AFTER_TEXT_UTF8_BYTES) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: `${label}.afterText exceeds per-target byte ceiling`,
      });
    }
    totalAfter += afterBytes.byteLength;
    if (totalAfter > MAX_TOTAL_AFTER_TEXT_UTF8_BYTES) {
      return failure({
        code: "ENVELOPE_INVALID",
        message: "total afterText exceeds combined byte ceiling",
      });
    }
    changes.push(
      Object.freeze({
        changeId: raw.changeId,
        kind: raw.kind as "REPLACE_TEXT" | "CREATE_TEXT",
        targetId: raw.targetId,
        supportingClaimIds: Object.freeze(claimIds),
        afterText: raw.afterText,
        afterBytes,
      }),
    );
  }

  return success(
    Object.freeze({
      schemaVersion: 1 as const,
      proposalId: decoded.proposalId,
      reasoningProposalJson: decoded.reasoningProposalJson,
      changes: Object.freeze(changes),
    }),
  );
}
