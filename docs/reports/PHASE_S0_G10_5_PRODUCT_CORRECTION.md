# PATH CODE — S0
# G10.5 PRODUCT CORRECTION

**Stage:** S0 only (S1 Gateway Extract not begun)  
**Automated verdict:** MECHANICAL_GREEN_PENDING_OPERATOR_UI  
**MANUAL_UI_ACCEPTANCE:** PENDING_OPERATOR_REVIEW

Cursor must not self-declare operator visual acceptance.

---

## 1. CURRENT PATH PRODUCT DEFINITION

PATH is the **engineering gateway / product layer**.

- Engines (Antigravity, Copilot SDK, later Cursor), runtimes, LSPs, SCIP, MCP,
  services, and project build/test tooling **perform engineering**.
- Project/build/test/runtime/provider evidence feeds the engineering loop.
- PATH **carries, presents, and preserves** task/result state in a living terminal
  product surface.
- PATH is **not** an independent judge, second brain, verification authority above
  engines, Antigravity supervisor, or Copilot advisory ceiling.
- There is **no permanent engine hierarchy**.

Internal classification symbols such as `VERIFIED` remain in the engineering
fabric for honesty and continuity; the living product language prefers
**Checks / Build / Tests / Outcome / Result / Completion**.

---

## 2. WHAT S0 BUILT

| Capability | Classification |
| --- | --- |
| Full-height living surface (HEADER · GOAL · STREAM · COMPACT STATE · COMPOSER) | **LIVE_PROVEN** (mechanical + unit); operator visual still PENDING |
| Real-event activity aggregation (Preparing / Indexing / Inspecting / …) | **LIVE_PROVEN** (event → frame; no invented activity) |
| PATH-owned composer (raw, bracketed paste, short/long/multiline, steering hook) | **LIVE_PROVEN** (`ui-correction` harness PASS) |
| Branding PATH white / ● yellow / Code white | **LIVE_PROVEN** |
| Stable Terminal title `<project> — PATH Code` + OSC strip + stream guards | **IMPLEMENTED_LIMITED** → mechanical LIVE; real Terminal.app operator confirm PENDING |
| Compact `✓ COMPLETE` result (files / tests / build / commit) | **LIVE_PROVEN** (mechanical) |
| Terminology: Checks / Result / COMPLETE (UI + evidence column) | **LIVE_PROVEN** |
| Copilot Keychain: pin host `copilot` via `RuntimeConnection.forStdio` / `COPILOT_CLI_PATH` | **IMPLEMENTED_LIMITED** (root cause fixed in code; sequential Keychain-free turns require operator Auth Always Allow once on stable binary) |
| AUTH_REQUIRED → preserve task → authenticate → continue | **IMPLEMENTED_LIMITED** (existing classifyCopilotFailure path; not re-filmed in S0) |
| Terminal lifecycle restore (alt-screen / cursor / raw / title) | **LIVE_PROVEN** (unit + restore helpers); operator Terminal.app film PENDING |
| S1 Gateway extract | **NOT_BUILT** |
| PATH Build | **NOT_BUILT** |
| Studio drive mode | **NOT_BUILT** |
| Cursor SDK integration | **NOT_BUILT** |

---

## 3. EXACT FILES / MODULES CHANGED

Primary product surface:

- `scripts/pathcode-cli/inline-studio.mjs` — living surface, Checks language, COMPLETE result
- `scripts/pathcode-cli/terminal-title.mjs` — OSC strip, stream guards, process.title, watchdog reassert
- `scripts/pathcode-cli/composer.mjs` — (preserved; exercised)
- `scripts/pathcode-cli/ag1/noninteractive-env.mjs` — clear `PROMPT_COMMAND` / `TERMINAL_TITLE`
- `scripts/pathcode-cli/ag10/copilot-sdk.mjs` — `resolveStableCopilotCliPath`, `RuntimeConnection.forStdio` pin
- `scripts/pathcode-cli/ag1/session.mjs` — product banner COMPLETE language (no handoff dump)
- `scripts/path-studio/state.mjs` — task preview length / wording comments

Tests / evidence:

- `tests/g7/g7-proofs.test.ts`
- `tests/g10/g10-fabric.test.ts`
- `docs/reports/g10-evidence/ui-correction/run-ui-correction.mjs`
- `docs/reports/g10-evidence/closure/run-viewport-mechanical.mjs`
- `docs/reports/PHASE_G10_COLLABORATIVE_ENGINE_FABRIC.md`
- `docs/reports/PHASE_S0_G10_5_PRODUCT_CORRECTION.md` (this file)

---

## 4. TUI / COMPOSER IMPLEMENTATION

Living AG1 surface (`buildMinimalLivingLines`):

1. **HEADER** — `PATH ● Code` + `project · task`
2. **GOAL** — current objective from `taskPreview`
3. **LIVING STREAM** — recent ops aggregated via `activityLabel` / `livingStreamLines`
4. **COMPACT STATE** — files · Build · Tests (+ service when relevant)
5. **RESULT** (when terminal arrived) — `✓ COMPLETE` / `✕ FAILED` / … then files, tests, build, `Commit <sha8>`
6. **COMPOSER** — anchored bottom rows from PATH-owned composer state

Composer remains PATH-owned raw input with bracketed paste; paste never auto-submits;
no terminal echo into the engineering body (prior G10 UI-correction root cause held).

---

## 5. TERMINAL TITLE — ROOT CAUSE + FIX

**Root cause:**

1. Child runtimes (notably Copilot SDK / harness tooling) emit OSC `]0;` / `]2;` title
   sequences onto shared stdout/stderr, and/or mutate `process.title`.
