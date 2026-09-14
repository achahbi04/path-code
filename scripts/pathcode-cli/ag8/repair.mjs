/**
 * AG8 — same-session repair helpers (PATH → Antigravity continue).
 * Pure functions; no I/O.
 */

export const AG8_MAX_REPAIR_ATTEMPTS = 2;
export const AG8_REPAIR_STDERR_BOUND = 2_000;

/**
 * Build concrete failure feedback for the SAME engineering conversation.
 *
 * @param {{
 *   classification?: string,
 *   reason?: string,
 *   checks?: Array<{
 *     id?: string,
 *     kind?: string,
 *     command?: string,
 *     ok?: boolean,
 *     stderrTail?: string,
 *     stdoutTail?: string,
 *     exitCode?: number,
 *   }>,
 * } | null | undefined} validation
 * @param {{
 *   stderrBound?: number,
 *   advisoryText?: string | null,
 *   peerNotes?: string | null,
 *   collabHandoff?: string | null,
 * }} [options]
 * @returns {string}
 */
export function buildValidationRepairPrompt(validation, options = {}) {
  const bound =
    typeof options.stderrBound === "number" && options.stderrBound > 0
      ? options.stderrBound
      : AG8_REPAIR_STDERR_BOUND;
  const checks = Array.isArray(validation?.checks) ? validation.checks : [];
  const failed = checks.filter((c) => c && c.ok !== true);

  const lines = [
    "Independent final validation failed. Continue repairing the original task in this workspace.",
    "Inspect the failures below, fix the code, re-run the project's relevant checks, then finish again.",
    "Do not ask clarifying questions. Stay inside the workspace.",
    "You are collaborating with another engineering engine in the same worktree; continue their unfinished work when relevant.",
  ];

  if (validation?.classification) {
    lines.push(`Classification: ${validation.classification}`);
  }
  if (validation?.reason) {
    lines.push(`Reason: ${String(validation.reason).slice(0, 400)}`);
  }

  if (failed.length === 0) {
    lines.push("No individual check records were available; treat final validation as failed.");
  } else {
    for (const c of failed) {
      const id = typeof c.id === "string" && c.id ? c.id : "unknown-check";
      const kind = typeof c.kind === "string" && c.kind ? c.kind : "check";
      lines.push(`Failed check id: ${id}`);
      lines.push(`Category: ${kind}`);
      if (typeof c.command === "string" && c.command.trim()) {
        lines.push(`Command: ${c.command.trim()}`);
      }
      if (typeof c.exitCode === "number") {
        lines.push(`Exit code: ${c.exitCode}`);
      }
      const stderr = String(c.stderrTail || "").trim();
      if (stderr) {
        lines.push("Stderr (bounded):");
        lines.push(stderr.slice(-bound));
      } else {
        const stdout = String(c.stdoutTail || "").trim();
        if (stdout) {
          lines.push("Stdout (bounded, no stderr):");
          lines.push(stdout.slice(-bound));
        }
      }
      lines.push("---");
    }
  }

  const peerNotes =
    typeof options.peerNotes === "string" ? options.peerNotes.trim() : "";
  if (peerNotes) {
    lines.push("Peer engine notes (collaborative):");
    lines.push(peerNotes.slice(0, 3_000));
  }

  const advisory =
    typeof options.advisoryText === "string" ? options.advisoryText.trim() : "";
  if (advisory) {
    lines.push("Fallback specialist notes:");
    lines.push(advisory.slice(0, 3_000));
  }

  const handoff =
    typeof options.collabHandoff === "string"
      ? options.collabHandoff.trim()
      : "";
  if (handoff) {
    lines.push(handoff.slice(0, 2_000));
  }

  return lines.join("\n");
}

/**
 * Whether PATH should feed validation failure back into the same conversation.
 *
 * @param {{
 *   classification?: string | null,
 *   attempts?: number,
 *   maxAttempts?: number,
 *   aborted?: boolean,
 *   hasFailingChecks?: boolean,
 *   wallBudgetRemainingMs?: number,
 * }} input
 * @returns {boolean}
 */
export function shouldAttemptSameSessionRepair(input = {}) {
  if (input.aborted === true) return false;
  const attempts =
    typeof input.attempts === "number" && input.attempts >= 0
      ? input.attempts
      : 0;
  const maxAttempts =
    typeof input.maxAttempts === "number" && input.maxAttempts >= 0
      ? input.maxAttempts
      : AG8_MAX_REPAIR_ATTEMPTS;
  if (attempts >= maxAttempts) return false;

  if (
    typeof input.wallBudgetRemainingMs === "number" &&
    input.wallBudgetRemainingMs < 30_000
  ) {
    return false;
  }

  const classification = String(input.classification || "");
  if (
    classification === "FAILED" ||
    classification === "PARTIALLY_VERIFIED"
  ) {
    return true;
  }
  if (input.hasFailingChecks === true) {
    return true;
  }
  return false;
}
