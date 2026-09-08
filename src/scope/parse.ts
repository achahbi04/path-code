/**
 * Phase 5G scope plan parser.
 *
 * Untrusted text in, owned frozen data out. Unknown fields, accessor
 * properties, prototype-bearing objects and out-of-bounds sizes are refused —
 * never repaired. The parser answers "is this a well-formed plan", never
 * "is this plan allowed"; that is validate.ts.
 */

import type { Result } from "../domain/result.js";
import { failure, success } from "../domain/result.js";
import {
  ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION,
  MAX_SCOPE_CONTEXT_PATHS,
  MAX_SCOPE_EDITABLE_TARGETS,
  MAX_SCOPE_NOTE_UTF8_BYTES,
  MAX_SCOPE_NOTES,
  MAX_SCOPE_PLAN_UTF8_BYTES,
  MAX_SCOPE_REASON_UTF8_BYTES,
  MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES,
  MAX_SCOPE_TASK_SUMMARY_UTF8_BYTES,
  MAX_SCOPE_VALIDATION_CANDIDATE_IDS,
  utf8ByteLength,
} from "./bounds.js";
import type {
  EngineeringScopePlan,
  ProposedEditableTarget,
  ScopeChangeKind,
  ScopeFailure,
  ScopeFailureCode,
} from "./types.js";

const OWN = Object.prototype.hasOwnProperty;

const ROOT_KEYS = new Set([
  "schemaVersion",
  "taskSummary",
  "editableTargets",
  "contextPaths",
  "validationCandidateIds",
  "assumptions",
  "limitations",
]);

const TARGET_KEYS = new Set(["relativePath", "changeKind", "reason"]);

const CHANGE_KINDS = new Set<ScopeChangeKind>(["REPLACE_TEXT", "CREATE_TEXT"]);

/** Candidate ids are host-minted; the model may only echo one back. */
const CANDIDATE_ID = /^[a-z0-9][a-z0-9._:-]{0,63}$/;

function fail(code: ScopeFailureCode, message: string): ScopeFailure {
  return { code, message };
}

function isPlainOwnObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readDataProperty(
  object: Record<string, unknown>,
  key: string,
): { ok: true; value: unknown } | { ok: false; detail: string } {
  if (!OWN.call(object, key)) {
    return { ok: false, detail: `'${key}' is required` };
  }
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (
    descriptor !== undefined &&
    (descriptor.get !== undefined || descriptor.set !== undefined)
  ) {
    return { ok: false, detail: `'${key}' must be a data property` };
  }
  return { ok: true, value: object[key] };
}

function parseBoundedStringArray(
  raw: unknown,
  label: string,
  maxItems: number,
  maxItemBytes: number,
): Result<readonly string[], ScopeFailure> {
  if (!Array.isArray(raw)) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", `${label} must be an array`),
    );
  }
  if (raw.length > maxItems) {
    return failure(
      fail(
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
        `${label} exceeds the ${maxItems}-item bound`,
      ),
    );
  }
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i];
    if (typeof item !== "string" || item.length === 0) {
      return failure(
        fail("SCOPE_PLAN_INVALID_FIELD", `${label}[${i}] must be a nonempty string`),
      );
    }
    if (utf8ByteLength(item) > maxItemBytes) {
      return failure(
        fail(
          "SCOPE_PLAN_BOUNDS_EXCEEDED",
          `${label}[${i}] exceeds the ${maxItemBytes}-byte bound`,
        ),
      );
    }
    out.push(item);
  }
  return success(Object.freeze(out));
}

