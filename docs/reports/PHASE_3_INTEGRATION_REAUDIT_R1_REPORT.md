# PATH CODE — PHASE 3 SAFE EDITING ENGINE
# INDEPENDENT FULL RE-AUDIT R1 (STAGE 3) — RERUN AFTER PHASE 3-R2

Governing instruction: `docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md`, Stage 3.

Audited checkpoint (Phase 3-R2 Stage 2 freeze HEAD): `8520ab97feb66112fd28e0b7525d949d843c2ca6`

**Supersession of the prior version of this path.** A previous Stage 3 execution
wrote this same contract-designated path at `ecda537f87ca63584fffe46bba67c6009def4219`,
auditing checkpoint `63f6e87c…`. Stage 3 §3.7 fixes this path as the sole report
output for Executor B, so this rerun necessarily writes it again. The prior
version remains immutable in Git at `ecda537f87ca63584fffe46bba67c6009def4219`
and was read during this audit **only as a repository artifact under audit**. Its
findings, diagnoses, classifications and conclusions were not accepted on the
strength of being committed; every fact relied upon below was re-established
mechanically against the current audited checkpoint.

---

## AUDITOR PROVENANCE

```text
executor product:                       Claude Code (claude-opus-5, 1M context)
session:                                new session; product exposes no
                                        stable user-visible session identifier
this executor session prior writes to
  Phase 3-R1 chain:                     NONE
hardening execution transcripts
  received:                             NO
R1 Stage 0–2 execution transcripts
  received:                             NO
failed-auditor substantive transcripts
  received:                             NO
R2 implementation transcripts /
  execution summary received:           NO
repository checkpoint received:         8520ab97feb66112fd28e0b7525d949d843c2ca6
other inputs received:                  the Stage 3 dispatch brief (which
                                        additionally carries the R2 handoff
                                        requirement that A-F19 include the
                                        AuthorizePreparedChangeOptions case);
                                        the repository at the above checkpoint
                                        in its entirety (contracts, masters,
                                        amendments, reports, ledgers, source,
                                        tests) as permitted evidence
prior failed-attempt metadata received: none — operator stated there are no
                                        prior Stage 3 attempts from this
                                        R2 Stage 2 checkpoint
operator attestation:                   Achahbi, 4 September 2026
report block presence admissibility:    REPOSITORY_RECORDED
independence claim admissibility:       ASSERTED — not mechanically proven;
                                        see GAP-055
```

No forbidden input class under §3.1 was present in this executor's context. No
context-contamination stop was triggered. This session performed no prior write
to this repository.

---

## 0. BASELINE GATE

| Gate | Observed |
|---|---|
| `git rev-parse HEAD` | `8520ab97feb66112fd28e0b7525d949d843c2ca6` — matches required checkpoint |
| `git status --porcelain` | empty (clean) |
| `npm run ledger:verify` | **PASS** at `8520ab97feb66112fd28e0b7525d949d843c2ca6` |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run cli:smoke` | **PASS** (shebang, `--help`, bare invocation, non-zero on unknown argument) |
| Runtime test total | **619 passed (619)**, 65 files passed (65) |
| Runtime dependencies | **0** (`package.json` declares no `dependencies` block) |
| Phase 4 artifacts | **absent** |

`npm run check` disposition is recorded in full in §9 and is **not** a clean
first run.

---

## 1. ORIGINAL PHASE 3 INTEGRATION AUDIT — FULL RE-ESTABLISHMENT

This is a full base audit, not a delta. No previous COMPLETE conclusion was
treated as substitute evidence.

### 1.1 B1 through B8

All executed at this checkpoint in
`tests/integration/phase3-safe-editing-audit.test.ts` and observed passing in the
clean full-suite run (§9, attempt 3):

| Dimension | Suite section | Result |
|---|---|---|
| B1 full read/write/re-observe fingerprint bridge | `Phase 3 integration audit — B1 full read/write/re-observe pipeline` | **PASS** |
| B2 authored mutation evidence → fresh repository re-observation | `— B2 authored then reobserved` | **PASS** |
| B3 stale snapshot / stale edit / fresh edit | `— B3 edit/verify/stale/fresh` | **PASS** |
| B4 Git point-in-time state | `— B4 git point-in-time` | **PASS** |
| B5 deny-path enforcement | `— B5 denial across surfaces` | **PASS** |
| B6 action-class enforcement | `— B6 action-class independence` | **PASS** |
| B7 ConfigFailure fail-closed plus ABSENT success | `— B7 config fail-closed and ABSENT` | **PASS** |
| B8 partial multi-file plan plus fresh re-observation | `— B8 partial plan then reobserve` | **PASS** |

### 1.2 Five recovery shapes

`Phase 3 integration audit — recovery shapes (induced)` — all five present and
passing, each induced through internal-only seams:

| Shape | Result |
|---|---|
| 3B PRECOMMIT: original intact and temp cleaned | **PASS** |
| 3B COMMITTED_FAILURE: commit reached, no rollback | **PASS** |
| 3C PREPUBLICATION: target unpublished and candidate cleaned | **PASS** |
| 3C COMMITTED_FAILURE: published target remains without rollback | **PASS** |
| 3D PARTIAL: prior commits remain; later not attempted; no rollback | **PASS** |

### 1.3 Write boundary and persistence/residue

- `tests/architecture/write-boundary.test.ts` mechanically sweeps every `.ts`
  file under `src/` for project-write primitives and permits them only in
  `src/editing/atomic-fs.ts`. **PASS.**
- Independent confirmation: exactly one project filesystem **write** module
  exists. Files importing `node:fs` at all are
  `src/config/existence.ts`, `src/config/reader.ts`, `src/editing/atomic-fs.ts`,
  `src/inventory/traverse.ts`, `src/reader/read.ts`,
  `src/snapshot/content-verify.ts`, `src/snapshot/entry-verify.ts`,
  `src/workspace/canonical-path.ts` — all read/stat only except the authorized
  write module.
- `Phase 3 integration audit — persistence scan helper` and
  `tests/editing/import-side-effects.test.ts`
  ("importing the public editing surface has no persistent side effects")
  both **PASS**. No durable hidden Path Code state.

### 1.4 SE-001 through SE-020 — phase-wide

Re-established phase-wide against the executed suites at this checkpoint
(619/619, §9 attempt 3). Each obligation is carried by live tests, not by a
prior conclusion:

| Obligation | Carrying evidence at this checkpoint | State |
|---|---|---|
| SE-001 NO UNVERIFIED MUTATION | B1/B2/B3 re-observation bridges; after-state verification in replace/create suites | SATISFIED_PHASE_WIDE |
| SE-002 AUTHORIZATION BINDS EXACT BYTES | `tests/editing/authorization.test.ts`, byte-fidelity cases | SATISFIED_PHASE_WIDE |
| SE-003 NO UNAUTHORIZED MUTATION | authorization refusal cases; `PREPARED_IDENTITY_MISMATCH`, `AUTHORIZATION_NOT_REGISTERED` | SATISFIED_PHASE_WIDE |
| SE-004 NO AUTONOMOUS AUTHORITY | `explicitEditApproval` sole approval boundary; `APPROVAL_REQUIRED` refusals | SATISFIED_PHASE_WIDE |
| SE-005 AUTHORIZATION IS SINGLE-USE | `AUTHORIZATION_ALREADY_CONSUMED`; "consumes authorization even when refusing" | SATISFIED_PHASE_WIDE |
| SE-006 DENIED PATHS ARE NEVER MUTATED | B5; `TARGET_DENIED` mutation-time C3 case | SATISFIED_PHASE_WIDE |
| SE-007 NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION | workspace canonicalization refusals; symlink refusal codes | SATISFIED_PHASE_WIDE |
| SE-008 EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED | `replace-existing-file` rename/atomic-platform cases | SATISFIED_PHASE_WIDE |
| SE-009 PRE-COMMIT RECOVERY | recovery shapes 3B PRECOMMIT / 3C PREPUBLICATION | SATISFIED_PHASE_WIDE |
| SE-010 AFTER-STATE IS VERIFIED | `AFTER_STATE_MISMATCH` / `AFTER_STATE_READ_FAILED` cases | SATISFIED_PHASE_WIDE |
| SE-011 PROVENANCE IS EARNED | `PATH_CODE_MODIFIED` only after commit; B2 provenance assertions | SATISFIED_PHASE_WIDE |
| SE-012 EXACT AUTHORIZED BYTES ONLY | CRLF/BOM/binary byte-fidelity cases (replace and create) | SATISFIED_PHASE_WIDE |
| SE-013 BOUNDS HOLD | `tests/editing/bounds.test.ts`; `validatePreparedBatchBounds` | SATISFIED_PHASE_WIDE |
| SE-014 NO DURABLE HIDDEN PATH CODE STATE | import-side-effects + persistence scan | SATISFIED_PHASE_WIDE |
| SE-015 KNOWLEDGE INVALIDATED, NOT REPAIRED | `KnowledgeInvalidation` aggregation cases | SATISFIED_PHASE_WIDE |
| SE-016 WRITE BOUNDARY HOLDS | `write-boundary.test.ts` + §1.3 sweep | SATISFIED_PHASE_WIDE |
| SE-017 CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED | "refuses content changed during temp preparation on final read"; `STALE_BEFORE_STATE` | SATISFIED_PHASE_WIDE |
| SE-018 GIT SAFETY | B4; `GIT_UNMERGED` refusals; POINT_IN_TIME honesty | SATISFIED_PHASE_WIDE |
| SE-019 SAFE CREATION | `create-file` absence precondition, `TARGET_ALREADY_EXISTS`, `ABSENCE_UNVERIFIABLE` | SATISFIED_PHASE_WIDE |
| SE-020 MULTI-FILE PARTIAL HONESTY | B8; `NOT_ATTEMPTED` carries no unchanged claim; `PARTIALLY_COMMITTED` | SATISFIED_PHASE_WIDE |

### 1.5 Phase 3B-H1 and Phase 3C-H1 corrections

Both correction sets remain live at this checkpoint and were exercised in the
clean run:

- **3B-H1** — mutation-time config re-resolution fail-closed. Cases C1
  (`CONFIG_RELOAD_FAILED` on corrupted `PATHCODE.md` after authorize), C2
  (successful ABSENT after deletion, mutation proceeds), C3 (`TARGET_DENIED`
  not `CONFIG_RELOAD_FAILED`) all **PASS**; `configFreshness` discriminates
  `MUTATION_TIME_RE_RESOLVED` from `SUPPLIED_ONLY`, and `SUPPLIED_ONLY` is never
  used as a stale-config fallback to continue mutation.
- **3C-H1** — creation verification corrections. `tests/editing/creation-verification.test.ts`
  and the create-file recovery/cleanup cases **PASS**; `cleanupFailure` and
  `refusalReason` are surfaced honestly.

### 1.6 Phase 3D coordination invariants — P3D obligations

`tests/editing/multi-file-coordination.test.ts` — 27/27 **PASS**:

| Obligation | Result |
|---|---|
| P3D-001 per-target authority | PASS |
| P3D-002 non-consuming preflight | PASS |
| P3D-003 all failing targets reported | PASS |
| P3D-004 single workspace | PASS (`PLAN_WORKSPACE_MISMATCH`) |
| P3D-005 provable target collisions refused | PASS (modify+modify, create+create, modify+create; no false collision on similar paths) |
| P3D-006 explicit deterministic order | PASS (input order preserved, no lexical sort) |
| P3D-007 preflight is not a lease | PASS |
| P3D-008 config per target | PASS (restrictive and malformed mid-plan `PATHCODE.md`) |
| P3D-009 sequential stop | PASS |
| P3D-010 NOT_ATTEMPTED is honest | PASS |
| P3D-011 commit-point plan status | PASS |
| P3D-012 no rollback | PASS |
| P3D-013 authored evidence stays distinct | PASS (exact nested 3B result identity on APPLIED) |
| P3D-014 no hidden persistence | PASS |
| P3D-015 one write module preserved | PASS (§1.3) |

### 1.7 Compile-time negative sweep

`tests/editing/type-contracts.ts` carries 10 `@ts-expect-error` negative
assertions and is inside the `npm run typecheck` program.

**Falsification (live):** removed the single line
`// @ts-expect-error PreparedMutation requires opaque brand`.
Clean blob `9116935ec9b63a808af0d9d9f5a2a38c726e50a2`.
`npm run typecheck` exited **2** with the intended error:

