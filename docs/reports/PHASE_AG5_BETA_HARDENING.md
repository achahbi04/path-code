# PATH CODE — AG5 BETA / REAL-WORLD HARDENING

**Result: PASS (candidate freeze)**

**Branch:** `cursor/pathcode-antigravity-v1`  
**Parent baseline:** AG4 `1ce454c0ad4a9bd8dd2f144e4bba3aa8b8746104`

## Package / install

| Item | Evidence |
| --- | --- |
| Artifact | `npm pack` → `path-code-0.1.0.tgz` (scripts + dist) |
| Clean install | `/tmp/ag5-pathcode-prefix-final` |
| Symlink bin | `…/bin/pathcode` → `…/lib/node_modules/path-code/scripts/pathcode.mjs` |
| Package root | `/private/tmp/ag5-pathcode-prefix-final/lib/node_modules/path-code` (not source worktree) |
| First-run bootstrap | `ensureAg1Runtime` → `/tmp/ag5-bootstrap-proof-*/ag1-venv` OK |
| Startup | `--version` ~0.10s cold/warm |

## Live acceptance matrix

| ID | Case | Result | Notes |
| --- | --- | --- | --- |
| R1 | JS/TS | **PASS** | `/tmp/ag5-accept-live/r1-js` multiply task → VERIFIED; branch `path/task-9ccd8983-…`; commit `f056cdc1…`; primary untouched |
| R2 | Python | **PASS** | `/tmp/ag5-accept-live/r2-py` → VERIFIED via `.venv` pytest; commit `3da5f854…`; primary untouched |
| R3 | Go | **PASS** | `/tmp/ag5-accept-live/r3-go` → VERIFIED `go test`; commit `8e5d07cb…`; primary untouched |
| R4 | Monorepo | **PASS** | launch subdir `packages/auth-service`; engineeringCwd correct; VERIFIED; primary untouched |
| R5 | GitHub | **PASS** | `achahbi04/pathcode-ag5-accept-8521` issue#1 context (fallback task) → VERIFIED → PR **#2** https://github.com/achahbi04/pathcode-ag5-accept-8521/pull/2 |
| R6 | Long session | **PASS** | T1 VERIFIED → T2 VERIFIED → T3 PARTIALLY_VERIFIED (no baseline advance) → T4 VERIFIED; 0 leftover worktrees |
| R7 | Installed package | **PASS** | clean prefix install; doctor; package root under prefix |

Spaces path: `/tmp/ag5 accept spaces/repo` doctor OK.

## Failure cases

| ID | Result |
| --- | --- |
| F1 Dirty primary | `DIRTY_PRIMARY_TREE` |
| F2 Detached HEAD | `DETACHED_HEAD_BLOCKED` |
| F3 Engineering auth | Concise auth-required message |
| F4 Engine/validation independence | finished alone → `NOT_VERIFIED`; failed checks → `FAILED` |
| F5 Interactive command | `INTERACTIVE_COMMAND_BLOCKED` |
| F6 Validation failure | R6 T3 `PARTIALLY_VERIFIED`, no session advance |
| F7 Cancellation | AbortSignal wired; AG2 cancel cleanup retained (live abort exercised in prior AG2 proofs) |
| F8 Orphan recovery | PATH stale cleaned; user worktree preserved |
| F9 GitHub auth failure | `GITHUB_AUTH_REQUIRED` / `gh auth login` |
| F10 Publication decline | declined; not published; local VERIFIED retained |

## Portability (§33)

- A Symlink-safe `PATH_PACKAGE_ROOT` — proven via clean install
- B Python env scrub — CRED + bridge limited_env
- C Monorepo subdir — R4 live
- D PATH-owned orphan recovery — F8 + tests

## Resources

- R6 leftover task dirs: **0**
- Worktree list after R6: primary only
- Credential isolation: GH/GITHUB/SSH/VIRTUAL_ENV/PYTHONPATH stripped from bridge env

## Canonical validation

Focused: AG3+AG4+AG5 proofs green (37). Full `npm run check` recorded at freeze.
