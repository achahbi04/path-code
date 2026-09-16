# PATH CODE — LIVE ENGINEERING SURFACE

**RESULT:** PHASE B + C IMPLEMENTED — AWAITING PHASE D OPERATOR ACCEPTANCE  
**Deeper S2 productization:** NOT STARTED

**S1 Gateway:** FROZEN / ACCEPTED — tip `9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe`  
**S1 live experience:** OPEN until Phase D operator acceptance → then FREEZE S1

**Phase A report contract:** ACCEPTED (operator — sufficient to proceed)  
**Phase B (one engineer feel):** IMPLEMENTED — awaiting D  
**Phase C (splash):** IMPLEMENTED — awaiting D  

---

## Phase A — dedicated engineering completion report (accepted)

One authoritative report for canvas finish, `/report`, durable file, post-`/exit`.

Proof: `node docs/reports/g10-evidence/live-experience/run-phase-a-report-proof.mjs`

---

## Phase B — PATH feels like one intelligent engineer

Carried through real engine → Gateway → streamHistory → PATH Code:

- Provider names scrubbed from live titles/narration (Copilot / Antigravity do not dominate)
- User-facing engine prose surfaces as PATH narration
- Mid-task steering enters the real session; visible `Guidance queued` / `Applying…`
- Operator questions get a continue prompt that asks for substantive evidenced answers
- Quiet periods: sticky `Waiting for engineering result · Ns` + elapsed + last activity
- History scroll: PageUp/Down + wheel (incl. while composer has text); Jump to latest; no snap while reading
- ANSI: strip pre-colored CSI before syntax paint; full CSI-aware line fit (no `38;5;180m` residue)
- Title: `<project> — PATH Code` with faster reassert against child argv leakage

Carry (report, no new subsystem):

- No generic merge on assessment-like objectives
- Lockfile-only churn filtered from Changed on assessments
- Handoff Solid/Risk conclusions retained in discoveries

Proof: `node docs/reports/g10-evidence/live-experience/run-phase-b-c-proof.mjs`

---

## Phase C — splash (small visual finish)

- Centered `PATH  ●  Code` (~2s), stronger letter-spacing presence
- No DEC double-width, no subtitle, no “engineering gateway”
- Compact `PATH ● Code` remains on the live canvas

---

## Phase D — ONE real Terminal.app acceptance (operator decides)

**Do not self-accept. Mechanical proofs are not acceptance.**

### Exact procedure

```bash
cd /Users/achahbi/Downloads/Klarapp
export PATHCODE_RUNTIME_ROOT="$HOME/.path-code/runtime-klar-s1-d"
rm -rf "$PATHCODE_RUNTIME_ROOT"
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs
```

**Expected interactions**

1. Splash: centered PATH ● Code (~2s), then compact brand on row 0  
2. Title bar stays effectively: `Klarapp — PATH Code` (no copilot/TMPDIR/argv clutter)  
3. Submit a real engineering objective (inspect / tests+typecheck / solid+risk)  
4. Live story: narration + Read/Update/commands/outputs — not Copilot/Antigravity labels  
5. During provider wait: heartbeat with seconds + elapsed / last activity  
6. Mid-task: ask `What specifically did you find so far? Show me the files.`  
   → guidance queued/applying → substantive answer when the engine returns  
7. Scroll up (trackpad / PageUp) through real history while task runs; Jump to latest; no shell-buffer fall-through; no giant blank fake history  
8. Confirm no ANSI residue (`38;5;…m`) in source/diffs  
9. Stop remains immediate if tested  
10. Completion: automatic canonical report (Asked = objective; useful What PATH did / discoveries; truthful checks)  
11. `/report` → visible clipboard confirm + durable path; file matches  
12. `/exit` → same report contract in the normal buffer  

**Proof files (mechanical, not acceptance):**

- `docs/reports/g10-evidence/live-experience/phase-a-report-proof.json`
- `docs/reports/g10-evidence/live-experience/phase-b-c-proof.json`

If Phase D passes: **FREEZE S1 IMMEDIATELY** (commit tip SHA into this doc) → then begin S2 as a NEW stage.

Only genuine blockers from THIS run may trigger another S1 correction.

---

## Still open

| Phase | Status |
|---|---|
| **A** | Accepted |
| **B** | Implemented — needs D |
| **C** | Implemented — needs D |
| **D** | Operator acceptance |
| **S2** | NOT STARTED |
