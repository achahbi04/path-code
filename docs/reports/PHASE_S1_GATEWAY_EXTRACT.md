# PATH CODE — S1
# COMPLETE ENGINEERING GATEWAY EXTRACTION

**S1 RESULT:** PASS

**PRODUCT STATUS:** PATH Code now runs local engineering through an extracted
PATH Gateway runtime. The living CLI is a presentation client of that runtime;
a headless client can bind, start, attach, steer, cancel, and observe the same
tasks over a Unix-socket IPC boundary. Antigravity and Copilot remain full
engineering collaborators (not advisory hierarchy). Extension slots exist for
Cursor, PATH Build, and PATH Studio without inventing those products in S1.

**MANUAL_UI_ACCEPTANCE:** PENDING_OPERATOR_REVIEW (carried from S0; not
re-declared accepted)

**Published releases:** UNCHANGED  
**Publication performed:** NO

---

## 1. EXECUTIVE RESULT

Automated gateway extraction is mechanically green. Live Antigravity + Copilot
engineering through the extracted gateway is **LIVE_PROVEN** on a genuine
non-fixture project (isolated copy of the operator demo), including:

- CLI → Gateway → live engines (`PATHCODE_GATEWAY_EXTERNAL=1`)
- Headless same-task attach while engines were working
- Disconnect / reattach without cancelling the running task
- Collaboration fabric events (`session.capability.collaborate`) on the
  gateway-owned task
- Capability prepare / LSP / MCP path through the gateway session
- Engines bookkeeping: antigravity + copilot `available`; cursor
  `slot_reserved` (S3 only — not claimed LIVE)

---

## 2. GIT

- **Starting HEAD (S1 extract):** `843abcef2f4820bafd2e2c3fbdee31e215dd8d95`
- **Prior gateway extract implementation:** `1763a6d7ba5636f2d5bec2793b6f084e57a47865`
- **Prior S1 PARTIAL tip:** `aa684eaf3a45e3617ba5f6a7b9d9b75046df1840`
- **Live-gap implementation commit:** `dfe5abd47a8845cba30eff93d584cbd8e1c7aaf2`
- **Report commit:** `REPORT_SHA_PLACEHOLDER`
- **Current HEAD:** `REPORT_SHA_PLACEHOLDER`
- **Branch:** `cursor/pathcode-antigravity-v1`
- **Working tree:** clean after freeze

Named freeze SHAs are authoritative; avoid repeated self-referential tip chases.

---

## 3. ARCHITECTURE

### Gateway process / runtime
- `createGatewayRuntime()` owns project bind, tasks, event bus, steering,
  cancel, snapshots, capability registry.
- Engineering execution calls existing `runAntigravityEngineeringSession`
  (AG + Copilot collaboration fabric inside).

### IPC / client boundary
- Unix domain socket: short TMPDIR path `pc-gw-<hash>.sock` (macOS sun_path
  safe); pointer at `$PATHCODE_RUNTIME_ROOT/gateway/socket.path`
- NDJSON request/response + event envelopes
- Mode `0600` socket; credentials stripped from client events
- Embedded CLI launch starts the socket on the **same** runtime (default).
- `PATHCODE_GATEWAY_EXTERNAL=1`: CLI attaches via `ensureGateway()` so
  disconnect ≠ cancel (required for live multi-client / reattach).

### Task / session / engine ownership
- Gateway owns task lifecycle and engine sessions.
- Lost TUI / CLI connection does **not** cancel engineering.
- Explicit `task.cancel` propagates to prompt cancel + AbortSignal.

### CLI migration
- `scripts/pathcode.mjs` embeds gateway for local execution by default
  (bypass when `testIo.runAg1Session` injected or `PATHCODE_USE_GATEWAY=0`).
- External client mode for detached ownership / disconnect proofs.
- Living composer steering/cancel bridge into gateway task ids.
- Presentation (composer, ANSI, title) remains client-side (S0 preserved).

### Headless client
- `scripts/pathcode-cli/gateway/headless.mjs`
- `PATHCODE_GATEWAY_MODE=inprocess` for local tooling; default socket via
  `ensureGateway()`.

### Evidence / completion
- Project checks remain engineering feedback via existing validation path;
  comments updated: not a second PATH judge authority.

---

## 4. EXTRACTION INVENTORY (floor)

| Capability | Original | Gateway entry | Client access | Status |
| --- | --- | --- | --- | --- |
| Antigravity session | `ag1/session.mjs` | `runtime.startTask` | CLI / headless | **LIVE_PROVEN** |
| Copilot collaborator | `ag10/copilot-sdk.mjs` + ag9 | via AG session fabric | CLI / headless | **LIVE_PROVEN** (collaborate events on gateway task) |
| Shared worktree / collab | `ag9/collaborate.mjs`, ag10 | via session | events | **LIVE_PROVEN** |
| Checkpoints / steering | `ag10/*` | steer/cancel/snapshot | IPC | **LIVE_PROVEN** (mechanical + live ownership) |
| Prepare / mise / LSP / SCIP / MCP / services | `ag9/*`, `ag8/mcp.mjs` | via session prepare | capabilities list + events | **LIVE_PROVEN** (prepare + LSP/MCP on live task) |
| Worktree / git / admission | `ag1/task-worktree`, admission, commit | bind + session | project.status | **LIVE_PROVEN** |
| GitHub delivery | `ag4/*` | callable; not auto | CLI / `delivery.invoke` deferred | **IMPLEMENTED_LIMITED** |
| Living TUI / composer | `inline-studio`, `composer`, title | client-only | CLI | **LIVE_PROVEN** (S0; regression path wired) |
| Cursor engine | — | registry `slot_reserved` | — | **NOT_BUILT** (S3) |
| PATH Build workflow | — | extensibility slot | — | **NOT_BUILT** (S5) |
| PATH Studio client | — | extensibility slot | — | **NOT_BUILT** (S6) |

