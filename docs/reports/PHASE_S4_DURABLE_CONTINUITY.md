# PATH CODE — S4
# DURABLE CONTINUITY & RECOVERY

**S4 RESULT:** **IMPLEMENTATION FROZEN**  
**AUTONOMOUS / LIVE VERIFICATION:** **PASS**  
**PHYSICAL MAC REBOOT ACCEPTANCE:** **DEFERRED BY OPERATOR**

**S3 stage freeze (do not reopen):** `89eea9992c1bb30763413aa0054d93481c65fcb2`  
**S4.1:** **ACCEPTED / FROZEN** — `3bea879358a2598a41c6632ecb530da446f1c936`  
**S4.2:** **ACCEPTED / FROZEN** — `e5757296e30e22f4aa0f51c07dce78c908653d59`  
**S4.3 implementation:** `093a29aa963e8132a5d47598dcc9ac62b15609b5`  
**S4.3 tip:** `2d56b23ad922f6e1947c7f48d2059a389ac7badf`

**Prior stage:** S3 Unified Engine Fabric — **FROZEN / STAGE COMPLETE** (no S3.3)

**Next:** PATH Build **S5** — architecture audit only until implementation is authorized  
See [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)

---

## Freeze judgment

S4 implementation is **frozen** at the verified S4.3 checkpoint.

Cursor completed autonomous host-restart simulation and focused tests.  
The operator has deferred the physical Mac reboot acceptance because the machine is in active production use. That reboot procedure remains valid and will be run later.

**Do not claim a physical reboot occurred.**

| Gate | Status |
| --- | --- |
| S4.1 Gateway SIGKILL → reclaim → resume | **PASS / FROZEN** |
| S4.2 Engine/process interruption | **PASS / FROZEN** |
| S4.3 Host-restart reconciliation (sim) | **LIVE-VERIFIED / FROZEN** |
| Physical Mac reboot | **DEFERRED BY OPERATOR** |

---

## Continuity state model (final)

| Disposition | Meaning | Operator next |
| --- | --- | --- |
| `still_running` | Gateway Map owns live task | `/attach` |
| `interrupted` | Host/process loss recorded; durable CP + worktree | `/resume` |
| `resumable` | Incomplete CP + worktree + engine session ids | `/resume` (native attempted) |
| `recoverable_from_durable_state` | Incomplete CP + worktree; no native session claim | `/resume` (PATH rehydrate) |
| `completed` / `failed` / `abandoned` | Terminal | `/inspect` |

PATH taskId is the durable identity. Engine processes/sessions may come and go.

---

## S4.3 — Host restart / reopen / recovery (frozen)

### Startup reconciliation (`reconcileHostStartup`)

1. Reclaim stale Gateway pid/socket  
2. Reconcile `{taskId}.processes.json` against pid+startKey  
3. Reconcile worktree/Git into checkpoint when reality drifted  
4. Orphan `in_flight:*` → `interrupted`  
5. Project-scoped recoverable list + reopen notices  

### Reopen experience

`formatReopenNotice` + bare `/resume` when exactly one recoverable task exists.

### Mid-turn durability

`beginEngineTurn` persists in-flight engine, timestamps, headSha, diffFingerprint, changedFiles.

### Process ownership

Copilot CLI: async `spawn` + `registerProcess` with pid+startKey.

### Autonomous proof

`run-s43-host-restart-sim.mjs` → **LIVE-VERIFIED**  
(task continuity through Gateway SIGKILL → reconcile → resume → completed)

### Mac reboot (deferred)

Procedure: [`g10-evidence/s4/s43-operator-acceptance.md`](./g10-evidence/s4/s43-operator-acceptance.md)  
Run later; does not block S5 architecture work.

---

## Status board

| Lane | Status |
| --- | --- |
| **S4.1** | ACCEPTED / FROZEN |
| **S4.2** | ACCEPTED / FROZEN |
| **S4.3 implementation** | FROZEN at tip `2d56b23…` |
| **MECHANICAL** | `tests/s4` (12) PASS |
| **LIVE (autonomous)** | `s43-host-restart-sim.json` LIVE-VERIFIED |
| **OPERATOR reboot** | DEFERRED |

---

## Evidence

- S4.1 / S4.2 / S4.3 under `g10-evidence/s4/` (frozen proofs)
- S4.3: `s43-host-restart-sim.json`, `s43-focused-tests.txt`, `s43-operator-acceptance.md`
