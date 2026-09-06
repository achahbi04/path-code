# PATH CODE — PHASE 5B: REFERENCE BINDING + GATE 1
## Cursor implementation package — resolve references, enforce evidence boundaries, never mint action authority

**Implementer:** one normal Cursor desktop Agent. No Claude Code, subagents, or parallel writers.

| Item | Required value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Starting branch | `cursor/phase5a-reasoning-contracts` |
| Starting HEAD | `7fcbf11fb81ce275f58011c724ea6c156eb8d177` |
| New branch, in the SAME worktree | `cursor/phase5b-reference-binding` |
| Main worktree | `/Users/achahbi/Projects/path-code` |
| Expected main | `bfd6fc5b5ec8888363b90745ba72e06db96198a1` |
| Reported baseline | 79 runtime-test files / 745 runtime tests; T01–T12 are separate compile-only proofs |

## 1. Deliver this capability

Implement the first runtime reasoning boundary:

    genuine repository artifacts held by the trusted application
    -> registered, bounded reference catalog
    -> model-facing reference descriptors (no model call)
    -> untrusted ReasoningProposal JSON
    -> strict schema/limit checks
    -> exact reference resolution + admission/context checks
    -> bounded currentness checks through existing Phase 2 APIs
    -> kind-specific source checks
    -> authentic ReferenceBoundReasoning OR structured refusal

The output remains `REFERENCES_ONLY`. Successful binding is NOT semantic certification, execution verification, task success, or permission to edit or execute. In particular, an apparently sensible statement with a real citation may still be wrong.

Implement actual code and finite tests. Do not return another design-only proposal.

Not in this task: model/provider integration, orchestration/retry loop, editing, process execution, Git writes in production, content search, AST/symbol extraction, Gate 2, autonomous repair, CLI wiring, persistent memory, report signing, phase promotion, or a new generic detector. Existing regression tests may execute their existing fixtures; the new production gate does not execute commands.

## 2. Verify and branch without disturbing the existing work

Use explicit working directories. Verify the active root, branch, full HEAD, clean tracked/untracked tree, absence of merge/rebase/cherry-pick in progress, and the main checkout's branch/HEAD/clean state. Both worktrees must belong to the same common Git repository. Stop on any mismatch; do not reset, stash, discard, or repair another actor's work.

Confirm the new branch does not already exist. If it exists, stop rather than overwrite or silently reuse it. Then, in the active worktree only:

```bash
git switch --no-track -c cursor/phase5b-reference-binding 7fcbf11fb81ce275f58011c724ea6c156eb8d177
```

Reverify the root, new branch, HEAD and clean tree. Preserve the Phase 5A and Phase 4 branch references. No new worktree or dependency installation is needed. Do not change shared Git configuration or run concurrent source-mutating probes.

Main remains unchanged during implementation. Section 14 authorizes only a conditional fast-forward to the original types-only Phase 5A commit, not to new Phase 5B code.

## 3. Pin the actual inherited interfaces, then implement

Read the actual committed:
- `src/reasoning/types.ts`, `index.ts`, its 5A contract/report, and T01–T12;
- Phase 2 inventory/reader/metadata/snapshot interfaces and their admission/currentness rules;
- current configuration loading and denial behavior;
- existing internal registration/projection patterns where directly relevant;
- small architecture tests affected by reasoning gaining runtime behavior.

Do not assume field spellings from a chat summary. The existing six claim kinds, proposal schema version/reference discriminants, hypotheses, bound shapes, and six reasoning refusal codes are the base. Map actual fields before writing dependent code. Do not invent replacement RepositoryEntry, ContentObservation, ManifestEvidence, snapshot, or verification types.

Create `docs/passes/PHASE_5B_REFERENCE_BINDING_CONTRACT.md` containing this instruction and a compact source/API mapping. Include `FOUNDATION COMPATIBILITY PREFLIGHT`, using the committed Constitution's actual vocabulary. Relevant decisions:

