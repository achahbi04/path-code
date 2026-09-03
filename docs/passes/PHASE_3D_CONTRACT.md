PATH CODE — PHASE 3D
MULTI-FILE COORDINATION IMPLEMENTATION PASS CONTRACT
CURSOR MULTITASK — FINAL MERGED

REPOSITORY
/Users/achahbi/Projects/path-code

THIS CONTRACT IS A REPOSITORY ARTIFACT

Per the frozen Foundation Extensibility Constitution V1 §9, commit this exact
executed contract as:

docs/passes/PHASE_3D_CONTRACT.md

inside the Phase 3D implementation freeze commit.

The contract is the instruction.
The report is what happened.
Both are evidence.

Do not post-hoc rewrite or polish this contract.

==================================================
CURRENT FROZEN BASELINE
==================================================

Current reported HEAD prefix:
1e6dd0e

The full SHA was not included in the user-facing freeze report.

MANDATORY:

resolve it mechanically:

git rev-parse 1e6dd0e^{commit}

Then verify:

git rev-parse HEAD
==
the resolved full SHA

Record the full baseline SHA in the engineering report.

Phase 3D Master:
28efece61800d4b6dd92465d3499e648268365a3

Foundation Extensibility Constitution V1:
a73a623cfed77d2c2dc0238d386d40d4d1595065

Phase 3C-H1 COMPLETE:
dcb347fc613114be810b8caf371f0bea8b261285

Expected runtime total:
541

VERIFY rather than assume.

CURRENT CAPABILITY STATE

edit-contracts:
PASS_FROZEN

existing-file-replacement:
PASS_FROZEN

safe-file-creation:
PASS_FROZEN

safe-editing:
DECLARED / IN PROGRESS

Phase 3D implementation:
ABSENT

Phase 3 integration audit:
ABSENT

==================================================
GOVERNING SOURCES
==================================================

docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md
docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md
docs/PHASE_3_SAFE_EDITING_MASTER.md
docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md
docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md
docs/ENGINEERING_SELF_OBSERVATION.md
docs/GAP_LEDGER.md

docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md
docs/reports/PHASE_3C_H1_REPORT.md

machine-readable Capability Ledger v1
machine-readable Gap Ledger v1

Where this contract conflicts with the frozen Phase 3D Master:

THE MASTER GOVERNS.

STOP AND REPORT the conflict.

Do not choose, reinterpret, or silently narrow the Master.

==================================================
FOUNDATION COMPATIBILITY PREFLIGHT
==================================================

FOUNDATION COMPATIBILITY PREFLIGHT inherited; no new foundational concept
introduced.

The frozen Phase 3D Master source-confirmed all ten rows as:

MAPS_TO_EXISTING

This implementation pass must use those mappings exactly.

If actual implementation inspection reveals that a frozen preflight row was
wrong:

STOP AND REPORT.

Primary origin must be recorded as:

CONTRACT
FOUNDATION
or IMPLEMENTATION

according to the frozen Constitution.

Do not repair around a failed frozen preflight row inside this pass.

==================================================
CONSTITUTION PASS-WRITER COMPLIANCE
==================================================

This contract follows the frozen Constitution V1 §5:

1. It requires only mechanisms source-confirmed before the Master froze.

2. It resolves implementation decisions below rather than delegating known
   design choices to Cursor.

3. Every load-bearing MUST maps to a numbered test, falsification, architecture
   scan, or explicit review-by-inspection gate.

4. Every live falsification names:
   - the exact corruption;
   - the focused test expected to fail;
   - the required restoration.

5. Any frozen-contract contradiction is blocking regardless of residual
   safety.

6. NOT VALIDATED is mandatory and non-empty.

7. Requirements trace to the frozen Phase 3D Master, Constitution, Phase 3
   Master, or existing amendments/evidence.

==================================================
PURPOSE
==================================================

Implement ONLY:

PHASE 3D — MULTI-FILE COORDINATION

Coordinate a bounded sequence of two to sixteen already-prepared,
individually-authorized single-target mutations under one plan.

Each target is exactly one of:

MODIFY_EXISTING_FILE
→ frozen Phase 3B existing-file replacement

CREATE_FILE
→ frozen Phase 3C safe file creation

Phase 3D adds:

1. an opaque immutable plan;
2. a mandatory read-only plan preflight;
3. sequential execution through the unchanged 3B/3C target operations;
4. an opaque honest multi-file result.

Phase 3D adds NO:

- third mutation kind
- plan-level authorization
- new write module
- transaction
- rollback
- persistence
- Git execution
- repository-knowledge repair

==================================================
CENTRAL RULES
==================================================

A PLAN IS NOT AUTHORITY.

A PLAN IS NOT A LEASE.

PREFLIGHT IS DIAGNOSTIC READINESS, NOT MUTATION PERMISSION.

EACH TARGET EARNS ITS OWN MUTATION AT ITS OWN TURN.

PER-TARGET ATOMICITY DOES NOT MAKE THE PLAN ATOMIC.

PARTIAL COMMIT IS REPORTED, NEVER REPAIRED.

==================================================
MULTITASK EXECUTION MODEL
==================================================

USE CURSOR MULTITASK.

Parallelize READ-ONLY source review, adversarial design, and evidence planning.

SERIALIZE all repository writes and commits.

ABSOLUTE RULE:

ONLY ONE TASK MAY WRITE THE REPOSITORY.

Parallel reviewers must not modify files.

The writer begins only after all reviewer tasks return PASS and the
coordinator reconciles them against the frozen Master.

==================================================
TASK 0 — BASELINE GATE
==================================================

Before parallel work:

1. resolve the full current baseline SHA from 1e6dd0e;

2. verify HEAD equals that full SHA;

3. verify clean main;

4. verify all frozen checkpoints remain ancestors;

5. verify:
   - src/editing contains no multi-file plan/coordinator;
   - docs/passes/PHASE_3D_CONTRACT.md is absent;
   - Phase 3 integration audit is absent;
   - runtime dependencies are 0.

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

Determine the ACTUAL baseline test total.

Historical expectation:
541

If materially different:

STOP AND REPORT.

==================================================
PARALLEL TASK A — SOURCE / API / VOCABULARY REVIEW
READ-ONLY
==================================================

Read the frozen Phase 3D Master in full.

Inspect actual current source for:

- PreparedMutation
- PreparedCreation
- PreparedChange
- EditAuthorization
- lookupAuthorizationEntry
- consumeEditAuthorization
- replaceExistingFile
- createFile
- EditRecord
- KnowledgeInvalidation
- CreationAfterStateEvidence
- WorkspaceBoundary
- CanonicalPath
- RepositoryEntry
- ActionClass
- bounds constants
- current Result/failure conventions
- public editing barrel
- declaration/dist surfaces

Confirm the smallest exact API design below is compatible:

- MultiFilePlanEntry
- MultiFilePlan
- MultiFilePlanBuildFailure
- MultiFilePlanResult
- createMultiFilePlan
- executeMultiFilePlan

Confirm:

- no action-specific generic EditAuthorization exists unless actual source
  proves otherwise;
- exact prepared/authorization pairing is therefore enforced by the private
  registry at runtime, not falsely claimed as a compile-time generic guarantee;
- plan/result branding follows current declaration-safe opacity patterns;
- no unsafe constructor needs public export;
- exact input-array copying can preserve caller order immutably.

Return:

PASS / BLOCKED

with exact source names and any naming correction required to remain
consistent with repository conventions.

NO WRITES.

==================================================
PARALLEL TASK B — READ-ONLY PREFLIGHT REVIEW
READ-ONLY
==================================================

