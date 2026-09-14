# PATH CODE — G10
# NATIVE COLLABORATIVE ENGINE FABRIC + LIVING COCKPIT 2.0

**Result:** PARTIAL

**Baseline:** `4735ee9817e3bdef69a0d84bc8b949408cc889b0` (G9 PASS clean HEAD)  
**Implementation commit:** `e4d2941cf26acefce3f4dab580d4288eba5aeb73`  
**Report/freeze commit:** `08b4f3e3f44d995aaa3279d0704524000b8c3621`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after freeze

G10 inherits the complete G9 engineering foundation. This phase adds the
collaborative fabric, preferred Copilot SDK surface, durable task continuity,
runtime guards, and Cockpit 2.0 event wiring — without rebuilding G9.

---

## ANTIGRAVITY NATIVE SESSION

| Field | Status |
| --- | --- |
| Integration | PASS — `ag10/ag-session.mjs` binds PATH task to bridge `startTask`/`continueTask` |
| Persistence | PASS — crash-safe checkpoint stores `agTaskId` / `agSessionMode` |
| Events | PASS — bridge activity mapped into G10/session events (live AG run: 94 events) |
| Mutation | PASS — live JS fixture edits via AG |
| Commands | PASS — shell/tool events observed |
| Repair | PARTIAL — repair path wired; live AG JS run verified without needing repair loop |
| Resume | PASS — `NATIVE_RESUME` vs `REHYDRATED_SESSION` classified truthfully |
| Failure recovery | PASS — dead handle → `REHYDRATED_SESSION` from filesystem/Git reality |
| Verified result | PASS — `docs/reports/g10-evidence/live/ag-g10-js.summary.json` → **VERIFIED** |

## COPILOT SDK

| Field | Status |
| --- | --- |
| Integration | PASS — `@github/copilot-sdk` optionalDependency + `ag10/copilot-sdk.mjs` |
| Persistence | PASS — resumable `sessionId` on create/resume |
| Events | PASS — SDK events mapped (`command.started` / `file.modified` / …) |
| Mutation | PASS — live file fix (`copilot-sdk-mutation.json`) |
| Commands | PASS — mutation proof ran tests via engine |
| LSP | INHERITED (G9) — PATH `COPILOT_HOME` LSP config unchanged; not re-claimed as new |
| MCP | INHERITED (G9) — trust filtering preserved |
| Repair | PASS — mutation turn repaired failing test |
| Resume | PASS — `resumeSession` attempted; create fallback recorded honestly |
| SDK → CLI fallback proof | PASS — forced `preferSdk:false` + EACCES/auth degrade → `cli_fallback` |
| Auth failure preservation | PASS — `AUTH_REQUIRED` classification; task/worktree preserved |
| Verified result | PASS — native SDK turn `SDK_OK` + mutation **PASS** |

## COLLABORATION

| Field | Status |
| --- | --- |
| Same task | PASS — `g10-collab-shared` |
| Same worktree | PASS — shared PATH task worktree |
| Shared task reality | PASS — resume brief + Git fingerprints |
| AG contribution | PASS — AG turn finished on shared worktree (`REHYDRATED_SESSION`) |
| Copilot contribution | PASS — native SDK material edit of `src/add.js` |
| Round-trip continuation | PASS — AG started from post-Copilot reality |
| Mutation lease | PASS — `withMutationLease` / G9 `withCollabTurn` |
| Stale-write protection | PASS — fingerprint check before mutate |
| No-progress circuit breaker | PASS — warn@2 stop@3 (unit + guard matrix) |
| Productive long collaboration | PASS — productive handoffs reset breaker (>3 allowed) |
| Verified result | PASS — `collab-dual.json` **PASS**, npm test 0, validation **VERIFIED** |

## G9 CAPABILITY INTEGRATION

| Field | Status |
| --- | --- |
| Self-provisioning | PASS — live AG preparing/provisioning/ready events |
| Polyglot | INHERITED — G9 live matrix preserved |
| LSP | PASS — typescript language-server ready in AG live prep |
| SCIP | INHERITED — G9 SCIP MCP preserved; G10 event family wired |
| Affected checks | PASS — `session.capability.affected` in AG live |
| Containers/services | INHERITED — G9 disposable services preserved |