| Concept | Decision |
|---|---|
| Existing Phase 5A proposal/bound shapes | Preserve meanings; implement the previously deferred runtime boundary |
| Catalog handles and runtime registration | Reasoning-local correlation/binding, NOT a new permission or global evidence tier |
| Entry/content/manifest membership | Reuse actual retained Phase 2 associations |
| Currentness | Reuse existing entry/full-content verification; no second byte reader or hash path |
| Declared dependency facts | Use actual Phase 2D observed declaration facts; not package installation or code usage |
| Malformed-input/catalog operational errors | Small reasoning-local error types; leave the six existing claim-refusal codes intact |
| Runtime reasoning imports | Explicitly supersede 5A's temporary types-only-area constraint for the new modules only |
| Action authority, providers, persistent storage | Not applicable here; no new authority or dependencies |

This package authorizes forward development on the implemented baseline. It does not assert that a missing historical audit or `PHASE_VERIFIED` promotion happened.

If a required source association genuinely cannot be obtained without reconstructing evidence or weakening an upstream invariant, identify that precise incompatibility and stop. A spelling/import-path difference is not a new architecture problem. Do not reread or re-audit the entire project history.

## 4. Trust boundary and catalog ownership

### Trusted input versus untrusted proposal

The trusted internal application supplies genuine upstream artifacts. The untrusted boundary accepts JSON text only: no model-supplied live catalog, snapshot, observation, config, callback, run record, or authority object.

A catalog factory is internal and may select only ORIGINAL objects retained by one compatible snapshot/inventory/metadata context. The caller may narrow that selection, not manufacture it. Check entry membership by reference identity, observation-to-entry association, snapshot/inventory compatibility, and manifest-evidence association with the existing parsed metadata facts. IDs, equal filenames, equal hashes or matching generation labels are not substitutes for those associations.

Use public/internal read-only APIs already provided by the owning layer. If necessary, ONE narrow read-only projection in `src/snapshot/` OR `src/metadata/` may expose already-retained associations. It may not mint evidence, add a mutable registry accessor, parse more formats, read files, or change upstream meanings. If more foundational behavior is needed, stop with the concrete missing contract.

Do not overclaim the boundary: a trusted application that fabricates an entire upstream context using hostile same-process JavaScript is outside this gate's threat model. The gate must reject forged/cloned objects at its OWN catalog/result boundary and mixed or cloned selected sources against the genuine context it was given. Do not claim TypeScript branding authenticates arbitrary host objects.

### Catalog behavior

- In-memory only, one immutable catalog bound to its exact workspace and snapshot context.
- Eligible records: admitted `RepositoryEntry`, associated `ContentObservation`, and supported `ManifestEvidence`/observed declaration association. No EngineeringRunRecord ingestion in this phase.
- Issue opaque, catalog-scoped handles using Node's existing cryptographic random-ID facility. Handles are references, not secrets, write capabilities or proof of semantic truth. Never derive trust from a prefix or from guessing a path.
- Private WeakMap/Map registration; no caller-supplied handle-to-object map or registration callback. Generate mappings once; never rebind an issued handle to newer content.
- Freeze/copy owned descriptors and collections. Do not return mutable Maps or writable aliases to authoritative state. Do not deep-freeze someone else's upstream objects.
- Reject incompatible input sets, duplicate conflicting selections and ambiguous same-kind records. Preserve exact upstream objects, not cloned evidence replacements.
- A small descriptor function returns handles, evidence kind, and optional admitted repository-relative path metadata. It does not return raw bytes, manifest secrets, host absolute paths, approval objects, or private registry state.
- Provide explicit disposal. It revokes catalog use and fresh applicability checks; no TTL service, filesystem cache, background cleanup, or persisted handle store. Repeated binding against an active catalog is permitted but must perform fresh checks each time.

A raw ID in a proposal is useful only when the trusted caller supplies the corresponding live catalog. A handle from another catalog/workspace/generation must fail even when its underlying file bytes happen to match.

## 5. Input boundary and finite limits

Prefer a single externally reachable internal entry operation conceptually equivalent to:

    bindReasoningProposalJson(jsonText, liveCatalog)

It parses and checks the complete input itself. A lower-level parser may be private. Do not expose an unchecked typed-object shortcut that callers can reach with a cast.

Use the actual Phase 5A ReasoningProposal schema/version. Parse with built-in JSON parsing and then explicit schema validation. No new schema library or custom JSON grammar. All consumers use the same normalized parsed object, not independent reparsing with different interpretations.

