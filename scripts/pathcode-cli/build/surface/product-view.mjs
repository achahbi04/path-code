/**
 * PATH Build — human product projection (not terminal/CLI language).
 */

/**
 * @param {import('../types.mjs').BuildRecord | null | undefined} build
 */
export function projectBuildForSurface(build) {
  if (!build || typeof build !== "object") {
    return {
      ok: false,
      phase: "idle",
      headline: "What do you want to build?",
      detail:
        "Describe the product in plain language. PATH Build will create a project and engineer toward that outcome.",
      buildId: null,
      status: null,
      outcome: "",
      projectRoot: null,
      originGitInit: false,
      progressLabel: null,
      requirements: [],
      criteria: [],
      children: [],
      proposedNext: null,
      blockedReason: null,
      complete: false,
      canSteer: false,
      handoff: null,
    };
  }

  const status = String(build.loop?.status || "unknown");
  const complete = status === "complete";
  const blocked = status === "blocked";
  const binding = (build.projectBindings || [])[0] || null;
  const projectRoot = binding?.projectRoot || null;
  const kids = Array.isArray(build.children) ? build.children : [];
  const last = kids.length ? kids[kids.length - 1] : null;

  /** @type {string} */
  let phase = "running";
  /** @type {string} */
  let headline = "Building your product…";
  /** @type {string} */
  let detail = "PATH is establishing architecture and working toward your outcome.";
  /** @type {string | null} */
  let progressLabel = null;

  if (complete) {
    phase = "complete";
    headline = "Build complete";
    detail =
      "The product loop finished against your outcome and requirements. You can open the project folder or continue engineering in PATH Code.";
    progressLabel = "Done";
  } else if (blocked) {
    phase = "blocked";
    headline = "Build needs your input";
    detail =
      build.loop?.blockedReason ||
      "PATH could not advance honestly. Adjust the outcome or add a requirement, then continue.";
    progressLabel = "Blocked";
  } else if (!kids.length) {
    phase = "starting";
    headline = "Starting your build";
    detail = binding?.originGitInit
      ? "Created a fresh project (git init only). First engineer turn will establish the architecture."
      : "Bound to your project. First engineer turn is about to begin.";
    progressLabel = "Starting";
  } else if (last) {
    const kind = String(last.kind || "");
    const ds = String(last.dispatchState || "");
    if (kind === "engineer") {
      phase = "engineering";
      headline =
        ds === "dispatched" || ds === "selected"
          ? "Engineering the product"
          : "Engineering pass finished";
      detail =
        "A real engine is implementing toward your outcome — not a template scaffold.";
      progressLabel = "Engineering";
    } else if (kind === "evaluate") {
      phase = "evaluating";
      headline = "Checking the product";
      detail = "Independent evaluation against your outcome and criteria.";
      progressLabel = "Evaluating";
    } else if (kind === "challenge") {
      phase = "challenging";
      headline = "Stress-testing claims";
      detail = "Challenge pass looks for gaps before PATH calls the build done.";
      progressLabel = "Challenging";
    } else {
      progressLabel = kind || "Working";
    }
    if (last.classification) {
      detail = `${detail} Latest result: ${last.classification}.`;
    }
  }

  if (build.hypotheses?.proposedNextAction && !complete) {
    detail = `${detail} Next: ${build.hypotheses.proposedNextAction}`;
  }

  return {
    ok: true,
    phase,
    headline,
    detail,
    buildId: build.buildId,
    status,
    outcome: String(build.intent?.outcome || ""),
    outcomeRevision: build.intent?.outcomeRevision || 1,
    projectRoot,
    originGitInit: binding?.originGitInit === true,
    progressLabel,
    requirements: (build.intent?.explicitRequirements || []).map((r) => ({
      id: r.id,
      statement: r.statement,
      status: r.status,
    })),
    criteria: (build.outcomeCriteria || []).map((c) => ({
      id: c.id,
      statement: c.statement,
      status: c.status,
      required: c.required !== false,
    })),
    children: kids.slice(-12).map((c) => ({
      kind: c.kind,
      state: c.dispatchState,
      classification: c.classification || null,
      taskId: c.taskId,
    })),
    proposedNext: build.hypotheses?.proposedNextAction || null,
    blockedReason: build.loop?.blockedReason || null,
    complete,
    canSteer: !complete,
    handoff: projectRoot
      ? {
          projectRoot,
          codeHint: `cd ${JSON.stringify(projectRoot)} && node <path-to-checkout>/scripts/pathcode.mjs`,
          openFolderHint: `open ${JSON.stringify(projectRoot)}`,
        }
      : null,
  };
}
