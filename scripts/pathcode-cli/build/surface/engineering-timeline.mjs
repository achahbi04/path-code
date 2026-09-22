/**
 * Provider-neutral engineering timeline.
 *
 * Projection only. Authority stays in task traces, Build events, adoption
 * records, and runtime records. Nothing here is a second event store.
 */

const SECRET_TEXT =
  /\b(api[_-]?key|token|secret|password|authorization|bearer)\b|[A-Za-z0-9+/]{32,}={0,2}|sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]+|AKIA[0-9A-Z]{16}|\.copilot\b|application_default_credentials|\badc\.json\b/i;

const PHASE_LABEL = Object.freeze({
  brief: "Understanding",
  engineer: "Building",
  evaluate: "Verifying",
  challenge: "Reviewing",
});

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
    if (!normalized) continue;
    if (text === normalized) return null;
    if (text.startsWith(`${normalized}/`)) {
      text = text.slice(normalized.length + 1);
      break;
    }
  }
  const taskWorktree = text.match(/\/ag1-tasks\/[0-9a-f-]{36}\/(.+)$/i);
  if (taskWorktree?.[1]) text = taskWorktree[1];
  if (text.startsWith("/") || /^[A-Za-z]:\//.test(text)) {
    const parts = text.split("/").filter(Boolean);
    text = parts.slice(-2).join("/");
  }
  if (!text || SECRET_TEXT.test(text)) return null;
  return text.slice(0, 180) || null;
}

/**
 * @param {unknown} command
 * @param {string[]} roots
 */
