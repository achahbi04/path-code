PATH CODE — PHASE 3
PUBLIC AUTHORITY-SURFACE HARDENING
+ PHASE 3D CORRECTION
+ FULL PHASE 3 RE-AUDIT
+ CONDITIONAL PHASE 3 CLOSURE
FINAL COORDINATED MASTER PACKAGE

REPOSITORY
/Users/achahbi/Projects/path-code

THIS IS ONE COORDINATED PACKAGE WITH GATED STAGES.

IT IS NOT PERMISSION TO ASSUME THE FINDING,
AND IT IS NOT PERMISSION TO FIX BEFORE THE BLAST RADIUS IS KNOWN.

==================================================
CURRENT BASELINE
==================================================

Current HEAD:
696ef4fe58c21cdd527869309a2b9fd5abcd19a8

Phase 3D implementation:
4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9

Phase 3D capability linkage:
424b6de77e227ffa702fad4cdb18aade77572003

Phase 3D-E1 evidence completion:
a35b42de86c1d22d36bb214cf950f22355da0818

First Phase 3 integration audit:
696ef4fe58c21cdd527869309a2b9fd5abcd19a8

Phase 3D Master:
28efece61800d4b6dd92465d3499e648268365a3

Foundation Extensibility Constitution V1:
a73a623cfed77d2c2dc0238d386d40d4d1595065

Phase 3C-H1 COMPLETE:
dcb347fc613114be810b8caf371f0bea8b261285

Expected current runtime total:
589

VERIFY rather than assume.

CURRENT REPORTED CAPABILITY STATES

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

==================================================
WHY THIS PACKAGE EXISTS
==================================================

The first Phase 3 integration audit proved important cross-phase properties and
remains valuable immutable evidence.

However review of the audit test code revealed that the public
executeMultiFilePlan export was called with a second argument containing
caller-supplied target operations:

targetOps.replaceExistingFile
targetOps.createFile

The frozen Phase 3D contract required:

- public executeMultiFilePlan accepts only MultiFilePlan;
- no public target-execution bindings;
- no public test hook;
- any operation-binding seam used for testing remains private/internal;
- every target delegates to the real frozen 3B/3C operation.

This is a suspected PUBLIC AUTHORITY-SURFACE leak.

It MUST be proved before any repository mutation.

The same defect class may also exist in earlier Phase 3 public operations such
as replaceExistingFile or createFile if their public option parameters expose
filesystem-operation sets, adapters, verifiers, loaders, readers, executors, or
other mechanism-substitution values.

Therefore:

DO NOT FIX ONLY THE FIRST INSTANCE FOUND.

FIRST PERFORM A COMPLETE BOUNDED PUBLIC AUTHORITY-SURFACE CENSUS.

Then:

- correct every active Phase 3 instance of the same class in one package;
- downgrade and relink every affected capability honestly;
- establish a standing constitutional guard;
- run a full independent Phase 3 re-audit;
- close Phase 3 only if every gate passes.

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
docs/passes/PHASE_3_INTEGRATION_AUDIT_CONTRACT.md

docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md
docs/reports/PHASE_3C_H1_REPORT.md
docs/reports/PHASE_3D_REPORT.md
docs/reports/PHASE_3D_E1_EVIDENCE_COMPLETION_REPORT.md
docs/reports/PHASE_3_INTEGRATION_AUDIT_REPORT.md

machine-readable Capability Ledger v1
machine-readable Gap Ledger v1

Where this package conflicts with a frozen source:

STOP AND REPORT.

Do not reinterpret a frozen source merely to keep the package moving.

==================================================
CONSTITUTION REFERENCES
==================================================

Do not rely on section numbers remembered from earlier drafts.

At baseline, read the frozen Constitution and resolve the actual headings and
section numbers mechanically.

This package depends on the headings:

- Development rhythm
- Pass-writer obligations
- Proportional amendment protocol
- Single source of truth for gaps
- Pass contracts become repository artifacts
- Integration-audit responsibility
- One bounded baseline audit before Phase 4

In all committed documents:

cite the actual frozen heading and actual section number.

==================================================
THIS CONTRACT IS REPOSITORY EVIDENCE
==================================================

If the forensic census confirms one or more active leaks, commit this exact
executed contract as:

docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md

in the first repository commit of this package.

Do not post-hoc rewrite it.

If the suspected finding is disproved:

make no commit and stop with the mechanical result.

If a material recovery supplement is required:

store it separately beside this contract.

Do not rewrite the original.

==================================================
DEFINITION — PUBLIC AUTHORITY SURFACE
==================================================

For this package, the SUPPORTED PUBLIC SURFACE is determined mechanically from:

- package.json main/types/exports/subpath exports;
- package-root runtime exports;
- public barrel exports;
- public declaration entry points;
- documented supported API.

An arbitrary emitted dist file is NOT automatically a supported public surface
when a restrictive package exports map makes it unreachable through the package
specifier.

A path IS public/reachable when it is exposed through a supported package
entry point, public barrel, public declaration graph, or accepted input of a
public function.

A public function's surface includes:

- every declared parameter;
- every nested property of a public options/input object;
- callbacks and callable properties;
- adapters, bindings, operation sets, loaders, readers, writers, runners,
  transports, clients, and executors;
- index signatures;
- rest parameters;
- any/unknown escape hatches that are later narrowed into authority-bearing
  values;
- extra JavaScript arguments or undeclared option properties that runtime code
  reads or forwards;
- authority-bearing values returned to the caller.

"Not exported as a named symbol" does NOT mean "not publicly reachable."

==================================================
DEFECT PATTERN — LOCKED
==================================================

Name:

PUBLIC_AUTHORITY_SURFACE_LEAK

Meaning:

