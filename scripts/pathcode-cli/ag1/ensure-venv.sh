#!/usr/bin/env bash
# Bootstrap the user-owned AG1 virtualenv under PATH_RUNTIME_ROOT.
# Prefer: node -e "import('./scripts/pathcode-cli/ag1/runtime-bootstrap.mjs').then(m => m.ensureAg1Runtime())"
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
VERSION="$(node -p "JSON.parse(require('fs').readFileSync('$ROOT/package.json','utf8')).version")"
RUNTIME="${PATHCODE_RUNTIME_ROOT:-$HOME/.path-code/runtime/v$VERSION}"
VENV="$RUNTIME/ag1-venv"
REQ="$ROOT/scripts/pathcode-cli/ag1/python/requirements.txt"
mkdir -p "$RUNTIME"
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
node --input-type=module -e "
import { writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
const runtime = process.env.PATHCODE_RUNTIME_ROOT || '$RUNTIME';
const marker = join(runtime, 'runtime.marker.json');
const tmp = marker + '.tmp';
const body = JSON.stringify({
  pathVersion: '$VERSION',
  sdkPin: 'google-antigravity==0.1.16',
  venv: join(runtime, 'ag1-venv'),
}, null, 2) + '\n';
writeFileSync(tmp, body);
renameSync(tmp, marker);
console.log('marker', marker);
"
