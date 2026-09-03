PATH CODE — PHASE 3-R1
CLOSURE RECONCILIATION PASS CONTRACT
FINAL MERGED

REPOSITORY
/Users/achahbi/Projects/path-code

PURPOSE
Restore a fully admissible Phase 3 closure evidence chain without reopening the
already-corrected Safe Editing implementation.

GOVERNING BALANCE
Maximum velocity inside proven boundaries.
This is a bounded evidence/closure reconciliation, not another Phase 3 redesign.
Run fast. Land it. Stop when the closure chain is truthful.

==================================================
THIS CONTRACT IS A REPOSITORY ARTIFACT
==================================================

Per Foundation Extensibility Constitution V1 §9, commit this exact executed
contract as:

docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md

inside the Stage 0 commit.

The contract is the instruction.
The reports record what happened.
Both are evidence.

Do not post-hoc rewrite, amend, beautify, or replace this contract after Stage 0.
If a later recovery materially changes the governing instruction, write a
separate recovery supplement beside it. Never rewrite the executed contract.

==================================================
PRIMARY ORIGIN OF THIS CORRECTIVE PASS
==================================================

PRIMARY ORIGIN: EVIDENCE

Reason:
Phase 3 production hardening is not presently disproven. The invalid state is
that safe-editing was promoted to PHASE_VERIFIED using a closure evidence chain
whose required independence and one required falsification were not proven.

CONTRIBUTING ORIGIN: CONTRACT

Reason:
The prior closure-linkage contract §6.6 was jointly unsatisfiable: it required
safe-editing PHASE_VERIFIED / GAP-051 CLOSED, forbade audit-test changes, and
also required the final live test suite to pass even though those audit tests
bound current canonical ledger state.

Per Constitution V1, origins are descriptive report metadata only. Do NOT add a
new Gap Ledger schema field or classification value for origin.

==================================================
WHY THIS PASS EXISTS
==================================================

A read-only reconciliation of HEAD:

ee586732ac602eabbf310888b7b44c9bdf8ef519

established four findings whose decisive details were not durably represented
in the repository.

F1  STAGE 5 RE-AUDIT — PROVEN NOT INDEPENDENT

    The public-authority hardening package required a FRESH independent auditor
    after Stage 4 and expressly forbade reuse of the census writer,
    Constitution-amendment writer, correction implementer, and relink writer.

    A fresh auditor task was launched. It failed with [resource_exhausted]
    before producing the re-audit report or commit. The parent session — the
    same writer that had already produced Stages 0–4 — then stated that it was
    continuing Stage 5 itself, wrote the re-audit artifacts, and committed:

    5606b49ec753b8988213b6c912d7de5de51d52ee

    The committed report calls itself a fresh full re-audit but does not record
    the failed independent attempt or the parent takeover.

    This recurs at the phase-level evidence gate that GAP-051 was intended to
    repair. It does not erase the report at 5606b49; it makes that report
    progression-ineligible as the independent audit required for final Phase 3
    closure.

F2  STAGE 1 §1.4 DOWNGRADE FALSIFICATION — EXACT PROCEDURE NOT PROVEN

    The Stage 1 census at eabbc19 asserts the §1.4 sequence in prose. The live
    restore script raised IndexError before a required MUST-FAIL result was
    captured. Its downgrade-restoration line was after the failing line and did
    not run in that process. The following focused vitest run failed in a state
    consistent with freezeEvidence having remained restored. The recorded
    ledger:verify PASS was at 696ef4f, not at the committed downgraded Stage 1
    checkpoint.

    An in-memory derivation test encoded the semantic direction but did not
    constitute the exact live sequence the contract claimed. That test was then
    replaced during later relink evidence.

F3  PRIOR §6.6 CLOSURE LINKAGE — JOINTLY UNSATISFIABLE

    The prior contract required simultaneously:

    A. safe-editing PHASE_VERIFIED and GAP-051 CLOSED;
    B. no audit-test changes;
    C. final npm test PASS.

    The audit suites read live canonical ledger state. Once A became true,
    stale assertions for DECLARED / GAP-051 OPEN necessarily became false.
    Therefore A ∧ B ∧ C could not all hold.

    Commit ee58673 changed two audit suites and scripts/ledger-verify.ts despite
    the contract not authorizing those files. One audit-suite change removed a
    historical half-citation issueLedgerVerification probe proving that
    declaration-only evidence cannot yield PHASE_VERIFIED. That was an audit
    mechanism removal, not merely a live-state pin update.

    Primary origin of F3: CONTRACT.
    Contributing cause: EVIDENCE shape — historical-audit tests were mixed with
    live-HEAD canonical-state assertions.

F4  FINAL-HEAD RUNTIME FIGURE — 608 NOT DURABLY RECORDED

    Closure A correctly records 607 tests at:

    04591e400f6b8efe7190ce01faef4da97d0eb984

    and the Capability Ledger correctly binds that historical figure to that
    closure commit. Final validation at ee58673 reported 608 tests, but no
    immutable repository artifact records that later total.

CONSEQUENCE

safe-editing currently derives PHASE_VERIFIED from phaseAuditEvidence that
points to a re-audit lacking the independence property required by its own
contract. Therefore ee58673 is preserved as historical evidence but is not the
final progression-valid Phase 3 closure checkpoint.

WHAT IS NOT IN QUESTION

The Phase 3 public-authority correction itself is not reopened by these
findings. The three known public mechanism-substitution seams were corrected at:

5386f349eccd7c69ff696619ffc426757e3e91d0

and relinked at the later Phase 3 hardening checkpoint. This pass re-audits them
but does not re-implement them.

==================================================
NO-UNTRACKED-FINDING RULE
==================================================

Every genuine finding discovered in this pass MUST end in exactly one of:

1. corrected and durably closed by immutable evidence in this pass;
2. OPEN in the canonical Gap Ledger with classification, missing evidence, and
   closure condition; or
3. proven to be an already-recorded frozen limitation, cited exactly.

Nothing may disappear into prose, chat, a terminal transcript, or an executor
summary.

Do not create duplicate gaps for intentional already-recorded design limits.

==================================================
WHAT THIS PASS DOES NOT DO
==================================================

- NO production changes under src/editing/
- NO redesign of Phase 3 mutation semantics
- NO rewrite, amend, rebase, squash, or removal of any historical commit
- NO deletion of any historical report
- NO deletion or weakening of any valid audit probe or falsification
- NO Foundation §10 Closed-Vocabulary & Foundation Extensibility Audit
- NO Phase 4 Master Contract
- NO Phase 4 implementation
- NO push
- NO remote creation

Every repository change is additive to history. Where the current canonical
record must change, the previous value is preserved in the reconciliation
report and the change is named as a supersession rather than pretending the old
checkpoint never existed.

==================================================
CURRENT BASELINE — VERIFY, DO NOT ASSUME
==================================================

Reported HEAD:

ee586732ac602eabbf310888b7b44c9bdf8ef519

Expected commit subject:
Link Path Code Phase 3 closure to safe-editing verification

START GATE

Run:

git rev-parse HEAD
git status --porcelain
git log -1 --oneline
npm run ledger:verify

Required:

- HEAD exactly ee586732ac602eabbf310888b7b44c9bdf8ef519
- working tree empty
- ledger:verify PASS

Required ancestors — verify each:

git merge-base --is-ancestor 696ef4fe58c21cdd527869309a2b9fd5abcd19a8 HEAD
git merge-base --is-ancestor 5386f349eccd7c69ff696619ffc426757e3e91d0 HEAD
git merge-base --is-ancestor 5606b49ec753b8988213b6c912d7de5de51d52ee HEAD
git merge-base --is-ancestor 04591e400f6b8efe7190ce01faef4da97d0eb984 HEAD

