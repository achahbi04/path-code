/**
 * G10 — normalized engineering event protocol + session emit mapping.
 * No fake engineering events.
 */

import { createHash } from "node:crypto";

/** Compact event family names (mandate §8). */
export const G10_EVENT_FAMILIES = Object.freeze([
  "task.started",
  "task.resumed",
  "environment.preparing",
  "environment.ready",
  "language-intelligence.preparing",
  "language-intelligence.ready",
  "indexing.started",
  "indexing.completed",
  "engine.inspecting",
  "engine.researching",
  "engine.narrating",
  "code-intelligence.query",
  "file.read",
  "file.modified",
  "command.started",
  "command.completed",
  "build.started",
  "build.failed",
  "build.completed",
  "test.started",
  "test.failed",
  "test.completed",
  "collaboration.handoff",
  "collaboration.resumed",
  "repair.started",
  "background.started",
  "background.completed",
  "background.stale",
  "steering.pending",
  "steering.applied",
  "validation.started",
  "validation.completed",
  "task.verified",
  "task.failed",
  "task.blocked",
  "degraded.mode",
  "guard.circuit",
]);

/**
 * Stable event id for idempotency (provider event id preferred).
 * @param {{
 *   family: string,
 *   providerEventId?: string,
 *   taskId?: string,
 *   detail?: string,
 *   ts?: string,
 * }} input
 */
export function makeEventId(input) {
  if (typeof input.providerEventId === "string" && input.providerEventId.trim()) {
    return `prov:${input.providerEventId.trim().slice(0, 120)}`;
  }
  const raw = [
    input.family,
    input.taskId || "",
    input.detail || "",
    input.ts || "",
  ].join("|");
  return `hash:${createHash("sha256").update(raw).digest("hex").slice(0, 24)}`;
}

/**
 * @param {{
 *   family: string,
 *   taskId?: string,
 *   engine?: 'antigravity'|'copilot'|'path'|string,
 *   detail?: string,
 *   providerEventId?: string,
 *   payload?: Record<string, unknown>,
 * }} input
 */
export function normalizeG10Event(input) {
  const family = String(input.family || "").trim();
  if (!G10_EVENT_FAMILIES.includes(family) && !family.startsWith("task.")) {
    return null;
  }
  const ts = new Date().toISOString();
  const id = makeEventId({
    family,
    providerEventId: input.providerEventId,
    taskId: input.taskId,
    detail: input.detail,
    ts,
  });
  return {
    id,
    family,
    ts,
    taskId: typeof input.taskId === "string" ? input.taskId : undefined,
    engine: typeof input.engine === "string" ? input.engine : undefined,
    detail:
      typeof input.detail === "string" ? input.detail.slice(0, 400) : undefined,
    payload:
      input.payload && typeof input.payload === "object" ? input.payload : {},
  };
}

/**
 * Map normalized G10 event → existing session.* cockpit events.
 * @param {NonNullable<ReturnType<typeof normalizeG10Event>>} event
 * @returns {{ type: string, [k: string]: unknown }}
 */
