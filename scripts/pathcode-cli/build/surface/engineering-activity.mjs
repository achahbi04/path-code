/**
 * Read-only Engineering Activity projection for PATH Build.
 * Sourced from durable children, events, checkpoints, and adoption history.
 */

const ENGINE_NAMES = new Set(["cursor", "copilot", "antigravity"]);
const SECRET_TEXT =
  /\b(api[_-]?key|token|secret|password|authorization|bearer)\b|[A-Za-z0-9+/]{32,}={0,2}|sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}/i;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function engineName(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/(?:^|:)(cursor|copilot|antigravity)$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  return ENGINE_NAMES.has(name) ? name : null;
}

/**
 * @param {string} filePath
 * @param {string[]} roots
 */
function relativeProjectPath(filePath, roots) {
  let text = String(filePath || "").replace(/\\/g, "/");
  if (!text) return null;
  const sorted = [...roots].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const root of sorted) {
    const normalized = String(root).replace(/\\/g, "/").replace(/\/$/, "");
    if (text === normalized) return null;
    if (text.startsWith(`${normalized}/`)) {
      text = text.slice(normalized.length + 1);
      break;
    }
  }
  if (text.startsWith("/") || /^[A-Za-z]:\//.test(text)) {
    const parts = text.split("/").filter(Boolean);
    text = parts[parts.length - 1] || "";
  }
  if (!text || text === ".git" || SECRET_TEXT.test(text)) return null;
  return text.slice(0, 180);
}

/**
 * @param {unknown} command
 */