Map every preflight check to an existing authoritative read-only mechanism.

At minimum:

- plan bounds
- exact same-workspace identity
- duplicate prepared/authorization references
- non-consuming authorization readiness
- canonical target collision
- current config resolution
- lexical denial
- physical denial
- action restriction
- current content fingerprint for replacement
- current target absence for creation
- target/parent kind
- hard-link/symlink/platform restrictions
- optional Git UNMERGED refusal

LOCKED PREFLIGHT CONFIG DECISION

Because every target shares one workspace, preflight resolves PATHCODE.md
ONCE at the beginning of the read-only preflight.

That successful ResolvedProjectConfig is used only for this point-in-time
diagnostic preflight.

It is:

- not persisted;
- not attached as authority;
- not passed into target execution;
- not reused after execution begins.

If preflight config loading fails:

- every target receives CONFIG_RELOAD_FAILED / exact existing equivalent;
- no target path/content is inspected under unknown restrictions;
- the plan returns REFUSED_AT_PREFLIGHT;
- no authorization is consumed.

Every target execution later re-resolves config independently through the
unchanged 3B/3C operation.

AUTHORITATIVE-LOGIC RULE

Do not create shadow deny/action/currentness semantics.

Use existing read-only helpers already used by 3B/3C.

If a behavior-preserving extraction is genuinely required:

- extract the smallest internal read-only helper;
- make both the existing single-target operation and 3D preflight use the same
  source of truth;
- keep every existing public API unchanged;
- rerun the exact inherited regression/falsification target affected by that
  extraction.

No direct node:fs import in the coordination/preflight modules.

No call to a write primitive during preflight.

If the complete frozen preflight cannot be implemented without a second
generic reader, second writer, or duplicated policy engine:

RETURN BLOCKED.

NO WRITES.

==================================================
PARALLEL TASK C — EXECUTION / RESULT / FAILURE REVIEW
READ-ONLY
==================================================

Confirm the coordinator can call the complete existing target operations
without bypassing any check.

Lock:

- exact input order;
- strictly sequential execution;
- no speculative staging;
- no parallel target mutation;
- no config object passed between targets;
- stop on first non-success;
- COMMITTED_FAILURE both stops and counts as a committed mutation;
- NOT_ATTEMPTED authorizations remain unconsumed;
- exact nested 3B/3C result objects are preserved rather than reconstructed;
- no plan-level EditRecord, provenance, or synthesized invalidation;
- no rollback and no retained original bytes.

TEST-ONLY ORCHESTRATION SEAM

First inspect the existing 3B/3C controlled-fault mechanisms.

If plan-level precommit and committed-failure integration tests cannot be
induced through existing internal seams, the smallest permitted internal seam
is:

an internal, non-public coordinator binding with exactly two operations:

- replaceExistingFile
- createFile

Production binds those names to the frozen real functions.

Tests may wrap an operation only to:

- mutate a controlled fixture immediately before delegating;
- pass an already-existing internal target-operation fault adapter;
- observe order/calls.

Tests must not fabricate a successful or committed-failure result and present
that as integration evidence.

No public dependency injection.

No generic executor framework.

No test hook exported from package root or editing barrel.

Return:

PASS / BLOCKED
+
exact test induction strategy.

NO WRITES.

==================================================
PARALLEL TASK D — ADVERSARIAL / ARCHITECTURE / SELF-OBSERVATION REVIEW
READ-ONLY
==================================================

Design and confirm:

- type-level evidence;
- D-F1 through D-F11 live falsifications;
- source/dist write-boundary scans;
- import-side-effect tests;
- pass-contract artifact storage;
- Phase 3D report structure;
- Capability Ledger linkage;
- Gap Ledger handling;
- two-commit freeze sequence.

Confirm:

- no public preflight-preview API is required in 3D;
- no plan-level authorization type exists;
- no retroactive pass-contract work is performed;
- no automatic new gap is created merely for the intentional
  preflight-to-execution window;
- inherited gaps retain their states;
- only a real new limitation is proposed as an UNREVIEWED gap.

Return:

PASS / BLOCKED
+
final evidence matrix.

NO WRITES.

==================================================
JOIN GATE
==================================================

Wait for Tasks A–D.

Resolve disagreement using:

1. frozen Phase 3D Master;
2. actual repository source;
3. frozen Foundation Extensibility Constitution;
4. frozen Phase 3 Master and amendments.

NOT majority vote.

If any task returns BLOCKED:

STOP.

Do not implement around the contradiction.

Only after all PASS:

start the single repository writer.

==================================================
1. PUBLIC API AND EXACT VOCABULARY
==================================================

Use these exact semantic concepts.

Repository naming may vary only where Task A proves an established naming
convention requires it; the report must record the mapping.

PUBLIC MINIMUM

- MultiFilePlanEntry
- MultiFilePlan
- MultiFilePlanBuildFailure
- MultiFilePlanResult
- createMultiFilePlan
- executeMultiFilePlan

NO PUBLIC:

- preflightMultiFilePlan
- preflight result as reusable permission
- plan-level authorization
- plan-result constructor
- plan brand constructor
- target-execution bindings
- registry mutation
- test hook
- rollback/resume API

==================================================
2. PLAN CONSTRUCTION — PURE, OPAQUE, IMMUTABLE
==================================================

createMultiFilePlan is pure.

It accepts a readonly sequence of entries.

Every entry contains exactly:

- prepared: PreparedMutation | PreparedCreation
- authorization: EditAuthorization

The action/kind is derived from prepared.

The caller does not supply action separately.

PLAN-CONSTRUCTION RULES

- count must be 2 through 16;
- every target proposed-byte length must be within the frozen per-file ceiling;
- total proposed bytes must be within the frozen plan ceiling;
- every prepared object must bind the same exact WorkspaceBoundary authority;
- exact repeated prepared-object references are rejected;
- exact repeated authorization references are rejected;
- caller narrowing is honored;
- caller widening is rejected.

The builder copies the input sequence into operation-owned immutable storage.

Mutating/reordering/replacing the caller's original array after plan
construction must not change the plan.

No filesystem access.

No config load.

No authorization readiness lookup.

No authorization consumption.

No collision/currentness claim.

PLAN BUILD FAILURE VOCABULARY

Use a closed discriminated union with exact semantics equivalent to:

- PLAN_TARGET_COUNT_OUT_OF_BOUNDS
- PLAN_TARGET_BYTES_EXCEEDED
- PLAN_TOTAL_PROPOSED_BYTES_EXCEEDED
- PLAN_WORKSPACE_MISMATCH
- DUPLICATE_PREPARED_CHANGE
- DUPLICATE_AUTHORIZATION

No generic string failure.

No MultiFilePlan exists on build failure.

A zero-target, one-target, or seventeen-target input is a plan-construction
failure—not a mutation result—because no valid plan was admitted.

This is the precise implementation of the frozen Master's definition that a
plan contains 2 through 16 targets.

==================================================
3. MULTI-FILE PLAN OPACITY
==================================================

MultiFilePlan is opaque and declaration-safe.

It binds:

- exact immutable ordered entry sequence;
- exact effective narrowed bounds;
- exact WorkspaceBoundary authority;
- plan identity;
- no currentness claim;
- no preflight evidence;
- no plan-level authority.

A plain object cannot satisfy MultiFilePlan through normal construction.

Serialization cannot recreate it.

The plan itself does not imply any authorization remains unconsumed or any
target remains current.

==================================================
4. EXECUTION ENTRYPOINT
==================================================

