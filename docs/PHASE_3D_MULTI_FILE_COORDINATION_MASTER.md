# PATH CODE — PHASE 3D
# MULTI-FILE COORDINATION MASTER CONTRACT

**Status:** FROZEN  
**Implementation:** NOT STARTED  
**Purpose:** Coordinate bounded existing-file replacements and safe file creations under one honest, deterministic, non-transactional plan without weakening any Phase 3A–3C guarantee.

---

## Baseline

**Phase 3C-H1 reviewed COMPLETE:**  
`dcb347fc613114be810b8caf371f0bea8b261285`

**Runtime tests at baseline:** 541

**Expected capability states at baseline:**

- `edit-contracts` → `PASS_FROZEN`
- `existing-file-replacement` → `PASS_FROZEN`
- `safe-file-creation` → `PASS_FROZEN`
- `safe-editing` → `DECLARED / IN PROGRESS`

**Phase 3D implementation:** absent

---

## Governing sources

Immutable checkpoints bound at freeze:

| Document | Full SHA |
|---|---|
| `docs/PHASE_3_SAFE_EDITING_MASTER.md` | `58439d90cfb0b786137454d21bc88f994fcd0270` |
| `docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md` | `0b3bed86f8a05674a652359b958d728ae8086244` |
| `docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md` | `0b3bed86f8a05674a652359b958d728ae8086244` |
| `docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md` | `a73a623cfed77d2c2dc0238d386d40d4d1595065` |
| `docs/ENGINEERING_SELF_OBSERVATION.md` | `7c388e7851f0332e0a8bcf73b3481b56088e88f9` |
| `docs/GAP_LEDGER.md` | `2a573301f871ae506491ddbfa8f6407521b4b956` |
| `docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md` | `82d4ea8bdd131d2424dd73949f0ad85c77c67418` |
| `docs/reports/PHASE_3C_H1_REPORT.md` | `2a573301f871ae506491ddbfa8f6407521b4b956` |

Phase 3C-H1 COMPLETE baseline: `dcb347fc613114be810b8caf371f0bea8b261285`

If this Master conflicts with any frozen governing source, stop and report.

---

# 0. Governing balance

Phase 3D follows the Foundation Extensibility Constitution:

> **maximum velocity inside proven boundaries**

This Master does not introduce a transaction engine, dependency graph, rollback framework, persistence layer, or generalized orchestration platform.

It adds only the coordination needed for the current frozen Phase 3 roadmap:

```text
bounded per-target authorizations
→ read-only plan preflight
→ sequential per-target 3B/3C execution
→ stop on first non-success
→ honest result for every target
```

No speculative machinery.

---

# 1. What Phase 3D is

Phase 3D coordinates a bounded sequence of already-prepared, separately authorized single-target mutations inside one workspace.

Every target is exactly one of:

- `MODIFY_EXISTING_FILE` through the frozen Phase 3B mechanism;
- `CREATE_FILE` through the frozen Phase 3C mechanism.

Phase 3D introduces exactly:

1. a **plan input** containing per-target prepared objects and per-target `EditAuthorization`;
2. an internal **read-only preflight** over every target before the first write;
3. **sequential coordinated execution** in one explicit deterministic order;
4. an earned **multi-file plan result** that records every target honestly.

Phase 3D introduces no third mutation kind.

Phase 3D does not weaken any 3B or 3C target-level invariant.

---

# 2. Guiding principles

## 2.1 A plan is not authority

Each target requires its own exact `EditAuthorization`.

The plan creates no plan-level authorization and cannot substitute for, widen, combine, refresh, or outlive any per-target authorization.

## 2.2 Preflight is not a lease

Preflight earns only the right to begin the coordinated attempt.

Every target must still run its complete 3B or 3C mutation-time sequence when its turn arrives.

## 2.3 Per-target atomicity only

Each target retains its own 3B replacement or 3C creation commit point.

The plan as a whole is not atomic.

## 2.4 Honest partial application

If the plan stops after one or more targets reached their commit points, the result says exactly what committed, what failed, and what was never attempted.

## 2.5 No rollback claim

Phase 3D has not acquired:

- durable backups;
- retained originals for every target;
- a persistent transaction journal;
- separately authorized rollback mutations.