```
tests/editing/type-contracts.ts(24,7): error TS2322: Type '{ preparedId: string; ... }'
  is not assignable to type 'PreparedMutation'.
```

Restored with `git restore --source=HEAD`; post-restore blob
`9116935ec9b63a808af0d9d9f5a2a38c726e50a2` (**match**); `npm run typecheck`
exit **0**; `git status --porcelain` empty. The sweep is live and falsifiable.

### 1.8 Constitution / construction lessons; contract-defect traceability

- Constitution V1 §9 satisfied: `docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md`
  is committed as a repository artifact in the R2 Stage 0 commit `4209f10`.
- Constitution V1 §12 single source of truth for gaps: the canonical Gap Ledger
  is `src/selfobs/gap-ledger-data.ts` with the deterministic render at
  `docs/GAP_LEDGER.md`; both were updated together by R2. **PASS.**
- Amendment 1 introduces no new Gap Ledger classification or lifecycle value at
  this checkpoint. **PASS.**
- Contract-defect traceability: F-R1-003 (§8) traces to an **IMPLEMENTATION**
  origin against a fully specific frozen instruction — see §8.3.

### 1.9 Capability Ledger and Gap Ledger truth

Derived mechanically at this checkpoint via `deriveAllCapabilityObservations`
over the canonical ledger:

| Capability | Derived state |
|---|---|
| `foundation-kernel` | PHASE_VERIFIED |
| `repository-intelligence` | PHASE_VERIFIED |
| `freshness-snapshot` | PASS_FROZEN |
| `edit-contracts` | **PASS_FROZEN** |
| `existing-file-replacement` | **PASS_FROZEN** |
| `safe-file-creation` | **PASS_FROZEN** |
| `multi-file-coordination` | **PASS_FROZEN** |
| `safe-editing` | **IMPLEMENTED** (not PHASE_VERIFIED) |

All four mutation component capabilities remain **PASS_FROZEN**.

Gap states derived from the canonical ledger:

| Gap | Lifecycle | Classification | closedByCommit |
|---|---|---|---|
| GAP-005 | ACCEPTED_PERMANENT | NON_BLOCKING_LIMITATION | — |
| GAP-048 | CLOSED | BLOCKING_INVARIANT | `5386f349…` |
| GAP-049 | CLOSED | BLOCKING_INVARIANT | `5386f349…` |
| GAP-050 | CLOSED | BLOCKING_INVARIANT | `5386f349…` |
| GAP-051 | OPEN | BLOCKING_INVARIANT | — |
| GAP-052 | OPEN | BLOCKING_INVARIANT | — |
| GAP-053 | CLOSED | BLOCKING_INVARIANT | `2208dfa9…` |
| GAP-054 | CLOSED | BLOCKING_INVARIANT | `7f4267d5…` |
| GAP-055 | OPEN | NON_BLOCKING_LIMITATION | — |
| GAP-056 | OPEN | NON_BLOCKING_LIMITATION | — |
| GAP-057 | CLOSED | BLOCKING_INVARIANT | `4aadb060…` |
| GAP-058 | OPEN | NON_BLOCKING_LIMITATION | — |