function parseEditableTarget(
  raw: unknown,
  index: number,
): Result<ProposedEditableTarget, ScopeFailure> {
  const label = `editableTargets[${index}]`;
  if (!isPlainOwnObject(raw)) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", `${label} must be a plain data object`),
    );
  }
  for (const key of Object.keys(raw)) {
    if (!TARGET_KEYS.has(key)) {
      return failure(
        fail("SCOPE_PLAN_UNKNOWN_FIELD", `${label} carries unknown field '${key}'`),
      );
    }
  }

  const relativePath = readDataProperty(raw, "relativePath");
  if (!relativePath.ok) {
    return failure(
      fail("SCOPE_PLAN_MISSING_FIELD", `${label}.${relativePath.detail}`),
    );
  }
  if (
    typeof relativePath.value !== "string" ||
    relativePath.value.length === 0
  ) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", `${label}.relativePath must be a string`),
    );
  }
  if (utf8ByteLength(relativePath.value) > MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES) {
    return failure(
      fail(
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
        `${label}.relativePath exceeds the relative-path byte bound`,
      ),
    );
  }

  const changeKind = readDataProperty(raw, "changeKind");
  if (!changeKind.ok) {
    return failure(
      fail("SCOPE_PLAN_MISSING_FIELD", `${label}.${changeKind.detail}`),
    );
  }
  if (
    typeof changeKind.value !== "string" ||
    !CHANGE_KINDS.has(changeKind.value as ScopeChangeKind)
  ) {
    return failure(
      fail(
        "SCOPE_PLAN_INVALID_FIELD",
        `${label}.changeKind must be REPLACE_TEXT or CREATE_TEXT`,
      ),
    );
  }

  const reason = readDataProperty(raw, "reason");
  if (!reason.ok) {
    return failure(fail("SCOPE_PLAN_MISSING_FIELD", `${label}.${reason.detail}`));
  }
  if (typeof reason.value !== "string" || reason.value.length === 0) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", `${label}.reason must be a nonempty string`),
    );
  }
  if (utf8ByteLength(reason.value) > MAX_SCOPE_REASON_UTF8_BYTES) {
    return failure(
      fail(
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
        `${label}.reason exceeds the ${MAX_SCOPE_REASON_UTF8_BYTES}-byte bound`,
      ),
    );
  }

  return success(
    Object.freeze({
      relativePath: relativePath.value,
      changeKind: changeKind.value as ScopeChangeKind,
      reason: reason.value,
    }),
  );
}

/**
 * Parse untrusted ENGINEERING_SCOPE_PLAN_JSON text into an owned frozen plan.
 */
