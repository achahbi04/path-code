/**
 * G10 — runtime guards: idempotency, no-progress breaker, budgets, stale intel,
 * external-action identity.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureAg9RuntimeDirs } from "../ag9/layout.mjs";

/**
 * Event idempotency — prevent duplicate side effects / evidence from replay.
 */
export class EventIdempotencyGuard {
  /**
   * @param {{ maxIds?: number }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Set<string>} */
    this.seen = new Set();
    this.maxIds = typeof opts.maxIds === "number" ? opts.maxIds : 4_000;
    /** @type {string[]} */
    this.order = [];
  }

  /**
   * @param {string} eventId
   * @returns {boolean} true if this is the first time seeing the id
   */
  accept(eventId) {
    const id = String(eventId || "");
    if (!id) return true;
    if (this.seen.has(id)) return false;
    this.seen.add(id);
    this.order.push(id);
    while (this.order.length > this.maxIds) {
      const old = this.order.shift();
      if (old) this.seen.delete(old);
    }
    return true;
  }
}

/**
 * No-progress collaboration circuit breaker.
 * Warn after 2 consecutive no-progress handoffs; stop auto bounce after 3.
 * Productive collaboration may exceed three turns.
 */
export class NoProgressCircuitBreaker {
  constructor() {
    this.consecutiveNoProgress = 0;
    this.totalHandoffs = 0;
    this.warned = false;
    /** @type {'ok'|'warn'|'stop'} */
    this.state = "ok";
  }

  /**
   * @param {{ productive: boolean }} input
   */
  recordHandoff(input) {
    this.totalHandoffs += 1;
    if (input.productive) {
      this.consecutiveNoProgress = 0;
      this.warned = false;
      this.state = "ok";
      return { state: this.state, consecutiveNoProgress: 0, action: "continue" };
    }
    this.consecutiveNoProgress += 1;
    if (this.consecutiveNoProgress >= 3) {
      this.state = "stop";
      return {
        state: this.state,
        consecutiveNoProgress: this.consecutiveNoProgress,
        action: "stop_auto_bounce",
        code: "NO_PROGRESS_COLLABORATION",
      };
    }
    if (this.consecutiveNoProgress >= 2) {
      this.state = "warn";
      this.warned = true;
      return {
        state: this.state,
        consecutiveNoProgress: this.consecutiveNoProgress,
        action: "warn",
        code: "NO_PROGRESS_WARN",
      };
    }
    this.state = "ok";
    return {
      state: this.state,
      consecutiveNoProgress: this.consecutiveNoProgress,
      action: "continue",
    };
  }

  reset() {
    this.consecutiveNoProgress = 0;
    this.warned = false;
    this.state = "ok";
  }
}

/**
 * Resource / cost circuit breaker. Does not fabricate unavailable metrics.
 */
export class ResourceCircuitBreaker {
  /**
   * @param {{
   *   timeCeilingMs?: number,
   *   maxHandoffs?: number,
   *   warnRatio?: number,
   * }} [limits]
   */
  constructor(limits = {}) {
    this.startedAt = Date.now();
    this.timeCeilingMs =
      typeof limits.timeCeilingMs === "number" && limits.timeCeilingMs > 0
        ? limits.timeCeilingMs
        : null;
    this.maxHandoffs =
      typeof limits.maxHandoffs === "number" && limits.maxHandoffs > 0
        ? limits.maxHandoffs
        : null;
    this.warnRatio =
      typeof limits.warnRatio === "number" ? limits.warnRatio : 0.8;
    this.handoffs = 0;
    /** @type {Record<string, number>} */
    this.usage = {};
  }

  /** @param {string} key @param {number} amount */
  addUsage(key, amount) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
      return;
    }
    this.usage[key] = (this.usage[key] || 0) + amount;
  }

  recordHandoff() {
    this.handoffs += 1;
  }

  /**
   * @returns {{
   *   state: 'ok'|'warn'|'hard',
   *   elapsedMs: number,
   *   reason?: string,
   *   metrics: object,
   * }}
   */
  evaluate() {
    const elapsedMs = Date.now() - this.startedAt;
    const metrics = {
      elapsedMs,
      handoffs: this.handoffs,
      usage: { ...this.usage },
      timeCeilingMs: this.timeCeilingMs,
      maxHandoffs: this.maxHandoffs,
    };
    if (this.timeCeilingMs != null && elapsedMs >= this.timeCeilingMs) {
      return {
        state: "hard",
        elapsedMs,
        reason: "TASK_TIME_CEILING",
        metrics,
      };
    }
    if (this.maxHandoffs != null && this.handoffs >= this.maxHandoffs) {
      return {
        state: "hard",
        elapsedMs,
        reason: "HANDOFF_CEILING",
        metrics,
      };
    }
    if (
      this.timeCeilingMs != null &&
      elapsedMs >= this.timeCeilingMs * this.warnRatio
    ) {
      return {
        state: "warn",
        elapsedMs,
        reason: "TASK_TIME_WARN",
        metrics,
      };
    }
    return { state: "ok", elapsedMs, metrics };
  }
}

/**
 * Background / SCIP / LSP result must match current fingerprint.
 */