Each MUST exit 0.

Resolve these prefixes mechanically before any ledger/report use and record the
full SHAs in PHASE_3_R1_RECONCILIATION_REPORT.md:

git rev-parse eabbc19^{commit}
git rev-parse 164cf43^{commit}
git rev-parse 86accd3^{commit}

Also verify that GAP-052 through GAP-056 are unused at baseline.

If any ID is already occupied, STOP AND REPORT before mutation. Do not silently
renumber inside execution. The contract must be recovered explicitly with the
next contiguous unused IDs.

Session-reported runtime total at ee58673: 608.
VERIFY. Do not assume.

CURRENT DERIVED STATE — VERIFY:

edit-contracts               PASS_FROZEN
existing-file-replacement    PASS_FROZEN
safe-file-creation           PASS_FROZEN
multi-file-coordination      PASS_FROZEN
safe-editing                 PHASE_VERIFIED
repository-intelligence      PHASE_VERIFIED
foundation-kernel            PHASE_VERIFIED

The safe-editing PHASE_VERIFIED state is the current mechanical derivation but
is progression-ineligible pending this reconciliation.

==================================================
GOVERNING SOURCES
==================================================

docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md
docs/PHASE_3_SAFE_EDITING_MASTER.md
docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md
docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md
docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md
docs/ENGINEERING_SELF_OBSERVATION.md
docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md
docs/PHASE_3_CLOSURE.md
docs/GAP_LEDGER.md
machine-readable Capability Ledger v1
machine-readable Gap Ledger v1

Where this contract conflicts with a frozen Master, frozen amendment, or the
Foundation Extensibility Constitution:

THE FROZEN DOCUMENT GOVERNS.
STOP AND REPORT.

==================================================
FOUNDATION COMPATIBILITY PREFLIGHT
==================================================

FOUNDATION COMPATIBILITY PREFLIGHT inherited; no new foundational concept
introduced.

This is a corrective sub-pass, not a new major Master Contract. The mechanisms
used here already exist:

- Gap Ledger proposedClass → human reviewClassification flow;
- Gap lifecycle reopening/closure using existing fields;
- Capability phaseAuditEvidence removal/relink;
- GAP-040-style current-state supersession while preserving historical evidence;
- recordedFigure bound to an immutable document at an immutable commit;
- pass-level Git worktree use for historical verification;
- report/test evidence and existing evidence admissibility vocabulary.

The repository currently has NO mechanical proof of auditor-context
independence. This pass does NOT invent a new foundation vocabulary or evidence
tier to pretend otherwise. GAP-055 records that limitation. The audit result is
repository-recorded; the truth of the executor-independence attestation remains
ASSERTED under the existing self-observation vocabulary.

No foundation amendment is required for this pass.

==================================================
EXECUTOR ASSIGNMENT — BINDING
==================================================

This pass has THREE executor slots. They are not interchangeable.

EXECUTOR A
Stages 0, 1, and 2 only.
May be the current Cursor agent or another implementation/evidence agent.
May have knowledge of the prior hardening work.

EXECUTOR B
Stage 3 only.
MUST be a fresh session that has performed no prior write in this Phase 3-R1
chain and receives no conversation/session transcript from the public-authority
hardening execution or Stages 0–2 of this reconciliation.

A different agent product from Executor A is STRONGLY PREFERRED. For the
current workflow, a fresh Claude Code session is preferred for Executor B.
If the same product is used, it MUST still be a new isolated session with no
prior execution context.

EXECUTOR C
Stage 4 only.
May be Executor A in a resumed/new session.
MUST NOT be Executor B.

HARD INDEPENDENCE RULE

An executor that did not START a stage may not FINISH it.

If Executor B fails for any reason — resource exhaustion, timeout, crash,
provider error, context failure — Stage 3 is NOT continued by Executor A,
Executor C, or a parent session.

Instead:

1. leave the repository at the Stage 2 gate HEAD if no Stage 3 commit exists;
2. record only minimal failure metadata outside the repository:
   attempt number, executor product, time, failure class, whether any commit
   was created;
3. dispatch a NEW Executor B from the same Stage 2 gate HEAD;
4. the successful Executor B records prior failed-attempt metadata in the R1
   audit report as OPERATOR-SUPPLIED ATTEMPT METADATA, without receiving the
   failed auditor transcript or substantive reasoning.

The failed attempt's substantive transcript is forbidden input to the next
Executor B.

The pass hard-stops after Stage 0, Stage 2, and Stage 3 for the required human
or executor boundary.

==================================================
STAGE 0 — DURABLE FINDING RECORD
==================================================

EXECUTOR: A

RULE:
Record first. Act second.
Nothing in Stage 0 changes a derived capability state.

0.1 CREATE THE RECONCILIATION REPORT

Create:

docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md

Section §0 records F1–F4 with exact available evidence:

- full commit SHAs;
- exact file paths;
- source/report/test locations;
- failed independent-auditor resource_exhausted attempt;
- parent continuation into Stage 5;
- Stage 1 IndexError and its position before the restore line;
- failed focused vitest evidence;
- ledger:verify checkpoint mismatch;
- exact deleted half-citation probe;
- unauthorized Closure-B files;
- 607 historical figure binding;
- 608 session-only final validation claim.

Where a fact comes only from session/tool transcripts, state exactly:

"Source: session evidence; not previously repository-recorded. This report
records operator testimony about the session. The truth of the testimony is
ASSERTED under existing self-observation admissibility vocabulary."

Do not call ASSERTED evidence mechanically proven.

0.2 APPEND CANONICAL GAP RECORDS

Use existing Gap Ledger schema only.
Do not add origin fields or new classification/lifecycle values.

Append with proposedClass populated and reviewClassification = null.

GAP-052
Title:
Phase 3 re-audit at 5606b49 executed by a non-independent auditor

proposedClass:
BLOCKING_INVARIANT

lifecycle:
OPEN

sourceCheckpoint:
Phase 3-R1 reconciliation at ee58673

Description:
The fresh auditor task required by the hardening contract failed with
resource_exhausted before writing or committing. The Stage 0–4 writer session
then executed Stage 5 and committed 5606b49. The committed report does not
record that provenance break.

missingEvidence:
A fresh full Phase 3 re-audit at the corrected/reconciled checkpoint by an
executor session with no prior write in this R1 chain, plus a complete auditor
provenance/attestation block and immutable audit evidence.

closureCondition:
A fresh Stage 3 R1 auditor returns COMPLETE at the Stage 2 checkpoint; its
report contains the required provenance block; safe-editing phaseAuditEvidence
is later relinked to that immutable re-audit.

notes:
The prior GAP-051 canonical closure landed in ee58673 while its closedByCommit /
closureEvidence pointed to 5606b49. Those historical records remain immutable;
this gap supersedes them for progression.

---

GAP-053
Title:
Stage 1 §1.4 downgrade falsification not proven at eabbc19

proposedClass:
BLOCKING_INVARIANT

lifecycle:
OPEN

sourceCheckpoint:
Phase 3-R1 reconciliation at ee58673

Description:
The census asserted §1.4 success, but the live restore script raised IndexError
before capturing the required MUST-FAIL evidence; the restore-back line did not
run in that process; the following focused test failed in a state consistent
with freezeEvidence remaining restored; ledger:verify evidence cited the
pre-Stage-1 baseline rather than the committed downgrade checkpoint.

