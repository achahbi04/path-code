/**
 * Phase 5G-R1 — trusted-host autonomy policy for General Engineering Session.
 *
 * REVIEW mode keeps the START / SCOPE / APPLY / CHECK gates.
 * BOUNDED mode requires exactly one RUN session-policy authorization; the host
 * may then mint existing Scope/Edit/Validation authorities when every proposed
 * action stays inside this finite envelope. The model never mints authority.
 *
 * Numeric caps below deliberately mirror `general-session.mjs` GENERAL_SESSION_*
 * exports (kept local to avoid a circular import with that host module).
 */

import { COMPACT_NAME } from "./banner.mjs";
import { prefixUntrustedLines } from "./escape.mjs";

/** @typedef {"review" | "bounded"} AutonomyMode */

export const AUTONOMY_MODES = Object.freeze(["review", "bounded"]);

const MAX_PROVIDER_INVOCATIONS = 3;
const SCOPE_OUTPUT_TOKENS = 4_096;
const EDIT_OUTPUT_TOKENS = 8_192;
const TRANSPORT_ATTEMPTS = 3;
const CUMULATIVE_OUTPUT_TOKENS = 24_576;
const REQUEST_BODY_BYTES = 262_144;
const CUMULATIVE_REQUEST_BODY_BYTES = 786_432;
const BRAIN_TIMEOUT_MS = 120_000;

/**
 * Aggregate UTF-8 budget for provider-visible approved source bodies in one
 * General Session. Finite and equal to the per-request body budget.
 */
export const BOUNDED_MAX_APPROVED_SOURCE_BYTES = REQUEST_BODY_BYTES;

/** Mutation kinds the host may apply under BOUNDED policy without escalation. */
export const BOUNDED_ALLOWED_MUTATION_KINDS = Object.freeze(["REPLACE_TEXT", "CREATE_TEXT"]);

/**
 * @param {string | null | undefined} raw
 * @returns {{ ok: true, mode: AutonomyMode } | { ok: false, message: string }}
 */
export function parseAutonomyMode(raw) {
  if (raw == null || raw === "") {
    return { ok: true, mode: "review" };
  }
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "review") {
    return { ok: true, mode: "review" };
  }
  if (normalized === "bounded") {
    return { ok: true, mode: "bounded" };
  }
  if (normalized === "unlimited") {
    return {
      ok: false,
      message:
        "Refused autonomy mode 'unlimited': this phase supports only 'review' or 'bounded'.",
    };
  }
  return {
    ok: false,
    message: `Unknown --autonomy value '${raw}'. Use --autonomy review|bounded.`,
  };
}

/**
 * Conservative V1 defaults, reused from existing 5G finite caps.
 * @param {{
 *   workspaceId: string,
 *   taskText: string,
 *   projectRoot: string,
 *   branch: string,
 *   headOid: string,
 *   modelId: string,
 *   maxEditableTargets: number,
 *   maxContextPaths: number,
 *   validationCandidateIds: readonly string[],
 *   plannedSummaries: readonly string[],
 * }} input
 */
export function buildBoundedSessionPolicy(input) {
  return Object.freeze({
    workspaceId: input.workspaceId,
    taskText: input.taskText,
    projectRoot: input.projectRoot,
    branch: input.branch,
    headOid: input.headOid,
    provider: "openai",
    modelId: input.modelId,
    maxModelCalls: MAX_PROVIDER_INVOCATIONS,
    maxEditableTargets: input.maxEditableTargets,
    maxContextPaths: input.maxContextPaths,
    maxApprovedSourceBytes: BOUNDED_MAX_APPROVED_SOURCE_BYTES,
    allowedMutationKinds: BOUNDED_ALLOWED_MUTATION_KINDS,
    validationCandidateIds: Object.freeze([...input.validationCandidateIds]),
    plannedSummaries: Object.freeze([...input.plannedSummaries]),
    recoveryProtection: "REQUIRED",
    gitWrites: "NONE",
    dependencyInstallation: "FORBIDDEN",
    sensitivePaths: "EXCLUDED",
    automaticProviderRetries: "NONE",
    transportAttempts: TRANSPORT_ATTEMPTS,
    scopeOutputTokens: SCOPE_OUTPUT_TOKENS,
    editOutputTokens: EDIT_OUTPUT_TOKENS,
    cumulativeOutputTokens: CUMULATIVE_OUTPUT_TOKENS,
    requestBodyBytes: REQUEST_BODY_BYTES,
    cumulativeRequestBodyBytes: CUMULATIVE_REQUEST_BODY_BYTES,
    brainTimeoutMs: BRAIN_TIMEOUT_MS,
  });
}

/**
 * @param {any} policy
 * @param {{
 *   workingTreeSummary: string,
 *   storeRoot: string,
 *   stateSource: string,
 * }} extras
 */
