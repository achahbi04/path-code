# PATH CODE — PHASE 4C RUN EVIDENCE CONTRACT

**Status:** Implementation contract for scoped Run Evidence V1  
**Baseline HEAD:** `106b3a95ab7e69a3e219da2a79559c34fe4e2d88`  
**Branch:** `cursor/phase4-execution-core`  
**Governing instruction:** operator Phase 4C package  
**Validation base:** Phase 4B (`src/validation/**`)  
**Execution base:** Phase 4A (`src/execution/**`)

```text
CONTRACT FOR IMPLEMENTATION — NOT PHASE PROMOTION — NOT PHASE_VERIFIED
```

---

## Prospective project-state note

Forward development of Run Evidence is authorized on the implemented Phase 4A/4B components while keeping `safe-editing` and all existing ledger states unchanged.

This contract does **not** claim: Constitution §10 full closed-vocabulary audit; an independent execution/Validation audit; Phase 3 PHASE_VERIFIED; Phase 4 complete.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Row | Concept | Result | Notes |
|---|---|---|---|
| A | WorkspaceBoundary / CanonicalPath | `MAPS_TO_EXISTING` | Via Validation plan workspace |
| B | Explicit process approval | `NOT_APPLICABLE` | Run Evidence never mints or consumes approvals |
| C | Validation registry association | `MAPS_TO_EXISTING` | `resolveRegisteredValidationBinding` read-only projection |
| D | ContentObservation / snapshot verify | `MAPS_TO_EXISTING` | Fresh applicability delegates to Validation |
| E | ValidationOutcome / check verdicts | `MAPS_TO_EXISTING` | Copied unchanged from recorded result |
| F | Result / EvidenceKind domain vocabulary | `MAPS_TO_EXISTING` | No new domain EvidenceKind for this wrapper |
| G | Reasoning Ledger / persistence | `NOT_APPLICABLE` | In-memory only |
| H | Package-public run-evidence surface | `NOT_APPLICABLE` | Internal like execution/validation |

No `BLOCKING_GAP` for V1 Run Evidence.

---

## Frozen V1 API mappings

| Operation | Module |
|---|---|
| `buildRunEvidence` | `src/run-evidence/build.ts` |
| `checkRunEvidenceApplicability` | `src/run-evidence/applicability.ts` |
| `summarizeRunEvidence` | `src/run-evidence/summary.ts` |
| `resolveRegisteredValidationBinding` | `src/validation/binding.ts` (narrow read-only Validation helper) |

| Type | Module |
|---|---|
| `RunEvidenceRecord` | `src/run-evidence/types.ts` |
| `RunEvidenceSummary` | `src/run-evidence/types.ts` |
| `RunEvidenceApplicabilityObservation` | `src/run-evidence/types.ts` |
| `RunEvidenceCheckRow` | `src/run-evidence/types.ts` |
| `RunEvidenceCounts` | `src/run-evidence/types.ts` |

**Schema version:** `1` (local; not cryptographic attestation).

**Association:** authenticate via Validation registry projection — never by `resultId`/`planId`/JSON alone.

**Historical vs current:** assembly records history without requiring fresh applicability. `checkRunEvidenceApplicability` authenticates the evidence record registration, recovers the original Validation association, then calls `checkValidationResultApplicability`.

**Summary:** informational allowlist only; not authority after copy/JSON.

---

## Explicit non-goals

Reasoning Ledger, providers, persistence, autonomous repairs, sandbox, second executor/validator/classifier/freshness engine, package-root export, Phase 5.
