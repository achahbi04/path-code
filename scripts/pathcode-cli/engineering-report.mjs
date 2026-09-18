/**
 * Authoritative PATH engineering completion report.
 *
 * One builder for: live canvas finish, /report copy/export, durable file,
 * and post-session plain text. No second summary shape.
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolvePathRuntimeRoot } from "./paths.mjs";
import { normalizeObjectiveText } from "./normalize-text.mjs";

/**
 * Convert session timingMarks ("name:msFromStart") into report buckets.
 * @param {unknown[]} marks
 */
export function summarizeTimingMarks(marks) {
  /** @type {Record<string, number>} */
  const buckets = {
    providerWait: 0,
    environment: 0,
    validation: 0,
    steering: 0,
    engineHandoff: 0,
    unclassified: 0,
    total: 0,
  };
  let prev = 0;
  for (const raw of marks || []) {
    const s = String(raw || "");
    const idx = s.lastIndexOf(":");
    if (idx <= 0) continue;
    const name = s.slice(0, idx);
    const ms = Number(s.slice(idx + 1));
    if (!Number.isFinite(ms) || ms < 0) continue;
    const delta = Math.max(0, ms - prev);
    prev = ms;
    buckets.total = Math.max(buckets.total, ms);
    if (/first_engine|provider|bridge|spawn|start/i.test(name)) {
      buckets.providerWait += delta;
    } else if (/env|prepar|depend|install|discovery/i.test(name)) {
      buckets.environment += delta;
    } else if (/valid/i.test(name)) {
      buckets.validation += delta;
    } else if (/steer/i.test(name)) {
      buckets.steering += delta;
    } else if (/handoff|collab|copilot|antigravity|repair/i.test(name)) {
      buckets.engineHandoff += delta;
    } else {
      buckets.unclassified += delta;
    }
  }
  return buckets;
}

/**
 * @param {string} [classification]
 * @param {string} [pathPhase]
 * @param {string} [disposition]
 */
export function dispositionFromOutcome(classification, pathPhase, disposition) {
  const c = String(classification || "").toUpperCase();
  const d = String(disposition || "").toUpperCase();
  const p = String(pathPhase || "");
  if (
    c === "CANCELLED" ||
    d === "CANCELLED" ||
    /cancel/i.test(p) ||
    d === "STOPPED"
  ) {
    return "STOPPED";
  }
  if (
    c === "VERIFIED" ||
    d === "VERIFIED" ||
    d === "COMPLETE" ||
    /^Verified$|^Complete$/i.test(p)
  ) {
    return "COMPLETE";
  }
  if (
    c === "PARTIALLY_VERIFIED" ||
    d === "PARTIALLY_VERIFIED" ||
    d === "PARTIAL" ||
    /partial/i.test(p)
  ) {
    return "PARTIAL";
  }
  if (
    /AG1_AUTH|AUTH_REQUIRED|GIT_IDENTITY|UNMERGED_INDEX|EMPTY_TASK|BUDGET_WALL/i.test(
      `${c} ${d}`,
    ) ||
    c === "FAILED" ||
    c === "NOT_VERIFIED" ||
    d === "FAILED" ||
    d === "NOT_VERIFIED" ||
    d === "BLOCKED" ||
    /block|fail|not verif|auth|infra/i.test(p)
  ) {
    return "BLOCKED";
  }
  if (c || d || p) return "BLOCKED";
  return "BLOCKED";
}

/**
 * @param {number} ms
 */
