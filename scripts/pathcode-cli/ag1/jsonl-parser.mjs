/**
 * AG1 — bulletproof newline-delimited JSON parser.
 * Never throws into the product loop. Rogue lines become diagnostics.
 */

/** @typedef {{ type: string, [k: string]: unknown }} BridgeMessage */

/**
 * @typedef {{
 *   onMessage: (msg: BridgeMessage) => void,
 *   onDiagnostic: (kind: string, text: string) => void,
 * }} JsonlParserHandlers
 */

const MAX_DIAG_CHARS = 2_000;
const MAX_BUFFER_CHARS = 1_048_576;

/**
 * Create an incremental JSONL consumer for stdout (or any byte stream text).
 * @param {JsonlParserHandlers} handlers
 */
export function createJsonlParser(handlers) {
  let buffer = "";

  /**
   * @param {string} chunk
   */
  function push(chunk) {
    if (typeof chunk !== "string" || chunk.length === 0) return;
    buffer += chunk;
    if (buffer.length > MAX_BUFFER_CHARS) {
      handlers.onDiagnostic(
        "buffer_overflow",
        `stdout buffer exceeded ${MAX_BUFFER_CHARS}; dropping oldest half`,
      );
      buffer = buffer.slice(Math.floor(buffer.length / 2));
    }
    let nl;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      consumeLine(line);
    }
  }

  /**
   * @param {string} line
   */
  function consumeLine(line) {
    const trimmed = line.replace(/\r$/, "");
    if (trimmed.trim() === "") return;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      handlers.onDiagnostic(
        "rogue_stdout",
        trimmed.length > MAX_DIAG_CHARS
          ? `${trimmed.slice(0, MAX_DIAG_CHARS)}…`
          : trimmed,
      );
      return;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      handlers.onDiagnostic("unrecognized_json", trimmed.slice(0, MAX_DIAG_CHARS));
      return;
    }
    if (typeof parsed.type !== "string" || parsed.type.trim() === "") {
      handlers.onDiagnostic("unrecognized_json", trimmed.slice(0, MAX_DIAG_CHARS));
      return;
    }
    try {
      handlers.onMessage(/** @type {BridgeMessage} */ (parsed));
    } catch (err) {
      const message = err && /** @type {any} */ (err).message ? String(err.message) : "handler error";
      handlers.onDiagnostic("handler_error", message.slice(0, MAX_DIAG_CHARS));
    }
  }

  function flush() {
    if (buffer.length === 0) return;
    const rest = buffer;
    buffer = "";
    // Incomplete trailing record without newline — treat as diagnostic, do not crash.
    handlers.onDiagnostic(
      "incomplete_stdout",
      rest.length > MAX_DIAG_CHARS ? `${rest.slice(0, MAX_DIAG_CHARS)}…` : rest,
    );
  }

  return { push, flush, consumeLine };
}

/**
 * Recognized bridge protocol message types for AG1.
 */
export const BRIDGE_MESSAGE_TYPES = Object.freeze([
  "started",
  "activity",
  "tool",
  "finished",
  "failed",
  "cancelled",
]);

/**
 * @param {BridgeMessage} msg
 */
export function isRecognizedBridgeMessage(msg) {
  return (
    msg &&
    typeof msg === "object" &&
    typeof msg.type === "string" &&
    BRIDGE_MESSAGE_TYPES.includes(msg.type)
  );
}
