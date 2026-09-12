/**
 * AG3 — PATH runtime bootstrap (venv under PATH_RUNTIME_ROOT) with lock.
 */

import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import {
  resolvePathPackageRoot,
  resolvePathRuntimeRoot,
  readPathPackageVersion,
} from "../paths.mjs";
import { AG1_SDK_PIN } from "./venv-guard.mjs";

const LOCK_NAME = "bootstrap.lock";
const MARKER_NAME = "runtime.marker.json";
const STALE_LOCK_MS = 15 * 60 * 1000;
const WAIT_MS = 120_000;
const POLL_MS = 250;

/**
 * @param {string} runtimeRoot
 */
export function resolveRuntimeVenvRoot(runtimeRoot) {
  return join(runtimeRoot, "ag1-venv");
}

/**
 * True when the venv interpreter can run pip (incomplete interrupted bootstraps fail this).
 * @param {string} pythonBin
 */
export function isVenvPipReady(pythonBin) {
  if (!existsSync(pythonBin)) return false;
  const probe = spawnSync(pythonBin, ["-m", "pip", "--version"], {
    encoding: "utf8",
    env: process.env,
    timeout: 20_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return probe.status === 0;
}

/**
 * @param {string} runtimeRoot
 */
export function resolveRuntimeMarkerPath(runtimeRoot) {
  return join(runtimeRoot, MARKER_NAME);
}

/**
 * @param {string} runtimeRoot
 * @param {string} packageRoot
 */
function expectedMarker(runtimeRoot, packageRoot) {
  return {
    pathVersion: readPathPackageVersion(packageRoot),
    sdkPin: AG1_SDK_PIN,
    venv: resolveRuntimeVenvRoot(runtimeRoot),
  };
}

/**
 * @param {string} runtimeRoot
 * @param {string} packageRoot
 */
export function isRuntimeMarkerHealthy(runtimeRoot, packageRoot) {
  const markerPath = resolveRuntimeMarkerPath(runtimeRoot);
  if (!existsSync(markerPath)) return false;
  try {
    const raw = JSON.parse(readFileSync(markerPath, "utf8"));
    const expected = expectedMarker(runtimeRoot, packageRoot);
    return (
      raw &&
      raw.pathVersion === expected.pathVersion &&
      raw.sdkPin === expected.sdkPin
    );
  } catch {
    return false;
  }
}

/**
 * @param {string} lockPath
 */
function tryAcquireLock(lockPath) {
  try {
    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, ts: Date.now() }),
      { flag: "wx" },
    );
    return true;
  } catch (err) {
    if (err && /** @type {any} */ (err).code === "EEXIST") return false;
    throw err;
  }
}

/**
 * @param {string} lockPath
 */
function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {
    // ignore
  }
}

/**
 * @param {string} lockPath
 */
function isLockStale(lockPath) {
  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8"));
    const ts = typeof raw.ts === "number" ? raw.ts : 0;
    if (Date.now() - ts > STALE_LOCK_MS) return true;
    const pid = typeof raw.pid === "number" ? raw.pid : 0;
    if (pid > 0) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true; // process gone
      }
    }
    return Date.now() - ts > STALE_LOCK_MS;
  } catch {
    return true;
  }
}

/**
 * Create/repair the Antigravity venv under PATH_RUNTIME_ROOT.
 *
 * @param {{
 *   packageRoot?: string,
 *   runtimeRoot?: string,
 *   force?: boolean,
 * }} [opts]
 */
