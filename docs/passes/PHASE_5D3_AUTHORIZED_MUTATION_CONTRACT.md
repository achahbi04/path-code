# PATH CODE — PHASE 5D3: AUTHORIZED MUTATION ARC
## Contract + foundation mapping — propose exact text changes, obtain existing authority, apply, re-observe, validate

**Basis:** `PathCode_Phase5D3_Authorized_Mutation_Arc_Cursor_Implementation_FINAL.md`  
**Active worktree:** `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`  
**Start branch / HEAD:** `cursor/phase5d2-orchestrator-core` @ `8ee7488cddf999f9c3a21dd4f1777cddb908258d`  
**Working branch:** `cursor/phase5d3-authorized-mutation` (same worktree)  
**Main after authorized 5D2 FF:** `8ee7488cddf999f9c3a21dd4f1777cddb908258d` (stays here for this assignment)  
**Budget start (UTC):** `2026-09-07T13:01:33Z` · **Deadline:** `2026-09-07T15:01:33Z`

This pass implements a package-internal mutation session that stages: Brain edit-proposal → Gate 1 → Phase 3 prepare → trusted review → caller-issued EditAuthorizations → Phase 3 apply → Phase 2 re-observe → new Validation plan review → caller-issued ValidationAuthorization → existing 5D2 BIND_AND_VALIDATE. It never mints approval. Policy is **in-place, without automatic rollback**. No candidate workspace, Git automation, live provider, CLI, or uncontrolled correction loop.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

Committed four result values from accepted 5D2 evidence (`docs/reports/PHASE_5D2_ORCHESTRATOR_CORE_REPORT.md`):

| Field | Value |
|---|---|
| Canonical tested HEAD | `6d87db68853f6647cb4b75cbcd4779c9a00f8146` |
| Attempt 1 | FAIL (architecture reverse-import bans; 845/847 otherwise green) |
| Attempt 2 | PASS exit 0 — **87 files / 847 tests** |
| Report commit | `8ee7488cddf999f9c3a21dd4f1777cddb908258d` (docs-only after PASS) |

| Concern | Decision | Result |
|---|---|---|
| Existing editing kinds, bounds, authority and partial outcomes | Compose unchanged Phase 3B/3C/3D owners | `MAPS_TO_EXISTING` |
| Existing Phase 2 evidence and post-write admission | New inventory/reader/snapshot; never relabel authored after-bytes | `MAPS_TO_EXISTING` |
| Review/session artifacts | Local association and scheduling only; NOT action authority | Local only |
| Brain edit-proposal profile | Additive local profile; same controller | `AMENDMENT_REQUIRED` — see `PHASE_5D3_BRAIN_EDIT_PROFILE_AMENDMENT_1.md` |
| Mutation module calling prepare/apply/re-observe/prepare-validation | Explicit new consumer; old 5D2 modes unchanged | Explicit permission |
| Gate 1 and Gate 2 semantics | Unchanged; no pre-edit/post-edit substitution | Unchanged |
| Isolated candidate promotion/rollback | Not promised in V1 | `NOT_APPLICABLE` |
| Live provider, CLI and Git automation | Out of pass | `NOT_APPLICABLE` |
| Edit auth unused compatibility | Narrow read-only projection wrapping existing readiness | Additive projection |
| Catalog ENTRY eligibility for DESCENDED directories | Narrow eligibility so CREATE parent EXISTS can bind | `AMENDMENT_REQUIRED` — `catalogEligibleEntrySet` |
| Snapshot verify entry scope for DESCENDED directories | Narrow eligibility so Gate 1 EXISTS currentness can run | `AMENDMENT_REQUIRED` — `verificationEligibleEntries` |
| **BLOCKING_GAP** | **none** | |

---

## API mapping appendix (pinned from committed owners)

### Brain (`src/brain/`)
- `createEngineeringBrain`, `brain.invoke`, `describe`, `dispose` (borrowed)
- New: `ENGINEERING_EDIT_PROPOSAL_JSON` v1 + purpose `PROPOSE_EDIT`
- Legacy default: `REASONING_PROPOSAL_JSON` v1

### Gate 1 (`src/reasoning/`)
- `bindReasoningProposalJson(exactEmbeddedString, liveCatalog)`
- `checkReferenceBoundReasoningApplicability`
- `inspectLiveReferenceCatalogAssociation` / `createReferenceCatalog` / `disposeReferenceCatalog`
- CONTENT claim → `subject: ContentObservation`; EXISTS → `subject: RepositoryEntry` (object identity)

### Phase 3 (`src/editing/`)
- `prepareModifyExistingFile` / `prepareCreateFile`
- `explicitEditApproval` / `authorizePreparedChange` — **trusted host only**
- `replaceExistingFile` / `createFile` / `createMultiFilePlan` / `executeMultiFilePlan`
- `validatePreparedBatchBounds`
- Projection: `inspectPreparedEditAuthorizationCompatibility` (non-consuming)

### Phase 2
- `loadProjectConfig`, `inventory`, `readRepositoryContent`, `buildRepositorySnapshot`
- Directory entries via inventory ADMITTED/DESCENDED; no synthesized root

### Validation / 5D2
- `prepareValidationPlan` against NEW observations
- `authorizeValidationPlan` — **trusted host only**
- `openEngineeringCycle` mode `BIND_AND_VALIDATE` with fresh catalog/snapshot/plan/auth

### Mutation session (`src/orchestrator/mutation/`)
```text
openEngineeringMutationSession(spec)
session.propose(task) -> MutationReview
session.apply(review, {prepared, authorization}[]) -> MutationValidationReview
session.validate(validationReview, ValidationAuthorization) -> MutationValidationOutcome
session.describe() / session.close()
summarizeMutationSession(record)
```

States: `READY → PROPOSING → AWAITING_EDIT_AUTHORIZATION → APPLYING → REOBSERVING → AWAITING_VALIDATION_AUTHORIZATION → VALIDATING → terminal`

---

## Policy (locked V1)

- In-place edits; **no automatic rollback**; multi-file is **not** a transaction
- 1..4 REPLACE_TEXT / CREATE_TEXT; complete UTF-8 after-content
- Never mint EditAuthorization / ValidationAuthorization / ExplicitEditApproval
- Never reuse pre-edit reasoning, observations, or Validation authority as post-edit evidence
- Never discard mutation evidence because a later stage failed
- Partial / COMMITTED_FAILURE / WRITE_OUTCOME_UNCONFIRMED stop ordinary validation continuation

---

## Architecture amendments

- Allow `src/orchestrator/mutation/**` as later consumer of brain/reasoning/editing/validation/orchestrator cycle
- Keep non-mutation orchestrator modules free of editing imports
- Keep package root exports unchanged; mutation barrel is package-internal only