missingEvidence:
A historical derivation at immutable eabbc19 establishing the committed
downgrade state, the restore direction using exact pre-downgrade freezeEvidence
from the preceding canonical checkpoint, and current bidirectional freeze
falsifications.

closureCondition:
The missing original live run remains explicitly recorded as NOT PROVEN;
historical verification at eabbc19 establishes the semantic state the commit
actually encodes; both restore and removal directions are proven without
rewriting history; an immutable evidence report records the disposition.

---

GAP-054
Title:
Closure B §6.6 jointly unsatisfiable and historical audit mechanism removed

proposedClass:
BLOCKING_INVARIANT

lifecycle:
OPEN

sourceCheckpoint:
Phase 3-R1 reconciliation at ee58673

Description:
Prior §6.6 simultaneously required PHASE_VERIFIED/GAP-051 CLOSED, unchanged
audit tests, and final npm test PASS while those audit tests bound live
canonical state. ee58673 edited two audit suites and scripts/ledger-verify.ts
without contract authorization and removed the historical half-citation
issueLedgerVerification probe.

missingEvidence:
Restored historical probe; a ledger:verify consistency mechanism that derives
expectations from ledger shape rather than hardcoding phase status; an explicit
bounded rule authorizing only live-state assertion updates during closure.

closureCondition:
The deleted probe is restored without weakening; the ledger consistency gate is
shape-driven and falsified; this immutable R1 contract explicitly authorizes
only bounded live-state pin updates and forbids deletion/weakening of audit
mechanisms; the reconciliation report records the contract defect.

notes:
Primary origin in the corrective report: CONTRACT. Contributing cause: EVIDENCE
shape. No Gap Ledger schema field is added for origin.

---

GAP-055
Title:
Auditor independence is not mechanically verifiable from repository evidence

proposedClass:
NON_BLOCKING_LIMITATION

lifecycle:
OPEN

sourceCheckpoint:
Phase 3-R1 reconciliation at ee58673

Description:
The repository can record an auditor's report and operator attestation, but the
current self-observation model has no mechanical mechanism proving that the
auditor session received no forbidden transcript/context or performed no prior
write.

missingEvidence:
An approved repository-visible mechanism, if later required, that can bind an
independent audit execution to mechanically verifiable provenance rather than
operator testimony alone.

closureCondition:
A future Master/preflight deliberately defines and proves such a mechanism, or
explicitly dispositions the limitation while preserving truthful admissibility.
Do not preselect a schema field or force a foundation change in this pass.

whyNonBlocking (to be applied only if human review confirms the proposed class):
R1 can structurally enforce executor separation and record the audit result
mechanically while explicitly labeling the independence claim ASSERTED. The
limitation concerns proof of process provenance, not the audit's repository-
recorded tests/results themselves.

notes:
The R1 report presence is REPOSITORY_RECORDED; the truth of independence
attestation is ASSERTED. Do not invent OPERATOR_ATTESTED or another evidence
tier.

---

GAP-056
Title:
Final-head Phase 3 runtime test figure not durably recorded

proposedClass:
NON_BLOCKING_LIMITATION

lifecycle:
OPEN

sourceCheckpoint:
Phase 3-R1 reconciliation at ee58673

Description:
Closure A correctly binds 607 runtime tests to 04591e4. Final validation at
ee58673 reported 608 runtime tests, but no immutable closure/report/recordedFigure
records that final-head figure.

missingEvidence:
A final reconciliation closure artifact carrying the exact runtime total at its
immutable checkpoint plus a Capability Ledger recordedFigure bound to that
artifact/commit.

closureCondition:
The R1 closure reconciliation artifact records the exact final runtime total at
its own immutable commit; Capability Ledger binds the figure to that document
and commit; the historical 607 figure remains unchanged.

whyNonBlocking (to be applied only if human review confirms the proposed class):
The historical 607 figure is already truthful and correctly bound. Missing 608
recording is a final reporting/evidence-completeness defect, not evidence that
Safe Editing behavior is incorrect.

0.3 CAPABILITY KNOWN-LIMITATION REFERENCES

Add GAP-052, GAP-053, GAP-054, and GAP-056 to
safe-editing.knownLimitations.

Do NOT attach GAP-055 to any capability. It is a process/evidence-provenance
limitation, not a Safe Editing behavior limitation.

Do NOT reopen GAP-051 yet. That state change belongs to Stage 1.

0.4 RENDER / VERIFY

Run:

npm run gap:render
npm run ledger:verify

Both MUST PASS.

Verify and record that the seven derived capability states listed in CURRENT
BASELINE remain unchanged during Stage 0.

0.5 COMMIT EXACT CONTRACT

Commit this exact contract as:

docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md

in the same Stage 0 commit as the report/gap/proposed-class record.

STAGE 0 COMMIT EXACTLY:

Record Phase 3-R1 reconciliation findings

AFTER COMMIT:

- verify ancestry;
- ledger:verify PASS;
- working tree clean.

==================================================
STAGE 0 GATE — HUMAN REVIEW REQUIRED
==================================================

STOP.

Return to the operator:

- full Stage 0 commit SHA;
- F1–F4 summary;
- GAP-052 through GAP-056 proposed classes;
- current derived capability states;
- ledger:verify result;
- clean-tree result.

The operator MUST explicitly approve or revise reviewClassification before
Stage 1 begins.

No executor may infer that human approval occurred.

==================================================
STAGE 1 — REVIEW CLASSIFICATION + DOWNGRADE INVALID CLOSURE
==================================================

EXECUTOR: A

Proceed only after explicit operator approval of Stage 0 classifications.

1.0 RECORD THE HUMAN-REVIEWED CLASSIFICATIONS

If the operator approves the proposed classes unchanged, set:

GAP-052 reviewClassification = BLOCKING_INVARIANT
GAP-053 reviewClassification = BLOCKING_INVARIANT
GAP-054 reviewClassification = BLOCKING_INVARIANT
GAP-055 reviewClassification = NON_BLOCKING_LIMITATION
GAP-056 reviewClassification = NON_BLOCKING_LIMITATION

For GAP-055 and GAP-056 include the whyNonBlocking text already specified in
Stage 0.

If the operator changes a class, use exactly the reviewed value and record the
reason in the report. Do not improvise a third classification.

1.1 SUPERSEDE CURRENT PHASE-LEVEL EVIDENCE

safe-editing:
remove only phaseAuditEvidence.

Preserve in PHASE_3_R1_RECONCILIATION_REPORT.md §1:

- previous derived state: PHASE_VERIFIED;
- previous auditReportPath;
- previous auditCommit: 5606b49ec753b8988213b6c912d7de5de51d52ee;
- previous auditConclusionNeedle;
- previous closureDocumentPath;
- previous closureCommit: 04591e400f6b8efe7190ce01faef4da97d0eb984;
- previous auditCheckpointNeedle;
- superseding finding: GAP-052;
- statement that every cited historical artifact/commit remains immutable.

This is a current-state supersession. It does not delete history.

Retain safe-editing implementationEvidence.
Retain all existing recordedFigures, including the 607 figure bound to 04591e4.

1.2 REOPEN GAP-051 HONESTLY

Set GAP-051:

lifecycle CLOSED → OPEN
remove current closedByCommit
remove current closureEvidence

Move the prior closure values into notes exactly as historical facts:

"Prior canonical closure landed in ee58673 and cited 5606b49 /
docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md. Superseded for progression
by GAP-052 and Phase 3-R1 reconciliation. Historical commits/reports remain
immutable."

Add GAP-051 to safe-editing.knownLimitations while it is OPEN.

