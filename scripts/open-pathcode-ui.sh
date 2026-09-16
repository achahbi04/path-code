#!/usr/bin/env bash
# Open the PATH Code living UI from THIS worktree (not an old npm global install).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "PATH Code UI — worktree launch"
echo "  root: $ROOT"
echo ""

if [[ ! -f "$ROOT/scripts/pathcode.mjs" ]]; then
  echo "error: scripts/pathcode.mjs missing" >&2
  exit 1
fi

# Prefer worktree node entry — never the stale global `pathcode` unless PATHCODE_USE_GLOBAL=1
ENTRY=(node "$ROOT/scripts/pathcode.mjs")
if [[ "${PATHCODE_USE_GLOBAL:-}" == "1" ]] && command -v pathcode >/dev/null 2>&1; then
  ENTRY=(pathcode)
  echo "warning: using global pathcode from PATH"
fi

# Real TTY required for the living canvas
if [[ ! -t 0 || ! -t 1 ]]; then
  echo "error: open this in Terminal.app / iTerm (interactive TTY required)" >&2
  echo "  Example:  open -a Terminal \"$ROOT/scripts/open-pathcode-ui.sh\"" >&2
  exit 1
fi

export PATHCODE_GATEWAY_EXTERNAL="${PATHCODE_GATEWAY_EXTERNAL:-0}"
# Ensure color brand renders
unset NO_COLOR || true
export FORCE_COLOR="${FORCE_COLOR:-1}"

echo "Launching living UI…"
echo "  After the splash you should see:"
echo "    PATH ● Code"
echo "    Ready for engineering"
echo "    >  (type a task and press Enter)"
echo ""
echo "  Quit with /exit"
echo ""

exec "${ENTRY[@]}" "$@"
