#!/usr/bin/env bash
# Bootstrap the project-owned AG1 virtualenv (never mutates global Python).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VENV="$ROOT/.path-code-tmp/ag1-venv"
REQ="$ROOT/scripts/pathcode-cli/ag1/python/requirements.txt"
mkdir -p "$ROOT/.path-code-tmp"
if [[ ! -x "$VENV/bin/python" && ! -x "$VENV/Scripts/python.exe" ]]; then
  python3 -m venv "$VENV"
fi
PY="$VENV/bin/python"
if [[ ! -x "$PY" ]]; then
  PY="$VENV/Scripts/python.exe"
fi
"$PY" -m pip install --upgrade pip
"$PY" -m pip install -r "$REQ"
"$PY" -c "import google.antigravity; import importlib.metadata as m; print('OK', m.version('google-antigravity'))"
