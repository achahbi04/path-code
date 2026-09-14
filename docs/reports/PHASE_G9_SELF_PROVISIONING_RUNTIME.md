# PATH CODE — G9 SELF-PROVISIONING POLYGLOT ENGINEERING RUNTIME

**Result:** ACCEPTED  
**Baseline:** G8 Native Capability Gateway · freeze `3ca50e0acf04739b647624c840ca86530944e8f4`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Canonical validation:** `npm run check` PASS (typecheck · build · tests · cli:smoke · ledger:verify)  
**Published releases:** UNCHANGED · Publication performed: NO

## Architecture (corrected)

PATH owns one task / session / worktree / living cockpit / independent final
verification / durable Git result.

**Antigravity and GitHub Copilot are full collaborating engineering engines**
in that same session (no permanent primary/secondary). Both may inspect, mutate,
execute, build, test, debug, repair, provision missing capability, and continue
each other’s work under exclusive turn leases + a shared journal.

Self-provisioning under `PATH_RUNTIME_ROOT` via PATH-pinned **mise** supplies
toolchains, LSP, SCIP, Copilot home, and (when Docker is present) disposable
services — without editing user global tool configs and without duplicating
mature engine capabilities.

## Proven

| Area | Evidence |
| --- | --- |
| Runtime layout + pinned mise | `tests/g9/g9-mise-layout.test.ts`; cold runtimes under `docs/reports/g9-evidence/runtime-*` (gitignored) |
| Resolve / provision / env envelope | `tests/g9/g9-resolve.test.ts`, `g9-envelope.test.ts`; session hook in `ag1/session.mjs` |
| Collaborative engines | `ag9/collaborate.mjs`, `ag9/copilot-engine.mjs`; `tests/g9/g9-collaborate.test.ts`; cockpit `session.capability.collaborate` |
| Rust cold-start | `docs/reports/g9-evidence/cold/rust-prepare.json` — rust/cargo/lsp:rust `PATH_RUNTIME_READY`; `cold/rust-cargo-test.txt` PASS |
| Java cold-start | `docs/reports/g9-evidence/cold/java-prepare.json` — java/mvn/lsp:java `PATH_RUNTIME_READY` (macOS `/usr/bin/java` stub rejected); `cold/java-mvn-test.txt` BUILD SUCCESS |
| SCIP monorepo | `docs/reports/g9-evidence/scip/scip-mono-prepare.json` — fingerprint cache + read-only SCIP MCP config |
| Services detection | `docs/reports/g9-evidence/docker/compose-prepare.json` — compose detected; runtime `UNAVAILABLE (docker_missing)` on this host |
| Failure recovery APIs | `tests/g9/g9-failure-matrix.test.ts` |
| G7 / G8 preservation | `npx vitest run tests/g7 tests/g8 tests/g9` → **66/66 PASS** |

## Declared limitations (honest)

- **Docker / live disposable containers:** Docker CLI absent on the acceptance host → services start path not live-proven (detection + honest UNAVAILABLE recorded).
- **Full dual-engine live task** (Antigravity turn + Copilot mutate turn in one operator session) is wired and unit-covered; a long interactive live capture is not required to accept provisioning + collaboration architecture.
- **Windows / untested Linux:** not claimed.
- SCIP for the monorepo fixture used a heuristic symbol map when `scip-typescript` lacked `tsconfig.json` (index still fingerprint-cached and MCP-exposed).

## Non-goals kept

- No GC1 rebuild · no second PATH coding model · no PATH compilers/package managers  
- No npm publish · G8 product freeze SHA unchanged as historical baseline  

## Key modules

- `scripts/pathcode-cli/ag9/` — layout, mise, resolve, provision, envelope, lsp, scip, services, collaborate, copilot-engine, prepare, seam  
- Session: `scripts/pathcode-cli/ag1/session.mjs` collaborative repair loop  
- Bridge `toolEnv` merge: `bridge-client.mjs` + `bridge_main.py`  
- Cockpit: `scripts/path-studio/state.mjs` preparing/provisioning/collaborate events  

## Evidence root

`docs/reports/g9-evidence/` (fixtures + JSON/console proofs). Regenerable toolchains live under `docs/reports/g9-evidence/runtime-*/` and are gitignored.