2. Shell `PROMPT_COMMAND` / child env can also rewrite titles.
3. Terminal.app then shows `node`, `localharness`, script paths, or activity verbs.

**Fix:**

- Own title: `` `${projectName} — PATH Code` `` via OSC 0 + `process.title`
- Strip OSC title sequences from collision-guard writes and process stdout/stderr
  while the session owns the title (owned reassert bypasses the strip)
- 1.5s watchdog reassert during long engineering without paints
- Clear `PROMPT_COMMAND` / `TERMINAL_TITLE` in noninteractive engineering env
- Restore title + uninstall stream guards on exit

---

## 6. COPILOT KEYCHAIN — ROOT CAUSE + FIX

**Root cause (mechanical):**

`@github/copilot-sdk` defaults to `ensureRuntimeBundle()` which materializes
`copilot-runtime` under:

`~/Library/Caches/github-copilot-sdk/runtime/<fingerprint>/…`

Fingerprint includes package asset mtimes. When the materialized path changes,
macOS Keychain ACL sees a **new executable identity** (“copilot-runtime” accessing
“copilot-cli”) and re-prompts for the login password — even after a prior allow.

PATH-only `PATH=` prepend was insufficient: the SDK ignores PATH and uses the
bundled runtime unless `RuntimeConnection.forStdio({ path })` or `COPILOT_CLI_PATH`
is set.

**Fix:**

- `resolveStableCopilotCliPath()` prefers explicit `COPILOT_CLI_PATH` /
  `PATHCODE_COPILOT_BIN`, then host `copilot` (including `~/.local/bin`)
- `createCopilotEngine` constructs `CopilotClient` with
  `RuntimeConnection.forStdio({ path, env })` so sequential turns share one binary
- No plaintext tokens; no PATH-owned credential copies; no custom Keychain store
- If auth genuinely expires: existing `AUTH_REQUIRED` classification preserves the
  task for authenticate → continue

**Operator note:** Grant **Always Allow** once for the stable host `copilot` binary.
“Allow Once” will still re-prompt. After that, sequential SDK turns must not ask
again for the same executable identity.

---

## 7. TERMINOLOGY / ARCHITECTURE CORRECTIONS

User-facing / living UI:

| Before | After |
| --- | --- |
| Final validate | Checks |
| ✓ VERIFIED (primary living result) | ✓ COMPLETE |
| PATH verdict / judge language | Outcome / Result / Completion |

Architecture language for S0+ roadmap: PATH = gateway/product layer; engines peer;
no AG-primary / Copilot-advisory ceiling.

Internal `VERIFIED` classification symbols left intact where renaming would risk
the G9/G10 fabric.

---

## 8. WHAT WAS NOT BUILT

Explicitly:

- **S1 Gateway extract has not begun**
- **PATH Build has not begun**
- **Studio drive mode has not begun**
- **Cursor SDK has not been integrated**

---

## 9. KNOWN DEFECTS / LIMITATIONS

- Operator visual acceptance of the living surface is still required
  (`MANUAL_UI_ACCEPTANCE = PENDING_OPERATOR_REVIEW`).
- Keychain “Always Allow” cannot be automated; S0 proves identity pinning, not
  operator password UX.
- If no host `copilot` exists, SDK falls back to fingerprint-cached
  `copilot-runtime` (path can still churn across npm package updates).
- Legacy three-column surface remains for `PATHCODE_LEGACY_THREE_COLUMN=1` /
  non-AG1 paths.
- Real Terminal.app film of every lifecycle cell (wide/narrow/Ctrl-C during eng)
  remains operator-owned.

---

## 10. EXACT GIT STATE

Filled at freeze:

- **Implementation commit:** `fcd6e831dc9c346f5c131e0442ecfe60916d555f`
- **Report commit:** `b2c896f0b29ba09c2b14ed69a9207be87981e7a3`
- **Current HEAD:** `470537d2dafd872b468f77b0fd83f68f451b6269`
- **Branch:** `cursor/pathcode-antigravity-v1`
- **Working tree:** clean after freeze

## 11. CANONICAL VALIDATION

- `npm run check` → **EXIT 0**
  - Test Files **156** passed / Tests **1425** passed
  - Evidence: `docs/reports/g10-evidence/ui-correction/canonical-check-s0.txt`
  - `ledger:verify PASS`
- UI correction harness → **PASS** (`ui-correction/ui-correction.json`)
- Viewport mechanical → **MECHANICAL_OK** (`closure/viewport-mechanical.json`)
- Keychain pin evidence → `s0/keychain-pin.json` (operator Always Allow still PENDING)
- No literal ANSI leakage in mechanical frames
- **MANUAL_UI_ACCEPTANCE = PENDING_OPERATOR_REVIEW**

---

## 12. OPERATOR DEMO

**DEMO PROJECT (absolute):**  
`/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo`

**EXACT LAUNCH COMMAND:**

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo
PATH="/opt/homebrew/bin:$HOME/.local/bin:$PATH" \
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-path-code-gc1-260910}" \
PATHCODE_RUNTIME_ROOT="/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/runtime-live-ag" \
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs --execution local
```

**Operator checklist:**

- Living surface: GOAL + stream + compact state + bottom composer (not empty harness)
- Title stays `pathcode-g10-operator-demo — PATH Code`
- After Keychain Always Allow on host `copilot`, Task 1 → Task 2 → Task 3 without
  password re-prompt
- Compact COMPLETE then immediate next composer
- `/exit` restores alt-screen / cursor / echo / title

---

## STAGE BOUNDARY

**STOP.** Do not begin S1 automatically.

Next authorization: **S1 — Gateway Extract.**