export async function ensureAg1Runtime(opts = {}) {
  const packageRoot = opts.packageRoot ?? resolvePathPackageRoot();
  const runtimeRoot = opts.runtimeRoot ?? resolvePathRuntimeRoot({ packageRoot });
  mkdirSync(runtimeRoot, { recursive: true });

  const venvRoot = resolveRuntimeVenvRoot(runtimeRoot);
  const lockPath = join(runtimeRoot, LOCK_NAME);
  const req = join(
    packageRoot,
    "scripts",
    "pathcode-cli",
    "ag1",
    "python",
    "requirements.txt",
  );
  const pythonBin =
    process.platform === "win32"
      ? join(venvRoot, "Scripts", "python.exe")
      : join(venvRoot, "bin", "python");

  const healthy =
    !opts.force &&
    isVenvPipReady(pythonBin) &&
    isRuntimeMarkerHealthy(runtimeRoot, packageRoot);

  if (healthy) {
    // Still verify import quickly via assert later; marker is enough to skip bootstrap.
    return {
      ok: true,
      skipped: true,
      runtimeRoot,
      venvRoot,
      pythonPath: resolve(pythonBin),
    };
  }

  const started = Date.now();
  let owned = tryAcquireLock(lockPath);
  while (!owned) {
    if (isLockStale(lockPath)) {
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
      owned = tryAcquireLock(lockPath);
      if (owned) break;
    }
    if (Date.now() - started > WAIT_MS) {
      return {
        ok: false,
        code: "RUNTIME_BOOTSTRAP_TIMEOUT",
        message:
          "PATH runtime bootstrap is taking too long. Another PATH process may be stuck preparing the engine.",
      };
    }
    await delay(POLL_MS);
    if (
      existsSync(pythonBin) &&
      isVenvPipReady(pythonBin) &&
      isRuntimeMarkerHealthy(runtimeRoot, packageRoot)
    ) {
      return {
        ok: true,
        skipped: true,
        waited: true,
        runtimeRoot,
        venvRoot,
        pythonPath: resolve(pythonBin),
      };
    }
    owned = tryAcquireLock(lockPath);
  }

  try {
    // Re-check under lock.
    if (
      !opts.force &&
      isVenvPipReady(pythonBin) &&
      isRuntimeMarkerHealthy(runtimeRoot, packageRoot)
    ) {
      return {
        ok: true,
        skipped: true,
        runtimeRoot,
        venvRoot,
        pythonPath: resolve(pythonBin),
      };
    }

    // Interrupted first-run can leave a python binary without pip — rebuild.
    if (
      existsSync(venvRoot) &&
      (opts.force || (existsSync(pythonBin) && !isVenvPipReady(pythonBin)))
    ) {
      rmSync(venvRoot, { recursive: true, force: true });
    }

    if (!existsSync(pythonBin)) {
      const create = spawnSync("python3", ["-m", "venv", venvRoot], {
        encoding: "utf8",
        env: process.env,
      });
      if (create.status !== 0) {
        return {
          ok: false,
          code: "RUNTIME_VENV_CREATE_FAILED",
          message: (create.stderr || create.stdout || "venv create failed").slice(
            0,
            400,
          ),
        };
      }
    }

    const pipUpgrade = spawnSync(
      pythonBin,
      ["-m", "pip", "install", "--upgrade", "pip"],
      { encoding: "utf8", env: process.env },
    );
    if (pipUpgrade.status !== 0) {
      // One automatic rebuild if pip is still missing after create.
      try {
        rmSync(venvRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
      const recreate = spawnSync("python3", ["-m", "venv", venvRoot], {
        encoding: "utf8",
        env: process.env,
      });
      if (recreate.status !== 0) {
        return {
          ok: false,
          code: "RUNTIME_PIP_FAILED",
          message: (pipUpgrade.stderr || "pip upgrade failed").slice(0, 400),
        };
      }
      const pipRetry = spawnSync(
        pythonBin,
        ["-m", "pip", "install", "--upgrade", "pip"],
        { encoding: "utf8", env: process.env },
      );
      if (pipRetry.status !== 0) {
        return {
          ok: false,
          code: "RUNTIME_PIP_FAILED",
          message: (pipRetry.stderr || "pip upgrade failed").slice(0, 400),
        };
      }
    }
    const pipInstall = spawnSync(
      pythonBin,
      ["-m", "pip", "install", "-r", req],
      { encoding: "utf8", env: process.env },
    );
    if (pipInstall.status !== 0) {
      return {
        ok: false,
        code: "RUNTIME_PIP_FAILED",
        message: (pipInstall.stderr || "pip install failed").slice(0, 400),
      };
    }

    const marker = expectedMarker(runtimeRoot, packageRoot);
    const tmp = `${resolveRuntimeMarkerPath(runtimeRoot)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    renameSync(tmp, resolveRuntimeMarkerPath(runtimeRoot));

    return {
      ok: true,
      skipped: false,
      runtimeRoot,
      venvRoot,
      pythonPath: resolve(pythonBin),
    };
  } finally {
    releaseLock(lockPath);
  }
}