1.3 RESTORE THE HISTORICAL HALF-CITATION PROBE

Mechanically inspect:

git show 04591e400f6b8efe7190ce01faef4da97d0eb984:tests/integration/phase3-safe-editing-audit.test.ts

Identify the issueLedgerVerification half-citation probe that proved
insufficient/declaration-only citation evidence cannot yield PHASE_VERIFIED.

Restore that probe's mechanism and assertions exactly in semantic effect.
Restore imports required solely by that probe.

Do NOT blindly restore the entire historical test file.
Do NOT overwrite legitimate post-04591e4 tests.
Do NOT restore obsolete live-state pins.

If the probe cannot be identified unambiguously at 04591e4, STOP AND REPORT.
Do not reconstruct it from memory.

For live canonical-state assertions in:

- tests/integration/phase3-safe-editing-audit.test.ts
- tests/integration/phase3-reaudit-public-surface.test.ts
- tests/selfobs/derivation.test.ts

assert only the state that ACTUALLY derives after phaseAuditEvidence removal.
Record that state. Do not pre-assume DECLARED or IMPLEMENTED.

Historical mechanism test and live-state pin are separate concerns.

1.4 MAKE ledger:verify SHAPE-DRIVEN, NOT PHASE-NAME-DRIVEN

The current hardcoded safe-editing state expectation must be removed.

Implement one small pure tooling rule, used by scripts/ledger-verify.ts:

FOR EVERY capability record:

- if phaseAuditEvidence IS present, verified derivation MUST be
  PHASE_VERIFIED;
- if phaseAuditEvidence IS absent, verified derivation MUST NOT be
  PHASE_VERIFIED.

This rule is universal. It does not hardcode capability IDs and does not encode
which phases happen to be closed today.

Prefer factoring this into a tiny pure helper under scripts/lib/ if that is the
smallest way to make the rule directly testable. This is tooling, not product
runtime behavior.

Do NOT change the Capability Ledger schema.
Do NOT add a phase-level capability enum/list merely to support this gate.

PERMANENT FALSIFICATIONS

1-F1:
Construct a verified test case with phaseAuditEvidence present but a derived
state other than PHASE_VERIFIED. The shape-consistency helper MUST reject it.

1-F2:
Construct a verified test case with phaseAuditEvidence absent but a derived
PHASE_VERIFIED state. The helper MUST reject it.

Then prove truthful matching cases pass.

The test must prove the helper used by ledger:verify, not a duplicate rule that
ledger:verify does not call.

1.5 PRESERVE EXISTING DERIVATION FALSIFICATIONS

In tests/selfobs/derivation.test.ts:

- update only the live safe-editing expected state to what actually derives;
- retain the existing phase-promotion falsification;
- retain the existing trio relink falsification;
- do not weaken their corruption → failure → restore logic.

1.6 LIVE DOWNGRADE FALSIFICATION

This is not a narrative claim.

On the intended Stage 1 working tree BEFORE commit:

A. run a focused derivation command/test whose expectation is
   safe-editing PHASE_VERIFIED.
   It MUST FAIL because phaseAuditEvidence has been removed.
   Capture exact failing output and exit code.

B. run the same focused derivation with the actual derived state expected.
   It MUST PASS.

C. run npm run ledger:verify on the intended Stage 1 tree.
   It MUST PASS.

If any script errors before producing the expected evidence, STOP AND REPORT.
A shell wrapper exit 0 does not rescue a failed inner probe.

After the Stage 1 commit exists, rerun B and C at the immutable Stage 1 HEAD and
record the full SHA and output.

1.7 FULL GATE

Run:

npm run gap:render
npm run check

MUST PASS.
Record exact runtime test total.

STAGE 1 COMMIT EXACTLY:

Downgrade Phase 3 closure pending independent re-audit

STAGE 1 GATE

Required:

- safe-editing derives NOT PHASE_VERIFIED;
- edit-contracts PASS_FROZEN;
- existing-file-replacement PASS_FROZEN;
- safe-file-creation PASS_FROZEN;
- multi-file-coordination PASS_FROZEN;
- GAP-051 OPEN;
- GAP-052 OPEN;
- GAP-053 OPEN;
- GAP-054 OPEN;
- GAP-055 OPEN;
- GAP-056 OPEN;
- restored historical half-citation probe passes;
- shape-driven ledger gate passes and its falsifications pass;
- ledger:verify PASS at immutable Stage 1 HEAD;
- npm run check PASS;
- working tree clean.

==================================================
STAGE 2 — §1.4 HISTORICAL DISPOSITION
==================================================

EXECUTOR: A

Stage 2 establishes what the immutable Stage 1 downgrade commit actually
encoded. It does NOT pretend the failed original live run happened.

Use TWO commits to avoid self-referential closure evidence.

--------------------------------------------------
STAGE 2A — HISTORICAL EVIDENCE
--------------------------------------------------

2A.1 DETACHED TEMPORARY WORKTREE

Resolve the full eabbc19 SHA from Stage 0 evidence.

Create a unique detached worktree outside the repository, for example:

R1_WORKTREE="$(mktemp -d ../path-code-r1-eabbc19.XXXXXX)"
git worktree add --detach "$R1_WORKTREE" <full-eabbc19-sha>

Do NOT install or update dependencies.
Do NOT modify package.json or lockfiles.

If the historical worktree needs the existing local development toolchain,
create only a temporary node_modules symlink from the worktree to the main
repository's existing node_modules, provided the main node_modules exists.
Record this as pass tooling, remove it before worktree removal, and do not claim
it reproduces a historical package-install environment.

If the required toolchain cannot run without installing/changing dependencies,
STOP AND REPORT. Do not install around the gate.

2A.2 DERIVE THE COMMITTED DOWNGRADE STATE

At immutable eabbc19, with ledger verification appropriate to that tree, derive:

- existing-file-replacement
- safe-file-creation
- multi-file-coordination

Record exact states.
Expected: IMPLEMENTED for all three.

If any differs, that is a new finding. Record and STOP under the
No-Untracked-Finding Rule.

2A.3 RESTORE DIRECTION — USE EXACT HISTORICAL FREEZE DATA

Do NOT invent or hand-type freezeEvidence.

Mechanically read each capability's exact pre-downgrade freezeEvidence from the
canonical immediate pre-downgrade checkpoint used by the hardening package
(verify whether that is eabbc19^ and that it resolves to the expected baseline
chain; otherwise use the mechanically established pre-downgrade canonical
commit and record it).

Apply each exact historical freezeEvidence object only to an IN-MEMORY copy of
the eabbc19 Capability Ledger.

Derive again.
Expected: PASS_FROZEN for each capability.

No tracked file in the historical worktree is modified for this falsification.

2A.4 CLEAN WORKTREE

Remove any temporary node_modules symlink.
Remove the worktree:

git worktree remove "$R1_WORKTREE"

Remove the now-empty temporary directory if needed.
Run git worktree list and verify no R1 worktree remains.
Verify main working tree diff is unchanged except intended Stage 2 report work.

2A.5 CURRENT FORWARD DIRECTION

At current main working tree, run the existing permanent relink falsification:

removing freezeEvidence
→ trio derives IMPLEMENTED
→ restoring canonical freezeEvidence
→ trio derives PASS_FROZEN.

Cite exact test name and output.

2A.6 REPORT THE DISPOSITION PRECISELY

Write PHASE_3_R1_RECONCILIATION_REPORT.md §2:

- original live §1.4 MUST-FAIL sequence: NOT PROVEN and remains so historically;
- census prose at eabbc19 claiming success: narrative claim without the required
  live run log;
