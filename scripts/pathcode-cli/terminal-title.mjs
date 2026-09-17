/**
 * Stable native Terminal window title for living PATH sessions.
 * Dynamic engineering status must never mutate the title.
 *
 * Root causes of title leakage (operator-proven):
 * 1. Setting process.title to the same string as the OSC window title makes
 *    Terminal.app show both → duplicated "<project> — PATH Code".
 * 2. Child runtimes (Python bridge / Copilot) that become the tty foreground
 *    process cause Terminal.app to append process name + argv (e.g. Python,
 *    TMPDIR=...) when "Active process name / Arguments" are enabled.
 * 3. Child OSC ]0;/]2; sequences on shared stdout/stderr overwrite the title.
 *
 * Fix:
 * - OSC window title only: "<project> — PATH Code"
 * - process.title kept to a non-informative placeholder (never product title,
 *   never "node"/"python"/"copilot") so Terminal's process-name append is inert
 * - Reclaim tty foreground process group while owned (tcsetpgrp) so children
 *   cannot win the "active process" slot Terminal.app appends
 * - Strip leaked OSC from stdout/stderr
 * - Fast watchdog reassert while owned
 * - Prefer raw fd writes for our OSC so stream guards cannot strip them
 */

import { writeSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const OSC = "\u001b]";
const BEL = "\u0007";

/** Matches OSC 0/1/2 title sequences terminated by BEL or ST. */
export const OSC_TITLE_RE = /\u001b\][012];[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

/**
 * Placeholder process name while PATH owns the session.
 * Must NOT be the product title (duplicates) and must not look like a provider
 * or runtime (`node` / `python` / `copilot`). Zero-width space keeps Terminal's
 * optional "active process name" append visually empty.
 */
const PROCESS_TITLE = "\u200b";

/** @type {string | null} */
let previousTitle = null;
/** @type {boolean} */
let titleOwned = false;
/** @type {string} */
let ownedTitle = "";
/** @type {string | null} */
let previousProcessTitle = null;
/** @type {{ write?: Function } | null} */
let ownedStdout = null;
/** @type {boolean} */
let streamGuardsInstalled = false;
/** @type {((chunk: any, encoding?: any, cb?: any) => any) | null} */
let prevStdoutWrite = null;
/** @type {((chunk: any, encoding?: any, cb?: any) => any) | null} */
let prevStderrWrite = null;
/** @type {ReturnType<typeof setInterval> | null} */
let titleWatchdog = null;
/** @type {boolean} */
let writingOwnedTitle = false;
/** @type {boolean | null} */
let reclaimAvailable = null;

/**
 * @param {string} projectName
 */
export function formatPathTitle(projectName) {
  const name =
    typeof projectName === "string" && projectName.trim()
      ? projectName.trim().slice(0, 80)
      : "PATH";
  return `${name} — PATH Code`;
}

/**
 * Remove OSC window/icon title sequences from a string.
 * @param {string} text
 */
export function stripOscTitleSequences(text) {
  if (typeof text !== "string" || text.length === 0) return text;
  if (!text.includes("\u001b]")) return text;
  return text.replace(OSC_TITLE_RE, "");
}

/**
 * @param {string} py
 * @param {string} script
 * @param {NodeJS.ProcessEnv} env
 */
function spawnAsyncReclaim(py, script, env) {
  try {
    const child = spawn(py, ["-c", script], {
      stdio: "ignore",
      detached: process.platform !== "win32",
      env,
    });
    child.on("error", () => {});
    if (typeof child.unref === "function") child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Force PATH's process group to own the tty foreground.
 * Terminal.app appends the *foreground* process name/argv to the window title
 * when that preference is enabled — OSC reassert alone cannot clear a child
 * that has stolen the foreground (copilot / python / bridge).
 *
 * Children keep pipes/stdio; we only restore which process group Terminal
 * considers "active". Safe no-op when /dev/tty is unavailable.
 *
 * @param {{ async?: boolean }} [opts] async=true for watchdog (non-blocking)
 * @returns {boolean} true when reclaim was attempted successfully (sync) or queued (async)
 */
export function reclaimTtyForeground(opts = {}) {
  if (process.platform === "win32") return false;
  // Never sticky-disable: a transient /dev/tty miss at startup used to disable
  // reclaim for the whole session, letting children own Terminal.app's title.
  let pgrp;
  try {
    pgrp =
      typeof process.getpgrp === "function" ? process.getpgrp() : process.pid;
  } catch {
    pgrp = process.pid;
  }
  if (typeof pgrp !== "number" || pgrp <= 0) return false;

  const py =
    (typeof process.env.PATHCODE_PYTHON === "string" &&
      process.env.PATHCODE_PYTHON.trim()) ||
    "python3";
  // Keep reclaim argv free of TMPDIR=/path noise Terminal.app may append when
  // "active process arguments" is enabled — pass only PATH + a quiet flag.
  const script = [
    "import os, sys",
    "try:",
    "  fd = os.open('/dev/tty', os.O_RDWR | os.O_NOCTTY)",
    `  os.tcsetpgrp(fd, ${Math.floor(pgrp)})`,
    "  os.close(fd)",
    "  sys.exit(0)",
    "except Exception:",
    "  sys.exit(1)",
  ].join("\n");
  const childEnv = {
    PATH: process.env.PATH || "/usr/bin:/bin",
    PATHCODE_NONINTERACTIVE: "1",
  };
  try {
    // Watchdog must not spawnSync — that blocked the event loop and timed out
    // living-session tests under load.
    if (opts.async === true) {
      return spawnAsyncReclaim(py, script, childEnv);
    }
    const r = spawnSync(py, ["-c", script], {
      timeout: 250,
      stdio: "ignore",
      detached: process.platform !== "win32",
      env: childEnv,
    });
    const ok = r.status === 0;
    reclaimAvailable = ok ? true : reclaimAvailable;
    return ok;
  } catch {
    return false;
  }
}

/**
 * Set a stable title for the living session.
 * @param {{
 *   stdout?: { write?: Function },
 *   projectName?: string,
 * }} opts
 */
export function setStablePathTitle(opts = {}) {
  const stdout = opts.stdout ?? process.stdout;
  const title = formatPathTitle(opts.projectName || "");
  ownedStdout = stdout && typeof stdout.write === "function" ? stdout : null;
  if (!titleOwned) {
    previousTitle = null;
    titleOwned = true;
    try {
      previousProcessTitle =
        typeof process.title === "string" ? process.title : null;
    } catch {
      previousProcessTitle = null;
    }
  }
  ownedTitle = title;
  installStreamTitleGuards();
  writeOwnedTitle();
  try {
    // Do NOT mirror the product title into process.title — Terminal.app would
    // render OSC title + process title as a duplicated string.
    process.title = PROCESS_TITLE;
  } catch {
    // ignore
  }
  try {
    reclaimTtyForeground();
  } catch {
    // ignore
  }
  return title;
}

/**
 * Strip leaked OSC title sequences from shared TTY streams and periodically
 * reassert ownership while engineering children run.
 */
function installStreamTitleGuards() {
  if (streamGuardsInstalled) return;
  streamGuardsInstalled = true;
  try {
    if (typeof process.stdout?.write === "function") {
      prevStdoutWrite = process.stdout.write.bind(process.stdout);
      process.stdout.write = function pathTitleStdoutWrite(chunk, encoding, cb) {
        if (writingOwnedTitle) {
          return prevStdoutWrite(chunk, encoding, cb);
        }
        let next = chunk;
        if (typeof chunk === "string" && chunk.includes("\u001b]")) {
          next = stripOscTitleSequences(chunk);
        } else if (Buffer.isBuffer(chunk)) {
          const asText = chunk.toString("utf8");
          if (asText.includes("\u001b]")) {
            next = Buffer.from(stripOscTitleSequences(asText), "utf8");
          }
        }
        return prevStdoutWrite(next, encoding, cb);
      };
    }
  } catch {
    // ignore
  }
  try {
    if (typeof process.stderr?.write === "function") {
      prevStderrWrite = process.stderr.write.bind(process.stderr);
      process.stderr.write = function pathTitleStderrWrite(chunk, encoding, cb) {
        if (writingOwnedTitle) {
          return prevStderrWrite(chunk, encoding, cb);
        }
        let next = chunk;
        if (typeof chunk === "string" && chunk.includes("\u001b]")) {
          next = stripOscTitleSequences(chunk);
        } else if (Buffer.isBuffer(chunk)) {
          const asText = chunk.toString("utf8");
          if (asText.includes("\u001b]")) {
            next = Buffer.from(stripOscTitleSequences(asText), "utf8");
          }
        }
        return prevStderrWrite(next, encoding, cb);
      };
    }
  } catch {
    // ignore
  }
  if (titleWatchdog == null) {
    titleWatchdog = setInterval(() => {
      if (!titleOwned) return;
      try {
        process.title = PROCESS_TITLE;
      } catch {
        // ignore
      }
      try {
        reclaimTtyForeground({ async: true });
      } catch {
        // ignore
      }
      try {
        reassertPathTitle();
      } catch {
        // ignore
      }
    }, 250);
    if (typeof titleWatchdog.unref === "function") titleWatchdog.unref();
  }
}

function uninstallStreamTitleGuards() {
  if (!streamGuardsInstalled) return;
  streamGuardsInstalled = false;
  try {
    if (prevStdoutWrite && process.stdout) {
      process.stdout.write = prevStdoutWrite;
    }
  } catch {
    // ignore
  }
  try {
    if (prevStderrWrite && process.stderr) {
      process.stderr.write = prevStderrWrite;
    }
  } catch {
    // ignore
  }
  prevStdoutWrite = null;
  prevStderrWrite = null;
  if (titleWatchdog != null) {
    clearInterval(titleWatchdog);
    titleWatchdog = null;
  }
}

/**
 * Re-assert the owned title (call after each frame / external write).
 */
export function reassertPathTitle() {
  if (!titleOwned || !ownedTitle) return;
  writeOwnedTitle();
  try {
    process.title = PROCESS_TITLE;
  } catch {
    // ignore
  }
  // OSC-only here — sync reclaim belongs at child-spawn boundaries, not every
  // frame (would block the living TUI under load).
}

function writeOwnedTitle() {
  if (!ownedTitle) return;
  // Clear then set window title (OSC 2). Avoid leaving stale icon/title fragments.
  const payload = `${OSC}0;${BEL}${OSC}2;${ownedTitle}${BEL}`;
  writingOwnedTitle = true;
  try {
    const stdout = ownedStdout ?? process.stdout;
    // Custom stdout (tests / redirected sinks) must receive the OSC payload.
    // Raw fd writes are only for the live process.stdout TTY path so stream
    // guards cannot strip our own reassert sequences.
    const useCustomStdout =
      ownedStdout != null && ownedStdout !== process.stdout;
    if (!useCustomStdout) {
      try {
        if (typeof process.stdout?.fd === "number") {
          writeSync(process.stdout.fd, payload);
          return;
        }
      } catch {
        // fall through to stream write
      }
    }
    if (!stdout || typeof stdout.write !== "function") return;
    if (stdout === process.stdout && prevStdoutWrite) {
      prevStdoutWrite(payload);
    } else {
      stdout.write(payload);
    }
  } catch {
    // ignore
  } finally {
    writingOwnedTitle = false;
  }
}

/**
 * Restore title after PATH exits (best-effort).
 * @param {{ stdout?: { write?: Function } }} [opts]
 */
export function restoreTerminalTitle(opts = {}) {
  if (!titleOwned) return;
  const restorePayload = previousTitle
    ? `${OSC}0;${BEL}${OSC}2;${previousTitle}${BEL}`
    : `${OSC}0;${BEL}${OSC}2;${BEL}`;
  writingOwnedTitle = true;
  try {
    try {
      const stdout = opts.stdout ?? ownedStdout ?? process.stdout;
      const useCustomStdout =
        stdout != null &&
        stdout !== process.stdout &&
        typeof stdout.write === "function";
      if (!useCustomStdout && typeof process.stdout?.fd === "number") {
        writeSync(process.stdout.fd, restorePayload);
      } else if (stdout && typeof stdout.write === "function") {
        if (stdout === process.stdout && prevStdoutWrite) {
          prevStdoutWrite(restorePayload);
        } else {
          stdout.write(restorePayload);
        }
      }
    } catch {
      // ignore
    }
  } finally {
    writingOwnedTitle = false;
  }
  try {
    if (previousProcessTitle != null) {
      process.title = previousProcessTitle;
    } else {
      process.title = "node";
    }
  } catch {
    // ignore
  }
  uninstallStreamTitleGuards();
  titleOwned = false;
  previousTitle = null;
  ownedTitle = "";
  previousProcessTitle = null;
  ownedStdout = null;
  reclaimAvailable = null;
}

export function isPathTitleOwned() {
  return titleOwned === true;
}

export function getOwnedPathTitle() {
  return titleOwned ? ownedTitle : null;
}
