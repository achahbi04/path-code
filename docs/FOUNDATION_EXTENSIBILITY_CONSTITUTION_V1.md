# PATH CODE — FOUNDATION EXTENSIBILITY CONSTITUTION V1

**Status:** FROZEN  
**Frozen baseline:** `dcb347fc613114be810b8caf371f0bea8b261285` (Phase 3C-H1 COMPLETE)  
**Purpose:** preserve foundational correctness while accelerating delivery

---

## 0. Governing balance

Path Code optimizes for:

> **maximum velocity inside proven boundaries**

This constitution is a high-performance brake on a sports car. It exists so Path Code can take difficult corners at speed without leaving the track. It is not a new implementation phase, a standing audit program, or permission to polish foundations indefinitely.

The normal path is:

```text
new capability
→ check only the foundational concepts it actually consumes
→ foundation maps cleanly
→ BUILD IMMEDIATELY
```

Only a real mismatch creates amendment or corrective work.

### Default development rhythm

```text
ARCHITECT
   ↓
BUILD
   ↓
BREAK IT
   ↓
FIX ONLY REAL FINDINGS
   ↓
FREEZE
   ↓
MOVE
```

Not:

```text
ARCHITECT
↓
ARCHITECT THE ARCHITECTURE
↓
AUDIT THE ARCHITECTURE
↓
ARCHITECT THE AUDIT
↓
...
```

A corrective pass is justified only when at least one is true:

1. a frozen invariant is false;
2. the next capability would inherit a false assumption;
3. evidence is insufficient for a claim the next step must rely on.

Everything else waits. “Could be cleaner” is not a reason for another pass.

### Primary origin of a corrective pass

The corrective report records one primary origin:

| Origin | Meaning |
|---|---|
| `CONTRACT` | the pass contract required something wrong, unsatisfiable, or ambiguous |
| `IMPLEMENTATION` | the contract was right; the code did not honor it |
| `EVIDENCE` | the code was right; the proof was missing or vacuous |
| `FOUNDATION` | a frozen vocabulary or mechanism could not express what the pass needed |

Contributing causes may be named in prose when useful. Do not create a larger taxonomy or a new Gap Ledger schema solely for this constitution.

---

## 1. What “foundation complete” means

Path Code does not define completeness as every future action, state, platform behavior, capability, and failure mode already enumerated. That is speculative coupling.

For the capability currently being designed, every foundational assumption it consumes is classified as exactly one of:

### COMPLETE

The existing invariant, mechanism, or vocabulary represents the new concept truthfully.

**Action:** proceed.

### EXTENSIBLE

The existing foundation remains correct for current capabilities, but the new capability introduces a genuinely new concept it cannot yet express.

**Action:** freeze the smallest additive amendment before dependent implementation.

### GAP

The current foundation permits a bypass, contradiction, false claim, or unsafe fallback.

**Action:** stop progression, record/classify the gap, correct the smallest surface, re-verify, then resume.

A vocabulary is not defective merely because it did not predict the future.

> **The defect begins when implementation proceeds despite the missing concept.**

### No speculative vocabulary growth

Do not add variants solely because they can be imagined.

```text
future roadmap exists
≠
pre-enumerate every conceivable action/state
```

Required:

```text
capability arrives
→ compatibility preflight
→ MAPS_TO_EXISTING
   or AMENDMENT_REQUIRED
   or BLOCKING_GAP
```

Constitution → invariants → mechanisms → capabilities → optimization remains the governing order.

---

## 2. Mandatory Foundation Compatibility Preflight

Every future **major Master Contract** must contain a section named exactly:

```text
FOUNDATION COMPATIBILITY PREFLIGHT
```

Its absence is a Master Contract defect.

The preflight is part of writing the Master Contract. It is not a separate implementation pass.

For each genuinely new concept, list only the foundational vocabularies or mechanisms that concept actually consumes.

| New concept | Consumed foundation vocabulary/mechanism | Existing representation | Result | Amendment/evidence |
|---|---|---|---|---|

Allowed results:

- `MAPS_TO_EXISTING`
- `AMENDMENT_REQUIRED`
- `BLOCKING_GAP`

`NOT_APPLICABLE` may be used only when explicitly ruling out a seemingly relevant inherited mechanism is itself load-bearing. Otherwise omit inapplicable rows.

