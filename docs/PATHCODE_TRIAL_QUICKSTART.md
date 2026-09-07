# PATH ● Code — Trial 1 Quickstart

One-time local install and launch for the operator. No registry install, no sudo, no shell-rc edits by the installer.

## Prerequisites

- This worktree built (`npm run build` already done after a normal check)
- macOS or Linux
- Interactive Terminal (real TTY)
- OpenAI credential available privately (env `OPENAI_API_KEY` or hidden prompt)
- Model id: pass `--model <id>`, or set `PATHCODE_OPENAI_MODEL`, or answer the prompt  
  Previously operator-tested selection: `gpt-5.6-terra` (not a hidden default)

## One-time user-local link

From this checkout:

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core
node scripts/install-pathcode-local.mjs --install
```

Read-only check:

```bash
node scripts/install-pathcode-local.mjs --check
```

This creates only `~/.local/bin/pathcode` → this worktree’s `scripts/pathcode.mjs`.  
It does **not** edit `.zshrc` / `.zprofile` / PATH persistently.

If the installer says `~/.local/bin` is not on PATH, for **this shell only**:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

Persistent PATH editing remains your separate choice.

## Launch

```bash
pathcode
```

Or without the link:

```bash
node /Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core/scripts/pathcode.mjs
```

Optional model flag:

```bash
pathcode --model gpt-5.6-terra
```

## Trial flow (what you type)

1. Offline welcome appears (no key, no network, no project scan).
2. `/trial`
3. Read the disclosure; type exactly `START <challenge>` shown on screen (empty / no / EOF cancels — no network).
4. After fixture + policy checks, supply the key via `OPENAI_API_KEY` or the hidden prompt.
5. Review the exact before/after edit; type exactly `APPLY <challenge>` to authorize that review only.
6. Review the exact TYPECHECK + TARGETED_TEST plan; type exactly `CHECK <challenge>` to authorize that plan only.
7. Read the truthful report. Trial files stay under the printed temp path (no Git commit, no auto-rollback).

Exit without approving: `/exit`, EOF, or decline any challenge.

## Safety notes

- No `--yes`, `--auto-approve`, `--workspace`, or CLI key flags.
- Live trial requires a real interactive TTY.
- Account charges may occur; local token/byte limits are not a dollar ceiling.
- Model-written code runs with ordinary OS permissions (not a security sandbox).
