# PATH Code Beta — User Guide

Installable Beta candidate for PATH Code (Antigravity engineering + GitHub delivery).

## Install from package artifact

Build a local package (do **not** publish unless authorized):

```bash
cd path-code   # this repository
npm pack
# → path-code-0.1.0.tgz
```

Install into an isolated prefix:

```bash
PREFIX="$HOME/.local/pathcode-beta"
npm install -g --prefix "$PREFIX" ./path-code-0.1.0.tgz
export PATH="$PREFIX/bin:$PATH"
```

Verify:

```bash
pathcode --version
pathcode doctor
```

First run creates runtime state under `~/.path-code/runtime/v<version>/`
(venv, diagnostics, task worktrees). Override with `PATHCODE_RUNTIME_ROOT`.

You do **not** need developer scripts such as `ensure-venv.sh`.

## Commands

| Command | Purpose |
| --- | --- |
| `pathcode` | Open the living engineering session in the current Git project |
| `pathcode --issue <n>` | Load GitHub issue `#n`, engineer, verify, then offer push + PR |
| `pathcode --help` | Help |
| `pathcode --version` | Version |
| `pathcode doctor` | Concise readiness (install, runtime, Git, auth, optional GitHub) |

## First run

```bash
cd your-git-project
pathcode
```

At the prompt, describe an engineering task. PATH:

1. Creates an isolated task branch + worktree
2. Runs Antigravity engineering inside that workspace
3. Independently validates using project-defined checks
4. Leaves your primary checkout untouched

Verified work remains on a `path/task-<id>` branch for you to merge when ready.

## GitHub flow

```bash
cd your-github-backed-project
pathcode --issue 42
```

After local **VERIFIED**, PATH asks once to publish. Approve with `y` to push the exact verified branch and open a PR with PATH-owned evidence. Decline leaves remotes unchanged.

If `gh` is not authenticated, PATH points you to `gh auth login`. GitHub is optional for local engineering.

## Task isolation

- **PATH_PACKAGE_ROOT** — installed package assets (relocatable)
- **PATH_RUNTIME_ROOT** — venv, diagnostics, disposable task worktrees
- **TARGET_PROJECT_ROOT** — your Git repository (`git rev-parse --show-toplevel`)

Launching from a subdirectory (monorepo package) keeps Git operations at the repo root and starts engineering/validation in that subdirectory.

## Supported / unsupported

**Supported (Beta):** JS/TS (npm scripts + local tsc), Python (pytest when metadata present), Go (`go test`), Rust (`cargo test`), Java (Maven/Gradle when present), GitHub issue → PR via official `gh`.

**Unsupported in this Beta:** Codex/Claude/ACP multi-engine routing, automatic PR merge, PATH Studio product workflow, cloud GC1 as the default local path.

If a repo has no discoverable validation, PATH returns **NOT VERIFIED** or **PARTIALLY VERIFIED** — it will not invent a **VERIFIED** result.

## Troubleshooting

```bash
pathcode doctor
```

Common fixes:

- Not a Git repo → `cd` into the project
- Engineering auth → configure Google / Vertex credentials used by PATH
- GitHub → `gh auth login` (optional for local-only use)
- Runtime → re-run `pathcode`; bootstrap is automatic and lock-safe