Reject:
- non-string input, invalid JSON, wrong top-level type/version;
- unknown discriminants/fields at the schema's objects, missing required fields and wrong primitive/array shapes;
- supplied authority, trusted-source or semantic-verification fields;
- `__proto__`, `prototype`, `constructor` keys at schema object positions;
- duplicate proposal-local claim IDs or hypothesis IDs; dangling inference-basis claim IDs;
- empty claims, invalid/nonempty field requirements, and exceeded limits.

Do not coerce, case-fold, trim identifiers, repair missing fields, infer a schema version, execute text, or merge parsed objects into a prototype-bearing registry. Use safe Maps/owned data records. JSON round trips never authenticate catalogs or bound results. Native duplicate-JSON-member parsing behavior is not cryptographic/canonical-document validation; this phase does not claim that property.

Explicit limits (reject, never silently truncate or widen):

| Item | V1 ceiling |
|---|---|
| Proposal JSON | 65,536 UTF-8 bytes |
| Claims | 1..32 |
| Hypotheses | 0..16 |
| Citations per claim | 0..8 structurally; binding requires appropriate nonempty support |
| Inference-basis links per hypothesis | 0..32 structurally; INFERRED requires nonempty valid claim links |
| Catalog records | 1..128 |
| IDs | 128 UTF-8 bytes, nonempty |
| Relative path hints | 1,024 UTF-8 bytes |
| Statement/outcome/scenario/purpose field | 4,096 UTF-8 bytes each |
| Dependency/symbol name | 256 UTF-8 bytes |
| CONTAINS needle | 1,024 UTF-8 bytes, nonempty |
| Unique referenced content inputs per bind/applicability call | 32 |
| Cumulative content-verification budget per call | 16 MiB, or a smaller inherited upstream ceiling |

The schema's own required structure still applies. Count all referenced backing content, including manifests and attempted reads, against the actual upstream verification budget. Failed or incomplete verification is not free and is not success. No unbounded recursive object walk: the proposal schema has fixed nesting. No general hypothesis dependency-graph engine; inferred bases refer to claims in this proposal only.

## 6. Exact reference resolution, never path-driven admission

Resolve EVERY subject/citation/reference field present in the actual proposal shape. Do not discard an invalid extra citation while accepting a valid one.

- An evidence-ID reference resolves only through this catalog's issued mapping and expected evidence category.
- A path hint is only an exact lookup into this catalog's already-selected admitted relative paths for the expected category. It does NOT trigger inventory, search, a new content read for missing evidence, or direct filesystem access.
- Require strict repository-relative syntax for path hints; reject absolute/drive/UNC paths, NUL, traversal segments, alternate separators, empty/dot segments and aliases needing normalization. Preserve ordinary filename characters and case. Exact admitted lexical paths are the comparison key, not fuzzy/path-normalized suggestions.
- Zero matches refuses; more than one eligible match refuses. Never pick the first ambiguous match.
- When a subject and citations both identify supporting source, require the actual underlying relationship to agree; a citation of file B does not support a CONTENT claim about file A.
- If an explicit ID is invalid, never fall back to a correct-looking path. If a registered content record is missing, never silently downgrade to an entry record or create a new observation.
- For plural DEFINES/BEHAVES sources, bind the nonempty cited content set using actual objects. Every reference must resolve; there is no partial-success claim.
- Do not require a desired FUTURE file in requested outcome to exist. Only an EXISTS claim about present repository state requires existing admitted evidence. This pass does not prepare file creation or authorize it.

Unknown/foreign/out-of-scope references return safe structured diagnostics, not the contents or location of a hidden source. Do not echo raw JSON, unknown paths, file bytes, secrets or low-level absolute-path errors in refusal messages.

## 7. Currentness: reuse the kernel, do not build another verifier

Before reference descriptors are exposed or binding evidence is returned, honor current repository policy. Load config through the existing real loader; a loader failure is not replaced by synthesized permissive defaults. Successful ABSENT retains the loader's real semantics.

For a bind, validate registered catalog/context and resolve the bounded references before verification. Then use the existing snapshot verification entry/content paths with the current config:
- EXISTS: exact admitted entry identity/currentness and current denial rules.
- CONTENT and backing sources of CONTAINS/DEFINES/BEHAVES: full-content verification against the original observation, not just stat/mtime equality.
- DEPENDS_DECLARED: verify the source manifest's observation the same way, plus its retained metadata association.

