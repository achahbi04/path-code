# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **S3.2 LIVE-VERIFIED** (ready for operator review)  
**S3.2 live tip:** _(recorded on freeze)_  
**S3.1 freeze tip:** `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559` — **do not reopen**  
**S2 freeze tip preserved:** `67200c1551d7dc6beee9bafb495d133ec11dc0ba`  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S2 Real-Project Workflow Productization — **FROZEN / OPERATOR ACCEPTED**

**S4:** NOT STARTED (crash-safe multi-engine resume / durable reboot recovery remains S4)

---

## S3.2 — Fabric maturity (this slice)

**Goal:** deepen the Unified Engine Fabric so Antigravity, Copilot, and Cursor participate *intelligently* through one PATH task reality while preserving their real differences.

**In scope for S3.2:**
- Richer capability representation (`traits`, honest `steering` / `cancel` / `resume`)
- Turn-need inference from objective / role / validation (capability tags — **not** model scores)
- Need-fit routing via `explainEngineSelection` (preference → continuity → rotate among fit peers)
- Structured fabric handoff packets (`buildFabricHandoff` / `formatFabricHandoff`) for coherent peer turns
- Session repair loop uses need-fit selection + handoff text; report surfaces last routing note
- Gateway `capabilities.list` exposes traits for each live engine

**Out of scope / deferred:**
- **S4** crash-safe multi-engine resume / reboot recovery productization
- Permanent provider hierarchy or PATH-as-model-judge ranking
- Studio/Build slots; publication/release
- Terminal title polish (may improve incidentally; not the slice goal)

---

## Architecture (S3.2)

```
PATH Code (product surface)
    │
PATH Gateway  (bind / start / steer / cancel / capabilities / results)
    │
Unified Engine Fabric (G10)
    │  inferTurnNeeds → explainEngineSelection (need-fit, no hierarchy)
    │  buildFabricHandoff → peer prompts
    │  mutation leases · steering queue · checkpoints · collab journal
    ├─ Antigravity  — bridge, hooks, boundary steer, native cancel
    ├─ Copilot      — SDK/CLI, LSP, boundary steer, abort-registry cancel
    └─ Cursor       — local SDK, inflight steer, native cancel
    │
one task worktree / one project reality
```

Participation is capability-aware. Engines keep distinct steering/cancel/resume semantics.
Not every task uses multiple engines.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | Traits + need inference + need-fit selection + fabric handoff + session/report wiring |
| **MECHANICALLY TESTED** | `tests/s3/fabric-routing.test.ts` + existing `tests/s3` |
| **LIVE-VERIFIED** | `run-s32-live-fabric.mjs` → `s32-live-fabric.json` **LIVE-VERIFIED** |
| **OPERATOR ACCEPTANCE** | **PENDING REVIEW** — checklist `g10-evidence/s3/s32-operator-acceptance.md` |

---

## Evidence

- [`g10-evidence/s3/s32-live-fabric.json`](./g10-evidence/s3/s32-live-fabric.json) — LIVE fabric maturity pack
- `s32-live-fabric-run.txt`, `s32-focused-tests.txt`
- S3.1 freeze tip: `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559`

---

## How need-fit routing works

1. `inferTurnNeeds({ role, objective, validation })` → tags such as `repair`, `lsp`, `inflight_steer`.
2. `explainEngineSelection` filters ready engines to those that **meet** the needs (boolean fit).
3. Explicit preference still wins when the preferred engine is ready and fits.
4. Continuity with the last engine wins on non-repair turns when still fit/ready.
5. Otherwise rotate among fit peers — never a permanent AG→Copilot→Cursor hierarchy.
6. On handoff, `buildFabricHandoff` carries objective, needs, routing reason, journal, and worktree reality into the next engine prompt.

---

## S3.1 (frozen)

First-slice Cursor peer + preferred primary + multi-peer leases + result-capture lifecycle.
See prior sections / evidence under `g10-evidence/s3/s31-*`.

---

## S4

**NOT STARTED.** Crash-safe multi-engine resume and durable restart/reboot recovery belong here.
