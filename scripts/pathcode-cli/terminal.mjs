/**
 * Terminal prompt state machine, hidden credential input, challenge grammar.
 * Production uses real process TTY; tests inject private streams only via API.
 */

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { escapeForTerminalDisplay } from "./escape.mjs";
import { classifyPublicationKey } from "./ag4/approval-keys.mjs";

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
 * Phase 5G-R1 bounded-autonomy session-policy confirmation.
 * Approves the disclosed finite envelope once; it is not an edit or command token.
 * @param {string} line
 * @param {string} challenge
 */
export function acceptsRunConfirmation(line, challenge) {
  return matchesChallengePhrase("RUN", challenge, line);
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
  /** True while a task/recover/trial cycle is running (not the idle REPL). */
  let cycleActive = false;
  /** First mid-cycle SIGINT cancels the cycle; a second force-exits. */
  let cycleCancelInProgress = false;
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

  function clearStop() {
    stopRequested = false;
  }

  function beginCycle() {
    cycleActive = true;
    cycleCancelInProgress = false;
    // Mid-cycle SIGINT must cancel engineering even when askLine is not waiting.
    rl.on("SIGINT", onCycleSigint);
  }

  function endCycle() {
    try {
      rl.off("SIGINT", onCycleSigint);
    } catch {
      // ignore
    }
    cycleActive = false;
    cycleCancelInProgress = false;
  }

  function isCycleActive() {
    return cycleActive;
  }

  function isStopped() {
    return stopRequested || options.signal?.aborted === true;
  }

  function isCycleCancelRequested() {
    return cycleCancelInProgress === true;
  }

  /**
   * Request cooperative cancel of the active engineering cycle (Ctrl-C).
   * Does not stop the long-lived REPL.
   */
  function requestCycleCancel() {
    if (!cycleActive) return false;
    if (cycleCancelInProgress) return true;
    cycleCancelInProgress = true;
    return true;
  }

  function onCycleSigint() {
    handleSigintCancel(() => {});
  }

  /**
   * Idle REPL SIGINT ends the living session. Mid-cycle SIGINT cancels the
   * cycle only; a second SIGINT during that cleanup force-exits.
   */
  function handleSigintCancel(resolveWithNull) {
    if (!cycleActive) {
      requestStop();
      resolveWithNull();
      return;
    }
    if (cycleCancelInProgress) {
      write("\nForced exit during cycle cleanup.\n");
      try {
        rl.close();
      } catch {
        // ignore
      }
      // Honest force-exit: second SIGINT during cleanup.
      process.exit(130);
    }
    cycleCancelInProgress = true;
    resolveWithNull();
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
    // askLine owns SIGINT while awaiting; detach the mid-cycle listener.
    try {
      rl.off("SIGINT", onCycleSigint);
    } catch {
      // ignore
    }
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
        handleSigintCancel(() => resolve(null));
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
    if (cycleActive) {
      rl.on("SIGINT", onCycleSigint);
    }
    // Mid-cycle cancel must not permanently stop the living session.
    if (isStopped() && !cycleActive) {
      return null;
    }
    if (cycleCancelInProgress) {
      return null;
    }
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
            // Ctrl+C — cancel credential prompt; living session survives unless idle.
            if (!cycleActive) {
              requestStop();
            } else {
              cycleCancelInProgress = true;
            }
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

  /**
   * AG4 one-shot publication approval. First recognized key wins.
   * y/Y approve; n/N/Enter/Esc decline; Ctrl-C cancel.
   * When showPrompt is false, the living TUI owns the visible copy.
   * @param {{
   *   remote: string,
   *   baseBranch: string,
   *   taskBranch: string,
   *   showPrompt?: boolean,
   *   onListening?: () => void,
   * }} info
   * @returns {Promise<"approve"|"decline"|"cancel">}
   */
  async function askPublicationDecision(info) {
    if (isStopped() || mode === "closed") return "cancel";
    mode = "secret";
    activePromptId = "ag4-publish";
    try {
      rl.off("SIGINT", onCycleSigint);
    } catch {
      // ignore
    }
    // Do not rl.pause() here: pausing readline around setRawMode under a PTY
    // has been observed to tear down the living session before the one-shot
    // key arrives. Raw stdin listener alone owns the decision.

    const wasRaw = streams.stdin.isRaw === true;
    let settled = false;

    if (info.showPrompt !== false) {
      write(
        `\nRemote\n  ${info.remote}\n\nBase\n  ${info.baseBranch}\n\nAction\n  Push ${info.taskBranch} and create PR\n\n` +
          `Publish verified work to GitHub and create a pull request? [y/N] `,
      );
    }

    return await new Promise((resolve) => {
      function finish(result) {
        if (settled) return;
        settled = true;
        try {
          streams.stdin.setRawMode(wasRaw);
        } catch {
          // ignore
        }
        streams.stdin.removeListener("data", onData);
        streams.stdin.removeListener("error", onError);
        write("\n");
        mode = "idle";
        activePromptId = null;
        if (cycleActive) {
          try {
            rl.on("SIGINT", onCycleSigint);
          } catch {
            // ignore
          }
        }
        resolve(result);
      }

      function onError() {
        finish("decline");
      }

      function onData(buf) {
        const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        for (let i = 0; i < data.length; i += 1) {
          const b = data[i];
          if (b === 0x03) {
            // Ctrl-C
            if (!cycleActive) requestStop();
            else cycleCancelInProgress = true;
            finish("cancel");
            return;
          }
          const decision = classifyPublicationKey(b);
          if (decision === "approve" || decision === "decline" || decision === "cancel") {
            if (decision === "cancel") {
              if (!cycleActive) requestStop();
              else cycleCancelInProgress = true;
            }
            finish(decision);
            return;
          }
          // ignore other keys
        }
      }

      try {
        streams.stdin.setRawMode(true);
      } catch {
        finish("decline");
        return;
      }
      try {
        // Keep the event loop alive while waiting for the one-shot key.
        streams.stdin.ref();
      } catch {
        // ignore
      }
      streams.stdin.on("data", onData);
      streams.stdin.on("error", onError);
      if (typeof info.onListening === "function") {
        // Arm UI after the listener is attached; defer so paint does not race.
        setImmediate(() => {
          if (settled) return;
          try {
            info.onListening();
          } catch {
            // ignore UI emit failures
          }
        });
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
    askPublicationDecision,
    requestStop,
    clearStop,
    beginCycle,
    endCycle,
    isCycleActive,
    isCycleCancelRequested,
    requestCycleCancel,
    isStopped,
    close,
    getActivePromptId: () => activePromptId,
    getMode: () => mode,
    escape: escapeForTerminalDisplay,
  };
}
