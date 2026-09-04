PATH CODE — PHASE 3-R2-H1
COMPLETE PUBLIC PARAMETER-GRAPH TRAVERSAL
CORRECTIVE CONTRACT — FINAL MERGED

REPOSITORY
/Users/achahbi/Projects/path-code

REQUIRED STARTING HEAD
c60c78254ce273235921694faac57ec5e4a30d5f

THIS CONTRACT IS A REPOSITORY ARTIFACT

Per Foundation Extensibility Constitution V1 §9, commit this exact contract as:

docs/passes/PHASE_3_R2_H1_PARAMETER_GRAPH_TRAVERSAL_CONTRACT.md

inside the Stage 0 commit of this pass. Do not rewrite it after Stage 0.

GOVERNING BALANCE

One defect class, one implementation locus, known lines, known escaped
shape, and known required proof. The permanent correction may touch the
canonical analyzer, its architecture proofs, the R2-H1 report, and
self-observation linkage only. It does not reopen Phase 3 production behavior.

This is the narrowest pass in the Phase 3 chain. Do not widen it.

==================================================
WHY THIS PASS EXISTS
==================================================

The fresh independent re-audit at c60c782 returned:

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE

It confirmed that R2 achieved what it claimed at the discovery layer: the
public callable set is now derived from the editing barrel through the
TypeChecker, named re-exports resolve, the original three Options types travel
the derived path, and the A-F19 AuthorizePreparedChangeOptions case fails
correctly.

It found one remaining defect, F-R1-003:

tests/architecture/public-authority-surface-analyzer.ts, at the lines reported
as 858–861, gates RECURSIVE TRAVERSAL on a naming condition of the shape

  parameterName === "options" || /Options$/.test(typeName) || ...

Of 28 derived public parameter roots, only the 4 whose names satisfy that
condition are ever opened. Proven live: the identical F-R1-001 corruption
placed on a new public function whose parameter is `input` and whose type is
`NovelPublishSettings` yields FINDINGS (0). The standing guard passes.

Discovery is derived. Traversal is still gated by a naming convention.

R2's own falsification 2-F2 did not catch this because its fixture was named
FutureMutateOptions with a parameter named options — it satisfied the gate it
was meant to test. The falsification tested through the hole rather than at it.

The R2 contract §1.2 required: "for each parameter, traverse the recursively
reachable project-defined type graph", and forbade discovery by "type-name
list ... or filename convention". §1.2/§1.4 required STOP AND REPORT when a
case could not be classified from frozen text. The auditor found that a
tension involving WorkspaceBoundary.canonicalize was instead resolved by
narrowing the walk silently. That narrowing is the defect.

Consequently GAP-057 was CLOSED at 4aadb06 against a closure condition —
"follows named re-exports and project-defined parameter graphs" — that its
evidence does not meet.

PRIMARY ORIGIN: IMPLEMENTATION
The contract required unconditional project-graph traversal. The
implementation gated it on names and did not STOP AND REPORT the case that
motivated the gate.

CONTRIBUTING ORIGIN: EVIDENCE
2-F2's fixture was shaped to pass the gate, so the proof did not exercise the
defect.

THE PRINCIPLE THIS PASS ENFORCES

A guard has two kinds of lists. A list that decides WHAT TO SKIP is fail-open:
anything not on it is invisible. A list that decides WHAT IS REVIEWED-SAFE is
fail-closed: anything not on it is inspected and rejected if dangerous. R2's
naming gate was the first kind. This pass permits only the second kind, keyed
by resolved type identity, never by parameter name or type-name pattern.

No active authority leak exists. Every public parameter type at c60c782 is
legitimate. The defect is that the detector cannot see the next one.

==================================================
OPERATOR DECISIONS — ALREADY MADE, DO NOT RE-DERIVE
==================================================

D1  GAP-057 REOPENS. Lifecycle CLOSED → OPEN. The closure at 4aadb06 / 8520ab9
    is preserved in notes as immutable historical evidence proven insufficient
    by c60c782. GAP-057 is re-closed only against this pass's evidence.
    Reattach to safe-editing.knownLimitations and edit-contracts.knownLimitations.
    Do not create a separate gap for F-R1-003; it is GAP-057's condition unmet.

D2  NO COMPONENT DOWNGRADE. The four mutation capabilities keep freezeEvidence
    and remain PASS_FROZEN. safe-editing remains IMPLEMENTED. No active leak,
    no false component claim.

D3  SCOPE STAYS THE EDITING BARREL. GAP-058 (package-root scope) remains OPEN
    and is not implemented here. F-R1-003 concerns traversal depth, not
    discovery root.

D4  npm run check TIMING INSTABILITY IS RECORDED, NOT FIXED. The auditor
    observed 3 of 4 full runs timing out, zero assertion failures, all suspect
    files passing in isolation, host load 26–30 on 8 CPUs, extent exceeding
    the recorded two-file flake, and R2's 2-F6 timing out against its own 60s
    budget. Record as a NON_BLOCKING_LIMITATION gap (GAP-059, verify ID and
    verify that no existing canonical gap already represents this broader
    full-suite condition). Do not redesign vitest, workers, or budgets in this
    pass unless the traversal correction itself proves a direct deterministic
    cause.

D5  THE 2-F2 FIXTURE IS NOT DELETED. No probe is deleted or weakened. The
    adversarially named cases in this pass are ADDED beside it.

==================================================
WHAT THIS PASS DOES NOT DO
==================================================

- NO committed change under src/. The only permitted src/ edits are the
  temporary, hash-restored corruptions this contract requires.
- NO change to authorization semantics, ActionClass, or evidence tiers
- NO Gap Ledger or Capability Ledger schema change
- NO new authority vocabulary — Amendment 1 §4 D governs detection
- NO rewrite, amend, rebase, squash, or removal of any commit
- NO deletion or weakening of any existing probe, falsification, or mechanism
  test, including R2's 2-F1 through 2-F7
