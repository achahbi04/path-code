# PATH CODE — G10
# NATIVE COLLABORATIVE ENGINE FABRIC + LIVING COCKPIT 2.0

**Result:** PARTIAL_PENDING_OPERATOR_REVIEW

**Baseline (named freeze — do not reset if HEAD is later):**  
- Named implementation: `e4d2941cf26acefce3f4dab580d4288eba5aeb73`  
- Named PARTIAL report: `952fc0eabbf0cffc8a8437d44bad1291b2e60016`

**Closure implementation commit:** `416877d10eb4e04bad313588eee26198e6fbbfdf`  
**Closure report commit:** `dfab83946d77b8750a8db971daa68d8f8c03a5d0`  
**UI correction implementation commit:** `9965e411769ba9d37ab9d387da748c87881c5bed`  
**S0 implementation commit:**   
**S0 report commit:**   
**UI correction report commit:** `2da3c30145ca684283422ec1b2ceaeb7001ea19d`  
**Current HEAD:** `3f598404495de5c872d14462d09deee6c844569f`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after S0 freeze

G10 inherits the complete G9 engineering foundation. Closure drive closed the
remaining live product acceptance gaps. This UI-correction drive fixes
release-blocking paste/composer ownership and ships the minimal living surface
without changing engineering engines.

---

## ANTIGRAVITY LIVE REPAIR

| Field | Status |
| --- | --- |
| Task | `ag-repair-*` disposable repair-js fixture |
| Failure | Phase A: diagnose-only; `node --test` / independent validation **FAILED** (add returned `a-b`) |
| Repair | Same AG session `continueNative` → fixed `a+b` |
| Verified result | **PASS** — Phase B validation **VERIFIED** (`closure/ag-repair.json`) |

## COPILOT SDK NATIVE ENGINEERING

| Field | Status |
| --- | --- |
| Session | native_sdk `path-sdk-lsp-*` |
| Mutation | `src/add.js` fixed; `npm test` exit 0 |
| Commands | command/tool events observed |
| LSP/native capability | PATH-prepared `COPILOT_HOME` + typescript LSP; SDK consumed PATH toolchain |
| MCP/tool use | Not forced; G9 SCIP MCP preserved when relevant |
| Events | SDK streaming + cockpit mapping |
| Repair | Mutation repaired failing test |
| Verified result | **PASS** (`closure/sdk-lsp.json`) |

## SCIP LIVE PRODUCT USE

| Field | Status |
| --- | --- |
| Repository | `scip-mono` |
| Symbol/query | `tokenPrefix` / definition |
| Engine | Antigravity |
| Cockpit event | `session.capability.indexing` + Code intelligence activity |
| Engineering contribution | SCIP facts briefed into AG objective; session **VERIFIED** (repairAttempts≥1) |
| Verified result | **PASS** (`closure/scip-live.json`) |

## SERVICE / CONTAINER PRODUCT USE

| Field | Status |
| --- | --- |
| Backend | G9 Colima + Docker (DOCKER_HOST pin for Colima socket) |
| Service | PATH-owned compose Redis `pathcode-g9-*` |
| Cockpit state | preparing / ready / Verified |
| Engineering use | AG fixed `expectedPong` against live Redis |
| Cleanup | compose **STOPPED** (PATH-owned only) |
| Verified result | **PASS** (`closure/service-live.json`) |

## BACKGROUND ACTIVITY

| Field | Status |
| --- | --- |
| Operation | SCIP indexing |
| Foreground responsiveness | steering accepted while indexing (~408ms) |
| Stale-result case | old fingerprint → mutate → result **STALE** |
| Result | **PASS** (`closure/background-stale.json`) |

## LIVE STEERING

| Field | Status |
| --- | --- |
| Mutation state | lease active → PENDING deferred |
| Pending | **PENDING** while mutating |
| Applied | boundary apply → steering APPLIED |
| Engineering response | kept `export function add`; fixed body |
| Verified result | **PASS** / validation **VERIFIED** (`closure/steering-live.json`) |

## MULTI-TASK REPL

