/**
 * Safe trial outcome rendering — owner artifacts only, no secrets/bodies.
 */

import { COMPACT_NAME, ASCII_NAME } from "./banner.mjs";
import { escapeForTerminalDisplay } from "./escape.mjs";

/**
 * @param {string | null | undefined} originCode
 */
function stageForPreExecutionOrigin(originCode) {
  switch (originCode) {
    case "GATE2_PREPARE_FAILED":
      return "PREPARING_EXECUTION_EVIDENCE";
    case "AUTHORIZATION_INCOMPATIBLE":
    case "CATALOG_INVALID":
    case "INSUFFICIENT_EXECUTION_BUDGET":
      return "RECHECKING_EXECUTION_PRECONDITIONS";
    case "NO_EXECUTION_OBLIGATIONS":
      return "BINDING";
    default:
      return "PRE_EXECUTION";
  }
}

/**
 * @param {{
 *   unicode?: boolean,
 *   label?: string,
 *   workspaceRoot?: string | null,
 *   sourcePath?: string,
 *   typecheck?: string,
 *   regression?: string,
 *   gate2?: string,
 *   modelCalls?: string,
 *   note?: string,
 *   mutationDisposition?: string | null,
 *   preExecution?: { stage: string, reason: string } | null,
 * }} input
 */
export function renderTrialReport(input) {
  const name = input.unicode === false ? ASCII_NAME : COMPACT_NAME;
  const lines = [
    `${name} — Trial 1`,
    "",
    escapeForTerminalDisplay(input.label ?? "NOT_ESTABLISHED"),
  ];
  if (input.preExecution) {
    lines.push("  Validation stopped before execution");
    lines.push(
      `  Stage:        ${escapeForTerminalDisplay(input.preExecution.stage)}`,
    );
    lines.push(
      `  Reason:       ${escapeForTerminalDisplay(input.preExecution.reason)}`,
    );
  }
  if (input.sourcePath) {
    lines.push(`  Source:       ${escapeForTerminalDisplay(input.sourcePath)}`);
  }
  if (input.typecheck) {
    lines.push(`  Typecheck:    ${escapeForTerminalDisplay(input.typecheck)}`);
  }
  if (input.regression) {
    lines.push(`  Regression:   ${escapeForTerminalDisplay(input.regression)}`);
  }
  if (input.gate2) {
    lines.push(`  Gate 2:       ${escapeForTerminalDisplay(input.gate2)}`);
  }
  if (input.modelCalls) {
    lines.push(`  Model calls:  ${escapeForTerminalDisplay(input.modelCalls)}`);
  }
  if (input.mutationDisposition) {
    lines.push(
      `  Mutation:     ${escapeForTerminalDisplay(input.mutationDisposition)}`,
    );
  }
  lines.push("  Git commit:   none");
  lines.push("");
  if (input.workspaceRoot) {
    lines.push(
      `Workspace retained: ${escapeForTerminalDisplay(input.workspaceRoot)}`,
    );
  }
  lines.push(
    "Scope: synthetic trial and declared inputs; not whole-project correctness.",
  );
  if (input.note) {
    lines.push(escapeForTerminalDisplay(input.note));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Map owner validation outcome to display fields.
 * @param {any} outcome MutationValidationOutcome value
 */
export function summarizeValidationOutcome(outcome) {
  const label = outcome?.label ?? "MUTATION_NOT_DISPATCHED";
  const cycle = outcome?.artifacts?.cycle?.record;
  const terminal = cycle?.terminalState ?? null;
  const originCode =
    typeof cycle?.originCode === "string" ? cycle.originCode : null;
  const validationDisposition =
    typeof cycle?.validationDisposition === "string"
      ? cycle.validationDisposition
      : null;
  const eng = outcome?.artifacts?.cycle?.artifacts?.engineeringRun;
  const checks =
    eng?.validationResult?.checkResults ??
    eng?.checkResults ??
    null;
  let typecheck = "not run";
  let regression = "not run";
  if (Array.isArray(checks)) {
    for (const c of checks) {
      if (c?.kind === "TYPECHECK" || c?.checkId === "typecheck") {
        typecheck = String(c.verdict ?? "unknown");
        if (c.verdict === "PASS") {
          typecheck = "PASS (emitted trial build)";
        }
      }
      if (c?.kind === "TARGETED_TEST" || c?.checkId === "targeted") {
        regression = String(c.verdict ?? "unknown");
      }
    }
  }
  if (
    (typecheck === "FAIL" || typecheck === "REFUSED") &&
    regression === "NOT_ATTEMPTED"
  ) {
    regression = "not run (blocked by prior TYPECHECK)";
  }
  const gate2 =
    label === "MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED"
      ? "configured evidence accepted"
      : terminal
        ? `not established (${terminal})`
        : "not established";

  let preExecution = null;
  const notDispatched =
    validationDisposition === "NOT_DISPATCHED_FAILED" ||
    validationDisposition === "NOT_DISPATCHED_BUDGET" ||
    validationDisposition === "NOT_DISPATCHED_STOP";
  if (notDispatched && typecheck === "not run" && regression === "not run") {
    const reason = originCode ?? validationDisposition ?? "UNKNOWN";
    preExecution = {
      stage: stageForPreExecutionOrigin(originCode),
      reason,
    };
  }

  return {
    label,
    typecheck,
    regression,
    gate2,
    terminal,
    originCode,
    validationDisposition,
    preExecution,
  };
}
