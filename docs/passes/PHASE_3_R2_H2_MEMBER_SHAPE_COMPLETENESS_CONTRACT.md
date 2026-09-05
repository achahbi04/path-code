PATH CODE — PHASE 3-R2-H2
MEMBER-SHAPE COMPLETENESS AND GENERATED FALSIFICATION
CORRECTIVE CONTRACT — FINAL

REPOSITORY
/Users/achahbi/Projects/path-code

REQUIRED STARTING HEAD
328f6fc174388d85df01ae21311cf44354812ce9

THIS CONTRACT IS A REPOSITORY ARTIFACT

Per Foundation Extensibility Constitution V1 §9, commit this exact contract as:

docs/passes/PHASE_3_R2_H2_MEMBER_SHAPE_COMPLETENESS_CONTRACT.md

inside the Stage 0 commit. Do not rewrite it after Stage 0.

==================================================
WHY THIS PASS EXISTS — AND WHY IT IS SHAPED DIFFERENTLY
==================================================

Three fresh independent auditors have now audited the Phase 3 detector at
three checkpoints. Each returned NOT COMPLETE. Each found a defect the
implementer's own falsifications did not reveal:

  ecda537   F-R1-001   discovery enumerated three type names
  c60c782   F-R1-003   traversal gated on parameter/type naming
  328f6fc   F-R1-004   optional callable members never classified callable
            F-R1-005   symbol-keyed members skipped before manifest push
            F-R1-006   object-valued barrel exports dropped from discovery

The third auditor stated the cause in one sentence: every prior probe —
R2's 2-F1…2-F7, R2-H1's H1-F1…H1-F7, and both prior auditors — used a
REQUIRED, STRING-KEYED member. Three rounds of falsification written by
three different authors shared one unexamined assumption about member shape.

Falsifications written from imagination test what the author imagined. That
is the defect in the PROCESS, and it is the one this pass corrects alongside
the three defects in the code. From this pass forward, falsifications for
detection mechanisms are GENERATED from an enumerated, operator-reviewed
dimension table — not hand-written. The next auditor's job becomes "find a
dimension the table lacks," which is a far smaller target than "imagine a
shape nobody tested."

THE THREE FINDINGS AT 328f6fc

F-R1-004 — OPTIONAL CALLABLE NEVER CLASSIFIED
  public-authority-surface-analyzer.ts:873 applies
  hasUserDefinedCallSignatures(propType) to the un-unwrapped type. An
  optional member `q?: (m) => string` has type `T | undefined`;
  getCallSignatures() on a union returns []. Adding such a member to the
  real AuthorizePreparedChangeOptions gives 0 findings, guard 5/5, P1–P14
  9/9. Every existing option member on every options type is optional; this
  is the natural way to write one.

F-R1-005 — SYMBOL-KEYED MEMBERS SKIPPED, MANIFEST BLIND
  `if (propName.startsWith("__@")) continue;` at lines 856 and 954 fires for
  every symbol-keyed property — well-known and unique alike — and runs
  BEFORE the manifest push. The member never enters the manifest, so the
  R2-H1 completeness proof cannot see its absence. A corrupted tree analyzes
  byte-identical to clean (5302 dispositions, 2242 rows, 0 findings). This is
  a name-pattern skip — the class R2-H1 eliminated at the root level —
  surviving at the member level.

F-R1-006 — OBJECT-VALUED EXPORTS DROPPED
  Barrel exports whose type has no call signatures (signatures.length === 0)
  are excluded from discovery. An exported object whose members are
  functions is a public callable surface that never becomes a root.

TWO HAZARDS THE AUDITOR FLAGGED WITHOUT CALLING THEM FINDINGS

  programCache has no invalidation source. It is stale in both directions
  with size and mtime preserved. The guard is safe only because it calls
  clearRepositoryTypeScriptProgramCache() by convention. Safety by
  convention is not safety.

  process.cwd() affects lib resolution. It degrades fail-closed, but an
  evidence tool whose output depends on where it was invoked from is not
  deterministic.

No active leak exists at 328f6fc. Every finding is absent detection.

PRIMARY ORIGIN: IMPLEMENTATION for F-R1-004/005/006 — Amendment 1 §4 D
requires failure on an unreviewed member carrying a user-defined call
signature, without qualification by optionality, key kind, or export kind.