### Fast path and time-box

The normal preflight should take approximately **5–15 minutes**. The table itself should not expand beyond roughly **30 minutes** merely to search for theoretical edge cases. This is an operational target, not a correctness deadline.

If one row needs deeper inspection:

```text
finish the clean rows
→ isolate the one uncertain row
→ inspect only it and its direct consumers
```

Do not turn one uncertain row into a whole-foundation audit.

### Decision rule

- every listed row `MAPS_TO_EXISTING` or carries a justified `NOT_APPLICABLE` → implementation begins immediately;
- any `AMENDMENT_REQUIRED` → smallest amendment first;
- any `BLOCKING_GAP` → implementation blocked.

### No delegation

A Master Contract must not delegate an unresolved compatibility decision to implementation when the design-time evidence already exists.

A question may be deferred only when its answer genuinely depends on something implementation must discover.

### Sub-pass rule

A sub-pass that introduces no new foundation-consuming concept does not repeat the full table. It records:

> `FOUNDATION COMPATIBILITY PREFLIGHT inherited; no new foundational concept introduced.`

---

## 3. Reminder domains — not a checklist

Consider only the domains the capability actually touches.

**Authority** — action classes, mutation actions, workspace boundary, deny-path, explicit authorization, single-use authority, action restrictions.

**Knowledge** — discovery/admission/read/understanding, RepositoryEntry, ContentObservation, freshness, authored-but-not-reobserved evidence, invalidation, inventory/topology currency.

**Evidence and self-observation** — DECLARED / IMPLEMENTED / PASS_FROZEN / PHASE_VERIFIED, admissible evidence, negative/superseding evidence, freeze forms, production scopes, audit/closure evidence.

**Provenance** — PRE_EXISTING, PATH_CODE_MODIFIED, and finer creation/modification distinctions only when required.

**Failure and recovery** — refusal, pre-commit failure, committed failure, partial application, unsupported platform, unverified outcome.

**Platform and filesystem** — path/identity semantics, atomicity, durability, metadata preservation, supported platforms.

**Configuration** — ProjectConfig / ResolvedProjectConfig, ConfigFailure vs successful ABSENT, restriction vocabulary, amendment compatibility.

This list is a memory aid, not a form.

---

## 4. Proportional mechanical evidence

Use mechanical proof only where compatibility is load-bearing.

Examples:

- exhaustive union consumers still compile;
- unknown values remain fail-closed;
- no existing variant changes meaning;
- a new authority mapping exists exactly where required;
- one targeted falsification proves the amendment matters;
- an architecture test catches the relevant bypass.

Do not create a new proof suite for every harmless mapping.

For a small additive amendment, one targeted falsification plus the existing full regression suite is normally sufficient.

The pass report records the load-bearing compatibility proof and any exception. It does not restate every ordinary mapping as a separate test result.

Human review remains the final layer, but should not be the first or only detector.

---

## 5. Pass-writer obligations

These bind whoever drafts a pass contract—human, model, or both. They are drafting checks, not a mandatory seven-part form.

A pass contract is defective if it:

1. **requires what the frozen foundation cannot provide;**
2. **delegates a decision the writer could already resolve;**
3. **states a load-bearing “must” with no test, mechanical check, or explicit reviewed-by-inspection rationale;**
4. **requires a falsification without naming the corruption and expected failing test;**
5. **softens a frozen-contract contradiction into a limitation merely to keep moving;**
6. **omits a non-empty statement of what the pass cannot prove;**
7. **introduces requirements with no traceable source.**

Traceability may be declared once for a section. Per-sentence citation ceremony is not required.

When a corrective pass has primary origin `CONTRACT`, it states which obligation above was violated.

### Canonical lesson

The original 3C requirement said a newly-created file must be re-read through the Phase 2B reader even though:

- the new file had no RepositoryEntry;
- Phase 2B required RepositoryEntry;
- re-inventory was forbidden.

That was an unsatisfiable contract requirement. A preflight should expose such a contradiction before implementation.

---

## 6. Proportional amendment protocol

Frozen historical contracts remain immutable.

A foundation change is recorded through a new amendment document.

### Always required

1. immutable source being amended;
2. exact new concept or correction;
3. affected direct consumers;
4. proof/falsification that makes the amendment load-bearing.

### Required only when applicable