An internal authority issuer, brand constructor, mutable registry capability,
filesystem operation set, adapter, executor, binding, loader, verifier, fault
seam, or other substitute for a frozen mechanism is reachable through a
supported public API as:

- an export;
- an accepted parameter or nested property;
- an undeclared runtime argument;
- a return value;
- a public package subpath.

This name is a constitutional defect pattern.

It does NOT create a new reviewClassification or lifecycle value.

Each concrete instance still uses the existing Gap Ledger classification
vocabulary, normally BLOCKING_INVARIANT when it permits authority/mechanism
substitution.

If the current machine-readable Gap Ledger already contains a compatible
defect-class/category field, record the pattern there.

If it does not:

record PUBLIC_AUTHORITY_SURFACE_LEAK in the gap title/description and reports.

Do not add a new machine schema field solely for this package.

==================================================
NO UNTRACKED FINDING RULE
==================================================

Before any stage may pass, every finding discovered by that stage must be in
exactly one state:

A. corrected in the current stage and later closed against immutable evidence;

B. recorded OPEN in the Gap Ledger with:
   - existing classification or proposedClass;
   - why it does not block the next operation;
   - missing evidence;
   - exact closure condition;

C. already represented by an existing frozen design limitation/gap, cited
   exactly.

No factual defect or limitation may exist only in prose and silently disappear.

A frozen intentional property such as "no rollback" need not create a duplicate
gap when it is already part of the Master and NOT VALIDATED record.

==================================================
EXECUTION MODEL — SEVEN GATED STAGES
==================================================

USE CURSOR MULTITASK.

STAGE 0
read-only forensic public authority-surface census

STAGE 1
honest self-observation downgrade + durable census/finding record

STAGE 2
Constitution Amendment 1 — public authority surfaces

STAGE 3
correct every confirmed Phase 3 instance + standing guard

STAGE 4
targeted evidence + capability relink

STAGE 5
fresh FULL Phase 3 integration re-audit

STAGE 6
conditional Phase 3 closure + separate phase-verification linkage

Parallel reviewers are READ-ONLY.

Exactly one repository writer per write stage.

No stage may begin before the previous gate passes.

If a stage fails:

stop at that stage.

Do not continue into later stages.

######################################################################
STAGE 0 — READ-ONLY FORENSIC CENSUS
######################################################################

NO REPOSITORY MUTATION.

Verify baseline:

git rev-parse HEAD
==
696ef4fe58c21cdd527869309a2b9fd5abcd19a8

git status --short --branch
==
clean main

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

Determine actual test total.
Expected:
589

--------------------------------------------------
0.1 ENUMERATE SUPPORTED PUBLIC ENTRY POINTS
--------------------------------------------------

Inspect:

package.json
src/index.ts
src/editing/index.ts
every package subpath export
emitted public .d.ts entry points
runtime Object.keys() of supported public entry points

Produce the exact supported-public-entrypoint list.

Also test whether authority-bearing internal subpaths are importable through the
PACKAGE SPECIFIER.

Distinguish:

- supported package import;
- unsupported direct filesystem/relative deep import.

If package exports permit a supported deep import of an authority-bearing
internal module, that is an active instance.

--------------------------------------------------
0.2 ENUMERATE EVERY PUBLIC FUNCTION SIGNATURE
--------------------------------------------------

For every exported public function in every supported entry point, record:

- function/export name;
- source file;
- emitted declaration;
- complete parameter list;
- full public options/input object properties;
- rest/index/any/unknown usage;
- return type;
- runtime implementation parameter/arguments behavior;
- introducing commit for every authority-bearing field.

At minimum inspect:

EDITING

- prepareModifyExistingFile
- prepareCreateFile
- authorizePreparedChange
- replaceExistingFile
- createFile
- createMultiFilePlan
- executeMultiFilePlan
- every exported editing policy/helper that can affect authority

FOUNDATION / INTELLIGENCE

- public inventory functions
- public reader functions
- public snapshot functions
- public search functions
- public metadata/map functions
- public Git-state functions
- public config functions
- public workspace functions

Do not assume the manual list is complete.

Enumerate mechanically from public entry points.

--------------------------------------------------
0.3 PARAMETER CLASSIFICATION
--------------------------------------------------

Classify every public parameter/property as exactly one:

- ORDINARY_DATA
- EXPLICIT_USER_APPROVAL
- EARNED_AUTHORITY
- SAFE_POINT_IN_TIME_CONTEXT
- CALLER_NARROWING_BOUND
- AUTHORITY_OR_MECHANISM_SUBSTITUTION
- UNRESOLVED

Examples of AUTHORITY_OR_MECHANISM_SUBSTITUTION:

- fsOps
- targetOps
- executor
- adapter
- bindings
- loader
- reader implementation
- writer implementation
- verifier implementation
- mutable registry operation
- callback capable of replacing a frozen operation

A SAFE_POINT_IN_TIME_CONTEXT such as an already-earned Git baseline is not a
fault adapter merely because it is optional.

Do not remove legitimate context merely because it shares an options object.

--------------------------------------------------
0.4 RUNTIME HIDDEN-INPUT SWEEP
--------------------------------------------------

For each public function inspect whether runtime code reads or forwards:

- arguments
- rest parameters
- undeclared positional arguments
- unknown option properties
- spread caller options into internal functions
- any/unknown narrowed into an operation set
- callback-bearing fields not represented honestly in public declarations

A one-argument declaration is insufficient if runtime honors argument 2.

--------------------------------------------------
0.5 KNOWN SUSPECTS
--------------------------------------------------

Mechanically confirm or disprove:

A. executeMultiFilePlan targetOps

B. replaceExistingFile fsOps / AtomicReplaceFsOps or equivalent

C. createFile fsOps / AtomicCreateFsOps / verification-operation set or
   equivalent

