# PATH CODE — PHASE 4 EXECUTION MASTER

**Status:** Implementation Master for first Phase 4 execution capability  
**Baseline HEAD:** `c23f08feb848c576bbfb5ffc352824bf7d1ee0af`  
**Engineering base:** `fbd22f3d7d246aa4b7234d2524b884cc7fe36e97`  
**Reviewed design input:** `docs/drafts/PHASE_4_EXECUTION_CORE_PROPOSAL.md`  
**ActionClass amendment:** `docs/passes/PHASE_4_ACTION_CLASS_AMENDMENT_1.md`

```text
DRAFT MASTER FOR IMPLEMENTATION — NOT PHASE PROMOTION — NOT PHASE_VERIFIED
```

This Master freezes the first real Phase 4 production capability:

```text
NON-INTERACTIVE
EXPLICITLY AUTHORIZED
LOCAL PROCESS EXECUTION
```

It does **not**:

- reopen Phase 3;
- implement Reasoning Ledger / EngineeringRunEvidenceManifest;
- implement Gemini orchestration;
- claim Phase 4 complete or PHASE_VERIFIED;
- claim sandboxing, Windows support, model integration, or autonomous loops.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Row | Concept | Result | Notes |
|---|---|---|---|
| A | WorkspaceBoundary / CanonicalPath for cwd | `MAPS_TO_EXISTING` | Reuse `canonicalize`; refuse outside workspace |
| B | Explicit approval outside model authority | `MAPS_TO_EXISTING` (pattern) | New execution-specific approval/auth types required |
| C | Single-use opaque authorization | `MAPS_TO_EXISTING` (mechanism/pattern) | WeakMap registry pattern from editing; new brands |
| D | EXIT_CODE / STDOUT / STDERR evidence kinds | `MAPS_TO_EXISTING` | Already in `src/domain/evidence.ts` |
| E | Truthful Result / failure representation | `MAPS_TO_EXISTING` | `src/domain/result.ts` |
| F | Process execution disable-action vocabulary | `AMENDMENT_REQUIRED` | Additive token `EXECUTE_PROCESS` — see ActionClass Amendment 1 |
| G | Child-process isolation / sandbox | `NOT_APPLICABLE` | Explicit non-goal for V1 |
| H | Package-public execution authority surface | `NOT_APPLICABLE` | V1 remains internal; not exported from package root |

**Preflight decision:** proceed after freezing `EXECUTE_PROCESS` amendment and implementing direct consumers. No `BLOCKING_GAP`.

---

## Scope

### In scope

- macOS / Linux
- absolute executable + argv (`shell: false`)
- workspace-bound cwd
- explicit env snapshot (no wholesale `process.env`)
- prepare → authorize → execute lifecycle
- finite timeout (default 120s, ceiling 30m)
- stdout/stderr capture with overflow termination + continued drain
- POSIX process-group termination escalation
- truthful `LocalProcessResult` suitable for later ledger citation

### Out of scope

- Windows (refuse before spawn)
- shell strings / PTY / interactive stdin
- remote / browser / database / deployment
- provider/model APIs / autonomous loop
- untrusted-code sandbox product
- Reasoning Ledger Claim types

### Mandatory honesty

- `shell: false` is **not** a sandbox
- workspace cwd is **not** a sandbox
- authorized children may read/write/spawn/network under OS permissions
- Phase 3 write boundary does **not** constrain child side effects
- exit code 0 is process evidence only — not semantic engineering success

---

## Public / package boundary

V1 execution is **internal to Path Code**.

Do **not** export from `src/index.ts` / package root:

- approval mint
- authorization mint
- executor
- process host / spawn helper
- DI process operations

No package execution subpath.

Trusted future CLI/orchestrator may import `src/execution/**` internally.

---

## Module map

```text
src/execution/
  types.ts
  bounds.ts
  preparation.ts
  authorization.ts
  policy.ts
  environment.ts
  execute.ts
  evidence.ts
  index.ts
  internal/
    registry.ts
    consume-authorization.ts
    process-host.ts   ← sole node:child_process owner in this area
```

`src/git/runner.ts` remains Git-only.

---

## Timeout / output / argv / env bounds

| Constant | Value |
|---|---|
| `DEFAULT_LOCAL_PROCESS_TIMEOUT_MS` | `120_000` |
| `MAX_LOCAL_PROCESS_TIMEOUT_MS` | `1_800_000` |
| `LOCAL_PROCESS_TERMINATION_GRACE_MS` | `2_000` |
| `LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS` | `5_000` |
| `MAX_LOCAL_PROCESS_ARGV_COUNT` | `256` |
| `MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES` | `65_536` |
| `MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES` | `65_536` |
| `MAX_LOCAL_PROCESS_STDOUT_BYTES` | `16_777_216` |
| `MAX_LOCAL_PROCESS_STDERR_BYTES` | `16_777_216` |

Request timeout may be `1 .. MAX_LOCAL_PROCESS_TIMEOUT_MS`. Values above the default are **not** clamped down to 120s.

Overflow: terminate + continue draining; classify distinctly from ordinary timeout.

---

## ActionClass

`EXECUTE_PROCESS` — see `PHASE_4_ACTION_CLASS_AMENDMENT_1.md`.

---

## Open limitations (honest)

- OS TOCTOU remains between final executable observation and exec
- Windows unsupported in V1
- No sandbox / isolation product
- Descendant survival may yield `TERMINATION_NOT_CONFIRMED` / incomplete capture
- Constitution §10 full closed-vocabulary audit remains a separate roadmap item; this Master carries the required capability preflight only