`npm run ledger:verify` **PASS** at `8520ab97…`.

**GAP-057's recorded closure is not truthful against its own closure
condition.** See §8.

### 1.10 Original audit falsifiability probes

- Restored half-citation `issueLedgerVerification` probe: **executed and
  PASSING** —
  `tests/integration/phase3-safe-editing-audit.test.ts:946`
  "historical half-citation probe — declaration-only evidence cannot yield
  PHASE_VERIFIED". It re-derives `DECLARED` both without a verification and
  with a declaration-only half-citation verification, using
  `src/selfobs/internal/issue-verification.js` directly. The internal issuer
  remains absent from the selfobs barrel
  (`tests/selfobs/architecture.test.ts:53–54`).
- Delegation falsifiability: proven live as A-F22 (§7).
- Ledger derivation falsifiability: `selfobs derivation > phase-promotion
  falsification — removing phaseAuditEvidence lowers safe-editing to
  DECLARED/IMPLEMENTED` and `relink falsification — removing freezeEvidence
  lowers trio to IMPLEMENTED` both **PASS**.

---

## 2. PUBLIC AUTHORITY-SURFACE AUDIT — P1 THROUGH P14

| Probe | Result | Independently established evidence |
|---|---|---|
| **P1** supported public entry points mechanically enumerated | **PASS** | `package.json` `exports` is exactly `{".": {...}}`; `main`/`types` point at `dist/index.js` / `dist/index.d.ts`. Additionally the R2 analyzer derives 16 exported callables from the editing barrel through the TypeChecker (§3). |
| **P2** every public function's complete parameter/options surface represented | **FAIL** | Every public function's **parameter list** is derived and present in the standing manifest (148 rows, 28 parameter roots). The **member graph** is represented for only the four `*Options` parameters. Twenty-four other public parameters — `PreparedChange`, `PreparedMutation`, `PreparedCreation`, `EditAuthorization`, `MultiFilePlan`, `ResolvedProjectConfig`, `RepositoryEntry`, `WorkspaceBoundary`, `ExplicitEditApproval`, `ReadonlyArray<MultiFilePlanEntry>`, … — appear as bare roots with **no member coverage at all**. See Finding **F-R1-003** in §8. |
| **P3** no unapproved authority/mechanism-substitution parameter exists | **PASS (state)** | Derived analysis over the editing barrel at the clean checkpoint returns **0 findings**. Independent inspection of every non-options public parameter type at this checkpoint finds no member carrying an unclassified mechanism shape: each is classified in the frozen census (`docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md`) — `workspace` CALLER_NARROWING_BOUND, `RepositoryEntry` EARNED_AUTHORITY, `config` ORDINARY_DATA/policy, `explicitApproval` EXPLICIT_USER_APPROVAL, prepared/authorization earned pairs. **No active `PUBLIC_AUTHORITY_SURFACE_LEAK` exists at this checkpoint.** Standing *detection* for this class is nonetheless incomplete — F-R1-003. |
| **P4** public runtime ignores/rejects malicious extra arguments and unknown mechanism-substitution option fields | **PASS** | Proven live and falsifiable — see A-F15/A-F20 in §7 and §5. |
| **P5** `replaceExistingFile` public runtime uses real production mechanisms | **PASS** | `src/editing/replace-existing-file.ts:981–986` binds `productionAtomicReplaceFs` unconditionally; falsified live (A-F16). |
| **P6** `createFile` public runtime uses real production mechanisms | **PASS** | `src/editing/create-file.ts:799–804` binds `productionAtomicCreateFs` unconditionally; falsified live (A-F17). |
| **P7** `executeMultiFilePlan` public runtime uses real production mechanisms | **PASS** | `src/editing/multi-file-execute.ts:167–173` binds `productionOps` unconditionally; falsified live (A-F15). |
| **P8** any other corrected public wrapper uses real production mechanism | **PASS** | No further corrected public wrapper exists; the barrel's remaining callables are policy readers, preparation, plan construction and platform helpers, none of which accept an operation set. |
| **P9** internal test executors/adapters absent from public barrels, package exports and reachable public declarations | **PASS** | Barrel carries no `WithDependencies`, `fsOps` or `targetOps`; `ExecuteMultiFilePlanWithDependenciesOptions` and `MultiFileTargetOperations` are exported from no barrel. Falsified live (A-F18). |
| **P10** package consumer cannot import authority-bearing internal modules through a supported subpath | **PASS** | `require.resolve("path-code/editing")` → `ERR_PACKAGE_PATH_NOT_EXPORTED`. Falsified live (A-F21). |
| **P11** standing guard is in `npm run check` with an explicit approved-exception mechanism and no unjustified entries | **PASS** | `check` → `test` → `vitest run` includes `tests/architecture/public-authority-surface.test.ts`. `PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS` is `Object.freeze([])` — **empty**, therefore no unjustified entry. Wildcard and incomplete entries are structurally rejected by the canonical analyzer (verified in §3 and 2-F6). |
| **P12** no public `any`/`unknown`/rest/index escape narrowed into authority-bearing operations without approval | **PASS (state), with an observation** | The derived analyzer emits `any`/`unknown`, index-signature and rest-parameter findings on every surface it inspects, and returns 0 on the clean tree. The dedicated P12 test still enumerates only the original three option types and does **not** include `AuthorizePreparedChangeOptions`; that surface is covered by the derived analyzer instead. Recorded as an observation, not a separate finding — it is subsumed by F-R1-003's coverage class. |
| **P13** audit tests using internal seams always delegate to real operations and never fabricate successful/committed evidence | **PASS** | The audit suite injects only through `replaceExistingFileWithDependencies`, `createFileWithDependencies`, `executeMultiFilePlanWithDependencies`. Fabrication is provably caught — A-F22 (§7). |
| **P14** first audit's use of the public seam removed and documented | **PASS** | `tests/integration/phase3-safe-editing-audit.test.ts` contains no `executeMultiFilePlan(… { … targetOps … })` public injection; the first audit report at `docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md` remains immutable with its superseded COMPLETE line, and GAP-051 remains OPEN as the supersession record. |

---

## 3. R2 STRUCTURAL-GUARD VERIFICATION — RE-DERIVED, NOT ACCEPTED

Neither `docs/reports/PHASE_3_R2_CORRECTION_REPORT.md` nor
`docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md` was treated
as proof. Each claim below was re-derived by invoking the canonical analyzer
directly from outside the test suite and by live corruption.

### 3.1 Discovery is derived, not enumerated — CONFIRMED

`tests/architecture/public-authority-surface-analyzer.ts` loads a TypeScript
`Program` rooted at `src/editing/index.ts` from the repository `tsconfig.json`,
takes `checker.getSymbolAtLocation(sourceFile)`, then
`checker.getExportsOfModule(moduleSymbol)`, resolves `SymbolFlags.Alias`
through `checker.getAliasedSymbol`, and selects symbols whose type has call
signatures. Independent invocation returns **16** exported callables:

```
authorizePreparedChange, computeCreatedFileMode, createFile,
createMultiFilePlan, executeMultiFilePlan, explicitEditApproval,
isAtomicCreatePlatformSupported, isAtomicReplacePlatformSupported,
isCreateFileDisabled, isModifyExistingFileDisabled,
isMutationActionDisabledByConfig, prepareCreateFile,
prepareModifyExistingFile, replaceExistingFile,
validatePreparedBatchBounds, validateReaderByteLimit
```

No hardcoded function list or options-type list drives this set. **Confirmed.**

### 3.2 `authorizePreparedChange` and `AuthorizePreparedChangeOptions` represented — CONFIRMED

Manifest rows derived independently:

```
authorizePreparedChange sig0 p0 prepared: PreparedChange
authorizePreparedChange sig0 p1 explicitApproval: ExplicitEditApproval
authorizePreparedChange sig0 p2 resolvedConfig: ResolvedProjectConfig
authorizePreparedChange sig0 p3 options: AuthorizePreparedChangeOptions
authorizePreparedChange sig0 p3 options: … member=gitContext
authorizePreparedChange sig0 p3 options: … member=gitContext.annotations
authorizePreparedChange sig0 p3 options: … member=gitContext.availability
…
```

### 3.3 Named re-export `index.ts → AuthorizePreparedChangeOptions → types.ts` followed — CONFIRMED

`src/editing/index.ts` re-exports the type by name from `./types.js`; the type is
declared only in `src/editing/types.ts`. The analyzer never opens `types.ts` by
path — it reaches the declaration through alias resolution. Proven by A-F19
(§7), where a member added *in `types.ts`* is reported against the barrel export
`authorizePreparedChange`.

### 3.4 Original three Options types discovered through the same derived mechanism — CONFIRMED

`ReplaceExistingFileOptions`, `CreateFileOptions`,
`ExecuteMultiFilePlanOptions` and `AuthorizePreparedChangeOptions` all appear in
the derived manifest, each contributing exactly one `gitContext` member row
(4 rows total). The legacy enumerated three-type/three-file discovery survives
only behind the `useLegacyEnumeratedDiscovery` flag used by the 2-F7
falsification; it is not the coverage mechanism. **Retired as contracted.**

### 3.5 Graph shapes traversed — CONFIRMED for the inspected surface

`walkType` handles unions and intersections, alias resolution via
`getDeclaredTypeOfSymbol`, interface `getBaseTypes()` extends chains, array and
tuple element types, generic type arguments via `checker.getTypeArguments`,
nested object members, and project-owned anonymous object literals. Live
`gitContext → GitStateBaseline` traversal is visible in the real manifest.

### 3.6 Cycles terminate safely — CONFIRMED

`visited` is a `Set<string>` keyed by
`` `${symbolKey}@${typePath}#${memberPath}` `` where `symbolKey` is
`sym:<escapedName>:<declaringFile>` for named symbols and `anon:<typeToString>`
for `__type` anonymous literals. Analysis over the real repository graph
(including the recursive `GitStateBaseline` graph) terminates in ~1 s and 148
rows in every invocation performed during this audit. **No non-termination
observed.**

### 3.7 TypeScript/Node library graphs are boundaries — CONFIRMED

`defaultIsProjectSourceFile` rejects anything outside the repo root, anything
under `node_modules/`, and any `**/typescript/lib/**` path. The manifest
contains `Uint8Array<ArrayBufferLike> | Buffer<ArrayBufferLike>` parameter roots
for `prepareCreateFile` / `prepareModifyExistingFile` with **no** member rows and
**no** findings — the `Buffer` method graph is not walked. **Confirmed.**

### 3.8 `PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS` legitimately scoped — CONFIRMED

The canonical list is `Object.freeze([])` — **empty**, so the canonical list
contains no unjustified entry by construction. The analyzer structurally rejects
any entry containing `*` in `functionName`, `parameterName` or `memberPath`, and
any entry with an empty `governingContract`, `reason` or `targetedTest`, by
returning a synthetic finding rather than honouring the entry. Member-scoped
entries permit only the exact `memberPath`; sibling members and broader
parameters remain reported.

### 3.9 Runtime dependencies remain zero — CONFIRMED

`package.json` declares no `dependencies` block. `typescript` is a
`devDependency`. The analyzer lives under `tests/architecture/` and is imported
by no file under `src/`.

### 3.10 No R2 committed change under `src/**` — QUALIFIED

`git diff --name-status ecda537…HEAD` shows two paths under `src/`:

```
M  src/selfobs/capability-ledger-data.ts   (Stage 0 4209f10, Stage 2 8520ab9)
M  src/selfobs/gap-ledger-data.ts          (Stage 0 4209f10, Stage 2 8520ab9)
```

These are the **canonical Capability and Gap Ledgers**, which the R2 contract's
own Stage 0 (§0.2/§0.3) and Stage 2 (§2.2/§2.3/§2.4) *require* to be edited.
The R2 contract's "NO committed changes under `src/`" statement is scoped by
§1.8 to the **Stage 1 candidate diff**, and the R2 report records
"src/ committed changes: NONE" inside its "Files changed (Stage 1 candidate)"
section. Verified: the Stage 1 commit `4aadb06` touches **no** path under
`src/`, and no production or editing source changed:
`git diff --name-only 63f6e87…HEAD -- src/editing/` is **empty**.

The statement is therefore truthful in its stated scope, and this is **not** a
finding. It is recorded here because the dispatch brief asked for the literal
`src/**` check.

---

## 4. A-F15 THROUGH A-F22 — LIVE FALSIFICATIONS

Every probe followed: record clean blob → apply only the named corruption → run
the focused suite → capture the exact failure → confirm the intended reason →
restore exactly → verify identical blob and empty path-scoped diff → focused
PASS. **No falsification errored before its intended failure.**

### A-F15 — reintroduce public execute `targetOps` (cast-read form)

- Target: `src/editing/multi-file-execute.ts`, clean blob `a08ed5138114cdd51595842bb6d1a7f54bca4c24`.
- Corruption: `targetOps: (options as unknown as { targetOps?: MultiFileTargetOperations })?.targetOps ?? productionOps` in the **public** `executeMultiFilePlan` wrapper. Corrupt blob `39212d141c191a944ab42ddf8045b5cd0d9670eb`.
- Focused run `tests/editing/public-authority-malicious.test.ts` — **FAIL**, exit 1:
  `Error: malicious targetOps.replaceExistingFile invoked`, from
  `executeMultiFilePlan ignores throwing targetOps and applies via real wrappers`.
- **Intended reason:** the public wrapper consulted caller-supplied operations instead of `productionOps`.
- Restored from HEAD → blob `a08ed5138114cdd51595842bb6d1a7f54bca4c24` (**match**), `git diff --exit-code` clean, focused rerun **3/3 PASS**.

### A-F16 — reintroduce public replacement `fsOps`

- Target: `src/editing/replace-existing-file.ts`, clean blob `0f7d912de7f05809b7eb0dae224665c34481ac11`.
- Corruption: cast-read of `options.fsOps` ahead of `productionAtomicReplaceFs`.
- **FAIL:** `AssertionError: expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` in
  `replaceExistingFile ignores throwing fsOps and mutates via production FS`.
- **Intended reason:** the throwing caller operation set was reached, so the production replacement path did not run.
- Restored → blob match, focused rerun **3/3 PASS**.

### A-F17 — reintroduce public creation `fsOps`

- Target: `src/editing/create-file.ts`, clean blob `ff58c5eb1240e2e0cf8a6769d03d42e87eca7a44`.
- Corruption: cast-read of `options.fsOps` ahead of `productionAtomicCreateFs`.
- **FAIL:** `AssertionError: expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` in
  `createFile ignores throwing fsOps and publishes via production FS`.