D. any preparation/authorization loader/reader/boundary substitution

E. any non-Phase-3 public operation/adaptor substitution

For every confirmed instance record:

- exact public signature;
- exact runtime behavior;
- exact authority/frozen mechanism it can replace;
- capability affected;
- introducing full commit SHA using Git history;
- frozen contract governing it;
- whether correction is signature-only/internalization or changes behavior.

--------------------------------------------------
0.6 PACKAGE DEEP-IMPORT BOUNDARY
--------------------------------------------------

Inspect package.json exports behavior.

Test from an external consumer fixture:

- supported public imports succeed;
- internal authority-bearing modules cannot be imported through package
  subpaths unless intentionally public.

If package exports are absent/loose and an internal authority-bearing module is
package-deep-importable:

record as an active instance.

If fixing it requires a broad public packaging change that may break a frozen
supported import:

STOP after the census for review.

Do not silently narrow package exports.

--------------------------------------------------
0.7 INTRODUCTION TIMELINE
--------------------------------------------------

For every confirmed instance determine the first introducing commit
mechanically.

Do not infer from chat.

The known 3D targetOps instance is expected to enter at 4fd4567, but VERIFY.

State plainly whether any active instance predates Phase 3.

--------------------------------------------------
0.8 CENSUS GATE
--------------------------------------------------

OUTCOME A — NO ACTIVE INSTANCE

If no supported public API permits mechanism substitution:

STOP.

Return the census and evidence.

Do not commit.
Do not downgrade.
Do not amend.
Do not fix.

OUTCOME B — ACTIVE INSTANCE(S), ALL LIMITED TO PHASE 3

Continue to Stage 1.

OUTCOME C — ACTIVE INSTANCE IN PHASE 0/1/2 OR CORRECTION REQUIRES CHANGING
FROZEN BEHAVIOR

Create a durable forensic finding commit only:

- exact contract;
- census report;
- gap records;
- no production correction.

Stop for review.

Do not continue automatically into Phase 3 closure.

######################################################################
STAGE 1 — DURABLE CENSUS + HONEST DOWNGRADES
######################################################################

Only on Outcome B.

Create:

docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md

Record:

- supported public entry points;
- every public function signature;
- parameter classifications;
- runtime hidden-input scan;
- package deep-import result;
- every active instance;
- introducing commit;
- affected capability;
- exact correction shape;
- no-active-instance findings for inspected functions.

--------------------------------------------------
1.1 AFFECTED CAPABILITY MAP
--------------------------------------------------

Map confirmed instances to capability records.

Expected mapping where applicable:

replaceExistingFile public fault adapter
→ existing-file-replacement

createFile public fault adapter
→ safe-file-creation

executeMultiFilePlan public targetOps
→ multi-file-coordination

prepare/authorize public mechanism substitution
→ edit-contracts

Do not downgrade an unaffected capability.

Do not leave an affected capability PASS_FROZEN.

--------------------------------------------------
1.2 OPEN INSTANCE GAPS
--------------------------------------------------

Create one gap per distinct active public function/authority seam unless the
machine schema already supports a single umbrella finding with an exact
instance list.

Each instance:

Title includes:
PUBLIC_AUTHORITY_SURFACE_LEAK

Review classification:
BLOCKING_INVARIANT

Lifecycle:
OPEN

Description:
exact callable surface and frozen mechanism replaceable.

Closure condition:
public supported API cannot accept, forward, or resolve the mechanism
substitution; internal test seam is non-public; runtime malicious-input test;
standing architecture guard.

Also record one audit-evidence gap:

Title:
First Phase 3 integration audit conclusion superseded by missed public
authority-surface leak

Review classification:
BLOCKING_INVARIANT

Lifecycle:
OPEN

Closure:
fresh full Phase 3 integration re-audit returns COMPLETE after correction.

--------------------------------------------------
1.3 HONEST DOWNGRADES
--------------------------------------------------

For every affected capability:

remove only freezeEvidence.

Expected:

affected capability
→ IMPLEMENTED

Unaffected capability remains PASS_FROZEN.

safe-editing remains DECLARED.

--------------------------------------------------
1.4 DOWNGRADE FALSIFICATIONS
--------------------------------------------------

For every downgraded capability:

temporarily restore freezeEvidence while focused derivation expects
IMPLEMENTED.

MUST FAIL:

expected IMPLEMENTED
received PASS_FROZEN

Restore intended downgrade.

Focused PASS.
ledger:verify PASS.

--------------------------------------------------
1.5 STAGE 1 COMMIT
--------------------------------------------------

Commit exactly:

Record Phase 3 public authority surface findings and downgrade affected capabilities

Contains:

- this exact contract;
- forensic census report;
- Capability Ledger downgrades;
- Gap Ledger instance/audit findings;
- deterministic rendered Gap Ledger;
- focused derivation/gap tests if required.

NO production correction.

After commit:

npm run ledger:verify
npm run check

Verify every affected capability derives IMPLEMENTED.

######################################################################
STAGE 2 — CONSTITUTION AMENDMENT 1
######################################################################

DOCUMENT-ONLY.

Create:

docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md

The original Constitution remains immutable.

--------------------------------------------------
2.1 SOURCE AMENDED
--------------------------------------------------

Reference the frozen Constitution at:

a73a623cfed77d2c2dc0238d386d40d4d1595065

Cite actual resolved headings/section numbers for:

- Pass-writer obligations
- Proportional amendment protocol
- Single source of truth for gaps
- Pass contracts become repository artifacts

--------------------------------------------------
2.2 CONCEPT ADDED
--------------------------------------------------

Add constitutional defect pattern:

PUBLIC_AUTHORITY_SURFACE_LEAK

Use the definition in this contract.

Clarify:

supported public surface includes accepted parameters and runtime-consumed extra
inputs, not only named exports.

