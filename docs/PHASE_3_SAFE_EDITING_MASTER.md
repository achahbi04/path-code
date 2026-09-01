PATH CODE — PHASE 3
SAFE EDITING ENGINE
MASTER CONTRACT — FINAL FOR FREEZE AFTER PHASE 2 CLOSURE

STATUS

FINAL ARCHITECTURE FOR FREEZE.

NOT YET FROZEN.

NOT AUTHORITY TO IMPLEMENT.

This contract may be drafted in parallel with Phase 2 Closure, but it MUST NOT
be committed/frozen until the Phase 2 Closure commit exists and its full SHA is
known.

After Phase 2 Closure, replace:

ac87286760bc9e0ce65427d98c7b4250ea1dc86f

with the actual immutable closure checkpoint.

Then validate this contract against the closed Phase 2 repository state and
freeze it in a separate DOCUMENT-ONLY commit.

The frozen Engineering Self-Observation architecture established:

Phase 2 Closure
↓
Capability / Construction Ledger v1
Gap Ledger v1
ledger
Engineering Self-Observation runtime foundation
↓
Phase 3 Safe Editing implementation

Therefore:

A. THIS MASTER CONTRACT

may be prepared in parallel and frozen after Phase 2 Closure.

B. PHASE 3 IMPLEMENTATION

3A or later MUST NOT begin until BOTH are true:

this Phase 3 Master Contract is frozen

the post-Phase-2 Self-Observation foundation
(Capability/Gap Ledger v1 + ledger + Engineering
Self-Observation runtime foundation)
has been implemented/frozen

unless an explicit later architecture amendment changes that sequence.

This distinction enables parallel architecture work without skipping a frozen
governance gate.

Required baseline after closure:

ac87286760bc9e0ce65427d98c7b4250ea1dc86f

Required state before freezing this Master Contract:

Phase 2 Closure exists

Phase 2 is COMPLETE / FROZEN

Phase 2G audit checkpoint remains ancestor

Phase 2G-E1 supplement remains ancestor

working tree clean

Phase 3 implementation absent

runtime total independently verified

all Phase 2 evidence preserved

If any of those conditions are false:

DO NOT FREEZE THIS CONTRACT.

Phase 1 was decomposed pass by pass. Its integration audit found obligations
that had never been built.

Phase 2 froze a Master Contract before implementation. Its integration audit
therefore had a pre-existing truth source and found a real composition defect
that local pass evidence had missed.

Phase 3 follows the Phase 2 discipline.

No mutation implementation begins until this Master Contract is frozen.

Everything before Phase 3 is read-only.

Phase 1 established:

what Path Code may trust.

Phase 2 established:

what Path Code may claim to know.

Phase 3 gives Path Code a bounded mutation capability.

This is the first phase where a defect can damage user work rather than only
produce a false engineering claim.

Therefore the standard increases.

Phase 3 must prove:

currentness before mutation

exact authorization

exact intended bytes

bounded write authority

atomic publication where claimed

honest recovery boundaries

verified after-state

explicit provenance

explicit stale-knowledge invalidation

no unrelated writes

no Git mutation

no model authority

no hidden persistence

Phase 1:

AUTHORITY MUST BE EARNED.

Phase 2:

KNOWLEDGE MUST BE EARNED THROUGH OBSERVATION.

Phase 3:

MUTATION MUST BE EARNED THROUGH CURRENT KNOWLEDGE AND EXPLICIT AUTHORIZATION.

Recommendation is not authority.

Initiative is not authority.

A future upper layer may:

notice a problem

recommend a change

prepare a proposed edit

explain why the edit is useful

but none of those acts grant write authority.

The mutation boundary is crossed only by an earned EditAuthorization bound to
an exact prepared mutation.

The Safe Editing Engine is Path Code's bounded, evidence-preconditioned,
recoverable, explicitly-authorized mechanism for modifying or creating regular
files inside the authorized workspace.

It establishes:

what may be changed

what current evidence is required

what exact bytes are authorized

under whose explicit authorization

with what before-state

with what after-state

