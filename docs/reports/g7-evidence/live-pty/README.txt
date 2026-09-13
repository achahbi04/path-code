G7 live PTY evidence (actual running TUI — not reconstructed frames)
====================================================================

Location (canonical in repo):
  docs/reports/g7-evidence/live-pty/

Also retained on disk:
  /tmp/pathcode-g7-live-pty/capture/

Artifacts
---------
session.typescript     Timed PTY byte stream (I/O records) of the live session
session.log            Operator timeline (inputs, matches, frames)
summary.json           Pass/fail gates for resize/cancel/second-task/restore
sigterm-restore.json   Separate active-TUI SIGTERM lifecycle (exit 143 + restore)
frames/*.txt           ANSI-stripped snapshots taken from the live stream
drive_pty.py           Harness used to drive the PTY (evidence tool, not product)
meta.txt               Candidate executable + package root identity

Executable / package root used
------------------------------
Candidate:  <checkout>/scripts/pathcode.mjs
Package:    this G7 worktree (resolvePathPackageRoot = checkout)
Project:    /tmp/pathcode-g7-live-pty/repo  (OUTSIDE PATH source checkout)
Runtime:    /tmp/pathcode-g7-live-pty/runtime
NOT used:   public path-code@1.0.1 install under /tmp/pathcode-v101-public-verify/...

Operator launch command (external project only)
-----------------------------------------------
PATHCODE_RUNTIME_ROOT=/tmp/pathcode-g7-live-pty/runtime \
  node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs

Run that command with cwd = /tmp/pathcode-g7-live-pty/repo
(or recreate an ordinary disposable Git repo outside the PATH checkout).

Do not point the project cwd at the PATH source checkout.
Do not use the public npm installation for this demonstration.

Results (summary.json)
----------------------
promptSeen, altEntered, activitySeen, resizeOk: true
cancelRequested, promptAfterCancel, altExitedAfterCancel: true
secondTaskVerified, promptAfterSecond: true
exitAltOnQuit, showCursorOnQuit: true
primaryUntouched: true
childExitCode: 0
defects: []

SIGTERM (sigterm-restore.json)
------------------------------
Active alt-screen TUI + SIGTERM → exitAlt + showCursor emitted, exit code 143.

Published releases: UNCHANGED
Publication performed: NO