Arbitrary dist files blocked by package exports are not automatically public.

--------------------------------------------------
2.3 PASS-WRITER OBLIGATION 8.8
--------------------------------------------------

Add:

PUBLIC CALLABLE SURFACE IS COMPLETE AUTHORITY SURFACE

Every contract that introduces or modifies a public function must state:

- complete parameter list;
- complete public options/input shape;
- whether any parameter/property is callable;
- whether any input can substitute for a frozen mechanism;
- behavior of extra JavaScript arguments/unknown option fields;
- package/declaration/barrel reachability;
- runtime proof for authority-sensitive wrappers.

"Not exported" is not sufficient when a public function accepts the value.

A public function may accept a callable/callback only when:

- the capability explicitly requires it;
- the contract names its authority and limits;
- it cannot substitute for a frozen authority/mechanism;
- it has targeted tests;
- it is listed in the approved public callable-surface manifest.

--------------------------------------------------
2.4 STANDING GUARD — PROPORTIONAL
--------------------------------------------------

Require one standing architecture guard in npm run check.

It must:

A. derive supported public entry points from package metadata/barrels;

B. parse public .d.ts with the TypeScript compiler API or equivalent existing
   dev tooling;

C. produce a deterministic public callable-surface manifest containing every
   public function's parameters and relevant user-defined option properties;

D. fail on an unreviewed public parameter/property that contains:
   - a user-defined call signature;
   - operation/adaptor/bindings/executor/loader/reader/writer/verifier shape;
   - type originating from internal authority modules;
   - any/unknown/index/rest escape in an authority-sensitive operation;

E. permit only explicit approved exceptions with:
   - function + parameter;
   - governing frozen contract;
   - reason it is ordinary behavior rather than mechanism substitution;
   - targeted test;

F. inspect runtime/public wrappers for known hidden-input patterns:
   arguments, rest forwarding, whole-options spreading into internal authority
   functions;

G. verify package export map does not expose internal authority modules.

Do not recursively inspect library data types such as Buffer methods and create
false positives.

Inspect the user-defined public parameter/option graph.

--------------------------------------------------
2.5 HISTORICAL INSTANCES
--------------------------------------------------

Record Phase 3 instances from the census.

Record the Phase 1C canonical-path exposure only if immutable repository
evidence mechanically proves the analogy and closing commit.

Do not use chat as evidence.

If mechanical evidence is insufficient:

omit the retroactive classification.

--------------------------------------------------
2.6 AMENDMENT COMMIT
--------------------------------------------------

Commit exactly:

Amend Path Code Constitution for public authority surfaces

Only the amendment document.

No source.
No tests.
No ledger relink.

Run npm run check.

######################################################################
STAGE 3 — CORRECT ALL CONFIRMED PHASE 3 INSTANCES
######################################################################

Do not fix only executeMultiFilePlan if the census found more.

For each affected public function:

- preserve legitimate public data/context/options;
- remove only mechanism-substitution input;
- internalize fault/test adapters;
- keep behavior and target sequence unchanged.

==================================================
3.1 PUBLIC WRAPPER PATTERN
==================================================

Public mutation/coordination wrappers must explicitly bind real production
mechanisms.

They may accept only contract-approved caller data/context.

If a public safe options object remains:

- define its exact safe fields;
- construct a fresh internal options object from those fields;
- do not forward/spread the caller object wholesale;
- ignore or reject unknown mechanism-substitution fields consistently with the
  frozen public contract.

A JavaScript caller passing extra arguments or extra fsOps/targetOps-like
properties must not alter execution.

==================================================
3.2 MULTI-FILE EXECUTOR
==================================================

Public:

executeMultiFilePlan(plan: MultiFilePlan)

No targetOps parameter/property.

No runtime arguments[1] consultation.

Always binds the real frozen:

replaceExistingFile
createFile

Internal test-only executor may exist under src/editing/internal with exactly
the required bindings.

Not public.

==================================================
3.3 EXISTING-FILE REPLACEMENT — CONDITIONAL
==================================================

If census confirms public fsOps/adaptor injection:

public replaceExistingFile retains only legitimate frozen public context such
as already-earned Git context or caller-narrowed bounds actually authorized by
its contract.

Fault adapter moves to an internal function, conceptually:

replaceExistingFileWithDependencies
or repository-consistent equivalent.

Public wrapper binds productionAtomicReplaceFs.

Public unknown/extra fsOps cannot alter execution.

Recovery tests use the internal function.

Assertions remain unchanged.

==================================================
3.4 SAFE CREATION — CONDITIONAL
==================================================

If census confirms public create fsOps/verifier injection:

public createFile retains only legitimate frozen public context.

Fault adapter/verifier operations move internal.

Public wrapper binds productionAtomicCreateFs and the real operation-bound
verification mechanism.

Public unknown/extra fsOps cannot alter execution.

Recovery tests use internal function.

Assertions remain unchanged.

==================================================
3.5 PREPARATION / AUTHORIZATION / OTHER FUNCTIONS
==================================================

For every other confirmed instance:

apply the same pattern:

public wrapper
→ exact safe caller data/context only
→ real production mechanism bound internally

test/fault mechanism
→ private internal function

If correction would change frozen behavior rather than only authority
reachability:

STOP before editing that instance.

==================================================
3.6 PACKAGE EXPORT HARDENING — CONDITIONAL
==================================================

If package subpath exports expose internal authority modules:

close only when the supported public API can be preserved exactly.

Add/adjust restrictive exports map and tests if this is a behavior-preserving
packaging correction.

If it would break a frozen supported import:

STOP for review.

Relative source imports used by repository tests are not package public API.

==================================================
3.7 STANDING ARCHITECTURE TEST
==================================================

Implement the amendment's standing guard.

