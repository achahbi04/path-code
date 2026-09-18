# PATH CODE — S4
# DURABLE CONTINUITY & RECOVERY

**S4 RESULT:** **S4.2 LIVE-VERIFIED** (engine/process interruption while Gateway alive)  
**S3 stage freeze (do not reopen):** `89eea9992c1bb30763413aa0054d93481c65fcb2`  
**S4.1:** **ACCEPTED / FROZEN** — `3bea879358a2598a41c6632ecb530da446f1c936` — do not reopen / do not re-prove Gateway SIGKILL  
**S4.2 checkpoint tip:** _(recorded at commit)_

**Prior stage:** S3 Unified Engine Fabric — **FROZEN / STAGE COMPLETE** (no S3.3)

**PATH Build / PATH Studio:** later stages

---

## Purpose

Make PATH Code durable across interruption:

```
one durable PATH task
    ↓
processes / Gateway / engines may come and go
    ↓
PATH reconciles what is actually alive
    ↓
reconnects or resumes where genuinely supported
    ↓
otherwise reconstructs from durable PATH reality
    ↓
continues the same task truthfully
```

Never pretend restarting an engine ≡ native engine-session resume.

---

## S4.1 — ACCEPTED / FROZEN

Gateway SIGKILL → reclaim → `task.resume` same taskId.  
Evidence: `g10-evidence/s4/s41-live-interrupt.json`. **Do not ask operators to reproduce.**

---

## S4.2 — Engine / process interruption (this slice)

**Why:** S4.1 fixed Gateway death. Engines could still die while Gateway stayed up — bridge exit hung until wall-clock, mid-turn facts lagged, PIDs/leases could be trusted stale, and interrupt was not an honest disposition.

### Gaps found

| Gap | Detail |
| --- | --- |
| AG bridge close | Logged only; no terminal event → session hung on wall budget |
| Mid-turn lag | Session ids / in-flight turn not durable until turn end |
| Process registry | RAM-only; bare pid kill could hit reused PIDs |
| Leases | owner.json pid-only; reused PID could hold lock until staleMs |
| Report write | Non-atomic truncate risk |
| Engine death | Not marked `interrupted`; often collapsed to FAILED |

### Engine recovery matrix (honest)

| Engine | Native after process death | PATH recovery |
| --- | --- | --- |
| **Antigravity** | Only while bridge live (`continueNative`) | Rehydrate from PATH reality (`REHYDRATED_SESSION`) |
| **Copilot** | `resumeSession` attempted if session id durable | Create / CLI fallback — not labeled native when `resumed:false` |
| **Cursor** | `Agent.resume` attempted if agent id durable | `Agent.create` fallback — not labeled native when `resumed:false` |

### Process / lease reconciliation

- `process-identity.mjs` — pid + startKey (`ps` lstart / linux starttime)
- Lock `owner.json` stores startKey; mismatch ⇒ stale (PID reuse safe)
- `cancelTaskProcesses` only signals bare PIDs that still match identity
- Durable `{taskId}.processes.json` sidecar + `reconcileTaskProcesses`
- Bridge register writes sidecar; death → ended/stale

### Checkpoint / atomicity

- `beginEngineTurn(engine)` → `latestEngineTurn: in_flight:…` before turns
- `noteEngineInterrupted` / AG `BRIDGE_EXIT` → `continuityDisposition=interrupted` without FAILED finalState
- `clearTaskInterrupted` / `noteContinuityRestored` after successful reconstruct (native vs rehydrate labeled honestly)
- Engineering report: temp + rename

### Delivered

- Bridge unexpected close → `failed` + `interrupted` terminal (no hang)
- Session `INTERRUPTED` disposition; same `taskId` remains resumable
- Fabric begin/interrupt/restore hooks for Cursor/Copilot/AG turns
- Process identity + durable sidecar + lock reclaim
- Atomic report writes
- Mechanical + live engine-kill evidence

---

## Status board

| Lane | Status |
| --- | --- |
| **S4.1** | ACCEPTED / FROZEN |
| **S4.2 IMPLEMENTED** | Engine death detection + process/lease reconcile + mid-turn heartbeat |
| **MECHANICALLY TESTED** | `tests/s4/continuity.test.ts` + `tests/s4/engine-process-durability.test.ts` |
| **LIVE-VERIFIED** | `run-s42-live-engine-interrupt.mjs` — kill registered engine child, Gateway up → interrupted → resume same taskId |
| **REMAINING S4** | Full Mac reboot product UX; polished interrupted-task reopen choices; guaranteeing provider cloud resume after reboot; optional register of Copilot CLI children |

---

## Evidence

- S4.1: `g10-evidence/s4/s41-live-interrupt.json`
- S4.2: `g10-evidence/s4/s42-live-engine-interrupt.json`, `s42-focused-tests.txt`

---

## Out of scope (later S4 / later stages)

- Full machine-reboot operator experience
- PATH Build / Studio
- Second persistence DB beside G10 checkpoints
