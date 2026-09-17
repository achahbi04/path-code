# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **IN PROGRESS (S3.1 first slice)**  
**S2 freeze tip preserved:** `67200c1551d7dc6beee9bafb495d133ec11dc0ba`  
**S2.3 tip record:** `6dd7d31e38fe6436ffd55ade3f63a46b2c24166c`  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S2 Real-Project Workflow Productization — **FROZEN / OPERATOR ACCEPTED**  
See [`PHASE_S2_PRODUCTIZATION.md`](./PHASE_S2_PRODUCTIZATION.md).

**S4:** NOT STARTED

---

## S3.1 — First slice boundary (why)

**Goal:** wire Cursor as a first-class peer engine through the same Gateway / G10 fabric as Antigravity and Copilot — without a permanent provider hierarchy, without reopening S1/S2, and without starting S4 (crash recovery / multi-client durability beyond what S2 already ships).

**In scope for S3.1:**
- Engine capability contract (`selectEngineForTurn`, `buildEngineCapabilityList`, provenance)
- Cursor SDK local executor (`@cursor/sdk`) against the PATH task worktree
- Event mapping (`mapCursorSdkEvent`) into the G10 → session cockpit path
- Collaborative repair + preferred-engine primary turn (skip AG `startTask` when Cursor preferred+ready+ok)
- Gateway `listCapabilities` honesty (no `slot_reserved` for Cursor when probe is honest)
- Mechanical tests + pack-free evidence harness

**Out of scope for S3.1 / S4 not started:**
- Crash-safe multi-engine resume productization beyond existing G10 checkpoints
- Studio / Build slot product surfaces
- Publication / release changes
- Inventing a permanent “Cursor primary, AG secondary” hierarchy

---

## Current-state findings (brief)

- S1/S2 Gateway already listed Cursor as `slot_reserved` — a placeholder, not a live executor.
- G10 fabric already had Copilot attach + collab turns + mutation leases; Cursor mirrors that path.
- Official `@cursor/sdk` is an optional dependency; readiness is API-key + SDK resolve (and attach for live turns).
- Collaboration selection is capability-aware rotation via `selectEngineForTurn` — preference and continuity are opt-in, not permanent rank.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | S3.1 wiring: `engine-contract`, `cursor-sdk`, `mapCursorSdkEvent`, fabric `attachCursor` / `runCursorCollabTurn`, session preferred-engine skip-AG primary, gateway capabilities + `preferredEngine` routing |
| **MECHANICALLY TESTED** | `tests/s3/*` + `docs/reports/g10-evidence/s3/run-s31-mechanical.mjs` → `s31-mechanical.json` |
| **LIVE-VERIFIED** | Only when `CURSOR_API_KEY` is present and optional Agent.prompt dry check in the evidence harness succeeds; otherwise remains mechanical |
| **OPERATOR ACCEPTANCE** | **PENDING** |

---

## Evidence

- Mechanical: [`g10-evidence/s3/`](./g10-evidence/s3/)
- S2 freeze tip (do not reopen): `67200c1551d7dc6beee9bafb495d133ec11dc0ba`

---

## S4

**NOT STARTED.** No crash-recovery productization, no new durability program beyond S3.1 fabric wiring.