export function renderBoundedRunDisclosure(policy, extras) {
  const lines = [
    "",
    `${COMPACT_NAME} — Bounded Engineering Session`,
    "",
    `Project:                    ${policy.projectRoot}`,
    `Branch / HEAD:              ${policy.branch} @ ${policy.headOid.slice(0, 12)}`,
    `Existing dirty state:       ${extras.workingTreeSummary}`,
    `Provider / model:           ${policy.provider} / ${policy.modelId}`,
    `Maximum model calls:        ${policy.maxModelCalls}`,
    `Maximum editable files:     ${policy.maxEditableTargets}`,
    `Maximum read-context files: ${policy.maxContextPaths}`,
    `Aggregate source-byte cap:  ${policy.maxApprovedSourceBytes}`,
    `Allowed mutation kinds:     ${policy.allowedMutationKinds.join(", ")}`,
    "Validation candidates:",
  ];
  for (const summary of policy.plannedSummaries) {
    lines.push(`  - ${summary}`);
  }
  if (policy.plannedSummaries.length === 0) {
    lines.push("  (none admitted)");
  }
  lines.push(
    `Recovery:                   ${policy.recoveryProtection}`,
    `Git writes:                 ${policy.gitWrites}`,
    `Dependency installation:    ${policy.dependencyInstallation}`,
    `Sensitive paths:            ${policy.sensitivePaths}`,
    `Automatic provider retries: ${policy.automaticProviderRetries}`,
    `Recovery store:             ${extras.storeRoot} (${extras.stateSource})`,
    "",
    "Inside this exact envelope PATH Code may autonomously:",
    "  - plan scope;",
    "  - read admitted non-sensitive files;",
    "  - propose/apply bounded text changes;",
    "  - create recovery checkpoint;",
    "  - run admitted validation;",
    "  - re-observe and report.",
    "",
    "It will STOP before crossing any undeclared boundary.",
    "",
    "Execution-risk policy (read once):",
    "  Admitted validation may execute repository-owned code with ordinary OS",
    "  permissions. Recovery protects PATH Code's approved source mutations only;",
    "  it cannot undo arbitrary side effects from repository validation code.",
    "  No broader sandboxing claim is made.",
    "",
    "Your task:",
    prefixUntrustedLines(policy.taskText).trimEnd(),
    "",
  );
  return `${lines.join("\n")}\n`;
}

/**
 * Evaluate whether an admitted scope stays inside the RUN policy.
 * @param {any} policy
 * @param {any} approved
 * @param {{ aggregateSourceBytes?: number }} [measured]
 */
export function evaluateScopeAgainstPolicy(policy, approved, measured = {}) {
  const editable = approved.editableTargets.length;
  const context = approved.contextPaths.length;
  if (editable > policy.maxEditableTargets) {
    return {
      ok: false,
      code: "AUTONOMY_ESCALATION_REQUIRED",
      reason: `editable target count ${editable} exceeds policy max ${policy.maxEditableTargets}`,
    };
  }
  if (context > policy.maxContextPaths) {
    return {
      ok: false,
      code: "AUTONOMY_ESCALATION_REQUIRED",
      reason: `read-context count ${context} exceeds policy max ${policy.maxContextPaths}`,
    };
  }
  for (const target of approved.editableTargets) {
    if (!policy.allowedMutationKinds.includes(target.changeKind)) {
      return {
        ok: false,
        code: "AUTONOMY_ESCALATION_REQUIRED",
        reason: `mutation kind ${target.changeKind} is outside the RUN policy`,
      };
    }
  }
  const bytes = measured.aggregateSourceBytes;
  if (typeof bytes === "number" && bytes > policy.maxApprovedSourceBytes) {
    return {
      ok: false,
      code: "AUTONOMY_ESCALATION_REQUIRED",
      reason:
        `approved source bodies total ${bytes} bytes, exceeding aggregate cap ` +
        `${policy.maxApprovedSourceBytes}`,
    };
  }
  for (const id of approved.validationCandidateIds) {
    if (!policy.validationCandidateIds.includes(id)) {
      return {
        ok: false,
        code: "AUTONOMY_ESCALATION_REQUIRED",
        reason: `validation candidate ${id} was not disclosed in the RUN policy`,
      };
    }
  }
  return { ok: true };
}

/**
 * Edit-time escalation checks before the host mints EditAuthorization.
 * @param {any} policy
 * @param {any} review
 * @param {any} approved
 */
export function evaluateEditAgainstPolicy(policy, review, approved) {
  const approvedEditable = new Set(
    approved.editableTargets.map((t) => t.relativePath),
  );
  for (const item of review.view.order) {
    if (!approvedEditable.has(item.relativePath)) {
      return {
        ok: false,
        code: "AUTONOMY_ESCALATION_REQUIRED",
        reason: `edit target ${item.relativePath} is outside the admitted scope`,
      };
    }
    if (!policy.allowedMutationKinds.includes(item.kind)) {
      return {
        ok: false,
        code: "AUTONOMY_ESCALATION_REQUIRED",
        reason: `edit kind ${item.kind} is outside the RUN policy`,
      };
    }
  }
  if (review.view.order.length > policy.maxEditableTargets) {
    return {
      ok: false,
      code: "AUTONOMY_ESCALATION_REQUIRED",
      reason: `edit target count exceeds policy max ${policy.maxEditableTargets}`,
    };
  }
  return { ok: true };
}

/**
 * Validation-time escalation: prepared checks must be the RUN-disclosed set.
 * @param {any} policy
 * @param {any} preparedPlan
 */
export function evaluateValidationAgainstPolicy(policy, preparedPlan) {
  for (const check of preparedPlan.checks) {
    if (!policy.validationCandidateIds.includes(check.id)) {
      return {
        ok: false,
        code: "AUTONOMY_ESCALATION_REQUIRED",
        reason: `prepared check ${check.id} was not in the RUN-disclosed candidate set`,
      };
    }
  }
  return { ok: true };
}

/**
 * @param {string} stage
 * @param {string} detail
 */
export function renderEscalation(stage, detail) {
  return (
    `\nAUTONOMY_ESCALATION_REQUIRED — ${stage}\n` +
    `${detail}\n` +
    "Stopped before crossing the undeclared boundary. No automatic widening.\n"
  );
}