export class StaleIntelligenceGuard {
  /**
   * @param {{ fingerprint: string, kind: string, result: unknown }} recorded
   * @param {string} currentFingerprint
   */
  static classify(recorded, currentFingerprint) {
    const source = String(recorded?.fingerprint || "");
    const current = String(currentFingerprint || "");
    if (!source || !current) {
      return { ok: false, status: "unknown", reason: "missing_fingerprint" };
    }
    if (source !== current) {
      return { ok: false, status: "STALE", reason: "fingerprint_mismatch" };
    }
    return { ok: true, status: "current", reason: "match" };
  }
}

/**
 * External action idempotency registry (push/PR/deploy boundaries).
 */
export class ExternalActionRegistry {
  /**
   * @param {string} runtimeRoot
   * @param {string} taskId
   */
  constructor(runtimeRoot, taskId) {
    const dirs = ensureAg9RuntimeDirs(runtimeRoot);
    const safe = String(taskId || "task")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .slice(0, 80);
    this.path = join(dirs.metadata, `external-actions-${safe}.json`);
    /** @type {Record<string, { id: string, kind: string, status: string, at: string, result?: unknown }>} */
    this.map = {};
    this.#load();
  }

  #load() {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8"));
      if (raw && typeof raw === "object" && raw.actions) {
        this.map = raw.actions;
      }
    } catch {
      this.map = {};
    }
  }

  #save() {
    mkdirSync(join(this.path, ".."), { recursive: true });
    writeFileSync(
      this.path,
      `${JSON.stringify({ actions: this.map }, null, 2)}\n`,
      "utf8",
    );
  }

  /**
   * Stable identity for an external action.
   * @param {string} kind
   * @param {string} keyMaterial
   */
  static actionId(kind, keyMaterial) {
    return `${kind}:${createHash("sha256").update(String(keyMaterial)).digest("hex").slice(0, 20)}`;
  }

  /**
   * @param {string} id
   * @returns {{ exists: boolean, status?: string, entry?: object }}
   */
  lookup(id) {
    const e = this.map[id];
    if (!e) return { exists: false };
    return { exists: true, status: e.status, entry: e };
  }

  /**
   * @param {{ id: string, kind: string, status: string, result?: unknown }} entry
   */
  record(entry) {
    this.map[entry.id] = {
      id: entry.id,
      kind: entry.kind,
      status: entry.status,
      at: new Date().toISOString(),
      ...(entry.result !== undefined ? { result: entry.result } : {}),
    };
    this.#save();
  }

  /**
   * Begin an external action only if not already completed.
   * @param {{ id: string, kind: string }} input
   * @returns {{ proceed: boolean, reason?: string, entry?: object }}
   */
  begin(input) {
    const existing = this.lookup(input.id);
    if (existing.exists && existing.status === "completed") {
      return {
        proceed: false,
        reason: "already_completed",
        entry: existing.entry,
      };
    }
    if (existing.exists && existing.status === "in_progress") {
      return {
        proceed: false,
        reason: "in_progress_reconcile_required",
        entry: existing.entry,
      };
    }
    this.record({ id: input.id, kind: input.kind, status: "in_progress" });
    return { proceed: true };
  }
}

/**
 * Mutation lease wrapper that refreshes Git reality before mutate.
 * Builds on G9 withCollabTurn.
 *
 * @param {{
 *   withCollabTurn: Function,
 *   captureTaskReality: Function,
 *   runtimeRoot: string,
 *   taskId: string,
 *   engine: 'antigravity'|'copilot',
 *   worktreePath: string,
 *   timeoutMs?: number,
 *   expectedFingerprint?: string,
 * }} input
 * @param {(ctx: { reality: object, leaseEngine: string }) => Promise<object>|object} mutateFn
 */
export async function withMutationLease(input, mutateFn) {
  const before = input.captureTaskReality(input.worktreePath);
  if (
    typeof input.expectedFingerprint === "string" &&
    input.expectedFingerprint &&
    before.diffFingerprint !== input.expectedFingerprint
  ) {
    return {
      ok: false,
      code: "STALE_WRITE_REJECTED",
      detail: "worktree changed before mutation lease; refresh required",
      reality: before,
    };
  }
  return input.withCollabTurn(
    {
      runtimeRoot: input.runtimeRoot,
      taskId: input.taskId,
      engine: input.engine,
      timeoutMs: input.timeoutMs,
    },
    async () => {
      const refreshed = input.captureTaskReality(input.worktreePath);
      if (
        typeof input.expectedFingerprint === "string" &&
        input.expectedFingerprint &&
        refreshed.diffFingerprint !== input.expectedFingerprint
      ) {
        return {
          ok: false,
          code: "STALE_WRITE_REJECTED",
          detail: "stale write rejected after lease acquire",
          reality: refreshed,
          changedFiles: refreshed.changedFiles,
        };
      }
      const result = await mutateFn({
        reality: refreshed,
        leaseEngine: input.engine,
      });
      const after = input.captureTaskReality(input.worktreePath);
      return {
        ...(result && typeof result === "object" ? result : { detail: String(result) }),
        realityBefore: refreshed,
        realityAfter: after,
        changedFiles:
          result && typeof result === "object" && Array.isArray(result.changedFiles)
            ? result.changedFiles
            : after.changedFiles,
      };
    },
  );
}