Therefore it does not offer rollback.

That is a current scope decision, not a declaration that rollback can never be deliberately architected later.

---

# 3. Plan input and authority model

## 3.1 Non-empty bounded sequence

A plan is a readonly sequence containing **2 through 16 targets**.

A one-target operation uses Phase 3B or 3C directly.

An empty plan is refused.

The sequence—not a `Set`, `Map`, filesystem enumeration, or object-property order—is the source of execution order.

## 3.2 Explicit order is part of the plan intent

Execution order is the exact immutable input sequence supplied to the plan operation.

The plan records:

- original input index;
- execution index;
- target display identity;
- target mutation kind.

No hidden lexical sort or locale-dependent reorder is performed.

**Rejected alternative:** automatic path sorting.

Path sorting is deterministic, but partial application makes order semantically consequential. A hidden heuristic must not replace the caller’s explicit plan sequence.

## 3.3 Same workspace only

Every target must belong to the same exact workspace authority.

The plan refuses before mutation if prepared targets do not share the same admitted physical workspace root / exact workspace identity required by current types.

No cross-workspace plan.

No cross-repository coordination.

## 3.4 Exact per-target pairing

Every plan entry binds:

- exact prepared object;
- exact `EditAuthorization`;
- mutation kind derived from the prepared object;
- exact target identity evidence.

The caller may not independently pair arbitrary:

- target;
- action;
- before-state;
- after bytes;
- authorization.

A modification authorization cannot authorize creation.

A creation authorization cannot authorize modification.

## 3.5 No serialization as authority

A serialized plan cannot recreate `EditAuthorization`, prepared-object identity, or one-shot authority.

Phase 3D introduces no resumable/persistent plan token.

---

# 4. FOUNDATION COMPATIBILITY PREFLIGHT

This section is required by the Foundation Extensibility Constitution V1.

Every row was source-confirmed before this freeze. See **Source-confirmed freeze results** below. No provisional wording remains.

| New 3D concept | Consumed foundation vocabulary / mechanism | Expected existing representation | Expected result | Required source confirmation |
|---|---|---|---|---|
| Mixed modification + creation restrictions | `ActionClass`, Phase 1 ActionClass Amendment 1, Phase 3 action mapping | distinct modification and creation classes enforced at authorization and mutation time | `MAPS_TO_EXISTING` | confirm actual enum/token, parser, 3A mapping, 3B/3C mutation checks |
| Non-consuming authorization readiness during preflight | 3A opaque `EditAuthorization` + one-shot registry | internal read-only readiness/identity inspection that grants no authority and consumes nothing; may be added locally if absent | `MAPS_TO_EXISTING` | confirm registry can support a private non-consuming query without public issuer/authority |
| Same-workspace plan identity | `WorkspaceBoundary`, prepared-object workspace binding | exact physical workspace identity shared by every target | `MAPS_TO_EXISTING` | confirm actual stored workspace/root identity and comparison mechanism |
| Provable duplicate/colliding target detection | `CanonicalPath`, `RepositoryEntry`, `PreparedCreation` parent+leaf | existing target canonical identity; creation target canonical parent identity + exact leaf | `MAPS_TO_EXISTING` | confirm cross-kind comparison and state the honest limit for non-existing platform-specific case aliases |
| Deterministic execution order | readonly input sequence | explicit array order preserved and recorded | `MAPS_TO_EXISTING` | confirm no unordered collection or implicit resort is required |
| Per-target revalidation and config reload | frozen 3B/3C mutation sequences | every target invokes complete single-target sequence at its own turn | `MAPS_TO_EXISTING` | confirm 3D can call existing operations without bypassing checks |
| Honest partial-commit outcomes | 3B/3C terminal outcomes and commit-point evidence | plan wrappers preserve exact nested outcomes; new plan statuses are local, not foundation changes | `MAPS_TO_EXISTING` | confirm committed failure is distinguishable from precommit failure and success |
| Authored-but-not-reobserved creation evidence | `CreationAfterStateEvidence`, `RepositoryEntry`, `ContentObservation` boundary | creation evidence remains mutation evidence and is never wrapped as repository knowledge | `MAPS_TO_EXISTING` | confirm no snapshot/search/inventory consumer accepts it as repository knowledge |
| Plan bounds | Phase 3A operation bounds | max 16 targets, max 8 MiB proposed bytes, per-target max 1 MiB | `MAPS_TO_EXISTING` | confirm actual constant names/values and non-widenable behavior |
| Ordered invalidation aggregation | per-target `KnowledgeInvalidation` | readonly collection of exact per-target invalidations; no synthesized repository-knowledge claim | `MAPS_TO_EXISTING` | confirm both success and committed failure supply honest invalidation evidence |