| Field | Status |
| --- | --- |
| Task 1 | VERIFIED — fix `add` |
| Task 2 | VERIFIED — add `greet` |
| Task 3 | VERIFIED — add `mul` |
| Single process | YES (`runPathcodeMain` one process) |
| Cockpit retained | YES (alt-screen / PATH frame) |
| Verified result | **PASS** (`closure/multitask-repl.json`) |

## PROCESS RESTART

| Field | Status |
| --- | --- |
| Pre-restart task | `g10-resume-e2e` (Copilot SDK + AG mid-task) |
| AG session | ACTIVE pre-exit |
| Copilot session | native_sdk `path-g10-resume-e2e` |
| Reconciliation | Git/worktree **aligned** |
| AG restore mode | **REHYDRATED_SESSION** (truthful; native conversation not live after process exit) |
| Copilot restore mode | native_sdk resume/create same sessionId |
| Post-restart collaboration | both engines continued on same worktree |
| Verified result | **PASS** / **VERIFIED** (`closure/resume-e2e.json`) |

## VIEWPORT / TERMINAL

| Field | Status |
| --- | --- |
| Wide | MECHANICAL_OK (140 cols) + minimal living default |
| Narrow | MECHANICAL_OK (60 cols) + same single-column composition |
| Resize | MECHANICAL_OK wide↔narrow |
| ANSI | no literal escape dumps; white/yellow/white brand SGR |
| Borders | frame intact in mechanical samples |
| Scrollback | living-frame path exercised mechanically |
| Prompt | PATH-owned composer (raw mode + bracketed paste); no readline echo into frame |
| Cancellation | not operator-filmed |
| Terminal restore | title + bracketed paste + raw/alt-screen restored on exit |

Evidence: `closure/viewport-mechanical.json`, `ui-correction/ui-correction.json`  
**MANUAL_UI_ACCEPTANCE: PENDING_OPERATOR_REVIEW**

## UI CORRECTION (paste / composer / branding)

| Field | Status |
| --- | --- |
| Root cause | Idle readline echo + `setIdlePrompt` cursor teleport into alt-screen body |
| Composer | Raw-mode PATH buffer; Enter submits; paste never auto-submits |
| Branding | `PATH` white · `●` yellow · `Code` white (`NO_COLOR` plain) |
| Default layout | Minimal single-column living surface (legacy 3-col via `PATHCODE_LEGACY_THREE_COLUMN=1`) |
| Stable title | OSC `` `${project} — PATH Code` `` on enter; restored on exit |
| Compact result | `✓ COMPLETE` + files / tests / build / `Commit <sha>` — no handoff prose / inspect dump |
| Evidence | `docs/reports/g10-evidence/ui-correction/ui-correction.json` → **PASS** |
| Multitask after fix | `closure/multitask-repl.json` → **PASS** |
| Guards A–K | **PASS** |

## S0 — G10.5 PRODUCT CORRECTION

Authoritative roadmap stage **S0** (before Gateway extract). Full report:
`docs/reports/PHASE_S0_G10_5_PRODUCT_CORRECTION.md`

| Field | Status |
| --- | --- |
| Living surface | HEADER · GOAL · STREAM · COMPACT STATE · COMPOSER |
| Title | OSC strip + stream guards + `` `<project> — PATH Code` `` |
| Keychain | Pin host `copilot` via `RuntimeConnection.forStdio` / `COPILOT_CLI_PATH` |
| Terminology | Checks / COMPLETE (gateway semantics; no judge language) |
| Architecture | PATH = engineering gateway / product layer |
| S1 / Build / Studio / Cursor SDK | **NOT BEGUN** |
| MANUAL_UI_ACCEPTANCE | **PENDING_OPERATOR_REVIEW** |

## GUARDS A–K

`docs/reports/g10-evidence/guards/guard-matrix.json` → **PASS** (A–K all ok)

## CANONICAL VALIDATION