- committed eabbc19 downgrade state: historically re-derived now;
- exact derived state of each trio capability;
- exact pre-downgrade freeze source commit;
- restored in-memory state of each capability;
- current forward relink falsification result;
- no history rewritten.

This closes the missing semantic evidence requirement without rewriting the
past or falsely claiming the original failed script succeeded.

Run:

npm run ledger:verify
npm run check

MUST PASS.

STAGE 2A COMMIT EXACTLY:

Prove Phase 3-R1 §1.4 historical disposition

--------------------------------------------------
STAGE 2B — EVIDENCE LINKAGE
--------------------------------------------------

Now the Stage 2A immutable SHA exists.

Close GAP-053:

- lifecycle = CLOSED
- closedByCommit = Stage 2A full SHA
- closureEvidence = docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §2
- notes preserve that the original live run remains NOT PROVEN; closure means
  the historical semantic disposition is now independently evidenced, not that
  the original script is retroactively repaired.

Close GAP-054:

- lifecycle = CLOSED
- closedByCommit = Stage 1 full SHA
- closureEvidence = docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §1 plus
  docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md Stage 4 bounded
  live-state update rule
- notes state: historical probe restored; ledger gate generalized and falsified;
  prior unsatisfiable §6.6 preserved as historical contract evidence.

Remove GAP-053 and GAP-054 from safe-editing.knownLimitations because they are
now CLOSED.

Keep GAP-051, GAP-052, and GAP-056 attached while OPEN.
GAP-055 remains OPEN and unattached.

Run:

npm run gap:render
npm run ledger:verify
npm run check

MUST PASS.

STAGE 2B COMMIT EXACTLY:

Link Phase 3-R1 evidence reconciliation gaps

==================================================
STAGE 2 GATE — HARD STOP
==================================================

Executor A's work is complete.
Executor A MUST NOT perform Stage 3.

Return to the operator:

- Stage 2A full SHA;
- Stage 2B full SHA (this is the Stage 2 gate HEAD);
- exact GAP-053/GAP-054 closure evidence;
- derived Phase 3 capability states;
- runtime test total;
- ledger:verify result;
- npm run check result;
- clean-tree result.

The operator dispatches Executor B from the exact Stage 2B HEAD.

==================================================
STAGE 3 — FRESH INDEPENDENT FULL PHASE 3 RE-AUDIT R1
==================================================

EXECUTOR: B ONLY

This stage begins in a fresh isolated executor session.
The Stage 3 brief below is the only conversational instruction Executor B
receives. The repository at Stage 2B HEAD is permitted evidence and may contain
historical contracts/reports/tests.

--------------------------------------------------
3.1 INPUT BOUNDARY
--------------------------------------------------

PERMITTED:

- repository at exact Stage 2B HEAD in its entirety;
- frozen Phase 3 Safe Editing Master;
- Phase 3D Multi-File Coordination Master;
- Phase 1 Action Class Amendment 1;
- Phase 3 Safe Editing Amendment 1;
- Foundation Extensibility Constitution V1 and its existing amendment(s);
- ENGINEERING_SELF_OBSERVATION.md;
- this Stage 3 brief;
- operator-supplied minimal metadata about prior failed Stage 3 attempts:
  attempt number, executor product, time, failure class, commit created YES/NO.

FORBIDDEN:

- hardening-package execution transcripts;
- Stage 0–2 R1 execution transcripts;
- prior executor reasoning summaries;
- failed Stage 3 auditor substantive transcript/reasoning;
- any hidden handoff describing what the auditor is expected to conclude.

If forbidden material is present in Executor B's context, STOP AND REPORT
CONTEXT CONTAMINATION. Do not audit.

--------------------------------------------------
3.2 AUDITOR PROVENANCE BLOCK — REQUIRED
--------------------------------------------------

The R1 re-audit report MUST begin with:

AUDITOR PROVENANCE
executor product:                       <name/version if known>
session:                                <new session identifier, or "new session;
                                         product exposes no identifier">
this executor session prior writes to
  Phase 3-R1 chain:                     NONE
hardening execution transcripts
  received:                             NO
R1 Stage 0–2 execution transcripts
  received:                             NO
failed-auditor substantive transcripts
  received:                             NO
repository checkpoint received:         <full Stage 2B SHA>
other inputs received:                   <exact list>
prior failed-attempt metadata received: <none or exact minimal metadata>
operator attestation:                   <operator + date/time>
report block presence admissibility:    REPOSITORY_RECORDED
independence claim admissibility:        ASSERTED — not mechanically proven;
                                         see GAP-055

Do NOT use OPERATOR_ATTESTED as a new evidence tier.

A missing field fails the Stage 3 gate.

--------------------------------------------------
3.3 FULL BASE AUDIT — NOT A DELTA
--------------------------------------------------

Re-run the entire frozen Phase 3 integration audit against Stage 2B HEAD.
No previous COMPLETE conclusion may substitute.

At minimum re-establish all original Phase 3 audit dimensions:

- SE-001 through SE-020 phase-wide;
- B1 full read/write/re-observe fingerprint bridge;
- B2 authored mutation evidence → fresh repository re-observation;
- B3 stale snapshot / stale edit / fresh edit;
- B4 Git point-in-time state;
- B5 deny-path enforcement;
- B6 action-class enforcement;
- B7 ConfigFailure fail-closed plus ABSENT success;
- B8 partial multi-file plan plus fresh re-observation;
- write boundary inside and outside editing;
- persistence/residue scan;
- all five recovery shapes;
- Phase 3B-H1 corrections;
- Phase 3C-H1 corrections;
- Phase 3D coordination invariants and P3D obligations;
- Constitution integration-audit questions;
- construction lessons and contract-defect traceability;
- Capability Ledger / Gap Ledger truth;
- compile-time negative sweep;
- original audit falsifiability probes.

Audit tests requiring fault injection MUST use internal-only seams.
Public composition tests MUST use public wrappers.
No test may fabricate committed/success evidence.

The restored half-citation issueLedgerVerification probe MUST execute and its
result MUST be recorded.

--------------------------------------------------
3.4 PUBLIC AUTHORITY-SURFACE AUDIT — P1 THROUGH P14
--------------------------------------------------

P1.
Supported public entry points are mechanically enumerated.

P2.
Every public function's complete parameter/options surface is represented in
the standing manifest/test.

P3.
No unapproved authority/mechanism-substitution parameter exists.

P4.
Public runtime ignores/rejects malicious extra arguments and unknown
mechanism-substitution option fields.

P5.
replaceExistingFile public runtime uses real production mechanisms.

P6.
createFile public runtime uses real production mechanisms.

P7.
executeMultiFilePlan public runtime uses real production mechanisms.

P8.
Any other corrected public wrapper uses real production mechanism.

P9.
Internal test executors/adapters are absent from public barrels, package
exports, and reachable public declarations.

P10.
Package consumer cannot import authority-bearing internal modules through a
supported package subpath.

P11.
Standing guard is in npm run check and has an explicit approved-exception
mechanism with no unjustified entries.

P12.
No public any/unknown/rest/index escape is narrowed into authority-bearing
operations without explicit approval/evidence.

P13.
Audit tests using internal seams always delegate to real operations and never
fabricate successful/committed evidence.

P14.
The first audit's use of the public seam is removed and documented.

--------------------------------------------------
3.5 PUBLIC-SURFACE FALSIFICATIONS — A-F15 THROUGH A-F22
--------------------------------------------------

