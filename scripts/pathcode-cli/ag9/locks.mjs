/**
 * G9 — exclusive per-tool install locks (atomic mkdir lockdir).
 * S4.2 — owner.json carries pid + startKey so PID reuse cannot hold a lease.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  captureProcessIdentity,
  processMatchesIdentity,
} from "../process-identity.mjs";

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_STALE_MS = 15 * 60 * 1000;
const POLL_MS = 100;

/**
 * Sanitize tool key for filesystem lock directory name.
 * @param {string} toolKey
 */
function safeKey(toolKey) {
  return String(toolKey || "tool")
    .replace(/[^a-zA-Z0-9._@+-]+/g, "_")
    .slice(0, 120);
}

/**
 * @param {string} lockPath
 */
function tryAcquireLockDir(lockPath) {
  try {
    mkdirSync(lockPath);
    const identity = captureProcessIdentity(process.pid);
    writeFileSync(
      join(lockPath, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        startKey: identity?.startKey || "",
        ts: Date.now(),
      }),
      { encoding: "utf8" },
    );
    return true;
  } catch (err) {
    if (err && /** @type {NodeJS.ErrnoException} */ (err).code === "EEXIST") {
      return false;
    }
    throw err;
  }
}

/**
 * @param {string} lockPath
 */
function releaseLockDir(lockPath) {
  try {
    rmSync(lockPath, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

/**
 * Stale when owner pid is dead, startKey no longer matches (PID reuse),
 * or the lock exceeded staleMs.
 * @param {string} lockPath
 * @param {number} staleMs
 */
function isLockStale(lockPath, staleMs) {
  try {
    const ownerPath = join(lockPath, "owner.json");
    if (!existsSync(ownerPath)) {
      return true;
    }
    const raw = JSON.parse(readFileSync(ownerPath, "utf8"));
    const ts = typeof raw.ts === "number" ? raw.ts : 0;
    if (Date.now() - ts > staleMs) return true;
    const pid = typeof raw.pid === "number" ? raw.pid : 0;
    if (pid > 0) {
      const startKey = typeof raw.startKey === "string" ? raw.startKey : "";
      if (processMatchesIdentity(pid, startKey)) return false;
      return true;
    }
    return Date.now() - ts > staleMs;
  } catch {
    return true;
  }
}

/**
 * Run `fn` while holding an exclusive per-tool lock under `lockDir`.
 * Uses atomic mkdir (O_EXCL-equivalent) lockdir pattern.
 *
 * @template T
 * @param {string} lockDir
 * @param {string} toolKey
 * @param {() => T | Promise<T>} fn
 * @param {{ timeoutMs?: number, staleMs?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function withToolLock(lockDir, toolKey, fn, opts = {}) {
  const timeoutMs =
    typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const staleMs =
    typeof opts.staleMs === "number" && opts.staleMs > 0
      ? opts.staleMs
      : DEFAULT_STALE_MS;

  mkdirSync(lockDir, { recursive: true });
  const lockPath = join(lockDir, `${safeKey(toolKey)}.lock`);
  const started = Date.now();

  let owned = tryAcquireLockDir(lockPath);
  while (!owned) {
    if (Date.now() - started > timeoutMs) {
      throw new Error(`G9 tool lock timeout for ${toolKey} after ${timeoutMs}ms`);
    }
    if (isLockStale(lockPath, staleMs)) {
      releaseLockDir(lockPath);
      owned = tryAcquireLockDir(lockPath);
      if (owned) break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
    owned = tryAcquireLockDir(lockPath);
  }

  try {
    return await fn();
  } finally {
    releaseLockDir(lockPath);
  }
}

/** @internal test/export */
export { isLockStale, tryAcquireLockDir, releaseLockDir };