executeMultiFilePlan accepts only a MultiFilePlan.

It performs a fresh internal preflight in the same invocation.

It never accepts:

- a cached preflight result;
- a plan-level authorization;
- a caller-supplied ResolvedProjectConfig;
- caller-supplied execution order;
- caller-supplied target outcomes;
- caller-supplied commit-point claims.

No public preview API is introduced in 3D.

==================================================
5. PREFLIGHT — READ-ONLY AND NON-CONSUMING
==================================================

Preflight is mandatory.

It executes before the first target operation.

It performs no mutation.

It consumes no authorization.

It grants no authority.

ORDER

A. verify immutable plan/bounds invariants;

B. resolve current project config once for this preflight;

C. derive current target identities and collisions;

D. inspect every target's authorization readiness and current eligibility;

E. return either:
   - internal ready state used only by this invocation to begin;
   - REFUSED_AT_PREFLIGHT result.

The internal ready state is not public, not serializable, and not accepted by
any later invocation.

==================================================
6. PREFLIGHT CONFIG SEMANTICS
==================================================

Preflight uses the frozen config loader.

CONFIG SUCCESS

Use the returned ResolvedProjectConfig only for this diagnostic preflight.

CONFIG SUCCESSFUL ABSENT

Restrictions are absent for this preflight.

Do not over-refuse.

CONFIG FAILURE

Return REFUSED_AT_PREFLIGHT.

Every target is represented as PREFLIGHT_FAILED with:

CONFIG_RELOAD_FAILED
or exact current closed reason.

Do not:

- fall back to prepared config;
- fall back to authorization-time config;
- synthesize default/ABSENT;
- inspect target paths/content after the failure;
- consume authorization.

The preflight config is never passed to 3B/3C execution.

==================================================
7. TARGET IDENTITY AND COLLISION
==================================================

Derive an internal PlanTargetIdentity.

MODIFICATION TARGET

Use the exact canonical target identity bound by the PreparedMutation's
RepositoryEntry.

CREATION TARGET

Use:

- exact canonical parent identity;
- exact authorized leaf name.

Reject every collision mechanically provable from current evidence:

- modification + modification same target;
- creation + creation same canonical parent and exact leaf;
- modification + creation same target;
- lexical/canonical parent aliases resolving to the same target;
- repeated exact target.

Comparison is canonical/authority-based, never a raw lexical path-only
comparison.

Every target involved in a collision is marked PREFLIGHT_FAILED with:

TARGET_COLLISION

or exact closed equivalent.

HONEST LIMIT

A non-existing leaf has no inode/physical target identity.

Do not claim to eliminate platform case-folding or Unicode-normalization aliases
that the current path semantics cannot prove.

The frozen Phase 3C no-overwrite publication remains the final protection.

==================================================
8. NON-CONSUMING AUTHORIZATION READINESS
==================================================

Use a private read-only query on the existing authorization registry.

For every target establish:

- authorization exists in the legitimate registry;
- authorization is unconsumed;
- authorization is bound to the exact prepared object;
- prepared kind and authorization action agree.

This query:

- issues nothing;
- consumes nothing;
- changes no registry state;
- is not exported publicly;
- creates no plan-level authority.

Wrong pairing is a runtime trust failure unless actual source already provides
an action-specific generic EditAuthorization type.

Do not change 3A solely to manufacture a compile-time generic guarantee.

==================================================
9. EVERY TARGET IS SAFELY INSPECTED
==================================================

For a valid bounded plan, preflight inspects every target and reports every
target that safely proves a failure.

Do not stop after the first failing target.

Within one target, stop deeper inspection when trust forbids further
observation.

Examples:

- lexical denial:
  do not canonicalize/read merely to collect additional reasons;

- ConfigFailure:
  do not inspect any target under unknown restrictions;

- outside-workspace/canonical failure:
  do not perform content observation.

Every PREFLIGHT_FAILED target carries a non-empty ordered closed reason list,
or one precise primary reason when deeper inspection is forbidden.

A target that passes individually while another target fails is:

PREFLIGHT_READY_BUT_PLAN_REFUSED

This means only:

"this target did not expose a preflight failure in this point-in-time pass."

It does not mean:

- unchanged;
- currently authorized forever;
- safe to execute later;
- current repository knowledge.

==================================================
10. AUTHORITATIVE PREFLIGHT CHECKS
==================================================

Use the same authoritative read-only mechanisms as 3B/3C.

Where applicable check:

- fresh preflight config;
- lexical denial;
- workspace/canonical containment;
- physical denial;
- current ActionClass restriction;
- current full fingerprint/length for modification;
- current target absence for creation;
- current target/parent kind;
- hard-link/symlink/platform restrictions;
- optional supplied Git UNMERGED state;
- authorization readiness.

Do not duplicate action mapping or denial logic.

Do not create a shadow editing policy engine.

If shared helper extraction is needed:

- preserve public APIs;
- preserve single-target behavior;
- use one shared source of truth;
- rerun the relevant inherited regression and exact load-bearing falsification.

==================================================
11. PREFLIGHT REFUSAL RESULT
==================================================

If any target fails:

PLAN STATUS:
REFUSED_AT_PREFLIGHT

No target execution begins.

No authorization is consumed.

No EditRecord is produced.

No KnowledgeInvalidation is produced.

Every target has exactly one preflight outcome:

- PREFLIGHT_FAILED
- PREFLIGHT_READY_BUT_PLAN_REFUSED

No filesystem write occurs.

No temp candidate exists.

==================================================
12. SEQUENTIAL TARGET EXECUTION
==================================================

If every target passes preflight:

execute targets strictly one at a time in the exact immutable plan input order.

No:

- lexical re-sort;
- parallel target mutation;
- worker pool;
- speculative staging;
- topological sort;
- automatic retry.

Each target is executed by calling the complete existing operation:

PreparedMutation
→ replaceExistingFile

PreparedCreation
→ createFile

The coordinator does not inline, partially reproduce, or skip their mutation
sequence.

==================================================
13. PER-TARGET CURRENTNESS AND CONFIG
==================================================

At each target's turn, the existing 3B/3C operation repeats its complete
mutation-time sequence.

This includes its own:

- one-shot authorization consumption;
- bounds;
- platform support;
- mutation-time config re-resolution;
- lexical denial;
- canonical/workspace checks;
- physical denial;
- action restriction;
- content/absence currentness;
- target/parent identity;
- publication/replacement;
- after-state verification;
- provenance;
- invalidation.

The coordinator passes NO config between targets.

The coordinator holds NO ResolvedProjectConfig during execution.

The coordinator does not import a config cache.

The preflight config is discarded before target execution.

A plan can pass preflight and later refuse safely.

==================================================
14. MID-PLAN CONFIGURATION
==================================================

Per-target reload is proven through real plans.

RESTRICTIVE CHANGE

Target 0 validly modifies PATHCODE.md to add a deny-path covering Target 1.

Expected:

- Target 0 APPLIED;
- Target 1 REFUSED_PRECOMMIT / TARGET_DENIED;
- later targets NOT_ATTEMPTED;
- plan PARTIALLY_COMMITTED.

MALFORMED CHANGE

Target 0 validly modifies PATHCODE.md to malformed content.

Expected:

- Target 0 APPLIED;
- Target 1 REFUSED_PRECOMMIT / CONFIG_RELOAD_FAILED;
- later targets NOT_ATTEMPTED;
- plan PARTIALLY_COMMITTED.

SUCCESSFUL ABSENT

In a workspace with successful ABSENT config, an otherwise valid mixed plan
can reach ALL_APPLIED.