function formatDuration(ms) {
  const n = Math.max(0, Math.floor(ms));
  if (n < 1000) return `${n}ms`;
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${String(rem).padStart(2, "0")}s`;
}

/**
 * @param {unknown} text
 * @param {number} max
 */
function clip(text, max) {
  const s = String(text ?? "").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

/**
 * @param {string} text
 */
function normKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.…]+$/g, "")
    .trim()
    .slice(0, 160);
}

/**
 * Transient mid-task status — never final report substance.
 * @param {string} text
 */
export function isTransientStatusText(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return (
    /\bis running\b/i.test(t) ||
    /\bin the background\b/i.test(t) ||
    /\bplease wait\b/i.test(t) ||
    /\bstill (running|working|installing|waiting)\b/i.test(t) ||
    /\bstarting (up|now|the)\b/i.test(t) ||
    /\bwaiting for\b/i.test(t) ||
    /\bin progress\b/i.test(t) ||
    /^working\b/i.test(t)
  );
}

/**
 * Shell / launcher blocks that must never stand in for the PATH objective
 * when a real task objective is available.
 * @param {string} text
 */
export function looksLikeLauncherShell(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/rm\s+-rf\s+.*path-code\/runtime/i.test(raw)) return true;
  if (/PATHCODE_RUNTIME_ROOT|runtime-klar/i.test(raw) && /^(cd |export |rm )/m.test(raw)) {
    return true;
  }
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const shellish = lines.filter((l) =>
    /^(cd |echo |rm |export |unset |mkdir |chmod |open |node scripts\/|PATHCODE_|git status)/i.test(
      l,
    ),
  );
  if (shellish.length >= Math.max(2, Math.ceil(lines.length * 0.6))) return true;
  // Short block that is only shell verbs.
  if (
    lines.length <= 6 &&
    shellish.length === lines.length &&
    /cd |git status|rm -rf/i.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * Score an objective candidate — higher is better for "Asked".
 * @param {string} text
 */
function scoreObjectiveCandidate(text) {
  const t = String(text || "").trim();
  if (!t) return -1;
  let score = Math.min(t.length, 2000);
  if (looksLikeLauncherShell(t)) score -= 5000;
  if (/inspect|typecheck|test|assess|repair|find|risk|solid|dependency/i.test(t)) {
    score += 200;
  }
  if (/\b(npm|package\.json|repository|git)\b/i.test(t)) score += 40;
  return score;
}

/**
 * Resolve the authoritative Asked objective from product + session evidence.
 * Never prefers launcher/preflight shell when a real PATH objective exists.
 * @param {Record<string, unknown>} product
 * @param {Record<string, unknown>} [session]
 */
export function resolveReportObjective(product, session = {}) {
  /** @type {string[]} */
  const candidates = [];
  const push = (raw) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const n = normalizeObjectiveText(raw, { maxChars: 4000 });
    if (n && !candidates.includes(n)) candidates.push(n);
  };

  push(typeof session.objective === "string" ? session.objective : "");
  push(typeof product.taskObjective === "string" ? product.taskObjective : "");
  push(typeof product.taskPreview === "string" ? product.taskPreview : "");

  const history = Array.isArray(product.streamHistory)
    ? product.streamHistory
    : [];
  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    if (String(entry.kind || "") !== "objective") continue;
    push(typeof entry.detail === "string" ? entry.detail : "");
  }

  if (candidates.length === 0) return "";

  let best = candidates[0];
  let bestScore = scoreObjectiveCandidate(best);
  for (const c of candidates.slice(1)) {
    const s = scoreObjectiveCandidate(c);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return best;
}

/**
 * @param {string[]} list
 * @param {string} item
 * @param {number} [max]
 */
function pushUnique(list, item, max = 14) {
  const one = String(item || "").trim();
  if (!one || one.length < 8) return;
  const key = normKey(one);
  if (list.some((x) => normKey(x) === key || normKey(x).includes(key) || key.includes(normKey(x)))) {
    return;
  }
  list.push(clip(one, 400));
  if (list.length > max) list.splice(0, list.length - max);
}

/**
 * Synthesize completed engineering work from stream + structured evidence.
 * @param {Record<string, unknown>} product
 * @param {Record<string, unknown>} session
 * @returns {{ whatPathDid: string[], discoveries: string[], commands: string[] }}
 */
function synthesizeTaskEvidence(product, session) {
  /** @type {string[]} */
  const whatPathDid = [];
  /** @type {string[]} */
  const discoveries = [];
  /** @type {string[]} */
  const commands = [];

  const history = Array.isArray(product.streamHistory)
    ? product.streamHistory
    : [];

  /** @type {Set<string>} */
  const readPaths = new Set();
  /** @type {Set<string>} */
  const editPaths = new Set();
  /** @type {Set<string>} */
  const searched = new Set();
  let installedDeps = false;
  let listedPkg = false;

  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const kind = String(entry.kind || "");
    const title = String(entry.title || "");
    const path =
      typeof entry.path === "string" && entry.path.trim()
        ? entry.path.trim().replace(/^\.\//, "")
        : "";
    const cmd =
      typeof entry.command === "string" && entry.command.trim()
        ? entry.command.trim()
        : "";
    const output =
      typeof entry.output === "string" ? entry.output : "";
    const detail =
      typeof entry.detail === "string" ? entry.detail.trim() : "";

    if (title === "Read" || kind === "inspect" || /view_file/i.test(String(entry.tool || ""))) {
      if (path) readPaths.add(path);
      if (/package\.json/i.test(path || detail)) listedPkg = true;
    }
    if (
      title === "Update" ||
      title === "Create" ||
      kind === "file_edit" ||
      /edit_file|create_file/i.test(String(entry.tool || ""))
    ) {
      if (path) editPaths.add(path);
    }
    if (title === "Search" || title === "Inspect directory") {
      const q = detail || path;
      if (q) searched.add(clip(q, 80));
    }

    if (
      kind === "command" ||
      kind === "test" ||
      kind === "shell" ||
      title === "Test" ||
      title === "Typecheck" ||
      title === "Build" ||
      title === "Lint" ||
      /^Run /i.test(title)
    ) {
      const command = cmd || detail;
      if (command) {
        const ok =
          entry.ok === true ? "✓" : entry.ok === false ? "✕" : "·";
        const line = `${ok} ${clip(command, 120)}`;
        if (!commands.includes(line)) commands.push(line);

        if (/npm\s+i(nstall)?\b|pnpm\s+i(nstall)?\b|yarn\s+install\b/i.test(command)) {
          installedDeps = true;
          if (entry.ok !== false) {
            // Final tense — never "is running".
            pushUnique(
              whatPathDid,
              "Installed project dependencies required by the existing workflows.",
            );
          }
          if (/vulnerabilit|severity|high severity|moderate severity/i.test(output)) {
            const m = output.match(/(\d+)\s+vulnerabilit/i);
            pushUnique(
              discoveries,
              m
                ? `Dependency install reported ${m[1]} vulnerabilit${m[1] === "1" ? "y" : "ies"}.`
                : "Dependency install reported security vulnerabilities.",
            );
          }
        } else if (title === "Test" || /npm test|vitest|pytest|jest|go test|cargo test/i.test(command)) {
          pushUnique(
            whatPathDid,
            entry.ok === false
              ? `Ran ${clip(command, 80)} (failed).`
              : `Ran ${clip(command, 80)}.`,
          );
          if (entry.ok === true) {
            pushUnique(discoveries, `Tests passed (${clip(command, 60)}).`);
          } else if (entry.ok === false) {
            pushUnique(discoveries, `Tests failed (${clip(command, 60)}).`);
          }
        } else if (title === "Typecheck" || /tsc|typecheck|mypy/i.test(command)) {
          pushUnique(
            whatPathDid,
            entry.ok === false
              ? `Ran typecheck via ${clip(command, 80)} (failed).`
              : `Ran typecheck via ${clip(command, 80)}.`,
          );
          if (entry.ok === true) {
            pushUnique(discoveries, "Typecheck passed.");
          } else if (entry.ok === false) {
            pushUnique(discoveries, "Typecheck failed.");
          }
        } else if (title === "Build" || /build|compile/i.test(command)) {
          pushUnique(
            whatPathDid,
            entry.ok === false
              ? `Ran build via ${clip(command, 80)} (failed).`
              : `Ran build via ${clip(command, 80)}.`,
          );
        } else if (title === "Lint") {
          pushUnique(whatPathDid, `Ran lint via ${clip(command, 80)}.`);
        } else if (!/npm\s+i(nstall)?\b/i.test(command)) {
          pushUnique(
            whatPathDid,
            `Ran \`${clip(command, 90)}\`${entry.ok === false ? " (failed)" : ""}.`,
          );
        }

        // Finding-shaped command output (not activity).
        if (output && !isTransientStatusText(output)) {
          const outLines = output
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 12 && l.length < 200);
          for (const ol of outLines.slice(0, 4)) {
            if (
              /vulnerabilit|error TS|FAIL|PASS|warning|risk|solid|missing|deprecated/i.test(
                ol,
              ) &&
              !isTransientStatusText(ol)
            ) {
              pushUnique(discoveries, ol, 8);
            }
          }
        }
      }
    }

    if (kind === "narration" && detail && !isTransientStatusText(detail)) {
      // Findings only — not "I'm going to…" activity.
      const paras = detail.split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim());
      for (const p of paras) {
        if (p.length < 24 || isTransientStatusText(p)) continue;
        const findingLike =
          /^(solid|risk|finding|issue|note|observed|the .+ (is|are|has|have)|tests? |typecheck |npm |package)/i.test(
            p,
          ) ||
          /\b(vulnerabilit|passed|failed|risk|solid|missing|incorrect|bug|weakness)\b/i.test(
            p,
          );
        const activityLike =
          /^(i('m| am) |i'll |let me |next i |going to |starting |checking )/i.test(
            p,
          );
        if (findingLike && !activityLike) {
          pushUnique(discoveries, p, 8);
        }
      }
    }
  }

  if (listedPkg || [...readPaths].some((p) => /package\.json/i.test(p))) {
    pushUnique(
      whatPathDid,
      "Inspected package.json and project configuration.",
      14,
    );
  }
  for (const p of [...readPaths].slice(0, 6)) {
    if (/package\.json/i.test(p)) continue;
    pushUnique(whatPathDid, `Inspected ${p}.`);
  }
  for (const p of [...editPaths].slice(0, 6)) {
    pushUnique(whatPathDid, `Updated ${p}.`);
  }
  for (const q of [...searched].slice(0, 3)) {
    pushUnique(whatPathDid, `Searched for ${q}.`);
  }
  if (installedDeps) {
    // ensure phrase present even if command ok was ambiguous
    pushUnique(
      whatPathDid,
      "Installed project dependencies required by the existing workflows.",
    );
  }

  const handoff =
    (typeof session.engineeringHandoff === "string" &&
      session.engineeringHandoff.trim()) ||
    (typeof product.engineeringHandoff === "string" &&
      product.engineeringHandoff.trim()) ||
    "";
  if (handoff && !isTransientStatusText(handoff)) {
    for (const p of handoff.split(/\n\s*\n/).map((x) => x.replace(/\n/g, " ").trim())) {
      if (p.length < 20) continue;
      const activityLike =
        /^(i('m| am) |i'll |let me |next i |going to )/i.test(p);
      if (activityLike || isTransientStatusText(p)) continue;
      // Handoff often carries the assessment conclusions.
      pushUnique(discoveries, p, 8);
    }
  }

  // Checks → discoveries (outcome), not duplicated as "what PATH did".
  const checksRaw = Array.isArray(session.validation?.checks)
    ? session.validation.checks
    : Array.isArray(product.ag1Checks)
      ? product.ag1Checks
      : [];
  for (const c of checksRaw) {
    const row = /** @type {Record<string, unknown>} */ (c || {});
    const name = String(row.name || row.id || row.command || row.kind || "check");
    if (row.ok === true) {
      pushUnique(discoveries, `${name} passed.`, 8);
    } else if (row.ok === false) {
      pushUnique(discoveries, `${name} failed.`, 8);
    }
  }

  // Strip discoveries that merely repeat whatPathDid activity lines.
  const didKeys = whatPathDid.map(normKey);
  const filteredDiscoveries = discoveries.filter((d) => {
    const k = normKey(d);
    if (didKeys.some((w) => w === k || (w.length > 24 && k.includes(w)))) {
      return false;
    }
    return !isTransientStatusText(d);
  });

  // If synthesis produced nothing, fall back to non-transient handoff / narrations
  // as last resort for whatPathDid — still never transient "is running".
  if (whatPathDid.length === 0) {
    const narrations = Array.isArray(product.narrationExcerpts)
      ? product.narrationExcerpts
      : [];
    for (const n of narrations) {
      if (typeof n !== "string" || isTransientStatusText(n)) continue;
      for (const p of String(n).split(/\n\s*\n/).slice(0, 3)) {
        const one = p.replace(/\n/g, " ").trim();
        if (one.length >= 20 && !isTransientStatusText(one)) {
          pushUnique(whatPathDid, one);
        }
      }
    }
    if (handoff && !isTransientStatusText(handoff)) {
      pushUnique(whatPathDid, clip(handoff, 600));
    }
  }

  // Deduplicate semantically equivalent discovery noise (command output + summary).
  const discoveriesCompact = [];
  for (const d of filteredDiscoveries) {
    const k = normKey(d);
    const redundant =
      discoveriesCompact.some(
        (x) =>
          normKey(x) === k ||
          (normKey(x).includes(k) && k.length > 20) ||
          (k.includes(normKey(x)) && normKey(x).length > 20),
      ) ||
      (/^\d+ tests? passed/i.test(d) &&
        discoveriesCompact.some((x) => /tests? passed/i.test(x))) ||
      (/^✓\s+\d+\s+tests?\s+passed/i.test(d) &&
        discoveriesCompact.some((x) => /tests? passed/i.test(x))) ||
      (/^found \d+ .*vulnerabilit/i.test(d) &&
        discoveriesCompact.some((x) => /vulnerabilit/i.test(x))) ||
      (/^(npm-test|typecheck)/i.test(d) &&
        discoveriesCompact.some((x) =>
          /tests? passed|typecheck passed/i.test(x),
        ));
    if (!redundant) discoveriesCompact.push(d);
  }

  return {
    whatPathDid: whatPathDid.slice(0, 12),
    discoveries: discoveriesCompact.slice(0, 6),
    commands: commands.slice(-24),
  };
}

