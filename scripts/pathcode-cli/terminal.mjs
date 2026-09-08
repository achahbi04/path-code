/**
 * Terminal prompt state machine, hidden credential input, challenge grammar.
 * Production uses real process TTY; tests inject private streams only via API.
 */

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { escapeForTerminalDisplay } from "./escape.mjs";

/**
 * @typedef {{
 *   stdin: NodeJS.ReadableStream & { isTTY?: boolean, setRawMode?: Function, ref?: Function, unref?: Function },
 *   stdout: NodeJS.WritableStream & { isTTY?: boolean, columns?: number },
 *   stderr?: NodeJS.WritableStream,
 * }} TerminalStreams
 */

/**
 * @param {TerminalStreams} streams
 */
export function isInteractiveTty(streams) {
  return streams.stdin.isTTY === true && streams.stdout.isTTY === true;
}

export function newChallenge(bytes = 3) {
  return randomBytes(bytes).toString("hex");
}

/**
 * Exact-match grammar for prompt-specific approvals.
 * @param {string} action START | APPLY | CHECK
 * @param {string} challenge
 * @param {string} line
 */
export function matchesChallengePhrase(action, challenge, line) {
  if (typeof line !== "string" || typeof challenge !== "string") {
    return false;
  }
  const trimmed = line.replace(/\r$/, "").trim();
  return trimmed === `${action} ${challenge}`;
}

/**
 * Live-consent gate predicate (P1 target).
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsStartConsent(line, challenge) {
  return matchesChallengePhrase("START", challenge, line);
}

/**
 * Edit-review confirmation predicate (P2 target).
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsApplyConfirmation(line, challenge) {
  return matchesChallengePhrase("APPLY", challenge, line);
}

/**
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsCheckConfirmation(line, challenge) {
  return matchesChallengePhrase("CHECK", challenge, line);
}

/**
 * Phase 5G scope-review confirmation. Approves the reviewed path list only —
 * not the edit, and not any command.
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsScopeConfirmation(line, challenge) {
  return matchesChallengePhrase("SCOPE", challenge, line);
}

/**
 * Phase 5G recovery confirmation. Approves restoring the reviewed checkpoint
 * entries over the current working tree.
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsRestoreConfirmation(line, challenge) {
  return matchesChallengePhrase("RESTORE", challenge, line);
}

/**
 * @param {TerminalStreams} streams
 * @param {{ signal?: AbortSignal }} [options]
 */
