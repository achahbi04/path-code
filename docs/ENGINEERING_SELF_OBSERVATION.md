# PATH CODE — ENGINEERING SELF-OBSERVATION

## Status

**ARCHITECTURE FROZEN**

Runtime implementation:

**NOT YET IMPLEMENTED**

Capability Ledger implementation:

**DEFERRED UNTIL PHASE 2 CLOSURE**

Gap Ledger:

**V0 ACTIVE — DOCUMENT ONLY**

---

## 1. DEFINITION

Engineering Self-Observation is **NOT**:

- consciousness
- model introspection
- model confidence
- self-certification
- a model describing what it thinks it can do

Engineering Self-Observation **is**:

**CONSTRUCTION PROVENANCE**
+
**CAPABILITY EVIDENCE**
+
**GAP EVIDENCE**
+
**MECHANICALLY DERIVED ENGINEERING STATE**

Its purpose is to allow Path Code to know:

- what capability was declared
- what implementation exists
- what was tested
- what was adversarially tested
- what was frozen
- what was independently phase-verified
- what remains unavailable
- what remains uncertain
- what remains deliberately deferred

without allowing the model or the implementation itself to certify those claims.

---

## 2. CENTRAL RULE

**PATH CODE MAY OBSERVE WHAT EVIDENCE PROVES ABOUT IT.**

**PATH CODE MAY NOT CERTIFY ITSELF.**

Never:

```
implementation exists
→ model believes it works
→ VERIFIED
```

Instead:

```
DECLARED
↓
IMPLEMENTED
↓
TESTED
↓
ADVERSARIAL EVIDENCE
↓
ARCHITECTURE AUDIT
↓
PASS FREEZE
↓
INDEPENDENT PHASE AUDIT
↓
PHASE VERIFICATION
```

Only downstream evidence may change the derived capability state.

---

## 3. CAPABILITY STATE SEPARATION

Lock:

**DECLARED**
≠
**IMPLEMENTED**
≠
**PASS_FROZEN**
≠
**PHASE_VERIFIED**

### Definitions

**DECLARED**

Capability exists in a frozen roadmap/contract.

No implementation claim follows.

**IMPLEMENTED**

Required production mechanism exists.

This alone does **NOT** mean verified.

**PASS_FROZEN**

The bounded implementation pass:

- completed
- passed its required evidence
- has an immutable freeze checkpoint
- has repository-recorded freeze evidence under the reporting policy

This is a **SUB-PASS** state.

**PASS_FROZEN** does **NOT** imply the containing phase is complete.

**PHASE_VERIFIED**

The containing major phase passed its independent integration audit and formal closure.

Example:

Phase 2B may be **PASS_FROZEN**.

Repository Intelligence as a whole is **NOT** **PHASE_VERIFIED** until 2G and Phase 2 closure succeed.

This distinction is mandatory.

Phase 1 proved why: multiple frozen sub-passes did not automatically prove all roadmap obligations were satisfied.

---

## 4. STATUS IS DERIVED — NEVER STORED AS AUTHORITY

Future `CapabilityRecord` must **NOT** contain an authoritative writable field such as:

```
status: "VERIFIED"
```

whose truth depends on whoever edited the file.

A human, model, Cursor, or future Path Code implementation writing **VERIFIED** must have **no authority effect**.

Capability status must be **COMPUTED** from admissible evidence.

The ledger stores evidence references and declarations.

The verifier derives state.

---

## 5. EVIDENCE ADMISSIBILITY

Future Capability Ledger accepts only evidence in these classes.

### A. MECHANICALLY_VERIFIABLE

Examples:

- Git commit SHA exists
- commit is ancestor of current HEAD
- expected module exists in repository tree
- expected test exists
- current test collection can be enumerated
- architecture check exists
- required repository document exists

### B. REPOSITORY_RECORDED

Examples:

- frozen architecture contract committed to repository
- freeze report committed to repository
- phase integration audit record committed to repository
- phase closure record committed to repository

### C. ASSERTED

Examples:

- chat transcript
- model statement
- Cursor prose not committed to repository
- human recollection
- "we tested this earlier"
- undocumented confidence

**ASSERTED** evidence is **NOT** admissible for mechanically derived capability status.

It may guide investigation.

It cannot establish **PASS_FROZEN** or **PHASE_VERIFIED**.

---

## 6. REPORTING POLICY FROM PHASE 2F FORWARD

Historical Phase 2A–2E reports were produced before this architecture was frozen and primarily lived outside the repository.

**DO NOT** retroactively pretend those chat reports existed at their historical freeze commits.

Do not rewrite Git history.

Instead:

