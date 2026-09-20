/**
 * Read-only Engineering Activity projection for PATH Build.
 * Sourced from durable children, events, checkpoints, and adoption history.
 */

const EVENT_LABELS = Object.freeze({
  "build.created": "Preparing project",
  "brief.bootstrap": "Understanding the product",
  "brief.accepted": "Understanding the product",
  "brief.dispatched": "Understanding the product",
  "brief.selected": "Understanding the product",
  "engineer.selected": "Establishing architecture",
  "engineer.dispatched": "Engineering first version",
  "engineer.terminal_seen": "Adopting verified revision",
  "engineer.consumed": "Adopting verified revision",
  "adoption.completed": "Adopting verified revision",
  "runtime.started": "Starting preview",
  "runtime.updated": "Starting preview",
  "runtime.restarted": "Refreshing preview",
  "evaluate.dispatched": "Running project checks",
  "evaluate.consumed": "Running project checks",
  "challenge.dispatched": "Challenging completion claims",
  "challenge.consumed": "Challenging completion claims",
  "intent.revised": "Updating product direction",
  "assessment.updated": "Updating evidence",
  "build.completed": "Ready",
  "build.paused": "Paused",
  "build.resumed": "Resuming",
  "build.recovered": "Recovering",
  "coordinator.error": "Coordinator recovered an error",
});

/**
 * @param {object[] | undefined} events
 */
export function labelFromBuildEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return null;
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const type = String(events[i]?.type || "");
    if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  }
  return null;
}

/**
 * @param {import('../types.mjs').BuildRecord | null | undefined} build
 * @param {{
 *   events?: object[],
 *   checkpoint?: object | null,
 *   diff?: { files?: string[], summary?: string, commands?: string[] } | null,
 * }} [extras]
 */
export function projectEngineeringActivity(build, extras = {}) {
  const kids = Array.isArray(build?.children) ? build.children : [];
  const last = kids.length ? kids[kids.length - 1] : null;
  const events = Array.isArray(extras.events) ? extras.events : [];
  const checkpoint = extras.checkpoint || null;
  const adoption = Array.isArray(build?.adoptionHistory)
    ? build.adoptionHistory[build.adoptionHistory.length - 1]
    : null;
  const files = [
    ...(Array.isArray(checkpoint?.changedFiles) ? checkpoint.changedFiles : []),
    ...(Array.isArray(extras.diff?.files) ? extras.diff.files : []),
    ...(Array.isArray(extras.worktreeFiles) ? extras.worktreeFiles : []),
  ]
    .map(String)
    .filter(Boolean)
    .slice(0, 24);
  const uniqueFiles = [...new Set(files)];
  const engine =
    checkpoint?.inFlightEngine ||
    last?.provider ||
    (typeof checkpoint?.latestEngineTurn === "string"
      ? checkpoint.latestEngineTurn.replace(/^(in_flight|interrupted):/, "")
      : null);
  const phase =
    last?.kind === "brief"
      ? "inspecting"
      : last?.kind === "evaluate" || last?.kind === "challenge"
        ? "validation"
        : last?.dispatchState === "consumed" && adoption
          ? "adoption"
          : last?.dispatchState === "dispatched" || last?.dispatchState === "selected"
            ? "editing"
            : "inspecting";

  return {
    action: last?.kind || null,
    engine: engine || null,
    taskId: last?.taskId || checkpoint?.taskId || null,
    phase,
    label: labelFromBuildEvents(events),
    files: uniqueFiles,
    diff: extras.diff?.summary || null,
    commands: extras.diff?.commands || [],
    checks: checkpoint?.validation || last?.classification || null,
    resultSha: last?.resultFingerprint || checkpoint?.sha || null,
    adoptedSha: adoption?.adoptedSha || build?.authoritativeSha || null,
    authoritativeSha: build?.authoritativeSha || null,
    dispatchState: last?.dispatchState || null,
    classification: last?.classification || null,
    intentRevision: last?.intentRevision || build?.intent?.outcomeRevision || null,
  };
}
