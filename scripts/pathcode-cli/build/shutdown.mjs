/**
 * Bounded process/server teardown helpers for PATH Build operator shutdown.
 */

/**
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {number | null | undefined} pid
 */
export function isAlivePid(pid) {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {number | null | undefined} pid
 * @param {number} ms
 */
export async function waitPidExit(pid, ms) {
  if (!isAlivePid(pid)) return true;
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isAlivePid(pid)) return true;
    await sleep(50);
  }
  return !isAlivePid(pid);
}

/**
 * Graceful then forced termination of a PATH-owned child process.
 * Never targets the current process.
 *
 * @param {number | null | undefined} pid
 * @param {{ termMs?: number, killMs?: number }} [opts]
 */
export async function terminateOwnedPid(pid, opts = {}) {
  const termMs = opts.termMs ?? 3_000;
  const killMs = opts.killMs ?? 2_000;
  if (!isAlivePid(pid)) return { ok: true, killed: false };
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return { ok: true, killed: false };
  }
  if (await waitPidExit(pid, termMs)) return { ok: true, killed: false };
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    return { ok: false, killed: false };
  }
  const dead = await waitPidExit(pid, killMs);
  return { ok: dead, killed: true };
}

/**
 * Close an HTTP server without hanging forever on keep-alive / SSE sockets.
 *
 * @param {import('node:http').Server} server
 * @param {number} [timeoutMs]
 */
export function closeHttpServerBounded(server, timeoutMs = 2_000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try {
        if (typeof server.closeAllConnections === "function") {
          server.closeAllConnections();
        }
      } catch {
        // ignore
      }
      done();
    }, timeoutMs);
    try {
      if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
      }
      if (typeof server.closeAllConnections === "function") {
        server.closeAllConnections();
      }
    } catch {
      // ignore
    }
    try {
      server.close(() => done());
    } catch {
      done();
    }
  });
}

/**
 * Race a promise against a timeout; resolve with fallback on timeout.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {T} [fallback]
 */
export function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    sleep(ms).then(() => fallback),
  ]);
}