what atomicity is actually guaranteed

what failure/recovery boundary exists

what provenance results

what prior knowledge becomes unsupported

what remains unchanged

It does NOT decide what SHOULD be changed.

That decision belongs to an upper planning/recommendation layer and/or the
user.

==================================================

PREPARE ≠ AUTHORIZE ≠ COMMIT
==================================================

Phase 3 must structurally separate three states:

PREPARED_MUTATION
≠
EDIT_AUTHORIZATION
≠
EDIT_RECORD

A PreparedMutation is a proposal.

It carries no authority.

An EditAuthorization is explicit authority for exactly one prepared mutation.

It does not prove execution occurred.

An EditRecord is earned only after the mutation mechanism reaches a terminal
outcome and records what actually happened.

No caller-controlled object may collapse these states.

An authorization must not bind only a vague instruction such as:

"update this function"

or:

"fix the typo."

It must bind the exact mutation.

For modification of an existing file, PreparedMutation must bind at minimum:

exact target RepositoryEntry reference

action class

exact expected before-state SHA-256

exact expected before byte length

exact proposed after-state SHA-256

exact proposed after byte length

exact proposed bytes, or an immutable operation-owned reference to them

workspace/config provenance needed for revalidation

For creation, PreparedCreation must bind:

exact admitted/current parent RepositoryEntry

validated leaf name

action class

exact proposed content SHA-256

exact proposed byte length

exact proposed bytes, or operation-owned immutable reference

expected NON_EXISTENT state for the leaf

Authorization for one mutation MUST NOT authorize any other target, before
state, after state, action class, or byte sequence.

A model-produced prose instruction can inform preparation.

It cannot itself satisfy authorization.

Existing-file preparation:

receives an earned RepositoryEntry

reads through the Phase 2B bounded reader

obtains the exact current bytes available at preparation time

computes the proposed exact after bytes outside the mutation mechanism

binds before and after fingerprints into PreparedMutation

Preparation does NOT grant authority.

Creation preparation:

receives an admitted parent RepositoryEntry

validates the leaf name

verifies parent identity/current workspace membership

verifies leaf currently does not exist

binds exact proposed bytes

Preparation evidence is point-in-time.

It is not a lease.

Every mutation requires an opaque EditAuthorization obtained through an
explicit authorization step.

EditAuthorization must bind:

exact PreparedMutation identity

exact target

exact action class

exact before fingerprint / creation precondition

exact after fingerprint

exact byte lengths

It MUST NOT be constructible from:

a model response

a tool result

a plan

configuration

search result

RepositoryMap

Git state

recommendation

initiative

caller-supplied plain object

Phase 3 has NO autonomous authorization.

General autonomous/policy authority remains a later-phase concern.

EditAuthorization is one-shot.

A successfully consumed or terminally failed authorization must not be silently
replayed for a second mutation.

The Phase 3 mechanism must reject reuse within the live process/operation
boundary.

No persistent authorization database is introduced.

If process restart destroys in-memory authorization state, the old in-memory
authorization object no longer exists and must not be reconstructed from
serialized data.

Preparation currentness is insufficient.

Time may pass between:

prepare
→ review
→ authorization
→ mutation.

Therefore the mutation mechanism itself performs a full currentness check
immediately before any persistent mutation begins.

For existing files:

re-read through the Phase 2B reader

require exact target RepositoryEntry/provenance compatibility

require full SHA-256 == authorization expected-before SHA-256

require exact before byte length

require regular-file identity/type still valid

recheck deny-path

recheck workspace boundary

recheck physical target semantics

FORBIDDEN AS COMMIT PRECONDITION:

REVALIDATION_REQUIRED
NOT_VERIFIED
CURRENT_IDENTITY alone
UNVERIFIABLE
metadata equality
old hash without a fresh full read
a caller's claim that "nothing changed"

If current bytes differ:

REFUSE BEFORE MUTATION.

There is no metadata fast path.

This is deliberate.

Phase 3 must not pretend a point-in-time verification is a lease.

The implementation must minimize the interval between final currentness
verification and atomic publication.