export function parseEngineeringScopePlan(
  untrustedText: string,
): Result<EngineeringScopePlan, ScopeFailure> {
  if (typeof untrustedText !== "string") {
    return failure(
      fail("SCOPE_PLAN_NOT_OBJECT", "scope plan text must be a string"),
    );
  }
  if (utf8ByteLength(untrustedText) > MAX_SCOPE_PLAN_UTF8_BYTES) {
    return failure(
      fail(
        "SCOPE_PLAN_TOO_LARGE",
        `scope plan exceeds the ${MAX_SCOPE_PLAN_UTF8_BYTES}-byte bound`,
      ),
    );
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(untrustedText) as unknown;
  } catch {
    return failure(
      fail("SCOPE_PLAN_MALFORMED_JSON", "scope plan is not parseable JSON"),
    );
  }
  if (!isPlainOwnObject(decoded)) {
    return failure(
      fail("SCOPE_PLAN_NOT_OBJECT", "scope plan must be a plain JSON object"),
    );
  }
  for (const key of Object.keys(decoded)) {
    if (!ROOT_KEYS.has(key)) {
      return failure(
        fail("SCOPE_PLAN_UNKNOWN_FIELD", `scope plan carries unknown field '${key}'`),
      );
    }
  }
  for (const required of ROOT_KEYS) {
    if (!OWN.call(decoded, required)) {
      return failure(
        fail("SCOPE_PLAN_MISSING_FIELD", `scope plan is missing '${required}'`),
      );
    }
  }

  if (decoded.schemaVersion !== ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION) {
    return failure(
      fail(
        "SCOPE_PLAN_UNSUPPORTED_VERSION",
        "scope plan schemaVersion is not supported",
      ),
    );
  }

  const taskSummary = decoded.taskSummary;
  if (typeof taskSummary !== "string" || taskSummary.length === 0) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", "taskSummary must be a nonempty string"),
    );
  }
  if (utf8ByteLength(taskSummary) > MAX_SCOPE_TASK_SUMMARY_UTF8_BYTES) {
    return failure(
      fail(
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
        `taskSummary exceeds the ${MAX_SCOPE_TASK_SUMMARY_UTF8_BYTES}-byte bound`,
      ),
    );
  }

  const rawTargets = decoded.editableTargets;
  if (!Array.isArray(rawTargets)) {
    return failure(
      fail("SCOPE_PLAN_INVALID_FIELD", "editableTargets must be an array"),
    );
  }
  if (rawTargets.length < 1) {
    return failure(
      fail(
        "SCOPE_NO_EDITABLE_TARGET",
        "a scope plan must name at least one editable target",
      ),
    );
  }
  if (rawTargets.length > MAX_SCOPE_EDITABLE_TARGETS) {
    return failure(
      fail(
        "SCOPE_PLAN_BOUNDS_EXCEEDED",
        `editableTargets exceeds the ${MAX_SCOPE_EDITABLE_TARGETS}-target bound`,
      ),
    );
  }
  const targets: ProposedEditableTarget[] = [];
  const seenTargetPaths = new Set<string>();
  for (let i = 0; i < rawTargets.length; i += 1) {
    const parsed = parseEditableTarget(rawTargets[i], i);
    if (!parsed.ok) {
      return parsed;
    }
    if (seenTargetPaths.has(parsed.value.relativePath)) {
      return failure(
        fail(
          "SCOPE_PLAN_DUPLICATE_PATH",
          `editableTargets repeats '${parsed.value.relativePath}'`,
        ),
      );
    }
    seenTargetPaths.add(parsed.value.relativePath);
    targets.push(parsed.value);
  }

  const contextPaths = parseBoundedStringArray(
    decoded.contextPaths,
    "contextPaths",
    MAX_SCOPE_CONTEXT_PATHS,
    MAX_SCOPE_RELATIVE_PATH_UTF8_BYTES,
  );
  if (!contextPaths.ok) {
    return contextPaths;
  }
  const seenContext = new Set<string>();
  for (const path of contextPaths.value) {
    if (seenContext.has(path)) {
      return failure(
        fail("SCOPE_PLAN_DUPLICATE_PATH", `contextPaths repeats '${path}'`),
      );
    }
    seenContext.add(path);
  }

  const candidateIds = parseBoundedStringArray(
    decoded.validationCandidateIds,
    "validationCandidateIds",
    MAX_SCOPE_VALIDATION_CANDIDATE_IDS,
    64,
  );
  if (!candidateIds.ok) {
    return candidateIds;
  }
  const seenCandidates = new Set<string>();
  for (const id of candidateIds.value) {
    if (!CANDIDATE_ID.test(id)) {
      return failure(
        fail(
          "SCOPE_PLAN_INVALID_FIELD",
          `validationCandidateIds carries a malformed id '${id}'`,
        ),
      );
    }
    if (seenCandidates.has(id)) {
      return failure(
        fail(
          "SCOPE_PLAN_DUPLICATE_PATH",
          `validationCandidateIds repeats '${id}'`,
        ),
      );
    }
    seenCandidates.add(id);
  }

  const assumptions = parseBoundedStringArray(
    decoded.assumptions,
    "assumptions",
    MAX_SCOPE_NOTES,
    MAX_SCOPE_NOTE_UTF8_BYTES,
  );
  if (!assumptions.ok) {
    return assumptions;
  }
  const limitations = parseBoundedStringArray(
    decoded.limitations,
    "limitations",
    MAX_SCOPE_NOTES,
    MAX_SCOPE_NOTE_UTF8_BYTES,
  );
  if (!limitations.ok) {
    return limitations;
  }

  return success(
    Object.freeze({
      schemaVersion: ENGINEERING_SCOPE_PLAN_SCHEMA_VERSION,
      taskSummary,
      editableTargets: Object.freeze(targets),
      contextPaths: contextPaths.value,
      validationCandidateIds: candidateIds.value,
      assumptions: assumptions.value,
      limitations: limitations.value,
    }),
  );
}
