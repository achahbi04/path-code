G7 Living Cockpit Completion — real PTY acceptance
==================================================

Executable: <checkout>/scripts/pathcode.mjs
Package:    G7 worktree (not public path-code@1.0.1)
Projects:   /tmp/pathcode-g7-cockpit2/repo
            /tmp/pathcode-g7-cockpit-color/repo

session-long-summary.json
  Idle cockpit in alt-screen → cancel stays in cockpit → second task VERIFIED
  with RESULT section + in-cockpit prompt → single ENTER_ALT → quit restores.
  Note: agent harness sets NO_COLOR/FORCE_COLOR=0; color proof is separate.

color-summary.json + color-session.typescript
  Same candidate with NO_COLOR cleared and FORCE_COLOR=1 (simulating a normal
  macOS Terminal). Proves real ESC SGR (cyan/green/dim) and ZERO literal \u001b.

Operator launch (external project only):
  cd /tmp/pathcode-g7-cockpit-color/repo && \
  PATHCODE_RUNTIME_ROOT=/tmp/pathcode-g7-cockpit-color/runtime \
    node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs

Published releases: UNCHANGED
