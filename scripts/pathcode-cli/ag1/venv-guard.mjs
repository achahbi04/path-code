/**
 * AG1 — resolve and guard the project-owned Antigravity virtualenv Python.
 * Never fall back to global/system python/python3/py.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { resolveCheckoutRoot } from "../paths.mjs";

export const AG1_SDK_PIN = "google-antigravity==0.1.16";
export const AG1_VENV_REL = join(".path-code-tmp", "ag1-venv");

/**
 * @param {string} [checkoutRoot]
 */
export function resolveAg1VenvRoot(checkoutRoot = resolveCheckoutRoot()) {
  return resolve(checkoutRoot, AG1_VENV_REL);
}

/**
 * Absolute path to the venv Python executable (platform-aware).
 * @param {string} [checkoutRoot]
 */
export function resolveAg1PythonExecutable(checkoutRoot = resolveCheckoutRoot()) {
  const venvRoot = resolveAg1VenvRoot(checkoutRoot);
  if (process.platform === "win32") {
    return join(venvRoot, "Scripts", "python.exe");
  }
  return join(venvRoot, "bin", "python");
}

/**
 * Absolute path to the JSONL bridge entry script.
 * @param {string} [checkoutRoot]
 */
export function resolveAg1BridgeScript(checkoutRoot = resolveCheckoutRoot()) {
  return join(
    checkoutRoot,
    "scripts",
    "pathcode-cli",
    "ag1",
    "python",
    "bridge_main.py",
  );
}

/**
 * @param {string} pythonPath
 * @param {string} venvRoot
 */
function isUnderVenv(pythonPath, venvRoot) {
  const absPy = resolve(pythonPath);
  const absVenv = resolve(venvRoot);
  const prefix = absVenv.endsWith(sep) ? absVenv : `${absVenv}${sep}`;
  return absPy === absVenv || absPy.startsWith(prefix);
}

/**
 * Cheap startup check: interpreter exists, is the AG1 venv interpreter,
 * and pinned google-antigravity imports. Fail closed — no global fallback.
 *
 * @param {{
 *   checkoutRoot?: string,
 *   pythonPath?: string,
 * }} [options]
 * @returns {{
 *   ok: true,
 *   pythonPath: string,
 *   venvRoot: string,
 *   prefix: string,
 *   package: string,
 * } | {
 *   ok: false,
 *   code: string,
 *   message: string,
 * }}
 */
export function assertAg1VenvReady(options = {}) {
  const checkoutRoot = options.checkoutRoot ?? resolveCheckoutRoot();
  const venvRoot = resolveAg1VenvRoot(checkoutRoot);
  const pythonPath = options.pythonPath ?? resolveAg1PythonExecutable(checkoutRoot);

  if (!existsSync(pythonPath)) {
    return {
      ok: false,
      code: "AG1_VENV_MISSING",
      message:
        `AG1 virtualenv Python not found at ${pythonPath}. ` +
        `Create it and install ${AG1_SDK_PIN} into .path-code-tmp/ag1-venv.`,
    };
  }

  if (!isUnderVenv(pythonPath, venvRoot)) {
    return {
      ok: false,
      code: "AG1_VENV_WRONG_INTERPRETER",
      message:
        `Refusing interpreter outside AG1 venv: ${pythonPath} (expected under ${venvRoot}).`,
    };
  }

  // Reject bare names that would rely on PATH activation.
  const base = pythonPath.split(/[/\\]/).pop() ?? "";
  if (base === "python" || base === "python3" || base === "py") {
    // Absolute path ending in python/python3 is fine for venv; bare relative names are not.
    if (!pythonPath.includes(sep) && !pythonPath.includes("/")) {
      return {
        ok: false,
        code: "AG1_VENV_BARE_INTERPRETER",
        message: "Refusing bare interpreter name; absolute venv python path required.",
      };
    }
  }

  const probe = spawnSync(
    pythonPath,
    [
      "-c",
      "import sys, importlib.metadata as m\n"
      + "print(sys.prefix)\n"
      + "print(m.version('google-antigravity'))\n"
      + "import google.antigravity\n"
      + "print('import-ok')\n",
    ],
    { encoding: "utf8", env: process.env },
  );

  if (probe.error) {
    return {
      ok: false,
      code: "AG1_VENV_SPAWN_FAILED",
      message: `Failed to spawn AG1 venv python: ${probe.error.message}`,
    };
  }
  if (probe.status !== 0) {
    return {
      ok: false,
      code: "AG1_VENV_IMPORT_FAILED",
      message:
        `Pinned google-antigravity import failed under ${pythonPath}. ` +
        `stderr: ${(probe.stderr || "").slice(0, 400)}`,
    };
  }

  const lines = (probe.stdout || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const prefix = lines[0] ?? "";
  const version = lines[1] ?? "";
  const importOk = lines.includes("import-ok");

  let resolvedPrefix = prefix;
  try {
    resolvedPrefix = realpathSync(prefix);
  } catch {
    // keep as-is
  }
  let resolvedVenv = venvRoot;
  try {
    resolvedVenv = realpathSync(venvRoot);
  } catch {
    // keep as-is
  }

  if (resolvedPrefix !== resolvedVenv && !resolvedPrefix.startsWith(resolvedVenv + sep)) {
    // sys.prefix should be the venv root.
    if (resolve(prefix) !== resolve(venvRoot)) {
      return {
        ok: false,
        code: "AG1_VENV_PREFIX_MISMATCH",
        message:
          `Interpreter sys.prefix ${prefix} is not the AG1 venv ${venvRoot}. ` +
          `No silent fallback to global Python.`,
      };
    }
  }

  if (!importOk) {
    return {
      ok: false,
      code: "AG1_VENV_IMPORT_FAILED",
      message: `google-antigravity did not import cleanly from ${pythonPath}.`,
    };
  }

  if (version !== "0.1.16") {
    return {
      ok: false,
      code: "AG1_SDK_VERSION_MISMATCH",
      message: `Expected google-antigravity 0.1.16, found ${version || "(unknown)"}.`,
    };
  }

  return {
    ok: true,
    pythonPath: resolve(pythonPath),
    venvRoot: resolve(venvRoot),
    prefix,
    package: `google-antigravity==${version}`,
  };
}

/**
 * @returns {string} Absolute directory of this module's package (ag1/).
 */
export function resolveAg1ModuleDir() {
  return dirname(fileURLToPath(import.meta.url));
}