Add the following when old semantics change, a concept is removed, data migrates, or more than one frozen phase is affected:

- why the old form is insufficient;
- preserved historical meanings;
- rejected alternatives;
- migration rules;
- new proof obligations;
- downstream contracts that must read the amendment.

### Small-amendment fast path

For one additive concept with no changed historical meaning:

```text
one short amendment document
+ direct-consumer updates
+ one targeted falsification
+ existing regression suite
```

No separate amendment audit is created unless the amendment crosses phases, changes old semantics, or exposes a blocking mismatch.

The amendment is limited to the failed preflight row and direct consumers. “While we are here” refactoring is forbidden.

### Canonical ActionClass lesson

```text
old ActionClass vocabulary
→ correct for existing capabilities

CREATE_FILE arrives
→ no honest variant exists

correct:
EXTENSIBLE
→ additive amendment
→ old meanings preserved
→ implementation proceeds

incorrect:
map CREATE_FILE to EDIT
or
make creation non-disableable merely to avoid amendment
```

The temporary gap was not that Phase 1 failed to predict creation. The gap was that creation progressed before the compatibility decision and amendment.

---

## 7. Authored mutation evidence is not repository knowledge

This distinction is constitutional:

```text
PATH CODE AUTHORED + MUTATION-VERIFIED
≠
REPOSITORY ADMITTED
≠
CONTENT OBSERVED THROUGH REPOSITORY INTELLIGENCE
```

A mutation operation may know:

- the exact bytes it attempted to publish;
- that its commit point was reached;
- what bounded operation-specific after-state evidence it observed.

That does not automatically grant:

- RepositoryEntry;
- ContentObservation;
- inventory membership;
- map/search visibility;
- snapshot currentness;
- repository identity claims.

Re-observation is required to earn repository knowledge.

Operation-bound mutation evidence must remain structurally distinct from repository-intelligence evidence.

---

## 8. Phase 3D preflight — required rows

The Phase 3D Master Contract must include these directly consumed concepts in its normal preflight. This is not a separate KnowledgeState pass.

### A. Mixed-target action restrictions

Evaluate restrictions per target. If any target fails plan preflight, refuse the whole plan before mutation and report **every** failing target with its individual reason.

### B. Duplicate or overlapping canonical targets

Reject before mutation:

- modify X + modify X;
- create X + create X;
- modify X + create X;
- lexical aliases resolving to one physical target.

### C. Deterministic order

The approved execution order is deterministic and recorded in the multi-file result.

### D. Preflight is not a lease

Every target still runs the complete 3B or 3C mutation-time sequence when its turn executes. Currentness, configuration, deny-path, and action restrictions are re-established per target.

### E. No rollback claim

Phase 3D has not acquired durable backups, retained originals, a persistent transaction journal, or separately authorized rollback mutations. It therefore reports partial application honestly.

This does not prohibit a future deliberately architected rollback capability.

### F. Authored-but-not-reobserved knowledge compatibility

Inspect the actual current types and answer:

> Can a mixed multi-target result represent newly authored and mutation-verified files without treating them as RepositoryEntry, ContentObservation, or current repository knowledge—and without anything downstream misreading that absence?

Classify the row as:

- `MAPS_TO_EXISTING`;
- `AMENDMENT_REQUIRED`;
- or `BLOCKING_GAP`.

Additional work occurs only if it does not map cleanly.

---

## 9. Pass contracts become repository artifacts

A committed report is not a substitute for the exact instruction that governed the pass.

From the first pass after this constitution is frozen, every **commit-producing implementation, corrective, audit, or evidence pass that changes capability, evidence, or gap state** stores the exact final executed contract under:

```text
docs/passes/PHASE_<id>_CONTRACT.md
```

The contract is committed in the same implementation/evidence sequence as the report.

This does not apply to:

- one-off command verification;
- UI/navigation recovery;
- conversation-only design discussion;
- a check that creates no commit or capability/evidence change.

If a recovery materially changes the governing instruction, store the final recovery supplement beside the original contract rather than rewriting it.

No standalone archival pass or archival-only commit is created. The exact executed contract is evidence; post-hoc polishing is not.

---

## 10. One bounded baseline audit before Phase 4

After formal Phase 3 closure and before Phase 4 implementation, run one retrospective:

