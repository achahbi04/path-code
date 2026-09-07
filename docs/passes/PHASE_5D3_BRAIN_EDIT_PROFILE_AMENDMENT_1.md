# PATH CODE — PHASE 5D3 BRAIN EDIT PROFILE AMENDMENT 1

**Prospective extension of:** `docs/passes/PHASE_5D1_ENGINEERING_BRAIN_CONTRACT.md` (response profiles / purposes) and `docs/passes/PHASE_5D2_ORCHESTRATOR_CORE_CONTRACT.md` (Brain request construction defaults remain for the conductor).  
**Does not rewrite** historical 5D1/5D2 contracts. Old call sites without an explicit profile keep `REASONING_PROPOSAL_JSON` v1.

---

## Preserved behavior

| Item | Preserved |
|---|---|
| Default profile when `responseProfile` omitted | `REASONING_PROPOSAL_JSON` / schemaVersion `1` |
| Purposes `PROPOSE_REASONING` / `REVISE_REASONING` | Unchanged |
| Orchestrator `buildBrainRequest` | Continues to request `REASONING_PROPOSAL_JSON` only |
| Invocation correlation, envelope, cancellation, single-flight, usage, dispatch accounting | Unchanged |
| Adapter capability gate | Requested profile must appear in `acceptedResponseProfiles` |

---

## Exact new profile

| Field | Value |
|---|---|
| `kind` | `ENGINEERING_EDIT_PROPOSAL_JSON` |
| `schemaVersion` | `1` (constant `ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION`) |
| Purpose | `PROPOSE_EDIT` (mutation consumer only) |
| Controller | Same `createEngineeringBrain` / `normalizeInvocationRequest` |
| Parser of edit envelope | **Not** in Brain — mutation consumer parses outer JSON; embedded `reasoningProposalJson` string goes to Gate 1 unchanged |

---

## Affected files

- `src/brain/bounds.ts` — export `ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION`
- `src/brain/types.ts` — widen `BrainResponseProfile` and `BrainInvocationPurpose`
- `src/brain/normalize.ts` — accept new purpose/profile; legacy default unchanged
- `src/brain/index.ts` + `tests/brain/architecture.test.ts` — export allowlist
- `tests/brain/fixtures.ts` — deterministic adapters may advertise both profiles
- Mutation consumer selects the new profile explicitly

---

## Proofs

- Legacy invoke without profile → reasoning profile (M02)
- Explicit edit profile accepted when adapter advertises it (M02)
- Unsupported capability refuses before dispatch (M02)
- Mutation E2E uses edit then reasoning profiles on the **same** Brain (M28)
