# PATH CODE — S1 LIVE ENGINEERING SURFACE

**S1 RESULT:** FROZEN / OPERATOR ACCEPTED  
**Freeze tip:** `eac5f8620fea8c75070cd27421643bb167864294`  
**Deeper S2 productization:** **FROZEN / OPERATOR ACCEPTED** — see [`PHASE_S2_PRODUCTIZATION.md`](./PHASE_S2_PRODUCTIZATION.md)

**S1 Gateway:** FROZEN / ACCEPTED — tip `9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe`  
**S1 live experience:** FROZEN / OPERATOR ACCEPTED (Klarapp Phase D accepted; two bounded freeze repairs closed)

**Phase A report contract:** ACCEPTED  
**Phase B (one engineer feel):** ACCEPTED  
**Phase C (splash):** ACCEPTED (further visual refinement may move forward later)  
**Phase D (Klarapp operator run):** ACCEPTED subject to freeze repairs below  

---

## Freeze repairs (bounded)

### 1. Terminal.app title stays `<project> — PATH Code`
Root cause: Terminal.app appends the tty **foreground** process name/argv when that preference is enabled; OSC/watchdog alone cannot clear a child that stole the foreground (copilot / python / TMPDIR=…). Mirroring the product string into `process.title` also duplicated the title.

Fix: OSC window title only; inert `process.title` (`U+200B`); `tcsetpgrp` reclaim of tty foreground; stream OSC strip; 200ms reclaim+reassert watchdog.

### 2. Read-only assessments do not commit setup-only churn
Root cause: dependency prepare in the isolated task worktree mutated lockfiles (`devOptional` → `dev`); finalization treated that as the engineering result and created a task commit.

Fix: before `collectWorktreeResult` / commit, `restoreIncidentalSetupChurn` restores known setup-only files when the objective is read-only/assessment and **only** incidental paths are dirty. Explicit dependency-upgrade objectives skip restore.

Proof: `node docs/reports/g10-evidence/live-experience/run-s1-freeze-repair-proof.mjs`  
Vitest: `tests/s1/freeze-repair.test.ts`

---

## Accepted and CLOSED (do not reopen)

- real engineering capability; coherent live PATH surface
- real reads / commands / code / diffs / checks
- PATH-owned history / scrolling; heartbeat; Stop / cancellation
- canonical engineering report; `/report` copy; durable report file
- truthful completion; timing telemetry; ANSI/source rendering
- non-Git / dirty / detached handling; Gateway architecture
- steering path sufficient for S1; splash accepted for now

---

## Phase A — dedicated engineering completion report (accepted)

One authoritative report for canvas finish, `/report`, durable file, post-`/exit`.

Proof: `node docs/reports/g10-evidence/live-experience/run-phase-a-report-proof.mjs`

---

## Phase B — PATH feels like one intelligent engineer

Carried through real engine → Gateway → streamHistory → PATH Code (accepted via Phase D).

Proof: `node docs/reports/g10-evidence/live-experience/run-phase-b-c-proof.mjs`

---

## Phase C — splash (accepted for now)

- Centered `PATH  ●  Code` (~2s), stronger letter-spacing presence
- Compact `PATH ● Code` remains on the live canvas

---

## Phase D — Klarapp operator acceptance

**ACCEPTED.** Further S1 operator runs are not required.

Procedure used (historical):

```bash
cd /Users/achahbi/Downloads/Klarapp
export PATHCODE_RUNTIME_ROOT="$HOME/.path-code/runtime-klar-s1-d"
node …/scripts/pathcode.mjs
```

---

## Status

| Phase | Status |
|---|---|
| **A** | Accepted |
| **B** | Accepted |
| **C** | Accepted |
| **D** | Accepted |
| **Freeze repairs** | Closed |
| **S1** | **FROZEN / OPERATOR ACCEPTED** |
| **S2** | **FROZEN / OPERATOR ACCEPTED** — see PHASE_S2_PRODUCTIZATION.md |