function safeCommand(command, roots) {
  let text = String(command || "").trim();
  if (!text) return null;
  if (SECRET_TEXT.test(text) || /\b(export\s+[A-Z0-9_]+=|Authorization:)/i.test(text)) {
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
  return text.slice(0, 180);
}

/**
 * @param {string} tool
 * @param {string} command
 * @param {string} kind
 */
function operationKind(tool, command, kind) {
  const name = String(tool || "").toLowerCase();
  const hinted = String(kind || "").toLowerCase();
  if (/delete/.test(name)) return "file_delete";
  if (/rename|move_file/.test(name)) return "file_rename";
  if (/create_file|write_file/.test(name)) return "file_create";
  if (/edit|search_replace|apply_patch|strreplace/.test(name) || hinted === "file_edit") {
    return "file_edit";
  }
  if (/grep|search|find_file|codebase/.test(name) || hinted === "search") return "search";
  if (
    /view_file|read_file|list_directory|^read/.test(name) ||
    hinted === "inspect"
  ) {
    return "file_read";
  }
  if (/run_command|shell|bash/.test(name) || hinted === "command") {
    if (/\b(typecheck|tsc)\b/i.test(command)) return "typecheck";
    if (/\b(vitest|jest|pytest|npm test|npm run test)\b/i.test(command)) return "test";
    if (/\b(npm run build|vite build|next build)\b/i.test(command)) return "build";
    if (/\blint\b/i.test(command)) return "lint";
    return "command";
  }
  return null;
}

/**
 * @param {object} line
 * @param {string[]} roots
 * @param {{ taskId?: string, engine?: string | null, phase?: string, actionId?: string | null, buildId?: string }} ctx
 */
function fromTraceLine(line, roots, ctx) {
  const type = String(line?.type || "");
  const meta = line?.meta && typeof line.meta === "object" ? line.meta : {};
  const tool = String(line?.tool || meta.tool || "");
  const commandText = safeCommand(line?.command || meta.command, roots);
  const hinted = String(meta.kind || line?.phase || "");
  const path = relativeProjectPath(line?.path || meta.path, roots);
  const query =
    typeof meta.query === "string" && !SECRET_TEXT.test(meta.query)
      ? meta.query.slice(0, 120)
      : null;
  const engine =
    (typeof line?.engine === "string" && line.engine) || ctx.engine || null;
  const base = {
    timestamp: typeof line?.t === "string" ? line.t : null,
    buildId: ctx.buildId || null,
    actionId: ctx.actionId || null,
    taskId: ctx.taskId || line?.taskId || null,
    engine,
    phase: ctx.phase || null,
    file: null,
    command: null,
    validation: null,
    revision: null,
    source: {
      authoritativeTrace: "task-trace",
      sourceOffsetOrEventId: line?.t || type,
    },
  };

  if (type === "session.capability.collaborate") return null;
  if (type === "session.task.received") {
    return {
      ...base,
      kind: "task_started",
      status: "started",
      summary: `${engineLabel(engine)} task started`,
    };
  }
  if (type === "session.cancelled" || type === "task.stop") {
    return {
      ...base,
      kind: "task_cancelled",
      status: "cancelled",
      summary: `${engineLabel(engine)} task cancelled`,
    };
  }
  if (type === "gateway.task.finished") {
    const status = String(meta.status || "").toLowerCase();
    const failed = /fail|cancel|error/.test(status);
    return {
      ...base,
      kind: failed ? "task_failed" : "result",
      status: failed ? "failed" : "completed",
      summary: failed
        ? `${engineLabel(engine)} task failed`
        : "RESULT engineering result ready",
    };
  }
  if (type === "session.engineering.result") {
    return {
      ...base,
      kind: "result",
      status: "completed",
      summary: "RESULT engineering result ready",
    };
  }
  if (type === "session.capability.preparing") {
    return {
      ...base,
      kind: "project_inspection",
      status: "completed",
      summary: `${engineLabel(engine)} INSPECT project`,
    };
  }
  if (type !== "session.engineering.tool" && !tool) return null;

  const kind = operationKind(tool, commandText || "", hinted);
  if (!kind) return null;
  const additions = numberOrNull(meta.added ?? meta.additions);
  const deletions = numberOrNull(meta.removed ?? meta.deletions);
  if (kind === "file_read" || kind === "search" || kind === "file_create" || kind === "file_edit" || kind === "file_delete" || kind === "file_rename") {
    const verb = {
      file_read: "READ",
      search: "SEARCH",
      file_create: "CREATE",
      file_edit: "EDIT",
      file_delete: "DELETE",
      file_rename: "RENAME",
    }[kind];
    const target = kind === "search" ? query || path || "project" : path || "file";
    const counts =
      kind === "file_edit" && (additions != null || deletions != null)
        ? ` +${additions || 0} -${deletions || 0}`
        : "";
    return {
      ...base,
      kind,
      status: "completed",
      summary: `${engineLabel(engine)} ${verb} ${target}${counts}`,
      file: {
        relativePath: path,
        operation: verb,
        ...(additions != null ? { additions } : {}),
        ...(deletions != null ? { deletions } : {}),
      },
    };
  }

  const exitCode = numberOrNull(line?.exitCode ?? meta.exitCode);
  const ok = typeof meta.ok === "boolean" ? meta.ok : null;
  const failed = ok === false || (exitCode != null && exitCode !== 0);
  const done = ok === true || exitCode === 0;
  const validationType = ["typecheck", "test", "build", "lint"].includes(kind)
    ? kind
    : null;
  const verb = done ? "PASS" : failed ? "FAIL" : "RUN";
  const shown = commandText || kind;
  return {
    ...base,
    kind: validationType || "command",
    status: failed ? "failed" : done ? "completed" : "started",
    summary: validationType && (done || failed)
      ? `PATH ${verb} ${validationType}${line?.durationMs ? ` · ${line.durationMs}ms` : ""}`
      : `${engineLabel(engine)} ${verb} ${shown}`,
    command: {
      safeDisplay: commandText || shown,
      ...(exitCode != null ? { exitCode } : {}),
      ...(line?.durationMs != null ? { durationMs: line.durationMs } : {}),
    },
    validation: validationType
      ? {
          type: validationType,
          passed: done ? true : failed ? false : null,
          summary: shown,
        }
      : null,
  };
}

/**
 * @param {object} event
 * @param {string} buildId
 */
function fromBuildEvent(event, buildId) {
  const type = String(event?.type || "");
  const data = event?.data && typeof event.data === "object" ? event.data : {};
  const sha =
    (typeof data.adoptedSha === "string" && data.adoptedSha) ||
    (typeof data.authoritativeSha === "string" && data.authoritativeSha) ||
    (typeof data.sha === "string" && data.sha) ||
    null;
  const base = {
    timestamp: typeof event?.at === "string" ? event.at : null,
    buildId,
    actionId: null,
    taskId: typeof data.taskId === "string" ? data.taskId : null,
    engine: null,
    phase: null,
    file: null,
    command: null,
    validation: null,
    revision: sha ? { sha, relation: type } : null,
    source: {
      authoritativeTrace: "build-event",
      sourceOffsetOrEventId: event?.id ?? type,
    },
  };
  if (type === "adoption.completed" && sha) {
    return { ...base, kind: "adopt", status: "completed", summary: `PATH ADOPT ${sha.slice(0, 12)}` };
  }
  if (type === "runtime.updated" || type === "runtime.started" || type === "runtime.restarted") {
    return {
      ...base,
      kind: "runtime",
      status: String(data.status || data.runtimeHealth || "ready"),
      summary: sha
        ? `PATH PREVIEW ${sha.slice(0, 12)}`
        : `PATH RUNTIME ${String(data.status || "updated")}`,
    };
  }
  if (type.endsWith(".failed")) {
    return {
      ...base,
      kind: "task_failed",
      status: "failed",
      summary: `PATH FAIL ${String(data.message || data.code || "engineering failed").slice(0, 160)}`,
    };
  }
  if (type.endsWith(".dispatched")) {
    const phase = type.split(".")[0];
    return {
      ...base,
      kind: "task_started",
      phase,
      status: "started",
      summary: `PATH ${PHASE_LABEL[phase] || phase} started`,
    };
  }
  return null;
}

function engineLabel(engine) {
  const name = String(engine || "").trim().toLowerCase();
  if (name === "cursor" || name === "copilot" || name === "antigravity") {
    return name.toUpperCase();
  }
  return "PATH";
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * @param {object | null | undefined} build
 * @param {{
 *   traces?: Array<{ taskId?: string, lines?: object[] }>,
 *   events?: object[],
 *   projectRoot?: string | null,
 *   roots?: string[],
 * }} [extras]
 */
export function projectEngineeringTimeline(build, extras = {}) {
  const roots = [
    extras.projectRoot,
    ...(Array.isArray(extras.roots) ? extras.roots : []),
    build?.projectBindings?.[0]?.projectRoot,
  ].filter((value) => typeof value === "string");
  const children = Array.isArray(build?.children) ? build.children : [];
  const childByTask = new Map(children.filter((child) => child?.taskId).map((child) => [child.taskId, child]));
  /** @type {object[]} */
  const raw = [];
  const traces = Array.isArray(extras.traces) ? extras.traces : [];
  traces.forEach((bundle, bundleIndex) => {
    const child = childByTask.get(bundle.taskId) || null;
    const ctx = {
      buildId: build?.buildId,
      taskId: bundle.taskId || child?.taskId || null,
      actionId: child?.actionId || null,
      engine: bundle.engine || child?.provider || null,
      phase: child?.kind || null,
    };
    (bundle.lines || []).forEach((line, index) => {
      const entry = fromTraceLine(line, roots, ctx);
      if (!entry) return;
      raw.push({ entry, order: bundleIndex * 1_000_000 + index });
    });
  });
  (Array.isArray(extras.events) ? extras.events : []).forEach((event, index) => {
    const entry = fromBuildEvent(event, build?.buildId);
    if (!entry) return;
    raw.push({ entry, order: 5_000_000 + index });
  });
  raw.sort((a, b) => {
    const at = String(a.entry.timestamp || "");
    const bt = String(b.entry.timestamp || "");
    if (at && bt && at !== bt) return at < bt ? -1 : 1;
    return a.order - b.order;
  });
  const entries = raw.map((item, index) => ({ ...item.entry, sequence: index + 1 }));
  const phases = ["brief", "engineer", "evaluate", "challenge"].map((kind) => {
    const related = children.filter((child) => child.kind === kind);
    const ids = new Set(related.map((child) => child.taskId));
    const count = entries.filter((entry) => ids.has(entry.taskId) || entry.phase === kind).length;
    const live = related.some((child) =>
      ["selected", "dispatched", "terminal_seen"].includes(child.dispatchState),
    );
    const done = related.length > 0 && related.every((child) => child.dispatchState === "consumed");
    return {
      id: kind,
      label: PHASE_LABEL[kind],
      status: live ? "active" : done ? "done" : related.length ? "seen" : "pending",
      count,
    };
  });
  return {
    phases,
    entries,
    current: entries.length ? entries[entries.length - 1] : null,
  };
}
