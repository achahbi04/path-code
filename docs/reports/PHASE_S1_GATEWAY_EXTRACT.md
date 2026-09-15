# PATH CODE — S1
# COMPLETE ENGINEERING GATEWAY EXTRACTION

**S1 RESULT:** PARTIAL

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

Automated gateway extraction is **mechanically green** (IPC, ownership,
same-task attach, steer/cancel, capability registry, credential sanitization,
canonical check pending at freeze).

Live Antigravity/Copilot turns through the gateway use the **same**
`runAntigravityEngineeringSession` / G10 fabric entry points as before —
capability preservation by call-path ownership. Full paid multi-engine film of
every polyglot family through the new owner is **IMPLEMENTED_LIMITED** /
inherited where unchanged; newly owned IPC paths are **LIVE_PROVEN**
mechanically.

---

## 2. GIT

Filled at freeze:

- **Starting HEAD:** `843abcef2f4820bafd2e2c3fbdee31e215dd8d95`
- **Implementation commit:** `1763a6d7ba5636f2d5bec2793b6f084e57a47865`
- **Report commit:** `1763a6d7ba5636f2d5bec2793b6f084e57a47865` (combined with implementation; docs SHA sync follows)
- **Current HEAD:** `1763a6d7ba5636f2d5bec2793b6f084e57a47865`
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
- Unix domain socket: `$PATHCODE_RUNTIME_ROOT/gateway/pathcode-gateway.sock`
- NDJSON request/response + event envelopes
- Mode `0600` socket; credentials stripped from client events
- Embedded CLI launch starts the socket on the **same** runtime (no second
  backend). Detached `server-main.mjs` supported for headless-only starts.

### Task / session / engine ownership
- Gateway owns task lifecycle and engine sessions.
- Lost TUI connection does **not** cancel engineering.
- Explicit `task.cancel` propagates to prompt cancel + AbortSignal.

### CLI migration
- `scripts/pathcode.mjs` embeds gateway for local execution (bypass when
  `testIo.runAg1Session` injected or `PATHCODE_USE_GATEWAY=0`).
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
| Antigravity session | `ag1/session.mjs` | `runtime.startTask` | CLI / headless | **IMPLEMENTED_LIMITED** (same entry; IPC LIVE) |
| Copilot collaborator | `ag10/copilot-sdk.mjs` + ag9 | via AG session fabric | CLI / headless | **IMPLEMENTED_LIMITED** |
| Shared worktree / collab | `ag9/collaborate.mjs`, ag10 | via session | events | **IMPLEMENTED_LIMITED** |
| Checkpoints / steering | `ag10/*` | steer/cancel/snapshot | IPC | **LIVE_PROVEN** (mechanical) |
| Prepare / mise / LSP / SCIP / MCP / services | `ag9/*`, `ag8/mcp.mjs` | via session prepare | capabilities list + events | **IMPLEMENTED_LIMITED** |
| Worktree / git / admission | `ag1/task-worktree`, admission, commit | bind + session | project.status | **LIVE_PROVEN** (bind) |
| GitHub delivery | `ag4/*` | callable; not auto | CLI / `delivery.invoke` deferred | **IMPLEMENTED_LIMITED** |
| Living TUI / composer | `inline-studio`, `composer`, title | client-only | CLI | **LIVE_PROVEN** (S0; regression path wired) |
| Cursor engine | — | registry `slot_reserved` | — | **NOT_BUILT** (S3) |
| PATH Build workflow | — | extensibility slot | — | **NOT_BUILT** (S5) |
| PATH Studio client | — | extensibility slot | — | **NOT_BUILT** (S6) |

---

## 5. ENGINE COVERAGE

- Antigravity: complete PATH-side integration remains behind gateway call path
- Copilot: full collaborator (SDK + CLI fallback + stable path/Keychain fix from S0)
- Native features newly exposed at gateway API: task attach/snapshot/steer/cancel/capabilities
- Intentionally later: Studio drive modes, Build workflow, Cursor SDK (slots only)
- Collaboration: preserved inside session/G10 fabric
- Auth/fallback: existing AUTH_REQUIRED / SDK classify paths unchanged

---

## 6. CAPABILITY COVERAGE

Polyglot, provisioning, LSP, SCIP, MCP, commands/build/tests, services,
GitHub functions, steering, background ops, checkpoints — **preserved by reuse
of existing modules**; not reimplemented. Gateway lists them for future clients.

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
- Prompt adapter for headless/gateway-owned cycles
- Credential field sanitization on event egress
- Fake-engine switch for mechanical IPC proofs only

Legacy/dormant: GC1 cloud path remains alternate execution mode; not the
gateway default. Foundation kernel `dist/cli` unchanged for published npm.

---

## 9. LIVE EVIDENCE

- Mechanical: `docs/reports/g10-evidence/s1/mechanical.json` → **PASS**
- Demo project (operator):  
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

Headless capabilities (in-process):

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

- Full live AG+Copilot collaborative film through gateway owner not re-shot in S1
  (call path identical; mark IMPLEMENTED_LIMITED for live re-proof)
- Detached daemon auto-start via `ensureGateway` exists; normal CLI embeds
  runtime+socket in-process for auth continuity
- `PATHCODE_GATEWAY_FAKE_ENGINE` is test/evidence-only — never for product claims
- Operator UI acceptance still pending from S0