This proves the coordinator does not invent a plan-level config requirement or
over-refuse successful ABSENT.

DO NOT require a plan to remove a restriction that preflight already sees.

Such a plan would correctly be refused before Target 0 executes.

No impossible "permissive mid-plan removal" test is part of this contract.

==================================================
15. STOP ON FIRST NON-SUCCESS
==================================================

Continue only while every attempted target returns verified target-level
SUCCESS.

Map the exact nested 3B/3C result as follows:

target SUCCESS
→ APPLIED

target REFUSED_PRECOMMIT
→ REFUSED_PRECOMMIT
→ stop

target FAILED_PRECOMMIT
→ FAILED_PRECOMMIT
→ stop

target COMMITTED_FAILURE
→ COMMITTED_FAILURE
→ stop
→ counts as a committed mutation

All later targets:

NOT_ATTEMPTED

No later authorization is consumed.

==================================================
16. PRESERVE EXACT NESTED TARGET RESULTS
==================================================

The coordinator must not rebuild target evidence.

For every attempted target, retain the exact nested result returned by the
existing 3B/3C operation.

Do not mint or reconstruct:

- EditRecord;
- KnowledgeInvalidation;
- CreationAfterStateEvidence;
- PATH_CODE_MODIFIED;
- commitPointReached;
- config freshness;
- failure evidence.

Plan-level classification is derived mechanically from the exact target
result.

Where reference identity is meaningful and current types permit it, preserve
the exact nested result / evidence references.

==================================================
17. PLAN TARGET OUTCOMES — EXACT VOCABULARY
==================================================

PREFLIGHT-REFUSED PLAN

- PREFLIGHT_FAILED
- PREFLIGHT_READY_BUT_PLAN_REFUSED

EXECUTING PLAN

- APPLIED
- REFUSED_PRECOMMIT
- FAILED_PRECOMMIT
- COMMITTED_FAILURE
- NOT_ATTEMPTED

No synonym.

No "SKIPPED".

No "UNCHANGED".

No generic success/failure boolean.

==================================================
18. PLAN-LEVEL STATUSES — EXACT VOCABULARY
==================================================

Exactly one:

ALL_APPLIED

Every target returned APPLIED.

REFUSED_AT_PREFLIGHT

At least one target failed preflight.
No target execution began.

STOPPED_BEFORE_ANY_COMMIT

Execution began, but no target reached a commit point.

PARTIALLY_COMMITTED

At least one target reached a commit point and the plan did not end with every
target APPLIED.

A COMMITTED_FAILURE on the first target therefore yields:

PARTIALLY_COMMITTED

not:

STOPPED_BEFORE_ANY_COMMIT.

Plan status is commit-point based, not success-count based.

==================================================
19. NOT_ATTEMPTED HONESTY
==================================================

NOT_ATTEMPTED means only:

"Path Code did not attempt this target in this plan run."

The variant carries:

- original input index;
- planned execution index;
- safe target display identity;
- stopping target index/identity;
- stop reason category.

It carries NO:

- EditRecord;
- fingerprint;
- content hash;
- verification state;
- "unchanged" flag;
- currentness claim;
- KnowledgeInvalidation.

Its authorization remains unconsumed.

==================================================
20. PLAN RESULT — OPAQUE AND IMMUTABLE
==================================================

MultiFilePlanResult is opaque, immutable, and constructible only by the
coordinator.

No public constructor.

It records:

- exact immutable plan input order;
- exact execution order;
- target original/execution indices;
- target kind;
- safe display identity;
- preflight result where applicable;
- exact nested target result for every attempted target;
- first stopping target;
- ordered exact per-target EditRecords;
- ordered exact per-target KnowledgeInvalidations;
- creation inventory-staleness evidence;
- plan-level status.

No plan-level PATH_CODE_MODIFIED is minted.

Provenance remains target-level.

==================================================
21. KNOWLEDGE AFTER A PLAN
==================================================

For every APPLIED or COMMITTED_FAILURE target:

preserve its exact single-target invalidation/uncertainty evidence.

Aggregate only as an immutable ordered collection.

Do not synthesize a stronger repository claim.

CreationAfterStateEvidence remains:

mutation-verification evidence

NOT:

- RepositoryEntry;
- ContentObservation;
- inventory membership;
- map/search/snapshot knowledge.

No:

- re-inventory;
- extra re-read beyond the target operation;
- metadata/map/search rebuild;
- snapshot rebuild;
- Git recollection.

Mutation invalidates knowledge.

It does not repair knowledge.

==================================================
22. PLAN REPLAY
==================================================

After a partial or fully executed plan:

attempted authorizations are spent according to their target operation.

Re-executing the same MultiFilePlan triggers fresh preflight.

Already-consumed targets cause REFUSED_AT_PREFLIGHT before any new mutation.

Previously NOT_ATTEMPTED authorizations remain unconsumed but are not
automatically resumed.

No resume-from-index behavior.

A new current coordinated attempt requires a new valid plan.

==================================================
23. NO ROLLBACK
==================================================

The coordinator retains no original target bytes.

It creates no backups.

It performs no inverse mutations.

It never deletes a created target or restores a replaced target to compensate
for a later failure.

Partial application is evidence, not a repair request.

The result exposes no:

- rollback;
- undo;
- restore;
- retry;
- resume member.

==================================================
24. NO HIDDEN PERSISTENCE
==================================================

Phase 3D creates no:

- transaction journal;
- plan state file;
- progress file;
- lock file;
- resume token;
- plan cache;
- backup set;
- undo database;
- .path-code directory;
- durable authorization state.

The only persistent project changes are those performed by the existing
authorized 3B/3C target operations.

==================================================
25. DEPENDENCY AND WRITE BOUNDARY
==================================================

Coordination modules may import trusted public/internal read-only contracts and
the existing 3B/3C operations required by the frozen Master.

They may use:

- loadProjectConfig for the point-in-time preflight config;
- WorkspaceBoundary public authority;
- RepositoryEntry / reader public bounded observation;
- existing editing policy/readiness helpers;
- optional already-earned Git state types.

They MUST NOT import:

- node:fs
- node:fs/promises
- node:child_process
- the low-level atomic write adapter directly
- Git runner/executable capability
- provider/model/network/browser/database/MCP/PTY
- src/selfobs runtime
- brand constructors
- mutable registries

Exactly one production module continues to own project filesystem write APIs:

the same existing module frozen at Phase 3C.

Phase 3D adds no writer.

Runtime dependencies remain 0.

Install nothing.

==================================================
26. INTERNAL TEST BINDINGS — IF REQUIRED
==================================================

Use existing 3B/3C fault seams first.

Only if required for plan-level integration evidence, add one private,
internal coordinator binding with exactly:

- replaceExistingFile
- createFile

Production binds them to the real frozen operations.

Tests may:

- observe call order;
- mutate controlled fixtures before delegation;
- delegate through existing target-operation fault seams.

Tests may not fabricate target success/committed evidence and count that as
integration proof.

The binding is not exported from:

- package root;
- editing public barrel;
- declarations intended for external consumers.

No generic execution framework.

==================================================
27. TYPE-LEVEL PROOFS
==================================================

Prove:

A. plain object cannot satisfy MultiFilePlan;

B. plain object cannot satisfy MultiFilePlanResult;

C. NOT_ATTEMPTED exposes no EditRecord, fingerprint, verification, or unchanged
   field;

D. CreationAfterStateEvidence is not assignable to ContentObservation;

E. CreationAfterStateEvidence is not assignable to RepositoryEntry;