## LIVING COCKPIT 2.0

| Field | Status |
| --- | --- |
| Environment preparation | PASS — preparing/provisioning/ready events |
| Language intelligence | PASS — LSP ready in prep; cockpit label wiring |
| Code intelligence | PASS — event→phase mapping (`Code intelligence`) unit-proven |
| Implementing | PASS — applying/edit events in AG live |
| Build/test | PASS — validation plan/running/result |
| Collaboration | PASS — collaborate events + phase labels |
| Repair | PASS — Repairing phase wiring |
| Background work | PASS — background/stale event families + guard |
| Steering | PASS — pending/applied queue + terminal `drainSteering` |
| Validation | PASS — independent PATH validation events |
| Result | PASS — engineering.result / terminal |
| Second task | PARTIAL — session REPL multi-task path unchanged; not re-proven live |
| Third task | PARTIAL — same |

## PERSISTENCE / RECOVERY

| Field | Status |
| --- | --- |
| Crash-safe checkpoint | PASS — atomic JSON under runtime metadata/tasks |
| PATH restart | PASS — `resume-proof.json` reopen + reconcile |
| Invalid AG session | PASS — rehydrate classification |
| Invalid Copilot session | PASS — SDK resume miss → create / CLI fallback |
| UI reconstruction | PARTIAL — hydration events wired; full TTY resize/manual not operator-reviewed |
| External action idempotency | PASS — `ExternalActionRegistry` (guard K) |

## RUNTIME GUARDS

| Field | Status |
| --- | --- |
| Background stale result | PASS — fingerprint STALE (guard D) |
| Provision concurrency | PASS — inherits G9 locks (guard I) |
| Cancellation | PASS — lease release / AC abort path (guard J) |
| Cost/resource breaker | PASS — time/handoff ceilings implemented |
| Degraded mode visibility | PASS — `cli_fallback` / `AUTH_REQUIRED` recorded truthfully |

Guard matrix: `docs/reports/g10-evidence/guards/guard-matrix.json` → **PASS**

## MANUAL UI ACCEPTANCE

| Field | Status |
| --- | --- |
| Wide / Narrow / Resize | PARTIAL — not operator-reviewed in this freeze |
| ANSI | PARTIAL — no new ANSI regressions found in unit/cockpit tests |
| Scrollback | PARTIAL — living frame path unchanged; needs operator eyes |
| Terminal restore | PARTIAL — needs operator eyes |

## CANONICAL VALIDATION

- `npm run check` → **PASS** (1424/1424 tests) with clean PATH
- Primary checkout protection: preserved (`primaryUntouched` in collab)
- Credential isolation: PATH-owned runtime; SDK uses user Copilot auth discovery (no secrets in checkpoints)
- Published releases: **UNCHANGED**
- Publication: **NO**

## WHY PARTIAL (not PASS)

G10 engineering fabric, Copilot SDK native surface, AG live VERIFIED, shared-worktree
collaboration, guards A–K, resume reconciliation, and canonical check are proven.

Still open for a full product PASS:

1. Operator manual Living Cockpit 2.0 visual review (§24)
2. Live multi-task second/third task in one PATH REPL session
3. Live steering injection during an active mutation (queue proven in guards; not in a long live TUI session)
4. End-to-end PATH process restart that reconnects **both** provider sessions inside the product cockpit (checkpoint/reopen proven; full product UX resume not filmed)

## Evidence index

- `docs/reports/g10-evidence/live/copilot-sdk-probe.json` — SDK_NATIVE_OK
- `docs/reports/g10-evidence/live/copilot-sdk-mutation.json` — PASS
- `docs/reports/g10-evidence/live/ag-g10-js.summary.json` — VERIFIED
- `docs/reports/g10-evidence/live/collab-dual.json` — PASS
- `docs/reports/g10-evidence/live/resume-proof.json` — PASS
- `docs/reports/g10-evidence/guards/guard-matrix.json` — PASS
- `tests/g10/g10-fabric.test.ts`, `tests/g10/g10-cockpit.test.ts`

## Continuous drive

Continue from this PARTIAL: close manual UI acceptance + product resume UX, then
promote to PASS without resetting G9/G10 work.
