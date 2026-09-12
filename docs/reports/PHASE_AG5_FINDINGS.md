# PATH CODE — AG5 REAL HARDENING FINDINGS

Living record of material defects found while driving AG5.
Update in place; do not create per-finding passes.

| ID | Case | Observed failure | Root cause | Fix | Regression proof | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F-AG5-01 | R7 clean install | `npm pack` omitted CLI; bin pointed at missing `scripts/` | `package.json` `files: ["dist"]` only | Include `scripts/pathcode.mjs`, `scripts/pathcode-cli`, `scripts/path-studio` | `tests/ag5` packaging surface; `npm pack` listing | FIXED |
| F-AG5-02 | Symlinked global bin | Package root could follow symlink layout incorrectly | `PATH_PACKAGE_ROOT` used `path.resolve` without `realpathSync` | Realpath `import.meta.url` derivation | `tests/ag5` symlink-safe root | FIXED |
| F-AG5-03 | Installed package write | Task worktrees written under package tree | `createTaskWorktree` defaulted to `PATH_PACKAGE_ROOT/.path-code-tmp` | Default tasks parent → `PATH_RUNTIME_ROOT/ag1-tasks` | Worktree + orphan proofs | FIXED |
| F-AG5-04 | Python project contamination | Target commands could inherit PATH venv markers | Bridge env forwarded `PATH` containing `ag1-venv/bin`; `VIRTUAL_ENV` etc. | `sanitizeProjectCommandEnv` + bridge limited_env scrub | `tests/ag5` project env isolation | FIXED |
| F-AG5-05 | Monorepo subdir launch | `cwd` always collapsed to Git toplevel for engineering | No `workingSubdir`; bridge forced `Cwd` to workspace root | Record subdir; `defaultCwd` + validation root | `tests/ag5` monorepo subdir | FIXED |
| F-AG5-06 | Orphan recovery risk | `removeTaskWorktree` pruned all stale worktrees by default | Unconditional `git worktree prune` | Opt-in prune; PATH-owned recovery only | `tests/ag5` orphan recovery | FIXED |
| F-AG5-07 | Non-JS validation | Final validation required `package.json` | Discovery was npm/tsc only | Native metadata discovery (pytest/go/cargo/mvn/gradle) | `tests/ag5` native validation | FIXED |
| F-AG5-09 | R2 Python project | Validation missed project-local `.venv/bin/pytest` | `which pytest` only | Prefer project `.venv`/`venv` binaries before host PATH | native-validation local candidates | FIXED |
| F-AG5-10 | R3 Go validation | `go test` FAILED: GOCACHE/HOME undefined | Final validation env omitted `HOME` | Pass through HOME/USER/TMPDIR into validation child env | live R3 re-run | FIXED |
