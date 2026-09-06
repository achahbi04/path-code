/**
 * Phase 5D1 — production monotonic clock lookup.
 * Looked up when read so Vitest fake timers can replace performance.
 */

export function readMonotonicMs(): number {
  const perf = globalThis.performance;
  if (
    perf !== undefined &&
    typeof perf === "object" &&
    typeof perf.now === "function"
  ) {
    return perf.now();
  }
  // Fallback is not used under the required fake-timer configuration.
  return Date.now();
}

export function readWallMs(): number {
  return Date.now();
}