Deduplicate identical source references only within this one operation. Never reuse yesterday's or a previous call's currentness answer. Do not refresh the catalog to different objects/generations while checking it.

Only positive outcomes actually established by the existing verifier satisfy the relevant check. DENIED, UNREADABLE, UNVERIFIABLE, REVALIDATION_REQUIRED, stale states, budget exhaustion, incomplete verification, or incompatible context cannot produce bound success.

Do not directly read/hash/stat files from reasoning. If a selected-source API/projection is needed, keep it read-only at the existing owner; never reconstruct its security/currentness logic here. No new inventory traversal is performed by the gate. Missing observation means the caller must obtain new evidence separately and create a new catalog.

Recheck effective restrictions before returning success; a change during this operation refuses rather than silently broadening access. Use existing comparison/representation where available; otherwise compare the actual effective restriction fields deterministically, never an untrusted policy label. Do not create a policy engine.

The successful result records point-in-time checks over the cited declared set. It is not a lease, whole-repository seal, guarantee against transient change-and-restore, or proof that no unobserved file appeared.

## 8. Claim semantics — fixed method, scoped evidence, no invented truth

Construct the existing ReferenceBoundClaimShape branches, then mint the existing opaque bound types only on the successful gate path. Do not alter their six-kind semantics or add semantic-success/authorization booleans.

| Kind | Required source and additional check | Output obligation |
|---|---|---|
| EXISTS | Actual admitted entry, in this context, current under entry verification | OBSERVATION |
| CONTENT | Actual content observation with current full-content verification; arbitrary descriptive statement is NOT interpreted as verified semantics | OBSERVATION |
| DEPENDS_DECLARED | Actual compatible ManifestEvidence AND an existing Phase 2D observed dependency-declaration fact naming the exact requested dependency | OBSERVATION |
| CONTAINS | Current actual content source + needle; do NOT search for the needle here | DEFERRED_CONTENT_CHECK |
| DEFINES | Nonempty current content sources + asserted symbol; no substring/symbol proof | EXECUTION |
| BEHAVES | Nonempty current content sources + scenario; no assertion of behavior from reading | EXECUTION |

For DEPENDS_DECLARED, use the structured observed fact that Phase 2D actually issued (e.g. its DECLARED_PACKAGE_DEPENDENCY equivalent). A manifest's mere existence, filename, an inferred framework claim, or textual occurrence of a name is insufficient. Keep the declaration's manifest-local scope. Do not imply installed, used or compatible. Reuse retained parsed facts or the allowed read-only owner projection, not JSON reparsing in reasoning or node_modules/registry access. If that exact association is absent, refuse the claim rather than inventing it.

For DEFINES/BEHAVES fill the existing ExecutionVerificationRequirement without creating commands or running anything. If 5A carries an explicit well-typed check-kind/purpose request, validate it against the actual allowed kind vocabulary. Otherwise the minimal gate-assigned obligations are TYPECHECK for DEFINES and TARGETED_TEST for BEHAVES, with purpose derived from the bounded structured symbol/scenario. These are requirements for later evaluation, not permission, approved test selection or proof that those checks alone are sufficient.

CONTAINS/DEFINES/BEHAVES may be reference-bound successfully while their verification obligations remain outstanding. That is NOT bypassing a gate: REFERENCES_ONLY is the only meaning of this output. There is no write/execute consumer in 5B. Do not convert any bound claim into a satisfied action precondition.

Hypotheses retain INFERRED/UNVERIFIED exactly. Resolve their claim-ID bases to this proposal's accepted claims without promoting the hypothesis. No numeric confidence or negative search result becomes observed truth.

EngineeringRunCitation remains a separate Phase 5A type for future Gate 2. Do not ingest runs, resolve check IDs, execute applicability of runs, or certify DEFINES/BEHAVES using old result IDs in this package.

## 9. Result authenticity and safe failure behavior

Use a private registration mechanism for minted bound claims and bundles. Keep the unique-symbol type brands non-public; no raw bound-shape mint exposed through a barrel. A narrowly localized cast to the existing declared brand is allowed only after all runtime checks, at the private registration point—not as input validation or a substitute for upstream evidence.

