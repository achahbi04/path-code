/**
 * Terminal prompt state machine, hidden credential input, challenge grammar.
 * Production uses real process TTY; tests inject private streams only via API.
 */

import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { escapeForTerminalDisplay } from "./escape.mjs";
import { classifyPublicationKey } from "./ag4/approval-keys.mjs";
import {
  applyComposerInput,
  createComposerState,
  ENABLE_BRACKETED_PASTE,
  DISABLE_BRACKETED_PASTE,
  IDLE_COMPOSER_READY,
} from "./composer.mjs";
import { isTaskStopCommand } from "./task-control.mjs";
import { normalizeObjectiveText } from "./normalize-text.mjs";

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
  /** Mid-cycle operator steering lines (G10). */
  /** @type {string[]} */
  let steeringQueue = [];
  const stderr = streams.stderr ?? streams.stdout;
  /** Optional S1 gateway bridge hooks. */
  const onSteering =
    typeof options.onSteering === "function" ? options.onSteering : null;
  const onCycleCancel =
    typeof options.onCycleCancel === "function" ? options.onCycleCancel : null;

  /** Living TUI owns echo — PATH composer paints via renderer. */
  let livingComposerEnabled = false;
  /** @type {((state: import("./composer.mjs").ComposerState) => void) | null} */
  let onComposerChange = null;
  /** @type {((delta: number) => void) | null} */
  let onStreamScroll = null;
  /** @type {import("./composer.mjs").ComposerState} */
  let composer = createComposerState();
  /** @type {((line: string | null) => void) | null} */
  let composerResolve = null;
  let composerRawActive = false;
  let composerWasRaw = false;
  /** @type {((buf: Buffer|string) => void) | null} */
  let composerOnData = null;

  // Proxy output so enabling the living composer later mutes readline echo.
  // Must be an EventEmitter — Node readline calls output.on("resize", …).
  const rlOutput = Object.assign(new EventEmitter(), {
    write(chunk, encoding, cb) {
      if (livingComposerEnabled) {
        if (typeof encoding === "function") encoding();
        else if (typeof cb === "function") cb();
        return true;
      }
      return streams.stdout.write(chunk, encoding, cb);
    },
    get isTTY() {
      return streams.stdout.isTTY === true;
    },
    get columns() {
      return streams.stdout.columns;
    },
  });

  const rl = createInterface({
    input: streams.stdin,
    // Mute readline echo when living TUI owns the screen; askLine fallback
    // still writes explicit promptText via write() on streams.stdout.
    output: /** @type {any} */ (rlOutput),
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

  function notifyComposer() {
    if (typeof onComposerChange === "function") {
      try {
        onComposerChange({ ...composer });
      } catch {
        // ignore UI failures
      }
    }
  }

  function pushSteering(text) {
    const trimmed =
      typeof text === "string" ? normalizeObjectiveText(text).trim() : "";
    if (!trimmed) return;
    // Task Stop is control, never steering.
    if (isTaskStopCommand(trimmed)) {
      requestCycleCancel();
      return;
    }
    steeringQueue.push(trimmed.slice(0, 4_000));
    if (steeringQueue.length > 16) {
      steeringQueue = steeringQueue.slice(-16);
    }
    if (onSteering) {
      try {
        onSteering(trimmed);
      } catch {
        // ignore bridge failures
      }
    }
  }

  /**
   * Enable PATH-owned composer for living TUI (no terminal echo into frame).
   * @param {{
   *   onChange?: (state: import("./composer.mjs").ComposerState) => void,
   *   onStreamScroll?: (delta: number) => void,
   * }} [opts]
   */
  function enableLivingComposer(opts = {}) {
    livingComposerEnabled = true;
    onComposerChange =
      typeof opts.onChange === "function" ? opts.onChange : null;
    onStreamScroll =
      typeof opts.onStreamScroll === "function" ? opts.onStreamScroll : null;
    composer = createComposerState();
    notifyComposer();
  }

  function getComposerState() {
    return { ...composer };
  }

  function clearComposer() {
    composer = createComposerState();
    notifyComposer();
  }

  function stopComposerRaw() {
    if (!composerRawActive) return;
    composerRawActive = false;
    if (composerOnData) {
      try {
        streams.stdin.removeListener("data", composerOnData);
      } catch {
        // ignore
      }
      composerOnData = null;
    }
    try {
      streams.stdin.setRawMode(composerWasRaw);
    } catch {
      // ignore
    }
    try {
      write(DISABLE_BRACKETED_PASTE);
      write("\u001b[?1000l\u001b[?1006l\u001b[?1007l\u001b[?1015l");
    } catch {
      // ignore
    }
    try {
      rl.resume();
    } catch {
      // ignore
    }
  }

  /**
   * Start raw-mode composer capture. When awaitSubmit is true, Enter resolves
   * askLine. When false (mid-cycle), Enter queues steering.
   * @param {{ awaitSubmit: boolean }} opts
   */
  function startComposerRaw(opts) {
    if (
      streams.stdin.isTTY !== true ||
      typeof streams.stdin.setRawMode !== "function"
    ) {
      return false;
    }
    stopComposerRaw();
    composerWasRaw = streams.stdin.isRaw === true;
    try {
      rl.pause();
    } catch {
      // ignore
    }
    try {
      streams.stdin.setRawMode(true);
    } catch {
      return false;
    }
    try {
      write(ENABLE_BRACKETED_PASTE);
      // Mouse: SGR (1006) + alternate-scroll (1007) + basic tracking (1000).
      // 1000+1006 yields SGR wheel reports; 1007 maps wheel→CSI A/B in alt-screen.
      // Never enable urxvt 1015 alone — fragmented digits leaked into composer.
      write("\u001b[?1000h\u001b[?1006h\u001b[?1007h");
      if (opts.awaitSubmit) {
        // Distinct from mid-cycle steering arm — harnesses feed on this mark.
        write(IDLE_COMPOSER_READY);
      }
    } catch {
      // ignore
    }
    composerRawActive = true;

    const onData = (buf) => {
      const result = applyComposerInput(composer, buf);
      composer = result.state;
      notifyComposer();
      if (
        typeof result.streamScrollDelta === "number" &&
        result.streamScrollDelta !== 0 &&
        typeof onStreamScroll === "function"
      ) {
        try {
          onStreamScroll(result.streamScrollDelta);
        } catch {
          // ignore
        }
      }

      if (result.cancel) {
        if (!cycleActive) {
          requestStop();
        } else {
          cycleCancelInProgress = true;
        }
        if (opts.awaitSubmit && composerResolve) {
          const resolve = composerResolve;
          composerResolve = null;
          stopComposerRaw();
          resolve(null);
        }
        return;
      }
      if (result.eof) {
        if (opts.awaitSubmit && composerResolve) {
          const resolve = composerResolve;
          composerResolve = null;
          stopComposerRaw();
          resolve(null);
        }
        return;
      }
      if (result.submit != null) {
        const line = result.submit;
        composer = createComposerState();
        notifyComposer();
        if (opts.awaitSubmit && composerResolve) {
          const resolve = composerResolve;
          composerResolve = null;
          stopComposerRaw();
          resolve(line);
        } else if (cycleActive && mode === "idle") {
          pushSteering(line);
        }
      }
    };
    composerOnData = onData;
    streams.stdin.on("data", onData);
    try {
      // rl.pause() pauses stdin; resume so the composer data listener receives bytes.
      streams.stdin.resume();
    } catch {
      // ignore
    }
    try {
      streams.stdin.ref();
    } catch {
      // ignore
    }
    return true;
  }

  function onCycleSteeringLine(value) {
    // Legacy readline path — only when living composer is off.
    if (livingComposerEnabled) return;
    if (!cycleActive || mode !== "idle") return;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) return;
    pushSteering(text);
  }

  function beginCycle() {
    cycleActive = true;
    cycleCancelInProgress = false;
    steeringQueue = [];
    // Mid-cycle SIGINT must cancel engineering even when askLine is not waiting.
    rl.on("SIGINT", onCycleSigint);
    if (livingComposerEnabled) {
      // Same composer for live steering — no readline echo into the frame.
      startComposerRaw({ awaitSubmit: false });
    } else {
      rl.on("line", onCycleSteeringLine);
    }
  }

  function endCycle() {
    try {
      rl.off("SIGINT", onCycleSigint);
    } catch {
      // ignore
    }
    try {
      rl.off("line", onCycleSteeringLine);
    } catch {
      // ignore
    }
    if (livingComposerEnabled) {
      stopComposerRaw();
      composer = createComposerState();
      notifyComposer();
    }
    cycleActive = false;
    cycleCancelInProgress = false;
    steeringQueue = [];
  }

  /**
   * Drain mid-cycle steering lines accepted by the operator (G10).
   * @returns {string[]}
   */
  function drainSteering() {
    const out = steeringQueue.slice();
    steeringQueue = [];
    return out;
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
    if (onCycleCancel) {
      try {
        onCycleCancel();
      } catch {
        // ignore bridge failures
      }
    }
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

    // Living TUI: PATH-owned composer (no readline echo into the frame).
    if (livingComposerEnabled && streams.stdin.isTTY === true) {
      try {
        rl.off("SIGINT", onCycleSigint);
      } catch {
        // ignore
      }
      composer = createComposerState();
      notifyComposer();
      const line = await new Promise((resolve) => {
        composerResolve = resolve;
        const ok = startComposerRaw({ awaitSubmit: true });
        if (!ok) {
          composerResolve = null;
          // Fallback: non-raw environment (tests without setRawMode).
          resolve(null);
        }
      });
      mode = "idle";
      activePromptId = null;
      if (cycleActive) {
        rl.on("SIGINT", onCycleSigint);
        // Resume mid-cycle steering composer.
        startComposerRaw({ awaitSubmit: false });
      }
      if (isStopped() && !cycleActive) return null;
      if (cycleCancelInProgress) return null;
      if (isStopped()) return null;
      return line;
    }

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
    stopComposerRaw();
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
    drainSteering,
    isCycleActive,
    isCycleCancelRequested,
    requestCycleCancel,
    isStopped,
    close,
    enableLivingComposer,
    getComposerState,
    clearComposer,
    getActivePromptId: () => activePromptId,
    getMode: () => mode,
    escape: escapeForTerminalDisplay,
  };
}