CONTRIBUTING ORIGIN: EVIDENCE — three rounds of falsification design shared
one blind spot. This pass records that as a process finding and corrects it
structurally.

==================================================
OPERATOR DECISIONS — ALREADY MADE, DO NOT RE-DERIVE
==================================================

D1  GAP-057 STAYS CLOSED. Root discovery and root-level traversal are correct;
    the auditor reproduced 28/28 roots and every disposition count. Amend
    GAP-057's notes to scope what its closure established (root discovery,
    root-level traversal, no root-level name gate) and to cite GAP-060/061/
    062 for member-level and export-level completeness. Do not reopen it.

D2  NEW GAPS, ONE PER MECHANISM. Verify IDs are unused.
      GAP-060  optional / union-wrapped callable classification   BLOCKING_INVARIANT
      GAP-061  symbol-keyed member skip; manifest blind to skip    BLOCKING_INVARIANT
      GAP-062  object-valued export discovery                      BLOCKING_INVARIANT
      GAP-063  Program cache without content-based invalidation    BLOCKING_INVARIANT
      GAP-064  cwd-dependent lib resolution                        NON_BLOCKING_LIMITATION
      GAP-065  falsification design shared implementer assumptions  NON_BLOCKING_LIMITATION
               (process finding; closed by the generated matrix)
    Attach GAP-060/061/062/063 to safe-editing.knownLimitations and
    edit-contracts.knownLimitations. GAP-064/065 unattached.

D3  NO COMPONENT DOWNGRADE. Four mutation capabilities keep freezeEvidence.
    safe-editing remains IMPLEMENTED.

D4  SCOPE STAYS THE EDITING BARREL. GAP-058 remains OPEN.

D5  THE DIMENSION TABLE BELOW IS THE REVIEWED TABLE. The implementer may
    propose additions in the Stage 1 report but may not remove a dimension
    or value. The table is committed as data; the fixtures are generated from
    it; a dimension is added by adding a row.

D6  NO PROBE IS DELETED OR WEAKENED. 2-F1…2-F7 and H1-F1…H1-F7 stay. The
    matrix is added beside them.

D7  NO vitest / worker / timeout redesign (GAP-059).

==================================================
THE REVIEWED DIMENSION TABLE
==================================================

Every generated fixture is one cell: a public function (or object-valued
export) whose parameter graph carries ONE seeded callable member at ONE
placement, with the member's shape chosen from each dimension. The analyzer
MUST emit exactly the expected CALLABLE_REJECTED (or UNSAFE_ESCAPE_REJECTED
where noted) at the expected path, and the member MUST appear in the
manifest.

DIM-1  OPTIONALITY
  required
  optional (`?`)
  explicit `| undefined`
  explicit `| null`
  explicit `| null | undefined`

DIM-2  KEY KIND
  identifier key
  string-literal key (quoted, including keys with spaces and `__@` prefix
    as a plain string)
  numeric-literal key
  well-known symbol key (Symbol.iterator, Symbol.asyncIterator,
    Symbol.toPrimitive)
  unique symbol key (`declare const k: unique symbol`)
  computed key from a const string

DIM-3  CALLABLE FORM
  property with function type
  method signature
  property with construct signature (`new (...) => X`)
  call signature on the containing type itself
  construct signature on the containing type itself
  index signature whose value type is callable
  getter whose type is callable
  overloaded function type (two or more call signatures)
  generic function type
  function type nested inside a non-callable object member (one level)

DIM-4  PLACEMENT
  top-level member of the parameter type
  nested object, depth 1
  nested object, depth 3
  union constituent
  intersection constituent
  array element
  readonly array element
  tuple element
  type argument of a project-defined generic
  type argument of an external generic (Promise, ReadonlyArray, Map value,
    Record value, Partial, Readonly, Pick)
  inherited via interface extends
  through a type-alias chain (three aliases)
  through a mapped type over a project type
  through a conditional type that resolves to an object type
  rest-parameter element type
  overload signature (second overload only)

DIM-5  MUTABILITY
  readonly
  mutable

DIM-6  NAMING
  mechanism keyword (ops, executor, loader, …)
  neutral (quill, tide, marble, …)
  single letter

