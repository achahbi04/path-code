# PATH CODE — PHASE 5C: EXECUTION EVIDENCE + GATE 2
## Contract + foundation mapping — bind configured checks to actual runs, not invented truth

**Basis:** `PathCode_Phase5C_Execution_Evidence_Gate2_Cursor_Implementation.md` (governing instruction).  
**Branch:** `cursor/phase5c-execution-evidence`  
**Start HEAD:** `72025ec1b51de140f538248d18ead3c68163d684` (accepted Phase 5B checkpoint)  
**Main after authorized 5B FF:** `72025ec1b51de140f538248d18ead3c68163d684`  
**Budget start (UTC):** `2026-09-06T17:14:58Z` · **Deadline:** `2026-09-06T18:44:58Z`

This pass implements a package-internal evidence gate. Acceptance means the explicitly associated required checks passed under their existing criterion, for matched declared inputs, with required applicability succeeding at assessment time. It does **not** prove prose entailment, symbol ownership, universal behavior, test sufficiency, semantic truth, or action authority.

Gate 2 does not approve, edit, spawn, retry, or call an executor. Real Engineering Runs are obtained only by tests through existing trusted-caller / Phase 4 APIs.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Consumed concept | Architectural decision |
|---|---|
| Gate 1 bound reasoning/catalog | Authenticate and recheck using actual owner (`lookupBoundReasoning` / `requireLiveCatalog` / `checkReferenceBoundReasoningApplicability`); preserve `REFERENCES_ONLY` |
| Prepared Validation plan/checks/subject | Reuse registered immutable plan; no command construction or approval |
| Engineering Run and Validation outcomes | Read authentic recorded association; no copied-ID authentication or new process classifier |
| Current applicability | Delegate to Gate 1 and Engineering Run applicability; no new reader/hash/policy path |
| Claim-to-check selection | Explicit trusted application specification; an association, not a new action permission |
| Gate 2 assessment/failure labels | Reasoning-local vocabulary only; no global state/evidence/authority amendment |
| New reasoning runtime area | Narrow named architecture evolution under `src/reasoning/gate2/`; earlier owners never import reasoning back |

Preserve all existing ledger states and the prospective forward-development decision. No independent audit, `PHASE_VERIFIED`, or completion of all Phase 5.

---

## Source mapping (pinned to committed owners)

### Reasoning (Gate 1)

| Item | Actual mapping |
|---|---|
| Bound result | `ReferenceBoundReasoning` (`src/reasoning/types.ts`) — `context.workspace` / `context.snapshot`; claims keep `bindingStage: "REFERENCES_ONLY"` |
| EXECUTION obligations | `DEFINES` / `BEHAVES` with `requiredVerification.method === "EXECUTION"` and nonempty `checkKinds` (`TYPECHECK` / `TARGETED_TEST` as minted by binder) |
| Subjects for EXECUTION | `subjects: NonEmptyReadonlyArray<ContentObservation>` |
| Catalog / registration | Opaque `ReferenceCatalog`; `registerBoundReasoning` / `lookupBoundReasoning` retain catalog + `retainedClaimSources` |
| Fresh applicability | `checkReferenceBoundReasoningApplicability(reasoning, liveCatalog)` |
| Citation shape | `EngineeringRunCitation` — `meaning: "CITED_RUN_ONLY"`, live `EngineeringRunRecord`, nonempty `selectedCheckIds` |
| 5B barrel | Five runtime functions unchanged on `src/reasoning/index.ts` |

### Validation

| Item | Actual mapping |
|---|---|
| Plan | `PreparedValidationPlan` — ordered `checks[]` (`id`, `kind`, `preparedProcess`), `declaredObservations`, `declaredEntries`, `workspace`, `snapshot`, `config`, `criterionId`, `scopeId` |
| Criterion / scope | `EXIT_CODE_ZERO_WITH_COMPLETE_EXECUTION_EVIDENCE` / `DECLARED_OBSERVED_INPUTS` |
| Result | `ValidationPlanResult` — `checkResults[]` with `verdict`, `planCriterionSatisfied`, `aggregateOutcome` |
| Existing binding | `resolveRegisteredValidationBinding(result, plan)` |
| **New projection (authorized)** | Register plan at `prepareValidationPlan`; `resolveRegisteredPreparedValidationPlan(plan)` exposes retained check/subject/`preparedProcess` association |

### Engineering Run / Run Evidence

