# PATH CODE — PHASE 5A REASONING CONTRACTS IMPLEMENTATION REPORT

**Status:** PASS  
**Branch:** `cursor/phase5a-reasoning-contracts`  
**Contract:** `docs/passes/PHASE_5A_REASONING_CONTRACTS.md`  
**State line:**

```text
PHASE 5A REASONING CONTRACTS IMPLEMENTED — TYPES ONLY — NOT RUNTIME ENFORCED
```

---

## 1. Worktree / branch / SHA

| Field | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Starting branch | `cursor/phase4-execution-core` |
| Starting HEAD | `bfd6fc5b5ec8888363b90745ba72e06db96198a1` |
| Working branch | `cursor/phase5a-reasoning-contracts` (created in-place; no new worktree) |
| Implementation commit | `a95fde1a3b866e8c6723b17034083f0c0f1825ac` |
| Main (unchanged) | `bfd6fc5b5ec8888363b90745ba72e06db96198a1` |
| Phase 4 branch preserved | yes (`refs/heads/cursor/phase4-execution-core`) |
| Merge / push | none |

Budget: start `2026-09-06T14:27:00Z`; deadline `2026-09-06T15:27:00Z`; canonical check completed `2026-09-06T14:35:36Z`.

---

## 2. Changed paths

| Path | Role |
|---|---|
| `docs/passes/PHASE_5A_REASONING_CONTRACTS.md` | Governing instruction + FOUNDATION COMPATIBILITY PREFLIGHT + API mapping |
| `src/reasoning/types.ts` | Types-only contract model |
| `src/reasoning/index.ts` | Explicit `export type` barrel |
| `tests/reasoning/type-contracts.ts` | Compile-only finite proofs (not Vitest-executed) |
| `tests/reasoning/architecture.test.ts` | Runtime architecture assertions A01–A03 (+ import side-effect check) |

No edits outside allowed paths. `package.json`, `vitest.config.ts`, `tsconfig.json`, ledgers, and prior production layers unchanged.

---

## 3. Source-to-contract mappings

| Consumed concept | Mapping result | Location |
|---|---|---|
| `RepositoryEntry` | Type-only EXISTS subject | `src/inventory/types.ts` |
| `ContentObservation` | Type-only CONTENT/CONTAINS/DEFINES/BEHAVES source | `src/reader/types.ts` |
| `ManifestEvidence` | Type-only DEPENDS_DECLARED subject | `src/metadata/types.ts` |
| `RepositorySnapshot` | Bound context | `src/snapshot/types.ts` |
| `WorkspaceBoundary` | Bound context | `src/domain/workspace.ts` |
| `EngineeringRunRecord` | Citation target (`CITED_RUN_ONLY`) | `src/engineering-run/types.ts` |
| `ValidationCheckKind` | EXECUTION obligation vocabulary | `src/validation/types.ts` |
| Global ActionClass / KnowledgeState / Provenance / EvidenceKind / ValidationOutcome | Not extended | reasoning-local vocab only |

Compatibility preflight: no `BLOCKING_GAP`. Preserve `NOT PHASE_VERIFIED`.

---

## 4. Exported internal type names

From `src/reasoning/index.ts` (`export type` only):

`DeferredContentCheckRequirement`, `EngineeringRunCitation`, `ExecutionVerificationRequirement`, `NonEmptyReadonlyArray`, `ObservationVerificationRequirement`, `ProposedClaim`, `ProposedEvidenceReference`, `ReasoningClaimKind`, `ReasoningHypothesis`, `ReasoningProposal`, `ReasoningProposalSchemaVersion`, `ReasoningRefusal`, `ReasoningRefusalCode`, `ReferenceBindingStage`, `ReferenceBoundClaim`, `ReferenceBoundClaimShape`, `ReferenceBoundContext`, `ReferenceBoundReasoning`.

### Distinctions

| Layer | Meaning |
|---|---|
| `ProposedEvidenceReference` / `ProposedClaim` / `ReasoningProposal` | Untrusted identifiers/path hints and propositions |
| `ReferenceBoundClaimShape` | Kind-correlated field relationships (unbranded; not authenticated) |
| `ReferenceBoundClaim` | Shape + private unique-symbol brand (opaque; no binder) |
| `requiredVerification` | Obligation (`OBSERVATION` / `DEFERRED_CONTENT_CHECK` / `EXECUTION`) — not a verification result |
| `EngineeringRunCitation` | Association input citing authentic `EngineeringRunRecord` — not claim certification |

### Six-kind bound mapping

| Kind | Bound source | `requiredVerification` |
|---|---|---|
| EXISTS | `RepositoryEntry` | OBSERVATION |
| CONTENT | `ContentObservation` | OBSERVATION |
| DEPENDS_DECLARED | `ManifestEvidence` + dependency name | OBSERVATION |
| CONTAINS | `ContentObservation` + needle | DEFERRED_CONTENT_CHECK |
| DEFINES | Nonempty `ContentObservation[]` + symbol | EXECUTION (+ checkKinds/purpose) |
| BEHAVES | Nonempty `ContentObservation[]` + scenario | EXECUTION (+ checkKinds/purpose) |

Binding stage is always `REFERENCES_ONLY`. No `isVerified`, `truth`, or OBSERVED/PROVEN upgrade fields.

---

## 5. Requirement-to-proof map