For existing replacement, the mechanism should revalidate target
identity/currentness again after the temporary candidate is fully prepared and
immediately before the commit point where practical.

However:

pure Node filesystem primitives do not provide a universal cross-platform
compare-and-swap rename against arbitrary hostile concurrent writers.

Therefore Phase 3 MUST NOT claim:

"linearizable against a hostile concurrent filesystem attacker"

unless a platform-specific mechanism is later proven.

The frozen Phase 3 guarantee is:

any detected pre-commit currentness/identity change causes refusal

Path Code never intentionally writes using known-stale evidence

target substitution/symlink checks are performed immediately before commit

final after-state is re-read and verified

any remaining platform race limitation is explicit in the Gap Ledger

Do not hide this limitation behind the word "atomic."

A path Path Code may not observe is not a path it may mutate.

deny-path is rechecked at mutation time:

lexically first
then physically using the existing canonical/boundary semantics

No second independent denial algorithm.

A denied target produces an explicit refusal.

No silent skip.

DECISION:

APPLY disable-action NARROWLY to Phase 3 mutation mechanisms.

Reason:

Phase 3 is the first phase that performs the action which this restriction is
intended to prevent.

Deferring enforcement to a future policy engine would mean the restriction is
not enforced at the moment harm becomes possible.

Phase 3 must NOT create a general policy engine.

3A must inspect the frozen Phase 1E config representation and introduce the
smallest fixed mutation-action mapping compatible with that existing schema.

Frozen Phase 1E represents disable-action as ActionClass values in
ProjectRestrictions.disabledActions (parsed from disable-action= directives;
e.g. EDIT). Phase 3 mutation action classes below are separate from ActionClass
and require an explicit 3A mapping to that representation.

At minimum Phase 3 must distinguish semantically:

MODIFY_EXISTING_FILE

CREATE_FILE

If the existing frozen disable-action representation cannot express these
without changing its semantics:

3A MUST STOP AND REPORT.

Do not reinterpret arbitrary strings or invent wildcard policy behavior.

Phase 6 may later subsume this narrow mechanism.

Existing modification target:

earned RepositoryEntry

existing regular file

inside WorkspaceBoundary

not denied

not .git / Git administrative content

not symlink object

not directory/device/socket/FIFO

current identity/type revalidated

full content within Phase 2B readable ceiling

hard-link semantics supported under §14

Creation target:

non-existent leaf

exact admitted/current parent directory entry

parent inside WorkspaceBoundary

parent not denied

leaf validated

no missing parent creation

target must still not exist at publication time

outside-workspace target

denied target

.git and descendants

directory mutation

symlink creation

symlink deletion

symlink-content mutation through an unresolved path

device

socket

FIFO

target with unknown/unverifiable type

target above supported full-read/write ceiling

path whose required parent was not admitted

deletion of an existing file

creation of missing parent directories

For creation, leaf name must be:

non-empty

not "."

not ".."

contain no path separator

contain no NUL

contain no traversal encoding interpreted by the platform

represent exactly one child name

Parent and leaf are separate typed concepts.

Do not accept a caller-provided full path string as creation authority.

Phase 3 never intentionally mutates a symlink object.

An existing target must resolve to and remain the same admitted regular-file
target under the established canonical semantics.

If target kind changes to symlink during observable pre-commit checks:

REFUSE.

Atomic rename over a path does not follow a symlink target, but a concurrent
replacement race could cause a symlink directory entry itself to be replaced.

Therefore the contract does not claim impossible universal hostile-race
prevention under pure Node.

That residual race belongs to the explicit concurrency limitation in §7.

Atomic replacement creates a new inode/object at the target path.

That changes hard-link semantics.

Phase 3 therefore refuses existing-file atomic replacement when:

nlink > 1

unless a later explicit architecture proves safe intended semantics.

For supported files, Phase 3 must preserve basic file metadata required by the
frozen implementation contract:

mode/permissions

owner/group where the platform permits and where preservation can be proven

If ownership cannot be preserved without privilege escalation or silent
change:

REFUSE.

