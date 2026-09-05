# Task note — test-runner stability (branch `claude/test-stability`)

Baseline: `e4de37e90aa4bf43d1618d2fd5ab1fb0dbda40db`

## Authorized scope

Bounded test-infrastructure task authorized by the operator. It may change
evidence-supported test scheduling and lock handling. It does **not** rewrite
the historical Phase 3-R2-H2 contract and does **not** retroactively make a
failed gate pass. No `src/**` production change, no ledger change, no phase
promotion, no historical-report edit, no Phase 4 work.

## Problem

Focused suites pass while the full suite reports widespread timeouts and
unhandled worker errors; interrupted runs leave orphaned workers and a
source-lock artifact.

## Findings

1. **Busy-wait lock (primary defect).** `withPublicAuthoritySrcLock` waited on
   a `while (Date.now() < end)` spin. Four architecture test files contend on
   this mutex, and one holder can occupy it for minutes (measured: a single
   holder ran 208 s under load). Every waiter therefore burned a full CPU core
   and blocked its worker's event loop for the entire wait, so the runner could
   neither report progress nor fire its own timers in that worker.

2. **Lock carried no ownership.** The artifact was a zero-byte file created
   with `open(..., "wx")` — observed empty at runtime. It named no owner, so an
   interrupted run left a lock nothing could safely distinguish from a live
   one, and `finally` unlinked whatever sat at the path regardless of owner.

3. **Contention, not only concurrency.** With file parallelism disabled and
   `--maxWorkers=1`, two Git-fixture tests still failed at 5557 ms and 5070 ms
   against vitest's 5000 ms default. Those are contention-inflated timeouts,
   not assertion failures. `initCommitWorktree` spawns six sequential `git`
   subprocesses per fixture, so per-test cost tracks host load directly.

## Correction

Ownership-aware, non-spinning lock:

- the record is published by `link()` from a fully written temp file, so the
  lock is never observable in a torn or empty state;
- reclaim happens **only** when the recorded owner process has exited, verified
  by re-reading the exact bytes first — never on age;
- release unlinks **only** a record this process still owns.

Waiting uses `Atomics.wait`, which parks the thread instead of spinning.

Timeouts were not raised, no test was skipped or weakened, isolation stays on,
and discovery is unchanged.

## Limits

Host conditions during this task were not clean: an unrelated concurrent
workload in another project held the 8-CPU host at load ~35-41 throughout. That
inflates every measurement here and is not attributable to this repository.