function sanitizeCommand(command, roots = []) {
  let text = String(command || "").trim();
  if (!text) return null;
  if (
    SECRET_TEXT.test(text) ||
    /\b(export\s+[A-Z0-9_]+=|Authorization:)/i.test(text) ||
    /\.copilot\b|application_default_credentials|\badc\.json\b/i.test(text)
  ) {
    return "[redacted command]";
  }
  const sorted = [...roots].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const root of sorted) {
    const normalized = String(root).replace(/\\/g, "/").replace(/\/$/, "");
    if (normalized) text = text.split(normalized).join(".");
  }
  text = text.replace(/(?:\/private)?\/tmp\/[^\s'"]+/g, "[path]");
  text = text.replace(/\/Users\/[^\s'"]+/g, "[path]");
  text = text.replace(/\/home\/[^\s'"]+/g, "[path]");
  return text.slice(0, 160);
}

/**
 * @param {object} line
 * @param {string | null} kind
 * @param {string[]} roots
 * @returns {{ label: string, path: string | null, command: string | null } | null}
 */
function labelTraceLine(line, kind, roots) {
  const type = String(line?.type || "");
  const tool = String(line?.tool || "");
  const path = relativeProjectPath(line?.path, roots);
  const command = sanitizeCommand(line?.command, roots);
  const status = String(line?.meta?.status || "").toLowerCase();
  if (type === "session.capability.collaborate") return null;
  if (type === "gateway.task.finished") {
    if (/fail|cancel|error/.test(status)) return { label: "failed", path: null, command: null };
    if (/complet|verif|success/.test(status)) {
      return { label: "result produced", path: null, command: null };
    }
    return null;
  }
  if (type === "session.cancelled" || type === "task.stop") {
    return { label: "failed", path: null, command: null };
  }
  if (type === "session.task.received") {
    if (kind === "brief") return { label: "understanding request", path: null, command: null };
    if (kind === "evaluate") return { label: "evaluating criteria", path: null, command: null };
    if (kind === "challenge") return { label: "challenge/review", path: null, command: null };
    return { label: "engineer dispatched", path: null, command: null };
  }
  if (type === "session.capability.preparing") {
    return { label: "inspecting project", path: null, command: null };
  }
  if (/create_file|write_file/.test(tool)) {
    return { label: path ? `created ${path}` : "created a file", path, command: null };
  }
  if (/edit_file|search_replace|apply_patch|^edit/.test(tool)) {
    return { label: path ? `editing ${path}` : "editing", path, command: null };
  }
  if (/view_file|list_directory|find_file|grep|search/.test(tool)) {
    return { label: path ? `inspecting ${path}` : "inspecting project", path, command: null };
  }
  if (/run_command/.test(tool)) {
    const shown = command || "";
    if (/test|check|vitest|jest|pytest/i.test(shown)) {
      if (line?.exitCode === 0) return { label: "test passed", path: null, command: shown };
      if (typeof line?.exitCode === "number") {
        return { label: "test failed", path: null, command: shown };
      }
      return { label: "running validation", path: null, command: shown };
    }
    if (!shown) return { label: "running a command", path: null, command: null };
    return { label: "running a command", path: null, command: shown };
  }
  return null;
}

/**
 * @param {object[] | undefined} lines
 * @param {string | null} kind
 * @param {string[]} roots
 */
export function projectTraceSteps(lines, kind, roots) {
  /** @type {{ at: string | null, label: string, path: string | null, command: string | null }[]} */
  const steps = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const labeled = labelTraceLine(line, kind, roots);
    if (!labeled) continue;
    const previous = steps[steps.length - 1];
    if (
      previous &&
      previous.label === labeled.label &&
      previous.path === labeled.path &&
      previous.command === labeled.command
    ) {
      continue;
    }
    steps.push({
      at: typeof line?.t === "string" ? line.t : null,
      label: labeled.label,
      path: labeled.path,
      command: labeled.command,
    });
  }
  return steps.slice(-16);
}

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
 *   traceLines?: object[],
 *   projectRoot?: string | null,
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
  const roots = [
    extras.projectRoot,
    build?.projectBindings?.[0]?.projectRoot,
    checkpoint?.worktreePath,
    checkpoint?.repoRoot,
  ].filter((value) => typeof value === "string");
  const files = [
    ...(Array.isArray(checkpoint?.changedFiles) ? checkpoint.changedFiles : []),
    ...(Array.isArray(extras.diff?.files) ? extras.diff.files : []),
    ...(Array.isArray(extras.worktreeFiles) ? extras.worktreeFiles : []),
  ]
    .map((file) => relativeProjectPath(String(file), roots) || "")
    .filter(Boolean)
    .slice(0, 24);
  const uniqueFiles = [...new Set(files)];
  const traceEngine = [...(Array.isArray(extras.traceLines) ? extras.traceLines : [])]
    .reverse()
    .map((line) =>
      line?.type === "session.capability.collaborate" ? null : engineName(line?.engine),
    )
    .find(Boolean);
  const engine =
    engineName(last?.provider) ||
    engineName(checkpoint?.latestEngineTurn) ||
    engineName(checkpoint?.inFlightEngine) ||
    traceEngine ||
    null;
  const steps = projectTraceSteps(extras.traceLines, last?.kind || null, roots);
  const latestStep = steps.length ? steps[steps.length - 1] : null;
  const phase =
    latestStep?.label.startsWith("editing") || latestStep?.label.startsWith("created")
      ? "editing"
      : latestStep?.label === "running validation" || latestStep?.label.startsWith("test ")
        ? "validation"
        : last?.kind === "brief"
          ? "understanding"
          : last?.kind === "evaluate" || last?.kind === "challenge"
            ? "validation"
            : last?.dispatchState === "consumed" && adoption
              ? "adoption"
              : last?.dispatchState === "dispatched" || last?.dispatchState === "selected"
                ? "editing"
                : "inspecting";

  return {
    action: last?.kind || null,
    engine,
    taskId: last?.taskId || checkpoint?.taskId || null,
    phase,
    label: latestStep?.label || labelFromBuildEvents(events),
    files: uniqueFiles,
    steps,
    diff: extras.diff?.summary || null,
    commands: (extras.diff?.commands || [])
      .map((command) => sanitizeCommand(command))
      .filter(Boolean),
    checks: checkpoint?.validation || last?.classification || null,
    resultSha: last?.resultFingerprint || checkpoint?.sha || null,
    adoptedSha: adoption?.adoptedSha || build?.authoritativeSha || null,
    authoritativeSha: build?.authoritativeSha || null,
    dispatchState: last?.dispatchState || null,
    classification: last?.classification || null,
    intentRevision: last?.intentRevision || build?.intent?.outcomeRevision || null,
  };
}
