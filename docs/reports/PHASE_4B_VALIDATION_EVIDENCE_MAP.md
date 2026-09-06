# PATH CODE — PHASE 4B VALIDATION REQUIREMENT-TO-ASSERTION MAP

**Status:** Supplement to the historical Phase 4B report (not a rewrite)  
**Baseline HEAD for original 4B run:** `106b3a95ab7e69a3e219da2a79559c34fe4e2d88`  
**Governing Appendix A:** Phase 4C implementation package  

```text
EVIDENCE MAP — NOT PHASE PROMOTION — NOT AN INDEPENDENT AUDIT
```

This map is the Validation acceptance matrix (24 rows). It is **not** the execution dependency table from `PHASE_4B_VALIDATION_CONTRACT.md` §4.

**Legend**

| Field | Meaning |
|---|---|
| Proof kind | `real-execution` · `pure-classifier` · `architecture` · `reused-dependency` · `config-loader` |
| Coverage | `covered` · `partially covered` · `not demonstrated` |
| Evidence vintage | `at-106b3a9` (existed on original 4B HEAD) · `added-in-4C` (new focused test authorized to finish this map) |

Association note for Phase 4C: `ValidationPlanResult.resultId` / `planId` / brands alone are **not** authentic association. Runtime association is the in-memory `resultRegistry` WeakMap in `src/validation/internal/registry.ts` (`registerValidationResult` / `lookupValidationResult`), used by `checkValidationResultApplicability` and the read-only projection `resolveRegisteredValidationBinding`.

---

## Rows 1–24

### 1. Prepare valid plan without spawning; reject empty/oversized/duplicate IDs

| | |
|---|---|
| Source | `src/validation/preparation.ts` (`prepareValidationPlan`); prepare path calls `prepareLocalProcess` only (no spawn) |
| Tests | `tests/validation/validation.test.ts` — `prepares without spawning and rejects empty/oversized/duplicate plans` (`empty.ok`/`dup.ok`/`oversized.ok` false); successful prepare asserted in `freezes caller argv mutation…` (`prepared.ok` true) and later execution tests |
| Proof kind | real-execution (prepare-only; no Validation spawn) |
| Coverage | **covered** |
| Vintage | at-106b3a9 |

### 2. Caller mutations of command order/argv/env/subject arrays cannot change the prepared plan

| | |
|---|---|
| Source | `preparation.ts` copies argv/env; freezes checks/observations on plan |
| Tests | at-106b3a9: `freezes caller argv mutation and rejects aggregate capture widening` — `argv[1]="mutated"` then `preparedProcess.argv[1]==="keep"`. **added-in-4C:** `caller mutations of checks/env/subject arrays cannot alter prepared plan` — checks reorder, env mutation, declaredObservations splice leave prepared plan unchanged |
| Proof kind | real-execution (prepare-only) |
| Coverage | **covered** (argv at-106b3a9; order/env/subject added-in-4C) |
| Vintage | mixed |

### 3. Limits, timeout sum and aggregate output cap enforced before execution

| | |
|---|---|
| Source | `preparation.ts` (`CAPTURE_AGGREGATE_EXCEEDED`, `TIMEOUT_SUM_EXCEEDED`, `TOO_MANY_CHECKS`, `LIMITS_INVALID`); `bounds.ts` |
| Tests | at-106b3a9: oversized plan (`MAX_VALIDATION_CHECKS+1`); aggregate capture (`huge.ok` false). **added-in-4C:** `rejects timeout sum exceeding plan ceiling before execution` |
| Proof kind | real-execution (prepare-only) |
| Coverage | **covered** |
| Vintage | mixed |

### 4. Compatible subject artifacts accepted; foreign workspace/generation and fabricated artifacts refused

| | |
|---|---|
| Source | `preparation.ts` (`SUBJECT_INCOMPATIBLE`, `OBSERVATION_NOT_IN_SNAPSHOT`, `EMPTY_SUBJECT`) |
| Tests | Compatible accept: any successful `prepareValidationPlan` in execution tests (e.g. e2e). **added-in-4C:** `refuses foreign workspace and fabricated observations` |
| Proof kind | real-execution (prepare-only) |
| Coverage | **covered** |
| Vintage | mixed |

### 5. Missing/wrong approval and wrong prepared-command authorization refused without spawn

| | |
|---|---|
| Source | `authorization.ts` (`APPROVAL_INCOMPLETE`, `APPROVAL_REQUIRED`, `PROCESS_AUTHORIZE_FAILED`) |
| Tests | at-106b3a9: `requires caller approvals and refuses replay` — empty Map → `missing.ok` false. **added-in-4C:** `refuses invalid approval objects without spawning` |
| Proof kind | real-execution (authorize-only) |
| Coverage | **covered** |
| Vintage | mixed |

### 6. Plan and command replay refused; concurrent plan calls start at most one authorized run