DIM-7  ROOT KIND
  function parameter
  object-valued export member's parameter
  object-valued export member that is itself callable (the member IS the
    root; its parameters are traversed)

CELL SELECTION — REQUIRED MINIMUM
  A. Full cross-product DIM-1 × DIM-2 × DIM-3 at top-level placement,
     readonly, neutral naming, function-parameter root.
     (5 × 6 × 10 = 300 cells)
  B. Every DIM-4 placement × {required, optional} × {identifier key,
     unique symbol key} × {property-fn, method}.
     (16 × 2 × 2 × 2 = 128 cells)
  C. Every DIM-7 root kind × {required, optional} × {identifier, unique
     symbol} at top-level.
     (3 × 2 × 2 = 12 cells)
  D. A pairwise covering array over ALL seven dimensions (every pair of
     values from any two dimensions appears in at least one cell).
  E. CONTROL cells: for every cell in A, the same shape with a NON-callable
     member type (string, number, project data object without callables).
     Expected: 0 findings, member manifested with a non-rejected disposition.

The generator MUST emit cell identity (dimension values) into each finding
so a failure names the cell. The table is a committed data file. Cells that
TypeScript cannot express (e.g. a getter on a type alias) are recorded as
INEXPRESSIBLE with the reason, not silently omitted; the count of
inexpressible cells is asserted and must be justified in the report.

==================================================
WHAT THIS PASS DOES NOT DO
==================================================

- NO committed change under src/ outside canonical self-observation ledger
  bookkeeping. Temporary hash-restored corruptions only.
- NO change to authorization semantics, ActionClass, evidence tiers, or
  ledger schema
- NO new detection vocabulary — Amendment 1 §4 D governs
- NO rewrite of history; NO deletion or weakening of any probe
- NO package-root expansion (GAP-058); NO vitest redesign (GAP-059)
- NO promotion, NO closure artifact, NO Stage 4, NO re-audit
- NO Foundation §10, NO Phase 4, NO push, NO remote

==================================================
NO-UNTRACKED-FINDING RULE / FAILURE PROTOCOL / RESTORATION DISCIPLINE
==================================================

As in Phase 3-R2-H1, binding here:

- every finding ends in a closed gap with immutable evidence, an OPEN gap,
  or an exact citation of a frozen limitation
- if unconditional member iteration surfaces a real callable on the clean
  public surface other than seeded ones, STOP AND REPORT — do not classify
  it away
- on any failed gate after Stage 0: restore all corruptions by hash, remove
  incomplete candidates, preserve findings in the ledger and report, commit
  only the finding artifacts with subject
    Record Phase 3-R2-H2 member-shape finding
  and stop
- baseline files restored via git checkout from HEAD with blob-hash
  equality; candidate (uncommitted Stage 1) files restored from a SHA-256
  snapshot taken before corruption, never via git checkout

==================================================
BASELINE GATE
==================================================

git rev-parse HEAD              → 328f6fc174388d85df01ae21311cf44354812ce9
git status --porcelain          → empty
npm run ledger:verify           → PASS

Ancestors, each MUST exit 0:
  696ef4fe…  5386f349…  63f6e87c…  ecda537f…  8520ab97…  c60c7825…  b2531ce8…

Verify: the R1 report at HEAD contains the exact NOT COMPLETE line and
F-R1-004/005/006; GAP-060 through GAP-065 unused; safe-editing IMPLEMENTED;
four mutation capabilities PASS_FROZEN; Phase 4 absent.

Record: runtime total (expected 626, VERIFY); the three exact defective
lines quoted with current line numbers; the current disposition counts as a
baseline (expected 28 roots / 5302 / 1520 / 3522 / 229 / 31, VERIFY, never
hardcode).

==================================================
FOUNDATION COMPATIBILITY PREFLIGHT
==================================================

| Concept                                                     | Foundation                        | Result           |
|-------------------------------------------------------------|-----------------------------------|------------------|
| Fail on unreviewed callable member regardless of shape      | Amendment 1 §4 D                  | MAPS_TO_EXISTING |
| Deterministic manifest of every public member               | Amendment 1 §4 C                  | MAPS_TO_EXISTING |
| Per-node completeness (checker members == manifested)       | §4 C manifest, enriched           | MAPS_TO_EXISTING |
| Object-valued exports as public callable surface            | §4 C "every public function"      | MAPS_TO_EXISTING |
| Content-hash-keyed Program cache                            | tooling; typescript devDependency | MAPS_TO_EXISTING |
| Generated fixtures from a committed dimension table         | test tooling                      | MAPS_TO_EXISTING |
| Constitutional rule: detection falsifications are generated | —                                 | DOES_NOT_EXIST   |

Final row: this pass applies the generated-falsification discipline to this
detector and records GAP-065. Making it a Constitution rule for all future
detection mechanisms is a Phase 4 Master / Amendment 2 item. Do not amend
the Constitution here. Record the recommendation in AFTER THIS PASS.

No new foundational concept. No amendment required.

==================================================
EXECUTOR ASSIGNMENT — BINDING
==================================================

EXECUTOR A (Stages 0–2): Cursor or another implementation agent. MUST NOT be
any of the three Claude Code sessions that authored ecda537, c60c782, or
328f6fc.

FUTURE EXECUTOR B: a completely fresh session that did not implement R2-H2
and receives no transcript of it. All three prior auditor sessions are
disqualified.

An executor that did not START a stage may not FINISH it. This pass STOPS at
the Stage 2 gate.

==================================================
STAGE 0 — RECORD
==================================================

0.1  Create docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md. §0 records:
     F-R1-004/005/006 with the exact defective lines quoted; the two
     hazards; the auditor's one-sentence cause; the three-pass table above;
     origins; the dimension table verbatim as reviewed.

0.2  Append GAP-060 through GAP-065 per D2, each with description,
     missingEvidence, closureCondition, notes, and reviewClassification set
     (the operator has reviewed). Closure conditions:
       060: callable classification applied to the non-nullable type and to
            every union/intersection constituent; matrix cells A/B/C/D pass.
       061: no name-based member skip anywhere in the analyzer; symbol-keyed
            members manifested and classified; per-node completeness proof
            fails when any member is omitted.
       062: every exported value dispositioned; object-valued exports
            traversed; callable members become roots; their parameters
            traversed.
       063: Program cache keyed by content hash of every input file; same-
            process both-direction freshness proven with size and mtime
            preserved.
       064: analyzer output byte-identical from two different cwds.
       065: the committed dimension table and generator exist; every
            required cell passes; the table is the falsification source.

0.3  Amend GAP-057 notes per D1. Attach per D2.

0.4  gap:render; ledger:verify. MUST PASS. Derived states unchanged — VERIFY.

0.5  Commit this contract at the path above.

STAGE 0 COMMIT EXACTLY
Record Phase 3-R2-H2 member-shape findings

==================================================
STAGE 1 — CORRECTION AND GENERATED FALSIFICATION
==================================================

1.1  PRE-CORRECTION REPRODUCTION — FIRST. Reproduce each finding at the
     Stage 0 HEAD analyzer, capture verbatim, restore by hash:
     (a) optional callable on AuthorizePreparedChangeOptions → 0 findings
     (b) unique-symbol-keyed callable on AuthorizePreparedChangeOptions →
         0 findings AND byte-identical manifest to clean
     (c) an exported const object with a callable member → not discovered
     (d) programCache: warm, mutate preserving size+mtime, re-analyze →
         stale clean result
     (e) identical analyzer run from repo root and from /tmp → differing
         output, if reproducible; record either way
     If any does not reproduce, STOP AND REPORT.

1.2  CLASSIFICATION ON THE UNWRAPPED TYPE. A member is callable if, after
     removing null and undefined, ANY union or intersection constituent has
     a call signature or construct signature, is a method, is a getter of
     callable type, or is an index signature with callable value type. A
     type is callable at its own level if it has call or construct
     signatures. Generic function types count. Optional is not a shield.

1.3  MEMBER ITERATION WITH NO NAME-BASED SKIP. Iterate every property from
     checker.getPropertiesOfType, every call signature, every construct
     signature, and every index info. Symbol-keyed properties are members.
     Delete both `startsWith("__@")` guards. There is no legitimate
     `startsWith`, regex, or equality test on a property name anywhere in
     the analyzer. Symbol keys are serialized in the manifest by declaration
     identity (declaring file + symbol description), deterministically.

     The three stop authorities of R2-H1 (primitive, external after type-
     argument inspection, reviewed terminal) apply to MEMBERS exactly as to
     roots. Nothing else stops a member.

1.4  PER-NODE COMPLETENESS. For every traversed project-defined node:
       |getPropertiesOfType| + |callSignatures| + |constructSignatures|
       + |indexInfos| == manifested entries for that node.
     Asserted by a permanent test for every node in the clean manifest. A
     member that does not enter the manifest breaks the proof.

1.5  EXPORT DISPOSITION. Every value export of the barrel receives a
     disposition: CALLABLE_ROOT (function; parameters are roots),
     OBJECT_SURFACE (traversed; callable members become CALLABLE_ROOTs
     with their own parameter roots; non-callable members dispositioned),
     PRIMITIVE_TERMINAL, or EXTERNAL_LIBRARY_TERMINAL after type-argument
     inspection. No export is undispositioned. Type-only exports are
     reached through parameter graphs and need no export disposition;
     record the count of type-only exports.

1.6  CONTENT-HASH CACHE. The Program cache key is the sorted list of
     (repository-relative path, SHA-256 of content) for every source file
     in the Program, plus compiler options hash. Any mismatch rebuilds.
     Path, size, and mtime are not keys. The standing guard needs no
     explicit clear call to be correct; if it still calls one, that is a
     belt, not the suspenders.

1.7  CWD INDEPENDENCE. Resolve the repository root, tsconfig, and lib
     directory from the analyzer's own location or an explicit root
     argument — never from process.cwd().

1.8  THE GENERATOR. tests/architecture/public-authority-surface-matrix.ts
     (or similar) reads the committed dimension table, produces each
     required cell as an in-memory virtual source overlay added to the
     Program (no disk writes for cells), runs the canonical analyzer, and
     asserts per cell. The cell identity appears in every failure message.
     Runtime budget: record it; if the full matrix exceeds a reasonable
     bound, shard by cell group (A/B/C/D/E) into separate test files — never
     by dropping cells.

1.9  PERMANENT FALSIFICATIONS. Corrupt → exact failure → intended reason →
     hash-verified restore → PASS. An erroring falsification is NO evidence.

     H2-F1  THE FINDINGS ON THE REAL SURFACE
            Optional callable, unique-symbol-keyed callable, and an object-
            valued export with callable member, each on/in the real editing
            barrel. Each MUST FAIL naming function, parameter, type, and
            member path (symbol members by declaration identity).

     H2-F2  THE MATRIX
            Cell groups A, B, C, D all rejected at the expected path with
            the member manifested; group E controls all pass with the member
            manifested non-rejected; INEXPRESSIBLE count asserted.

     H2-F3  PER-NODE COMPLETENESS
            Temporarily restore either `__@` skip → completeness MUST FAIL
            on the affected nodes. Temporarily drop one manifested member in
            the analyzer output → MUST FAIL. Restore. PASS.

     H2-F4  EXPORT COMPLETENESS
            Temporarily restore the signatures.length === 0 exclusion → an
            object-valued export with a callable member MUST escape and the
            export-disposition completeness test MUST FAIL. Restore. PASS.

     H2-F5  CACHE FRESHNESS, SAME PROCESS, BOTH DIRECTIONS
            Warm → corrupt (size and mtime preserved) → analyze → detected.
            Restore (size and mtime preserved) → analyze → clean observed.
            No process restart. No explicit clear call between steps.

     H2-F6  CWD INDEPENDENCE
            Full manifest SHA-256 identical when the analyzer runs from the
            repository root and from a temporary directory.

     H2-F7  THE BAD IMPLEMENTATIONS, RESTORED
            Restore line 873's un-unwrapped check verbatim → H2-F1(a) and
            matrix group A optional cells MUST escape. Restore `__@` skips →
            H2-F1(b) MUST escape and H2-F3 MUST FAIL. Restore the export
            exclusion → H2-F1(c) MUST escape. Each restored separately, each
            proven, each undone by hash. This is the decisive proof.

     H2-F8  FALSE-POSITIVE CONTROL
            Clean surface: 0 findings; WorkspaceBoundary still the only
            reviewed terminal; every optional non-callable member (all
            existing gitContext?) manifested and non-rejected; Buffer,
            Uint8Array, Promise, Map member graphs external after type-
            argument inspection.

     H2-F9  PREVIOUS PROOFS PRESERVED
            2-F1…2-F7, H1-F1…H1-F7, and all three auditors' A-F19 cases
            (reconstructed from the committed reports) still fail and
            restore. None deleted, none weakened.

1.10 FULL GATE. typecheck, test, build, cli:smoke, ledger:verify, check.
     Record every npm run check attempt with host load; an assertion failure
     is a real failure — STOP AND REPORT. Record analyzer runtime, Program
     construction count, matrix cell count and runtime.

1.11 No committed src/ change outside the canonical ledger surface — VERIFY
     and record the diff scan.

1.12 Write §1 of the report in THIS commit, complete. It cites no Stage 2
     SHA.

STAGE 1 COMMIT EXACTLY
Classify every member shape and generate detector falsifications

==================================================
STAGE 2 — EVIDENCE LINKAGE
==================================================

2.1  Close GAP-060, 061, 062, 063, 064, 065 against the Stage 1 SHA with
     closureEvidence docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md.
     Each closure's notes name the H2-F proofs that establish it.

2.2  Remove GAP-060/061/062/063 from safe-editing and edit-contracts
     knownLimitations. GAP-058, GAP-059 remain OPEN.

2.3  Update citation SHA constants only to bind the Stage 1 commit.

2.4  gap:render; ledger:verify; check. MUST PASS.

2.5  VERIFY and record final state: four mutation capabilities PASS_FROZEN;
     safe-editing IMPLEMENTED — NOT promoted; repository-intelligence and
     foundation-kernel PHASE_VERIFIED; GAP-051 OPEN; GAP-052 OPEN; GAP-053
     CLOSED; GAP-054 CLOSED; GAP-055 OPEN; GAP-056 OPEN; GAP-057 CLOSED
     (notes scoped); GAP-058 OPEN; GAP-059 OPEN; GAP-060…065 CLOSED.

2.6  Stage 1 report unchanged in Stage 2 — VERIFY by hash.

STAGE 2 COMMIT EXACTLY
Link Phase 3-R2-H2 member-shape correction evidence

==================================================
STAGE 2 GATE — HARD STOP
==================================================

Return: Stage 0/1/2 full SHAs; the five 1.1 reproductions verbatim; the
dimension table as committed with any proposed additions; cell counts per
group and INEXPRESSIBLE justifications; every H2-F result, especially H2-F7;
the export disposition summary; new disposition counts; every check attempt
with load; final states; diff scan; clean-tree result.

Then a FRESH Executor B re-runs Phase 3-R1 Stage 3 in full from the Stage 2
HEAD, using the FINAL MERGED dispatch already drafted for the b2531ce audit,
updated for the new checkpoint, the new baseline figures, the R2-H2 artifacts
under audit, three prior NOT COMPLETE commits, and with one added
requirement: the auditor MUST attempt to identify at least one member-shape
dimension or value ABSENT from the committed table, construct it, and run it.
If it finds one and the analyzer misses it, that is a finding. If the
analyzer catches it anyway, the table is extended in the next pass and the
audit may still return COMPLETE.

==================================================
CHECKLIST — ANSWER EVERY LINE IN THE REPORT
==================================================

 1. Start HEAD exactly 328f6fc…; tree clean; ancestors present?     MUST BE YES
 2. GAP-060…065 unused at baseline?                                  MUST BE YES
 3. Three defective lines quoted with current line numbers?         MUST BE YES
 4. Baseline disposition counts recorded, not hardcoded?             MUST BE YES
 5. GAP-057 notes scoped, not reopened?                              MUST BE YES
 6. All five 1.1 reproductions captured before any change?           MUST BE YES
 7. Every temporary fixture hash-restored with empty scoped diff?    MUST BE YES
 8. Classification on non-nullable type and every constituent?       MUST BE YES
 9. Any startsWith / regex / equality on a property name remaining?  MUST BE NO
10. Symbol-keyed members manifested by declaration identity?         MUST BE YES
11. Per-node completeness asserted for every clean node?             MUST BE YES
12. Every value export dispositioned?                                MUST BE YES
13. Object-valued export callables become roots?                     MUST BE YES
14. Cache key is content hash, not path/size/mtime?                  MUST BE YES
15. Analyzer output identical from two cwds?                         MUST BE YES
16. Dimension table committed as data, unchanged from reviewed?       MUST BE YES
17. Any dimension or value removed from the reviewed table?          MUST BE NO
18. Cell groups A/B/C/D fully generated; E controls generated?       MUST BE YES
19. INEXPRESSIBLE cells counted and justified?                       MUST BE YES
20. Every cell failure names its cell identity?                      MUST BE YES
21. H2-F1: all three findings fail on the real surface?              MUST BE YES
22. H2-F3: restored skip and dropped member both fail completeness?  MUST BE YES
23. H2-F4: restored exclusion escapes and fails export completeness? MUST BE YES
24. H2-F5: both directions, same process, size+mtime preserved?      MUST BE YES
25. H2-F7: each bad implementation restored separately and proven?   MUST BE YES
26. H2-F8: clean surface 0 findings; one reviewed terminal?          MUST BE YES
27. H2-F9: every prior proof and auditor case preserved?             MUST BE YES
28. Any falsification errored before intended failure?               MUST BE NO
29. Any probe deleted or weakened?                                   MUST BE NO
30. Did member iteration find a real callable on the clean surface?  MUST BE NO
31. One canonical analyzer path for guard, proofs, and matrix?       MUST BE YES
32. Runtime dependencies 0?                                          MUST BE YES
33. Committed src/ change outside canonical ledger surface?          MUST BE NO
34. Every check attempt recorded with load; any assertion failure?   record / NO
35. Stage 1 report complete in Stage 1, unchanged in Stage 2?         MUST BE YES
36. GAP-060…065 CLOSED against Stage 1 with that report?             MUST BE YES
37. safe-editing IMPLEMENTED; four components PASS_FROZEN?           MUST BE YES
38. Any closure artifact; Stage 4; push; remote; history rewrite?    MUST BE NO
39. Executor A audited its own correction?                           MUST BE NO
40. Could material work be removed while preserving the proof?       If YES, simplify
41. Contradiction with a frozen Master or the Constitution?          MUST BE NO

==================================================
NOT VALIDATED — MUST BE NON-EMPTY
==================================================

- not independently audited here; a fresh executor re-runs R1 Stage 3
- the dimension table is complete only with respect to the dimensions it
  enumerates; a dimension nobody has named remains possible, which is why
  the next auditor is asked to look for one
- package-root coverage (GAP-058); check-timing instability (GAP-059)
- hostile casts remain the runtime P4 layer's (GAP-005, F-R1-002)
- auditor independence ASSERTED (GAP-055)
- the reviewed terminal registry remains a reviewed allowlist
- the false statement in hardening report §9 remains immutable
- single host; no live Windows validation (GAP-002)
- residual filesystem races (GAP-035/036/037/044/045)
- no rollback, delete, or directory creation
- Foundation §10 not run; Phase 4 absent
- a detector that inspects every declared public member shape it knows how
  to name is not a proof that no authority can leak; it is a proof that
  every enumerated shape is inspected

==================================================
GIT
==================================================

Every commit from 696ef4f through 328f6fc remains an ancestor. Three new
local commits with the exact subjects above. No amend, rebase, squash, push,
or remote. After every commit: HEAD, status, ancestry, ledger:verify.

==================================================
AFTER THIS PASS
==================================================

1. Fresh Executor B: full Phase 3-R1 Stage 3 from the Stage 2 HEAD, with the
   dimension-gap requirement above.
2. If COMPLETE: Executor C, R1 Stage 4A/4B, Phase 3 closes.
3. Foundation §10 Closed-Vocabulary & Extensibility Audit.
4. Phase 4 Master — which MUST carry forward three lessons from this chain:
     - auditor-provenance mechanism (GAP-055)
     - suite timing under load before adding execution (GAP-059)
     - CONSTITUTION AMENDMENT 2 CANDIDATE: falsifications for any detection
       mechanism are generated from an operator-reviewed dimension table
       committed as data; hand-written probes are supplementary, never the
       proof of coverage. Three consecutive independent audits found what
       hand-written probes missed. That is enough evidence to make it a rule.

No Phase 4 implementation.
