/**
 * AG1 — resolve and guard the Antigravity virtualenv Python.
 * AG3: venv lives under PATH_RUNTIME_ROOT (never inside the package tree).
 * Never fall back to global/system python/python3/py.
 */

import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
} from "../paths.mjs";

export const AG1_SDK_PIN = "google-antigravity==0.1.16";

/** @deprecated AG3 uses PATH_RUNTIME_ROOT; kept for test string checks. */
export const AG1_VENV_REL = "ag1-venv";

/**
 * @param {{
 *   packageRoot?: string,
 *   runtimeRoot?: string,
 *   checkoutRoot?: string,
 * }} [options]
 */
export function resolveAg1VenvRoot(options = {}) {
  // Backward-compat: if a string was passed historically as checkoutRoot.
  if (typeof options === "string") {
    const runtimeRoot = resolvePathRuntimeRoot({ packageRoot: options });
    return join(runtimeRoot, AG1_VENV_REL);
  }
  const packageRoot =
    options.packageRoot ??
    options.checkoutRoot ??
    resolvePathPackageRoot();
  const runtimeRoot =
    options.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot });
  return join(runtimeRoot, AG1_VENV_REL);
}

/**
 * Absolute path to the venv Python executable (platform-aware).
 * @param {string | {
 *   packageRoot?: string,
 *   runtimeRoot?: string,
 *   checkoutRoot?: string,
 * }} [optionsOrCheckout]
 */
export function resolveAg1PythonExecutable(optionsOrCheckout) {
  const options =
    typeof optionsOrCheckout === "string"
      ? { checkoutRoot: optionsOrCheckout }
      : optionsOrCheckout ?? {};
  const venvRoot = resolveAg1VenvRoot(options);
  if (process.platform === "win32") {
    return join(venvRoot, "Scripts", "python.exe");
  }
  return join(venvRoot, "bin", "python");
}

/**
 * Absolute path to the JSONL bridge entry script (package asset).
 * @param {string} [packageRoot]
 */
export function resolveAg1BridgeScript(packageRoot = resolvePathPackageRoot()) {
  return join(
    packageRoot,
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
 *   packageRoot?: string,
 *   runtimeRoot?: string,
 *   pythonPath?: string,
 * }} [options]
 */
export function assertAg1VenvReady(options = {}) {
  const packageRoot =
    options.packageRoot ??
    options.checkoutRoot ??
    resolvePathPackageRoot();
  const runtimeRoot =
    options.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot });
  const venvRoot = resolveAg1VenvRoot({ packageRoot, runtimeRoot });
  const pythonPath =
    options.pythonPath ??
    resolveAg1PythonExecutable({ packageRoot, runtimeRoot });

  if (!existsSync(pythonPath)) {
    return {
      ok: false,
      code: "AG1_VENV_MISSING",
      message:
        `PATH engine runtime not ready. ` +
        `PATH will attempt automatic repair on next startup.`,
    };
  }

  if (!isUnderVenv(pythonPath, venvRoot)) {
    return {
      ok: false,
      code: "AG1_VENV_WRONG_INTERPRETER",
      message:
        `Refusing interpreter outside PATH runtime venv: ${pythonPath}.`,
    };
  }

  const base = pythonPath.split(/[/\\]/).pop() ?? "";
  if (base === "python" || base === "python3" || base === "py") {
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
      message: `Failed to spawn PATH engine python: ${probe.error.message}`,
    };
  }
  if (probe.status !== 0) {
    return {
      ok: false,
      code: "AG1_VENV_IMPORT_FAILED",
      message:
        `PATH engine import failed. ` +
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
    if (resolve(prefix) !== resolve(venvRoot)) {
      return {
        ok: false,
        code: "AG1_VENV_PREFIX_MISMATCH",
        message:
          `Interpreter sys.prefix is not the PATH runtime venv. ` +
          `No silent fallback to global Python.`,
      };
    }
  }

  if (!importOk) {
    return {
      ok: false,
      code: "AG1_VENV_IMPORT_FAILED",
      message: `Engine package did not import cleanly.`,
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
    runtimeRoot: resolve(runtimeRoot),
    packageRoot: resolve(packageRoot),
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
