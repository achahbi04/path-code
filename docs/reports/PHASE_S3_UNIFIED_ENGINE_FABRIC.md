# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **S3.1 LIVE-VERIFIED** (operator acceptance pending)  
**S3.1 live checkpoint tip:** `c0dc3ace91118d63cce0de0a6490e8df62182925`  
**S3.1 implementation checkpoint:** `20c3138255526758c1c276eed0353ece6ca97545`  
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
- Steering continues on the owning peer (Cursor primary → Cursor continue, not forced AG rehydrate)
- Gateway `listCapabilities` honesty (no `slot_reserved` for Cursor when probe is honest)
- Mechanical + **LIVE** evidence against a real Cursor SDK session

**Out of scope for S3.1 / S4 not started:**
- Crash-safe multi-engine resume productization beyond existing G10 checkpoints
- Studio / Build slot product surfaces
- Publication / release changes
- Inventing a permanent “Cursor primary, AG secondary” hierarchy

---

## Current-state findings (brief)

- S1/S2 Gateway previously listed Cursor as `slot_reserved` — a placeholder, not a live executor.
- G10 fabric already had Copilot attach + collab turns + mutation leases; Cursor mirrors that path.
- Official `@cursor/sdk` is an optional dependency; readiness is API-key / `Cursor.auth.login` store + SDK resolve (and attach for live turns).
- Collaboration selection is capability-aware rotation via `selectEngineForTurn` — preference and continuity are opt-in, not permanent rank.
- Credential resolution: `CURSOR_API_KEY` / `PATHCODE_CURSOR_API_KEY` / `PATH_CURSOR_API_KEY` env → macOS Keychain `PATH_CURSOR_API_KEY` → `~/.cursor/sdk/auth.json` (SDK login).

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | S3.1 wiring: `engine-contract`, `cursor-sdk`, `mapCursorSdkEvent`, fabric `attachCursor` / `runCursorCollabTurn`, session preferred-engine skip-AG primary + Cursor steering continue, gateway capabilities + `preferredEngine` routing, result `engine` / `preferredEngine` provenance |
| **MECHANICALLY TESTED** | Focused `tests/s3` + `tests/s2`: **13/13** → `s31-focused-tests.txt`; `run-s31-mechanical.mjs` → `s31-mechanical.json` verdict **LIVE-VERIFIED**; canonical `npm run check` → `s31-canonical-check.txt` |
| **LIVE-VERIFIED** | `run-s31-live-fabric.mjs` → `s31-live-fabric.json` verdict **LIVE-VERIFIED**: direct Cursor turn, Gateway `preferredEngine=cursor` primary (VERIFIED), mid-task steer, cancel=`CANCELLED`, engine provenance |
| **OPERATOR ACCEPTANCE** | **PENDING** |

---

## Evidence

- Live + mechanical pack: [`g10-evidence/s3/`](./g10-evidence/s3/)
  - `s31-live-fabric.json` / `s31-live-fabric-run.txt` — Gateway + executor LIVE fabric
  - `s31-mechanical.json` / `s31-mechanical-run.txt` — contract + optional `Agent.prompt`
  - `s31-focused-tests.txt` — vitest `tests/s3` + `tests/s2`
  - `s31-canonical-check.txt` — `npm run check` (+ `CHECK_EXIT`)
  - Live fixture: `g10-evidence/s3/live-fixture/`
- S2 freeze tip (do not reopen): `67200c1551d7dc6beee9bafb495d133ec11dc0ba`

---

## Key new / changed files (S3.1)

| Path | Role |
| --- | --- |
| `scripts/pathcode-cli/ag10/engine-contract.mjs` | Peer engine IDs, capability list, `selectEngineForTurn`, provenance helpers |
| `scripts/pathcode-cli/ag10/cursor-sdk.mjs` | `@cursor/sdk` load/detect/execute; Keychain + `auth.json` resolve; model on `send` |
| `scripts/pathcode-cli/ag10/events.mjs` | `mapCursorSdkEvent` → cockpit families |
| `scripts/pathcode-cli/ag10/index.mjs` / `fabric.mjs` / `task-checkpoint.mjs` | Cursor attach, collab turn, checkpoint provenance |
| `scripts/pathcode-cli/ag9/collaborate.mjs` | `chooseCollabEngine` → S3 contract rotation |
| `scripts/pathcode-cli/ag1/session.mjs` | Preferred Cursor primary; Cursor steering continue; result engine provenance |
| `scripts/pathcode-cli/gateway/runtime.mjs` | Honest Cursor capability status (no permanent `slot_reserved`) |
| `scripts/pathcode-cli/ag1/venv-guard.mjs` | Bounded AG1 python probe (8s) so doctor/check cannot hang on wedged import |
| `tests/s3/engine-fabric.test.ts` | Contract + collab + event mapping |
| `tests/s3/cursor-executor.test.ts` | SDK load / detect / failure classify |
| `docs/reports/g10-evidence/s3/run-s31-mechanical.mjs` | Pack-free mechanical + live Agent.prompt |
| `docs/reports/g10-evidence/s3/run-s31-live-fabric.mjs` | Gateway preferred Cursor + steer + cancel LIVE proof |
| `docs/reports/g10-evidence/s3/mint-cursor-key.mjs` | Optional `Cursor.auth.login` mint helper |

---

## How routing works (S3.1)

1. Gateway `startTask({ preferredEngine: "cursor" })` → session fabric attaches Cursor SDK against the task worktree.
2. When Cursor is `native_sdk` and preferred, Cursor takes the **primary** turn (Antigravity `startTask` skipped).
3. Repair / collab rotation uses `selectEngineForTurn` (capability-aware; continuity optional).
4. Mid-task operator steer after Cursor primary continues via `runCursorCollabTurn`, not AG rehydrate.
5. Result records `preferredEngine` + actual `engine` (last collab turn) for provenance.

---

## S4

**NOT STARTED.** No crash-recovery productization, no new durability program beyond S3.1 fabric wiring.