- **Intended reason:** as A-F16, for creation.
- Restored → blob match, focused rerun **3/3 PASS**.

### A-F18 — export an internal executor

- Target: `src/editing/index.ts`, clean blob `d9131b34a31c510790a8cde9751716436e64d595`.
- Corruption: `export { executeMultiFilePlanWithDependencies } from "./multi-file-execute.js";`
- **FAIL (3 assertions, naming the leak):**
  - standing guard "public editing barrel does not export fsOps/targetOps/WithDependencies seams" — `expected [ Array(1) ] to deeply equal []` with `+ "executeMultiFilePlanWithDependencies"`;
  - standing derived-walker assertion — `+ "ExecuteMultiFilePlanWithDependenciesOptions"` newly appears in the derived surface;
  - P9 — `expected '…' not to match /WithDependencies/`, echoing the added export line.
- **Intended reason:** an internal authority-bearing executor and its `targetOps`-carrying options type became publicly reachable.
- Restored → blob `d9131b34a31c510790a8cde9751716436e64d595` (**match**), rerun **14/14 PASS**.

### A-F19 — callable mechanism-substitution field on a public function surface

**Mandated case: `AuthorizePreparedChangeOptions` — the exact surface that produced F-R1-001.**

- Target: `src/editing/types.ts`, clean blob `68a641cdcda3041b24559f78f771a7558c113dfd`, clean `git status --porcelain` empty.
- Corruption (the exact R1 auditor corruption, applied by this executor to the unchanged checkpoint source):
  ```ts
  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
  ```
  Corrupt blob `1c257469440ff8a37aee69d4a188c4402618b15b`.
- Focused run `tests/architecture/public-authority-surface.test.ts` — **FAIL**, exit 1,
  `AssertionError: expected [ { …(6) }, { …(6) } ] to deeply equal []` on
  `derived walker covers complete public editing parameter/options surfaces`.
  The standing guard named, verbatim:
  ```
  "functionName": "authorizePreparedChange",
  "memberPath":   "authorityOps",
  "parameterName":"options",
  "typeName":     "AuthorizePreparedChangeOptions",
  "reason":       "unreviewed mechanism-substitution shape on member authorityOps"

  "functionName": "authorizePreparedChange",
  "memberPath":   "authorityOps.issue",
  "parameterName":"options",
  "typePath":     "AuthorizePreparedChangeOptions.authorityOps",
  "reason":       "unreviewed user-defined call signature on member authorityOps.issue"
  ```
- **Intended reason:** an unreviewed authority-issuing callable member on the options surface of the authority-issuing public function, reached through the named re-export into `types.ts`. The public function, the type, the member and the resolved parameter/member path are all identified.
- Restored with `git restore --source=HEAD -- src/editing/types.ts` → post blob `68a641cdcda3041b24559f78f771a7558c113dfd` (**match**), `git diff --exit-code` clean, `git status --porcelain` empty.
- **Final PASS:** focused rerun **5/5 PASS**.

**A-F19 for this checkpoint: the standing declaration/manifest guard FAILS for
the intended reason on the `AuthorizePreparedChangeOptions` case. The R2 handoff
requirement is satisfied.**

**A-F19 (b) — entirely new public editing function with a previously unknown options type.**

No manifest, list or test was modified to teach the guard the temporary name.

- Added untracked `src/editing/zz-novel-probe.ts` declaring a type name that
  appears nowhere in the repository:
  ```ts
  export type NovelPublishOptions = {
    readonly note?: string;
    readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
  };
  export function novelPublishSomething(options?: NovelPublishOptions): void { void options; }
  ```
  and re-exported both from `src/editing/index.ts` (clean blob
  `d9131b34…` → corrupt `64306f90e956eed757f19d6f81653d5aa7a0d494`).
- Standing guard — **FAIL**, naming:
  ```
  "functionName": "novelPublishSomething",
  "typeName":     "NovelPublishOptions",
  "memberPath":   "authorityOps"   /  "authorityOps.issue"
  "typePath":     "NovelPublishOptions" / "NovelPublishOptions.authorityOps"
  ```
- **Intended reason:** the guard discovered a public callable it had never been
  told about and inspected its never-enumerated options type. Discovery is
  genuinely derived.
- Probe file deleted, `src/editing/index.ts` restored → blob
  `d9131b34a31c510790a8cde9751716436e64d595` (**match**), `git status --porcelain`
  empty, focused rerun **5/5 PASS**.

**A-F19 (c) — the same new function with the same corruption under a non-conventional parameter/type name.**

This probe is the boundary characterization the dispatch brief's phrasing
requires and is the origin of Finding F-R1-003; it is recorded in full in §8.1.

### A-F20 — read a hidden extra argument / undeclared runtime input

Covered by the A-F15 corruption, which is precisely the **cast-read of an
undeclared runtime option field** (`options as unknown as { targetOps?: … }`).
The malicious-extra-argument runtime test failed for the intended reason and
passed after exact restoration. Independently, the standing guard's cheap
wrapper-body check (`/\barguments\s*\[/`, `/\boptions\.fsOps\b/`,
`/\boptions\?\.targetOps\b/`) is live and passes on the clean tree.
**Falsifiable and owned by the runtime layer — see §5.**

### A-F21 — expose an internal authority-bearing package subpath

- Target: `package.json`, clean blob `aa09c1c55fd5590fbe5664d4cae63b5bb9c72210`.
- Corruption: added `"./editing": { "types": "./dist/editing/index.d.ts", "import": "./dist/editing/index.js" }` to `exports`.
- **FAIL (3 assertions):** standing guard "package exports map exposes only the root specifier", P1, and P10 — each `expected [ '.', './editing' ] to deeply equal [ '.' ]`.
- **Intended reason:** the package export map exposed an authority-bearing internal barrel to a package consumer.
- Restored → blob `aa09c1c55fd5590fbe5664d4cae63b5bb9c72210` (**match**), rerun **14/14 PASS**.

### A-F22 — break internal delegation to the real production operation

- Target: `src/editing/multi-file-execute.ts`, clean blob `a08ed5138114cdd51595842bb6d1a7f54bca4c24`.
- Corruption: `productionOps.replaceExistingFile` replaced by a stub returning a **fabricated** `SUCCESS` record without touching the filesystem.
- Focused run `tests/editing/multi-file-coordination.test.ts` — **FAIL (3)**:
  - `expected 'old\n' to be 'new\n'` — fresh filesystem re-observation caught the fabrication;
  - `expected 'ALL_APPLIED' to be 'PARTIALLY_COMMITTED'` (×2) — mid-plan config stop no longer observed.
- **Intended reason:** delegation to the real production operation was severed, and the composition/recovery evidence is bound to re-observed filesystem state rather than to reported outcomes. This also positively re-establishes P13.
- Restored → blob `a08ed5138114cdd51595842bb6d1a7f54bca4c24` (**match**), whole-tree `git diff --exit-code` clean, `git status --porcelain` empty, rerun **27/27 PASS**.

---

## 5. RUNTIME P4 / MALICIOUS-INPUT LAYER — DIVISION OF RESPONSIBILITY

The dispatch brief requires independent verification that the runtime layer
still owns the cast-read / undeclared-runtime-input defense and remains
falsifiable, rather than requiring the declaration walker to defeat arbitrary
hostile casts.

**Verified, and the division is truthful at this checkpoint:**

- The declaration walker inspects *declared* public option graphs. It cannot see
  a `as unknown as { … }` read, and the R2 contract's operator decision D4
  explicitly keeps it out of that business, routing the cast-read form to
  GAP-005 (`ACCEPTED_PERMANENT`, hostile casts).
