# PHASE 5F — INSTALLED LAUNCHER CORRECTION

**Result: PASS**

**Success line:**  
`PHASE 5F INSTALLED LAUNCHER CORRECTION — SYMLINK-SENSITIVE DIRECT-ENTRY FIXED — CANONICAL OFFLINE — ZERO LIVE CALLS`

---

## 1. Exact state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Branch | `cursor/phase5f-live-trial-cli` |
| Expected / starting HEAD | `2bb73109193af8e99f2ab62c30725e37b24ae131` |
| Expected main | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Main unchanged | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Final SHA (this correction) | _(set after commit)_ |
| Platform | macOS (`darwin`), Node local |

Verified on entry: branch, HEAD, and main matched expectations. Installed symlink already pointed at this worktree:

```text
/Users/achahbi/.local/bin/pathcode
  -> /Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core/scripts/pathcode.mjs
```

No symlink reinstall was required.

---

## 2. Root cause

**Symlink-sensitive direct-entry detection was the cause: YES.**

Pre-fix gate in `scripts/pathcode.mjs`:

```js
const isDirect =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
```

### Proof

| Invocation | `process.argv[1]` | `import.meta.url` | Naive equal? | Outcome |
|---|---|---|---|---|
| `node scripts/pathcode.mjs` | real `…/scripts/pathcode.mjs` | `file://…/scripts/pathcode.mjs` | yes | welcome / UI |
| `~/.local/bin/pathcode` | `~/.local/bin/pathcode` (symlink) | `file://…/scripts/pathcode.mjs` (resolved) | **no** | silent exit 0 |
| `pathcode` on PATH | same symlink path | same resolved URL | **no** | silent exit 0 |
| `pathcode --model gpt-5.6-terra` | same | same | **no** | silent exit 0 (main never ran) |

Measured before fix:

- `node scripts/pathcode.mjs` → exit 0, stdout length 433 (welcome)
- `~/.local/bin/pathcode` → exit 0, stdout length **0**, stderr empty
- `pathcode --help` via symlink → exit 0, stdout length **0** (also dead)

`realpathSync(symlink) === realpathSync(script)` was true; only the naive URL compare failed.

### Ruled out

| Candidate | Why not |
|---|---|
| `--model` incorrectly delegating to legacy CLI | `parseArgs` consumes `--model`; `rest` stays empty. Main never reached under symlink, so parsing never ran. |
| Shebang / executable bit | Symlink target is the same executable `.mjs`; Node did load the module (import side effects / top-level ran; only the `isDirect` branch skipped). |
| TTY detection | Non-TTY `node scripts/pathcode.mjs` still prints welcome; symlink printed nothing. |
| Top-level main not awaited | When `isDirect` was true, `.then` set `process.exitCode` correctly. |
| Credential / network / trial | No banner, no prompt, no provider — consistent with main never invoked. |

---

## 3. Fix

Replaced naive `pathToFileURL(argv[1]).href === import.meta.url` with `isDirectEntry()` that compares `realpathSync(argv[1])` to `realpathSync(fileURLToPath(import.meta.url))`, with a narrow fallback to the prior URL compare if `realpath` fails.

Scope:

- Direct Node execution
- Symlink / `~/.local/bin` execution
- Package/`bin` execution that lands on the same real script

Preserved:

- Import remains side-effect free (tests import `runPathcodeMain` / `isDirectEntry` without launching UI)
- `--help` / `--version` offline
- `--model` still available to `/trial` once the interactive loop runs
- No Brain / OpenAI adapter / gate / mutation / validation / authority / trial semantic changes
- No general executor/DI seam; no widened filesystem authority beyond entry detection

---

## 4. Files changed

- `scripts/pathcode.mjs` — robust `isDirectEntry()`
- `tests/terminal-trial/banner-entry.test.ts` — installed-style symlink regression + import side-effect proof
- `docs/reports/PHASE_5F_INSTALLED_LAUNCHER_CORRECTION.md` — this report

---

## 5. Validation

### Focused regression

```text
npm test -- tests/terminal-trial/banner-entry.test.ts
→ 6 passed (including installed symlink + side-effect-free import)
```

```text
npm test -- tests/terminal-trial/
→ 20 passed
```

Regression covers:

- temp installed-style symlink spawn reaches welcome (not silent exit)
- naive argv/URL compare would miss the symlink (documents prior failure shape)
- `--model` via symlink reaches interactive launcher path (welcome / non-TTY notice)
- `--help` / `--version` via symlink stay offline and succeed
- importing the entry module does not print welcome
- no credential / network / trial activity from bare launch

### Canonical

1. First `npm run check` under sandbox: **FAIL** — 55 unrelated `GIT_DISCOVERY_FAILED` fixture `git init` failures (sandbox). Terminal-trial / launcher tests passed in that run.
2. Named causal correction: re-run `npm run check` unsandboxed so fixture git can execute.
3. Second `npm run check`: **PASS** — typecheck, build, 101 files / 914 tests, `cli:smoke`, `ledger:verify`. Zero unhandled/worker errors. No skipped tests. No timeout changes.

### Real local shape (no network / no /trial / no credential)

Post-fix non-TTY probes against the existing user symlink:

```text
~/.local/bin/pathcode                 → welcome (PATH * Code)
~/.local/bin/pathcode --model gpt-5.6-terra → welcome
~/.local/bin/pathcode --help          → help text
```

Interactive TTY proof was not driven from this agent session. Operator command:

```bash
pathcode
```

(or `pathcode --model gpt-5.6-terra`)

Expected: PATH ● Code welcome screen and prompt. Do not enter `/trial` for this correction proof.

---

## 6. Guarantees

| Guarantee | Status |
|---|---|
| Zero live provider calls | YES |
| Zero credential reads | YES |
| Main unchanged | YES (`525d74c4a92ae30a13fa0a2ae62bc305cc3115de`) |
| No merge / no push | YES |
| No Gemini / next phase | YES |
| Worktree clean after report commit | YES (after commit) |

---

## 7. Operator launch

```bash
pathcode
```