F. no plan-level authorization type/factory exists on the public surface;

G. result exposes no rollback/undo/restore field;

H. plan build failure cannot be used where MultiFilePlan is required.

Do NOT require a compile-time modification-authorization vs creation-
authorization generic distinction if the frozen EditAuthorization type does
not encode one.

Exact pairing is proven through the private registry and runtime adversarial
tests.

For A, C, D, and H:

- use the current @ts-expect-error pattern;
- remove only the directive;
- typecheck must fail for the intended type/property;
- capture the exact compiler diagnostic;
- restore exact source;
- typecheck passes.

TS2578 proves load-bearing directives, not intended error identity.

==================================================
28. REQUIRED TEST MATRIX
==================================================

Use real temporary workspaces and earned artifacts.

Realpath every mkdtemp root before deriving expected paths.

Earn:

- WorkspaceBoundary;
- ResolvedProjectConfig;
- RepositoryInventory / RepositoryEntry;
- bounded content observations;
- PreparedMutation / PreparedCreation;
- EditAuthorization;

through the real pipeline.

No fabricated trusted inputs.

--------------------------------------------------
A. PLAN CONSTRUCTION
--------------------------------------------------

1. two modifications → plan created

2. two creations → plan created

3. one modification + one creation → plan created

4. sixteen targets → plan created

5. seventeen targets → PLAN_TARGET_COUNT_OUT_OF_BOUNDS

6. one target → PLAN_TARGET_COUNT_OUT_OF_BOUNDS

7. zero targets → PLAN_TARGET_COUNT_OUT_OF_BOUNDS

8. total proposed bytes over ceiling → build failure before filesystem access

9. one target over per-target ceiling → build failure naming target index

10. caller narrowing honored

11. caller widening rejected

12. two prepared targets from different WorkspaceBoundary authorities →
    PLAN_WORKSPACE_MISMATCH

13. duplicate prepared object → DUPLICATE_PREPARED_CHANGE

14. duplicate authorization object → DUPLICATE_AUTHORIZATION

15. caller mutates/reorders original input array after plan construction →
    plan order/entries unchanged

--------------------------------------------------
B. PREFLIGHT — COLLISIONS
--------------------------------------------------

16. modify X + modify X → both targets PREFLIGHT_FAILED / TARGET_COLLISION

17. create X + create X under same canonical parent/exact leaf → both fail

18. modify X + create X after creation was prepared absent and X later became
    the modification target → both fail

19. canonical-parent / symlink-alias collision → both fail

20. distinct lexically similar targets → no false collision

--------------------------------------------------
C. PREFLIGHT — READINESS AND ALL FAILURES
--------------------------------------------------

21. consumed authorization → target fails readiness

22. authorization bound to different prepared object → target fails

23. disable-action EDIT with three modifications + two creations:
    - all three modifications PREFLIGHT_FAILED / ACTION_DISABLED;
    - both creations PREFLIGHT_READY_BUT_PLAN_REFUSED;
    - no authorization consumed.

24. disable-action CREATE_FILE inverse:
    - every creation target fails;
    - modifications are READY_BUT_PLAN_REFUSED.

25. denied target:
    - target fails TARGET_DENIED;
    - reason distinct from ACTION_DISABLED;
    - no deeper denied-path observation.

26. malformed config at preflight:
    - every target PREFLIGHT_FAILED / CONFIG_RELOAD_FAILED;
    - no target content/path inspection after config failure;
    - no authorization consumed.

27. mixed plan with multiple independent safe failures:
    - every failing target is reported;
    - not first-failure-only.

28. preflight refusal:
    - no write;
    - no temp artifact;
    - all authorizations remain usable in subsequent single-target operations.

--------------------------------------------------
D. SUCCESSFUL EXECUTION
--------------------------------------------------

29. two modifications → ALL_APPLIED

30. two creations → ALL_APPLIED

31. mixed modification + creation → ALL_APPLIED

32. deliberately non-lexical order [b, a] executes b then a exactly

33. every APPLIED target retains its exact nested operation result

34. every APPLIED target carries exact earned EditRecord/invalidation

35. every creation target carries CreationAfterStateEvidence unwrapped

36. ordered invalidation collection equals execution order

37. no plan-level provenance minted

38. successful ABSENT config mixed plan → ALL_APPLIED

--------------------------------------------------
E. STOP ON FIRST NON-SUCCESS
--------------------------------------------------

39. [t0, t1, t2], t0 APPLIED, t1 REFUSED_PRECOMMIT:
    - t2 NOT_ATTEMPTED;
    - plan PARTIALLY_COMMITTED;
    - t2 authorization unconsumed.

40. first target REFUSED_PRECOMMIT:
    - later targets NOT_ATTEMPTED;
    - plan STOPPED_BEFORE_ANY_COMMIT.

41. t0 APPLIED, t1 FAILED_PRECOMMIT through existing target fault seam:
    - t2 NOT_ATTEMPTED;
    - plan PARTIALLY_COMMITTED;
    - t1 exact failure evidence retained.

42. first target COMMITTED_FAILURE:
    - plan PARTIALLY_COMMITTED;
    - later target NOT_ATTEMPTED;
    - committed target EditRecord/invalidation retained;
    - no rollback.

43. t0 APPLIED, t1 COMMITTED_FAILURE:
    - plan stops;
    - later targets NOT_ATTEMPTED;
    - exact nested evidence retained.

44. NOT_ATTEMPTED carries no currentness/fingerprint/unchanged claim

45. NOT_ATTEMPTED authorization remains usable in a new current plan

46. replaying a partially executed old plan:
    - preflight sees consumed authorization;
    - refuses before any additional mutation;
    - no automatic resume.

--------------------------------------------------
F. PREFLIGHT IS NOT A LEASE
--------------------------------------------------

47. target passes plan preflight, then controlled external mutation occurs
    before its turn; its real 3B operation detects staleness and refuses/fails
    safely.

48. creation target passes preflight, then external target appears before its
    turn/publication; real 3C no-overwrite mechanism refuses and preserves the
    external target.

--------------------------------------------------
G. PER-TARGET CONFIG RELOAD
--------------------------------------------------

49. target 0 changes PATHCODE.md to add deny-path for target 1:
    - t0 APPLIED;
    - t1 REFUSED_PRECOMMIT / TARGET_DENIED;
    - plan PARTIALLY_COMMITTED.

50. target 0 changes PATHCODE.md to malformed content:
    - t0 APPLIED;
    - t1 REFUSED_PRECOMMIT / CONFIG_RELOAD_FAILED;
    - plan PARTIALLY_COMMITTED.

51. input order is proven with the config-change mechanism:
    only a target positioned after the PATHCODE.md mutation observes it.

52. coordinator source/architecture:
    - stores no ResolvedProjectConfig for execution;
    - imports no execution config cache;
    - passes no config argument to replaceExistingFile/createFile.

Do NOT require a plan that removes a restriction already visible at preflight;
that plan correctly cannot begin.

--------------------------------------------------
H. KNOWLEDGE / RESULT HONESTY
--------------------------------------------------

53. COMMITTED_FAILURE contributes invalidation and counts as committed

54. REFUSED_PRECOMMIT / FAILED_PRECOMMIT without commit point do not contribute
    mutation invalidation

55. NOT_ATTEMPTED contributes no invalidation

56. mixed result keeps CreationAfterStateEvidence structurally distinct from
    RepositoryEntry and ContentObservation

57. snapshot/search/inventory modules do not import/accept plan-authored
    creation evidence as repository knowledge