- preserve all historical freeze commits
- Phase 2G independently re-verifies the complete phase
- Phase 2 Closure becomes the admissible phase-level record

**FROM PHASE 2F FORWARD:**

every freeze pass must create a repository report document as part of its freeze evidence.

Prefer:

```
docs/reports/<PASS_NAME>_REPORT.md
```

The report should be generated from actual evidence **BEFORE** the freeze commit and included in that freeze commit where practical.

If a separate report-only commit is objectively necessary:

- it must directly name the immutable freeze SHA
- it must contain no implementation
- the relationship must remain mechanically verifiable

No history rewriting.

---

## 7. FUTURE CAPABILITY RECORD

Conceptually:

```
CapabilityRecord {
    capabilityId
    declarationEvidence
    implementationEvidence
    freezeEvidence
    phaseAuditEvidence
    proofObligations
    dependencies
    knownLimitations
}
```

There is intentionally **no** authoritative mutable:

```
status
```

field.

Status is derived.

---

## 8. FUTURE STATUS DERIVATION

Conceptually:

**DECLARED**
⇐ frozen roadmap/contract names capability
   AND no stronger admissible evidence exists

**IMPLEMENTED**
⇐ implementation artifacts exist
   AND required implementation evidence can be resolved
   AND no freeze evidence exists yet

**PASS_FROZEN**
⇐ implementation freeze commit exists
   AND freeze commit is ancestor of HEAD
   AND required repository-recorded freeze evidence exists
   AND evidence references resolve

**PHASE_VERIFIED**
⇐ containing phase has a committed independent audit record
   AND audit record names the frozen implementation evidence
   AND audit conclusion is COMPLETE
   AND phase closure record exists
   AND all required references resolve

A missing or invalid citation must **LOWER** the derived state or fail verification.

Never assume the stronger state.

---

## 9. FUTURE LEDGER VERIFIER

After Phase 2 closure implement:

```
ledger:verify
```

and wire it into:

```
npm run check
```

The verifier must:

- resolve every evidence reference
- verify commit ancestry
- verify expected repository artifacts
- validate required report/audit records
- re-derive capability state
- reject unresolved citations
- reject impossible state progression

A ledger claim that cannot fail is not evidence.

Required future falsification:

1. begin with valid ledger
2. corrupt one evidence citation
3. run `ledger:verify`
4. verifier **MUST** fail
5. restore exact source
6. verifier passes again

---

## 10. BOOTSTRAP / NON-CIRCULARITY

The Capability Ledger **MUST** contain:

**NO** capability record for itself.

Otherwise:

```
ledger says ledger is VERIFIED
because ledger says ledger is VERIFIED
```

which is circular.

The Capability Ledger's correctness rests on:

- ledger verifier
- verifier tests
- external repository evidence

not on a self-record.

---

## 11. ROADMAP IS NOT CAPABILITY

A capability named in the roadmap is:

**DECLARED**.

Example:

Phase 3 Safe Editing Engine

Until actual implementation and evidence exist, Path Code must report:

```
EDITING:
DECLARED
NOT IMPLEMENTED
```

It must **NOT** report:

"I can edit."

Roadmap declaration is planning evidence.

It is not capability evidence.

---

## 12. IMPLEMENTER DOES NOT CLASSIFY ITS OWN GAPS

An implementer:

- Cursor
- future Path Code
- another coding agent

may:

- report a gap
- provide evidence
- propose a classification

It may **NOT** authoritatively decide the gap class.

Gap classification occurs at **REVIEW**.

An implementer-proposed classification is stored only as:

**PROPOSED_CLASS**

or equivalent recommendation.

This prevents the system that produced a shortfall from deciding that its own shortfall is harmless.

---

## 13. GAP CLASSES

### A. BLOCKING_INVARIANT

Meaning:

- a frozen invariant was violated

**OR**

- downstream work would inherit a false assumption

Either trigger is sufficient.

Behavior:

STOP progression.
Perform smallest corrective pass.
Verify.
Preserve evidence chain.
Continue only when corrected.

### B. SCHEDULED_DEFERRED

Meaning:

the missing mechanism/proof is explicitly assigned to a future frozen pass.

Behavior:

record.
carry.
do not solve prematurely.

### C. NON_BLOCKING_LIMITATION

Meaning:

current bounded claim remains valid, but some coverage/environment/property is not established.

Every **NON_BLOCKING_LIMITATION** **MUST** state:

- why it is non-blocking
- what evidence is missing
- exact condition required to close it

It may survive phase closure only if individually enumerated and accepted.

### D. OPTIMIZATION

Meaning:

correctness and architecture remain valid.

Only:

- performance
- ergonomics
- efficiency
- resource tuning