- NO package-root expansion (GAP-058)
- NO vitest / worker / timeout redesign (GAP-059)
- NO promotion of safe-editing, NO closure artifact, NO Stage 4
- NO re-audit — this pass implements; a fresh executor audits
- NO Foundation §10 audit, NO Phase 4
- NO push, NO remote

==================================================
NO-UNTRACKED-FINDING RULE
==================================================

Every genuine finding in this pass ends in exactly one of: corrected and
closed by immutable evidence here; OPEN in the canonical Gap Ledger with
classification and closure condition; or cited exactly as an already-recorded
frozen limitation. Nothing disappears into prose.

If unconditional traversal surfaces a callable or mechanism-shaped member on
any public parameter graph OTHER than the seeded test corruptions, that is a
new active finding. STOP AND REPORT. Do not classify it away inside this pass.

==================================================
FAILURE PROTOCOL
==================================================

If any gate after Stage 0 fails: stop; restore every temporary corruption with
hash verification; remove incomplete candidate changes; verify no src/ change
remains; preserve every genuine finding in the Gap Ledger and the R2-H1
report; commit only the durable finding artifacts with exact subject

  Record Phase 3-R2-H1 traversal correction finding

leave GAP-057 OPEN and safe-editing IMPLEMENTED; stop.

==================================================
RESTORATION DISCIPLINE — BINDING
==================================================

Every live corruption must be reversible without destroying legitimate
uncommitted R2-H1 work.

Before each corruption classify every touched path:

A. BASELINE TRACKED PATH
   The path has no intended R2-H1 candidate change at that moment.
   Record its HEAD blob hash and working-copy SHA-256. Restore from HEAD.
   Verify both the expected blob/hash and a path-scoped empty diff.

B. CANDIDATE PATH
   The path already contains intended, uncommitted R2-H1 work.
   Save an exact byte-for-byte candidate snapshot outside the repository and
   record its SHA-256 before corrupting it. Restore from that snapshot — NOT
   from HEAD — and verify the candidate SHA-256 is identical.

C. ISOLATED SYNTHETIC FIXTURE
   The path exists solely for a falsification fixture. Remove the complete
   fixture and verify no residue remains.

Never use a broad restore command. Never restore an entire directory. Never
discard unrelated candidate work. After every falsification, verify the exact
touched-path set and record the restoration command, pre/post hashes, and
path-scoped diff result.

If exact restoration cannot be proven, the falsification produced no
admissible evidence and the pass follows the FAILURE PROTOCOL.

==================================================
BASELINE GATE
==================================================

git rev-parse HEAD                   → c60c78254ce273235921694faac57ec5e4a30d5f
git status --porcelain               → empty
git log -1 --oneline                 → record
npm run ledger:verify                → PASS

Ancestors, each MUST exit 0:
git merge-base --is-ancestor 696ef4fe58c21cdd527869309a2b9fd5abcd19a8 HEAD
git merge-base --is-ancestor 5386f349eccd7c69ff696619ffc426757e3e91d0 HEAD
git merge-base --is-ancestor 63f6e87cf199b3b551196be09a486b81da2860dd HEAD
git merge-base --is-ancestor ecda537f87ca63584fffe46bba67c6009def4219 HEAD
git merge-base --is-ancestor 8520ab97feb66112fd28e0b7525d949d843c2ca6 HEAD

Verify:
- docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md at HEAD contains the
  exact NOT COMPLETE result line and the F-R1-003 finding
- GAP-057 is CLOSED (about to be reopened); GAP-059 is unused — if occupied,
  STOP AND REPORT, do not renumber silently
- no existing canonical gap already covers the broader full-suite timeout
  evidence described by c60c782; if one does, STOP AND REPORT instead of
  creating a duplicate record
- safe-editing derives IMPLEMENTED; four mutation capabilities PASS_FROZEN
- Phase 4 absent

Record the runtime total. Expected 619. VERIFY.

Record the exact current traversal gate: quote the condition verbatim with
file path and line numbers as they exist at HEAD. If the lines differ from the
auditor's 858–861, record both.

Record the count of derived public parameter roots the analyzer currently
produces. Expected 28. VERIFY — this number is a baseline, never a hardcoded
assertion.

==================================================
FOUNDATION COMPATIBILITY PREFLIGHT
==================================================

| Concept used by this pass                                       | Foundation                              | Result           |
|-----------------------------------------------------------------|-----------------------------------------|------------------|
| Deterministic public callable-surface manifest                  | Amendment 1 §4 C                        | MAPS_TO_EXISTING |
| Fail on unreviewed mechanism-shaped public member               | Amendment 1 §4 D                        | MAPS_TO_EXISTING |
| Reviewed exception scoped to function+parameter+member          | PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS    | MAPS_TO_EXISTING |
| Reviewed TERMINAL TYPE registry keyed by resolved type identity | Amendment 1 §4 D "unreviewed" + existing exception model | MAPS_TO_EXISTING (a reviewed, fail-closed, symbol-keyed allowlist is the existing exception concept applied to types rather than members) |
| Per-root disposition manifest                                   | Amendment 1 §4 C manifest               | MAPS_TO_EXISTING (an enriched manifest, same concept) |
| Reopen a CLOSED gap, preserving prior closure in notes          | Gap Ledger v1, GAP-040 practice         | MAPS_TO_EXISTING |
| TypeScript Program / TypeChecker in tooling                     | typescript devDependency, R2 analyzer   | MAPS_TO_EXISTING |

No new foundational concept. No amendment required.

The disposition vocabulary and reviewed-terminal registry introduced below are
LOCAL ANALYZER MECHANISMS. They are not new Path Code domain/evidence states,
are not exported from production, and do not alter the Gap Ledger schema.

If the implementer finds that classifying a root requires a distinction
Amendment 1 does not provide, that is STOP AND REPORT origin FOUNDATION — not
a silent gate.

==================================================
EXECUTOR ASSIGNMENT — BINDING
==================================================

EXECUTOR A (Stages 0–2): Cursor, or another implementation agent. MUST NOT be
the Claude Code session that authored c60c782 or the one that authored ecda537.

