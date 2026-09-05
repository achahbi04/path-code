import { defineConfig } from "vitest/config";

/**
 * The public-authority suites temporarily corrupt src/editing/types.ts and
 * coordinate through a cross-process file mutex. Waiting on that mutex is
 * synchronous, so a worker that waits cannot service Vitest RPC — which
 * surfaced as `[vitest-worker]: Timeout calling "onTaskUpdate"`.
 *
 * These files are therefore confined to a single fork, where Vitest runs test
 * files one after another. No two lock owners can be in flight at once, so the
 * contended branch of the mutex is never reached and no worker ever blocks on
 * it. The lock itself is retained unchanged as the correctness guarantee for
 * any other execution order.
 */
const SRC_LOCK_OWNING_SUITES = [
  "tests/architecture/public-authority-surface.test.ts",
  "tests/architecture/public-authority-surface-h1.test.ts",
  "tests/architecture/public-authority-surface-h2.test.ts",
  "tests/architecture/public-authority-surface-derived.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "src-lock-serial",
          include: SRC_LOCK_OWNING_SUITES,
          // One fork, files run sequentially: no cross-worker lock contention.
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
        },
      },
      {
        test: {
          name: "default",
          include: ["tests/**/*.test.ts"],
          exclude: ["**/node_modules/**", ...SRC_LOCK_OWNING_SUITES],
        },
      },
    ],
  },
});