--------------------------------------------------
I. NO ROLLBACK / PERSISTENCE / SIDE EFFECTS
--------------------------------------------------

58. partially committed targets retain their committed bytes

59. no rollback/restore call occurs

60. coordinator retains no original-content buffer

61. no journal, lock, progress, resume, backup, or .path-code state appears in
    controlled roots

62. importing plan modules performs no filesystem/config/Git activity

--------------------------------------------------
J. ARCHITECTURE / PUBLIC SURFACE
--------------------------------------------------

63. coordination modules import no node:fs / node:fs-promises

64. coordination modules import no child_process / Git runner / provider /
    network / selfobs runtime

65. exactly one production module imports project-write APIs, unchanged from
    Phase 3C

66. plan constructors/brands/internal preflight/test bindings are absent from
    public barrels and unsafe dist surfaces

67. no public preflight-preview/cached-permission API exists

68. no plan-level authorization type/factory exists

69. all committed Phase 3A/3B/3C test suites remain green

70. dist production child_process consumer remains the private Git runner only

==================================================
29. LIVE FALSIFICATIONS — REQUIRED
==================================================

Every listed falsification must be performed against the completed
implementation unless the contract explicitly designates a mechanical
architecture proof instead.

For every live corruption:

1. record exact source state;
2. apply only the named corruption;
3. run the named focused test;
4. capture exact failure;
5. confirm intended reason;
6. restore exact source;
7. confirm temporary diff removed;
8. rerun focused test to PASS.

D-F1 — PREFLIGHT CONSUMES AUTHORIZATION

Corruption:
make the preflight readiness query consume authorization.

Expected:
Test 28 fails because authorizations are unusable after refused preflight,
and/or Test 29–31 fails because execution finds them spent.

D-F2 — CONTINUE AFTER NON-SUCCESS

Corruption:
remove coordinator stop after REFUSED_PRECOMMIT / FAILED_PRECOMMIT.

Expected:
Test 39 or 41 fails because a later target executes instead of NOT_ATTEMPTED.

D-F3 — COMMITTED_FAILURE MISCLASSIFIED

Corruption:
treat COMMITTED_FAILURE as no commit and/or allow continuation.

Expected:
Test 42/43 fails because plan status is not PARTIALLY_COMMITTED or later target
executes.

D-F4 — LEXICAL-ONLY COLLISION

Corruption:
compare raw lexical strings instead of canonical target identity.

Expected:
Test 19 fails because the alias collision is missed.

D-F5 — FIRST-FAILURE-ONLY PREFLIGHT REPORT

Corruption:
return only the first failing target.

Expected:
Test 23 or 27 fails because other failing targets disappear.

D-F6 — HIDDEN SORT

Corruption:
sort plan entries lexically before storing/executing.

Expected:
Test 15, 32, or 51 fails because explicit input order changes.

D-F7 — NOT_ATTEMPTED CLAIM

Corruption:
add a verified-unchanged/fingerprint field to NOT_ATTEMPTED.

Expected:
the type-level C directive becomes unused or the focused type contract fails
for the intended property boundary.

D-F8 — WRITE BOUNDARY

Corruption:
add a filesystem write import/reference to a coordination production module.

Expected:
Test 65 / existing boundary test fails naming the unauthorized module.

D-F9 — CROSS-WORKSPACE BYPASS

Corruption:
skip exact WorkspaceBoundary identity validation.

Expected:
Test 12 fails because a cross-workspace plan is admitted.

D-F10 — SINGLE-TARGET PLAN ACCEPTED

Corruption:
allow a one-entry sequence through createMultiFilePlan.

Expected:
Test 6 fails.

D-F11 — CALLER ARRAY ALIAS

Corruption:
store the caller's input array directly instead of copying it.

Expected:
Test 15 fails after caller mutation/reordering changes the plan.

CONFIG-CACHE ARCHITECTURE PROOF — NOT A LIVE FALSIFICATION

Do not invent an impossible D-F corruption that modifies the unchanged 3B/3C
operations merely to simulate caching.

Instead prove:

- coordinator holds no ResolvedProjectConfig during execution;
- coordinator passes no config into target operations;
- tests 49–51 demonstrate target-local reload;
- source/dist scans detect any future plan-level config cache.

This is the honest evidence form.

==================================================
30. SE-020 — MULTI-FILE PARTIAL HONESTY
==================================================

Use the exact frozen title:

SE-020 — MULTI-FILE PARTIAL HONESTY

3D establishes evidence only if:

SE-020.1
every valid plan target is preflighted before first mutation

SE-020.2
every safely established preflight failure is reported per target

SE-020.3
provable canonical/cross-kind collisions are refused

SE-020.4
explicit input order is immutable, deterministic, and recorded

SE-020.5
every attempted target runs its full unchanged 3B/3C sequence

SE-020.6
configuration is re-resolved by every target operation

SE-020.7
first non-success stops later targets

SE-020.8
NOT_ATTEMPTED is structurally distinct from every current/verified state

SE-020.9
no rollback is attempted or implied

SE-020.10
plan result states exactly what committed, failed, refused, and was not
attempted

SE-020.11
no plan-level authority exists

SE-020.12
no persistence, second write module, or Git execution exists

Do not claim Phase 3-wide closure.

SE-001 through SE-019 are preserved by:

- all committed Phase 3A/3B/3C suites passing;
- cross-layer plan integration;
- targeted rerun only where 3D changes/refactors a shared mechanism.

Do not rerun every historical live source corruption merely for ceremony.

==================================================
31. LOCAL PHASE 3D INVARIANTS
==================================================

P3D-001 — A PLAN IS NOT AUTHORITY

P3D-002 — PREFLIGHT CONSUMES NOTHING

P3D-003 — ALL SAFE PREFLIGHT FAILURES ARE REPORTED

P3D-004 — ONE EXACT WORKSPACE AUTHORITY

P3D-005 — PROVABLE TARGET COLLISIONS ARE REFUSED

P3D-006 — THE IMMUTABLE INPUT SEQUENCE IS THE ORDER

P3D-007 — PREFLIGHT IS NOT A LEASE

P3D-008 — CONFIG IS RE-RESOLVED PER TARGET OPERATION

P3D-009 — FIRST NON-SUCCESS STOPS EXECUTION

P3D-010 — NOT_ATTEMPTED IS NOT UNCHANGED

P3D-011 — PLAN STATUS IS COMMIT-POINT BASED

P3D-012 — NO ROLLBACK

P3D-013 — AUTHORED CREATION EVIDENCE IS NOT REPOSITORY KNOWLEDGE

P3D-014 — NO HIDDEN PERSISTENCE

P3D-015 — THE WRITE BOUNDARY DOES NOT WIDEN

==================================================
32. GAP LEDGER
==================================================

Do not create a gap merely to restate:

- preflight is not a lease;
- per-file atomicity only;
- no rollback;
- not-attempted has no current knowledge.

These are frozen design properties and belong in NOT VALIDATED.

Preserve every inherited open/closed gap state.

If implementation discovers a genuinely new limitation:

- add an UNREVIEWED machine-readable record;
- set proposedClass only;
- leave reviewClassification absent;
- lifecycle OPEN;
- do not self-close it.

If a finding contradicts the frozen Master or preflight:

STOP before freeze.

==================================================
33. PASS CONTRACT ARTIFACT
==================================================

Before implementation, place the exact final executed contract at:

docs/passes/PHASE_3D_CONTRACT.md

Do not edit it after implementation results are known.

If a material recovery supplement changes the governing instruction:

store it separately beside the contract.

Do not rewrite the original.

Commit the contract in Implementation Commit A.