A-F15.
Reintroduce public execute targetOps.
Expected: public runtime test fails for the intended reason.

A-F16.
Reintroduce public replacement fsOps if applicable.
Expected: public runtime test fails for the intended reason.

A-F17.
Reintroduce public creation fsOps if applicable.
Expected: public runtime test fails for the intended reason.

A-F18.
Export an internal executor.
Expected: public-surface test fails naming the leak.

A-F19.
Add callable mechanism-substitution field to an otherwise public function
surface.
Expected: standing declaration/manifest test fails.

A-F20.
Read a hidden extra argument at runtime.
Expected: malicious-extra-argument runtime test fails.

A-F21.
Expose an internal authority-bearing package subpath.
Expected: package import/export test fails.

A-F22.
Break internal delegation to the real production operation.
Expected: recovery/composition test fails.

Every applicable falsification must record:

corruption
→ exact failing test/output
→ intended reason
→ exact restoration
→ final PASS.

A falsification that errors before the intended failure produces NO evidence.

--------------------------------------------------
3.6 R1-SPECIFIC RECONCILIATION CHECKS
--------------------------------------------------

R1-A.
Verify safe-editing is NOT PHASE_VERIFIED at the Stage 2B checkpoint.
Record its actual derived state; do not assume DECLARED/IMPLEMENTED.

R1-B.
Verify GAP-051 and GAP-052 are OPEN; GAP-053 and GAP-054 CLOSED; GAP-055 and
GAP-056 OPEN.

R1-C.
Verify the restored half-citation probe still proves the historical mechanism
claim independently of current live-state pins.

R1-D.
Verify scripts/ledger-verify.ts uses the universal phaseAuditEvidence-shape
consistency rule and does not hardcode safe-editing or a list of closed phases.

R1-E.
Verify the Stage 1 shape-consistency falsifications are permanent tests and
falsifiable.

R1-F.
Verify no production file under src/editing/ changed in R1 Stages 0–2.

R1-G.
Verify 607 remains bound only to Closure A / 04591e4.

R1-H.
Verify no R1 closure artifact/promotion exists yet.

--------------------------------------------------
3.7 AUDIT OUTPUT BOUNDARY
--------------------------------------------------

Executor B may write exactly TWO tracked files:

docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md
tests/integration/phase3-reaudit-r1.test.ts

Nothing else.

No ledger edits.
No source edits.
No README edits.
No edits to prior reports.
No edits to prior tests.

The R1 test file may add audit/falsification coverage. It may not repair product
code.

--------------------------------------------------
3.8 CONCLUSION
--------------------------------------------------

The report conclusion MUST be exactly one of:

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 COMPLETE

or

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE

NOT COMPLETE is a valid audit result.
An auditor that cannot return NOT COMPLETE is not independent auditing.

COMPLETE only if:

- every original Phase 3 audit criterion passes;
- all SE-001 through SE-020 obligations are SATISFIED_PHASE_WIDE;
- relevant P3D obligations pass;
- P1 through P14 pass;
- every applicable A-F15 through A-F22 probe fails/restores as required;
- R1-A through R1-H pass;
- no active PUBLIC_AUTHORITY_SURFACE_LEAK remains;
- every new finding discovered by Executor B is either already recorded or
  causes NOT COMPLETE under the No-Untracked-Finding Rule;
- all four mutation component capabilities remain PASS_FROZEN;
- safe-editing is NOT PHASE_VERIFIED before closure linkage;
- runtime dependencies remain 0;
- exactly one project filesystem write module remains as contracted;
- working tree clean except the two Stage 3 output files before commit;
- Phase 4 absent.

If any condition fails:
return NOT COMPLETE.
No production fix inside the audit.

--------------------------------------------------
3.9 VALIDATION / COMMIT
--------------------------------------------------

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run cli:smoke
npm run check

Record exact totals and outputs.

On COMPLETE commit exactly:

Freeze Path Code Phase 3 independent re-audit R1

On NOT COMPLETE commit exactly:

Record Path Code Phase 3 independent re-audit R1 finding

In either case Executor B writes/commits only the two permitted files.

==================================================
STAGE 3 GATE — HARD STOP
==================================================

Executor B's work is complete.
Executor B MUST NOT perform Stage 4.

If NOT COMPLETE:

- this pass ENDS at Stage 3;
- Phase 3 remains open;
- do not promote safe-editing;
- do not create R1 closure;
- findings require a separately reviewed corrective contract.

If COMPLETE:

return to operator:

- full Stage 3 commit SHA;
- exact audited Stage 2B checkpoint SHA;
- provenance block;
- COMPLETE line;
- runtime test total;
- all Not Validated items;
- clean-tree result.

The operator then dispatches Executor C.

If Executor B fails before creating a commit:

- leave repository at Stage 2B HEAD;
- do not let another executor continue the failed session;
- dispatch a NEW Executor B from Stage 2B HEAD;
- supply only the permitted input plus minimal prior-attempt metadata.

==================================================
STAGE 4 — CONDITIONAL CLOSURE RECONCILIATION R1
==================================================

EXECUTOR: C

Proceed ONLY if Stage 3 result is COMPLETE.

Stage 4 uses TWO commits by design.
This is mandatory, not optional, because phaseAuditEvidence and recordedFigure
must cite an already-existing immutable closure artifact commit. No
self-referential commit SHA is permitted.

--------------------------------------------------
STAGE 4A — IMMUTABLE CLOSURE RECONCILIATION ARTIFACT
--------------------------------------------------

Create only:

docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md

This document does NOT replace docs/PHASE_3_CLOSURE.md.
It supplements and supersedes only the progression evidence that was invalid.

Record:

- Closure A at 04591e4 remains immutable historical evidence;
- its 607 runtime figure remains valid for that checkpoint;
- prior re-audit 5606b49 remains immutable but progression-ineligible for lack
  of required independence;
- ee58673 remains immutable historical closure-linkage evidence but is
  superseded for progression;
- full R1 chain with exact SHAs:
  Stage 0, Stage 1, Stage 2A, Stage 2B, Stage 3;
- Stage 2B full SHA as the checkpoint audited by Stage 3;
- Stage 3 full SHA and exact COMPLETE conclusion;
- F1–F4 and exact dispositions;
- GAP-051 through GAP-056 status/disposition;
- auditor provenance block copied exactly from the R1 audit report;
- explicit statement that the audit result/report is repository-recorded while
  executor independence remains ASSERTED and GAP-055 remains OPEN;
- exact runtime test total observed at the Stage 3 / pre-closure checkpoint;
- exact Not Validated list;
- no Phase 4 implementation.

Before commit run the full validation suite and record the collected runtime
total in the document:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run cli:smoke
npm run check

Because Stage 4A creates a document only, the runtime test count MUST remain
unchanged after the commit.

STAGE 4A COMMIT EXACTLY:

Record Path Code Phase 3 closure reconciliation R1

After commit rerun npm test and npm run ledger:verify and record in the ongoing
reconciliation report that the count/state stayed unchanged.

--------------------------------------------------
STAGE 4B — CANONICAL LINKAGE
--------------------------------------------------

Now Stage 4A's immutable full SHA exists.

4B.1 SAFE-EDITING PHASE AUDIT EVIDENCE

Add phaseAuditEvidence to safe-editing:

auditReportPath:
docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md

auditCommit:
<Stage 3 full SHA>

auditConclusionNeedle:
**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 COMPLETE

closureDocumentPath:
docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md

closureCommit:
<Stage 4A full SHA>

auditCheckpointNeedle:
<Stage 2B full SHA>

