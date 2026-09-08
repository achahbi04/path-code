/**
 * Phase 5G state directory resolution.
 *
 * Recovery checkpoints must outlive the repository they protect, so the store
 * root is resolved from the operating system's state area — never from the
 * project. If the resolved root would land inside the target repository the
 * session refuses: a checkpoint stored inside the tree it is meant to restore
 * is not a checkpoint.
 */

import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { realpathSync } from "node:fs";

export const STATE_DIR_ENV = "PATHCODE_STATE_DIR";

/** Subdirectory of the state directory that holds recovery checkpoints. */
export const RECOVERY_STORE_SUBDIRECTORY = "recovery";

const MACOS_DIRECTORY = ["Library", "Application Support", "PATH Code"];
const WINDOWS_DIRECTORY = ["PATH Code"];
const XDG_DIRECTORY = ["pathcode"];
const LINUX_FALLBACK_DIRECTORY = [".local", "state", "pathcode"];

/**
 * Resolve the Path Code state directory for this platform.
 *
 * @param {{ env?: Record<string, string | undefined>, platform?: string, home?: string }} [options]
 * @returns {{ ok: true, directory: string, source: "PATHCODE_STATE_DIR" | "PLATFORM_DEFAULT", platform: string }
 *   | { ok: false, code: string, message: string }}
 */
export function resolveStateDirectory(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  const override = env[STATE_DIR_ENV];
  if (typeof override === "string" && override.trim() !== "") {
    const trimmed = override.trim();
    if (!isAbsolute(trimmed)) {
      return {
        ok: false,
        code: "STATE_DIRECTORY_NOT_ABSOLUTE",
        message: `${STATE_DIR_ENV} must be an absolute path.`,
      };
    }
    return {
      ok: true,
      directory: resolve(trimmed),
      source: "PATHCODE_STATE_DIR",
      platform,
    };
  }

  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA;
    if (typeof localAppData !== "string" || !isAbsolute(localAppData)) {
      return {
        ok: false,
        code: "STATE_DIRECTORY_UNAVAILABLE",
        message: `LOCALAPPDATA is unset or not absolute; set ${STATE_DIR_ENV} instead.`,
      };
    }
    return {
      ok: true,
      directory: join(resolve(localAppData), ...WINDOWS_DIRECTORY),
      source: "PLATFORM_DEFAULT",
      platform,
    };
  }

  const home = options.home ?? homedir();

  if (platform === "darwin") {
    if (typeof home !== "string" || !isAbsolute(home)) {
      return {
        ok: false,
        code: "STATE_DIRECTORY_UNAVAILABLE",
        message: `Home directory is unavailable; set ${STATE_DIR_ENV} instead.`,
      };
    }
    return {
      ok: true,
      directory: join(resolve(home), ...MACOS_DIRECTORY),
      source: "PLATFORM_DEFAULT",
      platform,
    };
  }

  const xdg = env.XDG_STATE_HOME;
  if (typeof xdg === "string" && isAbsolute(xdg)) {
    return {
      ok: true,
      directory: join(resolve(xdg), ...XDG_DIRECTORY),
      source: "PLATFORM_DEFAULT",
      platform,
    };
  }
  if (typeof home !== "string" || !isAbsolute(home)) {
    return {
      ok: false,
      code: "STATE_DIRECTORY_UNAVAILABLE",
      message: `Neither XDG_STATE_HOME nor a home directory is available; set ${STATE_DIR_ENV} instead.`,
    };
  }
  return {
    ok: true,
    directory: join(resolve(home), ...LINUX_FALLBACK_DIRECTORY),
    source: "PLATFORM_DEFAULT",
    platform,
  };
}

/**
 * Best-effort physical resolution: a path that does not exist yet still has to
 * be compared, so fall back to lexical resolution.
 * @param {string} candidate
 */
function realOrResolved(candidate) {
  try {
    return realpathSync(candidate);
  } catch {
    return resolve(candidate);
  }
}

/**
 * True when `inner` is `outer` or lives beneath it.
 * @param {string} outer
 * @param {string} inner
 */
export function containsPath(outer, inner) {
  const a = resolve(outer);
  const b = resolve(inner);
  if (a === b) {
    return true;
  }
  const rel = relative(a, b);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Resolve the recovery store root and prove it is outside the target project.
 *
 * @param {{ stateDirectory: string, projectRoot: string }} input
 * @returns {{ ok: true, root: string } | { ok: false, code: string, message: string }}
 */
export function resolveRecoveryStoreRoot(input) {
  const root = join(resolve(input.stateDirectory), RECOVERY_STORE_SUBDIRECTORY);
  const projectReal = realOrResolved(input.projectRoot);
  const storeReal = realOrResolved(root);

  if (containsPath(projectReal, storeReal) || containsPath(projectReal, root)) {
    return {
      ok: false,
      code: "RECOVERY_STORE_INSIDE_PROJECT",
      message:
        `The recovery checkpoint store would resolve inside the target repository (${storeReal}). ` +
        `A checkpoint stored inside the tree it protects cannot protect it. ` +
        `Set ${STATE_DIR_ENV} to a directory outside this project.`,
    };
  }
  if (containsPath(storeReal, projectReal)) {
    return {
      ok: false,
      code: "RECOVERY_STORE_CONTAINS_PROJECT",
      message:
        `The target repository lies inside the recovery checkpoint store (${storeReal}). ` +
        `Set ${STATE_DIR_ENV} to a directory that does not contain this project.`,
    };
  }
  return { ok: true, root };
}
