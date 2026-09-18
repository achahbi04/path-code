/**
 * S5 — impact-aware re-inspection (Depth A mechanical; B/C policy flags).
 */

import { readTaskCheckpoint } from "../ag10/task-checkpoint.mjs";
import {
  applyStaleInvalidation,
  captureBindingReality,
} from "./evidence.mjs";
import { engineeringReportExists, resolveEngineeringReportPath } from "../engineering-report.mjs";
import { existsSync, readFileSync } from "node:fs";

/**
 * Depth A — lightweight reality refresh for one binding.
 *
 * @param {{
 *   runtimeRoot: string,
 *   record: import('./types.mjs').BuildRecord,
 *   bindingId: string,
 *   childTaskId?: string,
 * }} input
 */
export function realityRefreshDepthA(input) {
  const binding = (input.record.projectBindings || []).find(
    (b) => b.bindingId === input.bindingId,
  );
  if (!binding) {
    return {
      ok: false,
      code: "BINDING_MISSING",
      message: `binding ${input.bindingId} not found`,
    };
  }

  const reality = captureBindingReality(binding.projectRoot);
  /** @type {string[]} */
  let changedFiles = [...(reality.changedFiles || [])];
  /** @type {object|null} */
  let childSummary = null;

  if (input.childTaskId) {
    const cp = readTaskCheckpoint(input.runtimeRoot, input.childTaskId);
    if (cp) {
      childSummary = {
        taskId: input.childTaskId,
        finalState: cp.finalState || null,
        classification: cp.validation?.classification || null,
        sha: cp.sha || null,
        branch: cp.branch || null,
        worktreePath: cp.worktreePath || null,
        headSha: cp.headSha || null,
        diffFingerprint: cp.diffFingerprint || null,
        changedFiles: Array.isArray(cp.changedFiles) ? cp.changedFiles : [],
      };
      if (Array.isArray(cp.changedFiles)) {
        changedFiles = [...new Set([...changedFiles, ...cp.changedFiles])];
      }
      if (engineeringReportExists(input.childTaskId, input.runtimeRoot)) {
        childSummary.reportPath = resolveEngineeringReportPath(
          input.childTaskId,
          input.runtimeRoot,
        );
      }
    }
  }

  const prev = input.record.loop?.lastRealityDelta;
  const prevFp =
    prev && typeof prev === "object" && prev.dirtyFingerprint
      ? String(prev.dirtyFingerprint)
      : "";
  const fingerprintChanged =
    !prevFp || prevFp !== String(reality.dirtyFingerprint || "");

  const invalidation = applyStaleInvalidation(input.record, {
    bindingId: binding.bindingId,
    changedFiles,
    reality,
  });

  const delta = {
    depth: "A",
    bindingId: binding.bindingId,
    projectRoot: binding.projectRoot,
    headSha: reality.headSha,
    dirtyFingerprint: reality.dirtyFingerprint,
    configFingerprint: reality.configFingerprint,
    changedFiles: changedFiles.slice(0, 200),
    fingerprintChanged,
    demotedIds: invalidation.demoted,
    childSummary,
    at: new Date().toISOString(),
  };

  /** @type {'A'|'B'|'C'} */
  let recommendedNext = "A";
  if (invalidation.demoted.length > 0) recommendedNext = "B";
  if (
    /architect|topology|binding|multi.?repo|compose|schema|contract/i.test(
      changedFiles.join("\n"),
    )
  ) {
    recommendedNext = "C";
  }

  return {
    ok: true,
    delta,
    recommendedNext,
    needsTargetedRevalidation: invalidation.demoted.length > 0,
  };
}

/**
 * Suggest Depth B scopes from demoted criterion ids.
 * @param {import('./types.mjs').BuildRecord} record
 * @param {string[]} demotedIds
 */
export function buildTargetedRevalidationObjective(record, demotedIds) {
  const criteria = (record.outcomeCriteria || []).filter((c) =>
    demotedIds.includes(c.id),
  );
  const reqs = (record.intent.explicitRequirements || []).filter((r) =>
    demotedIds.includes(r.id),
  );
  const lines = [
    "PATH Build targeted revalidation (assessment — do not implement product features).",
    "Re-run only the checks/builds/probes needed for these claims, against the current project reality.",
    "Report each claim as PROVEN/SATISFIED, UNMET/VIOLATED, or UNKNOWN with concrete evidence paths/commands.",
    "",
    `Outcome: ${record.intent.outcome}`,
    `Intent revision: ${record.intent.outcomeRevision}`,
    "",
  ];
  if (criteria.length) {
    lines.push("Criteria to revalidate:");
    for (const c of criteria) lines.push(`- [${c.id}] ${c.statement}`);
  }
  if (reqs.length) {
    lines.push("Requirements to revalidate:");
    for (const r of reqs) lines.push(`- [${r.id}] ${r.statement}`);
  }
  lines.push(
    "",
    "Do not leave incidental setup as product changes; revert disposable probes.",
  );
  return lines.join("\n");
}

/**
 * Parse simple STATUS lines from evaluate/challenge report text.
 * @param {string} text
 * @returns {Array<{ id: string, status: string, note?: string }>}
 */
export function parseStatusDirectives(text) {
  const out = [];
  const re =
    /^\s*(?:CRITERION|REQUIREMENT|CLAIM)\s+([A-Za-z0-9._-]+)\s*:\s*(PROVEN|UNMET|UNKNOWN|SATISFIED|VIOLATED)\b(?:\s*[—\-–:]\s*(.*))?$/gim;
  let m;
  while ((m = re.exec(String(text || "")))) {
    out.push({
      id: m[1],
      status: m[2].toUpperCase(),
      note: (m[3] || "").trim() || undefined,
    });
  }
  return out;
}

/**
 * @param {string} reportPath
 */
export function readReportText(reportPath) {
  if (!reportPath || !existsSync(reportPath)) return "";
  try {
    return readFileSync(reportPath, "utf8");
  } catch {
    return "";
  }
}
