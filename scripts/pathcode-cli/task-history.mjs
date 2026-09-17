/**
 * S2 — durable task/session history over runtime metadata (not gateway RAM).
 */

import { basename } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { ensureAg9RuntimeDirs } from "./ag9/layout.mjs";
import { readTaskCheckpoint } from "./ag10/task-checkpoint.mjs";
import {
  engineeringReportExists,
  resolveEngineeringReportPath,
} from "./engineering-report.mjs";
import { readLifecycleFromCheckpoint } from "./result-lifecycle.mjs";

/**
 * @param {string} runtimeRoot
 */
function tasksDir(runtimeRoot) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  return join(dirs.metadata, "tasks");
}

/**
 * True when the operator typed a help placeholder instead of a real id.
 * @param {string} raw
 */
export function isPlaceholderTaskId(raw) {
  const t = String(raw || "").trim();
  if (!t) return true;
  return (
    /^<[^>]*>$/.test(t) ||
    /^(taskid|task-?id|id|<taskid>|task)$/i.test(t) ||
    t === "…" ||
    t === "..."
  );
}

/**
 * @param {string} reportText
 */
export function parseHintsFromReport(reportText) {
  const text = String(reportText || "");
  /** @type {{
   *   branch: string | null,
   *   sha: string | null,
   *   baseline: string | null,
   *   inspectCommand: string | null,
   *   disposition: string | null,
   *   changedFiles: string[],
   * }} */
  const out = {
    branch: null,
    sha: null,
    baseline: null,
    inspectCommand: null,
    disposition: null,
    changedFiles: [],
  };
  const branch =
    text.match(/^\s*(path\/task-[^\s]+)\s*$/m) ||
    text.match(/\b(path\/task-[0-9a-fA-F-]{8,})\b/);
  if (branch) out.branch = branch[1];
  const sha = text.match(/^\s*commit\s+([0-9a-f]{7,40})\s*$/im);
  if (sha) out.sha = sha[1];
  const base = text.match(/^\s*baseline\s+([0-9a-f]{7,40})\s*$/im);
  if (base) out.baseline = base[1];
  const inspect = text.match(/^\s*(git diff --no-ext-diff[^\n]+)\s*$/m);
  if (inspect) out.inspectCommand = inspect[1].trim();
  const disp = text.match(
    /^\s*(COMPLETE|PARTIAL|FAILED|CANCELLED|BLOCKED|STOPPED)\s*$/m,
  );
  if (disp) out.disposition = disp[1];
  const changedBlock = text.match(
    /^Changed\n((?:  .+\n)+)/m,
  );
  if (changedBlock) {
    out.changedFiles = changedBlock[1]
      .split("\n")
      .map((l) => l.replace(/^\s+/, "").trim())
      .filter(Boolean)
      .slice(0, 40);
  }
  return out;
}

/**
 * Whether this task produced adoptable primary changes.
 * Discarded / merged results are never adoptable.
 * @param {NonNullable<ReturnType<typeof getTaskHistoryEntry>>} entry
 */
export function taskHasAdoptableChanges(entry) {
  if (!entry) return false;
  const life = entry.lifecycleStatus;
  if (life === "DISCARDED" || life === "MERGED" || life === "PR_OPEN") {
    return false;
  }
  // Adoptable requires recorded file changes — never claim adoptable alongside
  // "no file changes recorded" (sha≠baseline alone is insufficient).
  return Array.isArray(entry.changedFiles) && entry.changedFiles.length > 0;
}

/**
 * Operator-facing lifecycle label for history / inspect.
 * @param {NonNullable<ReturnType<typeof getTaskHistoryEntry>>} entry
 */
export function formatLifecycleLabel(entry) {
  if (!entry) return "unknown";
  const life = entry.lifecycleStatus;
  if (life === "DISCARDED") return "DISCARDED";
  if (life === "MERGED") return "MERGED";
  if (life === "PR_OPEN") {
    return entry.prUrl ? `PR OPEN · ${entry.prUrl}` : "PR OPEN";
  }
  if (taskHasAdoptableChanges(entry)) {
    const base =
      entry.finalState === "VERIFIED" || entry.finalState === "COMPLETE"
        ? "VERIFIED"
        : entry.finalState || "COMPLETE";
    return `${base} · adoptable`;
  }
  return entry.finalState || "unknown";
}

