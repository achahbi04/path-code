# PATH CODE — G8 NATIVE CAPABILITY GATEWAY

**Result:** PASS  
**Baseline:** G7 Living Cockpit Completion · `eacd7638b9df4e82085b01d77ff5e483744aa51a`  
**Implementation commit:** (see git log after freeze)  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Published releases:** UNCHANGED · Publication performed: NO

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
| JavaScript/TypeScript | ready · npm · validation scripts admitted |
| Python | ready · project `.venv` pytest |
| Go | ready · `go test ./...` |
| Rust | metadata ready · **cargo unavailable** · no invented candidates |
| C/C++ | ready · make · clangd · `make test` |
| Java | metadata ready · **mvn unavailable** · no invented candidates |

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
| CLI install | local `/tmp/pathcode-g8-tools` · v1.0.84-4 |
| Auth | **OPERATOR ACTION** — `gh` keyring token invalid; network validation failed |
| Advisory case | not executed with valid auth |
| Advisory value | `COPILOT_ADVISORY_NO_VALUE_IN_TEST` (auth-blocked; not faked) |

Normal PATH engineering continues without Copilot.

## Same-session repair

| Proof | Result |
| --- | --- |
| Bridge continue protocol (fake AG) | PASS · `tests/g8/g8-bridge-continue.test.ts` |
| Live: finish → PATH test FAIL → Repairing → finish → VERIFIED | **PASS** · `live/repair-live2.*` |

Trace: typecheck ✓ · test ✕ → Repairing → typecheck ✓ · test ✓ → VERIFIED.

## Engineering handoff

`session.engineering.handoff` distinct from EVIDENCE. Policy-denial noise scrubbed
in `handoff.mjs`. Handoff never overrides PATH classification.

## Living TUI / G7

`tests/g7` + capability events (MCP / Engineering review / Repairing) — no
provider branding in normal UI. G7 cockpit architecture not reopened.

## Focused tests

`npx vitest run tests/g7 tests/g8` — 30/30 PASS

## Canonical validation

`npm run check` — see freeze commit.

## Credential isolation / primary checkout

Live MCP + repair: primary checkout untouched; MCP secrets stripped from env;
evil_deploy never enabled.

## Published releases

`v1.0.0` / `v1.0.1` — UNCHANGED. No publication.