- The runtime layer owns it and **provably fails when broken**: A-F15/A-F16/A-F17
  each introduced exactly a cast-read of an undeclared option field, and
  `tests/editing/public-authority-malicious.test.ts` failed in all three cases
  for the intended reason, then passed after exact restoration.
- GAP-005 is `ACCEPTED_PERMANENT` / `NON_BLOCKING_LIMITATION` in the canonical
  ledger and is attached to `domain-contracts.knownLimitations`.

**No finding.** This division is not weakened by anything R2 changed, and it is
not the basis of §8.

---

## 6. R1-SPECIFIC RECONCILIATION CHECKS — R1-A THROUGH R1-H

| Check | Result | Evidence |
|---|---|---|
| **R1-A** safe-editing NOT `PHASE_VERIFIED` | **PASS** | Derived state at this checkpoint is **IMPLEMENTED**. `safe-editing.phaseAuditEvidence` is `undefined` (asserted live by the half-citation probe) and `freezeEvidence` is absent. Not assumed — derived. |
| **R1-B** GAP-051/052 OPEN; GAP-053/054 CLOSED; GAP-055/056 OPEN | **PASS** | Exactly as tabulated in §1.9. |
| **R1-C** restored half-citation probe still proves the historical mechanism independently of current live-state pins | **PASS** | The probe constructs a **forged in-memory ledger** (`declarationOnly` record with `implementationEvidence: []`, `freezeEvidence` and `phaseAuditEvidence` stripped) and a synthetic `verifiedAtHead` SHA `a35b42de…`. It asserts `DECLARED` both without a verification and with a declaration-only half-citation verification. It never reads the current canonical `safe-editing` state as its subject. |
| **R1-D** `ledger-verify` uses the universal `phaseAuditEvidence`-shape consistency rule and hardcodes neither safe-editing nor a closed-phase list | **PASS** | `scripts/lib/ledger-verifier.ts` applies `resolvePhaseAuditEvidence` to **any** record for which `record.phaseAuditEvidence` is present (lines 459–467) and counts it uniformly in `countCitations` (line 125). No capability id and no phase list appears in the file. |
| **R1-E** Stage 1 shape-consistency falsifications are permanent tests and falsifiable | **PASS** | `tests/selfobs/phase-audit-shape.test.ts` carries `1-F1` (phaseAuditEvidence present with non-PHASE_VERIFIED state is rejected) and `1-F2` (phaseAuditEvidence absent with PHASE_VERIFIED state is rejected) as permanent, non-skipped tests in the standing suite. |
| **R1-F** no production file under `src/editing/` changed in R1 Stages 0–2 | **PASS**, and extended through R2 | `git diff --name-only 63f6e87cf199b3b551196be09a486b81da2860dd HEAD -- src/editing/` is **empty**. The only `src/` changes across the whole R1+R2 chain since `5386f349…` are `src/selfobs/capability-ledger-data.ts`, `src/selfobs/citation-helpers.ts`, `src/selfobs/gap-ledger-data.ts` — canonical ledger data, not editing production code. |
| **R1-G** 607 remains bound only to Closure A / `04591e4` | **PASS** | The sole `recordedFigure` carrying `value: "607"` is on `safe-editing`, with `exactEvidenceNeedle: "\| Runtime tests \| **607** PASS \|"`, `inDocument: "docs/PHASE_3_CLOSURE.md"`, `atCommit: SHA.phase3Closure` = `04591e400f6b8efe7190ce01faef4da97d0eb984`. No other record binds 607. |
| **R1-H** no R1 closure artifact/promotion exists yet | **PASS** | `docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md` does not exist. The string `RE-AUDIT R1 COMPLETE` appears only inside the governing contract as permitted conclusion wording. `safe-editing` is not promoted. Phase 4 artifacts absent. |

---

## 7. GAP-058 — INDEPENDENT INSPECTION OF ITS FACTUAL BASIS

GAP-058 is `OPEN` / `NON_BLOCKING_LIMITATION`, unattached to any capability. Its
`whyNonBlocking` asserts that the omitted package-root scope contains no
authority-bearing surface reachable by a package consumer at this checkpoint.

Independently verified:

- `package.json` `exports` is exactly `{".": {...}}` — a single root specifier.
- `src/index.ts` contains **no** re-export of `editing` (grep for `editing`
  returns nothing).
- `require.resolve("path-code/editing")` fails with
  `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- A-F21 proves the standing check would fail immediately if a subpath were
  added.

**GAP-058's factual basis is true, its `NON_BLOCKING_LIMITATION` classification
is not under-stated, and it hides no active authority surface.** It is not a
basis for failing this audit, and the dispatch brief's instruction not to fail on
unimplemented package-root expansion is honoured.

**GAP-058 does not cover Finding F-R1-003.** Its scope is the *root* of
discovery (editing barrel vs. package root). F-R1-003 concerns the *depth* of
traversal from an already-derived root, which GAP-058 does not mention and which
its `closureCondition` ("rooted at the supported package exports in addition to
the editing barrel, with falsifications proving coverage of both roots") would
not remedy.

---

## 8. NEW FINDING

### F-R1-003 — Derived walker enumerates every public parameter but traverses only `options`-shaped ones; the F-R1-001 corruption class still escapes on any other public parameter

**Classification (proposed):** `BLOCKING_INVARIANT` —
`PUBLIC_AUTHORITY_SURFACE_LEAK` defect pattern, absent-standing-detection form.
Same class as GAP-057. Not yet in the Gap Ledger.

**Primary origin:** IMPLEMENTATION.
**Contributing origin:** EVIDENCE (GAP-057 is recorded CLOSED against a closure
condition its implementation does not meet).

**There is no active leak at this checkpoint.** Every public parameter type on
the editing barrel today is classified in the frozen census. The defect is
absent standing detection — precisely the shape that GAP-057 was opened to fix.

#### 8.1 Reproduction — live, at this checkpoint

`tests/architecture/public-authority-surface-analyzer.ts:858–861` gates the
recursive member walk:

```ts
const deepInspect =
  parameterName === "options" ||
  /Options$/.test(typeName) ||
  hasUserDefinedCallSignatures(paramType);