- `npm run check` → **EXIT 0** — Test Files 156 passed / Tests 1424 passed (`ui-correction/canonical-check.txt`); one clean run, no targeted-rerun story
- Guards A–K → **PASS**
- Primary checkout: protected (task worktrees; primaryUntouched where asserted)
- Credential isolation: PATH-owned runtime; no secrets in checkpoints
- Published releases: **UNCHANGED**
- Publication: **NO**

## MANUAL_UI_ACCEPTANCE

**PENDING_OPERATOR_REVIEW**

Cursor must not promote to PASS based solely on mechanical screenshots/tests.

---

## OPERATOR DEMO

**DEMO PROJECT (absolute):**  
`/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo`

Disposable Node fixture with broken `src/add.js` (`a - b`) and `npm test` via `node:test`.

**EXACT LAUNCH COMMAND:**

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo
PATH="/opt/homebrew/bin:$PATH" \
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-path-code-gc1-260910}" \
PATHCODE_RUNTIME_ROOT="/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/runtime-live-ag" \
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs --execution local
```

**WHAT TO VERIFY (operator):**
- Paste stays in the bottom composer (not in the living body)
- Header is white/yellow/white `PATH ● Code` (not cyan)
- Window title stays `` `pathcode-g10-operator-demo — PATH Code` `` (does not churn with activity)
- Minimal living surface (not a permanent three-column dashboard)
- Compact VERIFIED block after Task 1
- Mid-cycle steering accepted; Tasks 2–3; resize; clean `/exit`

**TASK 1 TO TYPE:**  
`Fix src/add.js so npm test passes. Keep public add(a,b). Do not push.`

**WHEN TO SEND STEERING:** while PATH shows active mutation / Applying / Editing

**STEERING LINE:**  
`Keep backward compatibility and do not change the public API.`

**TASK 2 TO TYPE:**  
`Add src/greet.js exporting greet(name) returning hello ${name} and a node:test that proves it. Do not push.`

**TASK 3 TO TYPE:**  
`Add src/mul.js exporting mul(a,b) returning a*b and a node:test proving mul(3,4)===12. Do not push.`

**EXACT RESUME PROCEDURE:**

1. During Task 1 after real edits appear, note the task id if shown.
2. Exit PATH cleanly (`/exit` or Ctrl-C once to cancel cycle, then `/exit`).
3. Relaunch the same launch command from the same project directory.
4. Use `/recover <task-id>` if offered, or continue the resumable task PATH presents.
5. Confirm AG/Copilot restore modes are truthful (NATIVE_RESUME vs REHYDRATED_SESSION / SDK resume).
6. Finish engineering until VERIFIED.

**EXACT CLEAN EXIT:** type `/exit` at the cockpit composer (or Ctrl-C to cancel an active cycle, then `/exit`). Confirm terminal leaves alternate screen, title restores, and shell prompt returns.

**WHAT SHOULD APPEAR:** preparing → engineering → Verified; composer returns for next task; primary checkout unchanged until admit/merge policy says otherwise.

---

## Evidence index (closure + UI correction)

- `docs/reports/g10-evidence/closure/ag-repair.json`
- `docs/reports/g10-evidence/closure/sdk-lsp.json`
- `docs/reports/g10-evidence/closure/scip-live.json`
- `docs/reports/g10-evidence/closure/service-live.json`
- `docs/reports/g10-evidence/closure/background-stale.json`
- `docs/reports/g10-evidence/closure/steering-live.json`
- `docs/reports/g10-evidence/closure/multitask-repl.json`
- `docs/reports/g10-evidence/closure/resume-e2e.json`
- `docs/reports/g10-evidence/closure/viewport-mechanical.json`
- `docs/reports/g10-evidence/ui-correction/ui-correction.json`
- `docs/reports/g10-evidence/ui-correction/canonical-check.txt`
- `docs/reports/g10-evidence/guards/guard-matrix.json`

## Continuous drive

Automated/live product acceptance + UI correction closed for operator review.
Strongest valid automated verdict: **PARTIAL_PENDING_OPERATOR_REVIEW**.
Operator performs final visual acceptance (paste, branding, title, minimal UI).
