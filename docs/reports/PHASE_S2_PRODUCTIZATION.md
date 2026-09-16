# PATH CODE — S2
# REAL-PROJECT WORKFLOW PRODUCTIZATION

**S2 RESULT:** IN PROGRESS — packaging gate PASS; history/result/prefs MVP implemented; **operator acceptance pending** (Klarapp command clarity follow-up)  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294`

**Prior stage:** S1 Gateway Extract + Live Engineering Surface — **FROZEN / OPERATOR ACCEPTED**  
See [`PHASE_LIVE_ENGINEERING_SURFACE.md`](./PHASE_LIVE_ENGINEERING_SURFACE.md).

**S1 Gateway tip:** `9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe`

**MANUAL_UI_ACCEPTANCE:** S1 operator-accepted (Klarapp Phase D + two freeze repairs). **S2 Balanced MVP not frozen** — awaiting Klarapp retest of command panels.

**Published releases:** UNCHANGED  
**Publication performed:** NO

---

## Packaging gate (entry)

**RESULT:** PASS

Evidence: [`g10-evidence/s2/`](./g10-evidence/s2/)

| Step | Result |
|---|---|
| `npm run build` + `npm pack` | PASS (753 375 bytes, 1058 files) |
| `audit-release --tarball` | PASS |
| Required S1 modules in tarball (gateway, ag8–ag10, ag1 python, path-studio, dist) | PASS |
| `gc1` / `ensure-venv` absent (intentional) | PASS |
| Isolated `npm install -g` prefix | PASS — bin resolves under install prefix, not checkout |
| Installed `pathcode --version` / `doctor` | PASS |
| Runtime bootstrap from installed package | PASS (marker + venv under isolated runtime) |
| Gateway fake-engine bind/start/steer/cancel from installed modules | PASS |

Runner: `node docs/reports/g10-evidence/s2/run-packaging-gate.mjs` → `packaging-gate.json`

No packaging redesign was required. Cloud/`gc1` remains intentionally out of the npm distribution.

---

## Productization slice (bounded MVP)

### Durable task/session history
- Module: [`scripts/pathcode-cli/task-history.mjs`](../../scripts/pathcode-cli/task-history.mjs)
- Commands: `/history [n]`, `/report <taskId>` (reopen durable `.report.txt`)
- Operator panel: replies paint in-canvas under `PATH · command` (alt-screen safe)

### Result integration UX
- `/inspect [taskId]` — disposition / branch / commit / changed files / adoptable yes|no
- `/merge` / `/adopt` `[taskId]` — refused when no adoptable file changes; otherwise plan + confirm `y` before `git merge` into primary (dirty primary refused)

### Minimal preferences
- Module: [`scripts/pathcode-cli/preferences.mjs`](../../scripts/pathcode-cli/preferences.mjs)
- File: `{stateDir}/preferences.json` (`pathcode.prefs.v1`) — `modelId` + `autonomy` only
- `/model`, `/autonomy` persist with visible confirmation; `/prefs` shows values + source

### Explicitly out of this slice
- Studio / Build / Cursor engine
- Crash `/resume` productization
- Push/PR delivery
- Shipping `gc1` in the tarball

---

## Operator acceptance follow-up (Klarapp)

**Root causes (first acceptance):**
1. Living alt-screen collision guard suppressed most `prompt.write` command replies — operators saw little or nothing for `/history` `/inspect` `/prefs` `/merge`.
2. Copy was thin (branch/sha only) and placeholder ids like `<taskId>` were not explained.
3. `/merge` could offer a branch even for read-only / no-change results.
4. Post-result busy/heartbeat residue could still imply engineering was running.

**Fixes:** in-canvas `setOperatorPanel`; richer history/inspect/report/prefs panels; placeholder help; adoptable-change gate on merge; clear busy + `idle · complete` on result.

### Short retest (Klarapp, after a completed task)

1. Confirm footer shows **`idle · complete`** (not “running” / waiting spinner).
2. `/history` → panel lists taskId, project, outcome, when, asked, file-change hint.
3. Copy a real **taskId** (not the literal `<taskId>`).
4. `/report <taskId>` → durable report body opens in the command panel.
5. `/inspect <taskId>` → disposition, branch, commit, changed files, Adoptable yes/no.
6. `/prefs` → model + autonomy + file path visible.
7. `/model <id>` then `/autonomy bounded` → each confirms + “Survives PATH restart”; `/prefs` matches; restart PATH and `/prefs` again.
8. For a **read-only** task: `/merge <taskId>` → **Refused** (no primary change). For a task with file changes: `/merge <taskId>` → plan, then **N** cancels; only **y** merges.

Do **not** freeze S2 until this Klarapp pass is accepted.

---

## Verification

- Packaging gate: `packaging-gate.json` `ok: true`
- Focused: `tests/s2/history-prefs.test.ts`, `tests/s2/engineering-surface.test.ts`
- Canonical: `npm run check` (re-run after operator follow-up) — prior `g10-evidence/s2/canonical-check.txt` (160 files / 1441 tests)