export function toSessionEvent(event) {
  const detail = event.detail || "";
  switch (event.family) {
    case "task.started":
      return { type: "session.task.received", summary: detail || "task started" };
    case "task.resumed":
      return {
        type: "session.hydration",
        stage: "task_resume",
        detail: detail || "task resumed",
        mode: event.payload?.mode,
      };
    case "environment.preparing":
      return {
        type: "session.capability.preparing",
        detail: detail || "Preparing environment",
      };
    case "environment.ready":
      return {
        type: "session.capability.ready",
        detail: detail || "Environment ready",
      };
    case "language-intelligence.preparing":
      return {
        type: "session.capability.preparing",
        detail: detail || "Preparing language intelligence",
        kind: "lsp",
      };
    case "language-intelligence.ready":
      return {
        type: "session.capability.ready",
        detail: detail || "Language intelligence ready",
        kind: "lsp",
      };
    case "indexing.started":
      return {
        type: "session.capability.indexing",
        detail: detail || "Indexing",
        phase: "started",
      };
    case "indexing.completed":
      return {
        type: "session.capability.indexing",
        detail: detail || "Indexing complete",
        phase: "completed",
      };
    case "engine.inspecting":
      return {
        type: "session.engineering.activity",
        activity: "inspecting",
        label: "Inspecting",
        detail,
      };
    case "engine.narrating":
      return {
        type: "session.engineering.narration",
        text: detail,
        paragraphs: detail
          ? String(detail)
              .split(/\n\s*\n/)
              .map((p) => p.trim())
              .filter(Boolean)
              .slice(0, 6)
          : [],
      };
    case "engine.researching": {
      // Substantial prose from engines is narration, not a vague "Researching" label.
      const prose = String(detail || "").trim();
      if (
        prose.length >= 40 &&
        /[a-zA-Z]{4,}/.test(prose) &&
        !/^(run_command|view_file|edit_file|bash|sh)\b/i.test(prose)
      ) {
        return {
          type: "session.engineering.narration",
          text: prose.slice(0, 2_000),
          paragraphs: prose
            .split(/\n\s*\n/)
            .map((p) => p.trim())
            .filter(Boolean)
            .slice(0, 6),
        };
      }
      return {
        type: "session.engineering.activity",
        activity: "researching",
        label: "Waiting for engineering result",
        detail,
      };
    }
    case "code-intelligence.query":
      return {
        type: "session.engineering.activity",
        activity: "code_intelligence",
        label: "Code intelligence",
        detail,
      };
    case "file.read": {
      const path =
        typeof event.payload?.path === "string"
          ? event.payload.path
          : Array.isArray(event.payload?.files) &&
              typeof event.payload.files[0] === "string"
            ? event.payload.files[0]
            : "";
      const query =
        typeof event.payload?.query === "string" ? event.payload.query : "";
      const tool =
        typeof event.payload?.tool === "string" ? event.payload.tool : "view_file";
      if (path || query) {
        return {
          type: "session.engineering.tool",
          kind:
            typeof event.payload?.kind === "string"
              ? event.payload.kind
              : query
                ? "search"
                : "inspect",
          tool,
          summary: path
            ? `${tool} ${path}`
            : query
              ? `${tool} ${query}`
              : detail || tool,
          ...(path ? { path } : {}),
          ...(query ? { query } : {}),
        };
      }
      return {
        type: "session.reading",
        files: Array.isArray(event.payload?.files) ? event.payload.files : [],
      };
    }
    case "file.modified": {
      const path =
        typeof event.payload?.path === "string"
          ? event.payload.path
          : Array.isArray(event.payload?.files) &&
              typeof event.payload.files[0] === "string"
            ? event.payload.files[0]
            : "";
      const tool =
        typeof event.payload?.tool === "string" ? event.payload.tool : "edit_file";
      if (path) {
        return {
          type: "session.engineering.tool",
          kind: "file_edit",
          tool,
          summary: `${tool} ${path}`,
          path,
        };
      }
      return {
        type: "session.applying",
        summary: detail || "file modified",
      };
    }
    case "command.started":
    case "command.completed": {
      const cmd =
        typeof event.payload?.command === "string"
          ? event.payload.command
          : typeof event.payload?.CommandLine === "string"
            ? event.payload.CommandLine
            : "";
      const output =
        typeof event.payload?.output === "string"
          ? event.payload.output
          : typeof event.payload?.stdout === "string"
            ? event.payload.stdout
            : "";
      return {
        type: "session.engineering.tool",
        kind: "command",
        tool: "run_command",
        summary: cmd
          ? `run_command ${cmd}`
          : detail ||
            (event.family === "command.started"
              ? "command started"
              : "command completed"),
        ...(cmd ? { command: cmd } : {}),
        ...(output ? { output } : {}),
        ...(typeof event.payload?.ok === "boolean" ? { ok: event.payload.ok } : {}),
      };
    }
    case "build.started":
    case "build.completed":
    case "build.failed":
      return {
        type: "session.engineering.activity",
        activity: event.family.startsWith("build.failed") ? "building" : "building",
        label: "Building",
        detail: detail || event.family,
      };
    case "test.started":
    case "test.completed":
    case "test.failed":
      return {
        type: "session.engineering.activity",
        activity: "testing",
        label: "Testing",
        detail: detail || event.family,
      };
    case "collaboration.handoff":
    case "collaboration.resumed":
      return {
        type: "session.capability.collaborate",
        engine: event.engine || "path",
        phase: event.family === "collaboration.handoff" ? "handoff" : "resumed",
        label: "Collaborating",
        detail,
      };
    case "repair.started":
      return {
        type: "session.engineering.activity",
        activity: "repairing",
        label: "Repairing",
        detail,
      };
    case "background.started":
    case "background.completed":
    case "background.stale":
      return {
        type: "session.engineering.activity",
        activity: "background",
        label:
          event.family === "background.stale"
            ? "Background (stale)"
            : "Background validation",
        detail,
        stale: event.family === "background.stale",
      };
    case "steering.pending":
      return {
        type: "session.engineering.activity",
        activity: "steering",
        label: "Steering pending",
        detail,
      };
    case "steering.applied":
      return {
        type: "session.engineering.activity",
        activity: "steering",
        label: "Steering applied",
        detail,
      };
    case "validation.started":
      return { type: "session.validation.running", detail };
    case "validation.completed":
      return {
        type: "session.validation.result",
        ok: event.payload?.ok === true,
        detail,
      };
    case "task.verified":
      return {
        type: "session.engineering.result",
        classification: "VERIFIED",
        summary: detail,
      };
    case "task.failed":
      return {
        type: "session.engineering.result",
        classification: "FAILED",
        summary: detail,
      };
    case "task.blocked":
      return {
        type: "session.terminal",
        classification: "BLOCKED",
        detail,
      };
    case "degraded.mode":
      return {
        type: "session.capability.advisory",
        detail: detail || "degraded mode",
        mode: event.payload?.mode,
      };
    case "guard.circuit":
      return {
        type: "session.engineering.activity",
        activity: "blocked",
        label: "Guard",
        detail,
      };
    default:
      return {
        type: "session.engineering.activity",
        activity: "inspecting",
        label: "PATH",
        detail: event.family,
      };
  }
}

