# PATH CODE — PHASE 5D2: ENGINEERING ORCHESTRATOR CORE
## Contract + foundation mapping — bounded reasoning + authorized validation; no automatic code editing

**Basis:** `PathCode_Phase5D2_Engineering_Orchestrator_Core_Cursor_Implementation_FINAL.md` (governing instruction; replaces the earlier 5D2 draft).  
**Active worktree:** `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`  
**Start branch / HEAD:** `cursor/phase5d1-engineering-brain` @ `f80dece750fb3672cf803ee939aeadf1e94cbccc`  
**Working branch:** `cursor/phase5d2-orchestrator-core` (same worktree)  
**Main after authorized 5D1 FF:** `f80dece750fb3672cf803ee939aeadf1e94cbccc` (stays here for this assignment)  
**Budget start (UTC):** `2026-09-07T11:00:35Z` · **Deadline:** `2026-09-07T13:00:35Z`

This pass implements a package-internal Engineering Cycle conductor that connects Brain → Gate 1 → (optional) Gate 2 prepare → Engineering Run → Gate 2 evaluate. It revises **reasoning proposals**, never repository code. It never mints approval or ValidationAuthorization. Automatic editing, candidate management, content search, live providers, persistence, CLI, Git automation, and phase promotion are **OUT OF THIS PASS**.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Consumed concern | Decision | Result |
|---|---|---|
| Brain invoke/describe/dispose, normalized requests, receipts, limits, clock/cancellation | Reuse existing owner operations; no duplicate parser/verifier | `MAPS_TO_EXISTING` |
| Gate 1 catalog descriptors/registration/context, JSON binder, applicability, refusal discriminants | Reuse `bindReasoningProposalJson`, `checkReferenceBoundReasoningApplicability`, `describeReferenceCatalog` | `MAPS_TO_EXISTING` |
| Gate 2 preparation/evaluation/applicability, claim/check coverage | Reuse `prepareExecutionEvidencePlan`, `evaluateExecutionEvidence`, `checkExecutionEvidenceAssessmentApplicability` | `MAPS_TO_EXISTING` |
| Prepared Validation plan + caller-issued ValidationAuthorization | Pass through exact existing objects; no approval/authorization mint | `MAPS_TO_EXISTING` |
| Claim/check assignment | Fixed trusted caller `ClaimCheckAssignmentInput[]`; Gate 2 validates | `MAPS_TO_EXISTING` |
| Engineering Run execution/result/binding | `executeEngineeringRun` once with exact plan+auth | `MAPS_TO_EXISTING` |
| Session/context registration / catalog association | Owner read-only projection `inspectLiveReferenceCatalogAssociation` (indispensable) | `MAPS_TO_EXISTING` (additive projection) |
| Plan+authorization unused compatibility | Owner read-only `inspectValidationPlanAuthorizationCompatibility` | `MAPS_TO_EXISTING` (additive projection) |
| Stop during multi-check execution | Existing control insufficient → optional AbortSignal forward | `AMENDMENT_REQUIRED` — see `PHASE_5D2_VALIDATION_STOP_AMENDMENT_1.md` |
| Cycle states/record | Application-local control/telemetry only | `MAPS_TO_EXISTING` (new local types) |
| Result / Foundation | Reuse `src/domain/result.ts` | `MAPS_TO_EXISTING` |
| Automatic editing / candidate promotion / content search | Explicitly deferred | `NOT_APPLICABLE` |
| Active process cancellation / process-host redesign | Not authorized | `NOT_APPLICABLE` |

**BLOCKING_GAP:** none at contract time. Essential associations are obtainable via existing registries plus the two authorized read-only projections and the stop amendment.

---

## API mapping appendix (pinned from committed owners)

### Brain (`src/brain/`)

