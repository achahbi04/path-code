# PATH CODE — PHASE 4C VALIDATION COMPLETION SUPPLEMENT

**Status:** FAIL — one newly authorized canonical attempt; no further retries  
**Candidate HEAD (unchanged):** `d5e6bd405f12d9a66b0f4c2ca15484d68f10cfaa`  
**Branch / worktree:** `cursor/phase4-execution-core` @ `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`  
**main:** `e2831f48a425400c335619d8701823dbeb9124bf` (unchanged)

```text
VALIDATION CONTINUATION — IMPLEMENTATION PRESERVED — NOT PHASE_VERIFIED
```

This supplement does **not** rewrite `PHASE_4C_RUN_EVIDENCE_IMPLEMENTATION_REPORT.md`.  
Source, tests (except this evidence file), scheduling, and ledgers were not modified in this continuation.

---

## 1. Starting state

| Check | Result |
|---|---|
| HEAD | `d5e6bd4…` as required |
| Branch / worktree | match; clean; no merge/rebase |
| Four Phase 4C commits | preserved (`f8e08d3`, `8b55142`, `cd6577e`, `d5e6bd4`) |
| main | `e2831f4…` clean |

### Post–attempt-2 commit (`d5e6bd4`) diff

Only:

1. added `docs/reports/PHASE_4C_RUN_EVIDENCE_IMPLEMENTATION_REPORT.md`;
2. changed `tests/validation/evidence-gaps.test.ts` closing of  
   `runs all four kinds preserving order and argv` from `});` → `}, 15_000);`.

All four-kind assertions (TYPECHECK/LINT/BUILD/TARGETED_TEST order, PASS×4, argv `typecheck`/`test`) remain.  
Local 15s wall budget: four sequential real process checks under shared machine load exceeded the default 5s in historical attempt 2 (observed ~5.4s timeout). Focused re-run here: **1874ms**.

Earlier focused greens do **not** validate these post-attempt-2 bytes by themselves; this continuation re-ran them.

---

## 2. Historical failure inventory (attempts 1–2)

### Attempt 1 — sandbox (`/tmp/pathcode-4c-check.log`)

| Item | Evidence |
|---|---|
| Reported totals | 14 failed / 59 passed files (76); 59 failed / 650 passed tests (709); 1 unhandled error |
| Dominant class | **permission/setup**: `fixture git … init failed: GIT_DISCOVERY_FAILED` across Git-using suites |
| Timeouts | e.g. ledger relink / phase3-reaudit / selfobs (60s–120s) |
| Assertion | `local-process` SIGTERM-ignore: `expected [ 'SIGTERM' ] to include 'SIGKILL'` |
| Worker | `[vitest-worker]: Timeout calling "onTaskUpdate"` |
| Incomplete | smoke/ledger stages not reached after test failure |
| **Actual npm exit** | **unavailable** in saved log (command used `tee` without `pipefail`; wrapper printed `EXIT:0` from tee). Do not treat wrapper exit as npm’s. |

### Attempt 2 — unsandboxed (`/tmp/pathcode-4c-check2.log`)

| Item | Evidence |
|---|---|
| Reported totals | 6 failed / 66 passed files (72); 7 failed / 690 passed tests (697); 1 worker error |
| Actual npm exit | **1** (`EXIT:1` with `pipefail`) |
| Class | **timeouts** under load (5s–120s), including owned four-kinds at default 5s; plus worker RPC timeout |
| Incomplete | **72/76 files**, **697≠728** — `src-lock-serial` (31 tests / 4 files) absent from report; smoke/ledger not reached |

These outcomes are historical and unchanged by this continuation.

---

## 3. Environment fixture probe (this continuation)

Same `runGit` path as `tests/git/fixture-helpers.ts` / `initCommitWorktree`, disposable temp dir, operator-approved unsandboxed context:

| Step | args (no secrets) | ok |
|---|---|---|
| init | `["-c","init.templateDir=","init"]` | true |
| config.email/name/gpgsign | config keys only | true |
| add / commit | add README; commit `--no-gpg-sign` | true |

Probe exit **0**; directory cleaned. No competing vitest/`npm run check` processes; no task-owned lock files found.

---

## 4. Complete discovery reconciliation

Command: `./node_modules/.bin/vitest list --json` → `/tmp/pathcode-4c-vitest-list.json`  
**LIST_EXIT=0**, stderr empty.

| Project | Tests |
|---|---|
| default | 697 |
| src-lock-serial | 31 |
| **Total** | **728 tests / 76 files** |

| Reference | Value |
|---|---|
| Historical baseline at `106b3a9` | **698** tests |
| Added `it(...)` in new files since checkpoint | **30** (`evidence-gaps` 15 + `run-evidence` 11 + `run-evidence/architecture` 4) |
| phase2-architecture-audit | modified assertions only; no new test titles |
| **698 + 30** | **728** (= collected) |

Partial run summaries **709** / **697** are **not** baselines (incomplete reporting / omitted serial project).

---

## 5. Focused prerequisite (current candidate)

`./node_modules/.bin/vitest run` on:

- `tests/validation/evidence-gaps.test.ts`
- `tests/run-evidence/run-evidence.test.ts`
- `tests/run-evidence/architecture.test.ts`

| Result | Value |
|---|---|
| Exit | **0** |
| Totals | **3 files / 30 tests passed** |
| Unhandled errors | none |
| Four-kinds | PASS in **1874ms** (15s budget unchanged) |
| Residue | no leftover matching fixture dirs; no leftover vitest |

---

## 6. Canonical attempt (this continuation) — FAIL

`npm run check` once; log `/tmp/pathcode-4c-completion-check.log`; exit file `/tmp/pathcode-4c-completion-check.exit`.

| Field | Value |
|---|---|
| **Actual npm exit** | **1** |
| typecheck / build | completed |
| test | failed (stopped pipeline) |
| cli:smoke / ledger:verify | **not reached** |
| Duration | ~453s test phase (~480s wall for full command) |
| Reported | 2 failed / 71 passed files (**76**); 2 failed / 707 passed tests (**709**); **1** unhandled worker error |

### Failures

| Test | Class | Actual error |
|---|---|---|
| `tests/execution/local-process.test.ts` › `times out and escalates when SIGTERM is ignored` | **assertion** | `expected [ 'SIGTERM' ] to include 'SIGKILL'` |
| `tests/git/baseline.test.ts` › `reports an admitted untracked file as UNTRACKED` | **timeout** | `Test timed out in 5000ms` (observed ~8377ms wall) |
| (suite) | **worker** | `[vitest-worker]: Timeout calling "onTaskUpdate"` |

### Completeness gap

Collected inventory **728**; canonical report **709** → **19 tests unaccounted** in the Vitest summary despite 76 files listed. Partial aggregate + worker error ⇒ **not PASS**.

No second attempt (instruction).

---

## 7. Disposition / uncertainty

| Item | Disposition |
|---|---|
| Implementation candidate | preserved at `d5e6bd4` |
| 4C product code | not redesigned; not edited this continuation |
| Canonical green | **not achieved** |
| main FF | **not performed** |
| Remaining uncertainty | whether SIGKILL-escalation miss and 5s Git fixture timeout are host-load flakes vs latent nondeterminism; worker RPC timeout again correlated with incomplete counts |

---

## 8. Non-claims

No push, merge, rebase, main fast-forward, phase promotion, Phase 4D, or invented audit.