/**
 * Pull path / command / query / output from Copilot SDK tool payloads (best-effort).
 * @param {any} data
 */
function extractCopilotToolFields(data) {
  const args =
    data?.arguments && typeof data.arguments === "object"
      ? data.arguments
      : data?.input && typeof data.input === "object"
        ? data.input
        : data?.args && typeof data.args === "object"
          ? data.args
          : {};
  const path = String(
    args.path ||
      args.filePath ||
      args.file_path ||
      args.filename ||
      args.target ||
      data?.path ||
      "",
  )
    .trim()
    .replace(/^\.\//, "");
  const command = String(
    args.command ||
      args.cmd ||
      args.CommandLine ||
      args.shell_command ||
      data?.command ||
      "",
  ).trim();
  const query = String(
    args.query || args.pattern || args.grep || args.search || data?.query || "",
  ).trim();
  const output = String(
    data?.result ||
      data?.output ||
      data?.content ||
      data?.stdout ||
      (typeof data?.text === "string" ? data.text : "") ||
      "",
  ).trim();
  return {
    path: path.slice(0, 240),
    command: command.slice(0, 500),
    query: query.slice(0, 240),
    output: output.slice(0, 4_000),
  };
}

/**
 * Map Copilot SDK session event → G10 family (best-effort, truthful).
 * @param {{ type?: string, data?: any }} sdkEvent
 */
export function mapCopilotSdkEvent(sdkEvent) {
  const type = typeof sdkEvent?.type === "string" ? sdkEvent.type : "";
  if (!type) return null;
  if (type === "assistant.message") {
    const content = String(
      sdkEvent.data?.content ||
        sdkEvent.data?.text ||
        sdkEvent.data?.message ||
        "",
    ).trim();
    if (!content) return null;
    return normalizeG10Event({
      family: "engine.narrating",
      engine: "copilot",
      detail: content.slice(0, 2_000),
      providerEventId: sdkEvent.data?.id,
    });
  }

  const fields = extractCopilotToolFields(sdkEvent.data || {});
  const name = String(
    sdkEvent.data?.toolName || sdkEvent.data?.name || sdkEvent.data?.tool || "tool",
  );
  const providerEventId =
    sdkEvent.data?.callId || sdkEvent.data?.id || sdkEvent.data?.toolCallId;

  if (type.includes("tool") && type.includes("start")) {
    if (/shell|bash|terminal|exec|run_command/i.test(name)) {
      return normalizeG10Event({
        family: "command.started",
        engine: "copilot",
        detail: fields.command || name,
        providerEventId,
        payload: {
          ...(fields.command ? { command: fields.command } : {}),
        },
      });
    }
    if (/edit|write|create|apply|patch/i.test(name)) {
      return normalizeG10Event({
        family: "file.modified",
        engine: "copilot",
        detail: fields.path || name,
        providerEventId,
        payload: {
          ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
          tool: name,
          kind: "file_edit",
        },
      });
    }
    if (/read|view|search|grep|glob|list/i.test(name)) {
      return normalizeG10Event({
        family: "file.read",
        engine: "copilot",
        detail: fields.path || fields.query || name,
        providerEventId,
        payload: {
          ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
          ...(fields.query ? { query: fields.query } : {}),
          tool: name,
          kind: /search|grep|glob/i.test(name) ? "search" : "inspect",
        },
      });
    }
    return normalizeG10Event({
      family: "engine.inspecting",
      engine: "copilot",
      detail: fields.path || fields.query || name,
      providerEventId,
      payload: {
        ...(fields.path ? { path: fields.path } : {}),
        ...(fields.query ? { query: fields.query } : {}),
        tool: name,
      },
    });
  }

  if (
    type.includes("tool") &&
    (type.includes("end") ||
      type.includes("complete") ||
      type.includes("result") ||
      type.includes("finish"))
  ) {
    if (/shell|bash|terminal|exec|run_command/i.test(name) || fields.command) {
      const ok =
        typeof sdkEvent.data?.ok === "boolean"
          ? sdkEvent.data.ok
          : typeof sdkEvent.data?.success === "boolean"
            ? sdkEvent.data.success
            : undefined;
      return normalizeG10Event({
        family: "command.completed",
        engine: "copilot",
        detail: fields.command || name,
        providerEventId,
        payload: {
          ...(fields.command ? { command: fields.command } : {}),
          ...(fields.output ? { output: fields.output } : {}),
          ...(typeof ok === "boolean" ? { ok } : {}),
        },
      });
    }
    if (/edit|write|create|apply|patch/i.test(name) || fields.path) {
      return normalizeG10Event({
        family: "file.modified",
        engine: "copilot",
        detail: fields.path || name,
        providerEventId,
        payload: {
          ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
          tool: name,
          kind: "file_edit",
        },
      });
    }
  }

  if (type.includes("session.idle") || type === "session.idle") {
    return null;
  }
  return null;
}

/**
 * Pull path / command / query from Cursor SDK tool_call args (best-effort).
 * @param {any} args
 * @param {any} result
 */
function extractCursorToolFields(args, result) {
  const a =
    args && typeof args === "object"
      ? args
      : typeof args === "string"
        ? { command: args }
        : {};
  const path = String(
    a.path ||
      a.filePath ||
      a.file_path ||
      a.filename ||
      a.target ||
      a.target_file ||
      "",
  )
    .trim()
    .replace(/^\.\//, "");
  const command = String(
    a.command || a.cmd || a.CommandLine || a.shell_command || "",
  ).trim();
  const query = String(
    a.query || a.pattern || a.grep || a.search || a.glob || "",
  ).trim();
  const output = String(
    (result && typeof result === "object"
      ? result.output || result.stdout || result.content || result.text || ""
      : typeof result === "string"
        ? result
        : "") || "",
  ).trim();
  return {
    path: path.slice(0, 240),
    command: command.slice(0, 500),
    query: query.slice(0, 240),
    output: output.slice(0, 4_000),
  };
}

/**
 * Map Cursor SDKMessage → G10 family (best-effort, truthful).
 * @param {{
 *   type?: string,
 *   run_id?: string,
 *   call_id?: string,
 *   name?: string,
 *   status?: string,
 *   text?: string,
 *   message?: any,
 *   args?: unknown,
 *   result?: unknown,
 * }} sdkEvent
 */
export function mapCursorSdkEvent(sdkEvent) {
  const type = typeof sdkEvent?.type === "string" ? sdkEvent.type : "";
  if (!type) return null;

  const providerEventId =
    (typeof sdkEvent.call_id === "string" && sdkEvent.call_id) ||
    (typeof sdkEvent.run_id === "string" && sdkEvent.run_id) ||
    undefined;

  if (type === "assistant") {
    /** @type {string[]} */
    const texts = [];
    const content = sdkEvent.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string") {
          texts.push(block.text);
        }
      }
    }
    const contentText = texts.join("").trim();
    if (!contentText) return null;
    return normalizeG10Event({
      family: "engine.narrating",
      engine: "cursor",
      detail: contentText.slice(0, 2_000),
      providerEventId,
    });
  }

  if (type === "thinking") {
    const text = String(sdkEvent.text || "").trim();
    if (!text) return null;
    // Prefer a short researching label over dumping long fake thoughts.
    return normalizeG10Event({
      family: "engine.researching",
      engine: "cursor",
      detail: text.slice(0, 160),
      providerEventId,
    });
  }

  if (type === "tool_call") {
    const name = String(sdkEvent.name || "tool");
    const status = String(sdkEvent.status || "");
    const fields = extractCursorToolFields(sdkEvent.args, sdkEvent.result);
    const shellLike = /shell|bash|terminal|exec|run_command|Shell/i.test(name);
    const editLike = /edit|write|create|apply|patch|Write|StrReplace/i.test(name);
    const readLike = /read|view|search|grep|glob|list|Read|Grep|Glob/i.test(name);

    if (status === "running") {
      if (shellLike) {
        return normalizeG10Event({
          family: "command.started",
          engine: "cursor",
          detail: fields.command || name,
          providerEventId,
          payload: {
            ...(fields.command ? { command: fields.command } : {}),
          },
        });
      }
      if (editLike) {
        return normalizeG10Event({
          family: "file.modified",
          engine: "cursor",
          detail: fields.path || name,
          providerEventId,
          payload: {
            ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
            tool: name,
            kind: "file_edit",
          },
        });
      }
      if (readLike) {
        return normalizeG10Event({
          family: "file.read",
          engine: "cursor",
          detail: fields.path || fields.query || name,
          providerEventId,
          payload: {
            ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
            ...(fields.query ? { query: fields.query } : {}),
            tool: name,
            kind: /search|grep|glob/i.test(name) ? "search" : "inspect",
          },
        });
      }
      return normalizeG10Event({
        family: "engine.inspecting",
        engine: "cursor",
        detail: fields.path || fields.query || name,
        providerEventId,
        payload: {
          ...(fields.path ? { path: fields.path } : {}),
          ...(fields.query ? { query: fields.query } : {}),
          tool: name,
        },
      });
    }

    if (status === "completed" || status === "error") {
      if (shellLike || fields.command) {
        return normalizeG10Event({
          family: "command.completed",
          engine: "cursor",
          detail: fields.command || name,
          providerEventId,
          payload: {
            ...(fields.command ? { command: fields.command } : {}),
            ...(fields.output ? { output: fields.output } : {}),
            ...(status === "error" ? { ok: false } : { ok: true }),
          },
        });
      }
      if (editLike || fields.path) {
        return normalizeG10Event({
          family: "file.modified",
          engine: "cursor",
          detail: fields.path || name,
          providerEventId,
          payload: {
            ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
            tool: name,
            kind: "file_edit",
          },
        });
      }
      if (readLike) {
        return normalizeG10Event({
          family: "file.read",
          engine: "cursor",
          detail: fields.path || fields.query || name,
          providerEventId,
          payload: {
            ...(fields.path ? { path: fields.path, files: [fields.path] } : {}),
            ...(fields.query ? { query: fields.query } : {}),
            tool: name,
            kind: /search|grep|glob/i.test(name) ? "search" : "inspect",
          },
        });
      }
    }
    return null;
  }

  // status FINISHED/ERROR/CANCELLED — skip (turn result is handled by executor).
  if (type === "status") {
    return null;
  }

  return null;
}

