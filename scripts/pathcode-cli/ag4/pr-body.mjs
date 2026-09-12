/**
 * AG4 — PATH-owned PR body + title from final validation evidence.
 */

import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePathRuntimeRoot } from "../paths.mjs";

/**
 * @param {{
 *   issueNumber?: number | null,
 *   issueTitle?: string | null,
 *   taskBranch: string,
 *   commitSha: string,
 *   changedFiles?: string[],
 *   validation?: { checks?: Array<{ kind?: string, id?: string, ok?: boolean }> } | null,
 *   classification: string,
 * }} input
 */
export function buildPrTitle(input) {
  if (input.issueNumber && input.issueTitle) {
    const t = String(input.issueTitle).trim().replace(/\s+/g, " ");
    const base = t.length > 72 ? `${t.slice(0, 69)}…` : t;
    return base || `Fix issue #${input.issueNumber}`;
  }
  return `PATH verified: ${input.taskBranch}`;
}

/**
 * @param {Parameters<typeof buildPrTitle>[0]} input
 */
export function buildPrBody(input) {
  const lines = [];
  lines.push("## PATH Code");
  lines.push("");
  if (input.issueNumber) {
    lines.push(`Issue #${input.issueNumber}${input.issueTitle ? ` — ${input.issueTitle}` : ""}`);
    lines.push("");
  }
  lines.push("### Changes");
  lines.push("");
  const files = Array.isArray(input.changedFiles) ? input.changedFiles : [];
  if (files.length === 0) {
    lines.push("- (no file list)");
  } else {
    for (const f of files.slice(0, 40)) {
      lines.push(`- \`${f}\``);
    }
  }
  lines.push("");
  lines.push("### Verification");
  lines.push("");
  const checks = Array.isArray(input.validation?.checks) ? input.validation.checks : [];
  if (checks.length === 0) {
    lines.push(`- Result: ${input.classification}`);
  } else {
    for (const c of checks) {
      const kind =
        c.kind === "TYPECHECK"
          ? "Typecheck"
          : c.kind === "TARGETED_TEST" || /test/i.test(String(c.id || ""))
            ? "Tests"
            : c.kind === "BUILD" || /build/i.test(String(c.id || ""))
              ? "Build"
              : String(c.id || c.kind || "Check");
      lines.push(`- ${kind}: ${c.ok ? "✓" : "✕"}`);
    }
    lines.push(`- Result: ${input.classification}`);
  }
  lines.push("");
  lines.push("### Git");
  lines.push("");
  lines.push(`- Task branch: \`${input.taskBranch}\``);
  lines.push(`- Commit: \`${input.commitSha}\``);
  if (input.issueNumber && input.classification === "VERIFIED") {
    lines.push("");
    lines.push(`Closes #${input.issueNumber}`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * Write body under PATH_RUNTIME_ROOT/temp with restrictive mode; caller must cleanup.
 * @param {string} body
 * @param {{ runtimeRoot?: string }} [opts]
 */
export function writeTempPrBodyFile(body, opts = {}) {
  const runtimeRoot = opts.runtimeRoot ?? resolvePathRuntimeRoot();
  const dir = join(runtimeRoot, "temp");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `pr-body-${randomUUID()}.md`);
  writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
  return path;
}

/**
 * @param {string | null | undefined} path
 */
export function cleanupTempPrBodyFile(path) {
  if (!path) return;
  try {
    unlinkSync(path);
  } catch {
    // ignore
  }
}
