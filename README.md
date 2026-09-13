# PATH Code 1.0

PATH Code is local autonomous software engineering for a Git project.

You describe a change. PATH engineers in an isolated task workspace, independently validates the result, and leaves your primary checkout untouched. Verified work is handed off on a `path/task-*` branch for you to merge when ready.

## Supported environment (V1)

| Requirement | V1 |
| --- | --- |
| Platform | macOS Apple Silicon (`darwin` / `arm64`) |
| Node.js | 22+ |
| Git | required |
| Engineering auth | Google Vertex Application Default Credentials |
| GitHub CLI (`gh`) | optional; required only for `pathcode --issue` |

## Install

```bash
npm install -g path-code
# or from a release tarball:
# npm install -g ./path-code-1.0.1.tgz
```

Verify:

```bash
pathcode --version   # PATH ● Code 1.0.1
pathcode doctor
```

First run creates a private runtime under `~/.path-code/runtime/v1.0.1/`
(engine venv, diagnostics, disposable task worktrees). Override with
`PATHCODE_RUNTIME_ROOT` if needed.

## Commands

| Command | Purpose |
| --- | --- |
| `pathcode` | Living engineering session in the current Git project |
| `pathcode --issue <n>` | Load GitHub issue `#n`, engineer, verify, then offer push + PR |
| `pathcode doctor` | Readiness (install, platform, Node, Git, runtime, auth; GitHub optional) |
| `pathcode --help` | Help |
| `pathcode --version` | Version |

## First engineering run

```bash
cd your-git-project
pathcode
```

At the prompt, describe an engineering task. PATH:

1. Creates an isolated task branch and worktree
2. Runs bounded autonomous engineering
3. Independently validates using project-defined checks
4. Leaves the primary checkout untouched

Adopt verified work when you choose:

```bash
git merge path/task-<id>
```

## GitHub issues → pull requests

```bash
cd your-github-backed-project
pathcode --issue 42
```

After local **VERIFIED**, PATH asks once to publish. Approve with `y` to push the exact verified branch and open a PR with PATH-owned evidence. Decline leaves remotes unchanged.

If GitHub CLI is not authenticated: `gh auth login`. Local engineering works without GitHub.

## Engineering authentication

PATH uses Google Vertex ADC for engineering. Typical setup:

```bash
gcloud auth application-default login
export GOOGLE_CLOUD_PROJECT=<your-project>
```

`pathcode doctor` reports whether engineering auth appears present. PATH does not store Google credentials.

## Task isolation model

- **Package root** — installed PATH assets (relocatable)
- **Runtime root** — private venv, diagnostics, task worktrees
- **Project root** — your Git repository (`git rev-parse --show-toplevel`)

Launching from a monorepo package subdirectory keeps Git operations at the repository root and starts engineering/validation in that subdirectory.

## Validation honesty

PATH never invents a **VERIFIED** result. Classifications:

- **VERIFIED** — configured checks passed
- **PARTIALLY VERIFIED** — mixed results
- **FAILED** — configured checks failed
- **NOT VERIFIED** — no admissible validation, or cancelled

## Cancellation and recovery

Cancel with Ctrl-C. PATH restores the terminal and cleans disposable PATH-owned worktrees when safe. Stale PATH-owned task worktrees are recovered on next launch without pruning unrelated user worktrees.

## Troubleshooting

```bash
pathcode doctor
```

Common cases:

- Unsupported platform/Node → upgrade or use a supported machine
- Not a Git repo → `cd` into the project
- Dirty tree / detached HEAD → clean up Git state first
- Engineering auth → configure Vertex ADC as above
- GitHub (optional) → `gh auth login`

## What V1 does not include

Multi-engine routing, cloud workstation execution, automatic PR merge, and collaborative studio features are out of scope for 1.0.
