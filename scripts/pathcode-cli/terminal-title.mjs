/**
 * Stable native Terminal window title for living PATH sessions.
 * Dynamic engineering status must never mutate the title.
 */

const OSC = "\u001b]";
const BEL = "\u0007";
const ST = "\u001b\\";

/** @type {string | null} */
let previousTitle = null;
/** @type {boolean} */
let titleOwned = false;

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
 * Set a stable title for the living session.
 * @param {{
 *   stdout?: { write?: Function },
 *   projectName?: string,
 * }} opts
 */
export function setStablePathTitle(opts = {}) {
  const stdout = opts.stdout ?? process.stdout;
  const title = formatPathTitle(opts.projectName || "");
  if (!titleOwned) {
    previousTitle = null;
    titleOwned = true;
  }
  try {
    if (stdout && typeof stdout.write === "function") {
      // OSC 0 sets both icon and window title (widely supported).
      stdout.write(`${OSC}0;${title}${BEL}`);
    }
  } catch {
    // ignore
  }
  return title;
}

/**
 * Restore title after PATH exits (best-effort).
 * @param {{ stdout?: { write?: Function } }} [opts]
 */
export function restoreTerminalTitle(opts = {}) {
  if (!titleOwned) return;
  const stdout = opts.stdout ?? process.stdout;
  try {
    if (stdout && typeof stdout.write === "function") {
      if (previousTitle) {
        stdout.write(`${OSC}0;${previousTitle}${BEL}`);
      } else {
        // Clear to empty — Terminal.app falls back to default process title.
        stdout.write(`${OSC}0;${ST}`);
        stdout.write(`${OSC}0;${BEL}`);
      }
    }
  } catch {
    // ignore
  }
  titleOwned = false;
  previousTitle = null;
}

export function isPathTitleOwned() {
  return titleOwned === true;
}