```

Only parameters satisfying that predicate become traversal roots. Independent
manifest derivation confirms the consequence: of **28** public parameter roots,
exactly **4** carry member rows — the four `*Options` parameters. The other 24,
including `prepared: PreparedChange`, `plan: MultiFilePlan`,
`authorization: EditAuthorization`, `resolvedConfig: ResolvedProjectConfig`,
`workspace: WorkspaceBoundary`, `explicitApproval: ExplicitEditApproval` and
`entries: ReadonlyArray<MultiFilePlanEntry>`, are recorded as bare roots with
`member=` empty and are never opened.

**A-F19 (c), executed live.** The same new public editing function and the same
`authorityOps` corruption as A-F19 (b), differing only in that the options type
is named `NovelPublishSettings` instead of `NovelPublishOptions` and the
parameter is named `input` instead of `options`:

```ts
export type NovelPublishSettings = {
  readonly note?: string;
  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
};
export function novelPublishSomething(input?: NovelPublishSettings): void { void input; }
```

exported by name from `src/editing/index.ts`. Independent invocation of the
canonical analyzer returned:

```
FINDINGS (0):
[]
novelPublishSomething sig0 p0 input: NovelPublishSettings | typePath=NovelPublishSettings | member=
```

**The standing guard reports zero findings.** The function was discovered; its
authority-issuing member was not. This is the F-R1-001 corruption class, on a
public function, escaping detection at the post-correction checkpoint.

Restoration: probe file deleted, `src/editing/index.ts` restored from HEAD →
blob `d9131b34a31c510790a8cde9751716436e64d595` (**match**),
`git diff --exit-code` clean, `git status --porcelain` empty, standing guard
**5/5 PASS**.

#### 8.2 Why the narrowing exists

The analyzer comment at lines 853–857 and the R2 report's analyzer-design
section both state the reason: positional parameters are excluded because
otherwise `WorkspaceBoundary.canonicalize` — a user-defined call signature
reachable from `prepareCreateFile` / `prepareModifyExistingFile` — would be
reported and the contracted 2-F5 positive control would fail.

That is a real tension, and the frozen census does classify `workspace` as
`CALLER_NARROWING_BOUND`, so `WorkspaceBoundary.canonicalize` is a *reviewed*
surface and is **not** itself claimed here as a leak. The finding is that the
tension was resolved by silently narrowing coverage rather than by the route the
governing contract prescribes.

#### 8.3 Traceability to frozen governing text

The instruction was fully specific; this is an implementation shortfall, not a
contract defect:

1. `docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md` §1.2,
   MINIMUM RESOLUTION ALGORITHM: *"enumerate every call signature and every
   declared parameter; **for each parameter**, traverse the recursively
   reachable project-defined type graph"*. Not "for each options parameter".
2. §1.2 also forbids the mechanism actually used: *"Discovery MUST be driven by a
   TypeScript Program / TypeChecker …, not by a manual function list,
   **type-name list**, source-file list, regex-only export list, or **filename
   convention**."* Export and parameter discovery comply; the coverage decision
   is made by `/Options$/` on the type name and by the literal parameter name
   `"options"`.
3. §1.4: *"If the walker requires an exception to pass, that is a finding —
   **STOP AND REPORT** rather than adding one to make the suite green."* §1.2:
   *"If a case cannot be classified from frozen text, STOP AND REPORT origin
   CONTRACT or FOUNDATION. Do not invent a broad ban merely to make the suite
   green."* The `WorkspaceBoundary.canonicalize` case is exactly this situation.
   The contracted response was to stop and report; the implemented response was
   a narrowing that neither stops, reports, nor records a gap.
4. Amendment 1 §4 D fails on *"an unreviewed public **parameter**/property"*
   carrying a call signature or mechanism shape; §4's closing guidance is to
   *"Inspect the user-defined public **parameter**/option graph."*; §2 defines the
   supported public surface as including *"every declared parameter of a public
   function"* and *"every nested property of a public options/**input** object"*.
5. Stage 3 §3.4 **P2**: *"Every public function's complete parameter/options
   surface is represented in the standing manifest/test."* Only 4 of 28 parameter
   surfaces are represented beyond their root.

#### 8.4 Consequence for GAP-057

GAP-057's recorded `closureCondition` is:

> the standing guard derives its coverage from the complete supported public
> editing surface rather than an enumerated list; **follows named re-exports and
> project-defined parameter graphs**; …

Named re-exports: satisfied (§3.3). Complete-surface *discovery*: satisfied
(§3.1). **Project-defined parameter graphs: not satisfied** — only options
graphs are followed. GAP-057 is recorded `CLOSED` against a condition its
closure evidence does not meet. The closure is premature, not fraudulent: the
narrowing is disclosed in the R2 report's analyzer-design section, but disclosure
in report prose is not one of the three permitted terminations under the
No-Untracked-Finding Rule, and no gap records it.

#### 8.5 No-Untracked-Finding disposition

F-R1-003 is:

- **not** corrected and durably closed by immutable evidence in this pass (this
  is an audit; no production or audit code may be repaired here);
- **not** OPEN in the canonical Gap Ledger — Stage 3 §3.7 forbids ledger edits by
  Executor B;
- **not** an already-recorded frozen limitation — GAP-058 is package-root scope
  (§7); GAP-005 is hostile casts (§5); GAP-057 is recorded CLOSED; no NOT
  VALIDATED item names parameter-graph depth as a tracked limitation.

Therefore it causes **NOT COMPLETE**, and its gap must be opened by a separately
reviewed corrective contract — the same route by which F-R1-001 became GAP-057.

#### 8.6 Observation (non-gating), carried forward

`tests/integration/phase3-reaudit-public-surface.test.ts` P2/P3 still asserts
against the **source text** of the standing guard file
(`expect(guard).toMatch(/ReplaceExistingFileOptions/)` etc.) rather than against
derived analyzer output, and P12 still enumerates three option types and omits
`AuthorizePreparedChangeOptions`. Neither weakens a proof that the derived
analyzer carries, and both are subsumed by F-R1-003's corrective surface. Not an
independent gate failure; recorded so it is not lost.

---

## 9. VALIDATION GATES — HONEST DISPOSITION

Host: darwin 25.5.0, Node v26.5.0, 8 logical CPUs. System load average during
this audit was **26.66 / 27.53 / 23.79** on an 8-CPU host with 13 logged-in
users — the host is heavily and independently loaded. This is recorded because it
bears directly on the timing disposition below.

| Gate | Result |
|---|---|
| `npm run ledger:verify` | **PASS** — `ledger:verify PASS at 8520ab97feb66112fd28e0b7525d949d843c2ca6` |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run cli:smoke` | **PASS** |
| `npm test` runtime total | **619 passed (619)**; Test Files **65 passed (65)** |
| `npm run check` attempt 1 | **FAIL** — exit 1, `Test Files 7 failed \| 58 passed (65)`, `Tests 16 failed \| 603 passed (619)`, real 243.75 s |
| `npm run check` attempt 2 | **FAIL** — exit 1, `Test Files 1 failed \| 64 passed (65)`, `Tests 1 failed \| 618 passed (619)`, real 158.97 s |
| `npm run check` attempt 3 | **PASS** — exit 0, `Test Files 65 passed (65)`, `Tests 619 passed (619)`, real 131.58 s |
| `npm run check` attempt 4 (pre-commit gate, report present) | **FAIL** — exit 1, `Test Files 9 failed \| 56 passed (65)`, `Tests 23 failed \| 596 passed (619)`, real 308.77 s; all 23 are wall-clock timeouts, zero assertion failures |

**Exact runtime test total at the audited checkpoint: 619.**

### 9.1 The first run was not clean, and attempt 3 is not represented as one

Attempt 1 failed 16 tests across 7 files. Every failure was a wall-clock timeout;
**no assertion failed**:

- `tests/architecture/public-authority-surface-derived.test.ts > 2-F6 — approved exception model` — `Test timed out in 60000ms` (observed 70 689 ms; the file as a whole took 148 045 ms)
- `tests/git/baseline.test.ts` — 4 tests, `timed out in 5000ms`
- `tests/git/check-ignore.test.ts` — 2 tests, `timed out in 5000ms`
- `tests/git/environment.test.ts` — 2 tests, `timed out in 5000ms`
- `tests/integration/phase2-e2e.test.ts` — 2 tests, `timed out in 5000ms`
- `tests/integration/phase3-safe-editing-audit.test.ts` — B1 and B4, `timed out in 5000ms`
- `tests/snapshot/git-snapshot-membership.test.ts` — 3 tests, `timed out in 5000ms`

Attempt 2 failed exactly one test —
`tests/git/check-ignore.test.ts > live multi-batch ignore observation covers
every admitted candidate once`, `Test timed out in 5000ms`.

