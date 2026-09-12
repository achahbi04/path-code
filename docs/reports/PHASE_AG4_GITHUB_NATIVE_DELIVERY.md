# PATH CODE — AG4 GITHUB NATIVE DELIVERY BASELINE

**Result: FROZEN**

**Frozen as:** PATH CODE — AG4 GITHUB NATIVE DELIVERY BASELINE  
**Baseline:** AG3 Product Shell (`dbaf98a5a07586c421f1a85b51df17d69a1b894c`)

## Live acceptance

| Field | Value |
| --- | --- |
| Live repository | `achahbi04/pathcode-ag4-accept-3116` (private disposable) |
| Local clone | `/tmp/ag4-pathcode-accept-AgC3` |
| Issue | `#2` — Add multiply(a, b) with a unit test |
| Issue-context size | 209 bytes (bounded) |
| Engineering | Antigravity autonomous loop (Inspecting → Implementing → Correcting → Testing) |
| Independent validation | Typecheck ✓ Tests ✓ → **VERIFIED** |
| Task branch | `path/task-4f1bea5c-7b3c-4f96-8417-39059607943b` |
| Commit | `b427aef0fa9f453c117ac311c29f488bc3871bbe` |
| Approval TUI | Living TUI one-shot `y` after listener armed |
| Pre-approval remote | only `main`; open PRs `[]` |
| Remote branch | pushed; commit matches VERIFIED SHA |
| Pull request | **PR #3** https://github.com/achahbi04/pathcode-ag4-accept-3116/pull/3 |
| PR evidence | PATH-owned body (Issue #2, files, Typecheck/Tests/Result VERIFIED, branch, SHA, Closes #2) |
| Decline proof | prior issue `#1` VERIFIED locally; approval offered; remote remained `main` only / no PR |
| Idempotency | re-publish → push skipped, existing PR #3 reused |
| Primary checkout | untouched at `0e4e7af…` on `main` |
| Normal local PATH | non-issue `pathcode` task VERIFIED; primary untouched |

## Accepted proofs

- official `gh` transport
- GitHub authentication
- deterministic remote resolution
- write-permission preflight
- GitHub credential isolation from Antigravity
- bounded issue ingestion
- autonomous Antigravity engineering + correction
- PATH independent validation
- one-shot publication approval
- decline path with zero remote mutation
- exact verified branch push + remote commit verification
- PR creation with PATH-owned evidence
- idempotent re-publication
- partial-delivery state
- normal local PATH regression
- primary checkout untouched

## Product surfaces

- Transport: official `gh` + structured JSON
- Auth / remote / WRITE preflight before approval
- Engine credential isolation (`GH_TOKEN`/`GITHUB_TOKEN`/`SSH_AUTH_SOCK` stripped; empty `GH_CONFIG_DIR`)
- Delivery in fresh TUI cycle after engineering teardown (stdin/raw-mode safe)

## Validation

- Focused: `tests/ag4/ag4-proofs.test.ts` 17/17
- Canonical: `npm run check` PASS — 141 files / 1329 tests

## Operator command

```bash
cd <github-backed-project>
pathcode --issue <number>
```
