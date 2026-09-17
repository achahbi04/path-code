# PATH CODE — S3
# UNIFIED ENGINE FABRIC

**S3 RESULT:** **S3.1 MECHANICALLY TESTED** (operator acceptance pending)  
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

- S1/S2 Gateway previously listed Cursor as `slot_reserved` — a placeholder, not a live executor.
- G10 fabric already had Copilot attach + collab turns + mutation leases; Cursor mirrors that path.
- Official `@cursor/sdk` is an optional dependency; readiness is API-key + SDK resolve (and attach for live turns).
- Collaboration selection is capability-aware rotation via `selectEngineForTurn` — preference and continuity are opt-in, not permanent rank.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | S3.1 wiring: `engine-contract`, `cursor-sdk`, `mapCursorSdkEvent`, fabric `attachCursor` / `runCursorCollabTurn`, session preferred-engine skip-AG primary, gateway capabilities + `preferredEngine` routing |
| **MECHANICALLY TESTED** | Focused `tests/s3` + `tests/s2`: **33/33** → `s31-focused-tests.txt`; `run-s31-mechanical.mjs` → `s31-mechanical.json` verdict **MECHANICALLY TESTED**; canonical `npm run check` → `s31-canonical-check.txt` **CHECK_EXIT:0** (165 files / 1466 tests + cli:smoke + ledger:verify) |
| **LIVE-VERIFIED** | **Not run** — `CURSOR_API_KEY` unset on this host. Harness will attempt bounded `Agent.prompt` / `Agent.send` against `docs/reports/g10-evidence/s3/live-fixture` when a key is present |
| **OPERATOR ACCEPTANCE** | **PENDING** |

---

## Evidence

- Mechanical pack: [`g10-evidence/s3/`](./g10-evidence/s3/)
  - `s31-focused-tests.txt` — vitest `tests/s3` + `tests/s2`
  - `s31-mechanical.json` / `s31-mechanical-run.txt` — pack-free fabric harness
  - `s31-canonical-check.txt` — `npm run check` (+ `CHECK_EXIT`)
  - Optional live fixture root: `g10-evidence/s3/live-fixture/` (created only when live path runs)
- S2 freeze tip (do not reopen): `67200c1551d7dc6beee9bafb495d133ec11dc0ba`

---

## Key new / changed files (S3.1)

| Path | Role |
| --- | --- |
| `scripts/pathcode-cli/ag10/engine-contract.mjs` | Peer engine IDs, capability list, `selectEngineForTurn`, provenance helpers |
| `scripts/pathcode-cli/ag10/cursor-sdk.mjs` | `@cursor/sdk` load/detect/execute against task worktree |
| `scripts/pathcode-cli/ag10/events.mjs` | `mapCursorSdkEvent` → cockpit families |
| `scripts/pathcode-cli/ag10/index.mjs` / `fabric.mjs` / `task-checkpoint.mjs` | Cursor attach, collab turn, checkpoint provenance |
| `scripts/pathcode-cli/ag9/collaborate.mjs` | `chooseCollabEngine` → S3 contract rotation |
| `scripts/pathcode-cli/ag1/session.mjs` | Preferred-engine primary path (skip AG when Cursor preferred+ready) |
| `scripts/pathcode-cli/gateway/runtime.mjs` | Honest Cursor capability status (no permanent `slot_reserved`) |
| `scripts/pathcode-cli/ag1/venv-guard.mjs` | Bounded AG1 python probe (8s) so doctor/check cannot hang on wedged import |
| `tests/s3/engine-fabric.test.ts` | Contract + collab + event mapping |
| `tests/s3/cursor-executor.test.ts` | SDK load / detect / failure classify |
| `tests/s2/worktree-title-repair.test.ts` | Workspace-local scratch + template-free `git init` for sandbox hosts |
| `docs/reports/g10-evidence/s3/run-s31-mechanical.mjs` | Pack-free evidence + optional live fixture |

---

## S4

**NOT STARTED.** No crash-recovery productization, no new durability program beyond S3.1 fabric wiring.
