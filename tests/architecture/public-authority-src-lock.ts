/**
 * Cross-file mutex for tests that temporarily corrupt src/editing/types.ts
 * or require a clean reading of it. Vitest runs test files in parallel.
 */

import { mkdirSync, openSync, closeSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

import { architectureTestsRepoRoot } from "./public-authority-surface-analyzer.js";

const lockPath = join(
  architectureTestsRepoRoot(),
  "node_modules/.cache/path-code-pas-src.lock",
);

function sleep(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* busy wait — keep tests sync-compatible */
  }
}

export function withPublicAuthoritySrcLock<T>(fn: () => T): T {
  mkdirSync(join(architectureTestsRepoRoot(), "node_modules/.cache"), {
    recursive: true,
  });
  const deadline = Date.now() + 120_000;
  let fd: number | undefined;
  while (fd === undefined) {
    try {
      fd = openSync(lockPath, "wx");
    } catch {
      if (Date.now() > deadline) {
        throw new Error("timed out waiting for public-authority src lock");
      }
      sleep(50);
    }
  }
  try {
    return fn();
  } finally {
    closeSync(fd);
    if (existsSync(lockPath)) {
      unlinkSync(lockPath);
    }
  }
}
