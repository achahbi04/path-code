/**
 * PATH Build → local OS handoff helpers (Finder / PATH Code).
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

/**
 * Escape a string for embedding inside a double-quoted AppleScript / shell fragment.
 * @param {string} value
 */
function shSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

/**
 * Launch PATH Code bound to an exact project root in a visible Terminal window.
 * Detached `node pathcode.mjs` with stdio ignored is invisible and exits — that is
 * not a product open.
 *
 * @param {{
 *   projectRoot: string,
 *   nodePath: string,
 *   launcherPath: string,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 */
export async function launchPathCodeInTerminal(input) {
  const projectRoot = String(input.projectRoot || "");
  const nodePath = String(input.nodePath || process.execPath);
  const launcherPath = String(input.launcherPath || "");
  if (!projectRoot || !existsSync(projectRoot)) {
    return {
      ok: false,
      code: "PATH_REQUIRED",
      message: "Project root does not exist.",
    };
  }
  if (!launcherPath || !existsSync(launcherPath)) {
    return {
      ok: false,
      code: "PATHCODE_LAUNCHER_MISSING",
      message: `PATH Code launcher missing: ${launcherPath}`,
    };
  }

  const cmd = `cd ${shSingleQuote(projectRoot)} && exec ${shSingleQuote(nodePath)} ${shSingleQuote(launcherPath)}`;

  if (platform() === "darwin") {
    // Visible Terminal.app session — required for interactive PATH Code TTY.
    const apple = `tell application "Terminal"
  activate
  do script ${JSON.stringify(cmd)}
end tell`;
    const child = spawn("osascript", ["-e", apple], {
      detached: true,
      stdio: "ignore",
      env: input.env || process.env,
    });
    child.unref();
    return {
      ok: true,
      method: "terminal.app",
      pid: child.pid || null,
      projectRoot,
      command: cmd,
    };
  }

  // Linux/other: try gnome-terminal / x-terminal-emulator, else fall back to
  // a detached node process (still returns the cwd for binding proof).
  const termCandidates = [
    ["gnome-terminal", ["--", "bash", "-lc", cmd]],
    ["x-terminal-emulator", ["-e", `bash -lc ${shSingleQuote(cmd)}`]],
    ["xterm", ["-e", `bash -lc ${shSingleQuote(cmd)}`]],
  ];
  for (const [bin, args] of termCandidates) {
    try {
      const child = spawn(bin, args, {
        detached: true,
        stdio: "ignore",
        env: input.env || process.env,
      });
      child.unref();
      return {
        ok: true,
        method: bin,
        pid: child.pid || null,
        projectRoot,
        command: cmd,
      };
    } catch {
      /* try next */
    }
  }

  const child = spawn(nodePath, [launcherPath], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
    env: input.env || process.env,
  });
  child.unref();
  return {
    ok: true,
    method: "detached-node",
    pid: child.pid || null,
    projectRoot,
    command: cmd,
    warning:
      "No graphical terminal found; PATH Code launched detached (may exit without TTY).",
  };
}
