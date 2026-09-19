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
  ].join("\n");
}

/**
 * @param {import('./types.mjs').BuildRecord} record
 * @param {string} gap
 */
export function frameEngineerObjective(record, gap) {
  const binding = (record.projectBindings || [])[0];
  const greenfieldHint = binding?.originGitInit
    ? [
        "Greenfield context: this binding began as git-init-only.",
        "You MUST establish a real software project in this turn:",
        "- package.json (or equivalent manifests for the chosen stack)",
        "- source entrypoints",
        "- at least one project-native check/test script that exits 0",
        "- make an initial git commit of the established project",
        "Do not stop at a marker file alone.",
      ].join("\n")
    : "Continue engineering toward the outcome with project-native validation.";

  const lastUser = [...(record.conversation || [])]
    .reverse()
    .find((m) => m.role === "user" && m.element);
  const selectionBlock = lastUser?.element
    ? [
        "",
        "Operator selected a preview element — prioritize editing that source/render target:",
        JSON.stringify(lastUser.element).slice(0, 1_500),
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
    "",
    intentBlock(record),
    "",
    "Determine:",
    "1) What currently exists toward the outcome",
    "2) What remains missing",
    "3) Status of each criterion/requirement: PROVEN/SATISFIED, UNMET/VIOLATED, or UNKNOWN",
    "4) Whether architecture/gap hypotheses remain valid",
    "5) The single highest-value next engineering action",
    "",
    "Emit machine-readable lines (required):",
    "CRITERION <id>: PROVEN|UNMET|UNKNOWN — <evidence note>",
    "REQUIREMENT <id>: SATISFIED|VIOLATED|UNKNOWN — <evidence note>",
    "NEXT: <proposed engineer objective>",
    "HYPOTHESIS: <updated architecture/gap notes>",
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
    "",
    intentBlock(record),
    "",
    "Claim to falsify:",
    claim,
    "",
    "Return exactly one of:",
    "CLAIM STANDS — with concrete evidence refs",
    "CLAIM FALSIFIED — with concrete counter-evidence",
    "EVIDENCE INSUFFICIENT — what is missing",
    "",
    "Also emit machine-readable lines:",
    "CRITERION <id>: PROVEN|UNMET|UNKNOWN — … (if claim maps to a criterion)",
    "REQUIREMENT <id>: SATISFIED|VIOLATED|UNKNOWN — … (if applicable)",
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