### Freeze rule

If any expected mapping fails:

- classify it `AMENDMENT_REQUIRED` or `BLOCKING_GAP`;
- do not freeze this Master;
- do not begin 3D implementation.

Do not silently rewrite a row to fit current code.


### Source-confirmed freeze results

Documentation-freeze Task B confirmed every row against repository HEAD at Phase 3C-H1 COMPLETE (`dcb347fc613114be810b8caf371f0bea8b261285`). No provisional wording remains.

| New 3D concept | Result | Actual source confirmation | Limitation |
|---|---|---|---|
| Mixed modification + creation restrictions | `MAPS_TO_EXISTING` | `ActionClass` tokens `EDIT` and `CREATE_FILE` (`src/domain/authority.ts`); parser membership (`src/config/parser.ts`); `DISABLE_ACTION_FOR_MODIFY_EXISTING_FILE` / `DISABLE_ACTION_FOR_CREATE_FILE` (`src/editing/policy.ts`); authorization and mutation-time checks | none |
| Non-consuming authorization readiness during preflight | `MAPS_TO_EXISTING` | `lookupAuthorizationEntry` reads registry without consume (`src/editing/internal/registry.ts`); consumption only via `consumeEditAuthorization` on real 3B/3C execution. Private local readiness peek may be added on this registry | none |
| Same-workspace plan identity | `MAPS_TO_EXISTING` | Every `PreparedChange` stores `workspace: WorkspaceBoundary` (`src/editing/types.ts`); plan compares exact object identity / shared binding | none |
| Provable duplicate/colliding target detection | `MAPS_TO_EXISTING` | Replacement: `RepositoryEntry.canonicalPath`. Creation: parent `canonicalPath` + exact `leafName` / relative path; absence + `linkNoOverwrite` EEXIST (`src/editing/create-file.ts`, `src/editing/atomic-fs.ts`). Cross-kind plan collision checks compose locally | Proven scope is path/name identity. Non-existing leaves have no physical identity yet; platform case-fold/normalization aliases are not eliminated. Create supported on darwin/linux only (`isAtomicCreatePlatformSupported`). Hard-link no-overwrite remains final protection for the named path |
| Deterministic execution order | `MAPS_TO_EXISTING` | Readonly input arrays preserve order (`validatePreparedBatchBounds`); no unordered collection required | none |
| Per-target revalidation and config reload | `MAPS_TO_EXISTING` | `replaceExistingFile` / `createFile` export complete single-target sequences (`src/editing/index.ts`) | none |
| Honest partial-commit outcomes | `MAPS_TO_EXISTING` | `EditOutcome` + `commitPointReached` on EditRecords (`src/editing/types.ts`, `src/editing/internal/record.ts`); plan statuses are local wrappers | none |
| Authored-but-not-reobserved creation evidence | `MAPS_TO_EXISTING` | `CreationAfterStateEvidence` / opaque `PublishedCreationVerificationTarget` (`src/editing/internal/creation-verification.ts`); not exported on editing barrel; zero imports under snapshot/search/inventory | none |
| Plan bounds | `MAPS_TO_EXISTING` | `MAX_FILES_PER_EDIT_OPERATION = 16`; `MAX_TOTAL_PROPOSED_AFTER_BYTES = 8_388_608`; `MAX_EDIT_FILE_BYTES = 1_048_576` (`src/editing/bounds.ts`); non-widenable via `validatePreparedBatchBounds` | none |
| Ordered invalidation aggregation | `MAPS_TO_EXISTING` | Per-target `KnowledgeInvalidation` from `buildKnowledgeInvalidation` on SUCCESS and COMMITTED_FAILURE; ordered collection is local 3D composition | none |

### Bound constant and type names

Constants (exact):