==================================================
34. PHASE 3D REPOSITORY REPORT
==================================================

Create:

docs/reports/PHASE_3D_REPORT.md

inside Implementation Commit A.

Record:

- resolved full baseline SHA;
- governing frozen SHAs;
- Constitution §5 compliance;
- Multitask Tasks A–D;
- exact public API/vocabulary;
- plan construction;
- preflight config decision;
- authoritative helper reuse/extraction;
- collision semantics and honest alias limit;
- execution/order/stop behavior;
- exact plan-result vocabulary;
- config mid-plan evidence;
- knowledge/invalidation behavior;
- type evidence;
- tests;
- D-F1 through D-F11;
- config-cache mechanical proof;
- SE-020.1 through SE-020.12;
- P3D-001 through P3D-015;
- public/dist/write-boundary audit;
- gaps;
- actual test totals;
- NOT VALIDATED.

NON-CIRCULARITY

The report is inside Commit A.

It MUST NOT contain Commit A's future SHA.

State:

Phase 3D implementation SHA intentionally absent;
post-freeze Capability Ledger linkage will bind it.

==================================================
35. COMMIT A — IMPLEMENTATION FREEZE
==================================================

Only if implementation, tests, architecture checks, and all required live
falsifications pass.

Create exactly:

Implement Path Code Phase 3D multi-file coordination

Commit A contains only legitimate Phase 3D implementation evidence:

- src/editing coordination modules;
- tests/editing and architecture/type tests objectively required;
- docs/passes/PHASE_3D_CONTRACT.md;
- docs/reports/PHASE_3D_REPORT.md;
- UNREVIEWED gap data/render only if real findings require it.

NO multi-file-coordination Capability Ledger freeze record yet.

NO Phase 3 integration audit.

NO README completion claim yet.

After Commit A:

record full SHA.

Run:

npm run ledger:verify
npm run check

Verify working tree clean.

==================================================
36. COMMIT B — CAPABILITY LINKAGE
==================================================

After immutable Commit A exists:

add capability:

multi-file-coordination

Declaration evidence:

- frozen Phase 3 Safe Editing Master;
- frozen Phase 3D Multi-File Coordination Master.

Implementation evidence:

actual Phase 3D production modules at Commit A.

Freeze evidence:

sameCommit

implementationCommit:
<FULL COMMIT A SHA>

reportPath:
docs/reports/PHASE_3D_REPORT.md

The report and implementation exist together in Commit A.

Do not invent Commit B's own future SHA.

Do not use TWO_COMMIT_FREEZE unless the actual current ledger schema proves
sameCommit cannot represent this truthful chain.

Expected after linkage:

multi-file-coordination
→ PASS_FROZEN

edit-contracts
→ PASS_FROZEN

existing-file-replacement
→ PASS_FROZEN

safe-file-creation
→ PASS_FROZEN

safe-editing
→ DECLARED / IN PROGRESS

==================================================
37. MIRRORED CAPABILITY FALSIFICATION
==================================================

Before Commit B:

with multi-file-coordination freezeEvidence present and focused derivation test
expecting PASS_FROZEN:

temporarily remove only that freezeEvidence.

Expected focused failure:

expected PASS_FROZEN
received IMPLEMENTED

Restore exact freezeEvidence.

Verify temporary diff removed.

Focused derivation test PASS.

npm run ledger:verify PASS.

This proves status depends on admissible freeze evidence rather than a rewritten
test expectation.

==================================================
38. README AFTER FINAL LINKAGE
==================================================

Update only in Commit B after successful linkage.

State:

Phase 3A — Edit Contracts / Preparation / Authorization:
PASS_FROZEN

Phase 3B — Existing-File Atomic Replacement:
PASS_FROZEN

Phase 3C — Safe File Creation:
PASS_FROZEN

Phase 3D — Multi-File Coordination:
PASS_FROZEN

Capabilities:

- existing-file-replacement:
  PASS_FROZEN

- safe-file-creation:
  PASS_FROZEN

- multi-file-coordination:
  PASS_FROZEN

Safe Editing Engine:
DECLARED / IN PROGRESS

Path Code can now coordinate two to sixteen already-authorized replacement and
creation operations under one plan with:

- per-target authority;
- read-only all-target preflight;
- exact input order;
- per-target currentness/config rechecks;
- per-file atomicity;
- stop-on-first-non-success;
- honest partial-commit reporting.

Path Code still cannot:

- delete files;
- create directories;
- provide plan-level atomicity;
- roll back;
- resume a persisted plan.

Next:

Independent Phase 3 Integration Audit

Do not claim Phase 3 complete.

==================================================
39. VALIDATION — BEFORE AND AFTER COMMITS
==================================================

Before Commit A:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

After Commit A:

same.

After Commit B:

same.

At FINAL HEAD also run:

npm run cli:smoke

Verify:

- actual baseline total;
- Commit A delta;
- Commit B delta;
- actual final total;
- all 3A/3B/3C tests green;
- D-F1 through D-F11 observed/restored;
- config-cache proof complete;
- write boundary exactly one module;
- runtime dependencies 0;
- working tree clean;
- Phase 3 integration audit absent.

==================================================
40. ARCHITECTURE AUDIT
==================================================

Before PASS answer explicitly:

1. Is the full baseline SHA resolved and verified?

2. Is this exact contract committed under docs/passes/?

3. Can a plain object construct MultiFilePlan?
   MUST BE NO.

4. Can a plain object construct MultiFilePlanResult?
   MUST BE NO.

5. Does plan construction copy the caller sequence?

6. Can caller mutation alter plan order?
   MUST BE NO.

7. Is plan count exactly 2..16?

8. Are aggregate/per-target bounds enforced before filesystem observation?

9. Does every target share exact WorkspaceBoundary authority?

10. Does preflight consume authorization?
    MUST BE NO.

11. Does preflight perform any write?
    MUST BE NO.

12. Is preflight config resolved once and discarded before execution?

13. Does ConfigFailure refuse all targets without deeper inspection?

14. Does successful ABSENT avoid over-refusal?

15. Are all safely established failing targets reported?

16. Does a ready target in a refused plan avoid a currentness claim?

17. Are collisions canonical/authority-based rather than lexical-only?

18. Is the non-existing-leaf alias limitation stated honestly?

19. Is authorization readiness private and non-consuming?

20. Is exact prepared/authorization pairing enforced by registry?

21. Does any plan-level authorization exist?
    MUST BE NO.

22. Does any public reusable preflight permission exist?
    MUST BE NO.

23. Is exact input order preserved with no hidden sort?

24. Are target writes strictly sequential?

25. Does every attempted target call the complete existing 3B/3C operation?

26. Does coordinator pass config between targets?
    MUST BE NO.

27. Is config re-resolved by each target operation?

28. Does first non-success stop execution?

29. Does COMMITTED_FAILURE stop execution?

30. Does COMMITTED_FAILURE count as committed?

31. Do later authorizations remain unconsumed?

32. Does NOT_ATTEMPTED carry any fingerprint/currentness/unchanged field?
    MUST BE NO.

33. Are exact nested target results preserved?

34. Does coordinator mint EditRecord/invalidation/provenance?
    MUST BE NO.

35. Is plan status commit-point based?

36. Does plan replay automatically resume?
    MUST BE NO.

37. Does coordinator retain original bytes?
    MUST BE NO.

38. Is rollback/restoration attempted?
    MUST BE NO.

39. Is any plan state persisted?
    MUST BE NO.

40. Is CreationAfterStateEvidence kept distinct from repository knowledge?