remain.

Does not block foundational progression unless measurements later show it violates a frozen requirement.

---

## 14. GAP LIFECYCLE STATES

Gap status must distinguish at least:

**OPEN**

**CLOSED**

**OPEN_REQUIRES_EXTERNAL_CONDITION**

**ACCEPTED_PERMANENT**

### OPEN_REQUIRES_EXTERNAL_CONDITION

Examples:

- live Windows validation requires Windows host
- network filesystem semantics require appropriate environment
- product/authority decision requires explicit decision

It must state the required condition.

### ACCEPTED_PERMANENT

Meaning:

the condition is an intentional property/limitation of the system and is not expected to be "fixed."

Example:

TypeScript is not a security sandbox and an intentionally hostile `as unknown as` cast cannot be prevented by type branding.

Permanent acceptance must be explicit.

It must not masquerade as forgotten debt.

---

## 15. CORRECTIVE-PASS POLICY

Correct immediately:

**A.** ANY violation of a frozen invariant

**OR**

**B.** anything that would cause downstream work to inherit a false assumption

Everything else is explicitly carried.

Therefore:

| Class | Action |
|---|---|
| BLOCKING_INVARIANT | immediate smallest corrective pass |
| SCHEDULED_DEFERRED | assigned future pass |
| NON_BLOCKING_LIMITATION | Gap Ledger + review at integration audit |
| OPTIMIZATION | optimization backlog / Gap Ledger |

Do not create a micro-pass merely because an imperfection exists.

Do create one when foundational truth would otherwise be false.

---

## 16. UNCERTAINTY CONDUCT

Uncertainty removes authority from the **UNCERTAIN** claim or action.

It does not automatically remove authority from independent proven branches.

Required behavior:

```
problem
↓
decompose

known/proven branch
→ may proceed inside proven boundary

uncertain branch
→ stop that branch
→ investigate/decompose

still unknown
→ escalate/report

unnecessary branch
→ remove
```

No guessing.

No false certainty.

No unnecessary total paralysis.

The known/unknown boundary must remain explicit.

---

## 17. ENGINEERING SELF-OBSERVATION IS READ-ONLY

The future self-model may observe:

- capability evidence
- gap evidence
- derived state
- proof obligations
- limitations

It does **NOT** receive authority to:

- modify its verifier
- reclassify itself
- mark itself VERIFIED
- alter its evidence
- widen its permissions
- close its own gaps

Observation is not authority.

---

## 18. PHASE 2F BOUNDARY

Engineering Self-Observation **implementation** does **NOT** enter Phase 2F.

Phase 2F remains:

**FRESHNESS**
+
**IN-MEMORY SNAPSHOT INTEGRITY**

However 2F should cite this architecture because its freshness semantics will later be reusable by the self-model.

---

## 19. FIXED 2F DERIVED-KNOWLEDGE PROPAGATION

Do **NOT** build a generic reactive dependency graph in Phase 2F.

Phase 2F dependency propagation is a fixed, known, acyclic chain:

```
ContentObservation
↓
ManifestEvidence
↓
ProjectIdentityClaim
↓
RepositoryMap
↓
RepositorySearchCorpus
↓
RepositorySearchResult
```

Only these already-existing relationships are in scope.

No general dependency-graph framework.

No arbitrary subscriber system.

No reactive runtime.

---

## 20. REVALIDATION_REQUIRED IS NOT CURRENT

Phase 2F must lock:

**REVALIDATION_REQUIRED**
≠
**VERIFIED_CURRENT**

Metadata equality cannot establish current content.

If content verification requires a hash and the hash has not been performed:

state remains:

**REVALIDATION_REQUIRED**

Any derived claim depending on such evidence inherits:

**UNVERIFIED**

or equivalent non-current state.

No consumer may interpret:

**REVALIDATION_REQUIRED**

as:

- probably fresh
- safe enough
- verified current

RI-008 must hold in behavior, not merely in a type name.

---

## 21. SEQUENCE

Current sequence:

```
Phase 2E
PASS_FROZEN

↓

THIS ARCHITECTURE FREEZE
Engineering Self-Observation
+
Gap Ledger v0

↓

Phase 2F
Freshness + In-Memory Snapshot Integrity

↓

Phase 2G
Independent Repository Intelligence Integration Audit

↓

if blockers:
smallest 2G-H closing passes
↓
re-audit

↓

Phase 2 Closure

↓

Capability / Construction Ledger v1
Gap Ledger v1
ledger:verify
Engineering Self-Observation runtime foundation

↓

Phase 3
Safe Editing Engine
```

Build first.
Prove second.
Audit third.
Freeze fourth.
Self-observe fifth.
