/**
 * Cross-file mutex for tests that temporarily corrupt src/editing/types.ts
 * or require a clean reading of it. Vitest runs test files in parallel.
 *
 * Ownership contract
 * ------------------
 * The lock file is created by `link()` from a fully written temp file, so it
 * is never observable in a torn/empty state: if the path exists, it carries a
 * complete owner record. A waiter may reclaim the lock ONLY when the recorded
 * owner process is gone — never because the file is merely old — and release
 * unlinks ONLY a record this process still owns, so a live owner's lock is
 * never deleted.
 *
 * Waiting is performed with `Atomics.wait`, which parks the thread. The
 * previous implementation spun in a `while (Date.now() < end)` busy loop,
 * which burned a full CPU core per waiter and blocked the worker's event loop
 * for the whole wait, preventing the runner from reporting progress or firing
 * its own timers while contended.
 */

import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  linkSync,
  readFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";

import { architectureTestsRepoRoot } from "./public-authority-surface-analyzer.js";

const canonicalLockPath = join(
  architectureTestsRepoRoot(),
  "node_modules/.cache/path-code-pas-src.lock",
);

/** Complete owner record written into the lock file. */
function ownerRecord(token: string): string {
  return JSON.stringify({ pid: process.pid, token });
}

function readOwner(lockPath: string): { pid: number; token: string } | undefined {
  let raw: string;
  try {
    raw = readFileSync(lockPath, "utf8");
  } catch {
    return undefined; // lock disappeared — caller retries acquisition
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { pid?: unknown }).pid === "number" &&
      typeof (parsed as { token?: unknown }).token === "string"
    ) {
      return parsed as { pid: number; token: string };
    }
  } catch {
    /* fall through: unparseable record */
  }
  return undefined;
}

/** True when `pid` still exists. EPERM means alive but not ours to signal. */
function ownerAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Park the thread without burning CPU and without spinning the event loop. */
function parkFor(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Atomically publish our record at `lockPath`. `link` fails with EEXIST if the
 * lock is held, so the file is only ever visible fully written.
 */
function tryAcquire(lockPath: string, token: string): boolean {
  const staging = `${lockPath}.${process.pid}.${randomUUID()}`;
  writeFileSync(staging, ownerRecord(token));
  try {
    linkSync(staging, lockPath);
    return true;
  } catch {
    return false;
  } finally {
    rmSync(staging, { force: true });
  }
}

/**
 * Remove a lock whose owner is gone. The record is re-read and compared byte
 * for byte immediately before unlinking, so a lock that was released and
 * re-acquired by a new live owner in the meantime is left untouched.
 */
function reclaimIfAbandoned(lockPath: string, observed: string): void {
  let current: string;
  try {
    current = readFileSync(lockPath, "utf8");
  } catch {
    return; // already gone
  }
  if (current !== observed) {
    return; // ownership changed under us — not ours to reclaim
  }
  const owner = readOwner(lockPath);
  // An unparseable record cannot name a live owner under this format; a parsed
  // record is reclaimable only once its process has exited. Age is never used.
  if (owner !== undefined && ownerAlive(owner.pid)) {
    return;
  }
  try {
    unlinkSync(lockPath);
  } catch {
    /* lost the race to another reclaimer — fine */
  }
}

/**
 * Build a mutex bound to `lockPath`. Tests bind disposable paths so they never
 * touch the lock the real architecture suites contend on.
 */
export function createSrcLock(lockPath: string) {
  return function withLock<T>(fn: () => T): T {
    mkdirSync(dirname(lockPath), { recursive: true });
    const token = randomUUID();
    const deadline = Date.now() + 300_000;

    while (!tryAcquire(lockPath, token)) {
      if (Date.now() > deadline) {
        throw new Error("timed out waiting for public-authority src lock");
      }
      let observed: string;
      try {
        observed = readFileSync(lockPath, "utf8");
      } catch {
        continue; // released between attempts — retry immediately
      }
      reclaimIfAbandoned(lockPath, observed);
      parkFor(50);
    }

    try {
      return fn();
    } finally {
      // Release only if we are still the recorded owner.
      const owner = readOwner(lockPath);
      if (owner !== undefined && owner.token === token) {
        try {
          unlinkSync(lockPath);
        } catch {
          /* already removed */
        }
      }
    }
  };
}

export const withPublicAuthoritySrcLock = createSrcLock(canonicalLockPath);

/** Internal surface exposed solely for this lock's own regression tests. */
export const __lockTesting = {
  canonicalLockPath,
  ownerAlive,
  reclaimIfAbandoned,
} as const;
