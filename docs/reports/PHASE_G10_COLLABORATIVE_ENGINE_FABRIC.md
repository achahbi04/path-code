# PATH CODE — G10
# NATIVE COLLABORATIVE ENGINE FABRIC + LIVING COCKPIT 2.0

**Result:** PARTIAL_PENDING_OPERATOR_REVIEW

**Baseline (named freeze — do not reset if HEAD is later):**  
- Named implementation: `e4d2941cf26acefce3f4dab580d4288eba5aeb73`  
- Named PARTIAL report: `952fc0eabbf0cffc8a8437d44bad1291b2e60016`

**Closure implementation commit:** `416877d10eb4e04bad313588eee26198e6fbbfdf`  
**Closure report commit:** `6bfae13dc2c76a89e2b4a0f55d27b399bd0b2594`  
**Current HEAD:** `b6973369aabee63e72dc38f6ae8a261892ef7941`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after freeze

G10 inherits the complete G9 engineering foundation. Closure drive closed the
remaining live product acceptance gaps without redesigning the fabric.

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
| Wide | MECHANICAL_OK (140 cols) |
| Narrow | MECHANICAL_OK (60 cols) |
| Resize | MECHANICAL_OK wide↔narrow |
| ANSI | no literal escape dumps; SGR present |
| Borders | frame intact in mechanical samples |
| Scrollback | living-frame path exercised mechanically |
| Prompt | idle prompt retained in cockpit model |
| Cancellation | not operator-filmed |
| Terminal restore | not operator-filmed |

Evidence: `closure/viewport-mechanical.json`  
**MANUAL_UI_ACCEPTANCE: PENDING_OPERATOR_REVIEW**

## GUARDS A–K

`docs/reports/g10-evidence/guards/guard-matrix.json` → **PASS** (A–K all ok)

## CANONICAL VALIDATION

- `npm run check` → full suite under disk/load pressure: 14 timeouts; **reconfirm of all failing files 67/67 PASS** (`closure/canonical-check-rerun.txt`); G10 unit tests 12/12 PASS
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

**DEMO PROJECT:** disposable copy of `docs/reports/g9-evidence/live-repos/js-accept` (or any small Node repo with a failing `npm test`)

**EXACT LAUNCH COMMAND:**

```bash
cd /path/to/demo-project
PATH="/opt/homebrew/bin:$PATH" \
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-path-code-gc1-260910}" \
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs --execution local
```

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

1. During Task 1 after real edits appear in PROJECT, note the task id from PATH/EVIDENCE if shown.
2. Exit PATH cleanly (`/exit` or Ctrl-C once to cancel cycle, then `/exit`).
3. Relaunch the same launch command from the same project directory.
4. Use `/recover <task-id>` if offered, or continue the resumable task PATH presents.
5. Confirm AG/Copilot restore modes are truthful (NATIVE_RESUME vs REHYDRATED_SESSION / SDK resume).
6. Finish engineering until VERIFIED.

**EXACT CLEAN EXIT:** type `/exit` at the cockpit prompt (or Ctrl-C to cancel an active cycle, then `/exit`). Confirm terminal leaves alternate screen and shell prompt returns.

**WHAT SHOULD APPEAR IN PROJECT:** task branches/worktrees; durable commits on VERIFIED; primary checkout files unchanged until admit/merge policy says otherwise.

**WHAT SHOULD APPEAR IN PATH:** preparing → engineering → collaboration/repair/steering phases → Verified; idle prompt returns for next task.

**WHAT SHOULD APPEAR IN EVIDENCE:** workspace/mutation/validation markers; indexing/service events when those capabilities run; no false native-resume claims.

---

## Evidence index (closure)

- `docs/reports/g10-evidence/closure/ag-repair.json`
- `docs/reports/g10-evidence/closure/sdk-lsp.json`
- `docs/reports/g10-evidence/closure/scip-live.json`
- `docs/reports/g10-evidence/closure/service-live.json`
- `docs/reports/g10-evidence/closure/background-stale.json`
- `docs/reports/g10-evidence/closure/steering-live.json`
- `docs/reports/g10-evidence/closure/multitask-repl.json`
- `docs/reports/g10-evidence/closure/resume-e2e.json`
- `docs/reports/g10-evidence/closure/viewport-mechanical.json`
- `docs/reports/g10-evidence/guards/guard-matrix.json`

## Continuous drive

Automated/live product acceptance closed. Strongest valid automated verdict:
**PARTIAL_PENDING_OPERATOR_REVIEW**. Operator performs final visual acceptance.
