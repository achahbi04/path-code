# PATH CODE — S4
# DURABLE CONTINUITY & RECOVERY

**S4 RESULT:** **S4.1 LIVE-VERIFIED** (first slice — ready for continued S4 work)  
**S3 stage freeze (do not reopen):** `89eea9992c1bb30763413aa0054d93481c65fcb2`  
**S4.1 checkpoint tip:** `3bea879358a2598a41c6632ecb530da446f1c936`

**Prior stage:** S3 Unified Engine Fabric — **FROZEN / STAGE COMPLETE** (no S3.3)

**PATH Build / PATH Studio:** later stages

---

## Purpose

Make PATH Code durable across interruption:

```
start real engineering
    ↓
PATH / Gateway / engine / terminal interrupted
    ↓
start PATH again
    ↓
PATH understands durable task state
    ↓
recover / reconnect / resume where genuinely supported
    ↓
otherwise continue safely from preserved engineering reality
    ↓
one coherent task history and result
```

Truthful dispositions only:

| Disposition | Meaning |
| --- | --- |
| `still_running` | Gateway Map still owns a live task |
| `reconnectable` | same — `/attach` |
| `resumable` | incomplete CP + worktree + engine session ids present |
| `interrupted` | durable state marked after Gateway/process loss |
| `recoverable_from_durable_state` | CP + worktree; no native session claim |
| `completed` / `failed` / `abandoned` | terminal |

Never pretend restarting an engine ≡ native session resume.

---

## Gaps discovered (pre-S4.1 audit)

**Already durable:** G10 checkpoints, worktrees/branches, reports, history, collab journal, engine session ids on checkpoint, lockdirs with pid-stale reclaim.

**Process-local only:** Gateway task Map, project bind, process-registry PIDs, live SDK/bridge handles, event bus.

**Stale risk:** Gateway pid/socket files not cleared on crash; `/attach` only for live Map; library `resumeTaskId` existed but was not product-wired.

---

## S4.1 — First slice (chosen)

**Gateway interrupt → restart recovery via existing checkpoint + worktree reopen.**

**Why:** Continuity *data* already survived; ownership after Gateway death did not. Smallest coherent unlock is `task.resume` + disposition assessment + stale pid/socket reclaim — not a second persistence system.

### Delivered

- `assessTaskContinuity` / `formatContinuityBrief` (`ag10/task-continuity.mjs`)
- Checkpoint `continuityDisposition` / `interruptedAt` + `markTaskInterrupted`
- Gateway `task.resume` + `task.continuity`
- `reclaimStaleGatewayOwnership` on ensure; pid cleared on server stop; running tasks marked interrupted on stop
- CLI `/resume [id]` (distinct from `/attach`)
- Fake-engine early checkpoint + hold for kill tests
- Mechanical tests + live SIGKILL Gateway → reclaim → resume

### Durable state model (S4.1)

```
~/.path-code/runtime/v*/metadata/tasks/{taskId}.checkpoint.json
  + worktree / path/task-* branch
  + report / history / collab journal
  + continuityDisposition / interruptedAt (when interrupted)
Gateway Map (process-local ownership)
  ← reconstructed by task.resume from checkpoint
```

### Recovery behavior

1. Live Map running → reconnect (`/attach` or resume→reconnect)
2. Socket dead + pid dead → reclaim; mark incomplete CPs interrupted
3. `/resume` → bind project from CP → reopen worktree via `resumeTaskId` → fabric reconcile → engine `ensureConnected` when ids present (honest fallback to rehydrate/create)
4. VERIFIED/CANCELLED → not resumable (inspect)

### Engine-specific (honest)

| Engine | On resume after process loss |
| --- | --- |
| Antigravity | Usually rehydrate (native only while bridge live) |
| Copilot | `resumeSessionId` attempted; create/fallback if invalid |
| Cursor | `Agent.resume` attempted; create if invalid |

PATH task identity remains durable regardless.

---

## Status board

| Lane | Status |
| --- | --- |
| **IMPLEMENTED** | Continuity dispositions + Gateway resume + stale reclaim + `/resume` |
| **MECHANICALLY TESTED** | `tests/s4/continuity.test.ts` |
| **LIVE-VERIFIED** | `run-s41-live-interrupt.mjs` → SIGKILL Gateway mid-hold → resume same taskId |
| **REMAINING S4** | Real-engine native resume after kill; reboot story; process-registry orphans; mid-turn checkpoint lag; report atomicity; richer operator UX on reopen |

---

## Evidence

- [`g10-evidence/s4/s41-live-interrupt.json`](./g10-evidence/s4/s41-live-interrupt.json)
- `s41-live-interrupt-run.txt`, `s41-focused-tests.txt`

---

## Out of scope for S4.1 / later S4

- Guaranteeing provider-native conversation resume after reboot
- Persisting process-registry across reboot
- PATH Build / Studio
- Inventing a second journal/DB beside G10 checkpoints