Suggested location:

tests/architecture/public-authority-surface.test.ts

and a minimal helper/tooling module where required.

It runs in normal npm run check.

Add deterministic manifest/allowlist only where necessary.

No new runtime dependency.

No generic governance framework.

==================================================
3.8 PER-INSTANCE RUNTIME ADVERSARIAL TESTS
==================================================

For every corrected public function:

call it from a JavaScript-compatible widened shape with malicious mechanism
substitution that THROWS if invoked.

Examples:

executeMultiFilePlan:
malicious targetOps throw

replaceExistingFile:
malicious fsOps throw, while legitimate safe context remains functional

createFile:
malicious fsOps/verifier ops throw

Expected:

- malicious mechanism never invoked;
- real operation governs;
- operation succeeds/refuses according to real currentness/config/authority;
- real filesystem state proves execution path.

==================================================
3.9 PUBLIC / DECLARATION / PACKAGE TESTS
==================================================

Prove:

- public signatures contain only approved fields;
- internal executors/adapters absent from public barrels;
- absent from package root/subpath exports;
- absent from reachable public declarations;
- package consumer cannot import internal authority module through package
  specifier;
- no runtime hidden argument forwarding.

==================================================
3.10 LIVE FALSIFICATIONS
==================================================

H-F1 — PUBLIC TARGET OPS REINTRODUCTION

Wire executeMultiFilePlan to honor caller targetOps.

Malicious runtime test MUST fail because fake throws.

Restore.

H-F2 — PUBLIC REPLACE FS OPS REINTRODUCTION

Only if replacement instance existed.

Wire public replacement to honor caller fsOps.

Malicious runtime test MUST fail.

Restore.

H-F3 — PUBLIC CREATE FS OPS REINTRODUCTION

Only if creation instance existed.

Wire public creation to honor caller fsOps/verifier.

Malicious runtime test MUST fail.

Restore.

H-F4 — INTERNAL EXPORT

Export one internal executor/binding from a public barrel/package entry.

Standing/public-surface test MUST fail naming it.

Restore.

H-F5 — CALLABLE PARAMETER

Add a callable mechanism-substitution property to a public options type.

Standing declaration test MUST fail naming function/parameter/property.

Restore.

H-F6 — HIDDEN RUNTIME EXTRA ARG

Keep public declaration clean but read arguments[n] at runtime.

Runtime malicious-extra-input test MUST fail.

Restore.

H-F7 — PACKAGE DEEP EXPORT

Temporarily expose an internal authority module through package exports.

Package-surface test MUST fail.

Restore.

H-F8 — INTERNAL TEST EXECUTOR BROKEN

Break internal test binding/delegation.

Affected recovery/integration tests MUST fail.

Restore.

For every applicable H-F:

- exact corruption;
- exact focused failure;
- intended reason;
- exact restoration;
- empty temporary diff;
- final PASS.

==================================================
3.11 RE-RUN MOVED EVIDENCE
==================================================

Re-run unchanged:

- every Phase 3D D-F1 through D-F11;
- every 3B/3C targeted falsification whose induction path moved internal;
- all 3A/3B/3C/3D permanent tests;
- first audit B1 through B8 after migrating controlled injection to internal
  seams.

Do not change assertions merely to accommodate the correction.

==================================================
3.12 CORRECTION REPORT
==================================================

Create:

docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md

Record:

- census commit;
- Constitution amendment;
- every active instance;
- before/after public signature;
- legitimate public fields preserved;
- internal seam;
- package exports;
- standing guard;
- malicious runtime tests;
- H-F1 through H-F8 applicability/results;
- moved test induction;
- actual tests;
- NOT VALIDATED.

Report does not contain its future commit SHA.

==================================================
3.13 CORRECTION COMMIT
==================================================

Commit exactly:

Internalize Phase 3 authority-bearing test adapters

Contains:

- minimal production wrapper/internalization corrections;
- standing architecture guard;
- affected tests;
- correction report.

No capability relink yet.

After commit:

record full correction SHA.

Run:

npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run check

Verify:

- every affected capability remains IMPLEMENTED;
- unaffected capabilities retain prior state;
- exactly one production write module;
- runtime dependencies 0;
- working tree clean.

######################################################################
STAGE 4 — EVIDENCE, GAP CLOSURE, CAPABILITY RELINK
######################################################################

Re-run all Stage 3 evidence at immutable correction source.

Close each concrete instance gap only after:

- public signature/runtime corrected;
- malicious runtime test passes;
- standing guard passes;
- corresponding live falsification fails/restores;
- inherited behavior passes.

Do not close the audit-supersession gap yet.
That closes only after Stage 5 re-audit COMPLETE.

==================================================
4.1 RELINK EVERY AFFECTED CAPABILITY
==================================================

Use the current truthful Capability Ledger model.

For each downgraded capability:

- implementation evidence cites the corrected implementation commit;
- report path cites the hardening report;
- productionScopes cover every changed production subsystem;
- freeze form matches current verifier truthfully.

Prefer sameCommit only when implementation and report coexist in the
correction commit and current ledger accepts it.

Do not reuse superseded implementation commits as current freeze evidence.

==================================================
4.2 MIRRORED RELINK FALSIFICATIONS
==================================================

For every affected capability:

with freezeEvidence present and derivation expecting PASS_FROZEN:

temporarily remove only freezeEvidence.

MUST FAIL:

expected PASS_FROZEN
received IMPLEMENTED

Restore.

Focused PASS.
ledger:verify PASS.

==================================================
4.3 RELINK COMMIT
==================================================

Commit exactly:

Relink Phase 3 capabilities after public authority surface hardening

Contains:

- capability freeze evidence;
- instance gap closures;
- derivation tests;
- deterministic gap render;
- README interim status if necessary.

NO production changes.