/**
 * Map Antigravity bridge activity → G10 family.
 * @param {{ type?: string, activity?: string, tool?: string, detail?: string, kind?: string }} msg
 */
export function mapAntigravityBridgeEvent(msg) {
  const type = typeof msg?.type === "string" ? msg.type : "";
  if (type === "activity") {
    const a = String(msg.activity || "");
    if (a === "editing") {
      return normalizeG10Event({
        family: "file.modified",
        engine: "antigravity",
        detail: msg.detail || msg.tool,
      });
    }
    if (a === "inspecting") {
      return normalizeG10Event({
        family: "engine.inspecting",
        engine: "antigravity",
        detail: msg.detail || msg.tool,
      });
    }
    if (a === "researching") {
      return normalizeG10Event({
        family: "engine.researching",
        engine: "antigravity",
        detail: msg.detail,
      });
    }
    if (a === "building" || a === "testing") {
      return normalizeG10Event({
        family: a === "building" ? "build.started" : "test.started",
        engine: "antigravity",
        detail: msg.detail,
      });
    }
  }
  if (type === "tool") {
    if (msg.kind === "file_edit") {
      return normalizeG10Event({
        family: "file.modified",
        engine: "antigravity",
        detail: String(msg.detail || msg.tool || "").slice(0, 120),
      });
    }
    if (msg.kind === "shell" || /shell|bash|exec/i.test(String(msg.tool || ""))) {
      return normalizeG10Event({
        family: "command.started",
        engine: "antigravity",
        detail: String(msg.tool || "shell"),
      });
    }
  }
  return null;
}