FUTURE EXECUTOR B (not this pass): a completely fresh session that did not
implement R2-H1 and receives no transcript of it. Both prior Claude Code
auditor sessions are disqualified.

An executor that did not START a stage may not FINISH it. This pass STOPS at
the Stage 2 gate.

==================================================
STAGE 0 — RECORD
==================================================

0.1  Create docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md. §0 records:
     - F-R1-003 as established at c60c782: the exact gate condition quoted,
       the 28-of-which-4 traversal count, the NovelPublishSettings / input
       escape with FINDINGS (0)
     - why R2's 2-F2 did not catch it
     - the WorkspaceBoundary.canonicalize tension the auditor identified, and
       the fact that it was resolved by narrowing rather than STOP AND REPORT
     - the exact R2 contract clauses contradicted (§1.2 traversal, §1.2
       no-convention, §1.2/§1.4 STOP AND REPORT)
     - the fail-open vs fail-closed list principle
     - origin: IMPLEMENTATION primary, EVIDENCE contributing
     - the auditor's npm run check observations verbatim: attempt counts,
       failure counts, timings, isolation results, host load, 2-F6 timeout

0.2  REOPEN GAP-057.
     lifecycle CLOSED → OPEN.
     Remove closedByCommit and closureEvidence.
     notes: "Closed at 4aadb06047173b09cfceee542f140ad6fce7b06f with evidence
     docs/reports/PHASE_3_R2_CORRECTION_REPORT.md. Independent re-audit at
     c60c78254ce273235921694faac57ec5e4a30d5f (F-R1-003) proved that closure
     evidence insufficient: recursive traversal remained gated on
     parameter/type naming, so 'follows project-defined parameter graphs' was
     not met. Prior closure commits remain immutable. Reopened by Phase 3-R2-H1."
     Amend description to add: "After R2, discovery was derived but recursive
     traversal remained gated on parameterName === 'options' or a /Options$/
     type-name pattern, leaving 24 of 28 public parameter roots uninspected."
     Amend closureCondition to add: "every derived public parameter root
     receives exactly one explicit structural disposition; no root is skipped
     by parameter name or type-name pattern; an adversarially named parameter
     and type carrying a mechanism-substitution member is detected."
     Reattach to safe-editing.knownLimitations and
     edit-contracts.knownLimitations.

0.3  RECORD GAP-059 only after verifying the ID is unused and no existing
     canonical gap already represents this broader condition.
     title: Full npm run check exhibits widespread wall-clock timeout
       instability under host contention
     proposedClass: NON_BLOCKING_LIMITATION
     reviewClassification: NON_BLOCKING_LIMITATION
     lifecycle: OPEN
     sourceCheckpoint: Phase 3-R1 Stage 3 fresh re-audit at c60c782
     description: 3 of 4 full check runs timed out (16, 1, 23 tests
       respectively); zero assertion failures; suspect files pass in isolation
       (52/52); excluding both R2 architecture files still left 4 timeouts;
       host load 26–30 on 8 CPUs; R2's 2-F6 timed out against its own 60s
       budget. Extent exceeds the previously recorded two-file flake.
     whyNonBlocking: no assertion defect established; all affected suites pass
       in isolation; one complete run passed; no production-semantic failure
       demonstrated.
     missingEvidence: deterministic worker/concurrency policy or bounded
       test-program reuse, plus representative repeated clean checks under
       recorded load.
     closureCondition: a proven load-control mechanism and repeated clean full
       checks with recorded host conditions.
     notes: supersedes the narrower two-file disposition cited in the census
       baseline and hardening report §9 as the current description of this
       behavior. Not attached to any capability.

0.4  npm run gap:render; npm run ledger:verify. MUST PASS. Derived states
     unchanged — VERIFY and record all seven.

0.5  Commit this contract at the path above in the same commit.

STAGE 0 COMMIT EXACTLY
Record Phase 3-R2-H1 parameter-graph traversal finding

==================================================
STAGE 1 — UNCONDITIONAL PROJECT-GRAPH TRAVERSAL
==================================================

Executor A. Tests and tooling only.

1.1  PRE-CORRECTION REPRODUCTION — FIRST, before any analyzer change.

     Add a temporary public editing function to the barrel with an
     adversarially named parameter and type:

       type NovelPublishSettings = {
         readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
       };
       export function novelPublishSomething(input: NovelPublishSettings): void {}

     Run the standing guard. Expected: PASS with FINDINGS (0) — the defect
     reproduced at this baseline by this executor. Capture verbatim.

     Then rename only the parameter to `options` and re-run. Expected: the
     guard now FAILS. Capture verbatim. This pair proves the gate is on the
     name and nothing else.

     Restore both fixtures. For every file touched, record the blob hash
     before, restore from HEAD, verify hash equality and
     git diff --exit-code. If the first run FAILS instead of passing, the
     finding does not reproduce — STOP AND REPORT.

1.2  REMOVE THE NAMING GATE.

     Traversal of a public parameter root MUST NOT depend on:
     - the parameter's name
     - the type's name or any pattern over it
     - the declaring file's name or path pattern
     - a list of function, parameter, or type names

     The analyzer may decide that a root is a TERMINAL. It may not decide that
     a root is INVISIBLE. Every root is either traversed or explicitly
     classified terminal for a structural reason.

     For unknown / any / rest / index-signature policy, every callable exported
     from src/editing/index.ts is authority-sensitive by default. That
     sensitivity may not be switched off by function name, parameter name, or
     type name. Any exception must use the exact approved-exception mechanism
     and is a STOP AND REPORT finding in this pass.

1.3  PER-ROOT / PER-NODE DISPOSITION — MANDATORY OUTPUT.

     Every derived public parameter ROOT and every encountered TYPE/PATH NODE
     receives exactly one traversal disposition from this exact closed set:

       TRAVERSED_PROJECT_GRAPH     project-defined structural type whose
                                   permitted members/type arguments were walked
       PRIMITIVE_TERMINAL          string, number, boolean, bigint, symbol,
                                   null, undefined, enum/literal terminal
       EXTERNAL_LIBRARY_TERMINAL   declaration owned by TypeScript lib or an
                                   external package; its member graph is not
                                   walked after caller-controlled/project-owned
                                   type arguments have been inspected
       REVIEWED_TERMINAL           project-defined type whose canonical
                                   resolved identity appears in the reviewed
                                   terminal registry (1.4); its own members are
                                   not walked, but all applicable type arguments
                                   are inspected first and the entry is
                                   individually falsifiable
       CALLABLE_REJECTED           user-defined call signature or
                                   mechanism-shaped member per Amendment 1 §4 D
                                   found on an unreviewed surface
       UNSAFE_ESCAPE_REJECTED      any / unknown / rest / index signature or
                                   unconstrained/unresolved type parameter on
                                   an authority-sensitive public surface
                                   without an approved exception

     Do not add a seventh disposition merely to accommodate an implementation
     difficulty. No disposition may mean skipped, ignored, not-applicable,
     uninteresting, or name did not match. If a real current root cannot be
     represented truthfully by this set, STOP AND REPORT origin FOUNDATION.

     MANIFEST IDENTITY

     A root occurrence is keyed by a deterministic path containing at minimum:

       export name
       → overload/signature index
       → parameter index and declared name
       → canonical resolved type identity
       → nested member/type-argument path

     Reuse of the same type by two public functions, two overloads, or two
     parameters MUST still emit a root disposition for every occurrence.
     Memoization may reuse the underlying type analysis, but may never suppress
     a public root or nested occurrence from the manifest.

     CYCLE HANDLING

     Cycle prevention and manifest completeness are separate. A traversal-stack
     or memoized type-analysis result may break recursion, but every public root
     still receives its own manifest entry. A global visited set that causes a
     later root to disappear is forbidden.

     FINDINGS ARE SEPARATE

     The disposition manifest and the findings collection are separate but
     linked by the deterministic node path. An ancestor may be
     TRAVERSED_PROJECT_GRAPH while a nested member is CALLABLE_REJECTED. Do not
     overwrite the ancestor's disposition or collapse a rejection into a
     missing root.

     The manifest uses a locale-independent stable sort by export, signature,
     parameter, type path, member path, and disposition. The standing guard and
     permanent completeness test compare:

       discovered public roots
       ==
       manifested public roots

     and verify exactly one disposition per manifested occurrence. The test
     derives both sides from the analyzer; it does not hardcode 28 or any later
     count.

     A root or reached node with no disposition is a guard FAILURE, not a
     warning.

1.4  REVIEWED TERMINAL REGISTRY — THE ONLY PERMITTED SKIP AUTHORITY.

     This is where the WorkspaceBoundary.canonicalize tension is resolved
     explicitly, as R2 should have done.

     Some legitimate public inputs are project-defined objects carrying
     methods — earned opaque references and frozen foundation objects
     (WorkspaceBoundary, RepositoryEntry, PreparedChange, EditAuthorization,
     ResolvedProjectConfig, GitStateBaseline, MultiFilePlan, and similar). A
     method on such an object may be the object's own frozen behavior rather
     than a caller-supplied substitute. Unconditional traversal will encounter
     those methods. They MUST NOT be hidden by narrowing the walk.

     They may be terminal only through a REVIEWED TERMINAL REGISTRY with these
     properties:

     CANONICAL IDENTITY

     - keyed by the ORIGINAL resolved TypeScript symbol after alias resolution,
       using normalized repository-relative declaration path + exported
       symbol name + declaration kind;
     - checker.getAliasedSymbol or equivalent MUST resolve named re-exports;
     - never keyed by parameter name, apparent alias name, typeToString alone,
       suffix/prefix, regex, declaring filename convention, glob, or module-wide
       pattern;
     - anonymous structural types cannot be reviewed terminals. They are
       traversed.

     ENTRY CONTENT

     Each entry carries:

     - canonical type identity;
     - exact declaring module/declaration;
     - structural reason from this exact local set:
         EARNED_OPAQUE_AUTHORITY
         FROZEN_FOUNDATION_OBJECT
       If a genuinely required current terminal cannot be justified by one of
       these two reasons, STOP AND REPORT rather than inventing another reason;
     - governing frozen contract/document reference;
     - exact permanent falsification test name;
     - generic/type-argument policy, when applicable.

     GENERIC SAFETY

     A reviewed terminal MUST NOT hide caller-controlled structure inside type
     arguments.

     Before REVIEWED_TERMINAL is assigned:

     - every applicable type argument, tuple element, array element, union or
       intersection constituent that can carry project-owned caller input is
       recursively inspected;
     - a broad generic-symbol entry such as SomeType<T> that silently accepts
       arbitrary T is forbidden;
     - the entry must either prove the type is semantically closed or scope the
       exact permitted instantiation policy;
     - an unreviewed/dangerous type argument causes traversal/rejection even
       when the outer generic symbol is reviewed.

     FAIL-CLOSED

     - a project-defined type not in the registry is traversed;
     - any callable/mechanism shape found on it is CALLABLE_REJECTED;
     - every registry entry is individually falsifiable: removing it in memory
       must make the guard reject the exact callable members that justified the
       entry;
     - an entry with no load-bearing removal test is not permitted;
     - wildcard, glob, regex, name-pattern, module-wide, directory-wide, or
       "all domain types" entries fail;
     - the registry is populated only with types actually encountered at the
       audited HEAD and that genuinely require terminal treatment. Do not
       pre-populate speculatively.

     Record every canonical entry, reason, contract citation, type-argument
     policy, and falsification result in the report.

     If a root cannot be classified from the frozen texts — Amendment 1 §4 D,
     the Phase 3 Master, and the existing exception model — STOP AND REPORT
     with origin CONTRACT or FOUNDATION. That is the instruction R2 did not
     follow. Do not resolve a classification tension by making the walk skip
     anything.

     PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS remains separate and member-scoped.
     Its canonical list remains empty unless a specific member on a specific
     parameter of a specific function genuinely requires it. Needing such an
     entry is a STOP AND REPORT finding, not a shortcut.

1.5  TRAVERSAL COMPLETENESS.

     Regardless of names, file locations, or apparent suffixes, the walk
     reaches project-defined:

     - type aliases;
     - interfaces and complete extends chains;
     - nested object/member types;
     - unions and intersections;
     - tuples and arrays through their element types;
     - generic wrappers and every relevant type argument;
     - anonymous structural types;
     - every overload/call signature parameter;
     - repeated use of the same resolved type from different public roots.

     TYPE-PARAMETER RULE

     A type parameter is inspected through its effective constraint and any
     concrete/default type arguments visible at the public signature. An
     unconstrained or unresolved public type parameter is
     UNSAFE_ESCAPE_REJECTED unless an exact approved exception exists. Generic
     syntax is never a reason to stop traversal.

     EXTERNAL CONTAINER RULE

     An external declaration is not automatically opaque merely because its
     symbol belongs to TypeScript lib or @types/node. Before assigning
     EXTERNAL_LIBRARY_TERMINAL, inspect its type arguments/element types for
     project-owned or unsafe caller-controlled structure. Do not walk the
     external member graph itself.

     Therefore:

       ReadonlyArray<NovelPublishSettings>
       Array<NovelPublishSettings>
       ProjectWrapper<NovelPublishSettings>

     cannot hide NovelPublishSettings. Buffer and Uint8Array member graphs
     remain external terminals after their applicable type arguments have been
     dispositioned.

     OVERLOAD / REUSE RULE

     Every overload signature and parameter occurrence is manifested. If two
     public callables use the same project-defined type, both roots appear.
     Shared analysis may be memoized, but root coverage may not be deduplicated
     away.

     CYCLE RULE

     Recursive/self-referential types terminate by canonical resolved identity
     while preserving a manifest occurrence at every reached path. Anonymous
     types use a deterministic declaration/location + structural identity, not
     an unstable generated display name.

     These MUST be equivalent to the guard:

       function a(options: NovelPublishOptions): void
       function b(input: NovelPublishSettings): void
       function c(ctx: ReadonlyArray<NovelPublishSettings>): void

     None may escape because of parameter name, type name, external container,
     overload position, or previous traversal of the same type.

1.6  ONE CANONICAL ANALYZER PATH.

     The standing guard and every permanent proof call the same analyzer.
     No duplicate rule, parallel regex-only implementation, shadow fixture
     analyzer, or report-only census is admissible evidence.

1.6A PROGRAM / PERFORMANCE DISCIPLINE.

     The analyzer constructs at most one TypeScript Program/TypeChecker per
     analysis invocation. It MUST NOT construct a Program per export, root,
     node, disposition, or registry entry.

     Within one invocation, type analysis may be memoized by canonical resolved
     identity, provided manifest occurrences remain complete as required by
     §1.3. No mutable cross-run cache, hidden persistence, generated index, or
     background watcher is introduced.

     Synthetic falsification fixtures may use their own bounded Program, but
     each test records how many Program instances it creates. The permanent
     standing guard analyzes the real editing barrel in one canonical
     invocation.

     Record:

     - Program construction count for the real guard;
     - analyzer wall-clock time in the focused guard suite;
     - manifest root/node counts;
     - whether repeated roots reuse memoized analysis without disappearing;
     - whether any full-check timeout correlates directly with analyzer work.

     Do not run another Path Code test/build process concurrently with the full
     gate. Do not kill unrelated host processes. If stale Path Code-owned
     Vitest/Node processes from this pass are found, record and terminate only
     those before the next bounded attempt.

1.7  PERMANENT FALSIFICATIONS.

     Every falsification follows:

       exact pre-state/candidate hash
       → one named corruption
       → exact focused failure
       → intended reason
       → restoration under RESTORATION DISCIPLINE
       → restored hash/path diff
       → final PASS

     A falsification that errors, times out, or fails for another reason before
     its intended failure produces NO evidence — STOP AND REPORT.

     H1-F1  ADVERSARIAL NAME — THE FINDING

            Add:

              novelPublishSomething(input: NovelPublishSettings)

            with authorityOps.issue. The guard MUST FAIL and MUST name:

              novelPublishSomething
              signature/parameter occurrence
              input
              NovelPublishSettings
              authorityOps
              authorityOps.issue

            No manifest, registry, exception, type list, function list, or name
            pattern is taught the fixture.

     H1-F2  NAME / CONTAINER VARIETY

            The same dangerous member is reached through parameters named:

              ctx
              settings
              params
              cfg
              x

            and types with no recognizable suffix, such as:

              Foo
              Bar
              PublishCtx

            It is also reached when nested in transparent containers/wrappers,
            including at minimum:

              ReadonlyArray<Foo>
              a project-defined generic wrapper<Foo>

            A synthetic public function with an unconstrained generic
            parameter, such as genericPublic<T>(input: T), must be classified
            UNSAFE_ESCAPE_REJECTED rather than silently accepted.

            Every case MUST fail for the same semantic reason. This is the
            falsification R2's 2-F2 should have been.

     H1-F3  DISPOSITION / ROOT COMPLETENESS

            Derive the discovered-root set and manifested-root set from the
            same canonical analyzer invocation. They MUST be equal without
            hardcoding 28 or any final count.

            Also prove:

            - the same project-defined type used by two public functions emits
              two root occurrences;
            - every overload signature parameter emits its own occurrence;
            - a recursive type terminates without losing the root;
            - temporarily suppressing one occurrence/disposition path makes
              the completeness test fail.

     H1-F4  PREVIOUS CASES AND GRAPH SHAPES PRESERVED

            R2's:

            - 2-F1 AuthorizePreparedChangeOptions;
            - 2-F2 future public function;
            - 2-F3 named re-export;
            - 2-F4 nested / alias / extends / union / intersection;
            - 2-F6 exception scope;
            - A-F19 mandated case;

            all still fail for the intended reason and restore.

            Add a generic-smuggling proof: a dangerous project-defined type
            carried as a type argument/array element cannot be hidden by an
            external container or reviewed outer generic.

     H1-F5  REVIEWED TERMINAL REGISTRY FALSIFICATION

            For EACH canonical reviewed-terminal entry:

            - remove only that entry in memory;
            - run the exact public roots that require it;
            - the guard MUST reject the callable members naming the canonical
              type identity and member path;
            - restore and PASS.

            Also prove:

            - an anonymous type cannot be registered;
            - an alias/name-pattern/wildcard/module-wide entry fails;
            - an unscoped generic entry cannot hide a dangerous type argument;
            - repeated use of one terminal type at multiple roots remains
              manifested at every root.

            An entry with no load-bearing removal test is removed.

     H1-F6  FALSE-POSITIVE / EXTERNAL-BOUNDARY CONTROL

            Every legitimate public input at HEAD passes for an explicit
            structural reason — primitive, external library boundary after
            type-argument inspection, traversed project graph, or reviewed
            terminal with cited reason.

            Buffer / Uint8Array member graphs are not traversed.

            A project-defined type that contains Buffer/Uint8Array data is
            still inspected at its own members.

            A differently named synthetic external package type is classified
            by declaration ownership, not naming. Its member graph is not
            traversed, but a dangerous project-owned type argument remains
            visible.

     H1-F7  EXACT BAD IMPLEMENTATION RESTORED

            Using candidate-safe restoration, temporarily restore the exact R2
            naming gate verbatim.

            Expected:

            - 2-F1 AuthorizePreparedChangeOptions MAY still be detected;
            - H1-F1 NovelPublishSettings/input MUST escape;
            - H1-F2 non-options names/container case MUST escape where the old
              gate would skip it;
            - H1-F3 discovered-vs-manifest completeness MUST fail.

            Restore unconditional structural traversal from the exact candidate
            snapshot. All focused tests PASS.

            This is the decisive proof that the fix is removal of the gate and
            not another name/list patch.

1.8  FULL VALIDATION GATE — BOUNDED AND HONEST.

     First run, separately and record:

       npm run typecheck
       npm test
       npm run build
       npm run cli:smoke
       npm run ledger:verify

     Each MUST PASS. Any assertion, compiler, build, CLI, ledger, restoration,
     or semantic failure is a real failure — STOP AND REPORT.

     Then run:

       npm run check

     CHECK-ATTEMPT POLICY

     - Attempt 1 is the primary result and is always preserved.
     - If it PASSes, record a clean first-attempt gate.
     - If it fails only through wall-clock test timeout(s), with no assertion,
       compiler, build, CLI, or ledger failure:
         1. record the complete output, test names, durations, host load, and
            process count;
         2. verify no other Path Code test/build process is running;
         3. run every timed-out file in isolation and record the result;
         4. retry the full unchanged npm run check.
     - A maximum of FOUR full check attempts is permitted in this stage.
     - Every attempt and every isolation run is evidence for GAP-059.
     - At least one complete full check MUST PASS, every timed-out suite MUST
       pass in isolation, and no attempt may contain an assertion/semantic
       failure.
     - If no complete pass occurs within four attempts, or an isolation run
       fails, follow the FAILURE PROTOCOL.
     - Do not alter Vitest workers, test timeouts, test selection, Node options,
       or package scripts to obtain a pass.
     - Do not represent a later pass as though earlier attempts were clean.

     Record exact runtime total, file count, all attempt durations, host load,
     analyzer focused runtime, and TypeScript Program construction count.