Do not point phaseAuditEvidence back to 5606b49 or 04591e4 as the current
progression chain.

4B.2 FINAL RECORDED FIGURE

Add a new safe-editing recordedFigure for the runtime test total written in:

docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md

at Stage 4A full SHA.

Leave the historical 607 recordedFigure at 04591e4 untouched.

4B.3 GAP CLOSURE

Close GAP-051:

- lifecycle CLOSED
- closedByCommit = Stage 3 full SHA
- closureEvidence = docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md
- notes preserve the prior superseded closure chain.

Close GAP-052:

- lifecycle CLOSED
- closedByCommit = Stage 3 full SHA
- closureEvidence = docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md

GAP-053 and GAP-054 are already CLOSED from Stage 2B.

Close GAP-056:

- lifecycle CLOSED
- closedByCommit = Stage 4A full SHA
- closureEvidence = docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md

GAP-055 remains OPEN.

Remove GAP-051, GAP-052, and GAP-056 from safe-editing.knownLimitations.
GAP-053 and GAP-054 should already be absent because they closed in Stage 2B.

Do not attach GAP-055 to safe-editing.

4B.4 AUTHORIZED LIVE-STATE PIN UPDATES

This clause is the bounded correction to prior unsatisfiable §6.6.

Executor C MAY update assertions whose ONLY semantic content is a live
canonical-ledger state pin in:

- tests/integration/phase3-safe-editing-audit.test.ts
- tests/integration/phase3-reaudit-public-surface.test.ts
- tests/integration/phase3-reaudit-r1.test.ts
- tests/selfobs/derivation.test.ts

Allowed live-state pins:

- capability derived state;
- gap lifecycle;
- presence/content of phaseAuditEvidence;
- closedByCommit / closureEvidence values;
- recordedFigure presence/value when directly bound to the new closure artifact.

Executor C MUST NOT:

- delete any probe;
- delete any falsification;
- delete any mechanism test;
- remove an import used by a preserved probe;
- weaken a corruption → expected failure → restore check;
- restructure historical audit logic merely to make current state pass;
- change public-surface or mutation behavior tests.

The restored half-citation probe MUST remain present and unchanged in semantic
effect.

PHASE_3_R1_RECONCILIATION_REPORT.md must list every Stage 4B assertion update:
file, test name, old pin → new pin, and why it is a live-state pin rather than a
mechanism change.

If any required edit is not clearly a live-state pin, STOP AND REPORT.

4B.5 ledger:verify TOOLING

scripts/ledger-verify.ts and its shape-consistency helper MUST NOT change in
Stage 4B.

The universal Stage 1 rule must automatically accept the new truthful state:
phaseAuditEvidence present → PHASE_VERIFIED.

If Stage 4B requires changing ledger:verify tooling, STOP AND REPORT with
primary origin IMPLEMENTATION against Stage 1.

4B.6 README / GAP RENDER / SHA PINS

Update README Phase 3 status to cite the R1 closure chain.

Update self-observation citation SHA constants only as required to bind:

- Stage 3 re-audit commit;
- Stage 4A closure reconciliation commit.

Run:

npm run gap:render

4B.7 PHASE-PROMOTION FALSIFICATION

Temporarily remove only safe-editing.phaseAuditEvidence in the working tree.

Then:

A. focused derivation expecting PHASE_VERIFIED MUST FAIL;
B. actual verified derivation MUST be lower than PHASE_VERIFIED;
C. the universal ledger shape-consistency rule MUST accept that lower state,
   because phaseAuditEvidence is absent;
D. restore phaseAuditEvidence exactly;
E. focused PHASE_VERIFIED derivation MUST PASS;
F. ledger:verify MUST PASS;
G. git diff must show no residual falsification corruption.

Do NOT expect ledger:verify to fail merely because phaseAuditEvidence was
removed. A truthful lower derivation with absent phaseAuditEvidence is exactly
what the generalized gate is designed to accept.

Capture exact outputs.

4B.8 TEST-COUNT STABILITY

Stage 4B may update assertion values but MUST NOT add, remove, rename, skip, or
unskip tests.

Therefore the collected runtime test count at Stage 4B MUST equal the figure
recorded in Stage 4A.

If the total differs, STOP AND REPORT before committing linkage.
Do not silently change the Stage 4A figure.

4B.9 FINAL VALIDATION

Run:

git diff --check
npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run cli:smoke
npm run check

Verify:

- exact runtime total equals Stage 4A figure;
- edit-contracts PASS_FROZEN;
- existing-file-replacement PASS_FROZEN;
- safe-file-creation PASS_FROZEN;
- multi-file-coordination PASS_FROZEN;
- safe-editing PHASE_VERIFIED;
- repository-intelligence PHASE_VERIFIED;
- foundation-kernel PHASE_VERIFIED;
- GAP-051 CLOSED;
- GAP-052 CLOSED;
- GAP-053 CLOSED;
- GAP-054 CLOSED;
- GAP-055 OPEN;
- GAP-056 CLOSED;
- 607 still bound only to 04591e4;
- new final figure bound only to Stage 4A closure reconciliation artifact;
- standing public-authority guard passes;
- exactly one project filesystem write module remains;
- runtime dependencies remain 0;
- no src/editing/ changes in R1;
- Phase 4 absent;
- working tree ready for commit;
- no push.

STAGE 4B COMMIT EXACTLY:

Link Path Code Phase 3 closure to independent re-audit R1

After commit rerun:

git rev-parse HEAD
git status --porcelain
npm run ledger:verify
npm test
npm run check

All PASS; working tree empty.

==================================================
FINAL DERIVED STATE — REQUIRED
==================================================

edit-contracts               PASS_FROZEN
existing-file-replacement    PASS_FROZEN
safe-file-creation           PASS_FROZEN
multi-file-coordination      PASS_FROZEN
safe-editing                 PHASE_VERIFIED
repository-intelligence      PHASE_VERIFIED
foundation-kernel            PHASE_VERIFIED

GAP-051 CLOSED
GAP-052 CLOSED
GAP-053 CLOSED
GAP-054 CLOSED
GAP-055 OPEN
GAP-056 CLOSED

safe-editing PHASE_VERIFIED is now bound to:

- Stage 2B audited checkpoint;
- fresh Stage 3 R1 re-audit commit;
- Stage 4A immutable closure reconciliation artifact;
- Stage 4B canonical linkage.

The R1 audit report/result is repository-recorded.
The independence-process claim is explicitly ASSERTED, not mechanically proven,
and GAP-055 remains open for that limitation.

==================================================
FINAL REPORT — REQUIRED CONTENT
==================================================

The final PHASE_3_R1_RECONCILIATION_REPORT.md must contain, per stage:

- executor slot/product/session status;
- baseline/final HEAD;
- exact files changed;
- exact commits;
- ancestry results;
- Gap Ledger state transitions;
- Capability Ledger state transitions;
- every falsification corruption/failure/restoration/result;
- historical eabbc19 disposition;
- restored half-citation probe evidence;
- ledger shape-consistency implementation and falsification;
- Stage 3 provenance block and independence admissibility distinction;
- complete R1 audit result;
- every Stage 4B live-state pin update old → new;
- 607 historical figure binding;
- new final figure binding;
- exact runtime test totals at Stage 1, Stage 2, Stage 3, Stage 4A, Stage 4B;
- runtime dependencies;
- write-module count;
- src/editing diff scan;
- clean-tree result;
- NOT VALIDATED;
- next permitted work.

Do not claim the original failed Stage 1 live falsification succeeded.
Do not claim executor independence is mechanically proven.
Do not call 5606b49 independent.
Do not erase ee58673.