Expected:

edit-contracts:
PASS_FROZEN unless never affected

existing-file-replacement:
PASS_FROZEN

safe-file-creation:
PASS_FROZEN

multi-file-coordination:
PASS_FROZEN

safe-editing:
DECLARED / IN PROGRESS

######################################################################
STAGE 5 — FRESH FULL PHASE 3 INTEGRATION RE-AUDIT
######################################################################

The first audit at:

696ef4fe58c21cdd527869309a2b9fd5abcd19a8

remains immutable.

Its COMPLETE conclusion is superseded for progression.

Create a FRESH independent auditor after Stage 4.

Do not reuse:

- forensic census writer;
- Constitution amendment writer;
- correction implementer;
- relink writer.

This is a FULL RE-AUDIT.

Not a delta audit.

==================================================
5.1 BASE AUDIT
==================================================

Re-run the entire frozen Phase 3 integration audit contract at corrected HEAD:

- SE-001 through SE-020 phase-wide;
- B1 full read/write/re-observe fingerprint bridge;
- B2 authored → reobserved;
- B3 stale snapshot / stale edit / fresh edit;
- B4 Git point-in-time;
- B5 denial;
- B6 action classes;
- B7 ConfigFailure + ABSENT;
- B8 partial plan + fresh re-observation;
- write boundary inside/outside editing;
- persistence scan;
- five recovery shapes;
- 3B-H1 corrections;
- 3C-H1 corrections;
- Constitution integration-audit questions;
- construction lessons;
- Capability/Gap Ledger;
- compile-time sweep;
- original audit falsifiability probes.

Audit tests that need fault injection must use internal seams.

Public composition tests use public wrappers only.

No prior COMPLETE conclusion is accepted as substitute.

==================================================
5.2 PUBLIC AUTHORITY-SURFACE AUDIT DIMENSION
==================================================

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

==================================================
5.3 PUBLIC-SURFACE RE-AUDIT FALSIFICATIONS
==================================================

A-F15.
Reintroduce public execute targetOps.
Public runtime test fails.

A-F16.
Reintroduce public replacement fsOps if applicable.
Public runtime test fails.

A-F17.
Reintroduce public creation fsOps if applicable.
Public runtime test fails.

A-F18.
Export internal executor.
Surface test fails.

A-F19.
Add callable mechanism-substitution field.
Standing declaration test fails.

A-F20.
Read hidden extra argument at runtime.
Runtime test fails.

A-F21.
Expose internal package subpath.
Package import test fails.

A-F22.
Break internal delegation.
Recovery/composition test fails.

Every applicable falsification:

corrupt
→ exact failure
→ intended reason
→ restore
→ final PASS.

==================================================
5.4 CONSTITUTION / CONTRACT LESSONS
==================================================

The re-audit report records, without inventing new Gap Ledger schema:

- 3C unsatisfiable Phase 2B after-state requirement:
  primary origin CONTRACT;
  pass-writer obligation on satisfiable requirements;

- draft 3D permissive-removal test:
  primary origin CONTRACT;
  caught before implementation;

- GAP-046 softened despite frozen contradiction:
  primary origin CONTRACT;
  classification obligation;

- 3D contract constrained exports but not accepted parameters/runtime input:
  primary origin CONTRACT;
  new Amendment 1 pass-writer obligation 8.8;

- Phase 3D implementation exposed caller targetOps:
  primary origin IMPLEMENTATION;

- first audit used the seam and missed it:
  contributing origin EVIDENCE.

Each must be traceable to immutable repository evidence.

==================================================
5.5 RE-AUDIT COMPLETE GATE
==================================================

COMPLETE only if:

- every original Phase 3 audit criterion passes again;
- P1 through P14 pass;
- A-F15 through A-F22 applicable probes fail/restore;
- no active PUBLIC_AUTHORITY_SURFACE_LEAK remains;
- every new finding is corrected/closed or open in Gap Ledger with closure
  condition;
- every affected capability PASS_FROZEN;
- safe-editing remains DECLARED;
- runtime dependencies 0;
- clean tree;
- closure absent;
- Phase 4 absent.

If any condition fails:

PHASE 3 SAFE EDITING — NOT COMPLETE

Record and stop.

No production fix inside audit.

==================================================
5.6 RE-AUDIT REPORT / COMMIT
==================================================

On COMPLETE create:

docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md

State:

- first audit 696ef4f preserved;
- its COMPLETE conclusion superseded for progression;
- census;
- Constitution Amendment 1;
- corrections;
- all original audit evidence;
- P1 through P14;
- A-F15 through A-F22;
- exact final test total;
- NOT VALIDATED.

Close the audit-supersession gap against this immutable re-audit commit only
after commit exists, in later closure/linkage bookkeeping.

Commit exactly:

Freeze Path Code Phase 3 safe editing integration re-audit

NO production changes.
NO safe-editing promotion.
NO closure.

On NOT COMPLETE:

commit exactly:

Record Path Code Phase 3 integration re-audit finding

and stop.

######################################################################
STAGE 6 — CONDITIONAL PHASE 3 CLOSURE
######################################################################

ONLY IF STAGE 5 RETURNS COMPLETE.

Phase 3 closure is two immutable serial commits to avoid circular evidence.

==================================================
6.1 CLOSURE REVIEW GATE
==================================================

Before closure verify:

- re-audit commit immutable and ancestor;
- conclusion COMPLETE;
- SE-001 through SE-020 all SATISFIED_PHASE_WIDE;
- all Phase 3 component capabilities PASS_FROZEN;
- safe-editing still DECLARED;
- every concrete public authority leak gap CLOSED;
- audit-supersession gap eligible for closure;
- no untracked findings;
- every open gap has classification/proposed class, missing evidence, and
  closure condition;
