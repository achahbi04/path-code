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
  else if (/ag1-tasks\/[0-9a-f-]{36}/i.test(text)) return "task context";
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
      sourceOffsetOrEventId:
        ctx.sourceIndex ?? line?.sourceOffset ?? line?.seq ?? line?.t ?? type,
    },
  };

  if (type === "session.capability.collaborate") return null;
  if (type === "session.task.received") {
    return {
      ...base,
      kind: "task_started",
      status: "started",
      presentation: "diagnostic",
      summary: "Engineering started",
    };
  }
  if (type === "session.cancelled" || type === "task.stop") {
    return {
      ...base,
      kind: "task_cancelled",
      status: "cancelled",
      summary: "STOPPED by user",
    };
  }
  if (type === "gateway.task.finished") {
    const status = String(meta.status || "").toLowerCase();
    const cancelled = /cancel/.test(status) && !/fail|error/.test(status);
    const failed = /fail|error/.test(status);
    return {
      ...base,
      kind: cancelled ? "task_cancelled" : failed ? "task_failed" : "result",
      status: cancelled ? "cancelled" : failed ? "failed" : "completed",
      summary: cancelled
        ? "STOPPED by user"
        : failed
          ? "FAILURE engineering failed"
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
      summary: "INSPECT project",
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
      summary: `${verb} ${target}${counts}`,
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
  const shown = creatorCommandSummary(commandText, validationType || kind, done, failed);
  return {
    ...base,
    kind: validationType || "command",
    status: failed ? "failed" : done ? "completed" : "started",
    summary: shown,
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
    return { ...base, kind: "adopt", status: "completed", phase: "revision", summary: `ADOPT ${sha.slice(0, 12)}` };
  }
  if (type === "runtime.updated" || type === "runtime.started" || type === "runtime.restarted") {
    return {
      ...base,
      kind: "runtime",
      status: String(data.status || data.runtimeHealth || "ready"),
      summary: sha
        ? `PREVIEW ${sha.slice(0, 12)}`
        : `PREVIEW ${String(data.status || "updated")}`,
    };
  }
  if (type === "build.paused") {
    return {
      ...base,
      kind: "task_cancelled",
      status: "cancelled",
      summary: "STOPPED by user",
    };
  }
  if (type.endsWith(".failed")) {
    return {
      ...base,
      kind: "task_failed",
      status: "failed",
      summary: `FAILURE ${String(data.message || data.code || "engineering failed").slice(0, 160)}`,
    };
  }
  if (type === "engine.decision") {
    const selected = typeof data.selected === "string" ? data.selected : null;
    const reason = String(data.reason || data.summary || "engine decision").slice(0, 160);
    const switched = data.fallback === true && selected;
    return {
      ...base,
      kind: "fabric",
      engine: selected,
      phase: typeof data.phase === "string" ? data.phase : null,
      status: "completed",
      presentation: switched ? "normal" : "diagnostic",
      summary: switched
        ? "PATH switched engineering route and continued."
        : "PATH selected an engineering route.",
      diagnostics: {
        preferred: data.preferred || null,
        selected,
        reason,
        fallback: data.fallback === true,
      },
    };
  }
  if (type.endsWith(".dispatched")) {
    const phase = type.split(".")[0];
    return {
      ...base,
      kind: "task_started",
      phase,
      status: "started",
      presentation: "diagnostic",
      summary: `${PHASE_LABEL[phase] || phase} started`,
    };
  }
  return null;
}

function creatorCommandSummary(commandText, kind, done, failed) {
  const raw = String(commandText || "").trim();
  const first = raw.split("\n")[0];
  const long = first.length > 72 || raw.includes("\n") || /\bnode\s+-e\b/.test(raw);
  if (kind === "test") return done ? "TEST passed" : failed ? "TEST failed" : "RUN npm test";
  if (kind === "typecheck") return done ? "TYPECHECK passed" : failed ? "TYPECHECK failed" : "RUN typecheck";
  if (kind === "build") return done ? "BUILD passed" : failed ? "BUILD failed" : "RUN build";
  if (kind === "lint") return done ? "LINT passed" : failed ? "LINT failed" : "RUN lint";
  if (/\bgit\s+commit\b/.test(raw)) {
    const sha = raw.match(/\b([0-9a-f]{7,40})\b/i);
    return sha ? `COMMIT ${sha[1].slice(0, 12)}` : "COMMIT";
  }
  if (long) return failed ? "FAILURE command" : "RUN command";
  const clipped = first.slice(0, 80);
  if (failed) return `FAILURE ${clipped || "command"}`;
  if (done) return `RUN ${clipped || kind}`;
  return `RUN ${clipped || kind}`;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function operationTarget(entry) {
  return entry.file?.relativePath || entry.command?.safeDisplay || entry.summary || "";
}

function lifecycleTarget(entry) {
  return entry?.file?.relativePath || entry?.command?.safeDisplay || "";
}

function lifecycleKey(entry) {
  const target = lifecycleTarget(entry);
  const second = String(entry?.timestamp || "").slice(0, 19);
  if (!entry?.taskId || !target || !second) return null;
  return `${entry.taskId}\n${entry.kind}\n${target}\n${second}`;
}

function exitsDisagree(prev, entry) {
  const prevExit = prev?.command?.exitCode;
  const nextExit = entry?.command?.exitCode;
  return prevExit != null && nextExit != null && prevExit !== nextExit;
}

function richerEntry(prev, entry) {
  const score = (item) =>
    (item.command?.exitCode != null ? 2 : 0) +
    (item.file?.additions != null ? 2 : 0) +
    (item.command?.durationMs != null ? 1 : 0) +
    (item.status === "completed" || item.status === "failed" ? 1 : 0);
  const kept = score(entry) >= score(prev) ? entry : prev;
  const other = kept === entry ? prev : entry;
  const collapsedSources = [
    ...(kept.diagnostics?.collapsedSources || []),
    ...(other.diagnostics?.collapsedSources || []),
  ];
  if (other.source) collapsedSources.push(other.source);
  return {
    ...kept,
    diagnostics: {
      ...(kept.diagnostics || {}),
      collapsedSource: other.source || kept.diagnostics?.collapsedSource || null,
      collapsedSources,
    },
  };
}

function collapseCreatorEntries(ordered) {
  const lifecycle = [];
  const seen = new Map();
  for (const entry of ordered) {
    const key = lifecycleKey(entry);
    if (key && seen.has(key)) {
      const index = seen.get(key);
      const prev = lifecycle[index];
      if (!exitsDisagree(prev, entry)) {
        lifecycle[index] = richerEntry(prev, entry);
        continue;
      }
    }
    if (key) seen.set(key, lifecycle.length);
    lifecycle.push(entry);
  }
  const grouped = [];
  for (const entry of lifecycle) {
    const prev = grouped[grouped.length - 1];
    const noisy =
      entry.kind === "project_inspection" ||
      (entry.kind === "search" && operationTarget(entry) === "task context");
    const stableTarget = (item) =>
      item.baseSummary ||
      item.file?.relativePath ||
      item.command?.safeDisplay ||
      String(item.summary || "").replace(/ ×\d+$/, "");
    if (
      prev &&
      noisy &&
      prev.kind === entry.kind &&
      prev.taskId === entry.taskId &&
      stableTarget(prev) === stableTarget(entry)
    ) {
      const repeat = (prev.repeat || 1) + 1;
      const base = prev.baseSummary || String(prev.summary || "").replace(/ ×\d+$/, "");
      grouped[grouped.length - 1] = {
        ...prev,
        repeat,
        baseSummary: base,
        summary: `${base} ×${repeat}`,
      };
      continue;
    }
    grouped.push(entry);
  }
  return grouped;
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
      const entry = fromTraceLine(line, roots, { ...ctx, sourceIndex: index });
      if (!entry) return;
      raw.push({ entry, order: bundleIndex * 1_000_000 + index });
    });
  });
  (Array.isArray(extras.events) ? extras.events : []).forEach((event, index) => {
    const entry = fromBuildEvent(event, build?.buildId);
    if (!entry) return;
    const taskId = entry.taskId || event?.data?.taskId || null;
    const bundleIndex = taskId ? traces.findIndex((bundle) => bundle.taskId === taskId) : -1;
    let order =
      bundleIndex >= 0 ? bundleIndex * 1_000_000 + 900_000 + index : 50_000_000 + index;
    if (bundleIndex < 0 && entry.timestamp) {
      const earlier = raw.filter(
        (item) => item.entry.timestamp && item.entry.timestamp <= entry.timestamp,
      );
      const anchor = earlier.length ? earlier[earlier.length - 1] : null;
      order = anchor ? anchor.order + 0.5 + index / 1000 : index / 1000;
    }
    raw.push({ entry, order });
  });
  raw.sort((a, b) => a.order - b.order);
  const seen = new Set();
  const traceStarts = new Set(
    raw
      .filter(
        (item) =>
          item.entry.kind === "task_started" &&
          item.entry.source?.authoritativeTrace === "task-trace" &&
          item.entry.taskId,
      )
      .map((item) => item.entry.taskId),
  );
  const ordered = [];
  for (const item of raw) {
    const entry = item.entry;
    if (
      entry.kind === "task_started" &&
      entry.source?.authoritativeTrace === "build-event" &&
      entry.taskId &&
      traceStarts.has(entry.taskId)
    ) {
      continue;
    }
    const identity =
      entry.kind === "result"
        ? `result:${entry.taskId || entry.source?.sourceOffsetOrEventId}`
        : [
            entry.source?.authoritativeTrace,
            entry.taskId || "",
            entry.source?.sourceOffsetOrEventId,
            entry.kind,
            entry.summary,
          ].join("|");
    if (seen.has(identity)) continue;
    seen.add(identity);
    ordered.push({ ...entry, orderKey: item.order });
  }
  const entries = collapseCreatorEntries(ordered).map((entry, index) => ({
    ...entry,
    sequence: index + 1,
  }));
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
  const turns = [];
  for (const entry of entries) {
    const child = entry.taskId ? childByTask.get(entry.taskId) : null;
    const previous = turns[turns.length - 1];
    const sameTask = previous && entry.taskId && previous.taskId === entry.taskId;
    const revision = entry.kind === "adopt" || entry.kind === "runtime" || entry.kind === "fabric";
    if (sameTask && !revision) {
      previous.entries.push(entry);
      continue;
    }
    if (revision && previous && (!entry.taskId || previous.taskId === entry.taskId)) {
      previous.entries.push(entry);
      continue;
    }
    turns.push({
      taskId: entry.taskId || null,
      actionId: child?.actionId || entry.actionId || null,
      intentRevision: child?.intentRevision || null,
      engine: entry.engine || child?.provider || null,
      phase: child?.kind || entry.phase || null,
      entries: [entry],
    });
  }
  for (const turn of turns) {
    const failed = turn.entries.some((entry) => entry.kind === "task_failed" || entry.status === "failed");
    const ready = turn.entries.some((entry) => entry.kind === "result" || entry.kind === "adopt");
    turn.status = failed ? "failed" : ready ? "ready" : "running";
    const stamps = turn.entries.map((entry) => entry.timestamp).filter(Boolean);
    turn.clockReversed = stamps.some((stamp, index) => index > 0 && stamp < stamps[index - 1]);
  }
  return {
    phases,
    entries,
    turns,
    current: entries.length ? entries[entries.length - 1] : null,
  };
}
