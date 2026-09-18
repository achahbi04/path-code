/**
 * S4.2 — Host process identity helpers.
 *
 * PIDs alone are not durable ownership: the OS can reuse a pid after the
 * original PATH-owned process exits. Pair pid with a start-time key when
 * reclaiming leases or deciding whether a registry row is still alive.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/**
 * @param {number | null | undefined} pid
 * @returns {boolean}
 */
export function isPidAlive(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stable-ish start identity for a live pid (platform best-effort).
 * Empty string when unknown / dead.
 *
 * @param {number | null | undefined} pid
 * @returns {string}
 */
export function readProcessStartKey(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return "";
  if (!isPidAlive(pid)) return "";
  try {
    if (process.platform === "linux") {
      const path = `/proc/${pid}/stat`;
      if (!existsSync(path)) return "";
      const stat = readFileSync(path, "utf8");
      const closeParen = stat.lastIndexOf(")");
      const rest = closeParen >= 0 ? stat.slice(closeParen + 2).split(" ") : [];
      // field 22 (0-based index 19 after comm) is starttime ticks
      const starttime = rest[19] || "";
      return starttime ? `linux:${pid}:${starttime}` : "";
    }
    // Darwin / BSD: lstart is unique enough for reclaim within a boot.
    const psBin = existsSync("/bin/ps") ? "/bin/ps" : "ps";
    const r = spawnSync(psBin, ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      timeout: 2_000,
    });
    if (r.status === 0) {
      const lstart = String(r.stdout || "").trim();
      if (lstart) return `ps:${pid}:${lstart}`;
    }
    // Sandbox / restricted hosts may block `ps`. Fall back to etime when possible.
    const r2 = spawnSync(psBin, ["-p", String(pid), "-o", "etime="], {
      encoding: "utf8",
      timeout: 2_000,
    });
    if (r2.status === 0) {
      const etime = String(r2.stdout || "").trim();
      if (etime) return `etime:${pid}:${etime}`;
    }
    // Last resort: pid-scoped key — identity checks degrade to liveness-only
    // when startKey is empty; prefer a non-empty marker for lock owners.
    return `pid:${pid}`;
  } catch {
    return "";
  }
}

/**
 * True when the live process at `pid` still matches the recorded start key.
 * If startKey was never recorded, fall back to pid-liveness only (legacy locks).
 *
 * @param {number | null | undefined} pid
 * @param {string | null | undefined} startKey
 * @returns {boolean}
 */
export function processMatchesIdentity(pid, startKey) {
  if (!isPidAlive(pid)) return false;
  const expected = typeof startKey === "string" ? startKey.trim() : "";
  if (!expected) return true;
  const live = readProcessStartKey(pid);
  if (!live) return false;
  // Weak keys (`pid:N`) only prove the pid slot is occupied — treat mismatch
  // of a stronger expected key as stale (possible reuse).
  if (expected.startsWith("pid:") && live.startsWith("pid:")) {
    return expected === live;
  }
  if (live.startsWith("pid:") && !expected.startsWith("pid:")) {
    // Could not re-read strong identity; do not kill/reclaim as "still ours".
    return false;
  }
  return live === expected;
}

/**
 * @param {number | null | undefined} pid
 * @returns {{ pid: number, startKey: string, capturedAt: string } | null}
 */
export function captureProcessIdentity(pid) {
  if (typeof pid !== "number" || !Number.isFinite(pid) || pid <= 0) return null;
  if (!isPidAlive(pid)) return null;
  return {
    pid,
    startKey: readProcessStartKey(pid),
    capturedAt: new Date().toISOString(),
  };
}
