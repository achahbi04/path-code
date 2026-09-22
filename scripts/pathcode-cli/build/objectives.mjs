/**
 * S5 — Build child task objective framing (engineer / evaluate / challenge).
 */

import { structuredResultContractBlock } from "./cognitive-result.mjs";

/**
 * @param {import('./types.mjs').BuildRecord} record
 */
function intentBlock(record) {
  const reqs = (record.intent.explicitRequirements || [])
    .map((r) => `- [${r.id}] (${r.status}) ${r.statement}`)
    .join("\n");
  const criteria = (record.outcomeCriteria || [])
    .map((c) => `- [${c.id}] required=${c.required} (${c.status}) ${c.statement}`)
    .join("\n");
  return [
    `PATH Build outcome (revision ${record.intent.outcomeRevision}):`,
    record.intent.outcome,
    "",
    "Explicit operator requirements (must remain respected; do not silently weaken):",
    reqs || "- (none stated)",
    "",
    "Outcome criteria:",
    criteria || "- (none yet — propose an initial set if evaluating)",
    "",
    `Product kind: ${record.productBrief?.productKind || "unknown"}`,
    record.productBrief?.revisionContext
      ? `Latest operator request: ${record.productBrief.revisionContext}`
      : "",
  ].filter((line) => line !== undefined).join("\n");
}

/**
 * @param {import('./types.mjs').BuildRecord} record
 * @param {string} gap
 */
export function frameEngineerObjective(record, gap) {
  const binding = (record.projectBindings || [])[0];
  const greenfieldHint = binding?.originGitInit
    ? [
        "Greenfield context: this binding began as git-init-only — the Build folder IS already a git repository.",
        "CRITICAL: Do NOT run `git init`. Do NOT create a nested .git. Commit on the existing repo / task branch only.",
        "You MUST establish a real software project in this turn:",
        "- package.json (or equivalent manifests for the chosen stack) OR a static index.html",
        "- source entrypoints in THIS worktree (the Build project root)",
        "- at least one project-native check/test script that exits 0 (for Node) OR a static index.html that renders",
        "- git add + git commit on the existing repository (never re-init)",
        "Do not stop at a marker file alone.",
      ].join("\n")
    : "Continue engineering toward the outcome with project-native validation.";

  const selectedElement = record.loop?.pendingSelectedElement || null;
  const selectionBlock = selectedElement
    ? [
        "",
        "Operator selected this exact preview element payload. Use it as DOM/render context; do not infer a source file unless project evidence proves that mapping:",
        JSON.stringify(selectedElement),
      ].join("\n")
    : "";

  return [
    "PATH Build engineer task — intentional product mutation is allowed.",
    "Close the following product gap with real engineering in this project.",
    "Establish or modify architecture, manifests, code, tests, and config as needed.",
    "Validate with project-native checks when possible.",
    greenfieldHint,
    "",
    intentBlock(record),
    selectionBlock,
    "",
    "Highest-value gap to close now:",
    gap ||
      record.hypotheses?.proposedNextAction ||
      "Establish the software architecture, manifests, runnable entrypoints, and tests required by the outcome.",
    "",
    "When done, summarize what exists now vs what still remains for the Build outcome.",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {import('./types.mjs').BuildRecord} record
 * @param {{ evidencePackage?: string }} [opts]
 */
export function frameEvaluateObjective(record, opts = {}) {
  return [
    "PATH Build evaluate task — assessment only.",
    "READ-ONLY assessment. Do not modify, change, edit, write, or alter product files.",
    "Disposable probes must be revertible if absolutely required; prefer inspection of existing FS/Git/tests/reports.",
    "Inspect the current task worktree's HTML/CSS/source and run read-only checks when browser evidence alone is insufficient.",
    "The absolute productRoot is provenance; use the current task worktree for file inspection.",
    "",
    intentBlock(record),
    "",
    "Determine:",
    "1) What currently exists toward the outcome",
    "2) What remains missing",
    "3) Criterion status must be exactly PROVEN, UNMET, or UNKNOWN; requirement status must be exactly SATISFIED, VIOLATED, or UNKNOWN",
    "4) Whether architecture/gap hypotheses remain valid",
    "5) The single highest-value next engineering action",
    "",
    "Your final response must contain only the structured path-build-evaluation envelope below.",
    "Do not add prose or legacy CRITERION/REQUIREMENT lines outside the envelope.",
    "Keep each reason concise (maximum 160 characters) and the entire envelope under 12,000 characters.",
    opts.evidencePackage
      ? `\nCross-binding evidence package:\n${opts.evidencePackage}`
      : "",
    structuredResultContractBlock("evaluate", record),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * @param {import('./types.mjs').BuildRecord} record
 * @param {string} claim
 * @param {{ evidencePackage?: string, preferPeerHint?: boolean }} [opts]
 */
export function frameChallengeObjective(record, claim, opts = {}) {
  return [
    "PATH Build challenge task — assessment only.",
    "READ-ONLY challenge. Do not modify, change, edit, write, or alter product files except disposable revertible probes.",
    "Attempt to FALSIFY the claim using real FS/Git/runtime/test/report evidence.",
    "Inspect the current task worktree directly; treat the absolute productRoot only as provenance.",
    "",
    intentBlock(record),
    "",
    "Claim to falsify:",
    claim,
    "",
    "Your final response must contain only the structured path-build-challenge envelope below.",
    "Do not add prose or legacy CLAIM/CRITERION/REQUIREMENT lines outside the envelope.",
    "Keep each reason concise (maximum 160 characters) and the entire envelope under 12,000 characters.",
    opts.preferPeerHint
      ? "Prefer independent verification against FS/Git/tests over trusting prior engineer narrative."
      : "",
    opts.evidencePackage
      ? `\nEvidence package:\n${opts.evidencePackage}`
      : "",
    structuredResultContractBlock("challenge", record),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Completeness challenge claim.
 * @param {import('./types.mjs').BuildRecord} record
 */
export function completenessClaim(record) {
  return `BUILD COMPLETE: the outcome is satisfied and all required explicit requirements remain respected (intent revision ${record.intent.outcomeRevision}).`;
}
