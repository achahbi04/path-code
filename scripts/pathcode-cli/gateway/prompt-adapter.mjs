/**
 * S1 — Gateway-owned prompt adapter.
 * Implements the prompt surface that ag1/session.mjs needs without a TTY.
 * Steering / cancel arrive via gateway IPC methods.
 */

/**
 * @param {{
 *   write?: (text: string) => void,
 *   writeErr?: (text: string) => void,
 * }} [opts]
 */
export function createGatewayPromptAdapter(opts = {}) {
  /** @type {string[]} */
  let steeringQueue = [];
  let cycleActive = false;
  let cycleCancelRequested = false;
  let stopped = false;
  /** @type {string[]} */
  const diagnostics = [];

  function write(text) {
    const line = String(text ?? "");
    diagnostics.push(line);
    if (typeof opts.write === "function") opts.write(line);
  }

  function writeErr(text) {
    const line = String(text ?? "");
    diagnostics.push(line);
    if (typeof opts.writeErr === "function") opts.writeErr(line);
  }

  return {
    write,
    writeErr,
    async askLine() {
      return null;
    },
    async askHiddenCredential() {
      return null;
    },
    async askPublicationDecision() {
      return "decline";
    },
    requestStop() {
      stopped = true;
      cycleCancelRequested = true;
    },
    clearStop() {
      stopped = false;
    },
    beginCycle() {
      cycleActive = true;
      cycleCancelRequested = false;
      steeringQueue = [];
    },
    endCycle() {
      cycleActive = false;
    },
    drainSteering() {
      const out = steeringQueue.slice();
      steeringQueue = [];
      return out;
    },
    /**
     * @param {string} text
     */
    enqueueSteering(text) {
      const trimmed = String(text || "").trim();
      if (!trimmed) return false;
      steeringQueue.push(trimmed.slice(0, 4_000));
      if (steeringQueue.length > 16) {
        steeringQueue = steeringQueue.slice(-16);
      }
      return true;
    },
    isCycleActive() {
      return cycleActive === true;
    },
    isCycleCancelRequested() {
      return cycleCancelRequested === true;
    },
    requestCycleCancel() {
      cycleCancelRequested = true;
    },
    isStopped() {
      return stopped === true;
    },
    close() {
      stopped = true;
      cycleCancelRequested = true;
    },
    getDiagnostics() {
      return diagnostics.slice();
    },
    escape(s) {
      return String(s ?? "");
    },
  };
}