- full ancestry;
- runtime dependencies 0;
- working tree clean.

If any fail:

do not close Phase 3.

==================================================
6.2 CLOSURE COMMIT A — DOCUMENT ONLY
==================================================

Create:

docs/PHASE_3_CLOSURE.md

Record:

# PATH CODE — PHASE 3 SAFE EDITING ENGINE CLOSURE

Status:
PHASE 3 — SAFE EDITING ENGINE: COMPLETE / FROZEN

Audited implementation:

- full re-audit checkpoint;
- COMPLETE conclusion;
- re-audit report path;
- first audit 696ef4f preserved and superseded for progression;
- exact public authority-surface correction chain.

Verification:

- exact final test total;
- typecheck;
- build;
- check;
- CLI smoke;
- ledger:verify;
- runtime dependencies.

Proof obligations:

SE-001 through SE-020
→ SATISFIED_PHASE_WIDE

What Phase 3 established:

- current knowledge + explicit approval before mutation;
- bounded existing-file replacement;
- bounded no-overwrite creation;
- coordination of 2–16 authorized targets;
- per-target currentness/config checks;
- per-file atomicity;
- honest partial-commit result;
- no rollback;
- authored evidence remains distinct until re-observation.

Public authority-surface hardening:

- every supported public callable surface enumerated;
- internal fault adapters not public;
- wrappers bind real mechanisms;
- standing guard;
- first audit lesson.

Evidence chain:

every Phase 3 checkpoint, including:

- 3B original/negative/H1/evidence/relink;
- 3C original/H1 stages/relink;
- Constitution;
- Phase 3D Master/implementation/E1/linkage;
- first audit;
- census;
- Amendment 1;
- corrections;
- relinks;
- full re-audit.

Known limitations:

every open gap individually, with class and closure condition.

What Phase 3 does NOT provide:

- deletion;
- directory creation;
- plan-level atomicity;
- rollback;
- persistence/resume;
- Git mutation;
- model execution;
- autonomous editing.

Conclusion:

Phase 1 established what Path Code may trust.
Phase 2 established what Path Code may claim to know.
Phase 3 established what Path Code may change, under what authority, and on
what evidence.

Do not put Closure Commit A's future SHA inside its own document.

Commit exactly:

Record Path Code Phase 3 Safe Editing Engine closure

Commit A contains:

- docs/PHASE_3_CLOSURE.md;
- closure review of gaps / deterministic Gap Ledger render if required;
- NO safe-editing phase promotion yet;
- NO README Phase 3 COMPLETE claim yet;
- NO source/tests changes.

After commit:

record full Closure A SHA.

Run ledger:verify and npm run check.

==================================================
6.3 CLOSURE LINKAGE COMMIT B
==================================================

Use current Self-Observation model truthfully.

Add phase-level evidence to safe-editing citing:

- immutable full re-audit commit;
- immutable Closure Commit A;
- exact report/document paths.

Do not invent future Commit B SHA.

Expected derived state:

safe-editing
→ PHASE_VERIFIED

Close audit-supersession gap against the immutable re-audit/closure evidence.

--------------------------------------------------
6.4 PHASE PROMOTION FALSIFICATION
--------------------------------------------------

With phaseAuditEvidence / closure evidence present and focused derivation
expecting PHASE_VERIFIED:

temporarily remove only the phase-level evidence.

MUST FAIL:

expected PHASE_VERIFIED
received DECLARED
or exact weaker truthful state.

Restore.

Focused PASS.
ledger:verify PASS.

--------------------------------------------------
6.5 README
--------------------------------------------------

Update:

Phase 0 — FROZEN

Phase 1 — Foundation Kernel:
COMPLETE / FROZEN

Phase 2 — Repository Intelligence:
COMPLETE / FROZEN

Phase 3 — Safe Editing Engine:
COMPLETE / FROZEN

Foundation Extensibility Constitution V1 + Amendment 1:
FROZEN

Capabilities:

- edit-contracts PASS_FROZEN
- existing-file-replacement PASS_FROZEN
- safe-file-creation PASS_FROZEN
- multi-file-coordination PASS_FROZEN
- safe-editing PHASE_VERIFIED

State what Path Code can and cannot do exactly as closure records.

Next:

ONE bounded Closed-Vocabulary & Foundation Extensibility Audit
combined with preparation of the Phase 4 Master Contract.

No Phase 4 implementation yet.

--------------------------------------------------
6.6 CLOSURE LINKAGE COMMIT
--------------------------------------------------

Commit exactly:

Link Path Code Phase 3 closure to safe-editing verification

Contains:

- safe-editing phase-level evidence;
- derivation test;
- audit-supersession gap closure/render;
- README.

NO source changes.
NO audit test changes.

After commit:

run full final validation.

######################################################################
FINAL VALIDATION
######################################################################

At final successful HEAD:

git rev-parse HEAD
npm run ledger:verify
npm run typecheck
npm test
npm run build
npm run cli:smoke
npm run check

Verify:

- exact final test total;
- every component capability PASS_FROZEN;
- safe-editing PHASE_VERIFIED;
- no active public authority-surface leak;
- standing guard in npm run check;
- exactly one project filesystem write module;
- runtime dependencies 0;
- working tree clean;
- no push;
- Phase 4 absent.

==================================================
NOT VALIDATED — MUST BE NON-EMPTY
==================================================

At minimum preserve applicable limitations:

- supported public surface is enforced through package metadata/barrels/
  declarations/runtime tests; hostile direct filesystem imports inside the
  repository remain governed by architecture boundaries, not a language
  sandbox;

- any/unknown/runtime metaprogramming can evade static declaration inspection;
  authority-sensitive runtime wrapper tests remain necessary;

- hostile TypeScript casts remain possible;

- host/platform-specific gaps remain;