/**
 * @param {string} runtimeRoot
 * @param {string} taskId
 */
export function getTaskHistoryEntry(runtimeRoot, taskId) {
  const id = String(taskId || "").trim();
  if (!id || isPlaceholderTaskId(id)) return null;
  const checkpoint = readTaskCheckpoint(runtimeRoot, id);
  const reportPath = resolveEngineeringReportPath(id, runtimeRoot);
  const hasReport = engineeringReportExists(id, runtimeRoot);
  /** @type {string | null} */
  let reportText = null;
  if (hasReport && existsSync(reportPath)) {
    try {
      reportText = readFileSync(reportPath, "utf8");
    } catch {
      reportText = null;
    }
  }
  const hints = parseHintsFromReport(reportText || "");
  const cpBranch =
    checkpoint && typeof checkpoint.branch === "string"
      ? checkpoint.branch
      : null;
  const cpSha =
    checkpoint && typeof checkpoint.sha === "string" ? checkpoint.sha : null;
  const cpBaseline =
    checkpoint && typeof checkpoint.baseline === "string"
      ? checkpoint.baseline
      : null;
  const cpChanged =
    checkpoint && Array.isArray(checkpoint.changedFiles)
      ? checkpoint.changedFiles.filter((f) => typeof f === "string" && f.trim())
      : [];
  let updatedAt =
    (checkpoint && typeof checkpoint.updatedAt === "string"
      ? checkpoint.updatedAt
      : null) || null;
  if (!updatedAt && hasReport) {
    try {
      updatedAt = statSync(reportPath).mtime.toISOString();
    } catch {
      // ignore
    }
  }
  const objective =
    (checkpoint && typeof checkpoint.objective === "string"
      ? checkpoint.objective
      : "") ||
    (reportText
      ? (reportText.match(/^Asked\n((?:  .+\n?)+)/m)?.[1] || "")
          .split("\n")
          .map((l) => l.replace(/^\s+/, "").trim())
          .filter(Boolean)
          .join(" ")
      : "");
  const finalState =
    (checkpoint && typeof checkpoint.finalState === "string"
      ? checkpoint.finalState
      : null) ||
    hints.disposition ||
    null;
  const repoRoot =
    checkpoint && typeof checkpoint.repoRoot === "string"
      ? checkpoint.repoRoot
      : null;
  if (!checkpoint && !hasReport) return null;
  const life = readLifecycleFromCheckpoint(checkpoint);
  return {
    taskId: id,
    updatedAt,
    finalState,
    objective: objective.slice(0, 240),
    reportPath: hasReport ? reportPath : null,
    hasReport,
    hasCheckpoint: Boolean(checkpoint),
    branch: hints.branch || cpBranch,
    sha: hints.sha || cpSha,
    baseline: hints.baseline || cpBaseline,
    inspectCommand: hints.inspectCommand,
    changedFiles:
      hints.changedFiles.length > 0 ? hints.changedFiles : cpChanged,
    worktreePath:
      checkpoint && typeof checkpoint.worktreePath === "string"
        ? checkpoint.worktreePath
        : null,
    repoRoot,
    projectName: repoRoot ? basename(repoRoot) : null,
    reportText,
    lifecycleStatus: life.status,
    discardedAt: life.discardedAt,
    mergedAt: life.mergedAt,
    prUrl: life.prUrl,
    prNumber: life.prNumber,
    prRemote: life.prRemote,
    prBase: life.prBase,
  };
}

/**
 * @param {string} runtimeRoot
 * @param {{ limit?: number }} [opts]
 */
export function listTaskHistory(runtimeRoot, opts = {}) {
  const limit =
    typeof opts.limit === "number" && opts.limit > 0
      ? Math.min(100, Math.floor(opts.limit))
      : 12;
  const dir = tasksDir(runtimeRoot);
  if (!existsSync(dir)) return [];
  /** @type {Map<string, { taskId: string, mtimeMs: number }>} */
  const ids = new Map();
  for (const name of readdirSync(dir)) {
    const cp = name.match(/^(.+)\.checkpoint\.json$/);
    const rp = name.match(/^(.+)\.report\.txt$/);
    const id = (cp && cp[1]) || (rp && rp[1]) || null;
    if (!id || id === "index") continue;
    const abs = join(dir, name);
    let mtimeMs = 0;
    try {
      mtimeMs = statSync(abs).mtimeMs;
    } catch {
      continue;
    }
    const prev = ids.get(id);
    if (!prev || mtimeMs > prev.mtimeMs) {
      ids.set(id, { taskId: id, mtimeMs });
    }
  }
  const ordered = [...ids.values()].sort((a, b) => b.mtimeMs - a.mtimeMs);
  /** @type {ReturnType<typeof getTaskHistoryEntry>[]} */
  const rows = [];
  for (const { taskId } of ordered) {
    if (rows.length >= limit) break;
    const entry = getTaskHistoryEntry(runtimeRoot, taskId);
    if (entry) rows.push(entry);
  }
  return rows;
}

/**
 * Format a compact history listing for the living prompt / operator panel.
 * @param {Array<NonNullable<ReturnType<typeof getTaskHistoryEntry>>>} rows
 */
export function formatTaskHistoryListing(rows) {
  if (!rows.length) {
    return [
      "No durable tasks in this PATH runtime yet.",
      "",
      "After an engineering task finishes, it appears here automatically.",
      "Then use:",
      "  /report <taskId>   reopen the canonical report",
      "  /inspect <taskId>  summarize branch / commit / changes",
      "  /merge <taskId>    adopt a verified result (only when files changed)",
      "  /discard <taskId>  abandon a result (primary untouched)",
      "  /pr <taskId>       open a GitHub pull request",
    ].join("\n");
  }
  const lines = [
    `Durable task history (${rows.length} shown, newest first)`,
    "",
  ];
  for (const row of rows) {
    const when = row.updatedAt
      ? row.updatedAt.replace("T", " ").replace(/\.\d+Z$/, "Z")
      : "unknown time";
    const lifecycle = formatLifecycleLabel(row);
    const project = row.projectName || "(project unknown)";
    const obj = (row.objective || "(no objective)")
      .replace(/\s+/g, " ")
      .slice(0, 90);
    const files =
      row.changedFiles && row.changedFiles.length > 0
        ? `${row.changedFiles.length} file(s) changed`
        : "no file changes recorded";
    const report = row.hasReport ? "report on disk" : "no report file";
    lines.push(`taskId  ${row.taskId}`);
    lines.push(`  project   ${project}`);
    lines.push(`  lifecycle ${lifecycle}`);
    lines.push(`  when      ${when}`);
    lines.push(`  result    ${files} · ${report}`);
    lines.push(`  asked     ${obj}`);
    lines.push("");
  }
  lines.push("Select a task by copying its taskId, then:");
  lines.push("  /report <taskId>");
  lines.push("  /inspect <taskId>");
  lines.push("  /merge <taskId>     (only when result has file changes)");
  lines.push("  /discard <taskId>   (abandon result; keep history)");
  lines.push("  /pr <taskId>        (GitHub pull request)");
  return lines.join("\n");
}

/**
 * @param {NonNullable<ReturnType<typeof getTaskHistoryEntry>>} entry
 */
export function formatInspectPanel(entry) {
  const lifecycle = formatLifecycleLabel(entry);
  const lines = [
    `Inspect task ${entry.taskId}`,
    "",
    `  lifecycle     ${lifecycle}`,
    `  disposition   ${entry.finalState || "unknown"}`,
    `  project       ${entry.projectName || "(unknown)"}`,
    `  branch        ${entry.branch || "(none recorded)"}`,
    `  commit        ${entry.sha || "(none recorded)"}`,
    `  baseline      ${entry.baseline || "(none recorded)"}`,
  ];
  if (entry.lifecycleStatus === "DISCARDED" && entry.discardedAt) {
    lines.push(`  discarded     ${entry.discardedAt}`);
  }
  if (entry.lifecycleStatus === "MERGED" && entry.mergedAt) {
    lines.push(`  merged        ${entry.mergedAt}`);
  }
  if (entry.lifecycleStatus === "PR_OPEN") {
    if (entry.prNumber != null) lines.push(`  PR            #${entry.prNumber}`);
    if (entry.prUrl) lines.push(`  PR url        ${entry.prUrl}`);
    if (entry.prRemote) lines.push(`  PR remote     ${entry.prRemote}`);
    if (entry.prBase) lines.push(`  PR base       ${entry.prBase}`);
  }
  const files = entry.changedFiles || [];
  if (files.length > 0) {
    lines.push(`  changed       ${files.length} file(s)`);
    for (const f of files.slice(0, 12)) {
      lines.push(`    - ${f}`);
    }
    if (files.length > 12) {
      lines.push(`    … ${files.length - 12} more`);
    }
  } else {
    lines.push("  changed       none recorded (read-only / no-op result)");
  }
  lines.push("");
  if (entry.inspectCommand) {
    lines.push("Read-only inspect command:");
    lines.push(`  ${entry.inspectCommand}`);
  } else {
    lines.push("No recorded git inspect command for this task.");
  }
  lines.push("");
  if (taskHasAdoptableChanges(entry)) {
    lines.push(
      `Adoptable: yes — /merge ${entry.taskId} or /pr ${entry.taskId} (confirmation required).`,
    );
  } else if (entry.lifecycleStatus === "DISCARDED") {
    lines.push(
      "Adoptable: no — discarded. History and report remain for inspection only.",
    );
  } else if (entry.lifecycleStatus === "MERGED") {
    lines.push("Adoptable: no — already merged into the primary project.");
  } else {
    lines.push(
      "Adoptable: no — nothing meaningful to merge into the primary project.",
    );
  }
  if (entry.hasReport) {
    lines.push(`Report: /report ${entry.taskId}`);
  }
  return lines.join("\n");
}

/**
 * Open a durable report in the operator panel.
 * @param {NonNullable<ReturnType<typeof getTaskHistoryEntry>>} entry
 * @param {{ copied?: boolean, copyError?: string }} [opts]
 */
export function formatReportPanel(entry, opts = {}) {
  const lines = [
    `Durable report for task ${entry.taskId}`,
    "",
    `  project   ${entry.projectName || "(unknown)"}`,
    `  outcome   ${entry.finalState || "unknown"}`,
    `  saved     ${entry.reportPath || "(in memory)"}`,
  ];
  if (opts.copied === true) {
    lines.push("  clipboard copied");
  } else if (opts.copyError) {
    lines.push(`  clipboard ${opts.copyError}`);
  }
  lines.push("");
  lines.push("──── report ────");
  const body = String(entry.reportText || "").replace(/\s+$/, "");
  if (!body.trim()) {
    lines.push("(empty report file)");
  } else {
    for (const line of body.split("\n").slice(0, 80)) {
      lines.push(line);
    }
    if (body.split("\n").length > 80) {
      lines.push("… (truncated — full text is on disk at the path above)");
    }
  }
  lines.push("");
  lines.push(`Next: /inspect ${entry.taskId}`);
  if (taskHasAdoptableChanges(entry)) {
    lines.push(`      /merge ${entry.taskId}   (confirmation required)`);
  } else {
    lines.push("      (no adoptable file changes — /merge will refuse)");
  }
  return lines.join("\n");
}

/**
 * @param {string} rawId
 * @param {string} runtimeRoot
 */
export function formatMissingTaskHelp(rawId, runtimeRoot) {
  const id = String(rawId || "").trim();
  if (isPlaceholderTaskId(id)) {
    return [
      `“${id || "<taskId>"}” is a placeholder, not a real task id.`,
      "",
      "Run /history, copy a real taskId from the list, then retry:",
      "  /report <paste-real-taskId-here>",
    ].join("\n");
  }
  const recent = listTaskHistory(runtimeRoot, { limit: 3 });
  const lines = [
    `No durable report for task id:`,
    `  ${id}`,
    "",
    "That id is not in this PATH runtime (wrong id, different runtime, or task never finished a report).",
    "Run /history to list valid task ids.",
  ];
  if (recent.length > 0) {
    lines.push("");
    lines.push("Most recent task ids:");
    for (const r of recent) {
      lines.push(`  ${r.taskId}`);
    }
  }
  return lines.join("\n");
}
