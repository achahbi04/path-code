# PATH CODE — AG5 REAL HARDENING FINDINGS

Living record of material defects found while driving AG5.

| ID | Case | Observed failure | Root cause | Fix | Regression proof | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-AG5-01 | R7 clean install | `npm pack` omitted CLI | `files: ["dist"]` only | Ship `scripts/pathcode.mjs`, `pathcode-cli`, `path-studio` | packaging surface test | FIXED |
| F-AG5-02 | Symlinked global bin | Package root not realpath-safe | No `realpathSync` on package root | Realpath package derivation | symlink-safe root test | FIXED |
| F-AG5-03 | Installed package writes | Task worktrees under package tree | Default tasks parent = package root | `PATH_RUNTIME_ROOT/ag1-tasks` | worktree + orphan proofs | FIXED |
| F-AG5-04 | Python contamination | Target cmds inherit PATH venv | Bridge env leaked `VIRTUAL_ENV` / venv PATH | `sanitizeProjectCommandEnv` + bridge scrub | project env isolation test | FIXED |
| F-AG5-05 | Monorepo subdir | Engineering cwd collapsed to repo root | No workingSubdir / forced Cwd | Record subdir + `defaultCwd` | monorepo live R4 | FIXED |
| F-AG5-06 | Orphan recovery risk | Unconditional `git worktree prune` | Default prune on remove | Opt-in prune; PATH-owned recovery | orphan recovery test | FIXED |
| F-AG5-07 | Non-JS validation | Required `package.json` | npm/tsc-only discovery | Native metadata discovery | native validation tests | FIXED |
| F-AG5-08 | Support diagnosis | No concise readiness command | Missing surface | `pathcode doctor` | doctor test | FIXED |
| F-AG5-09 | R2 Python | Missed `.venv/bin/pytest` | `which pytest` only | Prefer project venv binaries | native-validation | FIXED |
| F-AG5-10 | R3 Go | `GOCACHE`/`HOME` undefined | Validation env omitted HOME | Pass HOME/USER/TMPDIR | live R3 | FIXED |
| F-AG5-11 | R2 no pytest | Correct change classified FAILED | Unconditional `python -m pytest` | Probe `import pytest` first | ag5 py-nopip test | FIXED |
| F-AG5-12 | Interrupted bootstrap | Runtime wedged forever without pip | Health = “python exists” | Rebuild when pip missing | runtime self-repair test | FIXED |
| F-AG5-13 | Unknown arg on install | “Restore dependencies in this checkout” | Legacy prereq gate | Product unknown-arg message | installed-prefix repro | FIXED |
| F-AG5-14 | Doctor ADC blind | Default gcloud ADC not detected | Only `GOOGLE_APPLICATION_CREDENTIALS` | Detect default ADC path | ADC detect test | FIXED |

Independent concurrent drive also confirmed R1–R4/R6/R7/spaces and F-matrix behaviors against an installed tarball.
