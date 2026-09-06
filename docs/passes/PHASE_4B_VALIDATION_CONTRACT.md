# PATH CODE — PHASE 4B VALIDATION CONTRACT

**Status:** Implementation contract for scoped Validation V1  
**Baseline HEAD:** `e2831f48a425400c335619d8701823dbeb9124bf`  
**Branch:** `cursor/phase4-execution-core`  
**Governing instruction:** operator Phase 4B package  
**Execution base:** Phase 4A local-process engine (`src/execution/**`)

```text
CONTRACT FOR IMPLEMENTATION — NOT PHASE PROMOTION — NOT PHASE_VERIFIED
```

---

## Prospective project-state note

The operator authorizes forward development of Validation on the implemented Phase 4A execution components while keeping `safe-editing` and all existing ledger states unchanged.

This contract does **not** claim:

- Constitution §10 full closed-vocabulary audit performed;
- an independent execution audit performed;
- Phase 3 PHASE_VERIFIED;
- Phase 4 complete.

Prerequisite tensions remain visible. Actual prerequisite results are not fabricated.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Row | Concept | Result | Notes |
|---|---|---|---|
| A | WorkspaceBoundary / CanonicalPath | `MAPS_TO_EXISTING` | Via snapshot/workspace already earned |
| B | Explicit process approval | `MAPS_TO_EXISTING` | Caller supplies `ExplicitLocalProcessApproval`; Validation never mints it |
| C | Single-use opaque authorization | `MAPS_TO_EXISTING` | Process auth + new validation-plan bundle registry |
| D | ContentObservation / snapshot verify | `MAPS_TO_EXISTING` | Declared-input currentness via `verifyRepositorySnapshot` |
| E | ValidationOutcome domain vocabulary | `MAPS_TO_EXISTING` | Aggregate mapping only; check-local discriminants added |
| F | ActionClass check kinds | `MAPS_TO_EXISTING` | `TYPECHECK` / `LINT` / `BUILD` / `TARGETED_TEST` + `EXECUTE_PROCESS` |
| G | Reasoning Ledger / run manifest | `NOT_APPLICABLE` | Supply stable bindings only |
| H | Package-public validation surface | `NOT_APPLICABLE` | Internal like execution |

No `BLOCKING_GAP` for V1 Validation.

---

## Five execution dependency checks (source-backed)

### 1. Named process boundary

Since `c23f08f…`, architecture tests name **exactly** `dist/execution/internal/process-host.js` as the sole authorized spawn module (`tests/git/baseline-architecture.test.ts`). Git source remains spawn/exec/fork-free and `execFile`-only. Validation must import **no** `child_process`.

**Disposition:** PASS for building upon; no broadening of allowlists required beyond existing named host.

### 2. Exposure and approval

`src/index.ts` and package `exports` (only `"."`) do not expose `explicitLocalProcessApproval`, `authorizePreparedLocalProcess`, `prepareLocalProcess`, `executeAuthorizedLocalProcess`, or process-host symbols (`tests/execution/architecture.test.ts`, `tests/integration/phase2-architecture-audit.test.ts`).

Package encapsulation is **not** an OS security boundary against arbitrary code already inside this Node process. It is the supported public API boundary.

**Disposition:** PASS — Validation stays package-internal likewise.

### 3. Termination evidence

`LocalProcessResult` fields (from `src/execution/types.ts`):

| Claim | Fields |
|---|---|
| Signal / termination requested | `terminationRequested`, `cleanup.signalsAttempted` |
| Observed child exit | `terminationObserved`, `exitCode`, `signal`, `outcome` |
| Stream completeness | `stdout.complete` / `stderr.complete`, truncation flags |
| Incomplete cleanup | `cleanup.terminationNotConfirmed`, `cleanup.descendantMayRemainAlive` |

Existing tests: ignored SIGTERM escalates to SIGKILL (`times out and escalates when SIGTERM is ignored`); descendant pipe fixture records `descendantMayRemainAlive` without claiming universal descendant death.

**Disposition:** PASS — classifier must not treat request alone as observed success.

### 4. Requirement-to-test mapping (execution)

Representative mapping (not 30-vs-36 arithmetic):

| Requirement | Evidence |
|---|---|
| Absolute executable / argv fidelity / no shell | `local-process.test.ts` absolute, argv, noshell cases |
| Cwd containment / change refusal | cwd / symlink / cwd-change tests |
| Env non-wholesale + host unchanged | env / host cwd-env tests |
| Auth single-use / concurrent | auth / mutate / concurrent tests |
| EXECUTE_PROCESS disable | disable before/after authorize |
| Timeout / overflow / SIGTERM ignore | timeout + overflow tests |
| >120s config without 30m wait | timeout-policy prepare assertions |
| Architecture / package non-export | `architecture.test.ts` |

**Disposition:** PASS for Validation dependence; unsupported claim “resultId proves candidate/config” is **not** claimed by execution (see check 5).

### 5. Result binding

`resultId` is issued by `nextResultId()` as a correlation label (`src/execution/internal/registry.ts` / `evidence.ts`). It does **not** bind plan, subject, or configuration. Phase 4B must establish plan/subject/run association via opaque in-memory registration.

**Disposition:** PASS — Validation owns the missing association.

---

## Frozen V1 API mappings

| Operation | Module |
|---|---|
| `prepareValidationPlan` | preparation |
| `authorizeValidationPlan` | authorization |
| `executeValidationPlan` | execute |
| `checkValidationResultApplicability` | applicability |
| `classifyLocalProcessForValidation` | classifier (pure; testable with synthetics) |

| Kind | ActionClass disable token |
|---|---|
| TYPECHECK | `TYPECHECK` |
| LINT | `LINT` |
| BUILD | `BUILD` |
| TARGETED_TEST | `TARGETED_TEST` |
| (all checks) | also honor `EXECUTE_PROCESS` |

**Acceptance criterion:** `EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE`  
Does **not** prove product correctness, test discovery, coverage, or stdout “PASS” text.

**Subject scope:** `DECLARED_OBSERVED_INPUTS` only.

**Limits:** default 1 MiB/stream/check; aggregate plan capture ≤ 32 MiB; sum of configured process timeouts ≤ 30 minutes (execution grace additional).

---

## Explicit non-goals

Reasoning Ledger, providers, autonomous repairs, sandbox, AST/symbol index, Phase 5, package-root export, second process host, Git runner reuse, CUSTOM check kind.
