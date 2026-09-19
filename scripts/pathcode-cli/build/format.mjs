/**
 * S5 — operator-facing Build status (PATH product language).
 */

/**
 * @param {import('./types.mjs').BuildRecord} build
 */
export function formatBuildStatus(build) {
  const lines = [];
  lines.push("PATH Build");
  lines.push("");
  lines.push(`  buildId     ${build.buildId}`);
  lines.push(`  status      ${build.loop?.status || "unknown"}`);
  lines.push(`  revision    r${build.intent?.outcomeRevision || 1}`);
  if (build.loop?.pendingReinspect) {
    lines.push("  reinspect   pending");
  }
  if (build.loop?.blockedReason) {
    lines.push(`  blocked     ${build.loop.blockedReason}`);
  }
  lines.push("");
  lines.push("Outcome");
  for (const p of String(build.intent?.outcome || "").split("\n").slice(0, 8)) {
    lines.push(`  ${p}`);
  }
  lines.push("");
  lines.push("Explicit requirements");
  const reqs = build.intent?.explicitRequirements || [];
  if (!reqs.length) lines.push("  (none)");
  for (const r of reqs) {
    lines.push(`  [${r.status}] ${r.id} — ${r.statement}`);
  }
  lines.push("");
  lines.push("Outcome criteria");
  const crit = build.outcomeCriteria || [];
  if (!crit.length) lines.push("  (none yet)");
  for (const c of crit) {
    const req = c.required ? "required" : "optional";
    lines.push(`  [${c.status}] ${c.id} (${req}) — ${c.statement}`);
  }
  lines.push("");
  lines.push("Bindings");
  for (const b of build.projectBindings || []) {
    lines.push(
      `  ${b.bindingId}  ${b.projectRoot}${b.originGitInit ? "  (git-init origin)" : ""}`,
    );
  }
  lines.push("");
  lines.push("Children");
  const kids = build.children || [];
  if (!kids.length) lines.push("  (none)");
  for (const c of kids.slice(-8)) {
    lines.push(
      `  ${c.kind.padEnd(9)} ${c.dispatchState.padEnd(14)} ${c.taskId.slice(0, 8)}…${c.classification ? `  ${c.classification}` : ""}`,
    );
  }
  if (build.hypotheses?.proposedNextAction) {
    lines.push("");
    lines.push("Proposed next");
    lines.push(`  ${build.hypotheses.proposedNextAction}`);
  }
  if (build.hypotheses?.architectureNotes) {
    lines.push("");
    lines.push("Hypotheses (non-authoritative)");
    for (const p of String(build.hypotheses.architectureNotes)
      .split("\n")
      .slice(0, 6)) {
      lines.push(`  ${p}`);
    }
  }
  lines.push("");
  lines.push(
    "Product surface: path-build (browser). Debug: /build status · tick · steer · run",
  );
  return lines.join("\n");
}

/**
 * @param {import('./types.mjs').BuildRecord} build
 */
export function formatBuildCard(build) {
  const proven = (build.outcomeCriteria || []).filter((c) => c.status === "PROVEN")
    .length;
  const total = (build.outcomeCriteria || []).filter((c) => c.required).length;
  return [
    `PATH Build  ${build.buildId.slice(0, 8)}…`,
    `  ${String(build.intent?.outcome || "").slice(0, 80)}`,
    `  ${build.loop?.status} · r${build.intent?.outcomeRevision || 1} · criteria ${proven}/${total || "?"} proven`,
  ].join("\n");
}
