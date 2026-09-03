PATH CODE — PHASE 3D-E1 EVIDENCE COMPLETION CONTRACT

Exact Stage 1 contract extracted from the coordinated FINAL MERGED package.
Stage 2 lives in docs/passes/PHASE_3_INTEGRATION_AUDIT_CONTRACT.md.
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
STAGE 0 — BASELINE GATE
######################################################################

Verify:

git rev-parse HEAD
==
424b6de77e227ffa702fad4cdb18aade77572003

git status --short --branch
==
clean main

Verify ancestry at minimum:

58439d90cfb0b786137454d21bc88f994fcd0270
0b3bed86f8a05674a652359b958d728ae8086244
dcb347fc613114be810b8caf371f0bea8b261285
a73a623cfed77d2c2dc0238d386d40d4d1595065
28efece61800d4b6dd92465d3499e648268365a3
4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9
424b6de77e227ffa702fad4cdb18aade77572003

plus every checkpoint required by:

docs/PHASE_2_CLOSURE.md

Verify:

- docs/passes/PHASE_3D_CONTRACT.md exists;
- its SHA-256 equals:
  97fe774f71d570a1a7875bdaeddff2cd092a1805f9ace3f654678f08df8984e3;
- Phase 3 integration audit is absent;
- Phase 3 closure is absent;
- runtime dependencies are 0.

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

Determine the ACTUAL runtime-test total at baseline.

Do not infer it from the Phase 3D summary.

If materially different:

STOP AND REPORT.

######################################################################
STAGE 1 — PHASE 3D-E1 EVIDENCE COMPLETION
######################################################################

PRIMARY ORIGIN

EVIDENCE

The Phase 3D code is not presumed defective.

Stage 1 asks only whether the immutable repository record fully demonstrates
the requirements of the exact executed 3D contract.

==================================================
E1.1 — EVIDENCE-GAP MATRIX
==================================================

Compare:

docs/passes/PHASE_3D_CONTRACT.md

against:

docs/reports/PHASE_3D_REPORT.md

Create a line-by-line requirement/evidence matrix for the report obligations.

At minimum determine whether the committed report contains:

1. exact Multitask Task A–D results;

2. exact files added and modified;

3. exact contract copy/hash verification;

4. complete plan-construction evidence;

5. complete preflight evidence;

6. complete execution/result/knowledge evidence;

7. exact D-F1 through D-F11 observed failure outputs;

8. exact restoration/final-pass evidence for D-F1 through D-F11;

9. exact type-level A, C, D, and H compiler diagnostics;

10. config-cache architecture proof;

11. all 58 architecture-audit answers;

12. actual baseline / Commit A delta / Commit B delta / final runtime totals;

13. typecheck, tests, build, CLI smoke, check, and ledger:verify at final HEAD;

14. complete Git/ancestry/working-tree evidence;

15. non-empty NOT VALIDATED.

Do not duplicate evidence already present.

Do not treat:

"/tmp contains it"

as repository evidence.

==================================================
E1.2 — LIVE D-F1 THROUGH D-F11 COMPLETION
==================================================

The Phase 3D report says detailed output was captured at:

/tmp/phase3d-df/evidence.md

If that file exists:

- compute and record its SHA-256;
- use it only as an index to the original evidence;
- do not treat its existence alone as admissible repository evidence.

For every D-F1 through D-F11:

re-perform the exact live corruption against the current frozen Phase 3D code
unless the committed report already contains the exact compiler/test output
and exact restoration evidence.

Because the committed report currently appears to summarize rather than quote
the actual outputs, the expected result is that all eleven are re-performed.

For every D-F:

1. record exact pre-corruption source hash/diff state;

2. apply only the named corruption from
   docs/passes/PHASE_3D_CONTRACT.md;

3. run the named focused test;

4. capture the exact failing assertion/compiler output;

5. state why it is the intended failure;

6. restore exact source;

7. verify temporary diff is removed;

8. rerun the focused test to PASS.

Do not report:

- "would fail";
- "permanent test covers it";
- "verification exists";
- "same behavior as before."

Actual observed failure is required.

==================================================
E1.3 — TYPE-LEVEL A / C / D / H
==================================================

Use the exact type contracts from the executed Phase 3D contract.

For each of A, C, D, and H:

1. identify the exact @ts-expect-error directive;

2. record its file and line;

