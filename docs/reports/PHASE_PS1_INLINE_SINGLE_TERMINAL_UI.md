# PHASE PS1-INLINE — SINGLE-TERMINAL LIVE UI

**Result: PASS**

```text
PHASE PS1-INLINE SINGLE-TERMINAL LIVE UI IMPLEMENTED
— ONE WINDOW, CARDS UPDATE IN PLACE AS THE ENGINE WORKS
— NO SECOND TERMINAL, NO FILE WATCHER
— NON-TTY FALLS BACK TO PLAIN LINES; NDJSON SEAM RETAINED OPTIONAL
— RENDERS ONLY REAL EVENTS, NEVER FABRICATES STATE
— R2-K CLEANLINESS INTACT; ENGINE UNTOUCHED (src/** ZERO-DIFF)
```

---

## SHA discipline

| Concept | Value | Meaning |
|---|---|---|
| **PS1 IMPLEMENTATION SHA (dispatch base)** | `910eab8190d2a513bf6fb0d21f9fd310a467e1c1` | Path Studio read-only NDJSON mirror. Branched `--no-track` into a **fresh** worktree |
| **Fresh worktree** | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase-ps1-inline` | Not the shared PS1 Studio worktree (an active `pathcode --events-out` session was still bound there) |
| **Branch** | `cursor/phase-ps1-inline` | Created from the PS1 IMPLEMENTATION SHA above |
| **IMPLEMENTATION SHA** | `IMPLEMENTATION_SHA_PLACEHOLDER` | Inline renderer + CLI wiring + PI-A…L/P1 proofs |
| **BRANCH TIP** | `BRANCH_TIP_PLACEHOLDER` | This report after IMPLEMENTATION |
| **Main** | `d997ae13185013b4312755c38da4cd7099041621` | **Unchanged**. No push. No merge. |

**Why a fresh worktree:** The existing `cursor-phase-ps1-path-studio` tree had a live `node scripts/pathcode.mjs … --events-out /tmp/pathcode-session.ndjson` process. Phase rule is one agent per worktree and a quiet tree for `npm run check`.

---

## Zero-diff proof — `src/**` engine boundary

| Check | Result |
|---|---|
| `git diff HEAD -- src/` / `SRC_DIFF_BYTES` | **0** (re-proven at focused suite and at `npm run check`) |
| Touched paths | `scripts/pathcode.mjs`, `scripts/pathcode-cli/inline-studio.mjs` (new), `scripts/pathcode-cli/general-session.mjs` (`cardsOwnProgress` / `progress()` only), `tests/path-studio/inline-studio.test.ts`, this report |
| Engine modules | **not modified** |

---

## What shipped

### In-process inline cards (default TTY experience)

- New module: `scripts/pathcode-cli/inline-studio.mjs`
- Reuses the PS1 honesty reducer from `scripts/path-studio/state.mjs` (`applyStudioEvent` / card order / anti-decoration)
- Wired in `scripts/pathcode.mjs` via `createSessionEventSink({ onEvent })` for TTY sessions
- Cycle lifecycle: `begin()` → events redraw in place → `finish()` (resize off + cursor restore) → return to `PATH ● Code >` in the **same** window

### Terminal-rendering safety (1a–1g)

| Clause | Implementation |
|---|---|
| **1a Viewport clamp** | Every redraw reads `stdout.rows` / `columns`; block height ≤ `rows - 2`; non-active stages collapse; resize listener re-renders |
| **1b Visual width** | `visibleWidth` / `truncateVisible` / `fitLine` strip ANSI before measuring; no line exceeds `columns` |
| **1c Atomic write** | One assembled ANSI frame → one `stdout.write` per event |
| **1d Collision guard** | `installCollisionGuard` → `noteExternalWrite()` re-anchors (no blind cursor-up into history) |
| **1e Resize teardown** | `stdout.off("resize", …)` in `finish()` on every terminal path |
| **1f Cursor restore** | Hide only while drawing; `SHOW_CURSOR` only if hidden; `finish()` always clears the hide flag |
| **1g Erase-below** | Frame ends with `\u001b[J` from the row below the block so shrinks leave no phantoms |

### Non-TTY fallback

- Detected once: `stdout.isTTY !== true` → inline **disabled**
- Existing general-session sequential progress lines remain the human copy
- No ANSI cursor codes from the renderer when `enabled: false` (PI-D)

### NDJSON seam (optional side-channel)

- `--events ndjson` / `--events-out <path>` **retained**
- When NDJSON would share the human TTY (ndjson without `--events-out`), inline cards are **disabled** so machine lines do not collide with the card block
- Preferred operator path for logging: `--events-out` (cards on TTY + file seam)

### Anti-decoration unchanged

- Cards update only from real `session.*` events (R2-O)
- Skipped validation → `[~] skipped`, never success
- Heartbeat remains elapsed-only liveness
- Untrusted detail text still T12-escaped via `escapeForTerminalDisplay` in `fitLine`

### Process hygiene (R2-K)

- No timers/sockets/servers/file watchers for rendering
- Resize listener is the only listener introduced; detached on `finish()`
- Heartbeat controller stop semantics unchanged
- `cardsOwnProgress` suppresses mirrored one-line progress on TTY so disclosures/prompts remain the only external writes (collision-guarded)

---

## Proofs — PI-A…L + P1

Focused file: `tests/path-studio/inline-studio.test.ts` (15 tests, all PASS).

| Proof | Result |
|---|---|
| **PI-A** | TTY accepted-cycle fixture: clear-line + cursor-up; bounded region; write-count = event-count |
| **PI-B** | Gate 1 card arrives on its event before Gate 2 exists |
| **PI-C** | `missing-gate2` → Gate 2 pending/not-reached; `validation-skipped` → `[~] skipped` |
| **PI-D** | `enabled: false` → plain `renderSessionEventHuman` lines; zero ANSI CSI |
| **PI-E** | Resize listener count 0 between cycles; `\u001b[?25h` after hide; heartbeat timers cleared |
| **PI-F** | `--events-out` sink still writes safe sessionId-stamped objects |
| **PI-G** | `cardsOwnProgress` wired; REVIEW/BOUNDED fixtures render terminal disposition; 5G-R1/R2 suites green under check |
| **PI-H** | `rows=10` ⇒ height ≤ `rows-2`; resize to 40 grows the block |
| **PI-I** | Colored long path measured with codes stripped; fitted ≤ columns |
| **PI-J** | Exactly one `stdout.write` per event redraw |
| **PI-K** | Stray `prompt.write` sets re-anchor; next frame starts fresh (no cursor-up into history) |
| **PI-L** | Shrink frame emits `\u001b[J` after shorter content |
| **P1** | `decorateGate2Accepted: true` fabricates Gate 2 accepted on missing-gate2; honest path does not; `state.mjs` hash unchanged |

### Content hashes (pre-commit working tree)

| Path | SHA-256 |
|---|---|
| `scripts/pathcode-cli/inline-studio.mjs` | `13ba329a5c0412df59c2eb859f3351d562d450b5dfba0426502915c87152e6d1` |
| `scripts/pathcode.mjs` | `a2cbf74cc27d71c133f95ec037540815e10951dc1a8c6c1b2b70d3215f4e35d2` |
| `scripts/pathcode-cli/general-session.mjs` | `1a7e2f1aa4f82783849a619c0c162044fdb12842922eff4fb346ef16a7f50e1e` |
| `tests/path-studio/inline-studio.test.ts` | `3c81e033ac4805a2b58a64609e1aac3ef33cb05f0c434fcc8b2a78c51351142f` |
| `scripts/path-studio/state.mjs` (honesty reducer) | `d25e958d074c7885141113543b6647d9b75694e8bd25fd3b6a20f9d1d1f90f5a` |

---

## Validation

| Gate | Result |
|---|---|
| Focused PI suite | **15/15 PASS** |
| PS1 Studio suite | **15/15 PASS** (optional second-process mirror retained) |
| 5G-R2 session-loop | **18/18 PASS** |
| 5G-R1 bounded-autonomy | **PASS** (full check) |
| `npm run check` | **PASS** — typecheck, build, **1151** tests, cli:smoke, ledger:verify |
| Live providers | **zero** |
| Credentials in events/tests | **none** |
| Push | **none** |

---

## FINDINGS LOG (non-blocking)

1. **NDJSON-on-stdout disables inline cards.** `--events ndjson` without `--events-out` still writes machine JSON to the human TTY (R2 backward compatible). Inline mode turns off in that configuration to avoid corrupting the card block. Operators who want both should use `--events-out`.
2. **Force-exit SIGINT (`process.exit(130)` on second Ctrl-C during cleanup)** bypasses `finally` and therefore skips `inlineStudio.finish()`. Normal cancel (first SIGINT) still tears down via `runCycle`’s `finally`. Rare path; cursor restore best-effort only.
3. **Separate `scripts/path-studio/` process remains** for optional second-window / `--once` fixture use. It is no longer required for the human watch path.
4. **Shared PS1 worktree was busy** at dispatch (`pathcode` PID on `cursor-phase-ps1-path-studio`). This phase used a fresh worktree from the PS1 IMPLEMENTATION SHA to satisfy quiet-tree / one-agent rules.

---

## HARD-STOP checklist

| Condition | Status |
|---|---|
| `src/**` engine edit | **No** — `SRC_DIFF_BYTES=0` |
| Persistent handle added (R2-K) | **No** — resize listener detached every terminal path; no render timers/servers |
| Fabricated-state render that can't be removed | **No** — P1 proves the decorate hook is opt-in only; default path honest |

---

## Operator experience

```text
$ pathcode --model <id>
PATH ● Code > make answer() return 42
  … cards update in place in THIS window …
PATH ● Code >
```

No second terminal. No `tail -f`. No file watcher. Optional: `--events ndjson --events-out /tmp/session.ndjson` for a machine side-channel.