- `MAX_FILES_PER_EDIT_OPERATION` = `16`
- `MAX_TOTAL_PROPOSED_AFTER_BYTES` = `8388608`
- `MAX_EDIT_FILE_BYTES` = `1048576` (equals `MAX_REPOSITORY_CONTENT_BYTES`)

Types / mechanisms (exact):

- `EditAuthorization`, `PreparedMutation`, `PreparedCreation`, `PreparedChange`
- `WorkspaceBoundary`, `CanonicalPath`, `RepositoryEntry`
- `CreationAfterStateEvidence`, `PublishedCreationVerificationTarget`
- `KnowledgeInvalidation`, `EditRecord`, `EditOutcome`, `commitPointReached`
- `replaceExistingFile`, `createFile`, `lookupAuthorizationEntry`


---

# 5. Read-only plan preflight

## 5.1 Preflight is mandatory and internal to execution

The public coordinated execution operation always performs a fresh preflight in the same invocation before the first write.

A separate preview API may exist only if genuinely needed for diagnostics, but its result can never be supplied back as permission to execute.

Execution never trusts a cached preflight result.

## 5.2 Preflight performs no mutation

Preflight must not:

- consume any authorization;
- create a temp candidate;
- invoke a write primitive;
- alter config;
- mutate Git;
- persist a plan;
- write progress state.

The existing single write module must remain untouched by preflight.

## 5.3 Pure gates first

Before filesystem observation:

- target count must be 2–16;
- total proposed after bytes must be within the frozen aggregate bound;
- every per-target size bound must hold;
- every entry must have a supported prepared kind;
- all targets must share one workspace;
- exact repeated prepared/authorization objects must be detected;
- caller cannot widen any bound.

## 5.4 Non-consuming authorization readiness

For every target, preflight checks through a private, read-only authority inspection:

- authorization exists in the legitimate 3A authority registry;
- authorization is not consumed;
- authorization is bound to the exact prepared object;
- mutation kind matches;
- no plain/reconstructed object is accepted.

This inspection:

- creates no authorization;
- consumes no authorization;
- is not public;
- is not a plan-level authority.

The real target execution still performs the authoritative one-shot consumption.

## 5.5 Target identity and collision checks

Preflight derives an internal `PlanTargetIdentity` or exact equivalent.

For replacement:

- current canonical physical target identity.

For creation:

- current canonical parent identity;
- exact leaf as authorized;
- current absence/current target state.

Reject before mutation every collision that can be proven from current authority:

- modify X + modify X;
- create X + create X under the same canonical parent and exact leaf;
- modify X + create X;
- creation + modification through lexical parent aliases that resolve to one canonical parent/target;
- repeated exact prepared target.

Every involved target receives a collision failure.

### Honest limit

For a non-existing leaf, physical identity does not yet exist.

Platform-specific case-folding or normalization aliases that cannot be proven from current path semantics must not be falsely reported as mechanically eliminated.

The per-target Phase 3C no-overwrite publication remains the final protection and may stop a later target after an earlier creation, producing an honest partial result.

If current source provides a stronger proven non-existing-target identity, use it and record the proof.

## 5.6 Every target is inspected

Preflight evaluates every target and returns every target that failed, not merely the first.

Within one target, checks continue only while doing so is safe.

Examples:

- after lexical denial, do not canonicalize/read merely to collect more reasons;
- after ConfigFailure, do not inspect target content under unknown restrictions.

Each failed target carries a non-empty ordered list of safely established reasons or one precise primary reason where further observation is forbidden.

## 5.7 Per-target preflight checks

Using the same authoritative check logic as 3B/3C—not a shadow policy implementation—preflight evaluates where applicable:

- mutation-time config resolution;
- lexical denial;
- workspace/canonical containment;
- physical denial;
- action restriction;
- current content fingerprint for modification;
- current target absence for creation;
- target/parent kind;
- hard-link/symlink restrictions;
- optional Git `UNMERGED` refusal;
- platform support.

If shared read-only helpers must be extracted, single-target operations and 3D preflight must continue to use one source of truth or prove semantic equivalence mechanically.

## 5.8 Preflight failure consumes nothing

If any target fails preflight:

