# PATH CODE — PHASE 4D ENGINEERING RUN IMPLEMENTATION REPORT

**Status:** Implementation complete; canonical gate PASS  
**Branch:** `cursor/phase4-execution-core`  
**Contract:** `docs/passes/PHASE_4D_ENGINEERING_RUN_CONTRACT.md`  
**Implementation commits:** `38fc59e` (feature), `7b5e4c4` (typecheck fix)

```text
IMPLEMENTATION REPORT — NOT PHASE_VERIFIED — NO LEDGER PROMOTION
```

---

## 1. What shipped

Package-internal composition area `src/engineering-run/`:

| API | Role |
|---|---|
| `executeEngineeringRun(plan, authorization)` | Execute Validation → build Run Evidence → register `EngineeringRunRecord` |
| `checkEngineeringRunApplicability(run, plan, workspace)` | Delegate to `checkRunEvidenceApplicability` |
| `summarizeEngineeringRun(run)` | Allowlisted informational summary (`null` if unregistered) |

No `EngineeringRunApproval` / `EngineeringRunAuthorization`. No package-root export.

---

## 2. Authority / association

- Authority = existing `PreparedValidationPlan` + `ValidationAuthorization` only.
- Authenticity = WeakMap registry on `EngineeringRunRecord` object identity.
- Record **references** authentic `ValidationPlanResult` and `RunEvidenceRecord` (no stdout/stderr/env/argv duplication).
- Clones / JSON summaries do not authenticate.

---

## 3. Validation-failure preservation

A completed Validation with FAIL / NOT_ATTEMPTED yields a **successful** Engineering Run Result whose historical `aggregateOutcome` / `planCriterionSatisfied` / check rows match Validation and Run Evidence exactly.

Infrastructure failures (foreign auth, consumed auth, evidence build failure) return `Result` failure codes without fabricating a green record.

---

## 4. Applicability

Delegates to Run Evidence → Validation. Never mutates the historical record. Never upgrades a historical failure to PASS. Criterion-unsatisfied historical results surface as non-applicable via existing Validation `RESULT_NOT_APPLICABLE` semantics.

---

## 5. CompletionReport mapping

**DEFERRED.** Domain `CompletionReport` requires `EvidenceRecord[]` payloads (kinds + payload + provenance). Engineering Run deliberately does not duplicate stream/env/argv trees. Inventing incomplete `EvidenceRecord` payloads would overclaim. No competing completion vocabulary added.

---

## 6. Reasoning Ledger future-binding fields

Stable identifiers available for Phase 5 Gate 2 citation (without implementing Claim/Hypothesis/etc.):

- `engineeringRunId`
- `validationResultId`
- `runEvidenceId`
- `planId`
- `criterionId` / `scopeId`
- `aggregateOutcome` / `planCriterionSatisfied`
- `declaredObservationPaths` / `snapshotGeneration`

---

## 7. Focused acceptance mapping

| # | Requirement | Coverage |
|---|---|---|
| 1 | Successful Validation → record | `composes authentic successful…` |
| 2–3 | Failed + NOT_ATTEMPTED preserved | `preserves authentic Validation failure…` |
| 4–5 | Foreign / consumed auth | `refuses foreign plan / consumed…` |
| 6–9 | Clone/JSON; evidence identity; immutable Validation | `rejects clones/JSON…` |
| 10–12 | Applicability delegate; mutation stale; history unchanged | `delegates applicability…` |
| 13 | Failed not upgraded | `does not upgrade a historical failed…` |
| 14–16 | Safe summary | `summary uses allowlisted…` |
| 17–19 / 21–22 | No approval/spawn/classifier; no package export; no import side effects | architecture + phase2 audit |
| 20 | E2E fixture | `end-to-end: Phase 2 subject…` |

Focused result: **12/12 PASS** (`tests/engineering-run/**`).

---

## 8. Canonical gate

| Attempt | Result |
|---|---|
| 1 | FAIL — unused `subject` destructure in success test (`TS6133`) |
| 2 (final) | **PASS** — exit 0; 78/78 files; 740/740 tests; zero worker errors; cli:smoke PASS; ledger:verify PASS |

See `docs/PHASE_4_IMPLEMENTATION_STATUS.md`.

---

## 9. Non-claims

No Reasoning Ledger, providers, persistence, autonomous repair, sandbox, Windows claim, package-public export, ledger phase promotion, Phase 5 implementation.