---

## 5. ENGINE COVERAGE

- Antigravity: complete PATH-side integration behind gateway call path — live
- Copilot: full collaborator through gateway-owned session — live collaborate
- Native features at gateway API: task attach/snapshot/steer/cancel/capabilities
- Intentionally later: Studio drive modes, Build workflow, Cursor SDK (slots only)
- Auth/fallback: existing AUTH_REQUIRED / SDK classify paths unchanged

**Engines JSON bookkeeping (honest):**

```json
[
  { "id": "antigravity", "status": "available", "role": "engineering_collaborator" },
  { "id": "copilot", "status": "available", "role": "engineering_collaborator" },
  { "id": "cursor", "status": "slot_reserved", "role": "engineering_collaborator" }
]
```

`cursor` is an extension slot only. S1 live proof covers antigravity + copilot.

---

## 6. CAPABILITY COVERAGE

Polyglot, provisioning, LSP, SCIP, MCP, commands/build/tests, services,
GitHub functions, steering, background ops, checkpoints — preserved by reuse
of existing modules. Live gateway task exercised prepare + capability
discovered/MCP/provision/ready events (see live evidence).

---

## 7. CLIENT-SIDE INVENTORY

Remains in CLI: raw keyboard, paste, composer paint, terminal title/restore,
ANSI/viewport, shortcuts, AG4 publication UX prompts.

Shared projections reusable by Studio: `path-studio/state.mjs`, session
events, gateway snapshots/events.

---

## 8. DISCOVERED / ADDED DURING EXTRACTION

- Gateway capability registry with explicit Cursor/Build/Studio slots
- Unix socket + embedded same-process server for multi-client attach
- Short TMPDIR socket paths (fix EINVAL on long runtime roots / macOS)
- `PATHCODE_GATEWAY_EXTERNAL=1` CLI client mode (disconnect ≠ cancel)
- Prompt adapter for headless/gateway-owned cycles
- Credential field sanitization on event egress
- Fake-engine switch for mechanical IPC proofs only

Legacy/dormant: GC1 cloud path remains alternate execution mode; not the
gateway default. Foundation kernel `dist/cli` unchanged for published npm.

---

## 9. LIVE EVIDENCE

- Mechanical: `docs/reports/g10-evidence/s1/mechanical.json` → **PASS**
  (`PATHCODE_GATEWAY_FAKE_ENGINE=1` — IPC only)
- Live: `docs/reports/g10-evidence/s1/live/live.json` → **PASS**
  - Task `7e4e3ded-1e19-4c2d-add5-5361fa513a8e` → **VERIFIED**
  - Project: `docs/reports/g10-evidence/tmp/pathcode-s1-live-project`
    (isolated copy of operator demo — not `/tmp/pathcode-s1-repo-*`)
  - CLI external start + headless attach while `running`
  - CLI SIGTERM disconnect while `running`; gateway retained task; reattach OK
  - `collaborateEvents: 2`; prepare + LSP/MCP capability sample present
- Harness: `docs/reports/g10-evidence/s1/run-live.mjs`
- Demo / operator project (source):  
  `/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo`
- Headless: `node scripts/pathcode-cli/gateway/headless.mjs …`
- S0 operator visual review still **PENDING**

---

## 10. OPERATOR ACCESS

```bash
DEMO="/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/tmp/pathcode-g10-operator-demo"
test -d "$DEMO" || { echo "missing demo project"; exit 1; }
cd "$DEMO" || exit 1
PATH="/opt/homebrew/bin:$HOME/.local/bin:$PATH" \
GOOGLE_CLOUD_PROJECT="${GOOGLE_CLOUD_PROJECT:-path-code-gc1-260910}" \
PATHCODE_RUNTIME_ROOT="/Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/docs/reports/g10-evidence/runtime-live-ag" \
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode.mjs --execution local
```

External gateway (survives CLI disconnect):

```bash
# terminal A — daemon
PATHCODE_RUNTIME_ROOT="…/runtime-live-ag" \
node scripts/pathcode-cli/gateway/server-main.mjs

# terminal B — CLI client
PATHCODE_GATEWAY_EXTERNAL=1 PATHCODE_RUNTIME_ROOT="…/runtime-live-ag" \
node scripts/pathcode.mjs --execution local
```

Headless capabilities:

```bash
PATHCODE_GATEWAY_MODE=inprocess \
node /Users/achahbi/Projects/path-code-worktrees/cursor-pathcode-antigravity-v1/scripts/pathcode-cli/gateway/headless.mjs capabilities
```

Candidate executable: checkout `scripts/pathcode.mjs` (not the published npm
`pathcode` bin — ag8–ag10 packaging remains S2).

---

## 11. HANDOFF TO S2+

S2: real-project workflow polish, settings/history, result integration UX,
package `files` include gateway + ag8–ag10.  
S3: Cursor peer engine via registry.  
S5/S6: Build / Studio clients on same gateway.

---

## 12. KNOWN DEFECTS / LIMITATIONS

- Default CLI still embeds gateway in-process (auth continuity). Use
  `PATHCODE_GATEWAY_EXTERNAL=1` when disconnect/reattach ownership matters.
- `PATHCODE_GATEWAY_FAKE_ENGINE` is test/evidence-only — never for product claims
- Operator UI acceptance still pending from S0
- SCIP/services not required on every JS add-fix film; prepare + LSP/MCP
  were the representative live capability path for this closure