| | |
|---|---|
| Source | `registry.ts` consume-once; execution single-use process auth |
| Tests | at-106b3a9: replay `executeValidationPlan` → `replay.ok` false. **added-in-4C:** `concurrent executeValidationPlan starts at most one run`. Command-level replay: **reused-dependency** `tests/execution/local-process.test.ts` — `ignores caller mutation after prepare and refuses replay` / `concurrent replay produces at most one spawn` |
| Proof kind | real-execution + reused-dependency |
| Coverage | **covered** |
| Vintage | mixed |

### 7. EXECUTE_PROCESS and each supported kind restriction honored; disable after authorization refuses

| | |
|---|---|
| Source | `policy.ts` / `execute.ts` (`ACTION_DISABLED` refuse path) |
| Tests | at-106b3a9: `honors TYPECHECK disable-action` at prepare. **added-in-4C:** `honors EXECUTE_PROCESS and LINT disable; disable after authorize refuses spawn` |
| Proof kind | real-execution |
| Coverage | **covered** (BUILD/TARGETED_TEST disable share same `isCheckKindDisabled` path; LINT + EXECUTE_PROCESS + post-auth covered directly) |
| Vintage | mixed |

### 8. Malformed config fails closed; ABSENT follows existing semantics; changed policy binding cannot reuse approval

| | |
|---|---|
| Source | config loader; `execute.ts` reloads config / `ACTION_DISABLED` |
| Tests | at-106b3a9: `malformed disable-action fails closed`. ABSENT: **reused-dependency** `tests/config/loader.test.ts` ABSENT cases; successful validation under default ABSENT fixtures. **added-in-4C:** post-authorize disable (row 7) covers changed policy refusing execution |
| Proof kind | config-loader + real-execution |
| Coverage | **covered** |
| Vintage | mixed |

### 9. Same-size/same-mtime changed declared bytes are stale; no metadata-only success

| | |
|---|---|
| Source | `subject.ts` → `verifyRepositorySnapshot` content path |
| Tests | Snapshot dependency: `tests/snapshot/snapshot.test.ts` — `detects same-size same-mtime in-place content change as STALE_CONTENT on read`. **added-in-4C:** `same-size same-mtime declared change fails applicability` (Validation applicability path) |
| Proof kind | real-execution + reused-dependency |
| Coverage | **covered** |
| Vintage | mixed (Validation-direct added-in-4C) |

### 10. Changed test/configuration bytes invalidate applicability; copied resultId/JSON does not authenticate

| | |
|---|---|
| Source | `applicability.ts` (`SUBJECT_STALE`, `RESULT_NOT_REGISTERED`) |
| Tests | at-106b3a9 e2e: declared input change → `stale.ok` false; `{...result}` clone → `fake.ok` false. **added-in-4C:** `changed declared configuration bytes invalidate applicability` |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | mixed |

### 11. Every kind can run a controlled approved fixture; exact order and argv preserved

| | |
|---|---|
| Source | `execute.ts` sequential loop; prepared argv from preparation |
| Tests | at-106b3a9: TYPECHECK + TARGETED_TEST (e2e); LINT (timeout). **added-in-4C:** `runs all four kinds preserving order and argv` |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | mixed |

### 12. Real zero and nonzero exit produce different verdicts; stdout PASS cannot override nonzero exit

| | |
|---|---|
| Source | `classifier.ts`; used by `execute.ts` |
| Tests | Real FAIL/PASS: `stops after first failure…` / e2e. Pure: `fails on nonzero exit even if stdout says PASS`. **added-in-4C:** `real nonzero exit with stdout PASS is FAIL` |
| Proof kind | real-execution + pure-classifier |
| Coverage | **covered** |
| Vintage | mixed |

### 13. Timeout, signal, overflow and incomplete capture never become validation PASS; preserve raw reasons

| | |
|---|---|
| Source | `classifier.ts` |
| Tests | Real timeout: `timeout never becomes validation PASS`. Pure: `treats timeout/overflow/incomplete as inconclusive` (at-106b3a9 timeout/overflow; **added-in-4C** extends incomplete/signal cases in same suite). Overflow/SIGTERM host behavior: **reused-dependency** execution overflow/SIGTERM tests |
| Proof kind | real-execution + pure-classifier + reused-dependency |
| Coverage | **covered** |
| Vintage | mixed |

### 14. Ignored SIGTERM and descendant-open-pipe reuse real execution evidence

| | |
|---|---|
| Source | execution process-host / cleanup fields; Validation classifier refuses incomplete termination |
| Tests | **reused-dependency** `tests/execution/local-process.test.ts` — `times out and escalates when SIGTERM is ignored`; `handles descendant/process-group cleanup without infinite wait` |
| Proof kind | reused-dependency |
| Coverage | **covered** |
| Vintage | at-106b3a9 (dependency) |