| Item | Actual |
|---|---|
| Open | `createEngineeringBrain(adapter, limits?) -> Result<EngineeringBrain, BrainConfigurationFailure>` |
| Invoke | `brain.invoke(BrainInvocationRequest, { signal? }?)` |
| Describe / dispose | `brain.describe()`, `brain.dispose()` — **borrowed**; cycle must not dispose |
| Purpose | `PROPOSE_REASONING` \| `REVISE_REASONING` |
| Context | `BrainContextPacket` — `references: BrainReferenceDescriptor[]`, `blocks: BrainContextBlock[]` |
| Bounds | `MAX_CONTEXT_BLOCKS=32`, `MAX_CONTEXT_BLOCK_TEXT_UTF8_BYTES=32768`, `MAX_PREPARED_REQUEST_UTF8_BYTES=262144`, `DEFAULT_TIMEOUT_MS=60000`, `HARD_MAX_TIMEOUT_MS=300000` |
| Clock | `readMonotonicMs()` / `readWallMs()` — reused for cycle admission (lookup `performance.now` when read) |
| Size helper | `utf8ByteLength` |
| Failure codes | `BrainInvocationFailureCode` incl. `TIMED_OUT`, `CANCELLED`, transport/refusal/incomplete/busy/budget… |

### Gate 1 (`src/reasoning/`)

| Item | Actual |
|---|---|
| Bind | `bindReasoningProposalJson(jsonText, liveCatalog)` |
| Applicability | `checkReferenceBoundReasoningApplicability(reasoning, liveCatalog)` |
| Descriptors | `describeReferenceCatalog(catalog)` |
| Six refusal codes | `UNBOUND_CLAIM`, `EVIDENCE_IDENTITY_MISMATCH`, `STALE_EVIDENCE`, `GROUNDING_OVERCLAIM`, `UNVERIFIABLE_IN_PRECONDITION`, `CLAIM_OUTSIDE_ADMITTED_SET` |
| INPUT codes | `NON_STRING_INPUT`, `INVALID_JSON`, `SCHEMA_INVALID`, `LIMIT_EXCEEDED`, `FORBIDDEN_FIELD`, `DUPLICATE_CLAIM_ID`, `DUPLICATE_HYPOTHESIS_ID`, `DANGLING_INFERENCE_BASIS` |
| CATALOG codes | `INVALID_CATALOG`, `DISPOSED_CATALOG`, `INCOMPATIBLE_CONTEXT`, `SELECTION_REJECTED`, `CONFIG_FAILURE`, `RESTRICTIONS_CHANGED`, `RESULT_NOT_REGISTERED`, `CATALOG_MISMATCH` |
| Association | `resolveRegisteredBoundReasoningAssociation` (existing) |
| New projection | `inspectLiveReferenceCatalogAssociation(catalog)` → workspace/snapshot/live + frozen descriptor copies |

### Gate 2 (`src/reasoning/gate2/`)

| Item | Actual |
|---|---|
| Prepare | `prepareExecutionEvidencePlan({ reasoning, catalog, validationPlan, assignments })` |
| Evaluate | `evaluateExecutionEvidence(plan, engineeringRun)` |
| Final applicability | `checkExecutionEvidenceAssessmentApplicability(assessment)` |
| Assignment shape | `{ claimId: string, selectedCheckIds: readonly string[] }` |
| Decisions | `EXECUTION_EVIDENCE_ACCEPTED` \| `EXECUTION_EVIDENCE_NOT_ESTABLISHED` |

### Validation / Engineering Run

| Item | Actual |
|---|---|
| Plan | `PreparedValidationPlan` (branded); prepare via caller |
| Auth | `ValidationAuthorization` (branded); issue via caller `authorizeValidationPlan` |
| Execute Validation | `executeValidationPlan(plan, authorization, options?: { signal? })` — signal per amendment |
| Engineering Run | `executeEngineeringRun(plan, authorization, options?: { signal? })` |
| Auth inspect | `inspectValidationPlanAuthorizationCompatibility(plan, authorization)` — unused status; **does not consume** |
| Process budget | Sum of `preparedProcess.timeoutMs` + `LOCAL_PROCESS_TERMINATION_GRACE_MS` + `LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS` per check |

---

## Internal orchestrator API (`src/orchestrator/`)

```ts
openEngineeringCycle(session, options?)
  -> Result<EngineeringCycle, CycleConfigurationFailure>

EngineeringCycle.run(task, { signal? }?)
  -> Promise<Result<CycleOutcome, CycleFailure>>

EngineeringCycle.describe() -> CycleDescriptorView
EngineeringCycle.close() -> void
summarizeEngineeringCycle(record) -> CycleSummary
```

