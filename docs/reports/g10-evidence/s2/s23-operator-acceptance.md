# S2.3 Installed-product operator acceptance

Use a real project (Klarapp). Confirm the installed product — not the PATH worktree symlink.

## INSTALL
1. From PATH checkout: `npm run build && npm pack`
2. Install the tarball into a clean prefix (or user global):
   `npm install -g ./path-code-1.0.1.tgz --prefix "$HOME/.local/pathcode-s23"`
3. Put `$HOME/.local/pathcode-s23/bin` first on PATH (ahead of any worktree symlink).
4. `which pathcode` → …/node_modules/path-code/scripts/pathcode.mjs
5. `pathcode --version` → PATH * Code 1.0.1
6. `pathcode doctor` → Install row shows the package root under node_modules (not the worktree)

## START
7. `cd /Users/achahbi/Projects/Klarapp && pathcode`
8. Living PATH Code surface opens; project shows Klarapp / branch context
9. Confirm Terminal.app title stays on the PATH/Klarapp title (installed path reclaim after Copilot SDK/CLI turns)

## ENGINEERING
10. Run one small real task (read-only is fine), e.g. assess README + package.json
11. Confirm report/result appears; primary checkout untouched
12. Confirm task worktree git is healthy (no dangling `.git` gitdir; `git -C <task-worktree> status` works)
13. Read-only assessments with no validation candidates should finish `VERIFIED`

## REOPEN
14. `/exit`
15. `pathcode` again from Klarapp
16. `/history` shows the task; `/report <id>` opens it; `/prefs` still reflects saved model/autonomy

## RESULT LIFECYCLE
17. `/inspect <id>` shows disposition/lifecycle
18. Do not re-run destructive merge/discard/PR unless a regression appears (S2.2 already accepted)

## HELP
19. `/help` lists history/report/inspect/merge/discard/pr/prefs/model/autonomy/attach/exit

## PARITY
20. No prompt to use the PATH development checkout; doctor Install ≠ worktree

Evidence from automated proof: docs/reports/g10-evidence/s2/s23-installed-product-proof.json  
Also: `s23-title-installed.txt` (title), proof `worktreeGit` / live `VERIFIED`.