- no filesystem write occurs;
- no authorization is consumed by the plan;
- no target EditRecord is produced;
- no KnowledgeInvalidation is produced;
- plan status is `REFUSED_AT_PREFLIGHT`;
- all target preflight outcomes are returned.

A target that passed its individual preflight inside a refused plan is recorded as:

`PREFLIGHT_READY_BUT_PLAN_REFUSED`

or exact equivalent.

That is point-in-time diagnostic evidence, not a lease or verified unchanged state.

---

# 6. Sequential coordinated execution

## 6.1 No parallel target mutation

Targets execute strictly one at a time in the exact frozen plan order.

No concurrent target writes.

No worker pool.

No speculative staging of later targets.

## 6.2 Every target runs full 3B or 3C

At its turn, each target invokes the complete existing single-target operation.

It must independently repeat all relevant checks, including:

- one-shot authorization consumption;
- bounds;
- platform support;
- mutation-time config re-resolution;
- lexical denial;
- canonical/workspace validation;
- physical denial;
- action restriction;
- current content/absence evidence;
- target/parent type and identity;
- exact candidate/publication mechanism;
- after-state verification;
- provenance and invalidation.

Preflight licenses skipping none of these.

## 6.3 Config is re-resolved per target

No plan-level config cache governs execution.

If `PATHCODE.md` changes during the plan, later targets observe the new valid restrictions or fail closed on ConfigFailure.

The plan result preserves each target operation’s actual config resolution/freshness evidence.

Do not invent a configuration “generation” field if the frozen types do not contain one.

## 6.4 Stop on first non-success

Execution continues only while every completed target returns verified single-target success.

On the first:

- `REFUSED_PRECOMMIT`;
- `FAILED_PRECOMMIT`;
- `COMMITTED_FAILURE`;

the coordinator stops.

No later target is attempted.

## 6.5 Not-attempted authorizations remain unconsumed

Targets after the stopping target are recorded `NOT_ATTEMPTED`.

Their authorizations are not consumed by 3D.

The result makes no claim that those targets:

- remain unchanged;
- remain current;
- remain eligible;
- will succeed later.

It says only that Path Code did not attempt them in this plan run.

## 6.6 Plan replay

A plan that partially executed cannot replay already-attempted authorizations.

A later invocation with the same plan input must fail preflight/consumption for already-consumed targets before further mutation.

There is no automatic resume from the stopping point.

A new coordinated attempt requires the caller to form a new current plan with valid authorizations.

---

# 7. Plan result

The plan result is opaque, immutable, and produced only by the coordinator.

No public result constructor.

## 7.1 Preflight target outcomes

For a preflight-refused plan, every target has exactly one:

- `PREFLIGHT_FAILED` with one or more safely established reasons;
- `PREFLIGHT_READY_BUT_PLAN_REFUSED`.

Neither carries an EditRecord or mutation invalidation.

## 7.2 Execution target outcomes

For an executing plan, every target has exactly one:

### `APPLIED`

The target returned verified 3B/3C success.

Carries the exact earned per-target EditRecord and KnowledgeInvalidation.

### `REFUSED_PRECOMMIT`

The target’s single-target sequence refused before its commit point.

Path Code made no commit for this target.

Do not claim the target was externally unchanged.

### `FAILED_PRECOMMIT`

The target’s single-target sequence failed before its commit point.

Path Code made no commit for this target.

Carries cleanup/failure evidence from the single-target operation.

### `COMMITTED_FAILURE`

The target reached its 3B/3C commit point but did not earn success.

Carries the exact committed-failure record and invalidation/uncertainty evidence.

Counts as a committed mutation for the plan-level status.

### `NOT_ATTEMPTED`

The plan stopped before this target’s turn.

Carries:

- its input/execution index;
- stopping target index/identity;
- stop reason category.

It carries no EditRecord, no currentness claim, and no mutation evidence.

## 7.3 Plan-level statuses

Exactly one:

### `ALL_APPLIED`

Every target returned `APPLIED`.

### `REFUSED_AT_PREFLIGHT`

At least one target failed preflight.

No target execution began.

No authorization was consumed by the plan.

### `STOPPED_BEFORE_ANY_COMMIT`

Execution began, but no target reached a commit point.

### `PARTIALLY_COMMITTED`

At least one target reached a commit point and the plan did not end with every target `APPLIED`.

This includes:

- one or more prior successes followed by refusal/failure;
- a `COMMITTED_FAILURE`, even if it occurred on the first target.

The name is commit-point based, not success-count based.

## 7.4 Required result evidence

The result records:

- exact immutable input order;
- exact execution order;
- each target’s original index;
- each target’s kind and safe display identity;
- each preflight result where applicable;
- each attempted target’s exact nested 3B/3C outcome;
- first stopping target;
- per-target config resolution evidence already earned by 3B/3C;
- ordered collection of per-target EditRecords;
- ordered collection of per-target KnowledgeInvalidations;
- creation inventory-staleness evidence for committed creations;
- plan-level status.

No plan-level `PATH_CODE_MODIFIED` provenance is minted. Provenance remains per-target and earned by the existing terminal paths.

---

# 8. Knowledge after a plan

## 8.1 Commit-point rule

Knowledge invalidation is based on targets that reached their commit points, not only on targets that earned `SUCCESS`.

For every `APPLIED` or `COMMITTED_FAILURE` target, preserve the exact single-target invalidation/uncertainty evidence.

## 8.2 Ordered aggregation only

Phase 3D may aggregate invalidation only as a readonly ordered collection of the exact per-target evidence.

It must not synthesize a stronger repository-knowledge claim.

## 8.3 Created files remain authored evidence

A created target’s `CreationAfterStateEvidence` remains mutation-verification evidence.

It is not:

- `RepositoryEntry`;
- `ContentObservation`;
- inventory membership;
- map/search/snapshot knowledge.

The plan result carries it without wrapping or rebranding it as repository knowledge.

## 8.4 No repair or refresh

Phase 3D performs no:

- re-inventory;
- re-read after the target’s own frozen terminal verification;
- metadata/map/search rebuild;
- snapshot rebuild;
- Git recollection.

Mutation invalidates knowledge.

It does not repair knowledge.

---

# 9. Bounds

Use the actual frozen Phase 3A bounds confirmed at freeze.

Expected values:

- maximum targets: `16`;
- maximum total proposed-after bytes: `8_388_608`;
- maximum per target: `1_048_576`.

The final Master records the actual constant names from source.

Rules:

- minimum targets: `2`;
- caller may narrow;
- caller may not widen;
- count/aggregate/per-target violations refuse before filesystem observation;
- total bytes count every target’s exact proposed bytes;
- no unbounded plan input.

Because the maximum is 16, bounded pairwise collision checks are acceptable; no generalized graph/index framework is required.

---

# 10. No transaction and no hidden state

Phase 3D creates no:

- backup set;
- `.bak` / `.orig`;
- transaction journal;
- lock file;
- progress file;
- resume token;
- undo database;
- `.path-code` state;
- plan cache;
- durable authorization state.

No plan persistence.

No cross-session resume.

No automatic retry.

No rollback.

---

# 11. Git and process safety

Phase 3D runs no Git command.

It may pass optional already-earned Git context to the existing 3B/3C operations.

No Git mutation.

No `child_process`.

No shell.

No provider/model/network execution.

The only production filesystem write module remains the already-authorized editing write module.

Phase 3D adds no second writer.

---

# 12. Local Phase 3D invariants

### P3D-001 — PER-TARGET AUTHORITY

Every target retains a distinct exact `EditAuthorization`. No plan-level authority exists.

### P3D-002 — NON-CONSUMING PREFLIGHT

Preflight validates readiness without consuming authorization or writing.

### P3D-003 — ALL FAILING TARGETS REPORTED

Preflight refusal names every failing target with its safe individual reason(s).

### P3D-004 — SINGLE WORKSPACE

Every target belongs to one exact workspace authority.

### P3D-005 — PROVABLE TARGET COLLISIONS REFUSED

Every target collision provable from current canonical target / canonical parent+leaf evidence is refused before mutation.

### P3D-006 — EXPLICIT DETERMINISTIC ORDER

Execution uses the exact immutable input sequence and records it.

### P3D-007 — PREFLIGHT IS NOT A LEASE

Every attempted target repeats the complete 3B/3C mutation-time sequence.

### P3D-008 — CONFIG PER TARGET

Configuration is re-resolved by every target operation at its own turn.

### P3D-009 — SEQUENTIAL STOP