export function createPromptSession(streams, options = {}) {
  /** @type {"idle"|"awaiting"|"secret"|"closed"} */
  let mode = "idle";
  /** @type {string | null} */
  let activePromptId = null;
  let stopRequested = false;
  const stderr = streams.stderr ?? streams.stdout;

  const rl = createInterface({
    input: streams.stdin,
    output: streams.stdout,
    terminal: streams.stdin.isTTY === true,
    historySize: 0,
    crlfDelay: Infinity,
  });

  function write(text) {
    streams.stdout.write(text);
  }

  function writeErr(text) {
    stderr.write(text);
  }

  function requestStop() {
    stopRequested = true;
  }

  function isStopped() {
    return stopRequested || options.signal?.aborted === true;
  }

  /**
   * @param {string} promptId
   * @param {string} promptText
   * @returns {Promise<string | null>} null on EOF/cancel/stop
   */
  async function askLine(promptId, promptText) {
    if (isStopped() || mode === "closed") {
      return null;
    }
    mode = "awaiting";
    activePromptId = promptId;
    write(promptText);
    const line = await new Promise((resolve) => {
      const onLine = (value) => {
        cleanup();
        resolve(typeof value === "string" ? value : "");
      };
      const onClose = () => {
        cleanup();
        resolve(null);
      };
      const onSigint = () => {
        cleanup();
        requestStop();
        resolve(null);
      };
      function cleanup() {
        rl.off("line", onLine);
        rl.off("close", onClose);
        rl.off("SIGINT", onSigint);
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
      }
      function onAbort() {
        cleanup();
        resolve(null);
      }
      rl.once("line", onLine);
      rl.once("close", onClose);
      rl.once("SIGINT", onSigint);
      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });
    mode = "idle";
    activePromptId = null;
    if (isStopped()) {
      return null;
    }
    return line;
  }

  /**
   * Hidden TTY credential input. Suspends ordinary line parser.
   * Restores raw/echo state on all exits.
   * @param {number} maxBytes
   * @returns {Promise<{ ok: true, credential: string } | { ok: false, code: string }>}
   */
  async function askHiddenCredential(maxBytes) {
    if (isStopped() || mode === "closed") {
      return { ok: false, code: "STOPPED" };
    }
    if (streams.stdin.isTTY !== true || typeof streams.stdin.setRawMode !== "function") {
      return { ok: false, code: "NO_TTY" };
    }

    mode = "secret";
    activePromptId = "credential";
    // Pause readline so it does not consume secret keystrokes as later approvals.
    rl.pause();

    const wasRaw = streams.stdin.isRaw === true;
    /** @type {Buffer[]} */
    const chunks = [];
    let total = 0;
    let settled = false;

    write("OpenAI API key (hidden): ");

    return await new Promise((resolve) => {
      function finish(result) {
        if (settled) return;
        settled = true;
        try {
          streams.stdin.setRawMode(wasRaw);
        } catch {
          // restore best-effort
        }
        streams.stdin.removeListener("data", onData);
        streams.stdin.removeListener("error", onError);
        if (options.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        write("\n");
        mode = "idle";
        activePromptId = null;
        rl.resume();
        resolve(result);
      }

      function onAbort() {
        finish({ ok: false, code: "STOPPED" });
      }

      function onError() {
        finish({ ok: false, code: "INPUT_ERROR" });
      }

      function onData(buf) {
        const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        for (let i = 0; i < data.length; i += 1) {
          const b = data[i];
          if (b === 0x03) {
            // Ctrl+C
            requestStop();
            finish({ ok: false, code: "CANCELLED" });
            return;
          }
          if (b === 0x04) {
            // Ctrl+D / EOF
            finish({ ok: false, code: "EOF" });
            return;
          }
          if (b === 0x0d || b === 0x0a) {
            const credential = Buffer.concat(chunks).toString("utf8");
            if (credential.length === 0) {
              finish({ ok: false, code: "EMPTY" });
              return;
            }
            if (Buffer.byteLength(credential, "utf8") > maxBytes) {
              finish({ ok: false, code: "TOO_LONG" });
              return;
            }
            finish({ ok: true, credential });
            return;
          }
          if (b === 0x7f || b === 0x08) {
            if (chunks.length > 0) {
              const last = chunks[chunks.length - 1];
              if (last.length <= 1) {
                chunks.pop();
                total = Math.max(0, total - 1);
              } else {
                chunks[chunks.length - 1] = last.subarray(0, last.length - 1);
                total -= 1;
              }
            }
            continue;
          }
          // Discard non-printable / paste control; keep printable ASCII for keys.
          if (b < 0x20 || b > 0x7e) {
            continue;
          }
          if (total + 1 > maxBytes) {
            finish({ ok: false, code: "TOO_LONG" });
            return;
          }
          chunks.push(Buffer.from([b]));
          total += 1;
        }
      }

      try {
        streams.stdin.setRawMode(true);
      } catch {
        finish({ ok: false, code: "RAW_MODE_FAILED" });
        return;
      }
      streams.stdin.on("data", onData);
      streams.stdin.on("error", onError);
      if (options.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }
    });
  }

  function close() {
    if (mode === "closed") return;
    mode = "closed";
    try {
      rl.close();
    } catch {
      // ignore
    }
  }

  return {
    write,
    writeErr,
    askLine,
    askHiddenCredential,
    requestStop,
    isStopped,
    close,
    getActivePromptId: () => activePromptId,
    getMode: () => mode,
    escape: escapeForTerminalDisplay,
  };
}