| ID | Proof location / assertion |
|---|---|
| T01 | `type-contracts.ts` — six `ProposedClaim` variants + empty citations + `ReasoningProposal` |
| T02 | Six `ReferenceBoundClaimShape` witnesses with locked source/method pairs |
| T03 | Proposed ↛ bound; proposal ↛ bound reasoning; **unbranded shape ↛ branded claim** (opacity separate from field constraints) |
| T04 | Path/ID/plain object rejected by subject acceptors for Entry/Content/Manifest |
| T05 | Wrong evidence categories rejected for CONTENT / DEPENDS_DECLARED |
| T06 | DEFINES/BEHAVES reject OBSERVATION and incomplete EXECUTION requirement |
| T07 | CONTAINS rejects OBSERVATION/EXECUTION methods and `isVerified` excess property |
| T08 | INFERRED empty basis rejected; hypotheses ↛ bound/proposed claims |
| T09 | Proposed/bound ↛ PreparedChange / EditAuthorization / process / Validation authority types |
| T10 | Citation requires `EngineeringRunRecord` + nonempty check IDs; string/JSON substitutes fail |
| T11 | Readonly `.push` rejected on claims/citations/hypothesis/check-id arrays |
| T12 | Exhaustive switches for kinds/refusals; incomplete CONTAINS consumer fails `assertNever` |
| A01 | Architecture test — TS parser: no functions/classes/enums/value imports; no node/runtime primitives |
| A02 | Emitted `dist/reasoning/*.js` has empty runtime exports; package `exports` remains `["."]` |
| A03 | No non-reasoning `src/**` imports of reasoning |

Compile-time proof fixtures: **1 file** (`tests/reasoning/type-contracts.ts`), covering **T01–T12** (not counted as runtime tests).  
Runtime architecture tests: **5** in `tests/reasoning/architecture.test.ts`.

---

## 6. Bounded live type falsification

Snapshot SHA-256 of `tests/reasoning/type-contracts.ts` before mutation:  
`83f336834be6aaf32c01de9432d06713be1d6692854c72c91a681cf0773cca93`

Removed only `@ts-expect-error` directives tagged T03, T06, and T09 in one batch. One `npm run typecheck` then produced intended errors, including:

| Requirement | Representative diagnostic |
|---|---|
| T03 | ProposedClaim ↛ ReferenceBoundClaim; ReasoningProposal ↛ ReferenceBoundReasoning; **unbranded shape ↛ ReferenceBoundClaim** (brand opacity) |
| T06 | `ObservationVerificationRequirement` ↛ `ExecutionVerificationRequirement`; incomplete `{ method: "EXECUTION" }` rejected |
| T09 | Proposed/bound ↛ PreparedChange, EditAuthorization, LocalProcessAuthorization, ValidationAuthorization, PreparedLocalProcess, PreparedValidationPlan |

Restored exact snapshot bytes; hash match **yes**; typecheck exit **0** after restore. Production files were not mutated for this proof.

---

## 7. Canonical verification

| Attempt | Result |
|---|---|
| 1 (final) | **PASS** — exit 0 |

| Stage | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| tests | **79/79 files**, **745/745 tests**, zero required failures/skips, zero worker/unhandled errors |
| cli:smoke | PASS |
| ledger:verify | PASS at `bfd6fc5b5ec8888363b90745ba72e06db96198a1` |
| Scheduling | unchanged (`maxWorkers=2`, `src-lock-serial`) |
| Duration (vitest) | 121.71s |

### Runtime totals (separate from compile-time proofs)

| Metric | Baseline (Phase 4 status) | Final | Delta |
|---|---|---|---|
| Test files | 78 | 79 | +1 (`tests/reasoning/architecture.test.ts`) |
| Runtime tests | 740 | 745 | +5 |
| Compile-only proof file | — | 1 (`type-contracts.ts`) | not in Vitest collection |

Tested load-bearing source/test/config bytes equal committed implementation candidate (`COMMITTED_BYTES_MATCH_TESTED=yes`).

---

## 8. Non-claims / honest limits

- Static contracts only: JSON parsing, runtime authenticity, source binding, same-snapshot membership, freshness, and admission enforcement are **not** implemented.
- Type assertions / `any` / hostile same-process code can evade compile-time discipline; no hostile-JavaScript security proof.
- A reference or citation does not prove a statement follows from evidence; a test pass does not prove universal behavior.
- CONTAINS checking is deferred; no content-search, AST, or symbol extraction added.
- Observed dependency declaration does not establish installation/use; negative search does not prove absence.
- A cited run may be failed/stale; later Gate 2 must check result, scope, check membership, and applicability without upgrading it.
- Readonly types do not freeze external mutable runtime aliases.
- No live model, autonomous loop, write, process, memory store, CLI wiring, new permission, or phase promotion in this slice.
- Zero runtime production behavior in `src/reasoning/**`; zero new dependencies; zero package-export surface change; zero backward imports into earlier layers.

---

## 9. Final state

- Branch: `cursor/phase5a-reasoning-contracts`
- Implementation HEAD: `a95fde1a3b866e8c6723b17034083f0c0f1825ac`
- Main: `bfd6fc5b5ec8888363b90745ba72e06db96198a1` (unchanged)
- Worktree clean after report commit (report SHA returned separately)
- No leftover task-owned work; Phase 5B/5C not started; no merge/push