The first non-success stops all later target attempts.

### P3D-010 — NOT_ATTEMPTED IS HONEST

Not attempted means only “Path Code did not attempt this target.”

### P3D-011 — COMMIT-POINT PLAN STATUS

Plan-level partial state is derived from target commit points, not only success count.

### P3D-012 — NO ROLLBACK

No automatic inverse mutation is attempted.

### P3D-013 — AUTHORED EVIDENCE STAYS DISTINCT

Creation evidence never becomes repository knowledge.

### P3D-014 — NO HIDDEN PERSISTENCE

No journal, backup, lock, progress, or resume state exists.

### P3D-015 — ONE WRITE MODULE PRESERVED

3D adds no filesystem writer.

---

# 13. Frozen Phase 3 proof obligations

Use the exact frozen Phase 3 Master wording.

## SE-020 — MULTI-FILE PARTIAL HONESTY

Phase 3D supplies the implementation evidence for SE-020 only if all P3D invariants pass and the result states exactly:

- what committed successfully;
- what committed but failed post-commit;
- what refused/failed before commit;
- what was never attempted;
- why execution stopped;
- which target order was used;
- which knowledge is invalidated;
- that no rollback occurred.

## SE-001 through SE-019

They are preserved through:

- all committed Phase 3A/3B/3C tests passing;
- cross-layer 3D integration tests proving no check is skipped;
- targeted live falsification only for behavior 3D refactors or directly coordinates.

Do **not** rerun every historical 3B/3C source corruption merely for ceremony.

If 3D extracts or changes a shared 3B/3C check, rerun the exact falsification that makes that check load-bearing.

This is the proportional-evidence rule from the Constitution.

---

# 14. Required implementation evidence

The later Phase 3D implementation pass contract must include concrete tests and falsifications for at least:

## 14.1 Preflight all failures

A mixed plan with multiple independently failing targets returns every failure and performs no writes or authorization consumption.

## 14.2 Mixed action restrictions

A plan containing modification and creation targets under different current action restrictions refuses as a whole and reports each affected target correctly.

## 14.3 Duplicate/collision detection

Cover:

- modify + modify same target;
- create + create same canonical parent/exact leaf;
- modify + create same target;
- canonical parent alias case;
- exact repeated prepared/authorization target.

## 14.4 Explicit order

A deliberately non-lexical input sequence executes in that exact order and records it.

## 14.5 Mid-plan failure

Induce failure at a later target after at least one prior target committed.

Prove:

- plan stops;
- later targets are `NOT_ATTEMPTED`;
- result is `PARTIALLY_COMMITTED`;
- no rollback;
- not-attempted authorizations remain unconsumed.

## 14.6 Failure before any commit

First attempted target refuses/fails precommit.

Prove:

- no target commit point;
- plan status `STOPPED_BEFORE_ANY_COMMIT`;
- later targets not attempted;
- no rollback/knowledge invalidation for uncommitted targets.

## 14.7 Committed failure

Induce a target `COMMITTED_FAILURE`.

Prove:

- plan stops;
- plan status `PARTIALLY_COMMITTED`;
- invalidation/uncertainty evidence preserved;
- later targets not attempted;
- no rollback.

## 14.8 Config changes mid-plan

A prior target modifies `PATHCODE.md` or an equivalent controlled fixture transition changes valid config before a later target.

Prove later target re-resolves config and obeys the new restriction.

No plan config cache.

## 14.9 Preflight-to-execution staleness

A target passes preflight, then changes before its turn.

Its own 3B/3C sequence refuses/fails safely.

Preflight does not license skipping checks.

## 14.10 Authored evidence boundary

A mixed plan result carries `CreationAfterStateEvidence` but it cannot satisfy `RepositoryEntry` or `ContentObservation`, and no repository-intelligence consumer accepts it.

## 14.11 Plan replay

After a partial run, retrying the same plan cannot reapply already-consumed authorizations.

## 14.12 Write boundary

Temporarily introduce a second production write import.

The existing exact-module architecture test must fail and name it.

---

# 15. What Phase 3D must not do

