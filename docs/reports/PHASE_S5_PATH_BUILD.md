# PATH CODE — S5
# PATH BUILD (fresh-user browser flow repair)

**S5 NOT FROZEN**  
**OPERATOR ACCEPTANCE:** **IN REPAIR** — prior PASS revoked after real browser Build button failure

| Defect | Root cause |
| --- | --- |
| Build → Starting… → Build, no activity | Fresh empty Build treated browser evidence as stale (`pendingRuntimeRefresh`), so tick never dispatched the first engineer |
| Open in PATH Code | Spawned `node pathcode.mjs` detached with `stdio: ignore` — invisible, no TTY, exits immediately |

**Product entry:** `node scripts/path-build.mjs`

**Fresh browser acceptance:** `node scripts/pathcode-cli/build/run-s5-real-browser-acceptance.mjs`
