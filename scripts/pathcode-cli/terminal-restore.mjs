/**
 * AG3 — absolute terminal restoration (idempotent, synchronous).
 */

const SHOW_CURSOR = "\u001b[?25h";
const EXIT_ALT = "\u001b[?1049l";
const RESET_GRAPHICS = "\u001b[0m";

/** @type {boolean} */
let registered = false;
/** @type {(() => void) | null} */
let activeCleanup = null;
/** @type {boolean} */
let shuttingDown = false;

/**
 * Restore every terminal attribute PATH may have changed.
 * Safe to call repeatedly.
 *
 * @param {{
 *   stdout?: NodeJS.WriteStream,
 *   stdin?: NodeJS.ReadStream,
 * }} [opts]
 */
export function restoreTerminal(opts = {}) {
  const stdout = opts.stdout ?? process.stdout;
  const stdin = opts.stdin ?? process.stdin;

  try {
    if (stdin && typeof stdin.setRawMode === "function" && stdin.isTTY) {
      try {
        stdin.setRawMode(false);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  try {
    if (stdout && typeof stdout.write === "function") {
      stdout.write(`${SHOW_CURSOR}${EXIT_ALT}${RESET_GRAPHICS}`);
    }
  } catch {
    // ignore
  }
}

/**
 * Register the active TUI cleanup (called before restore on signals).
 * @param {(() => void) | null} fn
 */
export function setActiveTerminalCleanup(fn) {
  activeCleanup = typeof fn === "function" ? fn : null;
}

/**
 * @param {number} code
 */
function terminateWithCode(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    if (activeCleanup) activeCleanup();
  } catch {
    // ignore
  }
  restoreTerminal();
  // Use exitCode + nextTick so restore flush can complete.
  process.exitCode = code;
  setImmediate(() => {
    try {
      process.exit(code);
    } catch {
      // ignore
    }
  });
}

/**
 * Install once-per-process defensive handlers.
 * Does not steal SIGINT while PATH REPL wants cooperative cancel.
 *
 * @param {{
 *   onSigint?: () => "handled" | "exit",
 * }} [opts]
 */
export function installTerminalRestoreGuards(opts = {}) {
  if (registered) return;
  registered = true;

  const runCleanup = () => {
    try {
      if (activeCleanup) activeCleanup();
    } catch {
      // ignore
    }
    restoreTerminal();
  };

  process.on("exit", () => {
    runCleanup();
  });

  process.on("SIGTERM", () => {
    runCleanup();
    terminateWithCode(143);
  });

  process.on("SIGINT", () => {
    if (typeof opts.onSigint === "function") {
      const result = opts.onSigint();
      if (result === "handled") return;
    }
    runCleanup();
    terminateWithCode(130);
  });

  process.on("uncaughtException", (err) => {
    try {
      runCleanup();
      const msg = err && err.stack ? err.stack : String(err);
      process.stderr.write(`\nPATH internal error:\n${msg}\n`);
    } catch {
      // ignore
    }
    terminateWithCode(1);
  });

  process.on("unhandledRejection", (reason) => {
    try {
      runCleanup();
      const msg =
        reason && typeof reason === "object" && "stack" in reason
          ? String(/** @type {any} */ (reason).stack)
          : String(reason);
      process.stderr.write(`\nPATH unhandled rejection:\n${msg}\n`);
    } catch {
      // ignore
    }
    terminateWithCode(1);
  });
}

export const TERMINAL_SEQ = Object.freeze({
  SHOW_CURSOR,
  HIDE_CURSOR: "\u001b[?25l",
  ENTER_ALT: "\u001b[?1049h",
  EXIT_ALT,
  RESET_GRAPHICS,
});
