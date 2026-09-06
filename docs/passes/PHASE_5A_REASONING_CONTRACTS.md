# PATH CODE — PHASE 5A: REASONING CONTRACTS
## Cursor implementation package — represent claims before enforcing them

**Implementer:** one fresh normal Cursor desktop Agent. No Claude Code or additional agents.
**Existing active worktree:** `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`
**Expected starting branch:** `cursor/phase4-execution-core`
**New working branch:** `cursor/phase5a-reasoning-contracts`
**Required starting HEAD and main:** `bfd6fc5b5ec8888363b90745ba72e06db96198a1`
**Main worktree:** `/Users/achahbi/Projects/path-code`

## 1. Deliverable and strict scope

Implement the package-internal TypeScript contracts for the Reasoning Ledger: proposed claims, reference-bound claim shapes, claim-specific verification requirements, inference/uncertainty, execution-evidence citations, and structured refusals. Add finite compile-time proofs and small architecture tests. This is implementation of contracts, not another design-only task.

**Production changes are types only.** Do not implement a binder, parser, validator, registry, approval mint, decision engine, retry loop, or claim-verification function. Do not connect these contracts to a write or process execution path yet.

No model/provider/API calls from the repository, SDKs, content-search implementation, AST/symbol service, command execution capability, authority hierarchy, persistent memory, Google Drive integration, CLI wiring, or Phase 5B/5C behavior. The agent's ordinary use as the implementation tool is not a repository provider integration.

Reuse Phase 2's actual earned artifact types and Phase 4's actual Engineering Run type through type-only imports. Do not copy their internal representations or invent replacement evidence objects.

## 2. Verify and branch in the existing Cursor window

Use explicit working directories. Before reading implementation inputs or changing anything, record active root, branch, full HEAD, clean tracked/untracked status, and any ongoing merge/rebase/cherry-pick. Verify main separately is clean, on `main`, at the required HEAD, in the same common Git repository.

Require the exact existing worktree, starting branch and HEAD above. Stop on a mismatch; do not reset, stash, discard, move a worktree or repair another branch.

After those checks, verify `refs/heads/cursor/phase5a-reasoning-contracts` does not exist. If it exists, report and stop rather than overwriting or silently reusing it.

Create the new branch **inside the existing worktree**:

```bash
git switch --no-track -c cursor/phase5a-reasoning-contracts bfd6fc5b5ec8888363b90745ba72e06db96198a1
```

Reverify root, new branch, HEAD and clean status. The directory keeps its existing name; only this worktree's checked-out branch changes. Preserve the old Phase 4 branch. Do not create another worktree, reinstall dependencies, change shared Git configuration or switch the main worktree.

Main stays unchanged for the entire assignment. No automatic fast-forward, merge or push.

## 3. Read the actual contracts this consumer needs

Read the committed Master/Constitution and applicable amendments, Phase 4 implementation status, and directly relevant declarations for:

- `RepositoryEntry`, `RepositoryInventory`, `ContentObservation` and its fingerprint;
- `ManifestEvidence` and observed dependency declarations;
- `RepositorySnapshot`, `WorkspaceBoundary`, and point-in-time freshness;
- `EngineeringRunRecord` and the existing Validation check-kind vocabulary;
- existing reasoning/task/claim types, if any;
- the established compile-only test convention, tsconfig inclusion and architecture boundaries.

Do not reread the entire correction history or run a baseline full suite. Inspect only enough code to pin real names, imports, semantics and dependency directions.

The ORCHESTRATOR_REASONING_LEDGER_SKETCH is design input, not a frozen contract. Its essential decisions are incorporated below, so its absence as a repository file is not a blocker and requires no extra user upload.

Before implementing, create `docs/passes/PHASE_5A_REASONING_CONTRACTS.md` containing this instruction and a compact source/API mapping appendix. Include **FOUNDATION COMPATIBILITY PREFLIGHT** with the exact vocabulary from the committed Constitution. Use only relevant rows.

Architectural decisions for that mapping:

| Consumed concept | Decision for 5A |
|---|---|
| Existing entry/content/manifest/snapshot types | Type-only references; no new evidence producer |
| Claim kinds, binding-stage labels and refusal codes | Reasoning-local vocabulary; do not extend global ActionClass, KnowledgeState, Provenance, EvidenceKind or ValidationOutcome |
| Engineering Run evidence | Type-only citation of the existing authentic-record type, not a new run or verdict |
| Reference-binding authenticity/currentness | Future runtime enforcement; not implemented or claimed in 5A |
| Content/symbol/behavior verification | Represent requirements without inventing missing capabilities |
| Model access, new authority, persistence | Not applicable to this types-only pass |

Record actual source locations. If an existing equivalent has the same semantics, alias/reuse it. Do not overload a differently scoped type just because its name is similar. If a required existing concept is absent or incompatible, report that exact mismatch; do not fabricate a substitute or expand the phase.

Forward development is operator-authorized on the green implemented Phase 4 components. Preserve `NOT PHASE_VERIFIED` and all existing ledger states. Do not assert that any missing independent audit or historical prerequisite was completed.

## 4. Source-derived design and explicit refinements

Preserve the sketch's six claim families, reference-versus-prose distinction, separation of observation from execution, negative-search honesty and types-first sequence.

This package makes these explicit refinements to that sketch:

1. Use **requiredVerification**, not **verifiedBy**, for a method that has not yet run.
2. **Reference-bound is not semantically verified, fresh, applicable, or authorized.** Keep these meanings separate.
3. A compiler/test result supports only its recorded checks and scope. It does not universally prove a natural-language claim.
4. Model-facing references are untrusted identifiers/path hints. They cannot already be live repository objects or authenticated run records.
5. TypeScript types and brands enforce disciplined compile-time usage, not hostile-JavaScript authenticity. Runtime parsing, registry binding and freshness checks belong to later work.
6. No generated semantic-shape matrix is needed for a types-only consumer with no runtime detector. Use the finite proofs in this package, not a new meta-verification program.

## 5. Production layout and allowed declarations

Prefer:

- `src/reasoning/types.ts`
- `src/reasoning/index.ts` — explicit `export type` only

A small additional type-only file is allowed if it materially simplifies the definitions. Do not build a framework or a file per trivial type.

Allowed production constructs: type aliases, interfaces, type-only imports/exports, and non-exported `declare const ...: unique symbol` declarations when needed for compile-time opacity. Use readonly fields and readonly collections. A local nonempty readonly tuple helper is permitted.

No emitted runtime enums, ordinary value constants, classes, functions, stub implementations, ambient exported function declarations promising a nonexistent runtime API, top-level evaluation, factories, WeakMaps, I/O, hashes or third-party dependencies. Emitted JavaScript should contain only normal empty-module/compiler boilerplate, not behavior.

Keep package-root exports and `package.json` unchanged. Other production layers must not start consuming reasoning in this pass. In particular, do not import these types into the earlier domain/observation/execution layers and create a backward dependency.

## 6. Contract model — locked semantics

The following names are reasoning-local preferred names. Record any collision-driven renaming before dependent code; preserve these meanings exactly.

### A. Untrusted proposal shapes

Define `ReasoningClaimKind` as exactly:

`EXISTS | CONTENT | DEPENDS_DECLARED | CONTAINS | DEFINES | BEHAVES`.

Define `ProposedEvidenceReference` as a small discriminated data union for an evidence identifier or repository-relative path hint. Strings here are legitimate **requests to resolve**, never earned authority. No callbacks, executable commands, arbitrary option bags or live repository objects.

Define `ProposedClaim` as a discriminated union. Common fields: correlation `claimId`, kind, descriptive `statement`, proposed subject/reference, and readonly proposed citations. Use structured kind-specific data where required: a dependency name for DEPENDS_DECLARED, literal needle for CONTAINS, symbol name for DEFINES, and scenario/predicate description for BEHAVES. These strings state the proposition; they are not evidence that it is true.