Own/copy/freeze mutable proposal-derived arrays and data before awaits. Retain original genuine artifact references privately. Do not expose writable mappings, verification receipts, or aliases that can rewrite the authoritative association. Avoid a general-purpose deep-freezer over borrowed upstream objects.

Return the existing ReferenceBoundReasoning with stage REFERENCES_ONLY. Keep detailed verification receipts/diagnostics separate from semantic claim fields. A result that merely looks structurally identical must not authenticate.

Provide a narrow internal `checkReferenceBoundReasoningApplicability` (or equivalent) which:
1. authenticates this gate's issued result and its original registered catalog/context;
2. reuses the SAME resolution/currentness/structured-fact mechanism for the retained original inputs;
3. returns a new point-in-time applicability observation;
4. does not mutate, rebind, reissue or upgrade the historical result.

Disposal or stale evidence invalidates current applicability, not the historical fact that references were checked earlier. A presence/registration predicate is never a currentness check.

Keep the six 5A ReasoningRefusal codes and their meanings. Suggested mapping, pinned to the actual inherited fields:
- UNBOUND_CLAIM: required citation missing or issued reference unresolved;
- EVIDENCE_IDENTITY_MISMATCH: wrong category, catalog/context/source relationship or source conflict;
- STALE_EVIDENCE: a cited entry/content is stale, unreadable or not positively verified;
- GROUNDING_OVERCLAIM: declared fact/predicate not supported by its actual structured metadata, or attempted semantic/provenance upgrade;
- CLAIM_OUTSIDE_ADMITTED_SET: outside/denied/unadmitted source;
- UNVERIFIABLE_IN_PRECONDITION: retained for future consumers; do not create an action-precondition API just to exercise this code.

Add separate small reasoning-local input/catalog failures for malformed schema, bounds, invalid catalog, disposed catalog or config failure. Do not overload a claim code to mean malformed JSON and do not expand global foundation error/state unions. Preserve originating safe classifications without leaking raw OS errors.

One bad required source refuses the whole proposal. Use deterministic fail-fast order (schema, context, claims in supplied order, references in supplied order). Do not return a usable partial bound bundle; no automatic retry or ignored refusal. Do not require every representable future refusal code to have a new producer today.

## 10. Layout and explicit 5A architecture evolution

Preferred additions in `src/reasoning/`: small catalog, parser, binding/applicability, bounds/failures and private-registration modules. Merge responsibilities when it is clearer; do not create a file per trivial field. Keep types in `types.ts` type-only; new runtime-local declarations may live in another type-only file.

`src/reasoning/index.ts` may now export the explicitly approved internal runtime operations alongside the preserved `export type` list. The package root and package subpaths remain unchanged.

Explicitly update the temporary 5A architecture assertions:
- A01 continues enforcing TYPES ONLY on the designated contract/type files; new runtime modules are inspected against the actual 5B allowed imports/operations.
- A02 continues proving those type modules emit no behavior. The internal runtime barrel now has a finite, explicitly tested export set; package-root exposure remains forbidden.
- A03 remains: earlier production layers must not import reasoning. An owner projection added upstream must NOT import reasoning back.

Preserve T01–T12 and all their field/opacity distinctions. Do not delete the old tests merely because reasoning now has runtime behavior.

Permitted production value dependencies: existing config/snapshot/metadata read-only APIs as required, and built-in byte sizing/random-handle generation. No direct filesystem access, file hashing, child_process, network, provider SDK, edits, process/Validation/EngineeringRun execution, approval mint, arbitrary verifier/loader callback or caller-supplied operation bag. WeakMap registration here is evidence association, not process authority.

No new runtime/dev dependency, package export, global vocabulary, ledger promotion, persistent store, general public-authority-analyzer expansion or unrelated source change. If an existing architecture assertion forbids the exact new runtime reasoning area, amend only that named rule with the above positive/negative boundary tests; do not exempt all future modules.

## 11. Finite proof matrix

