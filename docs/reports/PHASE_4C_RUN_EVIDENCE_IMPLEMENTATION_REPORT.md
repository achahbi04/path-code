# PATH CODE — PHASE 4C RUN EVIDENCE IMPLEMENTATION REPORT

**Result:** FAIL (canonical gate) — candidate preserved; main not advanced  
**Starting HEAD:** `106b3a95ab7e69a3e219da2a79559c34fe4e2d88`  
**Branch:** `cursor/phase4-execution-core`  
**Worktree:** `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`

```text
RUN EVIDENCE V1 IMPLEMENTED ON BRANCH — CANONICAL CHECK NOT GREEN —
NOT PHASE 4 COMPLETE — NOT PHASE_VERIFIED — MAIN NOT FAST-FORWARDED
```

---

## Commits (Phase 4C branch only)

| SHA | Summary |
|---|---|
| `f8e08d3a6bd1938dc34a9f6acfd530bc9baabf27` | 4B evidence map + 4C contract + Validation binding helper + gap tests |
| `8b5514272e53530bc5dd39b3d1d0af80c3183f57` | `src/run-evidence/**` + focused tests + architecture allow |
| `cd6577e57d240d39b3fddf791261fd5ce96a6e22` | typecheck import-path / cast fix |

Post-check working-tree note: four-kinds test timeout raised to 15s after attempt 2 (not a third canonical run).

---

## Phase 4B evidence map (completed)

**Path:** `docs/reports/PHASE_4B_VALIDATION_EVIDENCE_MAP.md`  
Historical 4B report/contract unchanged.

All 24 Appendix A rows recorded as **covered**, with vintage `at-106b3a9` and/or `added-in-4C`.  
New Validation-direct evidence lives only on this branch in `tests/validation/evidence-gaps.test.ts` (+ `src/validation/binding.ts` projection).

Runtime association for 4C: Validation `resultRegistry` via `resolveRegisteredValidationBinding` — not `resultId`/`planId` alone.

---

## Run Evidence API (package-internal)

| Operation | Module |
|---|---|
| `buildRunEvidence` | `src/run-evidence/build.ts` |
| `checkRunEvidenceApplicability` | `src/run-evidence/applicability.ts` |
| `summarizeRunEvidence` | `src/run-evidence/summary.ts` |
| `resolveRegisteredValidationBinding` | `src/validation/binding.ts` |

**Types:** `RunEvidenceRecord`, `RunEvidenceSummary`, `RunEvidenceApplicabilityObservation`, `RunEvidenceCheckRow`, `RunEvidenceCounts` in `src/run-evidence/types.ts`.

**Association:** live Validation registry projection + Run Evidence WeakMap. Clones/JSON copies do not authenticate.

**Historical vs current:** assembly does not require fresh applicability. Fresh checks delegate to `checkValidationResultApplicability` and return a new observation without mutating the record.

**Summary:** allowlisted informational fields only; omits argv/env/stdout text/absolute host paths by default; JSON revive is not registered.

**Package-public:** none.

---

## 4C proof matrix → tests

| # | Requirement | Test / assertion |
|---|---|---|
| 1 | Authentic success → immutable scoped record | `builds immutable evidence from an authentic successful Validation run` |
| 2 | Failed/NOT_ATTEMPTED without fabrications | `preserves failed and NOT_ATTEMPTED rows without fabricating process facts` |
| 3 | Clone/wrong plan/workspace refused | `rejects cloned results, wrong plans, and wrong workspaces` |
| 4 | Derived counts; not tests/coverage | `derives per-check counts without labeling them as tests or coverage` |
| 5 | Subject change → fresh fail; history unchanged | `fresh applicability fails after subject change while original evidence stays unchanged` |
| 6 | No lease from originalApplicabilityValid; no upgrade | `does not reuse originalApplicabilityValid…` |
| 7 | Mutable views cannot alter association | `mutable caller views cannot change registered association` |
| 8 | Summary secrets omitted; JSON not registered | `summary omits seeded secrets and JSON reconstruction is not registered` |
| 9 | No approve/execute on assembly; applicability delegates | `assembly does not approve or execute; applicability delegates to Validation` + architecture |
| 10 | No child_process/write/package export | `tests/run-evidence/architecture.test.ts` |
| 11 | E2E two-check + mutate + reject reuse | `end-to-end: two-check Validation evidence…` |
| 12 | No old-process ingestion; scope limits present | `cannot ingest an older process result as a new check; scope limits remain` |

---

## Canonical check

Historical 4B baseline at `106b3a9`: **698** tests (unchanged claim for that checkpoint).

| Attempt | Environment | Exit | Files | Tests | Notes |
|---|---|---|---|---|---|
| 1 | sandbox | **non-zero** (pipeline) | 14 failed / 59 passed (76) | 59 failed / 650 passed (709) | `GIT_DISCOVERY_FAILED` fixture mass-fail + worker RPC timeout — diagnosed setup fault |
| 2 | unsandboxed (`all`) | **1** | 6 failed / 66 passed (72) | 7 failed / 690 passed (697) | Remaining timeouts/load flakes; includes owned `runs all four kinds…` at default 5s; vitest worker `onTaskUpdate` error; cli:smoke/ledger:verify **not reached** |

Vitest scheduling (`maxWorkers=2`, src-lock-serial): unchanged.  
No third canonical run (budget rule).

Focused pre-check: validation gaps + run-evidence suites previously **30/30** PASS.

---

## Main integration

| | |
|---|---|
| main before | `e2831f48a425400c335619d8701823dbeb9124bf` |
| main after | **unchanged** (final gate not green) |
| Authorized FF target | `106b3a95…` — **not performed** |
| Phase 4C on main | **not merged** |

---

## Scope limitations / non-claims

- Declared-input historical record only; not repository seal or product correctness.
- Summary/JSON is not authority.
- No Reasoning Ledger, providers, persistence, sandbox, Phase 5.
- No independent audit fabrication; no phase promotion; no push.
- New gap-test and run-evidence evidence exists only on `cursor/phase4-execution-core`.