Do not allow the proposal to select an OBSERVED/PROVEN result, trusted provenance, approval token or authenticated-reference marker. Empty proposed citations must be representable so a later gate can return UNBOUND_CLAIM; do not pretend a model cannot send an incomplete proposal.

Define a small `ReasoningProposal` envelope: schema version, proposal ID, requested outcome as untrusted descriptive text, readonly claims and hypotheses. No EditContract, PreparedChange, shell command, authority token or auto-execute field. Proposed IDs are correlation only; uniqueness, resolution and size bounds are runtime checks deferred to the parser/binder.

A requested future file/symbol belongs to desired outcome, not a fabricated EXISTS claim about the current repository. Do not ban legitimate future creation by requiring its as-yet-nonexistent target to have an existing entry. Creation authority remains with the existing editing mechanism later.

### B. Reference-bound shapes — a future binder's type contract

Define a distinct, compile-time-opaque `ReferenceBoundClaim` union. Raw `ProposedClaim` must not be assignable to it. Use a non-exported unique-symbol brand if consistent with the repository. No brand constructor or binder is implemented in 5A.

Keep the underlying discriminated data shape as a named reasoning-internal type, such as `ReferenceBoundClaimShape`, and apply the private brand separately to form `ReferenceBoundClaim`. The shape is not authenticated and must not be named trusted. This lets positive and wrong-kind compile tests exercise the actual field relationships rather than fail trivially on a missing brand.

A bound shape includes the original claim ID, descriptive statement, actual earned subject/reference objects, and context carrying the actual WorkspaceBoundary and RepositorySnapshot references. Do not replace these with paths, IDs, hashes, serialized JSON or copied structure.

Use kind-correlated union branches, not independent unions for `kind`, `subject` and `requiredVerification` that permit invalid combinations:

| Kind | Required bound source shape | Fixed requiredVerification | Meaning / limit |
|---|---|---|---|
| EXISTS | Actual RepositoryEntry in its snapshot/workspace context | OBSERVATION | Observation of that entry, not proof of current whole-tree state |
| CONTENT | Actual ContentObservation in that context | OBSERVATION | Observed file bytes/fingerprint, not arbitrary semantic interpretation |
| DEPENDS_DECLARED | Actual ManifestEvidence in that context, plus declared dependency name | OBSERVATION | A manifest declaration only; not installed, imported, used or working |
| CONTAINS | Actual ContentObservation + literal needle | DEFERRED_CONTENT_CHECK | No content-search/verifier is introduced here; not a supported fact merely because the file was read |
| DEFINES | Nonempty actual ContentObservation references + asserted symbol name | EXECUTION | Requires a relevant future check; no AST or substring-as-symbol proof |
| BEHAVES | Nonempty actual ContentObservation references + scenario description | EXECUTION | Requires a relevant future check; observation alone cannot establish behavior in this system |

For DEFINES and BEHAVES require an `ExecutionVerificationRequirement`: nonempty existing Validation check kinds plus an explicit check purpose/scenario. This is an obligation, not a command, prepared plan, permission, result or successful test. Use existing check-kind types; no custom executable callback.

For every bound branch the binding stage means **REFERENCES ONLY**. Do not add `isVerified`, `isCurrent`, `safeToWrite`, `approved`, `truth: true`, or an OBSERVED/PROVEN semantic verdict. The actual source artifacts retain their own existing observation meanings.

Define `ReferenceBoundReasoning` to group readonly bound claims/hypotheses with their context. Its contract must be distinct from the untrusted proposal and contain no action authorization. Do not invent an overall task-completion verdict.

**Runtime limits:** TypeScript cannot prove two existing entries belong to the same snapshot, that a dependency name is actually present, that a statement follows from cited bytes, or that evidence is current. Record these as required future binder/verifier checks. Do not claim the type tests establish them. There is no callable runtime path consuming these bound types in 5A.

### C. Inference and absence

Define `ReasoningHypothesis` separately from observation-bound claim types:

- INFERRED: descriptive conclusion plus a nonempty readonly list of supporting claim references/IDs;
- UNVERIFIED: descriptive assumption, with possibly no supporting references.

These are reasoning-local epistemic labels, not new global KnowledgeState values. Claim-ID links are unresolved correlations until the later binder resolves them. No graph engine or cycle validator in this pass.

Do not permit an INFERRED/UNVERIFIED hypothesis to be directly assigned to an observation-bound claim or authority type. No numeric confidence threshold upgrades an assumption into evidence.

A later search may show that a particular search found no match within its admitted scope. It does not prove no equivalent implementation exists. Keep that conclusion INFERRED/UNVERIFIED. Do not create a fictitious SearchObservation or content-search capability to support it here.

### D. Cite existing Engineering Runs without certifying claims

Define one type-only `EngineeringRunCitation` (or exact equivalent) containing:

- the **actual existing EngineeringRunRecord** reference;
- the claim ID it is intended to support;
- a nonempty readonly list of selected check IDs;
- a fixed meaning such as `CITED_RUN_ONLY`.

It is evidence association input for later Gate 2, not `ExecutionVerifiedClaim`. A real failed run is still citable history; the citation type must not silently upgrade or exclude it to obtain success. No new execution result, applicability classifier or copied Validation verdict.

A string resultId or JSON object is not a substitute for EngineeringRunRecord in this type. Check-ID membership, exact plan/subject/configuration compatibility, registry authenticity and fresh applicability remain later runtime checks through Phase 4. Keep the record's existing scope limits; never infer semantic truth from its existence.

### E. Structured refusals — type definitions only

Define a small reasoning-local refusal union using these six codes:

- UNBOUND_CLAIM
- EVIDENCE_IDENTITY_MISMATCH
- STALE_EVIDENCE
- GROUNDING_OVERCLAIM
- UNVERIFIABLE_IN_PRECONDITION
- CLAIM_OUTSIDE_ADMITTED_SET

Include the affected claim/reference correlation and a descriptive reason. The code carries the machine meaning; prose does not authorize anything. Do not echo file contents, secrets or raw process output into sample refusal messages.

No runtime refusal producer, retry handler, parser or alternate global error taxonomy. Additional transport/malformed-input codes can be designed when runtime parsing is actually added. Do not add CREATION_WITHOUT_SEARCH now: enforcing creation/search policy is outside this pass and content search is not provided by these types.

## 7. Finite proof matrix

Use the existing compile-only test convention and ensure these fixtures are actually included by `npm run typecheck`. Do not rely on Vitest transpilation alone as type checking. Prefer a clearly compile-only file such as `tests/reasoning/type-contracts.ts`, not a `*.test.ts` module that executes fictitious declared values.

Positive compile examples may use ambient `declare const` values of genuine existing artifact types. Label them **compile-time witnesses, not runtime evidence**. Do not call them or claim objects were earned by a running pipeline. Negative tests must not hide errors with `any`, double casts or broad suppressions. Construct valid unbranded shape witnesses from ambient artifact references to prove each variant is inhabitable. Test wrong evidence/method combinations against that shape, and test opacity separately; do not count a missing brand as proof of a different field constraint.

Map each requirement below to an exact proof/assertion; multiple rows may share a fixture:

