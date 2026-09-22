import { defineConfig } from "vitest/config";

/**
 * The public-authority suites temporarily corrupt src/editing/types.ts and
 * coordinate through a cross-process file mutex. Waiting on that mutex is
 * synchronous, so a worker that waits cannot service Vitest RPC — which
 * surfaces as `[vitest-worker]: Timeout calling "onTaskUpdate"`.
 *
 * The owning files are public-authority-surface, -h1, -h2, and -derived.
 * The lock itself stays unchanged as the correctness guarantee for any other
 * execution order.
 *
 * One file at a time (`maxWorkers: 1`, `fileParallelism: false`) means the
 * contended mutex branch is never taken. Isolation stays on.
 *
 * `singleFork: true` is not used. It disables isolation. The cold check of
 * 4b0d18d then leaked fake timers and 26 tests hung on their own deadlines.
 * A second project fork is not used either. The cold check of 8e4fd1f
 * finished every assertion and then lost worker RPC after the H2 file.
 */
const ROOT_MAX_WORKERS = 1;

export default defineConfig({
  test: {
    maxWorkers: ROOT_MAX_WORKERS,
    fileParallelism: false,
    testTimeout: 20_000,
    pool: "forks",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