Record every row with actual test name/assertion and mechanism. Several rows may share one test; do not inflate runtime totals with compile-only witnesses. New runtime positive fixtures earn real Phase 2 observations via existing APIs in small disposable workspaces, preferably without Git. No fabricated trusted-object positives. No paid model/network/process workload is needed for the new gate tests.

| ID | Required proof |
|---|---|
| B01 | Compatible catalog from real artifacts; descriptors are safe owned views; incompatible generation/workspace/selected clones refused. |
| B02 | Valid Phase 5A JSON parses without silently changing fields; malformed/version/unknown-field/forbidden-upgrade input refuses. |
| B03 | Size/count/string/cumulative-verification bounds reject before unbounded work; no partial bound result. |
| B04 | Invented handle, other-catalog handle and correct-path fallback after bad ID refuse. |
| B05 | Exact registered path hint works; absolute/traversal/ambiguous/unselected hint refuses; missing content does not trigger admission or auto-reading. |
| B06 | Actual EXISTS and CONTENT bind to original source objects; subject/citation mismatch and invalid extra citation refuse. |
| B07 | Correct dependency declaration binds; an absent dependency, inference-only metadata or declaration from a different manifest does not. |
| B08 | Same-size/same-mtime changed content is rejected through full-content verification, not metadata equality. |
| B09 | Deleted/replaced/retargeted/now-denied source cannot bind; denial does not leak hidden path/content in diagnostics. |
| B10 | Config failure/changed effective restrictions, unverifiable source and verification-budget exhaustion fail closed; successful ABSENT follows existing semantics. |
| B11 | CONTAINS remains deferred even if its needle is visibly in the source; DEFINES/BEHAVES keep EXECUTION with a nonempty obligation, never semantic PASS. |
| B12 | Duplicate claim IDs/dangling inference bases refuse; supported INFERRED and UNVERIFIED hypotheses retain their labels. |
| B13 | Caller mutations of catalog selection/descriptor and proposal-derived views cannot change retained source binding or accepted output. |
| B14 | Catalog/result clones and JSON copies fail registration checks; disposal invalidates future binding/applicability. |
| B15 | Fresh applicability rereads through the existing verifier; stale input refuses reuse while original bound result stays unchanged. |
| B16 | One invalid claim makes the whole gate refuse; zero valid bound bundles escape on a partial/error path; no retry. |
| B17 | Desired creation in outcome is allowed as intent text without inventing an EXISTS entry; it still grants no edit authority. |
| B18 | E2E: real manifest + source evidence -> descriptors -> JSON citations -> REFERENCES_ONLY; change declared bytes -> next bind/applicability refuses; no edit/process execution. |
| B19 | Existing compile proofs preserved; proposed and reference-bound reasoning cannot be passed as edit/process/Validation authorization. |
| B20 | Contract files remain types-only; internal runtime exports explicit; no root exposure, reverse imports, direct I/O/execute/approval seam or import-time observation. |

Use table-driven cases for the listed input variations, not a combinatorial generator or another standing detector project. Distinguish parser tests, real currentness tests and synthetic classification tests in the report.

### One bounded live bypass check

Use the actual owner-private binding path and fixture evidence, not historical analyzer mutations. Snapshot the relevant candidate file, then temporarily bypass the catalog resolution failure at the real call site so the known invented/wrong-source reference is treated as a valid resolved source. The specific B04/B06 runtime test must fail for its intended assertion. Restore the exact snapshot bytes and confirm that focused test passes.

Then in one separate bounded probe bypass only the requirement for positive content-currentness, without changing the test fixture: B08 must fail because stale content becomes accepted. Restore exactly and confirm its focused test passes. These are at most two named corruptions, not a mutation-testing framework. Compile errors/missing imports do not count. Do not corrupt production sources outside the reasoning candidate, restore from HEAD over uncommitted work, or re-run the whole suite under corruption.

If an independent downstream check still rejects the corrupted end-to-end case, preserve that defense and record it. Prove the altered predicate with a focused test of the SAME private resolver/currentness predicate used by the gate; do not weaken a redundant defense to manufacture an escape. Record separately whether the private-mechanism test failed and whether end-to-end rejection survived. If a safer equivalent private test seam is already available, keep it test-only and use the same real call path; do not export a mechanism-substitution option to facilitate testing.

## 12. Verification and budgets