| ID | Proof |
|---|---|
| T01 | All six proposed claim variants and their structured data are representable; incomplete citations remain proposed only. |
| T02 | Valid type witnesses exist for every bound-kind/source/method combination in the locked table. |
| T03 | A raw proposed claim/bundle is not assignable to its reference-bound counterpart. |
| T04 | Path/ID/plain data cannot replace RepositoryEntry, ContentObservation or ManifestEvidence in a bound claim. |
| T05 | Wrong evidence category for CONTENT or DEPENDS_DECLARED is rejected. |
| T06 | DEFINES/BEHAVES cannot choose OBSERVATION or omit the execution requirement. |
| T07 | CONTAINS cannot claim implemented content verification or semantic success. |
| T08 | INFERRED/UNVERIFIED hypotheses cannot be supplied as observed/bound claims; inferred basis is nonempty. |
| T09 | Proposed/bound claims cannot be used as existing edit, process or Validation authorization types. |
| T10 | Engineering Run citation requires an actual record type and nonempty check IDs; string-only substitutes fail. |
| T11 | Readonly claims, citations and hypothesis arrays reject mutation through the declared API. |
| T12 | Consumer narrowing exhaustively handles every kind/refusal; an unhandled variant causes a compile error. |
| A01 | Production reasoning modules contain type declarations only; no runtime imports, functions, emitted enum, registry or side-effectful initialization. |
| A02 | Emitted reasoning module has no runtime value exports; root package/subpath surface is unchanged. |
| A03 | Earlier production layers have not started importing reasoning; no backward dependency or change to previous authority paths. |

Use targeted architecture assertions over these small files and their compiled output. Reusing the installed TypeScript parser for syntax inspection is allowed in tests; do not extend the large public-authority graph analyzer or create a second generic detector. Compile-only fixtures are not counted as runtime tests.

### One bounded live type falsification

After positive/negative fixtures compile cleanly, snapshot the compile-only test file. Remove only the three `@ts-expect-error` directives covering T03, T06 and T09 in one batch, then run the normal typecheck once. Require errors at all three intended statements for their intended reasons. Restore the exact file bytes from the snapshot; verify its hash; typecheck must pass again. A typo, missing import or unrelated failure is not evidence for these requirements.

Do not mutate production files, run historical corruptions or create worktree locks for this proof. Do not restore legitimate candidate changes from HEAD.

## 8. Permitted changes and no invented prerequisite

Allowed:

- `src/reasoning/**` types only;
- `tests/reasoning/**` compile-only and focused architecture tests;
- the new 5A contract and `docs/reports/PHASE_5A_REASONING_CONTRACTS_REPORT.md`;
- only if an existing architecture allowlist rejects this exact new type-only area, a narrowly named allowance in that existing test with the new no-runtime-behavior assertions retained.

Do not turn an allowed directory into an exemption for runtime mechanisms. Record any such supporting test edit explicitly. Do not weaken global tests, strict compiler options, package export boundaries, or existing imports to make a new type compile.

No edits to existing production source outside `src/reasoning/**`, ledgers, phase-verification states, test scheduling, timeouts, dependencies or historical reports. Do not complete the deferred CompletionReport mapping or claim Phase 5 is operational.

## 9. Execution budget and canonical verification

Budget: **60 minutes elapsed**, including setup, validation and cleanup. Reserve the last 15 minutes for safe verification/reporting. This is a stop budget, not a guaranteed delivery time. Record start/deadline. No extra agents, background retries, unbounded polling or changes to paid-access settings.

Use the installed toolchain; no package installation or network/model probe. Do not run the full baseline suite again before development. The reported baseline is **740 runtime tests / 78 files**; reconcile actual additions and final collection rather than hardcoding a new total.

During development use typecheck and the small reasoning architecture tests. Build once when compiled-output assertions need it. No process/authority execution is needed for new 5A proofs; the preserved canonical suite still runs its existing fixtures normally.

After the candidate is coherent, run the complete ordinary `npm run check` and capture its real exit code and full output. Use the already operator-approved environment for existing Git/process fixtures; do not silently change environment/permissions, use `tee`'s status, or label a sandbox/setup failure as product behavior. Stop for needed permission rather than bypass controls.

At most TWO canonical checks: first after the candidate is ready; second only after a specific owned correction or a resolved setup fault. No retries-until-green. Preserve maxWorkers=2 and src-lock-serial. A partial run, timeout, unhandled worker error, missing stage or missing tests is not PASS.

PASS requires all original and added tests accounted for, zero required failures/skips, typecheck/build/tests/CLI smoke/ledger verification complete with exit 0, and the finite 5A proof map complete.

## 10. Commits and evidence

