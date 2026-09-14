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
    case "engine.researching":
      return {
        type: "session.engineering.activity",
        activity: "researching",
        label: "Researching",
        detail,
      };
    case "code-intelligence.query":
      return {
        type: "session.engineering.activity",
        activity: "code_intelligence",
        label: "Code intelligence",
        detail,
      };
    case "file.read":
      return {
        type: "session.reading",
        files: Array.isArray(event.payload?.files) ? event.payload.files : [],
      };
    case "file.modified":
      return {
        type: "session.applying",
        summary: detail || "file modified",
      };
    case "command.started":
      return {
        type: "session.engineering.tool",
        kind: "shell",
        tool: "command",
        summary: detail || "command started",
      };
    case "command.completed":
      return {
        type: "session.engineering.tool",
        kind: "shell",
        tool: "command",
        summary: detail || "command completed",
      };
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
 * Map Copilot SDK session event → G10 family (best-effort, truthful).
 * @param {{ type?: string, data?: any }} sdkEvent
 */
export function mapCopilotSdkEvent(sdkEvent) {
  const type = typeof sdkEvent?.type === "string" ? sdkEvent.type : "";
  if (!type) return null;
  if (type === "assistant.message") {
    return normalizeG10Event({
      family: "engine.researching",
      engine: "copilot",
      detail: String(sdkEvent.data?.content || "").slice(0, 120),
      providerEventId: sdkEvent.data?.id,
    });
  }
  if (type.includes("tool") && type.includes("start")) {
    const name = String(sdkEvent.data?.toolName || sdkEvent.data?.name || "tool");
    if (/shell|bash|terminal|exec/i.test(name)) {
      return normalizeG10Event({
        family: "command.started",
        engine: "copilot",
        detail: name,
        providerEventId: sdkEvent.data?.callId || sdkEvent.data?.id,
      });
    }
    if (/edit|write|create|apply|patch/i.test(name)) {
      return normalizeG10Event({
        family: "file.modified",
        engine: "copilot",
        detail: name,
        providerEventId: sdkEvent.data?.callId || sdkEvent.data?.id,
      });
    }
    if (/read|search|grep|glob/i.test(name)) {
      return normalizeG10Event({
        family: "file.read",
        engine: "copilot",
        detail: name,
        providerEventId: sdkEvent.data?.callId || sdkEvent.data?.id,
      });
    }
    return normalizeG10Event({
      family: "engine.inspecting",
      engine: "copilot",
      detail: name,
      providerEventId: sdkEvent.data?.callId || sdkEvent.data?.id,
    });
  }
  if (type.includes("session.idle") || type === "session.idle") {
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
