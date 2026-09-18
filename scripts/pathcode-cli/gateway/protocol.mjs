/**
 * S1 — PATH Gateway wire protocol (NDJSON over Unix socket or in-process bus).
 *
 * Requests:  { id, method, params }
 * Responses: { id, result } | { id, error: { code, message } }
 * Events:    { type: "event", taskId, seq, event }
 * Snapshots: returned by task.snapshot / task.attach
 */

export const GATEWAY_PROTOCOL_VERSION = 1;

/** @typedef {'cli'|'headless'|'studio'|'build'|'test'} GatewayClientRole */

export const GatewayMethods = Object.freeze({
  HELLO: "hello",
  PROJECT_BIND: "project.bind",
  PROJECT_STATUS: "project.status",
  CAPABILITIES: "capabilities.list",
  TASK_START: "task.start",
  TASK_SNAPSHOT: "task.snapshot",
  TASK_ATTACH: "task.attach",
  TASK_RESUME: "task.resume",
  TASK_CONTINUITY: "task.continuity",
  TASK_STEER: "task.steer",
  TASK_CANCEL: "task.cancel",
  TASK_LIST: "task.list",
  RESULT_GET: "result.get",
  DELIVERY_INVOKE: "delivery.invoke",
  SHUTDOWN: "gateway.shutdown",
  PING: "ping",
});

/**
 * @param {string} method
 * @param {unknown} params
 * @param {string} [id]
 */
export function makeRequest(method, params = {}, id) {
  return {
    id:
      typeof id === "string" && id
        ? id
        : `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    method,
    params: params && typeof params === "object" ? params : {},
  };
}

/**
 * @param {string} id
 * @param {unknown} result
 */
export function makeResult(id, result) {
  return { id, result };
}

/**
 * @param {string} id
 * @param {string} code
 * @param {string} message
 */
export function makeError(id, code, message) {
  return { id, error: { code, message } };
}

/**
 * @param {string} taskId
 * @param {number} seq
 * @param {object} event
 */
export function makeEventEnvelope(taskId, seq, event) {
  return {
    type: "event",
    taskId,
    seq,
    event,
    at: new Date().toISOString(),
  };
}

/**
 * Strip fields that must never cross the client boundary.
 * @param {object} event
 */
export function sanitizeEventForClient(event) {
  if (!event || typeof event !== "object") return event;
  const out = { ...event };
  for (const key of Object.keys(out)) {
    if (
      /token|secret|password|credential|authorization|api[_-]?key/i.test(key)
    ) {
      delete out[key];
    }
  }
  return out;
}