/**
 * Build structured report model from living product + optional session result.
 * @param {Record<string, unknown>} product
 * @param {{
 *   classification?: string,
 *   disposition?: string,
 *   objective?: string,
 *   validation?: { checks?: unknown[], reason?: string, classification?: string } | null,
 *   changedFiles?: string[],
 *   taskBranch?: string,
 *   commitSha?: string,
 *   baselineSha?: string,
 *   inspectCommand?: string,
 *   preservedPath?: string,
 *   primaryUntouched?: boolean,
 *   durationMs?: number,
 *   timingMarks?: string[],
 *   timingSummary?: Record<string, number>,
 *   engineeringHandoff?: string | null,
 *   terminalSummary?: string,
 *   pushPerformed?: boolean,
 *   advancesSession?: boolean,
 *   preferredEngine?: string | null,
 *   engine?: string | null,
 *   cursorMode?: string | null,
 *   enginesUsed?: string[],
 * }} [session]
 */
export function buildEngineeringReportModel(product, session = {}) {
  const classification =
    typeof session.classification === "string"
      ? session.classification
      : typeof product.resultClassification === "string"
        ? product.resultClassification
        : "";
  const disposition = dispositionFromOutcome(
    classification,
    typeof product.pathPhase === "string" ? product.pathPhase : "",
    typeof session.disposition === "string"
      ? session.disposition
      : typeof product.terminalDisposition === "string"
        ? product.terminalDisposition
        : "",
  );

  const objective = resolveReportObjective(product, session);

  const synthesized = synthesizeTaskEvidence(product, session);
  const whatPathDid = synthesized.whatPathDid;
  const discoveries = synthesized.discoveries;
  const commands = synthesized.commands;

  const filesRaw = Array.isArray(session.changedFiles)
    ? session.changedFiles
    : Array.isArray(product.projectFiles)
      ? product.projectFiles
      : Array.isArray(product.changedFiles)
        ? product.changedFiles
        : [];

  // Assessment / read-only objectives: dependency setup may touch lockfiles in
  // the task workspace — do not present incidental install churn as the result.
  const assessmentLike =
    /\b(assess|inspect|check|review|audit|report|read-?only|identify|findings?)\b/i.test(
      objective,
    ) &&
    !/\b(fix|repair|implement|add|change|update|migrate|refactor)\b/i.test(
      objective,
    );
  const incidentalLock =
    /^(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|poetry\.lock|composer\.lock)$/i;
  let files = filesRaw.map(String);
  if (assessmentLike) {
    const intentional = files.filter(
      (f) => !incidentalLock.test(f.split(/[\\/]/).pop() || f),
    );
    if (
      intentional.length === 0 &&
      files.some((f) => incidentalLock.test(f.split(/[\\/]/).pop() || f))
    ) {
      files = [];
      pushUnique(
        discoveries,
        "Dependency/setup churn (lockfile) occurred in the task workspace; no intentional project edits.",
        8,
      );
    } else {
      files = intentional;
    }
  }

  const checksRaw = Array.isArray(session.validation?.checks)
    ? session.validation.checks
    : Array.isArray(product.ag1Checks)
      ? product.ag1Checks
      : [];
  /** @type {Array<{ name: string, ok: boolean | null }>} */
  const checks = checksRaw.map((c) => {
    const row = /** @type {Record<string, unknown>} */ (c || {});
    return {
      name: String(row.name || row.id || row.command || row.kind || "check"),
      ok: row.ok === true ? true : row.ok === false ? false : null,
    };
  });

  const durationMs =
    typeof session.durationMs === "number"
      ? session.durationMs
      : typeof product.durationMs === "number"
        ? product.durationMs
        : null;
  const timing =
    session.timingSummary && typeof session.timingSummary === "object"
      ? session.timingSummary
      : product.timingSummary && typeof product.timingSummary === "object"
        ? product.timingSummary
        : null;

  const branch =
    (typeof session.taskBranch === "string" && session.taskBranch) ||
    (typeof product.taskBranch === "string" && product.taskBranch) ||
    null;
  const sha =
    (typeof session.commitSha === "string" && session.commitSha) ||
    (typeof product.resultSha === "string" && product.resultSha) ||
    (typeof product.commitSha === "string" && product.commitSha) ||
    null;
  const baseline =
    (typeof session.baselineSha === "string" && session.baselineSha) ||
    (typeof product.baselineSha === "string" && product.baselineSha) ||
    null;
  const inspect =
    (typeof session.inspectCommand === "string" && session.inspectCommand) ||
    (typeof product.inspectCommand === "string" && product.inspectCommand) ||
    null;
  const preserved =
    (typeof session.preservedPath === "string" && session.preservedPath) ||
    (typeof product.preservedArtifact === "string" &&
      product.preservedArtifact) ||
    null;

  const terminalSummary =
    (typeof session.terminalSummary === "string" && session.terminalSummary) ||
    (typeof product.terminalSummary === "string" && product.terminalSummary) ||
    (typeof product.blockReason === "string" && product.blockReason) ||
    (typeof session.validation?.reason === "string" &&
      session.validation.reason) ||
    "";

  const advancesSession =
    session.advancesSession === true ||
    product.advancesSession === true;

  /** @type {string[]} */
  const incomplete = [];
  /** @type {string[]} */
  const remaining = [];
  if (disposition === "STOPPED") {
    incomplete.push("Task was stopped by the operator or cancelled mid-session.");
    remaining.push("Re-run the objective if more engineering work is needed.");
  } else if (disposition === "PARTIAL") {
    incomplete.push(
      terminalSummary ||
        "Some validation checks passed; the result is only partially verified.",
    );
    remaining.push("Review failing checks and continue engineering if needed.");
  } else if (disposition === "BLOCKED") {
    incomplete.push(
      terminalSummary ||
        classification ||
        "Engineering did not reach a verified result.",
    );
    if (/AG1_AUTH|auth required|credential/i.test(terminalSummary)) {
      remaining.push("Authenticate the engineering engine, then retry.");
    } else if (/BUDGET_WALL|wall.?clock/i.test(`${terminalSummary} ${classification}`)) {
      remaining.push(
        "Wall-clock budget was reached before verification completed — continue with a focused follow-up task.",
      );
    } else if (/UNMERGED|merge|rebase|conflict/i.test(terminalSummary)) {
      remaining.push("Finish or abort the in-progress merge/rebase, then retry.");
    } else if (checks.some((c) => c.ok === false)) {
      remaining.push("Fix failing checks, then re-run verification.");
    } else {
      remaining.push("Inspect the session history and retry or refine the objective.");
    }
  } else if (disposition === "COMPLETE") {
    // Merge advice only when the session actually advanced onto a task branch
    // the operator must adopt — never merely because branch+sha exist, and
    // never for read-only / assessment objectives.
    const objectiveLooksAssessment =
      /\b(assess|inspect|check|review|audit|report|read-?only|identify|findings?)\b/i.test(
        objective,
      ) &&
      !/\b(fix|repair|implement|add|change|update|migrate|refactor)\b/i.test(
        objective,
      );
    if (advancesSession && branch && sha && !objectiveLooksAssessment) {
      remaining.push(
        `Merge when ready — integrate task branch ${branch} into your primary.`,
      );
    }
  }

  const pushPerformed = session.pushPerformed === true;
  const primaryUntouched =
    typeof session.primaryUntouched === "boolean"
      ? session.primaryUntouched
      : typeof product.primaryUntouched === "boolean"
        ? product.primaryUntouched
        : null;

  const diffLines = Array.isArray(product.diffPreviewLines)
    ? product.diffPreviewLines.filter((l) => typeof l === "string").slice(0, 40)
    : [];

  const preferredEngine =
    (typeof session.preferredEngine === "string" && session.preferredEngine) ||
    (typeof product.preferredEngine === "string" && product.preferredEngine) ||
    null;
  const engine =
    (typeof session.engine === "string" && session.engine) ||
    (typeof product.engine === "string" && product.engine) ||
    null;
  const cursorMode =
    (typeof session.cursorMode === "string" && session.cursorMode) ||
    (typeof product.cursorMode === "string" && product.cursorMode) ||
    null;
  const enginesUsed = Array.isArray(session.enginesUsed)
    ? session.enginesUsed.map(String).filter(Boolean)
    : Array.isArray(product.enginesUsed)
      ? product.enginesUsed.map(String).filter(Boolean)
      : [];

  return {
    disposition,
    classification: classification || disposition,
    objective,
    whatPathDid,
    discoveries,
    files: files.map(String),
    commands,
    checks,
    durationMs,
    timing,
    branch,
    sha,
    baseline,
    inspect,
    preserved,
    primaryUntouched,
    pushPerformed,
    terminalSummary: clip(terminalSummary, 800),
    incomplete,
    remaining,
    diffLines,
    preferredEngine,
    engine,
    cursorMode,
    enginesUsed,
    reportPath:
      typeof product.engineeringReportPath === "string"
        ? product.engineeringReportPath
        : null,
    taskId:
      typeof product.taskId === "string" ? product.taskId : null,
  };
}