### 15. First non-pass stops subsequent execution; untouched rows NOT_ATTEMPTED with no fabricated result

| | |
|---|---|
| Source | `execute.ts` stop flag / `NOT_ATTEMPTED` / `processResult: null` |
| Tests | `stops after first failure and marks later checks NOT_ATTEMPTED` — verdicts FAIL/NOT_ATTEMPTED; `processResult` null; `planCriterionSatisfied` false; `aggregateOutcome` not PROVEN |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | at-106b3a9 |

### 16. Declared-input mutation by a command keeps the process result but invalidates plan applicability

| | |
|---|---|
| Source | `execute.ts` after-verify → `applicabilityValid=false` while retaining `processResult` |
| Tests | **added-in-4C:** `command mutation of declared input keeps process result but invalidates applicability` |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | added-in-4C |

### 17. Post-check verification failure never becomes an all-checks pass; input subject is not silently refreshed

| | |
|---|---|
| Source | `planCriterionSatisfied` requires `subjectVerifiedAfter===true` and `applicabilityValid` |
| Tests | Same **added-in-4C** test as row 16 — `planCriterionSatisfied===false`, `subjectVerifiedAfter===false`, snapshot generation unchanged |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | added-in-4C |

### 18. A result from plan/workspace/subject A cannot be reassigned to B, even by copying labels

| | |
|---|---|
| Source | `applicability.ts` registry identity + plan/workspace checks |
| Tests | at-106b3a9: cloned result refused. **added-in-4C:** `refuses cross-plan and cross-workspace applicability reassignment` |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | mixed |

### 19. Adding an unobserved file is not proof of full repository currentness; fixed scope remains explicit

| | |
|---|---|
| Source | `VALIDATION_SCOPE_ID` / declared-entry verify only |
| Tests | at-106b3a9 e2e: `scopeId==="DECLARED_OBSERVED_INPUTS"`. **added-in-4C:** `unobserved new file does not widen scope or claim full-repo seal` — applicability for declared inputs may remain ok; scope id unchanged; no full-repo claim fields |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | mixed |

### 20. Exact process-result identity/association retained; no caller result-ingestion path or public DI seam

| | |
|---|---|
| Source | `execute.ts` stores `executed.value` on check row; registry binds result→plan; no ingestion API on barrel |
| Tests | architecture: no DI/approval mint. **added-in-4C:** `retains processResult object identity and rejects fabricated result ingestion` |
| Proof kind | real-execution + architecture |
| Coverage | **covered** |
| Vintage | mixed |

### 21. End-to-end: earn observations, approve typecheck + targeted-test, run, change declared input, reject reuse

| | |
|---|---|
| Source | full Validation pipeline |
| Tests | `end-to-end scoped result then rejects reuse after declared input change` — local deterministic `ok.mjs` fixtures (no provider/network) |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | at-106b3a9 |

### 22. Import causes no spawn or host cwd/env mutation; no new child_process/fs-write owner or package-root exposure

| | |
|---|---|
| Source | `src/validation/**` |
| Tests | `import has no spawn…`; architecture suite: no `child_process`/`shell:true`, no approval mint, exports map `["."]` only |
| Proof kind | architecture |
| Coverage | **covered** |
| Vintage | at-106b3a9 |

### 23. Existing execution acceptance rows remain mapped, including >120s configuration without 30m wait

| | |
|---|---|
| Source | Phase 4A execution |
| Tests | **reused-dependency** `tests/execution/local-process.test.ts` — `represents 120s default and allows >120s up to 30m without clamping to 120s` (+ architecture/cwd/env/auth rows cited in contract §4) |
| Proof kind | reused-dependency |
| Coverage | **covered** |
| Vintage | at-106b3a9 (dependency) |

### 24. Aggregation does not turn partial, refused, stale, timed-out or empty work into domain-wide PROVEN

| | |
|---|---|
| Source | `execute.ts` `aggregateOutcome` / `planCriterionSatisfied` |
| Tests | `stops after first failure…` — `aggregateOutcome` not PROVEN; timeout test — `planCriterionSatisfied` false; e2e only PROVEN when all pass |
| Proof kind | real-execution |
| Coverage | **covered** |
| Vintage | at-106b3a9 |

---

## Summary

| Coverage | Count |
|---|---|
| covered | 24 |
| partially covered | 0 |
| not demonstrated | 0 |

Rows whose Validation-direct proof was completed only via **added-in-4C** tests: **2** (partial), **3** (timeout sum), **4**, **5**, **6** (concurrent), **7** (EXECUTE_PROCESS/LINT/post-auth), **9** (Validation path), **10** (config bytes), **11**, **12** (real stdout PASS), **13** (classifier extend), **16**, **17**, **18** (cross-plan/workspace), **19** (unobserved), **20**.

Historical Phase 4B report and contract files are preserved unchanged.
