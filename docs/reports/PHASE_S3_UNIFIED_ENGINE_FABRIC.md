# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **S3.1 LIVE-VERIFIED** (operator acceptance pending)  
**S3.1 acceptance tip:**   
**S3.1 prior live tip:** `c0dc3ace91118d63cce0de0a6490e8df62182925`  
**S3.1 implementation checkpoint:** `20c3138255526758c1c276eed0353ece6ca97545`  
**S2 freeze tip preserved:** `67200c1551d7dc6beee9bafb495d133ec11dc0ba`  
**S2.3 tip record:** `6dd7d31e38fe6436ffd55ade3f63a46b2c24166c`  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S2 Real-Project Workflow Productization — **FROZEN / OPERATOR ACCEPTED**  
See [`PHASE_S2_PRODUCTIZATION.md`](./PHASE_S2_PRODUCTIZATION.md).

**S4:** NOT STARTED

---

## S3.1 — First slice boundary (why)

**Goal:** wire Cursor as a first-class peer engine through the same Gateway / G10 fabric as Antigravity and Copilot — without a permanent provider hierarchy, without reopening S1/S2, and without starting S4.

**In scope for S3.1:**
- Engine capability contract (`selectEngineForTurn`, `buildEngineCapabilityList`, provenance)
- Cursor SDK local executor (`@cursor/sdk`) against the PATH task worktree
- Event mapping into G10 → session cockpit
- Preferred-engine primary + owning-peer steering continues
- Multi-peer shared worktree turns (Cursor · Copilot under mutation leases)
- Engineering report **Engine fabric** provenance
- Mechanical + acceptance LIVE evidence

**Out of scope / S4 not started:** crash-safe multi-engine resume productization beyond existing G10 checkpoints; Studio/Build slots; publication/release; permanent engine hierarchy.

---

## Final fabric architecture (S3.1)

```
PATH Code (product surface)
    │
PATH Gateway  (bind / start / steer / cancel / capabilities / results)
    │
Unified Engine Fabric (G10)
    │  capability-aware selectEngineForTurn
    │  mutation leases · steering queue · checkpoints · collab journal
    ├─ Antigravity  — bridge, continue, boundary steer, native cancel
    ├─ Copilot      — SDK / CLI fallback, boundary steer
    └─ Cursor       — @cursor/sdk local cwd, in-flight steer, native cancel/resume
    │
one task worktree / one project reality
```

Participation is capability-aware. Engines keep distinct steering/cancel/resume semantics.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | Fabric contract + Cursor peer + preferred primary + Cursor steering continue + report provenance + Gateway `preferredEngine` on start/snapshot |
| **MECHANICALLY TESTED** | `tests/s3` + worktree repair → `s31-focused-tests.txt`; `run-s31-mechanical.mjs` → **LIVE-VERIFIED** |
| **LIVE-VERIFIED** | `run-s31-acceptance.mjs` → `s31-acceptance.json` **LIVE-VERIFIED** (Cursor direct/steer/cancel, multi-peer Cursor+Copilot, Gateway Cursor primary VERIFIED, Gateway AG path VERIFIED, honest capabilities) |
| **OPERATOR ACCEPTANCE** | **PENDING** — checklist [`g10-evidence/s3/s31-operator-acceptance.md`](./g10-evidence/s3/s31-operator-acceptance.md) |

---

## Evidence

- [`g10-evidence/s3/s31-acceptance.json`](./g10-evidence/s3/s31-acceptance.json) — acceptance LIVE pack
- `s31-live-fabric.json`, `s31-mechanical.json`, `s31-focused-tests.txt`, `s31-canonical-check.txt`
- Operator checklist: `s31-operator-acceptance.md`
- S2 freeze tip: `67200c1551d7dc6beee9bafb495d133ec11dc0ba`

---

## How routing / continuity works

1. Gateway `startTask({ preferredEngine })` records preference on the task and returns it.
2. Cursor preferred + `native_sdk` → Cursor **primary** (AG `startTask` skipped).
3. Mid-task steer after Cursor primary → `runCursorCollabTurn` (not forced AG rehydrate).
4. Repair rotation → `selectEngineForTurn` among ready peers (AG · Copilot · Cursor).
5. Continuity prefers last engine when not in repair role.
6. Results + durable reports carry `preferredEngine`, `engine`, `enginesUsed`, `cursorMode`.

---

## S4

**NOT STARTED.**
