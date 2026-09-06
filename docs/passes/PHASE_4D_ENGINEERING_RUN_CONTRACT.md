# PATH CODE — PHASE 4D ENGINEERING RUN CONTRACT

**Status:** Implementation contract for scoped Engineering Run V1  
**Baseline HEAD:** `962d90480754bf7233c47b7e0e47b17e74991566`  
**Branch:** `cursor/phase4-execution-core`  
**Governing instruction:** operator Phase 4D package  
**Composition base:** Phase 4A Execution → Phase 4B Validation → Phase 4C Run Evidence

```text
CONTRACT FOR IMPLEMENTATION — NOT PHASE PROMOTION — NOT PHASE_VERIFIED
```

---

## Prospective project-state note

Forward development of Engineering Run is authorized on the implemented Phase 4A/4B/4C components while keeping Capability Ledger and gap-ledger phase-verification states unchanged.

This contract does **not** claim: Constitution §10 full closed-vocabulary audit; an independent execution/Validation/Run Evidence audit; Phase 3 or Phase 4 PHASE_VERIFIED; Phase 5 Reasoning Ledger.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Row | Concept | Result | Notes |
|---|---|---|---|
| A | WorkspaceBoundary / CanonicalPath | `MAPS_TO_EXISTING` | Via prepared Validation plan workspace |
| B | Explicit process approval | `MAPS_TO_EXISTING` | Caller supplies to Validation; Engineering Run never mints |
| C | Validation / process authorization | `MAPS_TO_EXISTING` | Consumes existing `ValidationAuthorization` only |
| D | PreparedValidationPlan + executeValidationPlan | `MAPS_TO_EXISTING` | Sole Validation execution path |
| E | Run Evidence build / applicability / summary | `MAPS_TO_EXISTING` | Sole evidence assembly and freshness path |
| F | ValidationOutcome / Result vocabulary | `MAPS_TO_EXISTING` | Aggregate outcome copied; no new classifier |
| G | Evidence identity / WeakMap registries | `MAPS_TO_EXISTING` | Object identity; JSON cannot authenticate |
| H | Currentness / declared-input scope | `MAPS_TO_EXISTING` | Delegates to `checkRunEvidenceApplicability` |
| I | CompletionReport domain shape | `MAPS_TO_EXISTING` (optional pure map) or honest deferral | Must not invent competing completion vocabulary |
| J | Reasoning Ledger / Claim / Hypothesis | `NOT_APPLICABLE` | Phase 5; stable IDs only for future citation |
| K | Package-public engineering-run surface | `NOT_APPLICABLE` | Internal like execution/validation/run-evidence |
| L | New EngineeringRunApproval / parallel authority | `NOT_APPLICABLE` | Forbidden for V1 |

No `BLOCKING_GAP` for V1 Engineering Run composition.

---

## Purpose

Engineering Run is an **application composition**, not a new low-level mechanism.

```text
PreparedValidationPlan + ValidationAuthorization
        ↓
executeValidationPlan
        ↓
ValidationPlanResult (preserved exactly)
        ↓
buildRunEvidence
        ↓
EngineeringRunRecord
```

It coordinates existing Phase 4 surfaces into one truthful application-level operation.

---

## Frozen V1 API mappings

| Operation | Module |
|---|---|
| `executeEngineeringRun` | `src/engineering-run/execute.ts` |
| `checkEngineeringRunApplicability` | `src/engineering-run/applicability.ts` |
| `summarizeEngineeringRun` | `src/engineering-run/summary.ts` |

| Type | Module |
|---|---|
| `EngineeringRunRecord` | `src/engineering-run/types.ts` |
| `EngineeringRunSummary` | `src/engineering-run/types.ts` |
| `EngineeringRunApplicabilityObservation` | `src/engineering-run/types.ts` |

**No** `prepareEngineeringRun` / `authorizeEngineeringRun` wrappers unless they add real composition value (V1: none).

---

## Authority invariant

Engineering Run receives authority already earned by Validation/Execution.

It must **never**:

- mint `ExplicitLocalProcessApproval` or process authorization;
- bypass Validation authorization;
- spawn / invoke `child_process`;
- reimplement termination, hashing, snapshot verification, or Validation classification;
- fabricate process results;
- accept caller-supplied old process results as new evidence;
- widen executable, argv, cwd, env, timeout, check kinds, subject scope, policy, or process count;
- resurrect consumed/refused underlying authorization;
- automatically retry.

A second `executeEngineeringRun` with the same consumed authorization must fail.

---

## Completion vs infrastructure failure

| Case | Shape |
|---|---|
| Validation checks fail / inconclusive / not-attempted | **Completed** EngineeringRunRecord with historical failure preserved; Run Evidence assembled when permitted |
| Foreign plan / auth consume failure / evidence association failure / invariant break | **Result failure** — Engineering Run could not be completed |

Ordinary nonzero compiler/test results are **not** infrastructure exceptions that destroy evidence.

---

## Historical vs current

`EngineeringRunRecord` is historical.

`checkEngineeringRunApplicability` returns a **new** point-in-time observation by delegating to `checkRunEvidenceApplicability`. It never mutates the historical record and never upgrades an old failure to PASS.

---

## Summary

Allowlisted informational fields only. JSON deserialization must **not** recreate an authentic `EngineeringRunRecord`.

---

## CompletionReport

Prefer a pure mapping onto existing `CompletionReport` **only** if it can be done without inventing payloads or overclaiming. Otherwise defer and record the deferral in the implementation report.

---

## Reasoning Ledger compatibility (without implementing it)

The record must stably identify for future Gate 2 citation:

- exact Validation result id;
- exact Run Evidence id;
- declared observed-input scope;
- criterion evaluated;
- historical aggregate outcome / criterionSatisfied.

Do **not** add Claim, Hypothesis, LexicalReference, VerifiedIntent, model outputs, or AST/symbol layers.

---

## Explicit non-goals

Reasoning Ledger, providers, persistence, autonomous repair, sandbox, browser, database, MCP, PTY, second executor/validator/classifier, package-root export, Phase 5 implementation, ledger phase promotion.
