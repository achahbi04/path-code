# PATH CODE — AG3 PRODUCT SHELL + LIVING TUI

**Result: PASS**

**Frozen as:** PATH CODE — AG3 PRODUCT SHELL BASELINE  
**Accepted implementation HEAD:** `a9224956314cf944f3f8fb27503f780cf41778b7`  
**Baseline:** PATH CODE ALPHA — BASELINE 1 (`da2d0d8fd519970624d5955f0954ea0492ef5c4c`)

## Live acceptance (ONLY `pathcode`)

| Field | Value |
| --- | --- |
| Normal command | `pathcode` → `~/.local/bin/pathcode` → this worktree |
| Live repository | `/tmp/ag3-pathcode-accept-uiiM` |
| Task 1 | Change `add` to subtract + update tests → **VERIFIED** `path/task-48f4f3d6-…` @ `6b9fa5c…` |
| Task 2 | Add `multiply` + test (same session) → **VERIFIED** `path/task-e2393d45-…` @ `6d20bd5…` |
| Primary HEAD | unchanged `17d9461…` on `main` |
| Cancel proof | `/tmp/ag3-cancel2-*` → `○ Cancelled`, alt-screen exit, prompt returned, no crash |

## Three roots

| Root | Path |
| --- | --- |
| Package | this PATH checkout (from `import.meta.url`) |
| Runtime | `~/.path-code/runtime/v0.1.0` |
| Project | ordinary disposable Git repo outside PATH |

## Mandate proofs

| Gate | Result |
| --- | --- |
| Startup | Quiet identity; no provider branding |
| Wide / narrow TUI | Framed PROJECT \| PATH \| EVIDENCE (compact stacked when narrow) |
| Alternate screen | `?1049h` enter / `?1049l` exit per task |
| Terminal restoration | Cursor + alt + SGR on exit/cancel/signals |
| Render stability | Event-driven + coalesced alt-screen updates |
| Command / file activity | Live Inspecting → Implementing → Correcting → Testing → Verifying |
| Interactive-command protection | `INTERACTIVE_COMMAND_BLOCKED` + `GIT_TERMINAL_PROMPT=0` |
| Independent validation | PATH typecheck + tests arbiter |
| Cancellation | Ctrl-C → Cancelled; REPL continues |
| Non-TTY | Plain project identity stream |
| Second task | Same `pathcode` session |
| Worktree cleanup | Primary worktree only after tasks |
| Primary untouched | yes |

## Operator command

```bash
cd <ordinary-git-project>
pathcode
```