3. verify typecheck passes with the directive;

4. remove ONLY that directive;

5. capture the exact compiler diagnostic;

6. confirm the error names the intended type/property boundary;

7. restore exact source;

8. verify temporary diff removed;

9. typecheck PASS.

Also record:

- total @ts-expect-error directive count;
- TS2578 count.

TS2578 = 0 proves every directive is load-bearing.

It does not prove intended-error identity; the four probes do that.

==================================================
E1.4 — 58-QUESTION ARCHITECTURE AUDIT
==================================================

Answer every question 1 through 58 from:

docs/passes/PHASE_3D_CONTRACT.md
§40 — ARCHITECTURE AUDIT

Use the exact question numbering and wording.

For each answer record:

- YES / NO / NOT APPLICABLE;
- evidence source:
  test, source scan, dist scan, or reviewed-by-inspection;
- exact file/test/command.

Any answer that violates a MUST BE NO / required condition is a finding.

Do not compress the 58 questions into the P3D table.

The P3D table and the architecture audit are separate evidence obligations.

==================================================
E1.5 — MULTITASK / HELPER / SEAM ACCOUNTING
==================================================

Record exactly:

- Task A result;
- Task B result;
- Task C result;
- Task D result;
- whether any shared read-only helper was extracted from 3B/3C;
- if yes:
  - exact files/functions;
  - affected inherited tests;
  - exact load-bearing inherited falsification rerun;
- whether the private coordinator operation-binding seam was needed;
- if yes:
  - exact module;
  - exact operations;
  - public/dist encapsulation;
  - proof it delegates to real 3B/3C operations rather than fabricating
    terminal evidence.

If neither extraction nor seam was used:

say so explicitly.

==================================================
E1.6 — FINAL VALIDATION ARITHMETIC
==================================================

At current Commit B HEAD verify and record:

- baseline runtime total before 3D:
  541, independently verified from historical baseline evidence;

- runtime total at Commit A:
  determine mechanically;

- Commit A delta:
  Commit A total minus 541;

- runtime total at Commit B:
  determine mechanically;

- Commit B delta:
  Commit B total minus Commit A total;

- current/final runtime total;

- test-file count;

- typecheck;
- tests;
- build;
- CLI smoke;
- npm run check;
- ledger:verify;
- runtime dependencies;
- working tree.

If historical commit test execution is impractical because dependencies/tooling
cannot be reconstructed without changing the repository:

use repository-recorded test-list evidence at each commit where available,
state the exact limitation, and do not invent arithmetic.

==================================================
E1.7 — E1 REPORT
==================================================

Create:

docs/reports/PHASE_3D_E1_EVIDENCE_COMPLETION_REPORT.md

Record:

- baseline and current HEAD;
- exact E1 evidence-gap matrix;
- D-F1 through D-F11 exact outputs;
- type A/C/D/H exact diagnostics;
- all 58 architecture answers;
- Task A–D/helper/seam accounting;
- validation arithmetic;
- current capability states;
- proof no production source changed;
- NOT VALIDATED;
- unresolved issues.

Conclusion is exactly one:

PHASE 3D EVIDENCE RECORD — COMPLETE

or

PHASE 3D EVIDENCE RECORD — NOT COMPLETE

Do not change Phase 3D production code.

Do not change Capability Ledger state.

==================================================
E1.8 — STAGE 1 COMMIT
==================================================

If E1 is COMPLETE:

commit exactly:

Complete Path Code Phase 3D evidence record

Commit contents:

- docs/passes/PHASE_3D_E1_CONTRACT.md
- docs/passes/PHASE_3_INTEGRATION_AUDIT_CONTRACT.md
- docs/reports/PHASE_3D_E1_EVIDENCE_COMPLETION_REPORT.md

plus no other files unless a deterministic documentation manifest is required.

NO src/**.
NO permanent tests/**.
NO ledger capability changes.
NO README change.

After commit:

record full E1 SHA.

Run:

npm run ledger:verify
npm run check

Verify:

- production/test tree unchanged from 424b6de;
- working tree clean.

Then proceed to Stage 2.

If E1 is NOT COMPLETE:

restore all temporary changes.

Commit exactly:

Record Path Code Phase 3D evidence finding

Commit:

- both exact stage contracts;
- the E1 report;
- durable evidence artifacts required to explain the finding.

STOP.

Do not begin Stage 2.