Time budget: **90 minutes elapsed**, including evidence and cleanup; reserve the last 15 minutes. This is a stop budget, not a promise or a reason to spend the full time. Record actual start/deadline. No extra agents, blind retries, background waiters, billing changes or installs.

Use the existing installation. First verify the approved environment supports the existing disposable fixture operations. Do not start a known-denied sandbox full run and label its failures product defects; request only needed execution permission and do not bypass platform controls. Do not kill unknown/other-project processes.

Development: typecheck, small reasoning tests, build when compiled-output checks require it. Do not rerun the full baseline suite to recount the already reported 745/79. Reconcile additions/collection and keep all prior tests. Retain maxWorkers=2, src-lock-serial, strict compiler settings, timeouts and every prior assertion except the explicitly amended 5A runtime-area assertions.

When coherent, run the ordinary complete `npm run check` and capture its actual exit status/full log. At most TWO canonical attempts: one after the candidate, a second only after a specific owned correction or resolved one-off setup fault. No repeats until lucky. PASS requires all collected tests accounted for, zero required failures/skips and worker errors, complete typecheck/build/test/CLI smoke/ledger verification and the proof map.

A failure/timeout/partial run remains failure. Stop and preserve the candidate rather than changing unrelated budgets, tests or phase labels. Temporary corruption and owned fixtures must be cleaned safely; never reset legitimate work.

## 13. Commits and report

Use up to three coherent local commits: contract/mappings; code/tests; final report. Two suffice when coherent. No ceremonial self-referential SHA-fill commits, amend/rebase/squash/push/remote. Preserve all ancestry.

Create `docs/reports/PHASE_5B_REFERENCE_BINDING_GATE1_REPORT.md` with:
- start/implementation/final branch+SHAs, exact changed paths;
- actual inherited field/type/refusal mappings and supported metadata declaration predicate;
- input schema and limits, catalog source provenance/trust boundary, issued-handle/context lifecycle;
- reference/path resolution, full-content currentness and denial behavior;
- success meaning REFERENCES_ONLY and per-kind outstanding obligations;
- live result/catalog registration, mutation protection and fresh applicability semantics;
- B01–B20 assertion mapping and both bounded-bypass diagnostic/restoration results;
- exact amendments to 5A A01/A02 with T01–T12 preserved;
- focused/compile/canonical results with precise totals, deltas, exit statuses and all attempted failures;
- tested source/configuration bytes versus committed candidate equality;
- explicit limits: no arbitrary prose entailment, no cryptographic attestation, no hostile-host proof, no whole-tree seal, no content-search/symbol verification, no Gate 2, no action permission;
- final processes/residue/tree/main state and no push/phase promotion.

Do not put the report's own future SHA inside it. If tests ran while HEAD was a predecessor, state that and verify load-bearing byte equality after commit. A docs-only report commit does not require a second full-suite run merely to change the printed SHA.

Success status:

`PHASE 5B REFERENCE BINDING + GATE 1 IMPLEMENTED — REFERENCES_ONLY — NOT SEMANTICALLY VERIFIED — NO ACTION AUTHORITY`

## 14. Conditional integration and stop

After the complete gate and proof map PASS, recheck main is still clean at `bfd6fc5b5ec8888363b90745ba72e06db96198a1`. The operator authorizes a fast-forward of main to the ORIGINAL PHASE 5A CHECKPOINT ONLY:

```bash
git -C /Users/achahbi/Projects/path-code merge --ff-only 7fcbf11fb81ce275f58011c724ea6c156eb8d177
```

If main differs, stop integration without reset. Do not merge new runtime Phase 5B commits in this task. Report 5A on main and 5B on its branch distinctly. If implementation or final validation fails, main remains unchanged.

Return the full report, actual internal API signatures, exact six-kind behavior/refusal table, proof mapping and SHAs. Do not start Gate 2, a provider, orchestration loop or Phase 5C. STOP for review.

## Design basis

This package builds on the supplied Phase 5A implementation report and `PathCode_Phase5A_Reasoning_Contracts_Cursor_Implementation.md`, the Reasoning Ledger sketch's citation-versus-truth distinction, and the existing Phase 2D/2F declared-fact and point-in-time verification contracts. The actual committed repository at the required HEAD controls source-field/API spellings; the snapshot of implementation source was not supplied to the architect, so the mapping step is mandatory, not a claim of prior source inspection.

