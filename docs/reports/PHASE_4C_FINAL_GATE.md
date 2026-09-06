# PATH CODE — PHASE 4C FINAL GATE

**Result:** PASS  
**Branch / worktree:** `cursor/phase4-execution-core` @ `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`  
**Starting HEAD:** `eea884fed550273c2a199d1604028f4ccadd4528`  
**Correction commit:** `8b8e41bffd78b9fd807a983e62bda231315c7ee4`  
**Final HEAD:** this evidence commit (parent `8b8e41b`)

```text
PHASE 4C FINAL GATE — CANONICAL GREEN — MAIN FF TO PHASE 4B ONLY
```

Prior failed-gate evidence remains historical in
`docs/reports/PHASE_4C_VALIDATION_COMPLETION.md` (not rewritten).

---

## 1. SIGKILL diagnosis

| Field | Value |
|---|---|
| **Classification** | **TEST_FIXTURE_DEFECT** |
| Historical assertion | `expected [ "SIGTERM" ] to include "SIGKILL"` |
| Engine behavior | Correct: SIGKILL only when termination is **not** observed after SIGTERM grace |
| Invariant preserved | `terminationRequested != terminationObserved` |

### Proven mechanism

Diagnostic reproduction (same host, process-group SIGTERM + 2s grace):

| Case | Result |
|---|---|
| Ignore handler registered; `timeoutMs=200` (idle) | SIGTERM → grace → SIGKILL |
| Handler delayed 500ms; `timeoutMs=200` | Child exits on SIGTERM; **no SIGKILL** |
| Ignore fixture; `timeoutMs` ∈ {1,10,50}ms | Child exits on SIGTERM before handler; **no SIGKILL**; empty stdout |

With `timeoutMs: 200`, suite load could deliver SIGTERM before user-land handler
registration. Default Node SIGTERM terminates the child; the engine observes
exit during grace and correctly omits SIGKILL.

**Not** an engine defect. Production `src/**` unchanged.

---

## 2. Files corrected

| Path | Change |
|---|---|
| `tests/execution/fixtures/scripts.ts` | Document readiness; write `ready` after SIGTERM ignore handler |
| `tests/execution/local-process.test.ts` | `ignoreTimeoutMs=1000`; assert ready + ignored-sigterm, ordered SIGTERM→SIGKILL, `terminationObserved`, `TIMED_OUT`, duration ≥ timeout+grace, no live pid residue |

Correction commit: `8b8e41b` — *Make SIGTERM-ignore fixture deterministic for SIGKILL escalation.*

---

## 3. Focused execution results

`tests/execution/local-process.test.ts` › `times out and escalates when SIGTERM is ignored`

| Run | Exit | Result | Notes |
|---|---|---|---|
| 1 | 0 | PASS (~3.23s) | After correction |
| 2 | 0 | PASS (~3.22s) | |
| 3 | 0 | PASS (~3.22s) | Determinism bound satisfied (≤3) |

Proof covered: timeout → SIGTERM requested → fixture alive through grace (`ignored-sigterm` + duration ≥ timeout+grace) → SIGKILL requested → `terminationObserved` separately → `TIMED_OUT` → pid gone.

---

## 4. Focused Git result

`tests/git/baseline.test.ts` › `reports an admitted untracked file as UNTRACKED`

| Field | Value |
|---|---|
| Exit | 0 |
| Duration | ~467ms (existing 5s budget) |
| Disposition | Prior canonical ~8.4s / 5s timeout treated as **wall-clock contention** under suite load; focused assertions unchanged |

---

## 5. Phase 4C prerequisite (30/30)

Together:

- `tests/validation/evidence-gaps.test.ts`
- `tests/run-evidence/run-evidence.test.ts`
- `tests/run-evidence/architecture.test.ts`

| Field | Value |
|---|---|
| Result | **30/30 PASS** |
| Exit | 0 |
| Unhandled errors | none |

Semantics unchanged.

---

## 6. Canonical `npm run check` (once)

| Field | Value |
|---|---|
| Log | `/tmp/pathcode-4c-final-gate-check.log` |
| Exit file | `/tmp/pathcode-4c-final-gate-check.exit` |
| **Actual npm exit** | **0** |
| typecheck | PASS |
| build | PASS |
| Test files | **76/76 PASS** |
| Tests | **728/728 PASS** |
| Mechanical expected | 76 files / 728 tests (reconciled; no count change) |
| Worker / unhandled errors | **zero** |
| cli:smoke | PASS |
| ledger:verify | PASS at `eea884f…` (pre-correction HEAD at gate time) |
| Vitest duration | ~173.98s |
| Wall (~full check) | ~191s |
| Scheduling | unchanged (`maxWorkers=2`, `src-lock-serial`) |

SIGTERM-ignore case in suite: **PASS** (~3232ms).  
UNTRACKED Git case in suite: **PASS** (~749ms).

---

## 7. Main integration

| Field | Value |
|---|---|
| main before | `e2831f48a425400c335619d8701823dbeb9124bf` (clean) |
| Fast-forward target | `106b3a95ab7e69a3e219da2a79559c34fe4e2d88` (Phase 4B checkpoint only) |
| main after | `106b3a95ab7e69a3e219da2a79559c34fe4e2d88` (clean; 4B files present) |
| Phase 4C into main | **not** merged |

---

## 8. Remaining honest limitations

- Extremely pathological Node spawn latency still theoretically could exceed the
  ignore-case 1000ms process timeout before handler registration; the strengthened
  assertions (`ready` / `ignored-sigterm` / ordered signals / duration) fail closed
  rather than silently omitting SIGKILL.
- Full-suite wall-clock contention can still inflate individual Git fixture costs;
  focused execution remains the discriminator vs assertion defects.
- No push, no Phase 4D, no phase promotion under this gate.