Attempt 4 — run as the pre-commit gate with this report present in the working
tree, at a host load average of 26.14 / 30.56 / 25.89 — failed **23** tests
across **9** files in 308.77 s. `grep -c "Test timed out"` over that log returns
**46** (each timeout is reported twice, in the inline and summary sections) and
the error line following every one of the 23 `FAIL` headers is exactly
`Error: Test timed out in 5000ms.` or `Error: Test timed out in 60000ms.`
**Zero assertion failures.** The affected set again differed — it added
`tests/git/discovery.test.ts`, `tests/ledger/gap-closure-diagnostics.test.ts`
and `tests/ledger/two-commit-freeze-scope.test.ts` — and `2-F6` again exceeded
its own 60 s budget.

### 9.2 Independent causation analysis — the equivalence was tested, not assumed

The dispatch brief required establishing whether the observed timing behaviour
has the same cause as previously recorded timing failures, given that R2 changed
the guard's TypeScript Program/Checker loading path.

- **Isolation control.** All five timing-suspect files run together in isolation:
  `Test Files 5 passed (5)`, `Tests 52 passed (52)`, 12.35 s, exit 0. No
  assertion problem exists in any of them.
- **R2-exclusion control.** A full `vitest run` with both R2 architecture files
  excluded still failed **4** tests (`tests/config/loader.test.ts`,
  `tests/metadata/architecture.test.ts`, `tests/metadata/metadata.test.ts`,
  `tests/reader/adversarial.test.ts`), all `timed out in 5000ms`, real 151.32 s.
  **The R2 Program-loading path is therefore not the sole cause**; the dominant
  factor is unconstrained default-worker parallelism on a saturated host.
- **Where R2 does differ.** Attempt 1's `2-F6` failure is an R2-introduced test
  exceeding its **own 60 s** budget after 70.7 s, inside a file that took 148 s.
  That shape — a public-authority architecture test timing out — has no
  precedent in the recorded limitation, which names only
  `tests/snapshot/git-snapshot-membership.test.ts` and
  `tests/reader/adversarial.test.ts`. The R2-added suite constructs multiple
  full TypeScript `Program`s and holds a **busy-wait** cross-file mutex
  (`tests/architecture/public-authority-src-lock.ts`, spin loop with no yield),
  which measurably raises contention while held.

**Disposition.** The *mechanism* — unconstrained default-worker wall-clock
timeouts on Git-subprocess and dist-import-bound tests, with no assertion
failures and clean isolation runs — matches the already-recorded environment
characteristic cited at
`docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md` baseline gates and
`docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md` §9. The
*extent* is broader than that record: the affected file set varied across three
runs and never matched the two named files, and attempt 1 additionally timed out
an R2-introduced architecture test at its own 60 s budget. I did **not** inherit
the prior unconstrained-worker disposition; I tested it and am recording the
divergence.

I do not classify the timing behaviour itself as a new gating finding — it
produced no assertion failure and the full gate does pass — but the R2-suite cost
(148 s for one architecture file, plus a busy-wait mutex) is recorded in NOT
VALIDATED as an unproven-benign characteristic that the corrective pass should
consider alongside F-R1-003.

Attempt 3 passing is **not** represented as a clean first run. **Three of the
four** `npm run check` attempts at this checkpoint failed, including the
pre-commit gate run. The single passing attempt is reported as what it is: one
run out of four on a saturated host, not a clean gate.

---

## 10. COMPLETE-GATE EVALUATION (Stage 3 §3.8)

| Condition | Met? |
|---|---|
| every original Phase 3 audit criterion passes | YES |
| all SE-001 … SE-020 SATISFIED_PHASE_WIDE | YES |
| relevant P3D obligations pass | YES |
| **P1 through P14 pass** | **NO — P2 fails (F-R1-003)** |
| every applicable A-F15 … A-F22 probe fails/restores as required | YES — including A-F19 on `AuthorizePreparedChangeOptions` |
| R1-A through R1-H pass | YES |
| no active `PUBLIC_AUTHORITY_SURFACE_LEAK` remains | YES — no active leak at this checkpoint |
| **every new finding already recorded or causes NOT COMPLETE** | **F-R1-003 is a new, unrecorded finding → NOT COMPLETE** |
| all four mutation component capabilities PASS_FROZEN | YES |
| safe-editing NOT PHASE_VERIFIED before closure linkage | YES |
| runtime dependencies remain 0 | YES |
| exactly one project filesystem write module | YES |
| working tree clean except the Stage 3 output file before commit | YES |
| Phase 4 absent | YES |

Two conditions fail. Under §3.8, **any** failing condition returns NOT COMPLETE.

---

## 11. NOT VALIDATED

- F-R1-003 is not corrected here. No production or audit code was repaired
  inside this audit, no test was weakened, no exception was added, no invariant
  or ledger was modified.
- F-R1-003 is not yet OPEN in the canonical Gap Ledger — Stage 3 §3.7 forbids
  Executor B from editing the ledger. A separately reviewed corrective contract
  must open it.
- Auditor independence remains **ASSERTED**, not mechanically proven (GAP-055).
- Package-root callable-surface coverage is not implemented (GAP-058); its basis
  was independently verified true (§7) but the expansion itself is unbuilt.
- Hostile TypeScript casts and cast-read forms remain outside declaration-guard
  responsibility (GAP-005); the runtime P4 layer owns them and was proven
  falsifiable (§5), but no proof exists that the runtime layer covers every
  future cast-read site.
- The frozen census classification of `workspace: WorkspaceBoundary` as
  `CALLER_NARROWING_BOUND` was read as an existing reviewed record and was **not**
  independently re-litigated, even though `canonicalize` governs the physical
  path that the mutation engine later writes
  (`replace-existing-file.ts:387,584`, `create-file.ts:350,388`,
  `multi-file-preflight.ts:112,225,237`, `preparation.ts:190`).
- Cycle-safety was observed to terminate on the actual repository graph and on
  the fixtures exercised; it is not proven for an arbitrary adversarial type
  graph.
- The R2 suite's cost — 148 s for `public-authority-surface-derived.test.ts` and
  a busy-wait cross-file mutex with no yield — is recorded as an unproven-benign
  characteristic, not as a validated one.
- `npm run check` timing behaviour remains an unconstrained-worker flake whose
  observed extent at this checkpoint exceeds the recorded record (§9.2). Three of
  four attempts failed; the gate is not reliably green on this host, and no
  bound on the flake has been established.
- Single host (darwin 25.5.0, Node v26.5.0), heavily loaded; no live Windows
  validation (GAP-002).
- Residual filesystem races remain (GAP-035, GAP-036, GAP-037, GAP-044,
  GAP-045).
- No rollback, no delete, no directory creation.
- Foundation §10 audit not run; Phase 4 absent.
- A guard that derives discovery is not a proof that no authority can leak.

---

## 12. GIT / OUTPUT BOUNDARY

- Starting HEAD: `8520ab97feb66112fd28e0b7525d949d843c2ca6`
- Starting working tree: clean
- Every temporary corruption in §1.7, §4 and §8.1 was restored to its exact
  pre-corruption blob hash, verified by `git hash-object` equality and
  `git diff --exit-code`. No corruption remained at any point after its probe.
- Files written by Executor B: **exactly one** —
  `docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md`.
  `tests/integration/phase3-reaudit-r1.test.ts` was **not** created: on the
  NOT COMPLETE path §3.9 permits only the finding report and its commit, and no
  permanent test may be added that would enshrine the defective behaviour.
- No ledger edit. No source edit. No README edit. No edit to any prior report
  other than the contract-designated Stage 3 output path (§ header note). No
  edit to any prior test.
- Stage 4 **not** started. Phase 3 closure **not** created. safe-editing **not**
  promoted. Foundation §10 **not** started. Phase 4 **not** started.
- Nothing pushed. No remote created. No history rewritten.

---

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE
