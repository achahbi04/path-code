PATH CODE — PHASE 3 SAFE EDITING ENGINE INTEGRATION AUDIT CONTRACT

Exact Stage 2 contract extracted from the coordinated FINAL MERGED package.
Frozen in the Stage 1 evidence commit for the independent auditor.
Do not edit after Stage 1 commit.

SOURCE PACKAGE: PathCode_Phase3D_E1_Phase3_Integration_Audit_COORDINATED_FINAL_MERGED.md

PATH CODE — PHASE 3D-E1 EVIDENCE COMPLETION
+ PHASE 3 SAFE EDITING ENGINE INTEGRATION AUDIT
COORDINATED FINAL MERGED CONTRACT

REPOSITORY
/Users/achahbi/Projects/path-code

==================================================
CURRENT BASELINE
==================================================

Phase 3D capability linkage / current HEAD:
424b6de77e227ffa702fad4cdb18aade77572003

Phase 3D implementation Commit A:
4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9

Phase 3D Master:
28efece61800d4b6dd92465d3499e648268365a3

Foundation Extensibility Constitution V1:
a73a623cfed77d2c2dc0238d386d40d4d1595065

Phase 3C-H1 COMPLETE:
dcb347fc613114be810b8caf371f0bea8b261285

Phase 3D executed contract SHA-256:
97fe774f71d570a1a7875bdaeddff2cd092a1805f9ace3f654678f08df8984e3

CURRENT EXPECTED CAPABILITY STATES

edit-contracts:
PASS_FROZEN

existing-file-replacement:
PASS_FROZEN

safe-file-creation:
PASS_FROZEN

multi-file-coordination:
PASS_FROZEN

safe-editing:
DECLARED / IN PROGRESS

Phase 3 closure:
ABSENT

Phase 4:
NOT STARTED

The Phase 3D user-facing report did not state the final runtime total.

VERIFY every baseline fact rather than carrying it forward.

==================================================
WHY THESE TWO OPERATIONS ARE COORDINATED
==================================================

Phase 3D implementation appears technically strong.

Its committed report is materially shorter than the executed contract required.

The missing issue is repository-recorded evidence completeness, not a known
production-code defect.

The Phase 3 integration audit is the next independent phase-wide operation.

To preserve speed without compromising independence, this package performs:

STAGE 1
Phase 3D-E1 evidence completion
→ document-only immutable commit

THEN

STAGE 2
fresh independent Phase 3 integration audit
→ separate audit role
→ additive integration tests
→ separate immutable audit commit

The Phase 3 auditor MUST NOT be the Stage 1 evidence writer.

The audit begins only after Stage 1 is committed and the repository is clean.

This is one coordinated Cursor operation, not two human round-trips.

==================================================
GOVERNING SOURCES
==================================================

docs/PHASE_3_SAFE_EDITING_MASTER.md
docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md
docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md
docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md
docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md
docs/ENGINEERING_SELF_OBSERVATION.md
docs/GAP_LEDGER.md

docs/passes/PHASE_3D_CONTRACT.md

docs/reports/PHASE_3A_REPORT.md
docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md
docs/reports/PHASE_3C_H1_REPORT.md
docs/reports/PHASE_3D_REPORT.md

machine-readable Capability Ledger v1
machine-readable Gap Ledger v1

Where this coordinated contract conflicts with any frozen governing source:

STOP AND REPORT.

The frozen source governs.

Do not reinterpret it to keep the package green.

==================================================
CONSTITUTION SECTION REFERENCES — LOCKED
==================================================

Use the FINAL FROZEN Constitution numbering:

§5
Pass-writer obligations

§7
Authored mutation evidence is not repository knowledge

§9
Pass contracts become repository artifacts

§10
One bounded foundation baseline audit before Phase 4

§11
Integration-audit responsibility

Do not use section numbers from earlier Constitution drafts.

==================================================
THIS CONTRACT IS REPOSITORY EVIDENCE
==================================================

Before Stage 1 evidence work begins, create exact immutable copies of the two
stage contracts from this package:

docs/passes/PHASE_3D_E1_CONTRACT.md

docs/passes/PHASE_3_INTEGRATION_AUDIT_CONTRACT.md

The Stage 1 contract is committed in the Stage 1 evidence commit.

The Stage 2 audit contract is also committed in Stage 1 so the independent
auditor starts from an immutable repository-recorded instruction.

Do not edit either contract after Stage 1 commit.

If a material recovery supplement becomes necessary:

store it as a separate file beside the applicable contract.

Do not rewrite the original.

==================================================
MULTITASK / INDEPENDENCE MODEL
==================================================

USE CURSOR MULTITASK.

STAGE 1:

- one Evidence Completer;
- read-only reviewers may work in parallel;
- exactly one Stage 1 repository writer.

STAGE 2:

- create a FRESH independent Phase 3 Auditor after Stage 1 commit;
- do not reuse the Stage 1 Evidence Completer as auditor;
- audit read-only tasks may run in parallel;
- exactly one Stage 2 audit writer.

No production writer exists in either stage.

Temporary falsification edits are allowed only when restored exactly before
each stage commits.

==================================================
ABSOLUTE PROHIBITIONS
==================================================

DO NOT:

- modify production src/** permanently;
- fix any production defect found during the audit;
- weaken, narrow, delete, or rewrite existing tests;
- amend frozen Masters or amendments;
- edit historical reports;
- alter existing Phase 3 capability freeze evidence merely to make the audit
  pass;
- promote safe-editing;
- create docs/PHASE_3_CLOSURE.md;
- begin the Constitution §10 baseline audit;
- begin Phase 4;
- amend, rebase, squash, push, or create a remote.

If a real defect is found:

REPORT IT.

DO NOT FIX IT INSIDE THIS PACKAGE.

######################################################################
STAGE 2 — INDEPENDENT PHASE 3 INTEGRATION AUDIT
######################################################################

Create a FRESH auditor after Stage 1 commit.

The Stage 1 Evidence Completer must not perform or evaluate Stage 2.

The Stage 2 auditor starts from the immutable E1 commit and reads:

docs/passes/PHASE_3_INTEGRATION_AUDIT_CONTRACT.md

in full.

==================================================
AUDIT PURPOSE
==================================================

Phase 3 contains four individually frozen capabilities:

- edit-contracts;
- existing-file-replacement;
- safe-file-creation;
- multi-file-coordination.

The audit asks whether all four compose into one coherent Safe Editing Engine
without violating:

- authority;
- currentness;
- denial/config restrictions;
- evidence boundaries;
- recovery honesty;
- write containment;
- non-persistence;
- self-observation truth.

The audit does not confirm reports.

It independently tests the seams no sub-pass could test.

Its result is exactly one:

PHASE 3 SAFE EDITING — COMPLETE

PHASE 3 SAFE EDITING — NOT COMPLETE

No intermediate status.

==================================================
AUDIT INDEPENDENCE
==================================================

The audit:

- fixes no production defect;
- weakens no test;
- amends no frozen document;
- promotes no capability;
- creates no closure;
- begins no Phase 4 work.

If a defect is found:

STOP.

Record:

- exact finding;
- evidence;
- primary origin:
  CONTRACT / IMPLEMENTATION / EVIDENCE / FOUNDATION;
- frozen obligation affected;
- smallest likely corrective surface.

Do not repair it.

==================================================
AUDIT EVIDENCE ADMISSIBILITY
==================================================

Every PASS rests on exactly one or more of:

A. a current repository test that passes;

B. a source/dist/Git mechanical check performed and recorded;

C. an immutable repository document at a resolvable commit.

A PASS may not rest only on:

- a report asserting PASS;
- a prior model/Cursor statement;
- "this was tested in 3B";
- Stage 1 prose without current supporting evidence.

The E1 report is admissible repository-recorded evidence for local Phase 3D
history.

It is not a substitute for Phase-wide composition testing.

==================================================
AUDIT BASELINE GATE
==================================================

Verify:

HEAD ==
the full Stage 1 E1 commit SHA

working tree:
clean

Verify:

git diff --exit-code \
424b6de77e227ffa702fad4cdb18aade77572003..HEAD \
-- src tests package.json package-lock.json

Expected:

no diff.

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

Determine actual test total.

Verify:

- four Phase 3 capabilities derive PASS_FROZEN;
- safe-editing derives DECLARED / IN PROGRESS;
- Phase 3 closure absent;
- Phase 4 absent.

If materially different:

STOP AND REPORT.

==================================================
AUDIT MULTITASK MODEL
==================================================

Use four fresh read-only audit tasks:

TASK A
SE-001 through SE-020 phase-wide matrix

TASK B
cross-phase composition and re-observation

TASK C
write boundary, persistence, recovery, corrective-pass regression

TASK D
Constitution questions, construction lessons, ledgers, compile-time sweep

All four report to one audit coordinator.

Exactly one audit writer may add:

- new additive audit tests;
- audit report;
- UNREVIEWED gap records if genuinely found.

No production writer.

==================================================
TASK A — SE-001 THROUGH SE-020 PHASE-WIDE
==================================================

Read the exact frozen Phase 3 Master.

Use every frozen title verbatim.

For every SE-001 through SE-020 record:

- exact title;
- status:
  SATISFIED_PHASE_WIDE
  SATISFIED_FOR_SUBSET
  NOT_SATISFIED
  NOT_INDEPENDENTLY_VERIFIED;
- mechanism for:
  authorization/preparation,
  replacement,
  creation,
  coordination,
  where applicable;
- evidence for each applicable mutation kind;
- admissibility class:
  TEST / MECHANICAL / REPOSITORY_DOCUMENT;
- exercised by this audit:
  YES / NO;
- existing current test relied upon.

SATISFIED_FOR_SUBSET is a finding.

Phase 3 cannot close with a frozen obligation that is true for replacement but
not creation, or true for single-target mutation but not coordinated plans.

==================================================
TASK B — CROSS-PHASE COMPOSITION
==================================================

Create additive tests under a clear Phase 3 integration/audit namespace.

Use real temporary workspaces.

Realpath every temporary root.

Earn every trusted artifact through the real public pipeline.

No fabricated:

- RepositoryEntry;
- ContentObservation;
- ResolvedProjectConfig;
- PreparedMutation;
- PreparedCreation;
- EditAuthorization;
- EditRecord;
- CreationAfterStateEvidence;
- MultiFilePlanResult.

--------------------------------------------------
B1 — FULL READ/WRITE/RE-OBSERVE PIPELINE
--------------------------------------------------

In one real Git workspace:

1. create valid PATHCODE.md;

2. establish WorkspaceBoundary;

3. build RepositoryInventory;

4. collect Git baseline;

5. read admitted content;

6. build RepositoryMap / SearchCorpus where applicable;

7. build RepositorySnapshot;

8. prepare + authorize + execute one 3B replacement;

9. prepare + authorize + execute one 3C creation;

10. prepare + authorize + execute one mixed 3D plan containing:
    - one replacement;
    - one creation;

11. take a fresh RepositoryInventory;

12. read every successfully modified/created target through Phase 2B using the
    newly earned RepositoryEntry;

13. compare:
    - each replacement EditRecord observed-after fingerprint;
    - each CreationAfterStateEvidence fingerprint;
    against the fresh Phase 2B ContentObservation fingerprint.

Required:

every bridge matches exactly.

This is the first phase-wide proof that the mutation side and repository
intelligence side agree about the same bytes.

--------------------------------------------------
B2 — AUTHORED THEN REOBSERVED
--------------------------------------------------

Create a file via Phase 3C.

Before new inventory:

- old inventory contains no RepositoryEntry;
- old map/search/snapshot cannot see the new file;
- CreationAfterStateEvidence remains mutation evidence only.

After new inventory:

- the file earns RepositoryEntry;
- Phase 2B read earns ContentObservation;
- fingerprints match;
- any new map/search/snapshot visibility comes only from rebuilding with newly
  earned repository evidence.

The transition:

AUTHORED + MUTATION_VERIFIED
→ REPOSITORY ADMITTED + CONTENT OBSERVED

must occur only through re-observation.

This exercises Constitution §7 behaviorally.

--------------------------------------------------
B3 — EDIT / VERIFY / STALE EDIT / FRESH EDIT
--------------------------------------------------

From one initial ContentObservation:

- prepare and authorize mutation A;
- prepare and authorize distinct mutation B against the same old before-state.

Execute A successfully.

Then:

- verify the OLD Phase 2 snapshot:
  must report STALE_CONTENT for that entry;

- execute old-prepared mutation B:
  must refuse/fail currentness safely;

- take a fresh read;
- prepare and authorize mutation C;
- execute C successfully.

This proves Phase 2 freshness and Phase 3 mutation preconditions represent the
same content fact.

--------------------------------------------------
B4 — GIT BASELINE IS POINT-IN-TIME
--------------------------------------------------

Collect baseline G0.

Modify a tracked file through Phase 3B.

Collect baseline G1.

Confirm:

- G0 remains clean point-in-time evidence;
- G1 reports current worktree modification;
- no old Git baseline is silently treated as current.

Also verify:

- supplied UNMERGED context refuses a target;
- absent Git context does not manufacture a refusal.

--------------------------------------------------
B5 — DENIAL ACROSS SIX ENFORCEMENT SURFACES
--------------------------------------------------

Use two controlled moments.

MOMENT 1 — restriction exists before observation/preparation

With deny-path covering secrets/:

- config resolves successfully;
- 2A does not admit denied children;
- no RepositoryEntry exists for denied files;
- 2B cannot be invoked through its typed API for a denied child;
- 2E surfaces no denied child candidate;
- 3B preparation cannot be earned for a denied child;
- 3C preparation cannot be earned under a denied parent.

MOMENT 2 — restriction added after preparation/authorization

Under permissive config:

- earn valid 3B and 3C prepared objects/authorizations.

Then add deny-path before mutation/plan preflight.

Confirm:

- 3B refuses;
- 3C refuses;
- a 3D plan names every denied target at preflight;
- no authorization is consumed by refused 3D preflight.

Do not require a 3D plan containing a target that could never be prepared.

--------------------------------------------------
B6 — ACTION CLASSES ACROSS THE PHASE
--------------------------------------------------

Prepare/authorize under permissive config.

Then test current restrictions.

With disable-action = EDIT:

- 3B refuses;
- 3C creation remains eligible;
- mixed 3D plan refuses at preflight;
- every modification target is named ACTION_DISABLED;
- every otherwise-ready creation target is
  PREFLIGHT_READY_BUT_PLAN_REFUSED.

With disable-action = CREATE_FILE:

- inverse behavior;
- creation refuses;
- modification remains eligible;
- mixed plan names every creation target.

The two restrictions are independent.

This is the plan-scale proof that GAP-046's closure still holds.

--------------------------------------------------
B7 — CONFIG FAIL-CLOSED AND ABSENT ACROSS THE PHASE
--------------------------------------------------

MALFORMED CONFIG

Start with valid config long enough to earn any prepared/authorized mutation
artifacts required for write-side tests.

Then corrupt PATHCODE.md.

Confirm:

- loadProjectConfig returns ConfigFailure;
- no ResolvedProjectConfig exists for inventory composition;
- typed inventory pipeline cannot lawfully continue through a fallback;
- 3B refuses CONFIG_RELOAD_FAILED;
- 3C refuses CONFIG_RELOAD_FAILED;
- 3D preflight marks every target CONFIG_RELOAD_FAILED;
- no authorization consumed by 3D preflight.

Do not describe inventory as producing a denial disposition.

The fail-closed point is config resolution/provenance before inventory.

SUCCESSFUL ABSENT

Delete PATHCODE.md.

Confirm:

- loadProjectConfig returns successful ABSENT ResolvedProjectConfig;
- inventory proceeds;
- otherwise-valid 3B proceeds;
- otherwise-valid 3C proceeds;
- otherwise-valid 3D plan proceeds.

This proves failure refuses and ABSENT does not over-refuse.

--------------------------------------------------
B8 — PARTIAL PLAN THEN REOBSERVE
--------------------------------------------------

Execute a real 3D plan where:

- at least one target commits;
- a later target refuses/fails;
- a final target is NOT_ATTEMPTED.

Then take a fresh inventory/read.

Confirm:

- every committed target's real filesystem state matches its nested result;
- COMMITTED_FAILURE state is represented honestly;
- NOT_ATTEMPTED had no currentness/unchanged claim;
- only fresh re-observation establishes the actual current state of the
  not-attempted target;
- no rollback occurred.

==================================================
TASK C — WRITE, PERSISTENCE, RECOVERY, CORRECTIONS
==================================================

--------------------------------------------------
C1 — WRITE BOUNDARY PHASE-WIDE
--------------------------------------------------

Mechanically scan source and dist for production filesystem mutation APIs.

Inspect every hit.

At minimum include:

- writeFile;
- appendFile;
- open/create/write flags;
- rename;
- unlink;
- link;
- mkdir;
- rm;
- chmod;
- chown;
- truncate;
- fsync;
- createWriteStream.

Confirm:

- exactly one production module owns project filesystem mutation primitives;
- architecture allowlist names the exact file;
- no directory/wildcard exemption;
- dist agrees with source.

LIVE FALSIFICATION A:

add a write import/reference to a second module under src/editing.

Boundary test must fail naming it.

Restore.

LIVE FALSIFICATION B:

add a write import/reference outside src/editing, e.g. src/inventory.

Boundary test must fail naming it.

Restore.

--------------------------------------------------
C2 — NO PERSISTENCE
--------------------------------------------------

After composition tests complete, scan:

- repository root;
- every controlled test fixture root;
- every known temporary candidate root.

Look for Path Code-created:

- temp residue;
- .bak;
- .orig;
- editor backups;
- journals;
- locks;
- progress files;
- .path-code;
- undo state;
- plan state;
- authorization/provenance databases.

Record exact roots, command/mechanism, and output.

Expected:

none beyond authorized targets.

Confirm GAP-031 remains OPEN and was not silently closed by Phase 3.

--------------------------------------------------
C3 — RECOVERY SHAPES
--------------------------------------------------

Re-run current committed induced-failure tests and confirm the fault seam is
actually exercised.

Required distinct shapes:

3B PRECOMMIT

- original target remains intact;
- temp candidate cleaned or cleanup failure explicit;
- no commit point.

3B COMMITTED_FAILURE

- replacement commit point reached;
- new bytes may remain;
- no rollback;
- invalidation/uncertainty preserved.

3C PREPUBLICATION

- target was not published by Path Code;
- candidate cleaned or cleanup failure explicit.

3C COMMITTED_FAILURE

- published target remains;
- after-state mismatch/read/durability failure does not delete or rewrite it;
- no rollback.

3D PARTIAL

- prior committed targets remain committed;
- stopping target is exact;
- later targets not attempted;
- nothing restored.

A passing recovery test with no induced failure is vacuous.

Confirm the fault seam/corruption is active.

--------------------------------------------------
C4 — 3B-H1 STILL HOLDING
--------------------------------------------------

Confirm:

- ConfigFailure has no stale prepared-config fallback;
- temp creation failure becomes FAILED_PRECOMMIT, not an escaping throw.

LIVE FALSIFICATION A:

reintroduce stale fallback.

Current corrupted-config test must fail.

Restore.

LIVE FALSIFICATION B:

restore escaping temp-creation throw behavior.

Current recovery test must fail.

Restore.

--------------------------------------------------
C5 — 3C-H1 STILL HOLDING
--------------------------------------------------

Confirm:

- CREATE_FILE maps to the amended creation ActionClass;
- authorization-time and mutation-time restriction both hold;
- PublishedCreationVerificationTarget is opaque/internal;
- verification read accepts no caller path;
- CreationAfterStateEvidence remains distinct from repository knowledge.

LIVE FALSIFICATION A:

bypass CREATE_FILE action restriction.

Current authorization/mutation test must fail.

Restore.

TYPE/ARCHITECTURE FALSIFICATION B:

attempt to construct the publication verification target from a plain object
and/or call verification with a path.

The intended type/signature boundary must fail.

Restore.

==================================================
TASK D — CONSTITUTION, LESSONS, LEDGERS, TYPES
==================================================

--------------------------------------------------
D1 — CONSTITUTION §11 THREE QUESTIONS
--------------------------------------------------

Answer Phase-wide:

Q1.
Did the Phase 3D Master contain the required Foundation Compatibility
Preflight with every row source-confirmed?

Q2.
Were every other relevant new Phase 3 concept represented or amended before
dependent implementation?

State plainly:

- creation ActionClass was not initially represented before 3C;
- 3C-H1 corrected it;
- the Constitution was introduced in response.

Then inspect for any remaining uncorrected concept, including:

- created-vs-modified provenance;
- mutation evidence vocabulary;
- authored-but-not-reobserved knowledge;
- committed-failure vocabulary;
- plan partiality.

For each state:

- existing representation;
- whether it is truthful;
- whether the next phase would inherit a false assumption.

A known limited but truthful vocabulary is not automatically a blocker.

Q3.
Did Phase 3 silently map a new concept onto an older semantically different
one?

Known historical case:

- uncontracted published-path read in 3C;
- corrected by 3C-H1 operation-bound verification authority.

Search for any remaining case.

Any uncorrected semantic substitution is a finding.

--------------------------------------------------
D2 — CONSTRUCTION LESSONS / PRIMARY ORIGIN
--------------------------------------------------

Do NOT require new Gap Ledger schema fields.

The frozen Constitution added no new Gap Ledger classification/lifecycle
values solely for origin metadata.

The audit report itself records these construction lessons:

1. 3C after-state through Phase 2B reader was unsatisfiable:
   primary origin CONTRACT;
   Constitution §5.1.

2. Draft 3D permissive-removal test could not pass because preflight saw the
   restriction:
   primary origin CONTRACT;
   Constitution §5.1;
   caught before implementation.

3. GAP-046 was initially softened despite frozen contradiction:
   primary origin CONTRACT;
   Constitution §5.5.

Confirm each lesson is traceable through immutable contracts, reports,
amendments, or gap records.

If traceability is missing:

record a closure-bookkeeping finding.

Do not manufacture origin fields in Gap Ledger v1.

--------------------------------------------------
D3 — CAPABILITY LEDGER
--------------------------------------------------

Verify mechanically:

- edit-contracts PASS_FROZEN;
- existing-file-replacement PASS_FROZEN;
- safe-file-creation PASS_FROZEN;
- multi-file-coordination PASS_FROZEN;

and each cites corrected implementation evidence, not superseded defective
code.

Verify:

safe-editing
→ DECLARED / IN PROGRESS

The audit must not promote it.

Add a permanent self-observation test proving safe-editing does not derive
PHASE_VERIFIED at the audit HEAD.

Use the actual current ledger/verifier model.

If the model has an explicit phase-audit/closure evidence shape:

falsify the boundary by temporarily supplying only one half and confirm
PHASE_VERIFIED is not earned.

If the model has no phase-level evidence shape until closure:

prove the current record can derive no state stronger than DECLARED and record
that closure is responsible for introducing the phase evidence.

Do not invent a new ledger architecture inside the audit.

--------------------------------------------------
D4 — GAP LEDGER
--------------------------------------------------

Verify without reclassification:

- every Phase 3 gap has lifecycle;
- every CLOSED gap has resolvable closing commit;
- GAP-046 and GAP-047 are CLOSED against immutable corrective commits;
- GAP-043, GAP-044, GAP-045 remain OPEN with closure conditions;
- GAP-031, GAP-035, GAP-036, GAP-037, GAP-040, GAP-041 retain their current
  reviewed states;
- every NON_BLOCKING_LIMITATION states:
  why non-blocking,
  missing evidence,
  closure condition.

Any new finding:

- UNREVIEWED;
- proposedClass only;
- lifecycle OPEN.

--------------------------------------------------
D5 — COMPILE-TIME SWEEP
--------------------------------------------------

Record:

- total @ts-expect-error directives;
- TS2578 count.

Spot-check one intended type boundary from each:

- Phase 3A;
- Phase 3B;
- Phase 3C;
- Phase 3D.

For each:

- remove only the directive;
- capture exact compiler error;
- confirm intended type/property;
- restore;
- typecheck PASS.

==================================================
NEW AUDIT TESTS — FALSIFIABILITY
==================================================

Every new audit test that carries a conclusion must be shown capable of
failing.

Use the smallest condition that removes or violates what the test claims to
detect.

At minimum record these audit-level falsifications:

A-F1 — WRITE/READ FINGERPRINT BRIDGE

After Path Code writes but before fresh re-observation, mutate the fixture
bytes externally.

The fresh Phase 2 fingerprint equality test must fail.

A-F2 — AUTHORED-TO-REOBSERVED TRANSITION

Use the old inventory instead of taking the required fresh inventory.

The created-file RepositoryEntry assertion must fail.

A-F3 — STALE PRECONDITION BRIDGE

Temporarily bypass the exact 3B before-state currentness comparison.

The old-prepared mutation in B3 must cease refusing and the composition test
must fail.

Restore.

A-F4 — GIT POINT-IN-TIME

Substitute G0 where the test expects freshly collected G1.

The modified-worktree assertion must fail.

A-F5 — DENIAL COMPOSITION

Remove the active deny-path condition from the controlled fixture while
retaining refusal expectations.

The denial-composition test must fail.

A-F6 — ACTION-CLASS INDEPENDENCE

Temporarily bypass/swap one creation/modification action mapping.

The phase-wide independence test must fail.

Restore.

A-F7a — CONFIG FAILURE

Replace malformed config with valid config while retaining fail-closed
expectations.

The composition test must fail.

A-F7b — ABSENT PERMISSIVENESS

Replace ABSENT with malformed config while retaining success expectations.

The permissive-half test must fail.

A-F8 — PARTIAL PLAN HONESTY

Temporarily misclassify COMMITTED_FAILURE as no commit or attach an unchanged
claim to NOT_ATTEMPTED.

B8 must fail.

Restore.

A-F9 — WRITE BOUNDARY INSIDE EDITING

C1 falsification A.

A-F10 — WRITE BOUNDARY OUTSIDE EDITING

C1 falsification B.

A-F11 — 3B-H1 STALE FALLBACK

C4 falsification A.

A-F12 — 3B-H1 TEMP-CREATE THROW

C4 falsification B.

A-F13 — 3C-H1 ACTION RESTRICTION

C5 falsification A.

A-F14 — 3C-H1 VERIFICATION AUTHORITY

C5 falsification B.

For each:

- exact condition/corruption;
- focused test;
- exact observed failure;
- intended reason;
- exact restoration;
- final PASS.

A test-level fixture falsification is acceptable when it removes the real
condition the test claims to detect.

A production-source corruption is required where the conclusion concerns a
load-bearing production boundary.

==================================================
PHASE 3 COMPLETE CRITERIA
==================================================

PHASE 3 SAFE EDITING — COMPLETE requires ALL:

1. Stage 1 E1 evidence record COMPLETE;

2. baseline/ancestry/test total verified;

3. SE-001 through SE-020 all SATISFIED_PHASE_WIDE with admissible evidence;

4. B1 full pipeline passes and fresh Phase 2 fingerprints match all recorded
   Phase 3 after-state evidence;

5. B2 authored evidence becomes repository knowledge only by re-observation;

6. B3 old snapshot and old prepared mutation both detect staleness while fresh
   edit succeeds;

7. B4 Git state remains point-in-time;

8. B5 denial holds across read/preparation/mutation/plan surfaces without
   requiring impossible denied prepared objects;

9. B6 EDIT and CREATE_FILE restrictions remain independent at single and plan
   scale;

10. B7 ConfigFailure fails closed and successful ABSENT permits across all
    applicable Phase 2/3 boundaries;

11. B8 partial plan result matches fresh repository observation and makes no
    claim for NOT_ATTEMPTED;

12. exactly one production write module remains, with inside/outside
    falsifications;

13. no persistence/residue exists in controlled scope and GAP-031 remains open;

14. all five recovery shapes are actively induced and honest;

15. both 3B-H1 corrections remain present and falsifiable;

16. both 3C-H1 corrections remain present and falsifiable;

17. Constitution §11 questions answered with no uncorrected concept/mapping;

18. construction lessons recorded without inventing Gap Ledger schema;

19. four capabilities cite corrected code and remain PASS_FROZEN;

20. safe-editing remains DECLARED and cannot prematurely derive
    PHASE_VERIFIED;

21. all Phase 3 gap states/closing commits validate;

22. TS2578 = 0 and four intended-error spot checks pass;

23. every new audit test is demonstrated capable of failing;

24. no production defect is found;

25. no frozen contract/preflight contradiction remains;

26. runtime dependencies remain 0;

27. working tree clean;

28. Phase 3 closure not created;

29. Phase 4 not started.

If ANY fails:

PHASE 3 SAFE EDITING — NOT COMPLETE

No closure.
No promotion.
No production repair in this audit.

==================================================
AUDIT REPORT
==================================================

Create:

docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md

Record:

- Stage 1 E1 commit and result;
- audit baseline;
- actual test total;
- all 20 SE entries;
- B1 through B8;
- write boundary scans/falsifications;
- persistence scan;
- recovery;
- 3B-H1/3C-H1;
- Constitution §11;
- construction lessons;
- capability/gap ledgers;
- compile-time sweep;
- A-F1 through A-F14;
- complete criteria 1 through 29;
- findings;
- NOT VALIDATED;
- Git state.

==================================================
ON COMPLETE
==================================================

Commit exactly:

Freeze Path Code Phase 3 safe editing integration audit

Commit may contain:

- new additive audit tests;
- docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md;
- UNREVIEWED gap records/render only if genuinely discovered.

The audit contract was already frozen in Stage 1.

NO src/** production changes.

NO capability promotion.

NO closure document.

After commit:

record full Audit SHA.

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run cli:smoke
npm run check

Verify:

- working tree clean;
- safe-editing still DECLARED;
- Phase 3 closure absent;
- Phase 4 absent.

Next permitted operation:

PHASE 3 CLOSURE — DOCUMENT-ONLY

Do not perform closure inside this package.

==================================================
ON NOT COMPLETE
==================================================

Restore every temporary source/test corruption.

Return the repository to a clean, passing baseline.

Do not leave a failing test under tests/**.

Preserve the exact audit evidence durably:

docs/audit-artifacts/PHASE_3_INTEGRATION_NOT_COMPLETE/

At minimum include:

- exact new audit test source as .ts.txt files;
- failure outputs;
- SHA-256 manifest;
- restoration proof.

Create:

docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md

Commit exactly:

Record Path Code Phase 3 integration audit finding

Commit:

- report;
- durable audit artifacts;
- UNREVIEWED gap record if required.

Do not touch capability ledger.

Do not create closure.

Next permitted operation:

smallest corrective pass
→ then FULL Phase 3 re-audit

Not a delta audit.

==================================================
NOT VALIDATED — MUST BE NON-EMPTY
==================================================

At minimum report applicable limitations:

- audit executed on this host; platform/environment-specific gaps remain;

- a COMPLETE audit means no defect was found by this evidence, not that no
  defect can exist;

- residual per-target filesystem races remain as recorded gaps;

- no rollback exists and none is tested;

- deletion and directory creation are outside Phase 3;

- authored creation evidence requires re-observation for repository knowledge;

- hostile TypeScript casts remain possible;

- safe-editing PHASE_VERIFIED depends on later closure evidence;

- the Constitution §10 baseline audit has not run;

- Phase 4 has not started.

==================================================
FINAL COORDINATED REPORT
==================================================

Return:

PATH CODE — PHASE 3D-E1 + PHASE 3 INTEGRATION AUDIT
COORDINATED REPORT

Overall:
PASS / PARTIAL / FAIL

Starting HEAD:
424b6de77e227ffa702fad4cdb18aade77572003

Stage 1 E1:

- result:
- E1 Commit:
- contract files:
- evidence-gap matrix:
- D-F1..D-F11:
- type A/C/D/H:
- architecture 1..58:
- Task A–D/helper/seam:
- baseline/Commit A/Commit B/final test arithmetic:
- production changes:
  MUST BE NONE
- capability changes:
  MUST BE NONE

Stage 2 Audit:

- result:
- Audit Commit:
- baseline:
- final test total:
- SE-001..SE-020:
- B1:
- B2:
- B3:
- B4:
- B5:
- B6:
- B7:
- B8:
- write boundary:
- persistence:
- recovery:
- 3B-H1:
- 3C-H1:
- Constitution §11:
- construction lessons:
- ledgers:
- compile-time:
- A-F1..A-F14:
- complete criteria:
- findings:

Capability states:

- edit-contracts:
- existing-file-replacement:
- safe-file-creation:
- multi-file-coordination:
- safe-editing:

Git:

- complete ancestry:
- E1 Commit:
- Audit Commit:
- working tree:
- push:
  NO
- closure created:
  NO
- Phase 4 started:
  NO

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

If overall PASS:

Phase 3D evidence:
COMPLETE

Phase 3 Safe Editing Integration Audit:
COMPLETE

safe-editing:
DECLARED / IN PROGRESS

Next permitted operation:

PHASE 3 CLOSURE — DOCUMENT-ONLY

DO NOT PERFORM PHASE 3 CLOSURE INSIDE THIS PACKAGE.