Phase 3 does not claim preservation of every platform-specific:

xattr

ACL

resource fork

alternate data stream

filesystem-specific metadata

unless a later sub-pass explicitly proves it.

Those limitations must be reported honestly.

DECISION:

same-directory verified temporary candidate
→ atomic rename/replace commit

NOT:

truncate-and-rewrite in place

NOT:

cross-filesystem temporary copy

Required high-level sequence:

full pre-commit currentness verification

boundary/denial/type/identity checks

create unique temporary regular file in SAME parent directory using
exclusive creation semantics

write exact proposed bytes

flush/sync temporary content as supported

apply/preserve required basic metadata

verify temporary candidate bytes/hash before publication

recheck target identity/currentness immediately before commit where
supported

atomically rename/replace temporary candidate over target

re-read final target through the trusted bounded reader

require final SHA-256 == authorized after-state SHA-256

produce terminal EditRecord

The temporary candidate must never be treated as repository knowledge.

It is an internal mutation artifact.

The old draft statement:

"failure at any step leaves the original file intact"

is too strong once the atomic rename commit point has occurred.

LOCKED semantics:

BEFORE COMMIT POINT

Any induced in-process failure before rename/publication MUST leave the
original target bytes intact.

AT COMMIT POINT

The path transitions atomically from old object to prepared candidate where
the platform/filesystem guarantees atomic same-directory rename semantics.

AFTER COMMIT POINT

Unexpected after-state verification is an explicit terminal failure.

Do NOT falsely claim the original remains intact after commit.

If after-state differs because of external interference:

report exact observed state

do not silently claim success

do not invent an automatic rollback guarantee

A later recovery architecture may add stronger post-commit rollback semantics.

Recovery proof in Phase 3 means at minimum:

deliberate induced failures at multiple PRE-COMMIT points

original target remains byte-for-byte unchanged

original fingerprint unchanged

temporary artifacts cleaned on handled/in-process failure

explicit outcome returned

A test that merely observes successful rename is not recovery evidence.

Abrupt process/OS crash can leave a same-directory temporary file if the crash
occurs before cleanup.

Phase 3 does NOT hide this fact.

LOCKED rule:

no intentional durable backup/index/undo database

transient temporary files are permitted only inside the bounded write
mechanism

handled failure/normal completion must leave no temporary artifact

crash-orphan possibility is a known limitation unless an unnamed-temp or
stronger platform primitive is later proven

Phase 3 does not auto-delete arbitrary historical temp files on startup

This is NO DURABLE PATH CODE STATE, not an impossible claim that a process
crash can never leave an OS-visible orphan.

Creation is a distinct operation.

It is NOT an edit with a missing before hash.

Required precondition:

parent RepositoryEntry is admitted/current

parent boundary/denial revalidated

leaf valid

leaf provably absent during preparation

leaf rechecked absent immediately before publication

exact proposed bytes authorized

Publication must be NO-OVERWRITE.

Preferred design:

same-directory fully-written verified temporary candidate
→ atomic no-overwrite publication primitive

A portable implementation may use a proven mechanism such as an exclusive
hard-link publication where supported, followed by removal of the temporary
name.

If the platform/filesystem cannot provide a no-overwrite publication semantic
that 3C can prove:

REFUSE WITH UNSUPPORTED_ATOMIC_CREATE

Do NOT fall back to:

"check not exists, then normal rename that may overwrite."

Do NOT create missing directories.

DEFER.

Phase 3 does not create directories.

Creation requires an already admitted/current parent.

If parent does not exist:

REFUSE WITH PARENT_NOT_ADMITTED / equivalent explicit outcome.

DEFER OUT OF PHASE 3.

Phase 3 modifies existing regular files and creates new regular files only.

It does not delete files.

Deletion requires a separate future architecture because its recovery and
authorization semantics are materially different.

Remove deletion from the Phase 3 implementation roadmap.

DECISION:

PER-FILE ATOMICITY ONLY.

No false all-or-nothing transaction claim.

Before the FIRST mutation in a multi-file operation:

validate operation bounds

verify every target/precondition

verify every authorization

verify disable-action state

verify deny/boundary state

verify no unmerged Git state where applicable

ensure every proposed after-state payload is available

This is FULL PREFLIGHT.

Only after full preflight succeeds may writes begin.

Application order:

the exact caller-approved ordered list is frozen into the multi-edit request.

Do not silently reorder.

If a mutation fails after earlier files committed:

STOP further application

return PARTIAL_APPLICATION

list exactly which files changed

list exactly which files did not

include per-file before/after fingerprints

include failure point

never claim rollback/all-or-nothing

A future transaction architecture may add stronger semantics.

Hard ceilings:

MAX_EDIT_FILE_BYTES

1_048_576 bytes
(1 MiB)

Must equal the frozen Phase 2B constant MAX_REPOSITORY_CONTENT_BYTES
(src/reader/constants.ts).

Reason:

Phase 2B cannot fully observe/hash content above this ceiling, therefore Phase
3 cannot truthfully earn a full currentness precondition above it.

MAX_FILES_PER_EDIT_OPERATION

16

MAX_TOTAL_PROPOSED_AFTER_BYTES

8_388_608 bytes
(8 MiB)

Caller may narrow.

Caller may not widen.

Bounds are checked before first persistent mutation.

An over-bound operation refuses before mutation.

Creation and modification share the per-file after-state ceiling.

Phase 3 does NOT mutate Git.

No:

add
commit
checkout
reset
stash
clean
merge
rebase
index write

Git baseline may be READ as context.

LOCKED behavior:

A. UNMERGED TARGET

REFUSE.

A file represented as unmerged/conflicted is not an ordinary safe-edit target
in Phase 3.

B. PRE_EXISTING MODIFIED / STAGED / UNSTAGED TARGET

MAY BE EDITED if:

full currentness verification passes

explicit exact authorization exists

the EditRecord records the pre-existing Git state

Do NOT refuse merely because a user has existing changes.

Reason:

explicit authorization bound to the exact current bytes preserves the user's
current work as the before-state.

C. GIT BASELINE CURRENTNESS

Git baseline is point-in-time context.

Phase 3 does not claim it is current without recollection.

It may record the frozen GitBaselineFreshnessState literal:

POINT_IN_TIME

(versus RECOLLECT_REQUIRED_FOR_CURRENTNESS)

rather than treating an old baseline as fresh authority.

PRE_EXISTING is historical provenance from before Path Code mutation.

PATH_CODE_MODIFIED is earned only after a successful Phase 3 mutation reaches
the required terminal evidence state.

Do NOT mutate the historical Phase 2 GitStateBaseline object to manufacture
new provenance.

Instead:

EditRecord contains the earned PATH_CODE_MODIFIED provenance event.

Caller cannot set it.

A failed pre-commit mutation does not earn PATH_CODE_MODIFIED.

A committed but after-state-unverified failure must have a distinct explicit
outcome; do not falsely label it clean success.

Every terminal mutation attempt returns an earned EditRecord.

At minimum:

target RepositoryEntry / creation target identity

action class

authorization identity

before SHA-256 where existing

after SHA-256 if observed

expected after SHA-256

before/after byte lengths

outcome

commit point reached: YES/NO

provenance result

pre-existing Git context if supplied

knowledge invalidation result

relevant limitations/warnings

mutation timestamp/sequence evidence

EditRecord is:

opaque

produced only by the editing engine

not caller-fabricable under normal typed construction

not persisted by Phase 3

A successful write syscall is not proof.

After publication:

re-read final target through the trusted bounded reader.

Require:

actual final SHA-256

authorized expected-after SHA-256

and:

actual final byte length

authorized expected-after byte length.

Only then may outcome become:

SUCCESS

If not:

explicit failure.

Do not automatically repair/retry.

Phase 3 does not implement:

formatter

linter

pretty-printer

import sorter

AST rewrite

newline normalization

encoding conversion

whitespace cleanup

"while we're here" modification

The engine writes the EXACT bytes authorized in PreparedMutation.