/**
 * Plain-text engineering report (copy/export / durable file).
 * @param {ReturnType<typeof buildEngineeringReportModel>} model
 */
export function formatEngineeringReportPlain(model) {
  /** @type {string[]} */
  const lines = [];
  const head =
    model.disposition === "COMPLETE"
      ? "✓ COMPLETE"
      : model.disposition === "PARTIAL"
        ? "◐ PARTIAL"
        : model.disposition === "STOPPED"
          ? "■ STOPPED"
          : "■ BLOCKED";
  lines.push(head);
  lines.push("");
  lines.push("PATH ● Code — Engineering report");
  lines.push("");

  if (model.objective) {
    lines.push("Asked");
    for (const p of model.objective.split("\n").slice(0, 12)) {
      lines.push(`  ${p}`);
    }
    lines.push("");
  }

  if (
    model.preferredEngine ||
    model.engine ||
    model.cursorMode ||
    (Array.isArray(model.enginesUsed) && model.enginesUsed.length > 0)
  ) {
    lines.push("Engine fabric");
    if (model.preferredEngine) {
      lines.push(`  preferred  ${model.preferredEngine}`);
    }
    if (model.engine) {
      lines.push(`  last turn  ${model.engine}`);
    }
    if (Array.isArray(model.enginesUsed) && model.enginesUsed.length > 0) {
      lines.push(`  used       ${model.enginesUsed.join(" · ")}`);
    }
    if (model.cursorMode) {
      lines.push(`  cursor     ${model.cursorMode}`);
    }
    lines.push("");
  }

  if (model.whatPathDid.length) {
    lines.push("What PATH did");
    for (const n of model.whatPathDid) {
      lines.push(`  ${n}`);
    }
    lines.push("");
  }

  if (model.discoveries.length) {
    lines.push("Important discoveries");
    for (const n of model.discoveries) {
      lines.push(`  ${n}`);
    }
    lines.push("");
  }

  if (model.files.length) {
    lines.push("Changed");
    for (const f of model.files.slice(0, 40)) {
      lines.push(`  ${f}`);
    }
    if (model.files.length > 40) {
      lines.push(`  … +${model.files.length - 40} more`);
    }
    lines.push("");
  }

  if (model.diffLines.length) {
    lines.push("Diff preview");
    for (const l of model.diffLines.slice(0, 24)) {
      lines.push(`  ${l}`);
    }
    lines.push("");
  }

  // Commands are supporting evidence — keep Checks / Result primary for operators.
  if (model.commands.length && model.commands.length <= 8) {
    lines.push("Commands / tool activity");
    for (const c of model.commands) {
      lines.push(`  ${c}`);
    }
    lines.push("");
  }

  if (model.checks.length) {
    lines.push("Checks");
    for (const c of model.checks) {
      const mk = c.ok === true ? "✓" : c.ok === false ? "✕" : "·";
      lines.push(`  ${mk} ${c.name}`);
    }
    lines.push("");
  }

  if (typeof model.durationMs === "number") {
    lines.push("Duration");
    lines.push(`  ${formatDuration(model.durationMs)}`);
    lines.push("");
  }

  // Timing detail stays in the durable file only when compact — skip bulky
  // zero-heavy buckets from the default plain shape used on the living canvas
  // by preferring a short duration line above. Keep a compact timing block.
  if (model.timing && typeof model.timing === "object") {
    const entries = Object.entries(model.timing).filter(
      ([, v]) => typeof v === "number" && v > 0,
    );
    if (entries.length > 0) {
      lines.push("Timing");
      for (const [k, v] of entries) {
        lines.push(`  ${k.padEnd(14)} ${formatDuration(/** @type {number} */ (v))}`);
      }
      lines.push("");
    }
  }

  if (model.branch || model.sha || model.baseline || model.preserved) {
    lines.push("Git / result state");
    if (model.branch) lines.push(`  branch  ${model.branch}`);
    if (model.sha) lines.push(`  commit  ${String(model.sha).slice(0, 12)}`);
    if (model.baseline) {
      lines.push(`  baseline ${String(model.baseline).slice(0, 12)}`);
    }
    if (model.primaryUntouched != null) {
      lines.push(
        `  primary untouched  ${model.primaryUntouched ? "yes" : "NO"}`,
      );
    }
    lines.push(
      model.pushPerformed
        ? "  push performed"
        : "  No push performed",
    );
    if (model.preserved) lines.push(`  preserved  ${model.preserved}`);
    if (model.inspect) {
      lines.push("  Inspect full result:");
      lines.push(`    ${model.inspect}`);
    }
    lines.push("");
  }

  if (model.incomplete.length) {
    lines.push("Not completed");
    for (const n of model.incomplete) {
      lines.push(`  ${n}`);
    }
    lines.push("");
  }

  if (model.remaining.length) {
    lines.push("Remaining / operator action");
    for (const n of model.remaining) {
      lines.push(`  ${n}`);
    }
    lines.push("");
  }

  if (model.reportPath) {
    lines.push(`Report file: ${model.reportPath}`);
    lines.push("");
  }

  lines.push("Type /report to copy this engineering report again.");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

/**
 * @param {string} taskId
 * @param {string} [runtimeRoot]
 */
export function resolveEngineeringReportPath(taskId, runtimeRoot) {
  const root = runtimeRoot || resolvePathRuntimeRoot();
  return join(root, "metadata", "tasks", `${taskId}.report.txt`);
}

/**
 * @param {string} taskId
 * @param {string} plain
 * @param {string} [runtimeRoot]
 */
export function writeEngineeringReportFile(taskId, plain, runtimeRoot) {
  const id = String(taskId || "").trim();
  if (!id) return null;
  const path = resolveEngineeringReportPath(id, runtimeRoot);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, plain.endsWith("\n") ? plain : `${plain}\n`, "utf8");
  return path;
}

