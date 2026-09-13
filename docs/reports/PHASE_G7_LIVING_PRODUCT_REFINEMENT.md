# PATH CODE — G7 LIVING PRODUCT REFINEMENT

**Result:** PASS  
**Baseline:** PATH Code 1.0.1 · `5a1784d8f033251caf9c0c3be102c9eb2f0cd345`  
**Implementation commit:** `9170adf3a2c834ba9c11e4292700d44a2ed8315d`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after G7 commit (ahead of origin by G7)  
**Published releases:** UNCHANGED · Publication performed: NO

## Purpose

Refine the existing living TUI (PROJECT | PATH | EVIDENCE) so real engineering
is more informative and usable. No second intelligence layer, memory/indexing,
AST compiler, IPC, providers, GC1/Studio, or per-edit approval.

## Observed weaknesses (pre-G7)

Captured against the G7 candidate renderer before refinement
(`docs/reports/g7-evidence/before-mid-wide.txt`):

- PROJECT showed `(engineering…)` with weak primary vs task branch distinction
- PATH activity trail was label-only; current command/file detail was thin
- EVIDENCE mixed recovery noise with validation; engine testing was easy to
  confuse with independent final PATH validation
- Final handoff lacked a SHA-qualified full-result `git diff` command in-frame

## Implemented improvements

| Area | Change |
| --- | --- |
| PROJECT | Primary vs task branch rows; ≤5 changed files + `N of M shown`; stable sort |
| PATH | Current observable op + detail; bounded recent ops; no bridge exit noise |
| EVIDENCE | `Eng. checks` vs `Final validate`; failed validation cannot render Verified |
| Diff | `scripts/pathcode-cli/ag7/diff-preview.mjs` — max 5 files / 50 lines total |
| Inspect | Footer/`durableSummary`: `git diff --no-ext-diff --no-textconv <baseline> <result> --` |
| Guards | Presentation clock cannot advance phase; no fabricated %; no `stty sane` |

## Candidate vs public install

| | |
| --- | --- |
| **Candidate executable** | `<checkout>/scripts/pathcode.mjs` |
| **Package root** | this worktree (not global `path-code@1.0.1`) |
| **Exact open command** | `node scripts/pathcode.mjs` from the G7 checkout |

Do not confuse this candidate with the public npm `path-code@1.0.1` install.

## Live acceptance

Ordinary disposable Git repo outside the PATH source tree
(`/tmp/pathcode-g7-live2/repo`).

| Check | Result |
| --- | --- |
| Classification | **VERIFIED** |
| Event-driven activity | 62 real session events (tool/activity/validation) |
| Independent final validation | Typecheck ✓ · Tests ✓ · Final validate ✓ |
| Full-result inspect | Command retrieved multiply changes (`inspectOk: true`) |
| Primary checkout | Untouched (`main` HEAD unchanged, clean) |
| Second task | Follow-up VERIFIED; primary still untouched |
| Wide / narrow / tiny | Frames rendered at 140 / 80 / 60 columns |
| Cancellation + restore | Existing centralized restore exercised in focused proof C |

Evidence directory: `docs/reports/g7-evidence/`

- `before-*.txt` — pre-refinement frames (controlled)
- `after-*.txt` / `live-*-frame.txt` — post-refinement frames (controlled replay
  of the live task’s SHAs/events for presentation; labeled controlled)
- `live-result.json` / `live-events.json` / `live-inspect-out.txt` — **live**
  engineering loop artifacts

## Focused checks

`tests/g7/g7-proofs.test.ts` — A event truth · B failure truth · C terminal
restore helper · D large diff · E session handoff — PASS

## Canonical validation

`npm run check` — PASS (see freeze commit message / local log)

## Architecture lock (preserved)

Antigravity remains the engineering engine. PATH owns project/task/session,
worktree lifecycle, independent validation, durable Git result, optional GitHub
delivery. No fake telemetry; timers animate only while work is pending.