| Item | Actual mapping |
|---|---|
| Record | `EngineeringRunRecord` embeds authentic `validationResult` + `runEvidence`; registry retains `plan` |
| Applicability | `checkEngineeringRunApplicability(run, plan, workspace)` |
| Check rows | Prefer authentic `validationResult.checkResults` (inherited verdicts); Run Evidence rows are parallel summaries |
| **New projection (authorized)** | `resolveRegisteredEngineeringRunBinding(run)` → `{ run, plan, validationResult, runEvidence }` |
| Execute | `executeEngineeringRun` — **tests only**; Gate 2 production must not call it |

### Missing association (recorded)

Original `ValidationCheckSpec` / `LocalProcessRequest` input objects are not retained as separate objects — only flattened `PreparedLocalProcess` fields. Gate 2 freezes association to ordered check definitions and prepared-process identities (`preparedId` / executable / argv / cwd / envSnapshot / limits / config), not reconstructed requests. This is sufficient; no filesystem reconstruction.

---

## Internal Gate 2 API (`src/reasoning/gate2/`)

```ts
prepareExecutionEvidencePlan(input)
  -> Promise<Result<ExecutionEvidencePlan, ExecutionEvidenceFailure>>

evaluateExecutionEvidence(plan, engineeringRun)
  -> Promise<Result<ExecutionEvidenceAssessment, ExecutionEvidenceFailure>>

checkExecutionEvidenceAssessmentApplicability(assessment)
  -> Promise<Result<ExecutionEvidenceApplicabilityObservation, ExecutionEvidenceFailure>>
```

Package-internal only. Not on package root. Not added to the five-function 5B barrel.

### Failure codes (reasoning-local)

`INVALID_INPUT` · `LIMIT_EXCEEDED` · `UNREGISTERED_ARTIFACT` · `INVALID_CLAIM_CHECK_MAPPING` · `NO_EXECUTION_OBLIGATIONS` · `CONTEXT_MISMATCH` · `PLAN_RUN_MISMATCH` · `SOURCE_NOT_IN_VALIDATION_SCOPE` · `UNSUPPORTED_CRITERION` · `CHECK_NOT_PASSED` · `APPLICABILITY_NOT_ESTABLISHED`

### Assessment decisions

- `EXECUTION_EVIDENCE_ACCEPTED` — nonempty fully covered EXECUTION set meeting §8 of the instruction
- `EXECUTION_EVIDENCE_NOT_ESTABLISHED` — genuine matching run with failed/inconclusive/refused/not-attempted checks or currentness failure (historical evidence preserved; never manufactured PASS)

### V1 bounds

- 1 live catalog, reasoning, prepared plan, Engineering Run per plan/evaluation
- 1..32 EXECUTION claims / assignment rows (within Gate 1 max)
- 1..8 distinct selected checks per claim (within Validation’s 1..8 total checks)
- nonempty IDs ≤128 UTF-8 bytes

---

## Trust boundary summary

1. Authenticate Gate 1 reasoning + live catalog; authenticate prepared Validation plan via new plan registration projection.
2. Freeze claim→check assignments to exact registered claim IDs and exact ordered plan check definitions / prepared processes.
3. Require every EXECUTION claim covered; every required `checkKinds` entry covered; selected check kinds ⊆ required kinds.
4. Every EXECUTION claim’s `ContentObservation` subjects must be among `plan.declaredObservations` by object identity.
5. Workspace/snapshot context: original object membership (`reasoning.context` ↔ catalog ↔ plan), not path/hash/generation equality.
6. Evaluation authenticates Engineering Run via owner binding; requires exact plan identity; compares ordered check IDs/kinds/prepared-process association; reads inherited Validation verdicts + `planCriterionSatisfied`; requires known criterion.
7. Fresh applicability: Engineering Run API **and** Gate 1 API; recheck live registration after awaits.
8. Citations retained privately as `EngineeringRunCitation`; returned assessment exposes allowlisted correlation metadata only.
9. Historical assessment immutable; later applicability is a new observation, never a verdict upgrade or edit permission.

---

## Non-claims

Not a whole-repository seal; no atomic filesystem view; no hostile same-process guarantee; no content search/AST; no natural-language entailment; no test-discovery from exit 0; no external environment seal; no provider/autonomous loop/action authority. CONTAINS remains deferred. Non-EXECUTION claims and hypotheses remain unchanged.