Therefore the strongest mechanism-level version of:

NO UNREQUESTED CHANGE

is:

actual after bytes

authorized after bytes

not:

the editor guessed which semantic regions were intended.

The upper layer that prepared the bytes is responsible for proposing them.

The authorization step approves the exact result.

A successful mutation does NOT mutate an old ContentObservation into a
different object/state.

The Phase 2 evidence remains immutable historical evidence of bytes previously
observed.

Instead the edit earns explicit invalidation evidence stating that dependent
knowledge is no longer current.

Conceptually:

old ContentObservation
→ remains immutable historical observation

EditRecord / KnowledgeInvalidation
→ states the target changed after that observation

Therefore dependent:

ManifestEvidence
ProjectIdentityClaim
RepositoryMap
RepositorySearchCorpus
RepositorySearchResult

must no longer be treated as current where they depend on changed content.

Phase 3 does NOT rebuild them.

Mutation invalidates knowledge.

It does not repair knowledge.

A caller may deliberately invoke Phase 2 observation/rebuild later.

Phase 3 mechanism contains no model/provider execution.

No repository content is sent to a model from the editing engine.

A future planning layer may prepare proposed bytes.

That planning layer remains outside the mutation authority mechanism.

Recommendation
≠
authorization.

Do NOT force all write code into a single source file merely to satisfy an
architecture test.

LOCKED architecture:

exactly one bounded production SUBSYSTEM may own persistent project-write
primitives:

src/editing/**

Within that subsystem, keep the write primitive surface narrow, preferably one
platform/atomic-write adapter.

No production module outside the authorized editing subsystem may import/use
project filesystem mutation primitives.

Existing Phase 2 architecture evidence must not be weakened.

If a Phase 2 audit test scans only Phase 2 modules:

leave it unchanged.

If a global architecture test intentionally scans all production modules and
would now fail because Phase 3 legitimately adds writes:

do NOT merely exclude "whatever fails."

Update it with the exact frozen authorized editing boundary and add Phase 3
architecture evidence that fails if write primitives appear anywhere else.

Phase 3 does not introduce:

generic process execution

shell

PTY

package installation

network write

deployment

Git mutation

database persistence

If a platform-specific atomic primitive cannot be implemented safely using the
approved runtime APIs:

REFUSE / REPORT UNSUPPORTED

rather than quietly introducing shell/process execution.

Temporary candidate names:

generated internally

same directory as target

exclusive creation

recognizable reserved prefix

not caller-chosen

never admitted as RepositoryEntry merely because they exist

removed on normal completion

removed on handled pre-commit failure

Do not scan/delete arbitrary reserved-prefix files on startup in Phase 3.

Crash orphan cleanup is not silently invented.

Every obligation must eventually have current falsifiable repository evidence.

SE-001 — NO UNVERIFIED MUTATION

No existing file is modified unless a full commit-time 2B read proves the
exact expected-before SHA-256.

SE-002 — AUTHORIZATION BINDS EXACT BYTES

Authorization names the exact target/action/before-state/after-state and exact
proposed byte result.

SE-003 — NO UNAUTHORIZED MUTATION

No mutation occurs without an earned EditAuthorization for that exact
PreparedMutation.

SE-004 — NO AUTONOMOUS AUTHORITY

Model response, recommendation, initiative, plan, tool result, config, map,
search result, or caller plain object cannot manufacture EditAuthorization.

SE-005 — AUTHORIZATION IS SINGLE-USE

An authorization cannot be replayed for a second mutation.

SE-006 — DENIED PATHS ARE NEVER MUTATED

deny-path is rechecked at mutation time and causes explicit refusal.

SE-007 — NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION

No mutation intentionally escapes WorkspaceBoundary or targets a symlink
object/non-regular unsupported target.

SE-008 — EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED

Supported same-directory replacement is published through the chosen proven
atomic primitive; readers never observe a partial candidate through the target
path.

SE-009 — PRE-COMMIT RECOVERY

Induced failures before the commit point leave original bytes/fingerprint
unchanged and handled temporary artifacts cleaned.

SE-010 — AFTER-STATE IS VERIFIED

SUCCESS requires a trusted re-read with actual hash/length equal to authorized
after state.

SE-011 — PROVENANCE IS EARNED

PATH_CODE_MODIFIED is emitted only through terminal editing evidence and is
not caller-settable.

SE-012 — EXACT AUTHORIZED BYTES ONLY

Engine performs no formatting/normalization; actual success bytes equal exact
authorized proposed bytes.

SE-013 — BOUNDS HOLD

Hard ceilings are constants, caller non-widenable, and rejected before first
mutation.

SE-014 — NO DURABLE HIDDEN PATH CODE STATE

No backup database, undo journal, index, cache, or authorization persistence.
Transient bounded temp files are internal artifacts with honest crash-orphan
limitations.

SE-015 — KNOWLEDGE INVALIDATED, NOT REPAIRED

Mutation earns invalidation evidence; Phase 2 derived knowledge is not
silently rebuilt or mutated.

SE-016 — WRITE BOUNDARY HOLDS

Only the frozen editing subsystem owns project-write primitives; all other
production modules remain read-only.

SE-017 — CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED

Any observed pre-commit identity/content change causes refusal; no stale known
state is intentionally overwritten.

SE-018 — GIT SAFETY

No Git mutation. UNMERGED target refused. Pre-existing modified state may be
edited only with exact currentness + authorization and is recorded.

SE-019 — SAFE CREATION

Creation requires current admitted parent, validated leaf, exact authorized
bytes, and proven no-overwrite publication. Unsafe platform fallback is
forbidden.

SE-020 — MULTI-FILE PARTIAL HONESTY

Full preflight occurs before first mutation. Each file remains individually
atomic. Partial application is explicit and exact; no false transaction claim.

PHASE 3 MASTER CONTRACT
↓ FREEZE

POST-PHASE-2 SELF-OBSERVATION FOUNDATION GATE
Capability Ledger v1
Gap Ledger v1
ledger
Engineering Self-Observation runtime foundation
↓ FREEZE

3A — EDIT CONTRACTS / PREPARATION / AUTHORIZATION
NO WRITES.

Implement:

PreparedMutation / PreparedCreation

EditAuthorization

single-use authorization semantics

exact-before/exact-after binding

mutation action classes

narrow disable-action mapping

hard bounds constants

EditRecord contracts

KnowledgeInvalidation contracts

compile-time/falsification evidence

No project mutation.

↓ VERIFY / FREEZE

3B — EXISTING-FILE ATOMIC REPLACEMENT

Implement:

commit-time re-read/currentness

deny/boundary/type checks

hard-link refusal

same-directory temp candidate

candidate verification

basic metadata preservation/refusal

atomic replacement

after-state verification

pre-commit recovery falsifications

concurrency/race honesty

write-boundary architecture tests

↓ VERIFY / ADVERSARIAL / FAILURE / FREEZE

3C — SAFE CREATION

Implement:

current admitted parent

leaf validation

bounded exact bytes

no-overwrite publication

unsupported-platform refusal

no directory creation

after-state verification

↓ VERIFY / ADVERSARIAL / FAILURE / FREEZE

3D — MULTI-FILE COORDINATION + PROVENANCE + INVALIDATION

Implement:

full preflight

exact approved order

per-file atomicity

stop-on-failure

explicit partial application

Git context behavior

earned provenance

immutable-knowledge invalidation

no automatic rebuild

↓ VERIFY / ADVERSARIAL / FAILURE / FREEZE

3E — SAFE EDITING INTEGRATION AUDIT

Independent audit against this Master Contract.

NO production fixes inside audit.

Audit:

SE-001 through SE-020
cross-component composition
write-boundary architecture
recovery falsification
Git non-mutation
no-model boundary
no hidden persistence
all Gap Ledger findings

If blocker:

NOT COMPLETE
→ smallest H-pass
→ full re-audit

↓ FREEZE

PHASE 3 CLOSURE

Separate document-only closure.

Not in Phase 3:

deletion

directory creation

rename/move as a user operation

symlink creation/modification/deletion

formatter

AST transform engine

process execution

test execution orchestration

package install

Git mutation

rollback transaction engine

persistent undo

persistent snapshot/cache

model planning/orchestration

general policy engine

autonomous mutation authority

Phase 3 will almost certainly discover mutation-specific limitations.

Examples already known from the architecture:

hostile concurrent filesystem race beyond portable Node guarantees

platform-specific rename/no-overwrite semantics

crash orphan temporary candidate possibility

extended attribute/ACL preservation not universally proven

network/VFS semantics

live Windows atomicity validation

Do not pre-classify all of these as harmless.

Implementer reports evidence and PROPOSED_CLASS only.

Review assigns classification.

BLOCKING_INVARIANT uses the frozen two-trigger rule:

A. frozen invariant violated

OR

B. downstream false assumption would be inherited

Phase 3 may be declared COMPLETE only if:

Phase 2 Closure remains ancestor

this Master Contract predates implementation and remains unchanged except
through explicit preserved amendments

post-Phase-2 Self-Observation foundation gate is satisfied

3A–3D implemented/frozen

3E independently audits against this Master Contract

SE-001 through SE-020 all SATISFIED

recovery is proven by induced failure

no unverified mutation is representable through public normal construction

no unauthorized mutation is representable through public normal
construction

exact authorization binding is proven

write primitives exist only inside authorized editing subsystem

no Git mutation

no model/provider execution

no hidden durable Path Code state

all known gaps individually reviewed

no blocking gap remains

separate Phase 3 Closure record exists

This document is frozen in a DOCUMENT-ONLY pass after Phase 2 Closure.

Required file:

docs/PHASE_3_SAFE_EDITING_MASTER.md

Before freeze:

replace ac87286760bc9e0ce65427d98c7b4250ea1dc86f with actual closure SHA

verify closure SHA is ancestor of HEAD

verify working tree clean

verify Phase 3 src implementation absent

verify post-Phase-2 Self-Observation runtime implementation has NOT been
falsely claimed as complete if it is still pending

run npm run check

record actual runtime total

The Master Contract freeze may update README minimally to state:

Phase 3 Safe Editing Master Contract:
FROZEN

Phase 3 implementation:
NOT STARTED

Self-Observation foundation gate:
PENDING / COMPLETE according to actual repository state

Do not claim editing capability exists.

Commit exactly:

Freeze Path Code Phase 3 Safe Editing master contract

Do NOT push.

Return:

PATH CODE — PHASE 3 SAFE EDITING MASTER CONTRACT FREEZE REPORT

Result:
PASS / FAIL

Phase 2 Closure baseline:

Final Phase 3 Master Contract HEAD:

Master Contract:

path:

status:

Phase 2 closure SHA bound:

decisions locked:

proof obligations:

sub-roadmap:

deletion:

directory creation:

multi-file semantics:

disable-action:

Git modified-file behavior:

Git unmerged behavior:

concurrent-race limitation explicit:

temp crash-orphan limitation explicit:

exact authorization binding:

single-use authorization:

immutable Phase 2 evidence preserved:

Validation:

runtime total:

typecheck:

tests:

build:

full check:

Architecture:

Phase 3 implementation present:

editing capability claimed:

Self-Observation foundation gate status:

Git:

working tree:

commit message:

push: NO

Not Validated:
[MUST BE NON-EMPTY]

Unresolved issues:

Next permitted runtime operation:

POST-PHASE-2 SELF-OBSERVATION FOUNDATION
if still pending.

Only after that foundation is frozen:

Phase 3A — Edit Contracts / Preparation / Authorization

DO NOT START 3A EARLY.

The biggest Phase 3 risk is scope drift under usefulness pressure.

An editing engine invites:

"while we're editing, format it"
"run tests"
"fix imports"
"stage it"
"commit it"
"clean this file too"
"delete the obsolete directory"

Those are different capabilities.

Phase 3 changes or creates only the exact bytes explicitly authorized through
the bounded editing mechanism.

Nothing else.