==================================================
CHECKLIST — ANSWER EVERY LINE IN THE REPORT
==================================================

 1. Start HEAD exactly ee58673...?                              MUST BE YES
 2. Start working tree clean?                                  MUST BE YES
 3. Required ancestors present?                                MUST BE YES
 4. eabbc19 / 164cf43 / 86accd3 resolved to full SHAs?         MUST BE YES
 5. GAP-052 through GAP-056 unused before Stage 0?              MUST BE YES
 6. F1–F4 recorded with exact evidence/admissibility?           MUST BE YES
 7. GAP-052–056 created with proposedClass only in Stage 0?     MUST BE YES
 8. Human explicitly reviewed classifications before Stage 1?  MUST BE YES
 9. Reviewed classifications written exactly?                  MUST BE YES
10. phaseAuditEvidence removal recorded as supersession?        MUST BE YES
11. Prior phaseAuditEvidence values preserved in report?        MUST BE YES
12. GAP-051 reopened with old closure facts preserved?          MUST BE YES
13. Half-citation probe restored from 04591e4 evidence?         MUST BE YES
14. No historical probe/falsification weakened or deleted?      MUST BE YES
15. ledger:verify expectation universal and shape-driven?       MUST BE YES
16. ledger:verify hardcodes no safe-editing/closed-phase list?   MUST BE YES
17. 1-F1 and 1-F2 falsify the helper ledger:verify uses?        MUST BE YES
18. Live Stage 1 downgrade falsification produced intended fail? MUST BE YES
19. Any falsification script errored before intended output?    MUST BE NO
20. Stage 1 immutable recheck PASS?                             MUST BE YES
21. Detached eabbc19 worktree created and removed?              MUST BE YES
22. No dependency installation/change in historical worktree?   MUST BE YES
23. Trio actual derivation at eabbc19 recorded?                 MUST BE YES
24. Exact historical freeze source mechanically established?    MUST BE YES
25. In-memory restore direction recorded?                       MUST BE YES
26. Original live §1.4 run still labeled NOT PROVEN?            MUST BE YES
27. GAP-053/GAP-054 closed only after immutable evidence exists? MUST BE YES
28. Executor A stopped after Stage 2B?                          MUST BE YES
29. Executor B received forbidden transcripts/context?          MUST BE NO
30. Executor B session had prior R1 write?                      MUST BE NO
31. Auditor provenance block complete?                          MUST BE YES
32. Report presence labeled REPOSITORY_RECORDED?                MUST BE YES
33. Independence claim labeled ASSERTED?                        MUST BE YES
34. Executor B wrote exactly two tracked files?                 MUST BE YES
35. Any executor continued a stage it did not start?            MUST BE NO
36. Full original Phase 3 audit rerun, not delta?               MUST BE YES
37. P1 through P14 pass?                                        MUST BE YES
38. Applicable A-F15 through A-F22 fail/restore?                MUST BE YES
39. R1-A through R1-H pass?                                     MUST BE YES
40. Re-audit R1 result COMPLETE?                                MUST BE YES FOR CLOSURE
41. Stage 4A document-only closure commit exists?               MUST BE YES
42. Stage 4B cites Stage 4A, avoiding self-reference?           MUST BE YES
43. Stage 4B assertion changes only live-state pins?            MUST BE YES
44. Any probe/falsification/mechanism test deleted?             MUST BE NO
45. scripts/ledger-verify changed in Stage 4B?                  MUST BE NO
46. Promotion falsification lowers safe-editing without error?   MUST BE YES
47. Generalized ledger gate accepts truthful lower state?        MUST BE YES
48. Test count changed between Stage 4A and Stage 4B?           MUST BE NO
49. Historical 607 still bound only to 04591e4?                 MUST BE YES
50. New final figure bound to Stage 4A commit?                  MUST BE YES
51. GAP-051/052/053/054/056 CLOSED?                             MUST BE YES
52. GAP-055 remains OPEN?                                       MUST BE YES
53. All four mutation component capabilities PASS_FROZEN?       MUST BE YES
54. safe-editing PHASE_VERIFIED via R1 chain?                   MUST BE YES
55. Runtime dependencies remain 0?                              MUST BE YES
56. Exactly one project FS write module?                        MUST BE YES
57. Anything under src/editing/ changed in R1?                  MUST BE NO
58. Existing history rewritten?                                 MUST BE NO
59. Git pushed or remote created?                               MUST BE NO
60. Phase 4 implementation started?                             MUST BE NO
61. New finding disappeared without fix/gap?                    MUST BE NO
62. Could material work be removed while preserving proof?      If YES, simplify
63. Any contradiction with frozen Master/Constitution?          MUST BE NO

==================================================
NOT VALIDATED — MUST BE NON-EMPTY
==================================================

At minimum preserve these applicable limits:

- auditor-context independence is ASSERTED, not mechanically proven (GAP-055);
- the public-authority correction at 5386f34 is not re-implemented here; it is
  re-audited;
- hostile in-repository filesystem imports remain an architecture boundary,
  not a language sandbox;
- hostile TypeScript casts/metaprogramming remain within existing GAP-005-type
  limitations;
- residual existing-file rename race remains (GAP-035);
- residual creation publication race remains (GAP-044);
- post-publication second hard-link name possibility remains (GAP-045);
- no plan-level rollback; partial application is reported, not repaired;
- no delete capability;
- no directory creation capability;
- authored creation/mutation evidence still requires repository re-observation
  before it becomes repository knowledge;
- no live Windows validation (GAP-002);
- Foundation §10 Closed-Vocabulary & Foundation Extensibility Audit has not run;
- Phase 4 is absent;
- COMPLETE means the obligations audited were met at the checkpoint audited; it
  does not mean defect-free.

==================================================
GIT / HISTORY DISCIPLINE
==================================================

Preserve the entire evidence chain.

Every commit from 696ef4f through ee58673 remains an ancestor.
Nothing is rewritten.

Expected new commit sequence:

Stage 0
Record Phase 3-R1 reconciliation findings

Stage 1
Downgrade Phase 3 closure pending independent re-audit

Stage 2A
Prove Phase 3-R1 §1.4 historical disposition

Stage 2B
Link Phase 3-R1 evidence reconciliation gaps

Stage 3 COMPLETE path
Freeze Path Code Phase 3 independent re-audit R1

Stage 4A
Record Path Code Phase 3 closure reconciliation R1

Stage 4B
Link Path Code Phase 3 closure to independent re-audit R1

No amend.
No rebase.
No squash.
No push.
No remote.

After every commit:

- git rev-parse HEAD;
- git status --porcelain;
- required ancestry checks;
- npm run ledger:verify;
- stage-specific gate.

==================================================
AFTER THIS PASS
==================================================

Only after Stage 4B passes every gate may Path Code say:

PATH CODE PHASE 3 — SAFE EDITING ENGINE: COMPLETE / FROZEN

Next permitted work, in order:

1. the ONE bounded Closed-Vocabulary & Foundation Extensibility Audit required
   by Foundation Extensibility Constitution V1 §10;
2. Phase 4 Master Contract preparation immediately after that audit unless the
   §10 audit finds a Phase-4 blocking mismatch;
3. NO Phase 4 implementation until the Phase 4 Master is frozen.

GAP-055 must be explicitly addressed in the Phase 4 Master preflight before a
future audit relies on a stronger claim of mechanically proven executor
independence. The Phase 4 Master may define a suitable mechanism or preserve the
limitation honestly; this R1 pass does not pre-authorize a schema change.

Then move forward.
