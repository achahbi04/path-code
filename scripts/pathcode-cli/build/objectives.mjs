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
 * Latest creator message on the current intent revision, verbatim.
 * @param {import('./types.mjs').BuildRecord} record
 */
export function currentCreatorRequest(record) {
  const revision = Number(record?.intent?.outcomeRevision || 1);
  const messages = (record?.conversation || []).filter(
    (message) =>
      message?.role === "user" && Number(message.intentRevision) === revision,
  );
  const last = messages[messages.length - 1];
  return last ? String(last.text || "").trim() : "";
}

/**
 * Sentences the creator already wrote as constraints. Transported verbatim.
 * PATH does not judge whether a later diff complies.
 * @param {string} text
 */
export function explicitCreatorConstraints(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .filter((sentence) =>
      /\b(do not|don't|do nothing else|only change|only this|keep the current|preserve existing|do not modify)\b/i.test(
        sentence,
      ),
    );
}

/**
 * A follow-up turn is a creator request against a product that already exists.
 * The first build, before any adopted result, stays a greenfield objective.
 * @param {import('./types.mjs').BuildRecord} record
 */
export function isFollowUpCreatorTurn(record) {
  const hasProduct = (record?.children || []).some(
    (child) =>
      child?.kind === "engineer" &&
      child.adoptedSha &&
      !child.orphanAbandoned,
  );
  if (!hasProduct) return false;
  const revision = Number(record?.intent?.outcomeRevision || 1);
  return revision > 1 && Boolean(currentCreatorRequest(record));
}

/**
 * @param {import('./types.mjs').BuildRecord} record
 * @param {string} gap
 */
export function frameEngineerObjective(record, gap) {
  const binding = (record.projectBindings || [])[0];
  const productKind = record.productBrief?.productKind || "unknown";
  const wantsWeb =
    productKind === "web" ||
    /website|web\s*app|landing/i.test(String(record.intent?.outcome || ""));
  const selectedElement = record.loop?.pendingSelectedElement || null;
  const selectionBlock = selectedElement
    ? [
        "",
        "Operator selected this exact preview element payload. Use it as DOM/render context; do not infer a source file unless project evidence proves that mapping:",
        JSON.stringify(selectedElement),
      ].join("\n")
    : "";
  const creatorRequest = currentCreatorRequest(record);
  const followUp = isFollowUpCreatorTurn(record);

  if (followUp) {
    const request = creatorRequest || String(gap || "").trim();
    const constraints = explicitCreatorConstraints(request);
    return [
      "PATH Build engineer task — follow-up creator change.",
      "The current creator request is the controlling engineering objective.",
      "Do not treat this turn as a greenfield rebuild or as completion of the whole historical product.",
      "",
      "CURRENT CREATOR REQUEST",
      request,
      "",
      "EXPLICIT CREATOR CONSTRAINTS",
      constraints.length
        ? constraints.map((line) => `- ${line}`).join("\n")
        : "- (none stated beyond the request itself)",
      "",
      "Preserve unrelated existing product behavior and project state.",
      "Do not close unrelated historical product gaps during this turn.",
      "Make only engineering changes reasonably required to satisfy the current request and preserve the existing project's runnability.",
      "Use existing project-native validation where it already applies.",
      "Do not create unrelated architecture, manifest, or test scaffolding merely because a greenfield build would.",
      "Commit on the existing task branch. Do not run git init or create a nested .git.",
      selectionBlock,
      "",
      "Before you finish, inspect the diff this turn produced against the current creator request and the explicit constraints.",
      "If you introduced unrelated changes, revert them in this same task.",
      "If you cannot satisfy the request without violating a constraint, stop and report that honestly. Do not claim the task is verified.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const greenfieldHint = binding?.originGitInit
    ? [
        "Greenfield context: this binding began as git-init-only — the Build folder IS already a git repository.",
        "CRITICAL: Do NOT run `git init`. Do NOT create a nested .git. Commit on the existing repo / task branch only.",
        wantsWeb
          ? "This intent is a website. The product of this turn must be a previewable website in this worktree (index.html or an equivalent web entry the outcome names). A CLI, library, or unrelated sample program does not satisfy the intent. Commit that website on the existing task branch. If you add package.json, include a `test` script that runs a local node check of the site with no install and no npx; PATH admits test, typecheck, lint, check, and build as validation."
          : "Establish the software the outcome names in this worktree, with a project-native check when the stack has one.",
        "git add + git commit on the existing repository (never re-init).",
        "Do not stop at a marker file alone.",
      ].join("\n")
    : "Continue engineering toward the outcome with project-native validation.";

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
/**
 * @param {import('./types.mjs').BuildRecord | null | undefined} record
 */
export function wantsWebProduct(record) {
  const kind = record?.productBrief?.productKind || "";
  return (
    kind === "web" ||
    /website|web\s*app|landing/i.test(String(record?.intent?.outcome || ""))
  );
}

/**
 * Deterministic provenance guard. A web intent may only adopt a web artifact.
 * @param {import('./types.mjs').BuildRecord | null | undefined} record
 * @param {string | null | undefined} capability
 */
/**
 * A removed task worktree cannot be detected on disk. HTML paths in the
 * checkpoint are still evidence of a website result.
 * @param {unknown} files
 * @returns {"web" | null}
 */
export function capabilityFromChangedFiles(files) {
  const names = (Array.isArray(files) ? files : []).map((file) =>
    String(file || "").replace(/\\/g, "/"),
  );
  if (names.some((file) => /(^|\/)index\.html$/i.test(file) || /\.html$/i.test(file))) {
    return "web";
  }
  return null;
}

export function adoptionAllowedForIntent(record, capability) {
  if (!wantsWebProduct(record)) return { ok: true, reason: null };
  if (capability === "web") return { ok: true, reason: null };
  return {
    ok: false,
    reason:
      "Result does not belong to the current web intent. It was kept on the task branch and was not adopted.",
  };
}

export function completenessClaim(record) {
  return `BUILD COMPLETE: the outcome is satisfied and all required explicit requirements remain respected (intent revision ${record.intent.outcomeRevision}).`;
}
