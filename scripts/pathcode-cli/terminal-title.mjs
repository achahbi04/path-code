/**
 * Stable native Terminal window title for living PATH sessions.
 * Dynamic engineering status must never mutate the title.
 *
 * Child processes (node, copilot-runtime, harness scripts) often emit OSC 0/2
 * title sequences or change process.title — PATH reasserts ownership on paint
 * and strips leaked OSC title bytes from TTY writes while the session is owned.
 */

const OSC = "\u001b]";
const BEL = "\u0007";
const ST = "\u001b\\";

/** Matches OSC 0/1/2 title sequences terminated by BEL or ST. */
export const OSC_TITLE_RE = /\u001b\][012];[^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

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
    // Terminal.app often shows process.title when children run; keep it stable.
    process.title = title.slice(0, 64);
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
        reassertPathTitle();
      } catch {
        // ignore
      }
    }, 1500);
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
    process.title = ownedTitle.slice(0, 64);
  } catch {
    // ignore
  }
}

function writeOwnedTitle() {
  if (!ownedTitle) return;
  const payload = `${OSC}0;${ownedTitle}${BEL}`;
  try {
    const stdout = ownedStdout ?? process.stdout;
    if (!stdout || typeof stdout.write !== "function") return;
    writingOwnedTitle = true;
    try {
      // Prefer raw process.stdout write so stream guards do not strip our title.
      if (stdout === process.stdout && prevStdoutWrite) {
        prevStdoutWrite(payload);
      } else {
        stdout.write(payload);
      }
    } finally {
      writingOwnedTitle = false;
    }
  } catch {
    writingOwnedTitle = false;
  }
}

/**
 * Restore title after PATH exits (best-effort).
 * @param {{ stdout?: { write?: Function } }} [opts]
 */
export function restoreTerminalTitle(opts = {}) {
  if (!titleOwned) return;
  const stdout = opts.stdout ?? ownedStdout ?? process.stdout;
  const restorePayload = previousTitle
    ? `${OSC}0;${previousTitle}${BEL}`
    : `${OSC}0;${ST}${OSC}0;${BEL}`;
  try {
    if (stdout && typeof stdout.write === "function") {
      writingOwnedTitle = true;
      try {
        if (stdout === process.stdout && prevStdoutWrite) {
          prevStdoutWrite(restorePayload);
        } else {
          stdout.write(restorePayload);
        }
      } finally {
        writingOwnedTitle = false;
      }
    }
  } catch {
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
}

export function isPathTitleOwned() {
  return titleOwned === true;
}

export function getOwnedPathTitle() {
  return titleOwned ? ownedTitle : null;
}