41. Is any re-inventory/rebuild performed?
    MUST BE NO.

42. Do coordination modules import fs or child_process?
    MUST BE NO.

43. Is the write boundary still exactly one existing module?

44. Is any Git command executed?
    MUST BE NO.

45. Are public unsafe constructors/test bindings absent from dist?

46. Did every type falsification fail for intended reason?

47. Did D-F1 through D-F11 fail for intended reason and restore exactly?

48. Is config caching proven absent mechanically?

49. Do all committed 3A/3B/3C tests pass?

50. Does SE-020.1 through SE-020.12 have current evidence?

51. Do P3D-001 through P3D-015 hold?

52. Does multi-file-coordination derive PASS_FROZEN at final HEAD?

53. Does safe-editing remain DECLARED?

54. Does ledger:verify pass at final HEAD?

55. Are runtime dependencies zero?

56. Is Phase 3 integration audit absent?

57. Was any frozen Master/preflight contradiction found?

58. Could any implementation layer be removed while preserving 3D?
    If YES, simplify before freeze.

==================================================
41. NOT VALIDATED — MUST BE NON-EMPTY
==================================================

At minimum record applicable limitations:

- preflight is point-in-time and not a lease;

- a target may pass preflight and refuse/fail at its later execution turn;

- per-target atomicity only; the plan is not atomic;

- no rollback, undo, or retained-original machinery;

- NOT_ATTEMPTED targets have no currentness/unchanged evidence;

- non-existing creation leaves have no physical identity, so platform-specific
  case-folding/normalization alias collisions may remain unprovable at
  preflight;

- created targets have authored mutation evidence but no RepositoryEntry until
  re-observation;

- inventory/topology remains stale after committed creations;

- per-target residual races and crash/metadata/platform limitations from 3B/3C
  remain;

- no live Windows support beyond the existing frozen target-operation policy;

- no persistent plan/resume/retry;

- hostile TypeScript casts remain possible;

- Phase 3 integration audit and closure are outstanding;

- safe-editing is not PHASE_VERIFIED.

==================================================
42. GIT
==================================================

Preserve complete ancestry.

Verify at minimum:

Phase 3C-H1 COMPLETE:
dcb347fc613114be810b8caf371f0bea8b261285

Constitution:
a73a623cfed77d2c2dc0238d386d40d4d1595065

Phase 3D Master:
28efece61800d4b6dd92465d3499e648268365a3

Current freeze-report baseline:
resolved full SHA for 1e6dd0e

plus every checkpoint required by:

docs/PHASE_2_CLOSURE.md

Do NOT:

- amend;
- rebase;
- squash;
- push;
- create a remote;
- start Phase 3 integration audit.

==================================================
43. FINAL REPORT
==================================================

Return:

PATH CODE — PHASE 3D MULTITASK ENGINEERING REPORT

Result:
PASS / FAIL

Resolved baseline HEAD:

Implementation Commit A:

Capability Linkage Commit B:

Final HEAD:

Constitution §5 compliance:

- unsatisfiable requirement found:
- delegated design decision found:
- untestable MUST found:
- unperformable falsification found:
- frozen contradiction softened:
- missing honest limit:
- untraceable requirement:

Multitask reviews:

Task A:
- result:
- exact public names:
- authorization pairing model:
- opacity/public surface:

Task B:
- result:
- preflight config:
- authoritative helper reuse:
- any shared extraction:
- no-write proof:

Task C:
- result:
- exact target execution:
- fault induction:
- nested evidence preservation:
- stop/status model:

Task D:
- result:
- evidence matrix:
- contract artifact:
- capability protocol:
- gaps:

Files:

- added:
- modified:
- docs/passes/PHASE_3D_CONTRACT.md exact:
- contract source/copy verification:

Plan construction:

- count:
- aggregate bound:
- per-target bound:
- same workspace:
- duplicate prepared:
- duplicate authorization:
- caller array copied:
- plain object construction:
- serialization authority:

Preflight:

- config resolution count:
- ConfigFailure:
- successful ABSENT:
- consumes authorization:
- writes:
- all failing targets:
- ready-but-refused:
- collision identity:
- alias case:
- readiness query:
- deeper-inspection stop rules:

Execution:

- exact input order:
- sequential:
- unchanged 3B/3C operations:
- config passed between targets:
- mid-plan deny:
- mid-plan malformed config:
- successful ABSENT plan:
- staleness after preflight:
- stop rule:
- COMMITTED_FAILURE:
- later authorization consumption:
- replay/resume:

Result vocabulary:

- preflight target variants:
- execution target variants:
- plan statuses:
- exact nested result retained:
- NOT_ATTEMPTED fields:
- plan-level provenance:
- plan constructor public:

Knowledge:

- ordered invalidation:
- COMMITTED_FAILURE invalidation:
- creation evidence:
- RepositoryEntry conversion:
- ContentObservation conversion:
- rebuild/reinventory:

No rollback / persistence:

- originals retained:
- inverse mutation:
- backup:
- journal:
- lock:
- progress:
- resume:
- residue scan:

Type evidence:

- A:
- C:
- D:
- H:
- exact compiler diagnostics:
- restorations:

Live falsifications:

For D-F1 through D-F11:
- corruption:
- focused test:
- exact failure:
- intended reason:
- restoration:
- final pass:

Config-cache architecture proof:

- coordinator ResolvedProjectConfig field:
- config passed to target operations:
- source scan:
- tests 49–52:

SE-020:

- SE-020.1:
- SE-020.2:
- SE-020.3:
- SE-020.4:
- SE-020.5:
- SE-020.6:
- SE-020.7:
- SE-020.8:
- SE-020.9:
- SE-020.10:
- SE-020.11:
- SE-020.12:

Local invariants:

- P3D-001:
- P3D-002:
- P3D-003:
- P3D-004:
- P3D-005:
- P3D-006:
- P3D-007:
- P3D-008:
- P3D-009:
- P3D-010:
- P3D-011:
- P3D-012:
- P3D-013:
- P3D-014:
- P3D-015:

Inherited capability preservation:

- edit-contracts:
- existing-file-replacement:
- safe-file-creation:
- all 3A/3B/3C tests:

Capability Ledger:

- multi-file-coordination:
- declaration evidence:
- implementation evidence:
- freeze form:
- mirrored falsification:
- safe-editing:
- ledger:verify final HEAD:

Gap Ledger:

- inherited states preserved:
- new gaps:
- proposed classes only:
- blocking findings:

Validation:

- baseline runtime:
- Commit A delta:
- Commit B delta:
- final runtime:
- typecheck:
- tests:
- integration:
- adversarial:
- failure:
- recovery:
- build:
- cli smoke:
- npm run check:
- ledger:verify:
- runtime dependencies:

Architecture:

- production fs writers:
- coordination fs import:
- child_process:
- Git execution:
- network/model/provider:
- selfobs runtime import:
- public test hooks:
- public preflight permission:
- lower-layer reverse imports:

Git:

- complete ancestry:
- Commit A:
- Commit B:
- working tree:
- push:
  NO
- Phase 3 integration audit started:
  NO

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

If PASS:

Phase 3D:
PASS_FROZEN

multi-file-coordination:
PASS_FROZEN

edit-contracts:
PASS_FROZEN

existing-file-replacement:
PASS_FROZEN

safe-file-creation:
PASS_FROZEN

safe-editing:
DECLARED / IN PROGRESS

Next permitted operation:

Independent Phase 3 Integration Audit

DO NOT START THE PHASE 3 INTEGRATION AUDIT INSIDE THIS PASS.
