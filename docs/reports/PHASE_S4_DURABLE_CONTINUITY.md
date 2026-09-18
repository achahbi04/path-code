# PATH CODE — S4
# DURABLE CONTINUITY & RECOVERY

**S4 RESULT:** **S4.3 LIVE-VERIFIED** (autonomous host-restart sim) — **awaiting Mac reboot operator acceptance to FREEZE S4**  
**S3 stage freeze (do not reopen):** `89eea9992c1bb30763413aa0054d93481c65fcb2`  
**S4.1:** **ACCEPTED / FROZEN** — `3bea879358a2598a41c6632ecb530da446f1c936`  
**S4.2:** **ACCEPTED / FROZEN** — `e5757296e30e22f4aa0f51c07dce78c908653d59`  
**S4.3 checkpoint tip:** _(recorded at commit)_

**Prior stage:** S3 Unified Engine Fabric — **FROZEN / STAGE COMPLETE** (no S3.3)

**Next after S4 freeze:** PATH Build **S5** · PATH Studio **S6**

---

## Continuity state model (final)

| Disposition | Meaning | Operator next |
| --- | --- | --- |
| `still_running` | Gateway Map owns live task | `/attach` |
| `interrupted` | Host/process loss recorded; durable CP + worktree | `/resume` |
| `resumable` | Incomplete CP + worktree + engine session ids | `/resume` (native attempted) |
| `recoverable_from_durable_state` | Incomplete CP + worktree; no native session claim | `/resume` (PATH rehydrate) |
| `completed` / `failed` / `abandoned` | Terminal | `/inspect` |

PATH taskId is the durable identity. Engine processes/sessions may change.

---

## S4.3 — Host restart / reopen / recovery

### Startup reconciliation (`reconcileHostStartup`)

On every PATH open:

1. Reclaim stale Gateway pid/socket (`reclaimStaleGatewayOwnership`)
2. Reconcile `{taskId}.processes.json` against pid+startKey
3. Reconcile worktree/Git into checkpoint when reality drifted
4. `in_flight:*` with no surviving PATH-owned process → `interrupted`
5. Build project-scoped recoverable list + reopen notices

### Reopen experience

Product card (`formatReopenNotice`): objective, when interrupted, continuity state, last engine turn, worktree survival, native-vs-rehydrate honesty, `/resume` + `/inspect`.  
Bare `/resume` defaults when exactly one recoverable task exists.

### Mid-turn durability

`beginEngineTurn` now persists: `in_flight:engine`, `inFlightStartedAt`, `inFlightEngine`, headSha, diffFingerprint, changedFiles snapshot — enough to know what happened vs what may need re-validation after restart.

### Process ownership

Copilot CLI turns use async `spawn` + `registerProcess` (`copilot_cli`) with pid+startKey sidecar (same model as AG bridge).

### Engine continuity (unchanged honesty)

| Engine | Native after host restart | Otherwise |
| --- | --- | --- |
| Cursor | `Agent.resume` if session still valid | Create + PATH rehydrate |
| Copilot | `resumeSession` if valid | Create / CLI (not labeled native) |
| Antigravity | Only while bridge was live | `REHYDRATED_SESSION` from PATH reality |

### Autonomous proof

`run-s43-host-restart-sim.mjs` — in-flight CP → SIGKILL Gateway → `reconcileHostStartup` → reopen notice inputs → `task.resume` same taskId → completed. **LIVE-VERIFIED.**

### Mac reboot (operator only)

Procedure: [`g10-evidence/s4/s43-operator-acceptance.md`](./g10-evidence/s4/s43-operator-acceptance.md)

After PASS → **FREEZE S4**.

---

## Status board

| Lane | Status |
| --- | --- |
| **S4.1** | ACCEPTED / FROZEN |
| **S4.2** | ACCEPTED / FROZEN |
| **S4.3 IMPLEMENTED** | Host startup reconcile + reopen UX + Copilot ownership + mid-turn snapshot |
| **MECHANICAL** | `tests/s4` (12) |
| **LIVE (autonomous)** | `s43-host-restart-sim.json` **LIVE-VERIFIED** |
| **OPERATOR** | Mac reboot acceptance **PENDING** |

---

## Evidence

- S4.1 / S4.2 evidence under `g10-evidence/s4/` (frozen proofs — do not re-run for acceptance)
- S4.3: `s43-host-restart-sim.json`, `s43-focused-tests.txt`, `s43-operator-acceptance.md`
