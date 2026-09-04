PATH CODE — PHASE 3-R2
PUBLIC AUTHORITY-SURFACE GUARD DERIVATION
CORRECTIVE CONTRACT — FINAL MERGED

REPOSITORY
/Users/achahbi/Projects/path-code

REQUIRED STARTING HEAD
ecda537f87ca63584fffe46bba67c6009def4219

THIS CONTRACT IS A REPOSITORY ARTIFACT

Per Foundation Extensibility Constitution V1 §9, commit this exact contract as:

docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md

inside the Stage 0 commit of this pass.

The contract is the instruction. The report is what happened. Both are
evidence. Do not rewrite this contract after Stage 0. If a recovery materially
changes the governing instruction, write a separate supplement beside it.

GOVERNING BALANCE

This is one bounded correction with a known shape. The preflight at
ecda537 established the defect class, the blast radius, and the smallest
structural fix. Nothing further needs discovery. Run it in one pass, stop at
the gate, hand off.

==================================================
WHY THIS PASS EXISTS
==================================================

The Phase 3-R1 independent Stage 3 re-audit returned:

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE

Sole blocking finding, F-R1-001:

authorizePreparedChange is exported from the public editing barrel and is the
subsystem's authority-issuing function. Its options type,
AuthorizePreparedChangeOptions, is declared in src/editing/types.ts and
re-exported by name from src/editing/index.ts. The standing public
authority-surface guard hardcodes three option types and three source files
and never opens types.ts. The auditor added

  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };

to that type. The standing guard passed 5/5, the P1–P14 suite passed 9/9, and
all 612 tests passed.

There is no active leak. AuthorizePreparedChangeOptions currently holds only
{ gitContext?: GitStateBaseline }. The defect is absent standing detection on
the authority-issuing surface.

The read-only preflight at ecda537 established:

- P2 is identical across the hardening contract §5.2 and R1 Stage 3 §3.4:
  "Every public function's complete parameter/options surface is represented
  in the standing manifest/test."
- Amendment 1 §4 C requires a deterministic public callable-surface manifest
  containing every public function's parameters and relevant user-defined
  option properties; §4 D requires failure on an unreviewed public
  parameter/property carrying a user-defined call signature or an
  operation / adaptor / bindings / executor / loader / reader / writer /
  verifier shape.
- The implemented guard performs no export-driven function census, no
  recursive project type graph, no re-export resolution, and no .d.ts
  program. It matches regexes against three hardcoded type names in three
  hardcoded files.
- Of four *Options types in the editing barrel, three are covered shallowly
  and one — the authority-issuing one — is not covered at all.
- No active leak exists anywhere in the census.

PRIMARY ORIGIN: IMPLEMENTATION
The frozen governing text already required complete derived coverage. The
guard implements an enumerated subset.

CONTRIBUTING ORIGIN: EVIDENCE
Hardening report §9 records the deferral as scoped to surfaces "beyond the
Phase 3 editing option types already guarded." That statement is false for
AuthorizePreparedChangeOptions, which is a Phase 3 editing option type that is
not guarded. The false line is why the omission survived the first audit. It
is report metadata, not an immutable coverage limit, and this pass corrects
the record without altering the historical report.

Origins are descriptive report metadata under Constitution V1. Do NOT add a
Gap Ledger schema field or classification value for origin.

==================================================
GOVERNING SOURCES — ORDER OF AUTHORITY
==================================================

1. docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md
2. docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md
3. docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md
4. docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md
5. docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md at ecda537
6. the canonical Capability Ledger and Gap Ledger at the required baseline
7. this exact R2 contract

The operator-approved read-only R2 preflight is incorporated into this contract
as factual design input. It is not a substitute for repository evidence.

If this contract conflicts with a higher governing source:

STOP AND REPORT.

Do not reinterpret the source, widen scope, or choose a convenient resolution.

==================================================
OPERATOR DECISIONS — ALREADY MADE, DO NOT RE-DERIVE
==================================================

D1  GAP-057 reviewClassification = BLOCKING_INVARIANT.
    Primary origin IMPLEMENTATION, contributing EVIDENCE.
    Attach to safe-editing.knownLimitations AND
    edit-contracts.knownLimitations.

D2  SCOPE IS THE EDITING BARREL. The derived walker's public-surface source of
    truth for this pass is src/editing/index.ts. package.json exports only
    "." and src/index.ts does not re-export editing, so the package root is
    not the surface where this defect lives. Amendment 1 A/B would permit
    expanding to the package root; that expansion is recorded as GAP-058 and
    is NOT implemented here. Do not grow this pass into it.

D3  NO COMPONENT DOWNGRADE. There is no active leak. The four mutation
    capabilities keep freezeEvidence and remain PASS_FROZEN. safe-editing
    remains IMPLEMENTED and is not promoted by this pass.

D4  F-R1-002 (cast-read form detected only by the P4 runtime proof) is
    governed by GAP-005 (ACCEPTED_PERMANENT hostile casts). No new gap. Do not
    expand the declaration guard toward defeating arbitrary hostile casts.

D5  THE THREE ALREADY-COVERED TYPES ARE FOLDED INTO THE DERIVED WALKER. They
    are not left on the old mechanism. Once discovery is derived, shallow
    coverage is replaced by the same recursive path, and the false-positive
    control must prove gitContext still passes.

==================================================
WHAT THIS PASS DOES NOT DO
==================================================

- NO committed changes under src/. This is a tests/ and tooling correction.
  The only permitted src/ edits are the exact temporary, contract-required
  corruptions in §1.1 and 2-F1. Each must be hash-restored before any commit.
- NO changes to authorization semantics, ActionClass, or any evidence tier
- NO Gap Ledger or Capability Ledger schema change
- NO rewrite, amend, rebase, squash, or removal of any historical commit
- NO deletion or weakening of any existing probe, falsification, or
  mechanism test
- NO promotion of safe-editing, NO closure artifact, NO Stage 4
- NO re-audit — this pass implements; a fresh executor audits
- NO Foundation §10 audit, NO Phase 4 Master, NO Phase 4 implementation
- NO push, NO remote

Every repository change is additive to history.

==================================================
NO-UNTRACKED-FINDING RULE
==================================================

Every genuine finding discovered in this pass MUST end in exactly one of:

1. corrected and durably closed by immutable evidence in this pass;
2. OPEN in the canonical Gap Ledger with classification, missing evidence, and
   closure condition; or
3. proven to be an already-recorded frozen limitation, cited exactly.

Nothing disappears into prose, a terminal transcript, or an executor summary.

If the derived walker discovers a mechanism-shaped member on a public surface
that is NOT AuthorizePreparedChangeOptions, that is a new active finding.
STOP AND REPORT. Do not correct it inside this pass.

==================================================
FAILURE / NOT-COMPLETE PROTOCOL
==================================================

If any gate after Stage 0 fails:

1. stop immediately;
2. restore every temporary corruption under §1.5;
3. remove all incomplete candidate implementation changes unless the governing
   contract requires an exact durable artifact to explain the finding;
4. verify no src/ change remains;
5. preserve every genuinely new finding in the canonical Gap Ledger and
   PHASE_3_R2_CORRECTION_REPORT.md;
6. commit only the durable finding/report/gap artifacts, never a partial guard,
   with exact subject:

   Record Phase 3-R2 guard correction finding

7. leave GAP-057 OPEN, safe-editing IMPLEMENTED, all component freeze evidence
   unchanged, and stop.

A known implementation attempt that simply fails to satisfy the contracted
proof does not become a new architecture gap automatically. Record the failure
in the report and stop. A newly discovered false assumption or public surface
does require a gap under the No-Untracked-Finding Rule.

Do not continue from a failed executor's reasoning context.

==================================================
BASELINE GATE
==================================================

Run and record:

git rev-parse HEAD
git status --porcelain
git log -1 --oneline
npm run ledger:verify
npm run check

Required:
- HEAD exactly ecda537f87ca63584fffe46bba67c6009def4219
- working tree empty
- ledger:verify PASS

Verify each ancestor exits 0:

git merge-base --is-ancestor 696ef4fe58c21cdd527869309a2b9fd5abcd19a8 HEAD
git merge-base --is-ancestor 5386f349eccd7c69ff696619ffc426757e3e91d0 HEAD
git merge-base --is-ancestor 63f6e87cf199b3b551196be09a486b81da2860dd HEAD

Verify:
- docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md exists and contains
  the exact NOT COMPLETE result line
- GAP-057 and GAP-058 are unused. If either ID is occupied, STOP AND REPORT.
  Do not silently renumber.
- safe-editing derives IMPLEMENTED
- the four mutation capabilities derive PASS_FROZEN
- Phase 4 absent

Record the runtime test total at baseline. Expected 612. VERIFY.

==================================================
FOUNDATION COMPATIBILITY PREFLIGHT
==================================================

Per Constitution V1 §2 sub-pass rule:

FOUNDATION COMPATIBILITY PREFLIGHT inherited; no new foundational concept
introduced.

This corrective pass consumes only mechanisms already frozen by Amendment 1,
Gap Ledger v1, and Self-Observation. It introduces no new foundation vocabulary
and requires no foundation amendment.

Pass-writer compliance under Constitution V1 §5:

- the defect is reproducible before correction;
- the correction mechanism is fully specified;
- every load-bearing MUST has a test, mechanical check, or named
  falsification;
- every falsification names its corruption and expected failure;
- NOT VALIDATED is non-empty;
- every requirement is traceable to a governing source above.

HISTORICAL REPORT CORRECTION DISPOSITION

The repository has no mechanism for mutating or amending an immutable historical
report in place.

Therefore this pass MUST NOT edit:

docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md

Its false §9 statement remains immutable historical evidence. The correction is
recorded in:

- GAP-057's description;
- docs/reports/PHASE_3_R2_CORRECTION_REPORT.md;
- the R2 commit chain.

This is a disposition under existing evidence/history rules, not a new
Foundation Compatibility Preflight result and not a new report-amendment
mechanism.

==================================================
EXECUTOR ASSIGNMENT — BINDING
==================================================

EXECUTOR A (this pass, Stages 0–2)
The correction implementer. May be the Cursor session that performed the R2
preflight. MUST NOT be the Claude Code session that authored the R1 Stage 3
finding.

FUTURE EXECUTOR B (not this pass)
The re-audit executor. MUST be a completely fresh session that did not
implement R2 and receives no R2 implementation transcript. The Claude Code
session that authored the R1 finding at ecda537 is disqualified — it has
written into this chain. A fresh session of any product qualifies by the
letter of the rule; a different product is preferred.

HARD INDEPENDENCE RULE
An executor that did not START a stage may not FINISH it.

If Executor A fails mid-stage:

- stop;
- restore only the exact temporary corruption required by the contract;
- leave the repository at the last clean committed stage HEAD;
- record only minimal failure metadata: stage, attempt number, failure class,
  last clean HEAD, and whether any uncommitted files remain;
- dispatch a new Executor A from that clean HEAD with this committed contract
  and the minimal failure metadata only.

No failed-context reasoning transcript is transferred.

This pass STOPS at the Stage 2 gate. It does not audit its own correction.

==================================================
STAGE 0 — RECORD GAP-057 AND GAP-058
==================================================

Executor A. Record first, correct second.

0.1  Create docs/reports/PHASE_3_R2_CORRECTION_REPORT.md. Section §0 records:
     - F-R1-001 as established by the R1 audit at ecda537, with the exact
       auditor corruption and the exact missed behavior
     - the exact P2 text and Amendment 1 §4 C/D text, quoted
     - the exact current guard mechanism: files, symbols, the three hardcoded
       type names and their three hardcoded source files
     - the AuthorizePreparedChangeOptions re-export trace
       (index.ts → types.ts) and why the guard never opens it
     - the full public editing census from the preflight
     - the false statement in hardening report §9 and its disposition
       (recorded here; the historical report is not edited)
     - origin: IMPLEMENTATION primary, EVIDENCE contributing

0.2  Append to the Gap Ledger, proposedClass populated,
     reviewClassification set per D1 (the operator has already reviewed):

     GAP-057
     title: Standing public authority-surface guard omits
            AuthorizePreparedChangeOptions and does not derive complete
            public parameter coverage
     proposedClass: BLOCKING_INVARIANT
     reviewClassification: BLOCKING_INVARIANT
     lifecycle: OPEN
     sourceCheckpoint: Phase 3-R1 Stage 3 independent re-audit at ecda537
     description: authorizePreparedChange is exported from the public editing
       barrel and issues authorization. Its options type is declared in
       src/editing/types.ts and re-exported by name. The standing guard
       hardcodes three option types in three files, performs no export-driven
       census and no recursive type-graph traversal, and never inspects that
       type. An authority-bearing callable member added to it was not
       detected by the guard, the P1–P14 suite, or the full test suite.
       Hardening report §9 recorded the standing-guard deferral as scoped
       "beyond the Phase 3 editing option types already guarded", which is
       false for this type and masked the omission during the first audit.
     missingEvidence: export-driven public-surface discovery; named
       re-export resolution; recursive cycle-safe project type-graph
       traversal; detection of the auditor's exact authorityOps corruption;
       detection of an unlisted future public options type; preserved
       legitimate data/context; immutable corrective evidence
     closureCondition: the standing guard derives its coverage from the
       complete supported public editing surface rather than an enumerated
       list; follows named re-exports and project-defined parameter graphs;
       fails on the auditor's corruption naming the function, the type and
       the member; fails on a new unlisted public options type; passes
       legitimate data and context; every falsification corrupts, fails for
       the intended reason, restores exactly, and passes
     notes: no active leak at ecda537 — the type holds only
       { gitContext?: GitStateBaseline }. The defect is absent standing
       detection. Component capabilities are not downgraded.

     GAP-058
     title: Derived public-surface guard covers the editing barrel only, not
            the package root
     proposedClass: NON_BLOCKING_LIMITATION
     reviewClassification: NON_BLOCKING_LIMITATION
     lifecycle: OPEN
     sourceCheckpoint: Phase 3-R2 correction at the Stage 0 commit
     description: Amendment 1 A/B permit a package-root callable-surface
       manifest. This pass scopes the derived walker to src/editing/index.ts,
       where the authority surface and the finding live. package.json exports
       only "." and src/index.ts does not re-export editing, so no editing
       surface is reachable through a supported package subpath today.
     whyNonBlocking: the omitted scope contains no authority-bearing surface
       reachable by a package consumer at this checkpoint; the editing barrel
       is where authority is issued and mutation is performed
     missingEvidence: a derived manifest rooted at package.json exports and
       src/index.ts, with the same detection rules
     closureCondition: the derived walker is rooted at the supported package
       exports in addition to the editing barrel, with falsifications proving
       coverage of both roots

0.3  Attach GAP-057 to safe-editing.knownLimitations AND
     edit-contracts.knownLimitations. Do not attach GAP-058 to any capability.

0.4  Run:

     npm run gap:render
     npm run ledger:verify
     npm run check

     All MUST PASS. If npm run check encounters only the already-recorded
     unconstrained-worker timeout shape, apply the honest retry protocol in
     §1.7 and record both outcomes.

     VERIFY and record that all seven derived capability states are unchanged
     from baseline. This stage changes no derived state.

0.5  Commit this contract as
     docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md in the
     same commit.

STAGE 0 COMMIT EXACTLY
Record Phase 3-R2 public surface guard findings

==================================================
STAGE 1 — DERIVED GUARD IMPLEMENTATION
==================================================

Executor A. The correction. Tests and tooling only — nothing under src/.

1.1  PRE-CORRECTION FAILURE-TO-DETECT EVIDENCE — do this FIRST, before any
     guard change.

     Apply the auditor's exact corruption to
     src/editing/types.ts:AuthorizePreparedChangeOptions:

       readonly authorityOps?: { readonly issue: (input: unknown) => unknown };

     Run the existing standing guard suite and the P1–P14 suite. Capture the
     output verbatim. Expected: both PASS — the defect reproduced at the R2
     baseline by this executor, not merely cited from the R1 report.

     Before corruption record:

     git hash-object src/editing/types.ts
     git status --porcelain

     Restore with:

     git restore --source=HEAD -- src/editing/types.ts

     Then verify:

     git hash-object src/editing/types.ts
     git diff --exit-code -- src/editing/types.ts
     git status --porcelain

     The pre- and post-corruption blob hashes MUST match and the diff/status
     MUST be empty.

     If the existing guard FAILS on this corruption, the finding does not
     reproduce. STOP AND REPORT. Do not proceed.

     This is one of exactly two permitted temporary src/ corruptions in this
     pass. The other is 2-F1 after correction. No src/ change may be committed.

1.2  IMPLEMENT THE DERIVED WALKER.

     Source of public-surface truth:

     src/editing/index.ts as a resolved TypeScript module export surface.

     Discovery MUST be driven by a TypeScript Program / TypeChecker (or an
     already-existing repository mechanism proven equivalent), not by a manual
     function list, type-name list, source-file list, regex-only export list, or
     filename convention.

     Minimum resolution algorithm:

     - load the repository TypeScript program using the existing tsconfig
       architecture;
     - resolve src/editing/index.ts as a module;
     - obtain the complete exported symbol set through the TypeChecker;
     - resolve aliases to their declarations;
     - include named re-exports, aliases, and export-star chains;
     - select exported callable values/functions;
     - enumerate every call signature and every declared parameter;
     - for each parameter, traverse the recursively reachable project-defined
       type graph:
         type aliases;
         interfaces and extends chains;
         nested object members;
         unions;
         intersections;
         tuples/arrays only to their project-defined element types;
         generic wrappers actually present on the supported surface;
     - resolve index.ts → types.ts for AuthorizePreparedChangeOptions;
     - remain cycle-safe through a visited set keyed by resolved symbol/type
       identity;
     - stop at non-project symbols. TypeScript lib and @types/node types
       (including Buffer and Uint8Array method graphs) are boundaries, not
       traversal roots. A project-defined wrapper that contains such data is
       still inspected at its own members;
     - produce a deterministic manifest sorted with a locale-independent stable
       comparator by export, signature, parameter, type path, and member path.

     DETECTION SEMANTICS

     This pass corrects discovery coverage. It does not invent a new authority
     vocabulary.

     Apply the exact Amendment 1 §4 D detection rules and the existing approved
     exception model to every derived surface:

     - unreviewed user-defined call signatures;
     - operation / adaptor / adapter / bindings / executor / loader / reader /
       writer / verifier or equivalent frozen mechanism-substitution shapes;
     - direct or recursively reachable authority-bearing callable members.

     unknown, any, rest parameters, and index signatures are handled exactly as
     Amendment 1 and the current approved-exception policy require. If a case
     cannot be classified from frozen text, STOP AND REPORT origin CONTRACT or
     FOUNDATION. Do not invent a broad ban merely to make the suite green.

     The TypeScript compiler API is already a devDependency.
     Runtime dependencies MUST remain 0.

     Implement one canonical analyzer path, preferably in a small
     tests/architecture/ helper or scripts/lib/ tooling module. The standing
     guard and every permanent proof MUST call that exact analyzer. A duplicate
     analyzer or a test-only rule that production standing checks do not call is
     not evidence.

1.3  RETIRE THE ENUMERATED MECHANISM. The three hardcoded option type names
     and three hardcoded source files are removed as the discovery source and
     the three types are covered by the derived walker instead. Existing
     barrel-source regex bans (fsOps / targetOps / WithDependencies) may be
     retained as a cheap additional check but MUST NOT be the coverage
     mechanism. Record what was removed and what was kept.

1.4  EXCEPTION MODEL. PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS remains explicit
     and stays empty unless the walker proves an entry is required. Each entry
     is scoped to function + parameter + member, and carries a governing
     contract reference, a reason, and a targeted test. Wildcards FAIL. If the
     walker requires an exception to pass, that is a finding — STOP AND
     REPORT rather than adding one to make the suite green.

1.5  TEMPORARY CORRUPTION RESTORATION PROTOCOL.

     Before every corruption, distinguish:

     A. BASELINE FILE
        A tracked file with no intended R2 candidate change, such as
        src/editing/types.ts.

        Record its blob hash. Restore only that path from HEAD. Verify:
        - the post-restore blob hash equals the pre-corruption hash;
        - git diff --exit-code -- <that path> passes.

     B. CANDIDATE FILE
        A tooling/test file that already contains intended uncommitted Stage 1
        work.

        Do NOT restore it from HEAD, because that would erase the candidate
        correction. Before corruption:
        - record the candidate file hash;
        - save an exact temporary copy outside the repository or use another
          exact byte-preserving restoration method;
        - after the focused failure, restore the candidate bytes;
        - verify the restored hash equals the pre-corruption candidate hash;
        - verify no residual corruption remains beyond the intended Stage 1
          diff.

     C. ISOLATED FIXTURE
        Remove the temporary fixture/root completely and verify no tracked or
        untracked residue remains in the repository.

     A whole-tree empty diff is expected only when no intended Stage 1 candidate
     work exists. During implementation, "restored" means no residual
     corruption beyond the intentional candidate diff.

1.6  REQUIRED PROOF AND FALSIFICATION MATRIX.

     Every new test that carries a standing-coverage conclusion MUST be shown
     capable of failing.

     For every live corruption:

     exact clean source/fixture or candidate hash
     → apply only named corruption
     → run focused test
     → capture exact failure
     → confirm intended reason
     → restore exact pre-corruption state under §1.5
     → verify no residual corruption
     → focused PASS.

     A falsification that errors before the intended assertion has produced NO
     evidence and triggers STOP AND REPORT.

     2-F1  AUTHORIZE OPTIONS REGRESSION — REAL SURFACE

           After the derived guard exists, temporarily add the auditor's exact
           authorityOps member to the real
           AuthorizePreparedChangeOptions in src/editing/types.ts.

           Before and after, record the file blob hash.

           The standing guard MUST FAIL and MUST name:

           - authorizePreparedChange;
           - AuthorizePreparedChangeOptions;
           - authorityOps;
           - the resolved public parameter/member path.

           Restore only src/editing/types.ts from HEAD, prove identical blob
           hash, path-scoped empty diff, and focused PASS. Intended Stage 1
           tooling/test changes may remain elsewhere.

           This is the second and final permitted temporary src/ corruption.

     2-F2  FUTURE PUBLIC FUNCTION AUTO-DISCOVERY

           Using an isolated temporary TypeScript fixture project that invokes
           the same canonical analyzer, add a new public editing-style function
           with a newly named options type containing an unreviewed
           mechanism-substitution callback.

           Add that type name to NO manifest or list.

           The analyzer/standing test MUST discover the function automatically
           and fail naming the function, options type, and member.

           Remove the fixture corruption and PASS.

     2-F3  NAMED RE-EXPORT

           In an isolated fixture using the same analyzer, declare an options
           type in a different module and re-export it by name through the public
           barrel, then expose a function accepting it.

           Seed an unreviewed callable member.

           The guard MUST follow the re-export and fail naming the declaration
           chain. Remove corruption and PASS.

     2-F4  RECURSIVE PROJECT TYPE GRAPH

           Through isolated fixtures using the same analyzer, prove traversal
           for every supported shape required by the contract:

           - nested project-defined object;
           - type alias;
           - extended interface;
           - union;
           - intersection;
           - relevant generic wrapper where actually supported.

           Each seeded mechanism member MUST be reached and reported.
           Each corruption is removed and the focused test returns PASS.

     2-F5  FALSE-POSITIVE BOUNDARY

           Positive controls MUST PASS for:

           - gitContext?: GitStateBaseline on all four options types;
           - PreparedChange / PreparedMutation / PreparedCreation;
           - EditAuthorization;
           - MultiFilePlan;
           - ResolvedProjectConfig;
           - Buffer / Uint8Array-bearing parameters and project wrappers.

           The analyzer MUST stop at external/library symbols rather than walk
           Buffer or Node method graphs.

           Falsifiability uses a bounded isolated fixture, not the full Node
           declaration graph:

           - create a synthetic external .d.ts package containing callable
             methods;
           - prove the analyzer treats that external symbol as a boundary;
           - temporarily corrupt only the external/project ownership decision
             for that fixture;
           - the false-positive boundary test MUST fail by surfacing the
             synthetic external callable noise.

           Restore the exact candidate analyzer bytes under §1.5 B and PASS.

           Real Buffer/Uint8Array controls must also remain green.

     2-F6  APPROVED EXCEPTION MODEL

           The canonical PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS list remains
           empty.

           Test the analyzer with synthetic fixture configuration:

           - one exact function + parameter + member exception, carrying
             governing contract, reason, and targeted-test identity, permits
             only that exact member;
           - a wildcard, missing rationale, missing targeted test, broader
             parameter, or sibling member remains rejected.

           No real exception is added merely to make the current repository
           pass.

     2-F7  STRUCTURAL LEGACY-MECHANISM FALSIFICATION

           Temporarily replace only the canonical analyzer/discovery entrypoint
           used by the standing guard with the legacy enumerated-three-type
           discovery shape.

           Under that corruption:

           - the 2-F1 regression test MUST fail because the guard returns no
             finding for authorityOps on AuthorizePreparedChangeOptions;
           - the 2-F2 auto-discovery test MUST fail because the unlisted future
             public function/options type is absent from the enumerated set;
           - the structural completeness assertion MUST report that public
             callable coverage is incomplete.

           Capture the exact failed assertions.

           Restore the exact pre-corruption derived-analyzer candidate bytes
           under §1.5 B. All focused tests PASS.

           This proves a class correction rather than a fourth hardcoded name.

1.7  FULL GATE. npm run typecheck, npm test, npm run build, npm run cli:smoke,
     npm run ledger:verify, npm run check. Record exact totals.

     npm run check is known to flake on two unconstrained-worker timeouts
     (git-snapshot-membership, reader/adversarial) — a recorded existing
     limitation. If it fails on those and only those, re-run once, run the two
     files in isolation, and record BOTH outcomes honestly. Do not represent a
     second-attempt pass as a single clean run. Any other failure is a real
     failure — STOP AND REPORT.

1.8  Verify the candidate Stage 1 diff against the Stage 0 HEAD.

     Required:

     - NO path under src/ changed;
     - no historical report changed;
     - no existing probe/falsification was deleted, skipped, weakened, or
       rewritten merely to agree with the new analyzer;
     - only the smallest tests/tooling/report files required by R2 changed.

     Record exact git diff --name-status and the src/ diff scan.

1.9  COMPLETE THE IMPLEMENTATION REPORT BEFORE COMMIT.

     Update docs/reports/PHASE_3_R2_CORRECTION_REPORT.md so the Stage 1
     implementation commit already contains the complete correction evidence.

     The report begins with:

     PATH CODE — PHASE 3-R2
     PUBLIC AUTHORITY-SURFACE GUARD CORRECTION REPORT

     Implementation Result:
     PASS / NOT COMPLETE

     The report records:

     - Stage 0 finding/gap record;
     - pre-correction failure-to-detect evidence from §1.1 verbatim;
     - implemented analyzer design: export source, TypeScript Program/Checker
       resolution, re-exports, recursive graph, cycles, library boundary,
       detection policy, exceptions, unknown/any/rest/index disposition,
       determinism;
     - exact files changed;
     - what legacy enumerated discovery was removed and which cheap regex checks
       were retained;
     - every 2-F1 through 2-F7 corruption, exact failure, intended reason,
       restoration proof, and final PASS;
     - complete derived public editing manifest compared with the preflight
       census;
     - F-R1-002 disposition to GAP-005;
     - GAP-058 scope decision;
     - baseline and Stage 1 test totals;
     - dependency count;
     - src/ and historical-report diff scans;
     - npm run check attempt history, including any timeout retry;
     - non-empty NOT VALIDATED.

     NON-CIRCULARITY:

     The report MUST NOT contain the future Stage 1 commit SHA.
     State that the implementation SHA is intentionally absent and will be
     bound by Stage 2.

STAGE 1 COMMIT EXACTLY
Derive public authority-surface guard coverage from the editing barrel

The Stage 1 commit contains:

- analyzer/tooling correction;
- permanent tests;
- complete PHASE_3_R2_CORRECTION_REPORT.md;
- no Gap closure/linkage yet;
- no src/ changes.

==================================================
STAGE 2 — EVIDENCE LINKAGE
==================================================

Executor A. The immutable Stage 1 implementation/report commit now exists and
can be cited without self-reference.

2.1  Verify the Stage 1 report exists at the Stage 1 commit and already contains
     the complete correction evidence required by §1.9.

     Do NOT rewrite, expand, or post-hoc polish that report in Stage 2.

2.2  Close GAP-057:
     lifecycle CLOSED
     closedByCommit = Stage 1 full SHA
     closureEvidence = docs/reports/PHASE_3_R2_CORRECTION_REPORT.md
     notes: preserve that the defect was reproduced at the R2 baseline before
     correction; that the hardening report §9 statement remains false in that
     immutable report and is corrected here; that no active leak ever existed.

2.3  Remove GAP-057 from safe-editing.knownLimitations and
     edit-contracts.knownLimitations. GAP-058 remains OPEN and unattached.

2.4  Update self-observation citation SHA constants only as required to bind
     the Stage 1 commit. No other ledger change.

2.5  Before commit verify the Stage 2 working diff contains only:

     - Capability/Gap Ledger linkage fields required for GAP-057 closure;
     - self-observation SHA citation constants required to bind Stage 1;
     - deterministic docs/GAP_LEDGER.md render;
     - focused ledger/derivation test updates only if objectively required.

     It MUST contain:

     - no analyzer/tooling change;
     - no production/source change;
     - no historical report change;
     - no change to the complete Stage 1 R2 report.

     Run:

     npm run gap:render
     npm run ledger:verify
     npm run check

     All MUST PASS. Apply the honest timeout retry protocol only for the already
     recorded timeout shape and preserve both outcomes.

2.6  VERIFY and record the final state:

     edit-contracts                  PASS_FROZEN
     existing-file-replacement      PASS_FROZEN
     safe-file-creation              PASS_FROZEN
     multi-file-coordination         PASS_FROZEN
     safe-editing                    IMPLEMENTED — NOT promoted
     repository-intelligence         PHASE_VERIFIED
     foundation-kernel               PHASE_VERIFIED

     GAP-051 OPEN
     GAP-052 OPEN
     GAP-053 CLOSED
     GAP-054 CLOSED
     GAP-055 OPEN
     GAP-056 OPEN
     GAP-057 CLOSED
     GAP-058 OPEN

STAGE 2 COMMIT EXACTLY
Link Phase 3-R2 guard correction evidence

==================================================
STAGE 2 GATE — HARD STOP
==================================================

Executor A's work is complete. Executor A does not audit this correction and
does not proceed to any re-audit or closure stage.

Return to the operator:
- Stage 0, Stage 1, Stage 2 full SHAs
- the pre-correction failure-to-detect evidence
- every falsification result, especially 2-F7
- the derived public editing census
- final derived capability states and gap states
- runtime test totals, dependency count, src/ diff scan
- ledger:verify result, npm run check result including any re-run
- clean-tree result

The operator then dispatches a FRESH Executor B to re-run Phase 3-R1 Stage 3
in full from the Stage 2 HEAD, per the Stage 3 section of
docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md. That executor
receives the Stage 3 brief and the repository — no R2 implementation
transcript, no summary of this pass, and no expectation of what it should
conclude.

The re-audit's A-F19 MUST include the AuthorizePreparedChangeOptions case that
produced F-R1-001.

If that re-audit returns COMPLETE, Executor C performs R1 Stage 4A/4B closure.
If it returns NOT COMPLETE, its finding governs and a new corrective contract
is written.

==================================================
FINAL ENGINEERING REPORT — REQUIRED
==================================================

Return exactly one report:

PATH CODE — PHASE 3-R2
PUBLIC AUTHORITY-SURFACE GUARD CORRECTION REPORT

Overall:
PASS / FAIL

Starting HEAD:
ecda537f87ca63584fffe46bba67c6009def4219

Stage 0:
- commit:
- GAP-057:
- GAP-058:
- capability attachments:
- derived states unchanged:
- contract artifact path:
- ledger:verify:
- npm run check:

Stage 1:
- implementation/report commit:
- pre-correction defect reproduced:
- exact existing guard/P1–P14 outputs:
- source blob restoration:
- canonical analyzer path:
- TypeScript Program/Checker:
- derived public export count:
- derived function/signature/parameter manifest:
- named re-export resolution:
- recursive graph shapes:
- cycle handling:
- external/library boundary:
- detection semantics preserved:
- legacy mechanism removed:
- cheap checks retained:
- canonical approved exceptions:
- 2-F1:
- 2-F2:
- 2-F3:
- 2-F4:
- 2-F5:
- 2-F6:
- 2-F7:
- files changed:
- src/ committed changes:
  MUST BE NONE
- historical report changes:
  MUST BE NONE
- baseline runtime total:
- Stage 1 runtime total:
- runtime dependencies:
- npm run check attempts:
- report path:
- report future SHA omitted:

Stage 2:
- linkage commit:
- GAP-057 closedByCommit:
- GAP-057 closureEvidence:
- GAP-057 removed from knownLimitations:
- GAP-058 state:
- report unchanged from Stage 1:
- final capability states:
- final gap states:
- ledger:verify:
- npm run check:

Git:
- complete ancestry:
- Stage 0 HEAD:
- Stage 1 HEAD:
- Stage 2 HEAD:
- history rewritten:
  NO
- working tree:
- push:
  NO
- remote created:
  NO

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

If PASS:

Phase 3-R2 guard correction:
COMPLETE / FROZEN

GAP-057:
CLOSED

safe-editing:
IMPLEMENTED

Next permitted operation:

FRESH INDEPENDENT EXECUTOR B
→ rerun Phase 3-R1 Stage 3 in full from the Stage 2 HEAD

DO NOT START THE RE-AUDIT IN THIS PASS.

==================================================
CHECKLIST — ANSWER EVERY LINE IN THE REPORT
==================================================

 1. Start HEAD exactly ecda537...?                              MUST BE YES
 2. Start working tree clean?                                   MUST BE YES
 3. Required ancestors present?                                 MUST BE YES
 4. GAP-057 and GAP-058 unused at baseline?                      MUST BE YES
 5. Baseline runtime total recorded?                             MUST BE YES
 6. F-R1-001 reproduced against the unchanged ecda537 source blob before correction? MUST BE YES
 7. Was the temporary src/ corruption restored and verified?     MUST BE YES
 8. Any src/ change committed in any stage?                      MUST BE NO
 9. Is discovery derived from barrel exports, not a name list?   MUST BE YES
10. Are the original three types now covered by the walker?      MUST BE YES
11. Does traversal resolve named re-exports across modules?      MUST BE YES
12. Is traversal cycle-safe?                                     MUST BE YES
13. Are standard-library method graphs excluded?                 MUST BE YES
14. Do the standing guard and permanent proofs call one canonical analyzer path? MUST BE YES
15. Were any canonical approved exceptions added?                MUST BE NO
16. 2-F1 failed naming function, type and member?                MUST BE YES
17. 2-F2 discovered an unlisted new options type?                MUST BE YES
18. 2-F3 followed the named re-export?                           MUST BE YES
19. 2-F4 reached nested/alias/extends/union graphs?              MUST BE YES
20. 2-F5 passed legitimate data and context?                     MUST BE YES
21. 2-F6 proved exact synthetic exception scope and rejected wildcard/broad entries? MUST BE YES
22. 2-F7 proved legacy enumeration makes 2-F1, 2-F2 and completeness fail? MUST BE YES
23. Did any falsification error before its intended failure?     MUST BE NO
24. Was every corruption restored with no residual diff beyond intended candidate work? MUST BE YES
25. Runtime dependencies still 0?                                MUST BE YES
26. Was any existing probe or falsification deleted or weakened?  MUST BE NO
27. Did the walker find a mechanism shape other than the seeded ones? MUST BE NO
28. Was the complete correction report already present in the immutable Stage 1 commit? MUST BE YES
29. GAP-057 CLOSED against Stage 1 with that immutable report?   MUST BE YES
30. GAP-058 recorded and OPEN?                                   MUST BE YES
31. safe-editing still IMPLEMENTED, not promoted?                MUST BE YES
32. Four mutation capabilities still PASS_FROZEN?                MUST BE YES
33. Are GAP-053/054 CLOSED and GAP-051/052/055/056 OPEN?         MUST BE YES
34. Was any closure artifact created?                            MUST BE NO
35. Was npm run check reported honestly including re-runs?       MUST BE YES
36. Was any historical report or commit edited?                  MUST BE NO
37. Was the Stage 1 report unchanged during Stage 2?             MUST BE YES
38. Was Git pushed or a remote created?                          MUST BE NO
39. Did Executor A audit its own correction?                     MUST BE NO
40. Could material work be removed while preserving the proof?   If YES, simplify
41. Any contradiction with a frozen Master or the Constitution?  MUST BE NO

==================================================
NOT VALIDATED — MUST BE NON-EMPTY
==================================================

- the correction is not independently audited by this pass; a fresh executor
  must re-run R1 Stage 3 in full
- package-root callable-surface coverage is not implemented (GAP-058)
- hostile TypeScript casts and cast-read forms remain outside declaration-guard
  responsibility (GAP-005); the runtime P4 layer owns them (F-R1-002)
- auditor independence remains ASSERTED, not mechanically proven (GAP-055)
- the false statement in hardening report §9 remains in that immutable report;
  it is corrected only by this pass's report and GAP-057's description
- single host (darwin, Node 26); no live Windows validation (GAP-002)
- residual filesystem races remain (GAP-035, GAP-036, GAP-037, GAP-044,
  GAP-045)
- no rollback, no delete, no directory creation
- npm run check timing behavior remains an unconstrained-worker flake
- Foundation §10 audit not run; Phase 4 absent
- a guard that derives coverage is not a proof that no authority can leak; it
  is a proof that declared public option graphs are inspected

==================================================
GIT
==================================================

Every commit from 696ef4f through ecda537 remains an ancestor. Nothing is
rewritten. Three new local commits:

Stage 0   Record Phase 3-R2 public surface guard findings
Stage 1   Derive public authority-surface guard coverage from the editing barrel
Stage 2   Link Phase 3-R2 guard correction evidence

No amend. No rebase. No squash. No push. No remote.

After every commit: git rev-parse HEAD, git status --porcelain, ancestry
checks, npm run ledger:verify. Record each.

==================================================
AFTER THIS PASS
==================================================

1. Fresh Executor B re-runs Phase 3-R1 Stage 3 in full from the R2 Stage 2
   HEAD.
2. If COMPLETE: Executor C performs R1 Stage 4A/4B and Phase 3 closes.
3. Then the bounded Foundation §10 Closed-Vocabulary & Extensibility Audit.
4. Then the Phase 4 Master, which must address GAP-055 before any future audit
   relies on a stronger claim of mechanically proven executor independence.

No Phase 4 implementation.
