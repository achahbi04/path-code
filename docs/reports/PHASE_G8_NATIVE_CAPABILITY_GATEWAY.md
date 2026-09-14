# PATH CODE — G8 NATIVE CAPABILITY GATEWAY

**Result:** FROZEN  
**Baseline:** G7 Living Cockpit Completion · `eacd7638b9df4e82085b01d77ff5e483744aa51a`  
**Implementation commit:** `b6dd2f0502bafa7fd5dc685003ce21699e92f363`  
**Advisory acceptance commit:** `b7d1e2aff03fdeb531531595aaddd63b57c81c60`  
**Freeze commit:** (recorded in follow-up SHA note)  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after G8 freeze  
**Canonical validation:** `npm run check` PASS (typecheck · build · 147 files / 1376 tests · cli:smoke · ledger:verify)  
**Published releases:** UNCHANGED · Publication performed: NO

## Freeze baseline — proven vs declared limitations

**Proven (accepted):** Antigravity sole primary engineer · polyglot toolchain
discovery · native MCP discovery/use · MCP trust/filter · real read-only Copilot
advisory into the same Antigravity session · same-session repair · PATH
independent validation · G7 living cockpit preserved · credential isolation ·
primary checkout protection.

**Declared limitations (not claimed / not marketed):** Rust live engineering not
established (cargo unavailable) · Java live engineering not established (Maven
unavailable) · only clangd LSP currently ready · Copilot LSP not available/proven.
Do not install toolchains merely to improve the report.

## Purpose

PATH becomes a polyglot engineering **capability gateway** for the existing
Antigravity session: discover toolchains/LSP/MCP, scope trust + credentials,
optional Copilot read-only advisory, same-session repair after PATH final
validation failure, and engineering handoff distinct from PATH evidence.

PATH does not become a second coding model. Antigravity remains primary.

## Architecture lock (preserved)

PATH owns: session product, worktrees, capability discovery/scoping, credential
isolation, durable Git result, independent final verification, external authority.

Antigravity owns: engineering reasoning, edits, tool sequencing, test/debug loop,
native use of connected MCP/tools.

Not built: second planner, PATH memory/AST brain, custom LSP engine, GC1, Studio,
agent swarm.

## Implementation surface

| Area | Location |
| --- | --- |
| Capability discovery | `scripts/pathcode-cli/ag8/discover.mjs` |
| MCP trust firewall | `scripts/pathcode-cli/ag8/mcp.mjs` |
| Copilot advisory | `scripts/pathcode-cli/ag8/copilot.mjs` |
| Repair helpers | `scripts/pathcode-cli/ag8/repair.mjs` |
| Engineering handoff | `scripts/pathcode-cli/ag8/handoff.mjs` |
| Bridge continue + MCP policy allow | `scripts/pathcode-cli/ag1/python/bridge_main.py` |
| Session wiring | `scripts/pathcode-cli/ag1/session.mjs` |
| Native polyglot validation | `scripts/pathcode-cli/ag5/native-validation.mjs` |
| TUI capability/handoff | `scripts/path-studio/state.mjs`, `inline-studio.mjs` |

## Polyglot discovery

Fixtures under `/tmp/pathcode-g8-polyglot/` + evidence JSON in
`docs/reports/g8-evidence/discovery-*.json` and `toolchain-matrix.md`.

| Family | This host |
| --- | --- |
| JavaScript/TypeScript | ready · npm · validation scripts admitted · live engineering accepted |
| Python | ready · project `.venv` pytest · live-capable |
| Go | ready · `go test ./...` · live-capable |
| Rust | **metadata discovery only** · cargo unavailable · **not** full live engineering acceptance |
| C/C++ | ready · make · clangd · `make test` |
| Java | **metadata discovery only** · mvn unavailable · **not** full live engineering acceptance |

## Language intelligence

| LSP | Status |
| --- | --- |
| TypeScript / Python / Go / Rust / Java | unavailable on this host (honest) |
| C/C++ clangd | ready |

Unavailable optional LSP does not invent “ready”.

## MCP

Policy fixture: `docs/reports/g8-evidence/mcp-policy.json`

| Check | Result |
| --- | --- |
| Project `.mcp.json` discovery | PASS |
| evil_deploy refused | PASS |
| mutation tools hidden; read-only exposed | PASS |
| credential env stripped | PASS |
| Native Antigravity usage | **PASS** — live `lookup_doc` (`mcp-live2`) |
| TUI MCP activity | PASS — `activity: mcp` / label MCP |
| Engineering + PATH validation | VERIFIED |

Live evidence: `docs/reports/g8-evidence/live/mcp-live2.json`

Bridge fix: filtered MCP tools must be `policy.allow`’d or `deny_all` blocks them.

## Copilot CLI

| Field | Status |
| --- | --- |
| CLI install | `/Users/achahbi/.local/bin/copilot` · v1.0.84-4 (also `/tmp/pathcode-g8-tools`) |
| Auth | **PASS** — programmatic `copilot -p "reply with exactly OK" --silent` → `OK` |
| Probe | `docs/reports/g8-evidence/copilot-probe.json` · status `ready` |
| Advisory case | **PASS** — overloaded `resolveRef` type ambiguity (`catalog.ts` / `user-key`) |
| Trigger | first TYPECHECK repair via `symbol_ambiguity` (session.mjs) |
| Path | analyzing → advisory returned → continue (2034 chars vs ~676 without) → VERIFIED |
| Advisory value | **helped** |
| Live evidence | `docs/reports/g8-evidence/live/copilot-advisory.json` + `.summary.json` |

Read-only prompt prefix keeps Copilot from hanging on denied write/edit tools.
Normal PATH engineering still continues if advisory is unavailable.

## Same-session repair

| Proof | Result |
| --- | --- |
| Bridge continue protocol (fake AG) | PASS · `tests/g8/g8-bridge-continue.test.ts` |
| Live: finish → PATH test FAIL → Repairing → finish → VERIFIED | **PASS** · `live/repair-live2.*` |
| Live: TYPECHECK FAIL → advisory → Repairing → VERIFIED | **PASS** · `live/copilot-advisory.*` |

## Engineering handoff

`session.engineering.handoff` distinct from EVIDENCE. Policy-denial noise scrubbed
in `handoff.mjs`. Handoff never overrides PATH classification.

## Living TUI / G7

`tests/g7` + capability events (MCP / Engineering review / Repairing) — no
provider branding in normal UI. G7 cockpit architecture not reopened.

## Focused tests

`npx vitest run tests/g7 tests/g8` — see acceptance commit.

## Canonical validation

`npm run check` — see freeze / acceptance commit.

## Credential isolation / primary checkout

Live MCP + repair + Copilot advisory: primary checkout untouched; MCP secrets
stripped from env; evil_deploy never enabled; Copilot advisory read-only.

## Published releases

`v1.0.0` / `v1.0.1` — UNCHANGED. No publication.
