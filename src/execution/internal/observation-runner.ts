/**
 * Process observation runner binding — host-facing ALS seam for remote
 * workspace effects without replacing the local process host default.
 *
 * When unbound, executeAuthorizedLocalProcess uses runDetachedProcess as today.
 * Bound runners must return the same observation shape; they do not own spawn.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import type {
  LocalProcessCleanupResult,
  LocalProcessOutcome,
  LocalProcessStreamCapture,
} from "../types.js";

/** Request shape aligned with ProcessHostRequest (provider-neutral). */
export type ProcessObservationRequest = {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
};

/** Observation shape aligned with ProcessHostObservation (provider-neutral). */
export type ProcessObservation = {
  readonly outcome: LocalProcessOutcome;
  readonly pid: number | null;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly overflow: boolean;
  readonly terminationRequested: boolean;
  readonly terminationObserved: boolean;
  readonly startedAtMs: number;
  readonly finishedAtMs: number;
  readonly durationMs: number;
  readonly stdout: LocalProcessStreamCapture;
  readonly stderr: LocalProcessStreamCapture;
  readonly spawnError: string | null;
  readonly cleanup: LocalProcessCleanupResult;
};

export type ProcessObservationRunner = (
  req: ProcessObservationRequest,
) => Promise<ProcessObservation>;

const storage = new AsyncLocalStorage<ProcessObservationRunner>();

/**
 * Bind a process observation runner for the duration of `fn`.
 * Nested calls replace the runner for their own stack frames.
 *
 * Async-safe: Node's `AsyncLocalStorage.run` keeps the store active while a
 * Promise returned from `fn` is pending, so `await`-ed work started inside `fn`
 * still sees `getBoundProcessObservationRunner()`. Callers must return the
 * Promise from inside `fn` (do not start the async work outside the callback).
 */
export function runWithProcessObservationRunner<T>(
  runner: ProcessObservationRunner,
  fn: () => T,
): T {
  return storage.run(runner, fn);
}

/** Returns the runner bound to the current async context, or null if unbound. */
export function getBoundProcessObservationRunner(): ProcessObservationRunner | null {
  return storage.getStore() ?? null;
}