- no third mutation kind;
- no plan-level authorization;
- no cross-workspace plan;
- no hidden automatic sorting;
- no parallel target writes;
- no continuation after first non-success;
- no preflight authorization consumption;
- no cached-preflight authority;
- no config cache across target execution;
- no rollback;
- no backups;
- no transaction journal;
- no progress/resume persistence;
- no second write module;
- no Git execution or mutation;
- no re-inventory or knowledge repair;
- no directory creation;
- no deletion;
- no semantic dependency graph;
- no topological sorter;
- no automatic retry.

---

# 16. Phase 3D capability and self-observation

The implementation pass should create a capability record named consistently with:

`multi-file-coordination`

Declaration evidence:

- frozen Phase 3 Master;
- this frozen Phase 3D Master.

Implementation/freeze evidence:

- immutable 3D implementation commit;
- repository-recorded 3D report;
- exact truthful freeze form supported by Capability Ledger v1.

Expected after successful 3D linkage:

- `multi-file-coordination` → `PASS_FROZEN`;
- `edit-contracts` → `PASS_FROZEN`;
- `existing-file-replacement` → `PASS_FROZEN`;
- `safe-file-creation` → `PASS_FROZEN`;
- `safe-editing` → `DECLARED / IN PROGRESS`.

`safe-editing` is not upgraded until the independent Phase 3 integration audit and formal Phase 3 closure.

---

# 17. Phase 3D exit contract

Phase 3D may be declared `PASS_FROZEN` only if:

1. every Foundation Compatibility Preflight row was confirmed before this Master froze;
2. plan input is non-empty, bounded, same-workspace, and exact-order;
3. preflight performs no mutation and consumes no authorization;
4. every preflight-failing target is reported;
5. passing targets in a refused plan are not mislabeled as current/unchanged;
6. provable duplicate/colliding targets are refused before mutation;
7. execution is sequential in exact input order;
8. every attempted target runs the complete current 3B/3C operation;
9. config is re-resolved per target;
10. execution stops on first non-success;
11. not-attempted targets are structurally distinct and their authorizations remain unconsumed;
12. `COMMITTED_FAILURE` counts as committed mutation in the plan status;
13. plan result distinguishes `REFUSED_AT_PREFLIGHT`, `STOPPED_BEFORE_ANY_COMMIT`, `PARTIALLY_COMMITTED`, and `ALL_APPLIED`;
14. no rollback is attempted or implied;
15. per-target EditRecords and invalidations remain exact earned evidence;
16. authored creation evidence remains distinct from repository knowledge;
17. no persistence, Git execution, parallel mutation, or second write module exists;
18. all committed 3A/3B/3C tests pass;
19. every 3D-local load-bearing behavior has an observed falsification;
20. `multi-file-coordination` derives `PASS_FROZEN` at final evidence HEAD;
21. `safe-editing` remains `DECLARED`;
22. runtime dependencies remain zero;
23. working tree is clean;
24. Phase 3 integration audit has not been conflated with the 3D pass.

---

# 18. What follows

After Phase 3D:

```text
independent Phase 3 integration audit
→ formal Phase 3 closure
→ one bounded Closed-Vocabulary & Foundation Extensibility Audit
→ Phase 4 Master Contract with its own lean preflight
```

No implementation after 3D may claim Phase 3 complete before the independent audit and closure.

---

# 19. Documentation-only freeze record

This Master was frozen in the same coordinated documentation operation as the Foundation Extensibility Constitution V1.

## Freeze commits

Constitution Commit 1: `a73a623cfed77d2c2dc0238d386d40d4d1595065`

This Master Commit 2: recorded by Git at freeze time.

Bound at freeze:

- Constitution SHA: `a73a623cfed77d2c2dc0238d386d40d4d1595065`
- Amendment SHAs: `0b3bed86f8a05674a652359b958d728ae8086244`
- Phase 3C-H1 baseline: `dcb347fc613114be810b8caf371f0bea8b261285`
- source-confirmed preflight results: all `MAPS_TO_EXISTING` (see above)
- actual constant/type names: see above

Do **not** retroactively create a Phase 3C pass contract.

The constitution’s pass-contract artifact rule begins with the Phase 3D implementation pass.

Next permitted operation:

**draft and execute the Phase 3D implementation pass contract under `docs/passes/`.**

---

# END — PHASE 3D MULTI-FILE COORDINATION MASTER CONTRACT

