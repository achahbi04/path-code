# G8 toolchain discovery matrix (mandate §19)

Captured from disposable fixtures under `/tmp/pathcode-g8-polyglot/`.
Fields required by G8 §19: detected language/project metadata; package/build manager;
actual installed executable used; discovered validation commands; validation command source;
final execution result.

Captured at: 2026-09-13T21:51:49.518Z

## Host binary probe (not invented)

```json
{
  "node": "/opt/homebrew/bin/node",
  "npm": "/opt/homebrew/bin/npm",
  "python3": "/opt/homebrew/bin/python3",
  "go": "/opt/homebrew/bin/go",
  "make": "/usr/bin/make",
  "cc": "/usr/bin/cc",
  "cargo": null,
  "rustc": null,
  "mvn": null,
  "pytest": null,
  "copilot": null
}
```

## Per-family records

### typescript

| Field | Value |
| --- | --- |
| Detected language/project metadata | typescript:ready |
| Detected package/build manager | npm:ready (/opt/homebrew/bin/npm) |
| Actual installed executable used | npm=/opt/homebrew/bin/npm |
| Discovered validation commands | npm run <admitted-script> [hint/PACKAGE_JSON] \| npm run test [candidate/NPM_SCRIPT via validation-candidates.mjs] \| npm run typecheck [candidate/NPM_SCRIPT] (native-validation emitted no TS candidates — expected) |
| Validation command source | PACKAGE_JSON, NPM_SCRIPT |
| Final execution result | fixture npm test PASS (node --test); typecheck script discovered but host lacks project-local tsc binary — typecheck not executed as PASS |
| Language intelligence status | typescript:unavailable |

### python

| Field | Value |
| --- | --- |
| Detected language/project metadata | python:ready |
| Detected package/build manager | uv:ready (/opt/homebrew/bin/uv); pip:ready (/tmp/pathcode-g8-polyglot/python/.venv/bin/pip); pytest:ready (/tmp/pathcode-g8-polyglot/python/.venv/bin/pytest) |
| Actual installed executable used | uv=/opt/homebrew/bin/uv; pip=/tmp/pathcode-g8-polyglot/python/.venv/bin/pip; pytest=/tmp/pathcode-g8-polyglot/python/.venv/bin/pytest |
| Discovered validation commands | pytest [hint/PYTHON_PYTEST] | pytest [candidate/PYTHON_PYTEST; exe=/tmp/pathcode-g8-polyglot/python/.venv/bin/pytest] |
| Validation command source | PYTHON_PYTEST |
| Final execution result | fixture .venv pytest PASS (1 test) |
| Language intelligence status | python:unavailable |

### go

| Field | Value |
| --- | --- |
| Detected language/project metadata | go:ready |
| Detected package/build manager | go:ready (/opt/homebrew/bin/go) |
| Actual installed executable used | go=/opt/homebrew/bin/go |
| Discovered validation commands | go test ./... [hint/GO_TEST] | go test ./... [candidate/GO_TEST; exe=/opt/homebrew/bin/go] |
| Validation command source | GO_TEST |
| Final execution result | go test ./... PASS |
| Language intelligence status | go:unavailable |

### rust

| Field | Value |
| --- | --- |
| Detected language/project metadata | rust:ready |
| Detected package/build manager | cargo:unavailable |
| Actual installed executable used | (none ready) |
| Discovered validation commands | (none discovered) |
| Validation command source | (none) |
| Final execution result | NOT EXECUTED — cargo unavailable on host (metadata-only fixture) |
| Language intelligence status | rust:unavailable |

### cpp

| Field | Value |
| --- | --- |
| Detected language/project metadata | c_cpp:ready |
| Detected package/build manager | make:ready (/usr/bin/make); clangd:ready (/usr/bin/clangd) |
| Actual installed executable used | make=/usr/bin/make; clangd=/usr/bin/clangd |
| Discovered validation commands | make test [candidate/MAKE_TEST; exe=/usr/bin/make] |
| Validation command source | MAKE_TEST |
| Final execution result | make test PASS (compiled check_add) |
| Language intelligence status | c_cpp:ready |

### java

| Field | Value |
| --- | --- |
| Detected language/project metadata | java:ready |
| Detected package/build manager | mvn:unavailable |
| Actual installed executable used | (none ready) |
| Discovered validation commands | (none discovered) |
| Validation command source | (none) |
| Final execution result | NOT EXECUTED — mvn unavailable on host (metadata-only fixture) |
| Language intelligence status | java:unavailable |

## Honesty notes

- No inferred commands are claimed as project-defined when absent from discovery.
- Rust: `cargo` not on PATH → no cargo-check/cargo-test candidates emitted.
- Java: `mvn` not on PATH → no maven-test candidate emitted.
- TypeScript: native-validation does not invent `tsc`/`npm` runs; package scripts appear as capability hints / `validation-candidates.mjs` when admitted.
- Python: project-local `.venv/bin/pytest` discovered (not a global install).
