# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **S3.1 FROZEN / OPERATOR ACCEPTED**  
**S3.1 freeze tip:** `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559`  
**S3.1 result-capture tip:** `4c6cf6a44ebb3e1a6475ec9c6c35dadf62d31559`  
**S3.1 prior acceptance tip:** `48e2a788f4576166bf8bf4aea36f424e1f15535a`  
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
- Authoritative Cursor→Git→`/inspect` result capture (changed files + adoptable)

**Out of scope / S4 not started:** crash-safe multi-engine resume productization beyond existing G10 checkpoints; Studio/Build slots; publication/release; permanent engine hierarchy; Terminal title polish.

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
        → Git/result collection → durable task state → /inspect → adopt/merge
```

Participation is capability-aware. Engines keep distinct steering/cancel/resume semantics.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | Fabric contract + Cursor peer + preferred primary + Cursor steering continue + report provenance + Gateway `preferredEngine` + result-capture lifecycle |
| **MECHANICALLY TESTED** | `tests/s3` incl. `result-capture.test.ts`; freeze-repair + result-lifecycle |
| **LIVE-VERIFIED** | `run-s31-acceptance.mjs` + `run-s31-result-capture.mjs` → **LIVE-VERIFIED** (`/inspect` shows `S3_CURSOR_OPERATOR_ACCEPTANCE.md`, Adoptable yes) |
| **OPERATOR ACCEPTANCE** | **ACCEPTED** — live fabric accepted; result-capture inconsistency closed |

---

## Evidence

- [`g10-evidence/s3/s31-acceptance.json`](./g10-evidence/s3/s31-acceptance.json) — acceptance LIVE pack
- [`g10-evidence/s3/s31-result-capture.json`](./g10-evidence/s3/s31-result-capture.json) — Cursor result-capture LIVE proof
- `s31-live-fabric.json`, `s31-mechanical.json`, `s31-focused-tests.txt`, `s31-canonical-check.txt`, `s31-result-capture-tests.txt`
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
7. Post-commit `listCommitChangedFiles(baseline, sha)` is authoritative for report / checkpoint / `/inspect` / adoptable.

---

## Next (S3.2 proposal)

**S3.2 — Fabric continuity & title polish:** crash-safe multi-engine resume productization on shared G10 checkpoints; Terminal title provider/process text cleanup; keep S4 (publication/Studio slots) closed.

---

## S4

**NOT STARTED.**