The sketch's absolute claims about preventing all incorrect reasoning are not adopted. Runtime binding authenticates the references relative to the held trusted context; it cannot prove arbitrary natural-language meaning.

Tooling references (not repository evidence): TypeScript Handbook, Everyday Types, type assertions (no runtime validation); Node.js Crypto API, randomUUID (random reference identifiers). Use installed toolchain features, not a version upgrade.

---

# APPENDIX — FOUNDATION COMPATIBILITY PREFLIGHT + SOURCE/API MAPPING

**Recorded at:** Phase 5B implementation start against HEAD `7fcbf11fb81ce275f58011c724ea6c156eb8d177`  
**Constitution vocabulary used:** retain existing earned artifact types; preserve `NOT PHASE_VERIFIED`; no ledger promotion; no invented evidence substitutes.

| Consumed concept | Decision | Actual source |
|---|---|---|
| Existing Phase 5A proposal/bound shapes | Preserve meanings; implement deferred runtime boundary | `src/reasoning/types.ts` |
| Catalog handles / runtime registration | Reasoning-local correlation/binding; NOT permission or global evidence tier | `src/reasoning/catalog.ts`, `src/reasoning/internal/registry.ts` |
| Entry/content/manifest membership | Reuse Phase 2 associations by reference identity | Inventory ADMITTED entries; `snapshot.contentObservationByEntry`; OBSERVED `ManifestEvidence` on map claims |
| Currentness | Reuse `verifyRepositorySnapshot`; no second byte reader | `src/snapshot/verify.ts` |
| Declared dependency facts | Phase 2D `DECLARED_PACKAGE_DEPENDENCY` on `ManifestEvidence.fact` | `src/metadata/types.ts` |
| Malformed-input/catalog errors | Reasoning-local failure kinds; six claim-refusal codes intact | `src/reasoning/failures.ts` |
| Runtime reasoning imports | Supersede 5A types-only-area for NEW modules only; contract files remain types-only | Architecture A01/A02 amendment |
| Action authority / providers / persistence | Not applicable | — |

## Inherited field spellings (pinned)

| Symbol | Notes |
|---|---|
| `ReasoningProposal.schemaVersion` | literal `1` |
| `ProposedEvidenceReference` | `EVIDENCE_ID` + `id` \| `REPOSITORY_RELATIVE_PATH` + `relativePath` |
| Six kinds | `EXISTS` `CONTENT` `DEPENDS_DECLARED` `CONTAINS` `DEFINES` `BEHAVES` |
| Bound sources | Entry / ContentObservation / ManifestEvidence / ContentObservation[] |
| `requiredVerification.method` | `OBSERVATION` \| `DEFERRED_CONTENT_CHECK` \| `EXECUTION` |
| `ValidationCheckKind` | `TYPECHECK` \| `LINT` \| `BUILD` \| `TARGETED_TEST` |
| Refusal codes | `UNBOUND_CLAIM` `EVIDENCE_IDENTITY_MISMATCH` `STALE_EVIDENCE` `GROUNDING_OVERCLAIM` `UNVERIFIABLE_IN_PRECONDITION` `CLAIM_OUTSIDE_ADMITTED_SET` |
| Dependency predicate | `fact.kind === "DECLARED_PACKAGE_DEPENDENCY" && fact.packageName === dependencyName` |

## Upstream APIs used (value imports)

| API | Import |
|---|---|
| `loadProjectConfig` | `../config/loader.js` |
| `verifyRepositorySnapshot` | `../snapshot/index.js` |
| `MAX_CONTENT_VERIFICATIONS_PER_OPERATION` | `../snapshot/index.js` (ceiling; gate uses ≤32 unique content refs) |
| `Result` / `success` / `failure` | `../domain/result.js` |
| `randomUUID` | `node:crypto` |
| `Buffer.byteLength` | Node built-in |

No new dependency. No package-root export. No reverse import into earlier layers. No Gate 2 / content search / AST / provider / edit / process.

**Preflight result:** no `BLOCKING_GAP`. Forward development authorized on implemented baseline. Preserve `NOT PHASE_VERIFIED`.