```text
CLOSED-VOCABULARY & FOUNDATION EXTENSIBILITY AUDIT
```

This is the single planned exception to the no-extra-pass rule.

It is:

- one bounded pass;
- primarily read-only;
- repository-recorded;
- classification-oriented;
- expected to finish in one coordinated working session unless it finds a Phase-4 blocker;
- not an automatic refactoring program.

It classifies the closed vocabularies that actually exist as:

- `SUFFICIENT_FOR_FROZEN_ROADMAP`
- `EXTENSIBLE_WITH_AMENDMENT`
- `KNOWN_LIMITATION`
- `BLOCKING_MISMATCH`

### Hard exit rule

The audit ends after classification.

It does not add speculative variants and does not repair findings inside the audit.

Only a `BLOCKING_MISMATCH` that Phase 4 is about to depend on may create an immediate corrective pass.

If there is no such blocker, Phase 4 Master Contract work begins immediately.

This audit does not recur. The Master Contract preflight maintains the baseline afterward.

---

## 11. Integration-audit responsibility

A major phase integration audit checks only:

1. Did the Master Contract contain the required preflight?
2. Were relevant new concepts represented or amended before dependent implementation?
3. Did implementation silently map a new concept onto an older, semantically different concept?

If any answer fails, the phase cannot close.

Do not repeat the Master Contract’s full table inside the integration audit.

---

## 12. Single source of truth for gaps

This constitution defines rules.

The machine-readable Gap Ledger and its deterministic rendered document record current findings, IDs, classifications, and lifecycles.

```text
Constitution   → rules
Gap Ledger     → live findings
```

This constitution adds no new Gap Ledger review-classification or lifecycle values.

A vocabulary insufficiency normally has primary origin `FOUNDATION`. A defective pass contract normally has primary origin `CONTRACT`. Record the origin in the corrective report; no schema change is required solely for this metadata.

---

## 13. Adoption and efficient freeze sequence

Freeze this constitution only after Phase 3C-H1 reaches a reviewed COMPLETE result.

Then use one coordinated documentation task with separate immutable commits:

1. verify final 3C-H1 evidence and capability states;
2. freeze this constitution in a document-only commit;
3. draft/freeze the Phase 3D Master Contract with its Foundation Compatibility Preflight;
4. implement Phase 3D immediately when every row maps cleanly;
5. create only the smallest amendment when a row says `AMENDMENT_REQUIRED`;
6. stop only when a row says `BLOCKING_GAP`.

There is no standalone KnowledgeState audit unless the 3D preflight proves one is necessary.

After formal Phase 3 closure:

7. run the one bounded audit in §10;
8. freeze its evidence;
9. begin Phase 4 Master Contract work immediately unless a Phase-4 blocking mismatch exists.

---

## 14. Foundation completeness claim

Path Code may say:

> **The foundation is complete for the current frozen roadmap under governed extensibility: every new major capability must prove compatibility with the foundational vocabularies it consumes or freeze the smallest amendment before dependent implementation.**

Path Code must not say:

> every future capability is already represented.

The first is engineering completeness.

The second is speculative omniscience.

---

## 15. What must never happen

Do not:

- speculate future variants;
- reinterpret an old variant to absorb a new semantic concept;
- proceed with unresolved `AMENDMENT_REQUIRED`;
- proceed with a `BLOCKING_GAP`;
- edit frozen historical contracts in place;
- call a documented limitation a closed gap while an invariant remains false;
- treat authored mutation evidence as repository knowledge;
- use human review as the only compatibility detector;
- write a pass contract that requires what the foundation cannot provide;
- delegate to implementation a decision the contract could already make;
- turn this constitution into a recurring implementation phase;
- open a corrective pass merely because something could be cleaner.

---

## 16. The commitment

The ActionClass mismatch was ultimately caught, but too late: the 3A STOP condition did not fire, early tests stayed green, and human review rejected the softer “documented limitation” classification only after the 3C report existed.

That catch protected the roadmap, but it happened at the least scalable layer.

This constitution moves the same decision to design time:

```text
one compatibility row
→ one explicit decision
→ zero corrective passes when the mapping is clean
```

The goal is not more governance.

The goal is fewer late corrections, faster landings, and a visible working product sooner.

> **Run fast. Land it.**

---

END — FOUNDATION EXTENSIBILITY CONSTITUTION V1
