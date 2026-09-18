# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **FROZEN / OPERATOR ACCEPTED** (S3.2 closed)  
**S3.2 freeze tip:** `89eea9992c1bb30763413aa0054d93481c65fcb2`  
**S3.1 freeze tip:** `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559` — **do not reopen**  
**S2 freeze tip preserved:** `67200c1551d7dc6beee9bafb495d133ec11dc0ba`  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S2 Real-Project Workflow Productization — **FROZEN / OPERATOR ACCEPTED**

**S4:** NOT STARTED (crash-safe multi-engine resume / durable reboot recovery remains S4)

---

## S3 freeze judgment

The Unified Engine Fabric is **complete enough to freeze S3**.

What S3 delivered:
- One Gateway-facing fabric with honest capability differences
- Need-fit routing (`inferTurnNeeds` → traits → preference/continuity → rotate fit peers)
- Structured handoff on the same task / worktree / project reality
- Cursor / Copilot / Antigravity as live collaborators without a permanent hierarchy

What remains is **not** another S3 fabric slice — it is **S4**: durable crash/restart/reboot continuity across engines. Inventing an S3.3 would dilute that boundary.

---

## S3.2 invariants (closure audit)

### 1. Traits are real capabilities, not provider stereotypes

- Declarations live in `scripts/pathcode-cli/ag10/engine-capabilities.mjs`
- Adapters re-export `declare*EngineCapability` (`cursor-sdk`, `copilot-sdk`, `ag-session`)
- Routing consumes traits via `engineMeetsNeeds` — it does **not** hard-code “Copilot = LSP” / “Cursor = steer”
- `buildEngineCapabilityList({ declarations, traitOverrides })` lets traits evolve when an integration gains or loses a capability
- Mechanical proof: trait-swap test routes inflight steer → Copilot and lsp → Cursor when declarations are swapped

### 2. No hidden engine scoring / model ranking

- `explainEngineSelection` is boolean fit → preference → continuity → rotate among fit peers
- Peer list order is stable enumeration for rotation only — not preference weights
- No `qualityScore` / provider weights / model ranks on the selection path
- Legitimate inputs only: needs, readiness, continuity, preference, steering semantics, declared traits

---

## S3.2 — Fabric maturity (this slice)

**In scope (done):**
- Adapter-owned capability traits + turn-need matching + selection reasons
- Need-fit routing + structured fabric handoff
- Session repair loop + report routing note + Gateway `capabilities.list` traits

**Out of scope / deferred:**
- **S4** crash-safe multi-engine resume / reboot recovery
- Permanent provider hierarchy or PATH-as-model-judge ranking
- Studio/Build slots; publication/release

---

## Architecture (S3.2)

```
PATH Code (product surface)
    │
PATH Gateway  (bind / start / steer / cancel / capabilities / results)
    │
Unified Engine Fabric (G10)
    │  adapter declare*Capability → traits
    │  inferTurnNeeds → explainEngineSelection (need-fit, no hierarchy)
    │  buildFabricHandoff → peer prompts
    │  mutation leases · steering queue · checkpoints · collab journal
    ├─ Antigravity  — bridge, hooks, boundary steer (declared)
    ├─ Copilot      — SDK/CLI, LSP, boundary steer (declared)
    └─ Cursor       — local SDK, inflight steer (declared)
    │
one task worktree / one project reality
```

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | Traits from adapter declarations + need-fit + handoff + evolvable overrides |
| **MECHANICALLY TESTED** | `tests/s3/fabric-routing.test.ts` (incl. trait-swap + no-score invariants) |
| **LIVE-VERIFIED** | `run-s32-live-fabric.mjs` → `s32-live-fabric.json` **LIVE-VERIFIED** |
| **OPERATOR ACCEPTANCE** | **ACCEPTED** — checklist `g10-evidence/s3/s32-operator-acceptance.md` |

---

## Evidence

- [`g10-evidence/s3/s32-live-fabric.json`](./g10-evidence/s3/s32-live-fabric.json) — LIVE fabric maturity pack
- `s32-live-fabric-run.txt`, `s32-focused-tests.txt`
- S3.1 freeze tip: `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559`

---

## S3.1 (frozen)

First-slice Cursor peer + preferred primary + multi-peer leases + result-capture lifecycle.
See prior sections / evidence under `g10-evidence/s3/s31-*`.

---

## S4

**NOT STARTED.** Crash-safe multi-engine resume and durable restart/reboot recovery belong here.
