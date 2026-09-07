# PHASE 5F-H2 — MODEL-FACING EDIT GROUNDING CORRECTION

**Result: PASS**

**Success line:**  
`PHASE 5F-H2 MODEL-FACING EDIT GROUNDING IMPLEMENTED — PROVIDER-NEUTRAL SCORE — GATE 1 UNCHANGED — FAIL-CLOSED PRESERVED`

---

## 1. Exact state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Branch | `cursor/phase5f-live-trial-cli` |
| Starting HEAD | `91fb710cd57d2ee99240c1e3e889a1b13a9916c2` |
| Main (unchanged) | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Final SHA | `af1cf1d2297ee6c79f06ee7670b464e8d735a9d5` |
| Live Trial 1 by implementer | **NOT RUN** |
| Live provider calls | **zero** |
| Credentials | **none read** |

---

## 2. Proven root cause

Live Terra reached Gate 1 successfully (post–H1 nested reasoning fix) then refused at mutation grounding:

```text
REPLACE_TEXT requires a supporting CONTENT claim
```

### What Terra actually received (pre-fix)

From `openEngineeringMutationSession` → `propose`:

| Packet element | Content |
|---|---|
| `context.references` | Catalog descriptors (handle, evidenceKind, relativePath) |
| `permitted-targets` block | `{ targetId, kind, relativePath }` (+ optional `evidenceHandle` via mutable cast when found) |
| Schema sketch in same block | Placeholder `supportingClaimIds: ["claim-id"]` — **not** a grounding rule |
| Disclosed observation blocks | Source text with **empty** `referenceHandles` |
| OpenAI edit instructions | Generic schema/emit rules — **no** claim-kind / linkage obligation |

### Missing contract (combination **D**)

| Letter | Missing? | Proof |
|---|---|---|
| **A** required claim kind | YES | No `CONTENT` / `EXISTS` requirement in model-facing packet |
| **B** exact evidence handle | PARTIAL | Handle sometimes on `description.evidenceHandle`, but not as an explicit required evidence reference with relationship rules |
| **C** supportingClaimIds linkage | YES | Only a schema placeholder string; no “claim must cite handle AND appear in supportingClaimIds” |
| Enforcement (unchanged) | — | `session.ts` still requires primary supporting claim `CONTENT` bound to selected `ContentObservation` (CREATE_TEXT → `EXISTS` on parent entry) |

This is a **model-facing grounding score deficiency**, not a reason to weaken Gate 1.

---

## 3. Provider-neutral grounding representation

Owned by the mutation session (`src/orchestrator/mutation/session.ts` + types).

New Brain context block `grounding-requirements` (`REFERENCE_MATERIAL`):

```json
{
  "title": "GROUNDING REQUIREMENTS",
  "schemaVersion": 1,
  "targets": [
    {
      "targetId": "target-…",
      "mutationKind": "REPLACE_TEXT",
      "requiredSupportingClaimKind": "CONTENT",
      "requiredEvidenceReference": "<catalog CONTENT handle>",
      "requiredRelationship": {
        "reasoningClaimsMustIncludeRequiredKind": true,
        "claimProposedSubjectMustCiteRequiredEvidenceReference": true,
        "changeSupportingClaimIdsMustIncludeThatClaimId": true
      }
    }
  ]
}
```

CREATE_TEXT equivalent uses `EXISTS` + exact admitted parent **ENTRY** catalog handle.

- Handles come only from `describeReferenceCatalog` — no new identifier system.
- Session open **fails closed** if the required catalog handle is missing.
- OpenAI adapter transports the block unchanged; it does **not** own REPLACE_TEXT→CONTENT semantics.

### Provider instructions

`EDIT_PROFILE_INSTRUCTIONS` strengthened only generically:

- obey supplied GROUNDING REQUIREMENTS;
- link `supportingClaimIds` to the required claim;
- do not invent handles / substitute claim kinds.

No hard-coded `REPLACE_TEXT means CONTENT` inside `src/adapters/openai/**`.

### Native OpenAI schema

**Unchanged.** `supportingClaimIds` already has `minItems: 1` and claim/change shapes already match application grammar. JSON Schema cannot truthfully enforce dynamic referential integrity between claim kind, evidence handle, and `supportingClaimIds` — that remains Gate 1 / mutation enforcement.

---

## 4. Unchanged semantics

| Owner | Status |
|---|---|
| Gate 1 binder / applicability | unchanged |
| Mutation CONTENT/EXISTS enforcement messages | unchanged |
| Phase 2 evidence meanings | unchanged |
| Editing / Validation / Engineering Run / Gate 2 | unchanged |
| H1 nested reasoning → `reasoningProposalJson` translation | unchanged |
| No claim synthesis / repair / auto-retry | confirmed |

---

## 5. R1–R9 proof mapping

| ID | Proof | Location |
|---|---|---|
| R1 | REPLACE + CREATE grounding block from mutation (not openai) | `tests/mutation/grounding.test.ts` |
| R2 | OpenAI request body carries block + instructions; no authority fields | same |
| R3 | Compliant CONTENT → MutationReview; no write | same |
| R4 | Non-CONTENT supporting claim → existing refusal | same |
| R5 | BEHAVES instead of CONTENT → existing refusal | same |
| R6 | Foreign CONTENT handle; valid CONTENT not in supportingClaimIds | same |
| R7 | CREATE_TEXT EXISTS guidance + positive/negative | same |
| R8 | String-mode edit envelope still `EDIT_ENVELOPE_STRING_MODE_REJECTED` | same |
| R9 | Source asserts: no claim fabrication, no mint/auth during grounding | same |

---

## 6. Files changed

- `src/orchestrator/mutation/types.ts` — grounding types
- `src/orchestrator/mutation/session.ts` — resolve handles, emit block, fail closed if missing
- `src/orchestrator/mutation/index.ts` — export types + builder
- `src/adapters/openai/profiles.ts` — generic instruction strengthen only
- `tests/mutation/grounding.test.ts` — R1–R9
- `tests/mutation/architecture.test.ts` — export allowlist
- `docs/reports/PHASE_5F_H2_EDIT_GROUNDING_CORRECTION.md` — this report

---

## 7. Validation

### Focused

```text
tests/mutation/grounding.test.ts → 8 passed
tests/mutation/ + openai handoff/request/response + terminal-trial integration → 44 passed
```

### Canonical

**ONE** `npm run check`: **PASS**

- 102 files / 924 tests
- typecheck / build / cli:smoke / ledger:verify
- exit 0; zero unhandled/worker errors
- no second attempt; no timeout changes; no skipped tests

---

## 8. Guarantees

| Item | Status |
|---|---|
| Main unchanged | YES (`525d74c…`) |
| Worktree clean after commit | YES |
| Zero live provider calls | YES |
| Zero real credentials | YES |
| No merge / no push | YES |
| Not claimed to be the last possible live defect | YES — only this grounding blocker is addressed |

---

## 9. Operator retry command

```bash
pathcode --model gpt-5.6-terra
```

Then `/trial` with interactive approvals. This implementer did **not** run Trial 1.