- residual filesystem races remain;

- no rollback;

- deletion and directory creation remain outside Phase 3;

- authored creation evidence requires re-observation;

- a COMPLETE re-audit means no defect was found by its evidence, not that none
  can exist;

- the one bounded foundation baseline audit before Phase 4 has not yet run;

- Phase 4 implementation has not started.

==================================================
COMPLETE CRITERIA — WHOLE PACKAGE
==================================================

1. Suspected seam mechanically confirmed before mutation.

2. Complete supported public entrypoint census performed.

3. Every public function signature/input graph classified.

4. Every active Phase 3 instance and introducing commit recorded.

5. No active pre-Phase-3 instance silently ignored.

6. Every affected capability honestly downgraded.

7. Constitution Amendment 1 immutable and additive.

8. PUBLIC_AUTHORITY_SURFACE_LEAK pattern defined without inventing
   reviewClassification/lifecycle values.

9. Pass-writer obligation 8.8 frozen.

10. Standing public authority-surface guard implemented and falsified.

11. Every active Phase 3 instance corrected in one package.

12. Legitimate public contexts preserved.

13. Public wrappers bind real production mechanisms.

14. Extra JS args/unknown mechanism fields cannot alter execution.

15. Internal test seams not supported public API.

16. Package exports do not expose authority-bearing internal modules.

17. Every moved recovery/audit test keeps assertions unchanged.

18. Every applicable H-F1 through H-F8 fails/restores.

19. Every affected capability relinked to corrected code.

20. Every concrete instance gap closed against immutable correction evidence.

21. Full Phase 3 re-audit rerun, not delta.

22. Original audit dimensions all pass again.

23. P1 through P14 pass.

24. A-F15 through A-F22 applicable probes fail/restore.

25. No untracked finding exists.

26. Re-audit returns COMPLETE.

27. Closure document binds immutable re-audit.

28. safe-editing derives PHASE_VERIFIED only after separate closure linkage.

29. Phase-promotion falsification passes.

30. Complete ancestry preserved.

31. First incorrect audit remains immutable.

32. No history rewritten.

33. Runtime dependencies remain 0.

34. Working tree clean.

35. No push.

36. Phase 4 not started.

If any criterion fails:

stop at the relevant stage.

Do not claim Phase 3 complete.

==================================================
FINAL COORDINATED REPORT
==================================================

Return:

PATH CODE — PUBLIC AUTHORITY SURFACE HARDENING
+ PHASE 3 RE-AUDIT
+ CONDITIONAL CLOSURE REPORT

Overall:
PHASE 3 COMPLETE / NOT COMPLETE

Starting HEAD:
696ef4fe58c21cdd527869309a2b9fd5abcd19a8

Stage 0 Census:

- suspected 3D seam confirmed:
- supported public entry points:
- package export/deep-import result:
- total public functions:
- full signature manifest:
- active instances:
- introducing commits:
- active pre-Phase-3 instances:
- outcome A/B/C:

Stage 1:

- census/finding commit:
- exact contract path:
- affected capabilities:
- downgrade states:
- downgrade falsifications:
- instance gap IDs:
- audit-supersession gap ID:

Stage 2:

- Constitution Amendment path:
- amendment commit:
- actual heading/section references:
- defect pattern:
- pass-writer obligation 8.8:
- standing guard contract:
- Gap Ledger schema changed:
  MUST BE NO unless compatible field already existed

Stage 3:

- correction commit:
- per instance before/after signature:
- legitimate public fields preserved:
- public wrapper production bindings:
- internal functions:
- package exports:
- standing test:
- malicious runtime tests:
- H-F1:
- H-F2:
- H-F3:
- H-F4:
- H-F5:
- H-F6:
- H-F7:
- H-F8:
- moved test assertions changed:
  MUST BE NO
- inherited suites:
- runtime total:

Stage 4:

- relink commit:
- capability implementation/freeze evidence:
- mirrored falsifications:
- instance gaps closed:
- audit-supersession gap:
  MUST REMAIN OPEN UNTIL RE-AUDIT

Stage 5:

- re-audit baseline:
- re-audit commit:
- original SE-001..020:
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
- Constitution questions:
- construction lessons:
- ledgers:
- compile-time:
- original falsifications:
- P1:
- P2:
- P3:
- P4:
- P5:
- P6:
- P7:
- P8:
- P9:
- P10:
- P11:
- P12:
- P13:
- P14:
- A-F15:
- A-F16:
- A-F17:
- A-F18:
- A-F19:
- A-F20:
- A-F21:
- A-F22:
- findings:
- no untracked findings:
- result:

Stage 6 Closure:

- closure review gate:
- Closure Commit A:
- closure path:
- re-audit bound:
- first audit superseded/preserved:
- all twenty obligations:
- open gaps:
- closure linkage Commit B:
- safe-editing phase evidence:
- promotion falsification:
- safe-editing final state:
- README:

Capability states:

- edit-contracts:
- existing-file-replacement:
- safe-file-creation:
- multi-file-coordination:
- safe-editing:

Validation:

- baseline tests:
- correction tests:
- re-audit tests:
- final tests:
- typecheck:
- build:
- cli smoke:
- npm run check:
- ledger:verify:
- runtime dependencies:

Git:

- complete ancestry:
- history rewritten:
  NO
- working tree:
- push:
  NO
- Phase 4:
  NOT STARTED

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

If PHASE 3 COMPLETE:

Phase 3:
SAFE EDITING ENGINE — COMPLETE / FROZEN

safe-editing:
PHASE_VERIFIED

Next permitted operation:

ONE bounded Closed-Vocabulary & Foundation Extensibility Audit
+ Phase 4 Master Contract preparation

DO NOT START PHASE 4 IMPLEMENTATION INSIDE THIS PACKAGE.
