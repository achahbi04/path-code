# PHASE 5F-H3 — POST-EDIT VALIDATION ADMISSION + CHECK ORDER CORRECTION

**Result: PASS**

**Success line:**  
`PHASE 5F-H3 VALIDATION ADMISSION CORRECTED — GATE2_PREPARE_FAILED FIXED — TYPECHECK BEFORE TARGETED_TEST PROVEN — GATE 1/2 UNCHANGED`

---

## 1. Exact state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Branch | `cursor/phase5f-live-trial-cli` |
| Starting HEAD | `550faf99c9d74474933bb161b4b8641d607833ab` |
| Main (unchanged) | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Final SHA | `30b23a8e50ba938d9dafae9ae85f876684e28654` |
| Live Trial 1 by implementer | **NOT RUN** |
| Live provider calls | **zero** |
| Credentials | **none read** |
| Manual retained-workspace results | **diagnostic only** — never imported as Gate 2 evidence |

---

## 2. Proven pre-execution root cause

Live Terra applied the correct multiply edit, then after CHECK produced:

```text
MUTATION_APPLIED_VALIDATION_NOT_ESTABLISHED
Typecheck:    not run
Regression:   not run
Gate 2:       not established (FAILED)
```

### Exact stop stage

| Field | Value |
|---|---|
| Stage | `PREPARING_EXECUTION_EVIDENCE` |
| Owner | `prepareExecutionEvidencePlan` |
| Cycle `originCode` | `GATE2_PREPARE_FAILED` |
| `validationDisposition` | `NOT_DISPATCHED_FAILED` |
| EngineeringRun | **none** (checks never dispatched) |
| Post-edit Gate 1 | **PASSED** (`gate1Outcome.kind === "BOUND"`) |

### Causal chain

1. Post-edit Brain #2 succeeded and Gate 1 bound the proposal.
2. Live-shaped post-edit reasoning emitted **DEFINES + BEHAVES** (encouraged by “both checks must pass”).
3. Trial blueprint assigned **only** `behaves-multiply-01 → targeted`.
4. `prepareExecutionEvidencePlan` requires **exactly one assignment row per EXECUTION claim**.
5. Assignment count ≠ EXECUTION claim count → `INVALID_CLAIM_CHECK_MAPPING` → `GATE2_PREPARE_FAILED`.
6. Engineering Run never started → TYPECHECK / TARGETED_TEST “not run”.

**Defect class:** owner-composition mismatch at the Trial 1 host (assignments vs live post-edit EXECUTION claims), plus missing provider-neutral post-edit claim score.  
**Not:** source fix, missing `tsc`, broken regression fixture, Gate 1, Gate 2, or ValidationAuthorization.

Deterministic repro before correction (retained as H3-B negative shape): DEFINES+BEHAVES with incomplete/unassigned mapping → same `GATE2_PREPARE_FAILED` / checks not dispatched.

---

## 3. Correction

### A. Trial claim↔check composition (causal)

Align Trial 1 with the proven M28 pattern:

- `defines-multiply-01` → `typecheck` (TYPECHECK)
- `behaves-multiply-01` → `targeted` (TARGETED_TEST)

Update post-edit instruction / context to require **exactly those two** EXECUTION claims (no extras, no omissions).

### B. Provider-neutral post-edit claim requirements (model-facing score)

Owned by mutation session (`src/orchestrator/mutation/session.ts` + types):

- New context block `post-edit-execution-claim-requirements`
- Document title `POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS`
- Derived only from blueprint `claimCheckAssignments` + prepared check kinds + post-edit CONTENT handle for supporting observations
- OpenAI transports the block; reasoning profile instructions obey it generically (no hard-coded trial claim IDs in `src/adapters/openai/**`)

### C. Check order

No Validation redesign. Existing `executeValidationPlan` already runs `plan.checks` **sequentially** and stops on non-PASS. Trial plan order remains TYPECHECK then TARGETED_TEST. Proven:

TYPECHECK exit 0 → `.trial-build/calculator.js` exists → TARGETED_TEST exit 0.

TYPECHECK FAIL → TARGETED_TEST `NOT_ATTEMPTED` (H3-J).

### D. Terminal diagnostics

When validation is `NOT_DISPATCHED_*` and no checks ran, report:

```text
Validation stopped before execution
Stage: PREPARING_EXECUTION_EVIDENCE
Reason: GATE2_PREPARE_FAILED
```

TYPECHECK FAIL blocking regression reports: `not run (blocked by prior TYPECHECK)`.

---

## 4. What was not changed

| Surface | Status |
|---|---|
| Gate 1 bind rules | unchanged |
| Gate 2 assessment rules | unchanged |
| ValidationAuthorization minting | still host-only |
| Freshness / currentness | unchanged |
| Manual retained-workspace import | not used |
| Live OpenAI / credentials | not used |
| Git automation / rollback | none |

---

## 5. Regression proofs (H3-A..L)

| ID | Proof |
|---|---|
| H3-A | Live-equivalent DEFINES+BEHAVES reaches post-edit admission / Gate 1 BOUND |
| H3-B | Unassigned extra EXECUTION claim → `GATE2_PREPARE_FAILED`, checks not run |
| H3-C | TYPECHECK genuinely dispatched (process exit 0) |
| H3-D | TYPECHECK precedes TARGETED_TEST in authentic checkResults |
| H3-E | TARGETED_TEST dispatches afterward and exits 0 |
| H3-F | EngineeringRun records both checks |
| H3-G | Gate 2 assessment uses that EngineeringRun id |
| H3-H | Strong success label only when all current requirements satisfied |
| H3-I | Missing DEFINES (BEHAVES-only) still fails closed |
| H3-J | TYPECHECK FAIL blocks TARGETED_TEST; terminal distinguishes |
| H3-K | No ValidationAuthorization minted by Brain/model path |
| H3-L | No manual retained-workspace path consumed as trusted evidence |

Suite: `tests/terminal-trial/h3-validation-admission.test.ts`

---

## 6. Validation

### Focused

- `tests/terminal-trial/h3-validation-admission.test.ts` — PASS
- `tests/terminal-trial/*` — PASS
- `tests/mutation/mutation-e2e.test.ts` — PASS
- `tests/mutation/grounding.test.ts` — PASS

### Canonical

1. `npm run check` under sandbox — **FAIL** (setup): fixture `git init` → `GIT_DISCOVERY_FAILED` (sandbox), unrelated to H3.
2. `npm run check` outside sandbox — **PASS** (typecheck, build, full vitest, cli:smoke, ledger:verify).

No second causal retry. No skipped tests. No global timeout changes.

---

## 7. Operator retry (live — not run by this pass)

After installing/linking this worktree and exporting a credential locally:

```bash
pathcode
```

Then complete Trial 1 START → APPLY → CHECK on the synthetic multiply fixture.

---

## 8. Stop conditions honored

- No live OpenAI call
- No merge / push
- Main remains `525d74c4a92ae30a13fa0a2ae62bc305cc3115de`
- Clean worktree after commit