Not on package root. No package subpath.

### Session modes

| Mode | Required |
|---|---|
| `BIND_ONLY` | workspace + snapshot + live catalog + constructed Brain (by identity) |
| `BIND_AND_VALIDATE` | all of BIND_ONLY + authentic `PreparedValidationPlan` + matching unused `ValidationAuthorization` + frozen claim/check assignments |

### Seven terminal states

`BOUND` | `SUBSTANTIATED` | `NOT_SUBSTANTIATED` | `EXHAUSTED` | `FAILED` | `CANCELLED` | `TIMED_OUT`

Intermediate (non-terminal): `DRAINING`, plus internal control phases. Rejected calls: `BUSY`, `CYCLE_ALREADY_RUN`, construction failures — not terminal transitions of an active run.

### Revision policy (pinned)

| Owner outcome | Coordinator |
|---|---|
| `UNBOUND_CLAIM`, `EVIDENCE_IDENTITY_MISMATCH`, `GROUNDING_OVERCLAIM` | Eligible revision |
| `STALE_EVIDENCE` | Terminal `FAILED` / `EVIDENCE_STALE` |
| `CLAIM_OUTSIDE_ADMITTED_SET` | Terminal scope/denial |
| `UNVERIFIABLE_IN_PRECONDITION` | Terminal |
| INPUT eligible: `INVALID_JSON`, `DUPLICATE_CLAIM_ID`, `DUPLICATE_HYPOTHESIS_ID`, `DANGLING_INFERENCE_BASIS` | Eligible revision |
| INPUT terminal: `NON_STRING_INPUT`, `SCHEMA_INVALID` (conservative — includes unsupported version), `LIMIT_EXCEEDED`, `FORBIDDEN_FIELD` | Terminal |
| All `CATALOG` | Terminal |
| Unknown discriminant | Terminal internal-contract failure |
| Brain transport/refusal/incomplete/busy/budget/auth | Terminal retaining Brain code |
| Brain `TIMED_OUT` shorter than cycle deadline | Terminal `BRAIN_TIMED_OUT` (not whole-cycle timeout) |
| Caller cancel / close / cycle deadline | `CANCELLED` / `TIMED_OUT` |
| Gate 2 negative evidence | `NOT_SUBSTANTIATED` — no validation retry |

**Note:** `CREATION_WITHOUT_SEARCH` is **not** a Gate 1 code and is not invented.

### Bounds (V1)

| Control | Value |
|---|---|
| Brain attempts | default 3, integer 1..5 |
| Engineering Runs | 0 bind-only; ≤1 validation |
| Concurrent run | 1; sync reservation before first await |
| Cycle admission deadline | default 600_000 ms; 1..1_800_000 |
| Per-Brain timeout | default 60_000; min(configured, remaining cycle); honor Brain ceiling |
| Diagnostic block | ≤4096 UTF-8 bytes; role `DIAGNOSTIC`; at most one latest |
| Provider/validation retries | 0 |

### Ownership

- Brain and catalog are **BORROWED**. `close()` cancels cycle work; does not dispose them.
- Capture Brain object identity + `invoke`/`describe` method references at open.
- Never call `explicitLocalProcessApproval`, `authorizeValidationPlan`, edit authorization, or construct PreparedValidationPlan.
- `executeEngineeringRun` at most once with exact caller plan+auth.

### Deferred (NOT_APPLICABLE)

Automatic code editing; edit-recipe profile; candidate workspaces; keep/discard/rollback; content search; AST/symbol index; live adapter/provider router; persistent memory; CLI; daemon; Git automation; full coding-agent completion; filesystem-read-only/sandbox claims.

---

## Source layout

Preferred: `src/orchestrator/` — `types.ts`, `bounds.ts`, `failures.ts`, `feedback.ts`, `packet.ts`, `summary.ts`, `cycle.ts`, `index.ts`.

Allowed earlier-owner edits: catalog association projection; Validation plan/auth compatibility inspect; optional stop-signal forwarding (amendment 1); narrow barrel exports; architecture allowlists.

Earlier owners must not import orchestrator.