1.9  Verify no committed change under src/.

     Record:

     git diff --exit-code <Stage-0-HEAD>..HEAD -- src

     and the final working-tree path-scoped diff. Both must prove that every
     src/** corruption was temporary and exactly restored.

1.10 COMPLETE THE R2-H1 REPORT IN THIS COMMIT.

     docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md must contain complete
     Stage 0 and Stage 1 evidence before Stage 1 commits, including:

     - the exact pre-correction reproduction pair;
     - the old naming gate and why it was fail-open;
     - the final canonical analyzer design;
     - complete discovered-root and disposition manifests/counts;
     - every reviewed-terminal entry, canonical identity, contract reason,
       generic policy, and H1-F5 removal result;
     - every H1-F1 through H1-F7 corruption, exact failure, restoration hashes,
       and final pass;
     - every retained R2 proof and A-F19 result;
     - Program construction count and analyzer timing;
     - every npm run check attempt/isolation result;
     - baseline/final runtime counts;
     - src/** diff evidence;
     - GAP-057/GAP-059 states;
     - non-empty NOT VALIDATED.

     The report is complete in Stage 1 so Stage 2 can close GAP-057 against an
     immutable implementation/evidence commit that already contains the
     evidence. It cites no Stage 2 SHA and does not predict its own commit SHA.

     Compute and record the report SHA-256 immediately before Stage 1 commit.

STAGE 1 COMMIT EXACTLY
Complete public parameter-graph traversal without naming gates

==================================================
STAGE 2 — EVIDENCE LINKAGE
==================================================

2.1  CLOSE GAP-057 against Stage 1:
     lifecycle CLOSED
     closedByCommit = Stage 1 full SHA
     closureEvidence = docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md
     notes preserve: the first closure at 4aadb06 and its supersession by
     c60c782; that this closure rests on unconditional traversal proven by
     H1-F1, H1-F2, H1-F3 and H1-F7; that no active leak ever existed.

2.2  Remove GAP-057 from safe-editing.knownLimitations and
     edit-contracts.knownLimitations. GAP-058 and GAP-059 remain OPEN,
     unattached.

2.3  Update citation SHA constants only to bind the Stage 1 commit.

2.4  npm run gap:render and npm run ledger:verify MUST PASS.

     Run npm run check under the exact bounded attempt policy in §1.8.
     Record every attempt and isolation result. At least one complete full
     check must pass, all timeout-only files must pass in isolation, and no
     assertion/semantic failure is permitted.

2.5  VERIFY and record final state:
     edit-contracts, existing-file-replacement, safe-file-creation,
     multi-file-coordination PASS_FROZEN; safe-editing IMPLEMENTED — NOT
     promoted; repository-intelligence, foundation-kernel PHASE_VERIFIED;
     GAP-051 OPEN; GAP-052 OPEN; GAP-053 CLOSED; GAP-054 CLOSED; GAP-055 OPEN;
     GAP-056 OPEN; GAP-057 CLOSED; GAP-058 OPEN; GAP-059 OPEN.

2.6  The Stage 1 report is unchanged in Stage 2. VERIFY by hash.

STAGE 2 COMMIT EXACTLY
Link Phase 3-R2-H1 traversal correction evidence

==================================================
STAGE 2 GATE — HARD STOP
==================================================

Return: Stage 0/1/2 full SHAs; the 1.1 reproduction pair verbatim; the
disposition manifest; every reviewed terminal entry with its structural
reason and falsification test name; every H1-F result, especially H1-F1,
H1-F2 and H1-F7; every npm run check attempt; final states; src/ diff scan;
clean-tree result.

Then a FRESH Executor B re-runs Phase 3-R1 Stage 3 in full from the Stage 2
HEAD, per the R1 contract's Stage 3 section, receiving no R2-H1 transcript.
Its A-F19 MUST include BOTH the AuthorizePreparedChangeOptions case AND an
adversarially named case of its own choosing — not one from this contract.

If COMPLETE: Executor C performs R1 Stage 4A/4B. If NOT COMPLETE: its finding
governs.

==================================================
REQUIRED FINAL ENGINEERING REPORT
==================================================

Return one report:

PATH CODE — PHASE 3-R2-H1
COMPLETE PUBLIC PARAMETER-GRAPH TRAVERSAL REPORT

Overall:
PASS / FAIL

Starting HEAD:
c60c78254ce273235921694faac57ec5e4a30d5f

Stage 0:
- commit:
- contract artifact path and SHA-256:
- exact original naming gate:
- baseline public root count:
- GAP-057 prior closure preserved:
- GAP-057 reopened:
- GAP-059 ID/duplicate check:
- GAP-059 classification:
- capability states unchanged:
- ledger:verify:
- working tree:

Stage 1:
- implementation/evidence commit:
- pre-correction reproduction with input:
- same fixture with options:
- exact restoration hashes:
- canonical analyzer file/symbol:
- naming/type/file gates removed:
- exact disposition vocabulary:
- discovered root count:
- manifested root count:
- node/disposition count:
- repeated-root/overload result:
- cycle result:
- external type-argument policy:
- reviewed terminal registry:
  [one row per entry: canonical identity / declaration / reason / contract /
   generic policy / falsification]
- PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS:
- TypeScript Program construction count:
- focused analyzer runtime:
- H1-F1:
- H1-F2:
- H1-F3:
- H1-F4:
- H1-F5:
- H1-F6:
- H1-F7:
- prior R2 probes preserved:
- any falsification errored before intended failure:
- committed src/** changes:
  MUST BE NONE
- complete report path:
- report SHA-256 at Stage 1:

Stage 2:
- linkage commit:
- GAP-057 closure commit/evidence:
- GAP-057 prior closure history retained:
- GAP-057 removed from capability limitations:
- GAP-058:
- GAP-059:
- Stage 1 report hash unchanged:
- final capability states:
- final gap states:
- gap:render:
- ledger:verify:

Validation:
- baseline runtime tests:
- final runtime tests:
- test-file count:
- typecheck:
- tests:
- build:
- cli smoke:
- every npm run check attempt:
  [attempt / result / duration / timeout files / assertion failures / host load]
- isolation results:
- runtime dependencies:
- analyzer performance:
- one write-module invariant:
- src diff scan:
- working tree:
- push:
  NO

Architecture:
- discovery root:
- every exported callable derived:
- every signature/parameter derived:
- named re-exports:
- aliases/interfaces/extends:
- unions/intersections:
- arrays/tuples/type arguments:
- overloads:
- repeated roots:
- cycle handling:
- external library boundary:
- reviewed-terminal identity:
- generic terminal safety:
- manifest/findings separation:
- no hidden skip disposition:
- no hardcoded public type/function/file list:
- canonical analyzer shared by guard/proofs:

Historical evidence:
- c60c782 NOT COMPLETE preserved:
- 4aadb06/8520ab9 first GAP-057 closure preserved:
- immutable false hardening-report line disposition:
- no historical report edited:

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

If PASS:

Phase 3-R2-H1:
COMPLETE / FROZEN

GAP-057:
CLOSED

safe-editing:
IMPLEMENTED

Next permitted operation:

FRESH INDEPENDENT EXECUTOR B
→ rerun Phase 3-R1 Stage 3 in full from Stage 2 HEAD

DO NOT START THAT RE-AUDIT IN THIS PASS.

==================================================
CHECKLIST — ANSWER EVERY LINE IN THE REPORT
==================================================

 1. Start HEAD exactly c60c782...?                                   MUST BE YES
 2. Start tree clean and required ancestors present?                  MUST BE YES
 3. GAP-059 ID unused and no duplicate broader timing gap exists?     MUST BE YES
 4. Exact R2 naming gate quoted with current file/line numbers?        MUST BE YES
 5. Baseline discovered-root count recorded, never used as constant?  MUST BE YES
 6. GAP-057 reopened with first closure preserved in notes?           MUST BE YES
 7. GAP-059 records the independent auditor's timing evidence?        MUST BE YES
 8. 1.1 input/NovelPublishSettings reproduces FINDINGS (0)?           MUST BE YES
 9. 1.1 same fixture renamed to options triggers the old guard?       MUST BE YES
10. Every temporary corruption restored under the correct path class? MUST BE YES
11. Any legitimate candidate work accidentally restored from HEAD?    MUST BE NO
12. Does traversal depend on any parameter name?                       MUST BE NO
13. Does traversal depend on any type-name pattern?                    MUST BE NO
14. Does traversal depend on any declaring file/path pattern?          MUST BE NO
15. Does traversal depend on a manual function/parameter/type list?    MUST BE NO
16. Does every public root occurrence have exactly one disposition?   MUST BE YES
17. Does every reached node have exactly one disposition?             MUST BE YES
18. Does any disposition mean skipped/ignored/not interesting?        MUST BE NO
19. Are findings separate from and linked to manifest dispositions?   MUST BE YES
20. Are repeated type uses manifested at every public root?           MUST BE YES
21. Are every overload/signature parameter and occurrence manifested? MUST BE YES
22. Can memoization/cycle handling make a later root disappear?        MUST BE NO
23. Is the reviewed-terminal registry keyed by canonical resolved
    original symbol/declaration identity rather than names?            MUST BE YES
24. Can an anonymous structural type become a reviewed terminal?       MUST BE NO
25. Are reviewed generic terminals prevented from hiding type args?   MUST BE YES
26. Is every reviewed terminal entry contract-cited and falsified?    MUST BE YES
27. Were wildcard/regex/module/directory-wide terminal entries used?   MUST BE NO
28. Was any classification tension resolved by narrowing the walk?     MUST BE NO
29. Was STOP AND REPORT used for any unclassifiable current root?       record
30. PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS remains empty?                MUST BE YES
31. Are arrays/tuples/generic containers traversed into element/type
    arguments before an external/reviewed terminal boundary?           MUST BE YES
32. Are Buffer/Uint8Array and external member graphs bounded without
    hiding project-owned type arguments?                               MUST BE YES
33. H1-F1 names function/signature/parameter/type/member/sub-member?   MUST BE YES
34. H1-F2 fails across all adversarial names and container cases?      MUST BE YES
35. H1-F3 proves root/node/reuse/overload/cycle completeness?          MUST BE YES
36. H1-F4 preserves all R2/A-F19 cases and generic-smuggling proof?    MUST BE YES
37. H1-F5 removes and falsifies every reviewed terminal entry?        MUST BE YES
38. H1-F6 passes every legitimate input for a structural reason?      MUST BE YES
39. H1-F7 restores exact bad gate and makes adversarial roots escape?  MUST BE YES
40. Did any falsification error/time out before intended failure?      MUST BE NO
41. Was any probe deleted/weakened, including R2 2-F1..2-F7?          MUST BE NO
42. Did unconditional traversal find a real unseeded mechanism shape? MUST BE NO
43. One canonical analyzer path for guard and all proofs?              MUST BE YES
44. One Program/TypeChecker per real analyzer invocation?              MUST BE YES
45. Any Program construction per root/node/disposition?                MUST BE NO
46. Runtime dependencies still 0?                                      MUST BE YES
47. Any src/** change committed?                                       MUST BE NO
48. Every npm run check attempt and isolation run recorded honestly?   MUST BE YES
49. At least one full unchanged check passed within the bounded policy? MUST BE YES
50. Any assertion/compiler/build/CLI/ledger failure in a check attempt? MUST BE NO
51. Stage 1 report complete at Stage 1 and byte-identical in Stage 2?  MUST BE YES
52. GAP-057 CLOSED against Stage 1 with that report?                   MUST BE YES
53. GAP-058 and GAP-059 OPEN and unattached?                           MUST BE YES
54. safe-editing IMPLEMENTED; four components PASS_FROZEN?             MUST BE YES
55. Any closure artifact created or Stage 4/re-audit started?          MUST BE NO
56. Any historical report/commit edited?                              MUST BE NO
57. Pushed or remote created?                                          MUST BE NO
58. Executor A audited its own correction?                             MUST BE NO
59. Could material work be removed while preserving the proof?         If YES, simplify
60. Any contradiction with a frozen Master/Constitution?              MUST BE NO

==================================================

NOT VALIDATED — MUST BE NON-EMPTY
==================================================

- the correction is not independently audited here; a fresh executor re-runs
  R1 Stage 3 in full
- package-root callable-surface coverage not implemented (GAP-058)
- full-suite timing instability recorded, not corrected (GAP-059)
- hostile casts and cast-read forms remain the runtime P4 layer's
  responsibility (GAP-005, F-R1-002)
- auditor independence ASSERTED, not mechanically proven (GAP-055)
- the reviewed terminal registry is a reviewed allowlist; its safety rests on
  each entry's cited reason and falsification, not on the walker
- the false statement in hardening report §9 remains in that immutable report
- single host; no live Windows validation (GAP-002)
- residual filesystem races remain (GAP-035/036/037/044/045)
- no rollback, no delete, no directory creation
- Foundation §10 audit not run; Phase 4 absent
- a guard that traverses every declared public graph is not a proof that no
  authority can leak; it is a proof that every declared public graph is
  inspected

==================================================
GIT
==================================================

Every commit from 696ef4f through c60c782 remains an ancestor. Nothing is
rewritten. Three new local commits:

Stage 0   Record Phase 3-R2-H1 parameter-graph traversal finding
Stage 1   Complete public parameter-graph traversal without naming gates
Stage 2   Link Phase 3-R2-H1 traversal correction evidence

No amend, rebase, squash, push, or remote. After every commit: HEAD, status,
ancestry, ledger:verify — recorded.

==================================================
AFTER THIS PASS
==================================================

1. Fresh Executor B: full Phase 3-R1 Stage 3 from the Stage 2 HEAD.
2. If COMPLETE: Executor C, R1 Stage 4A/4B, Phase 3 closes.
3. Foundation §10 Closed-Vocabulary & Extensibility Audit.
4. Phase 4 Master — addressing GAP-055 before any audit relies on mechanically
   proven independence, and GAP-059 before Phase 4 adds compiler and test
   execution on top of a suite that already times out under load.

No Phase 4 implementation.
