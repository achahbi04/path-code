# PHASE 5F — OPENAI EDIT PROFILE INTEROP CORRECTION

**Result: PASS**

**Success line:**  
`PHASE 5F OPENAI EDIT PROFILE INTEROP — NESTED REASONING ON WIRE — APPLICATION STRING PRESERVED — GATE1 UNCHANGED — CANONICAL OFFLINE`

---

## 1. Exact state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Branch | `cursor/phase5f-live-trial-cli` |
| Starting HEAD | `29c83d33a0acb569efaac7c329433af1f8d62bbf` |
| Main (unchanged) | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Final SHA | `d8d0f68c5baf063fc5375c1de15868f094a1f9c4` |
| Live trial by implementer | **NOT RUN** |
| Live provider calls | **zero** (fixture transport only) |
| Credentials | **none read** |

---

## 2. Live root cause

First real Terra edit-profile call completed at the transport layer, but Gate 1 refused:

```text
GATE1_FAILED
INPUT: INVALID_JSON
```

**Cause:** OpenAI Structured Outputs constrained `reasoningProposalJson` only as a **string**. That does not structurally guarantee the string contents are valid ReasoningProposal JSON. The outer ENGINEERING_EDIT_PROPOSAL_JSON envelope could be accepted while the embedded reasoning string was malformed → Gate 1 `INVALID_JSON`.

No edit authorization, filesystem edit, or Git commit occurred (correct fail-closed path).

---

## 3. Provider-native schema change

`ENGINEERING_EDIT_PROPOSAL_NATIVE_SCHEMA` now requires:

```json
{
  "schemaVersion": 1,
  "proposalId": "...",
  "reasoningProposal": { /* REASONING_PROPOSAL_NATIVE_SCHEMA */ },
  "changes": [ ... ]
}
```

- Nested object is **the same** `REASONING_PROPOSAL_NATIVE_SCHEMA` object reference (no forked grammar).
- `reasoningProposalJson` string field **removed** from the OpenAI-native schema.
- `REASONING_PROPOSAL_JSON` profile schema / instructions **unchanged**.
- Edit profile instructions now require a nested object, not a JSON string.

---

## 4. Adapter translation

At the OpenAI adapter COMPLETE path only (`profileKind === ENGINEERING_EDIT_PROPOSAL_JSON`):

1. Accept provider-native nested `reasoningProposal` object.
2. Deterministically `JSON.stringify` that object → `reasoningProposalJson`.
3. Emit existing Path Code application envelope:

```json
{
  "schemaVersion": 1,
  "proposalId": "...",
  "reasoningProposalJson": "<serialized nested object>",
  "changes": [ ... ]
}
```

4. Pass that untrusted text to Brain / mutation / Gate 1 unchanged from prior application contract.

Fail closed (no repair / no string-mode fallback / no retry):

- missing nested object
- `reasoningProposalJson` present (string-mode / live-failure class)
- `reasoningProposal` as a string
- wrong outer/nested version
- unknown outer fields
- ambiguous reasoning (array)
- missing claims/hypotheses/ids
- serialization failure

**Unchanged:** Brain profile identifiers, mutation `parseEditProposalEnvelope`, Gate 1 binder, mutation authority, editing, Validation, Engineering Run, Gate 2.

---

## 5. Files changed

| Path | Change |
|---|---|
| `src/adapters/openai/profiles.ts` | Nested edit schema + instructions |
| `src/adapters/openai/response.ts` | `translateNativeEditEnvelopeToApplication` + COMPLETE translation |
| `src/adapters/openai/adapter.ts` | Pass `profileKind` into translate context |
| `tests/adapters/openai/request.test.ts` | F04 nested schema proof |
| `tests/adapters/openai/response.test.ts` | Translation + string-mode + reasoning passthrough |
| `tests/adapters/openai/adapter.test.ts` | Edit Brain path uses nested fixture |
| `tests/adapters/openai/handoff.test.ts` | Nested→Gate1 / string-mode refuse / no apply |
| `tests/terminal-trial/helpers.ts` | Fixture transport emits native nested edit wire |
| `docs/reports/PHASE_5F_OPENAI_EDIT_PROFILE_INTEROP_CORRECTION.md` | This report |

---

## 6. Validation

### Focused

```text
npm test -- tests/adapters/openai/request.test.ts \
  tests/adapters/openai/response.test.ts \
  tests/adapters/openai/adapter.test.ts \
  tests/adapters/openai/handoff.test.ts
→ 22 passed

npm test -- tests/adapters/openai/ tests/mutation/
→ 48 passed
```

### Canonical

1. First `npm run check`: **FAIL** — `tests/terminal-trial/integration.test.ts` still queued application string-mode edit fixtures through the real OpenAI adapter (now correctly rejected).
2. Named causal correction: trial fixture helper emits provider-native nested `reasoningProposal`.
3. Second `npm run check`: **PASS** — 101 files / 916 tests, `cli:smoke`, `ledger:verify`. Zero unhandled/worker errors. No timeout changes. No skipped tests.

---

## 7. Guarantees

| Item | Status |
|---|---|
| Gate 1 not weakened | YES |
| No heuristic JSON repair | YES |
| Brain / mutation application formats unchanged | YES |
| Reasoning profile unchanged | YES |
| Main unchanged | YES (`525d74c…`) |
| No merge / no push | YES |
| Zero live OpenAI calls | YES |
| Worktree clean after report commit | YES |

---

## 8. Operator retry command

```bash
pathcode --model gpt-5.6-terra
```

Then at the PATH ● Code prompt enter `/trial` and complete interactive approvals. This implementer did **not** run the live trial.