Use at most three coherent local commits on `cursor/phase5a-reasoning-contracts`: contract if separate; type definitions/tests; final report. Two are sufficient when coherent. No ceremonial state/status commits, no amend/rebase/squash, no push or remote change.

A candidate or failure evidence may be committed honestly if the task stops; do not label it PASS. On success state:

`PHASE 5A REASONING CONTRACTS IMPLEMENTED — TYPES ONLY — NOT RUNTIME ENFORCED`.

In the report include:

- starting/final branch and SHA, exact changed paths and main unchanged;
- actual source-to-contract mappings and compatibility results;
- final exported internal type names and six-kind mapping table;
- distinction between proposed references, reference-bound shapes, verification obligations and citations;
- T01–T12/A01–A03 evidence map, three removed-directive diagnostics and exact restoration;
- separate compile-time proof count and runtime test count/delta;
- every canonical attempt, real exit, complete file/test totals, duration and all pipeline stages;
- zero runtime production behavior, zero new dependencies/authority/package exports;
- what was tested before commit and confirmation those source/test/config bytes equal the committed candidate;
- limitations below, no leftover task-owned work and clean worktree.

Do not put a report's own future commit SHA into that report. Return the resolved final SHA separately. After any report-only commit, confirm the tested load-bearing bytes remain unchanged; no second full check solely for that documentation commit.

## 11. Required honest limits

These must remain explicit and nonempty:

- Static contracts are implemented; JSON parsing, runtime authenticity, source binding, same-snapshot membership, freshness and admission enforcement are NOT implemented by 5A.
- Type assertions, `any` and hostile same-process code can evade compile-time discipline; no hostile-JavaScript security proof is claimed.
- A reference or citation does not prove a statement follows from evidence; a test pass does not prove universal behavior.
- CONTAINS checking is deferred; no content-search, AST or symbol extraction added.
- Observed dependency declaration does not establish installation/use; negative search does not prove absence.
- A cited run may be failed/stale; later Gate 2 must check its actual result, scope, check membership and applicability without upgrading it.
- Readonly types do not freeze external mutable runtime aliases; later producers must enforce real immutability/binding.
- No live model, autonomous loop, write, process, memory store, CLI wiring, new permission or phase promotion exists in this slice.

## 12. Return and stop

Return one report: PASS / FAIL / BLOCKED / INCOMPLETE, exact evidence above, main still at `bfd6fc5b5ec8888363b90745ba72e06db96198a1`, and no merge/push.

Do not start Phase 5B, invent an audit, or keep expanding the schema after fulfilling the finite contract. The next assignment implements the runtime reference-binding gate; this assignment only provides its honest, type-checked language.

### Design basis

Project sources: the supplied **ORCHESTRATOR_REASONING_LEDGER_SKETCH.md** (design, not frozen), the repository's actual Foundation Extensibility Constitution and Phase 2/4 contracts, and the explicit operator decisions in this package. The bounded refinements in §4 govern where the sketch overstates static or execution proof.

Language/tooling reference: TypeScript Handbook “Everyday Types” (assertions have no runtime checking) and “Narrowing” (discriminated unions/exhaustiveness); Git `git-switch` documentation (`--create`, `--no-track`). These explain tooling behavior, not repository evidence.

---

## APPENDIX A — FOUNDATION COMPATIBILITY PREFLIGHT

Relevant Constitution reminder domains: Knowledge (RepositoryEntry, ContentObservation, freshness), Evidence (admissible evidence; no invented verification), Authority (no new action/authorization), Provenance (not extended), Failure (structured refusal types only).