/**
 * Build + write from product state (canvas / /report path).
 * @param {Record<string, unknown>} product
 * @param {{ runtimeRoot?: string, session?: Parameters<typeof buildEngineeringReportModel>[1] }} [opts]
 */
export function materializeEngineeringReport(product, opts = {}) {
  const session = opts.session || {};
  const model = buildEngineeringReportModel(product, session);
  const taskId =
    (typeof product.taskId === "string" && product.taskId.trim()) ||
    (typeof session.taskId === "string" && session.taskId.trim()) ||
    "";
  let reportPath = null;
  if (taskId) {
    reportPath = resolveEngineeringReportPath(taskId, opts.runtimeRoot);
    model.reportPath = reportPath;
  }
  const plain = formatEngineeringReportPlain(model);
  if (taskId && reportPath) {
    writeEngineeringReportFile(taskId, plain, opts.runtimeRoot);
  }
  return {
    model: {
      ...model,
      reportPath: reportPath || model.reportPath,
    },
    plain,
    disposition: model.disposition,
    reportPath,
  };
}

/**
 * @param {string} taskId
 * @param {string} [runtimeRoot]
 */
export function engineeringReportExists(taskId, runtimeRoot) {
  const id = String(taskId || "").trim();
  if (!id) return false;
  return existsSync(resolveEngineeringReportPath(id, runtimeRoot));
}

export { formatDuration as formatReportDuration };
