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
 * A separate serial project was not enough. With two projects, Vitest still
 * kept a second fork. The first cold check of 8e4fd1f finished every
 * assertion (1575 passed) and then died on that RPC timeout after the H2
 * file, so three files never reported. One project and one fork removes
 * that second waiter. Assertions and the discovery set stay the same.
 *
 * Many suites also build disposable Git worktrees. The default of one worker
 * per CPU can keep several of those files in flight at once and starve the
 * same RPC. One root worker and fileParallelism: false keep the suite serial.
 */
const ROOT_MAX_WORKERS = 1;

export default defineConfig({
  test: {
    maxWorkers: ROOT_MAX_WORKERS,
    fileParallelism: false,
    testTimeout: 20_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    projects: [
      {
        test: {
          name: "default",
          include: ["tests/**/*.test.ts"],
          exclude: ["**/node_modules/**"],
          pool: "forks",
          poolOptions: { forks: { singleFork: true } },
          testTimeout: 20_000,
        },
      },
    ],
  },
});