| Row | Concept | Result | Notes |
|---|---|---|---|
| A | `RepositoryEntry` | `MAPS_TO_EXISTING` | `src/inventory/types.ts` — earned inventory brand; type-only subject for EXISTS |
| B | `ContentObservation` + fingerprint | `MAPS_TO_EXISTING` | `src/reader/types.ts` — type-only subject for CONTENT/CONTAINS/DEFINES/BEHAVES |
| C | `ManifestEvidence` | `MAPS_TO_EXISTING` | `src/metadata/types.ts` — type-only subject for DEPENDS_DECLARED |
| D | `RepositorySnapshot` | `MAPS_TO_EXISTING` | `src/snapshot/types.ts` — bound context; no new snapshot producer |
| E | `WorkspaceBoundary` | `MAPS_TO_EXISTING` | `src/domain/workspace.ts` — bound context reference |
| F | `EngineeringRunRecord` | `MAPS_TO_EXISTING` | `src/engineering-run/types.ts` — citation target only; `CITED_RUN_ONLY` |
| G | `ValidationCheckKind` | `MAPS_TO_EXISTING` | `src/validation/types.ts` — obligation vocabulary for EXECUTION requirements |
| H | Global `ActionClass` / `KnowledgeState` / `Provenance` / `EvidenceKind` / `ValidationOutcome` | `NOT_EXTENDED` | Claim kinds, binding stage, refusal codes, hypothesis labels are reasoning-local |
| I | Edit / process / Validation authorization types | `NOT_CONSUMED_AS_AUTHORITY` | Proposals/bound claims must not assign to them (T09) |
| J | Content search / AST / symbol extraction | `NOT_APPLICABLE` | CONTAINS uses `DEFERRED_CONTENT_CHECK`; no capability added |
| K | Model / provider / persistence / CLI wiring | `NOT_APPLICABLE` | Types-only pass |
| L | Reference-binding authenticity / freshness | `DEFERRED` | Future runtime binder/verifier; not claimed by 5A types |
| M | Package-public reasoning export | `NOT_APPLICABLE` | Internal `src/reasoning/**` only; root exports unchanged |

No `BLOCKING_GAP` for types-only Phase 5A. Preserve `NOT PHASE_VERIFIED` and existing ledger states.

---

## APPENDIX B — SOURCE / API MAPPING

| 5A contract name | Maps to / defined as | Source |
|---|---|---|
| `ReasoningClaimKind` | Reasoning-local union of six kinds | `src/reasoning/types.ts` |
| `ProposedEvidenceReference` | Untrusted id/path-hint discriminant | `src/reasoning/types.ts` |
| `ProposedClaim` | Untrusted kind-discriminated proposal | `src/reasoning/types.ts` |
| `ReasoningHypothesis` | `INFERRED` / `UNVERIFIED` (local epistemic) | `src/reasoning/types.ts` |
| `ReasoningProposal` | Untrusted proposal envelope | `src/reasoning/types.ts` |
| `ReferenceBoundContext` | `{ workspace: WorkspaceBoundary; snapshot: RepositorySnapshot }` | type-only imports |
| `ReferenceBoundClaimShape` | Kind-correlated unbranded field shape | `src/reasoning/types.ts` |
| `ReferenceBoundClaim` | Shape + private unique-symbol brand | `src/reasoning/types.ts` |
| `ReferenceBoundReasoning` | Bound claims/hypotheses + context | `src/reasoning/types.ts` |
| `ExecutionVerificationRequirement` | Nonempty `ValidationCheckKind[]` + purpose | uses `ValidationCheckKind` |
| `EngineeringRunCitation` | Actual `EngineeringRunRecord` + check IDs + `CITED_RUN_ONLY` | type-only import |
| `ReasoningRefusal` | Six refusal codes + claim correlation | `src/reasoning/types.ts` |
| Public barrel | `export type` only | `src/reasoning/index.ts` |

### Six-kind bound mapping (locked)

| Kind | Bound source | `requiredVerification` |
|---|---|---|
| EXISTS | `RepositoryEntry` | OBSERVATION |
| CONTENT | `ContentObservation` | OBSERVATION |
| DEPENDS_DECLARED | `ManifestEvidence` + dependency name | OBSERVATION |
| CONTAINS | `ContentObservation` + needle | DEFERRED_CONTENT_CHECK |
| DEFINES | Nonempty `ContentObservation[]` + symbol | EXECUTION (+ requirement) |
| BEHAVES | Nonempty `ContentObservation[]` + scenario | EXECUTION (+ requirement) |

