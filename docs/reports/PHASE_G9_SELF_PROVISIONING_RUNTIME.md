# PATH CODE — G9
SELF-PROVISIONING POLYGLOT + COLLABORATIVE ENGINEERING RUNTIME

**Result:** PARTIAL  
**Baseline:** G8 freeze `3ca50e0acf04739b647624c840ca86530944e8f4`  
**Implementation commit:** `61ed3f272e9d03dc53490c92afc8cdb0b82f7d54`  
**Report commit (at prior freeze):** `314103c68e15d9fda3c57ccbceba620315de44e1`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean at report-commit HEAD (re-verified mechanically before gap-closure drive)  
**Canonical validation:** `npm run check` PASS (154 files / 1412 tests)  
**Published releases:** UNCHANGED  
**Publication:** NO  

This report follows the **G9 AUTHORITATIVE CONSOLIDATED PLAN** (supersedes earlier
G9 wording that cast Antigravity as sole engineer / Copilot as advisory-only).

## Verdict (truthful)

Core collaborative + self-provisioning architecture is implemented and
**live-proven** for Antigravity full engine, Copilot full engine, and dual-engine
collaboration on disposable Rust tasks. Rust/Java cold toolchain+LSP acquisition
and cargo/mvn validation are proven. SCIP prepare + affected briefing exist;
Docker live start is **not** proven on this host (`docker_missing`). Not every
polyglot family has a live VERIFIED engineering task. Therefore **PARTIAL**, not PASS.

---

## SELF-PROVISIONING

| Field | Status |
| --- | --- |
| Capability resolution | PASS — `ag9/resolve.mjs` + prepare brief |
| Runtime/tool acquisition | PASS — PATH-pinned mise under `PATH_RUNTIME_ROOT` |
| Version resolution | PASS — project evidence (toolchain files, wrappers, engines) |
| Cache | PASS — reusable toolchains/LSP/SCIP under runtime root (gitignored) |
| Self-healing | PARTIAL — unit failure matrix + bootstrap python≥3.10 repair; not every live fault path exercised |
| Zero-manual-setup proof | PASS for Rust/Java cold start (no operator install prompts) |

Evidence: `docs/reports/g9-evidence/cold/rust-prepare.json`, `cold/java-prepare.json`,
`cold/rust-cargo-test.txt`, `cold/java-mvn-test.txt`.

## POLYGLOT

| Family | Status |
| --- | --- |
| JS/TS | PARTIAL — host node/npm + TS LSP prepare (compose/scip fixtures) |
| Python | PARTIAL — resolver/provision paths + tests; no live VERIFIED task this drive |
| Go | PARTIAL — provision/LSP paths; no live VERIFIED task this drive |
| Rust cold start | PASS — establish cargo/rust-analyzer; cargo test PASS |
| Java cold start | PASS — JDK + mvn + Eclipse JDT LS; `mvn test` BUILD SUCCESS |
| C/C++ | PARTIAL — clangd path retained; not reduced to Make-only, but live breadth not fully proven |
| .NET/C# | UNAVAILABLE / unproven on this host |

## LANGUAGE INTELLIGENCE

| LSP | Status |
| --- | --- |
| TS/JS | PASS (prepare READY) |
| Python | PARTIAL (wired; limited live) |
| Go | PARTIAL (wired; limited live) |
| Rust | PASS (cold + live AG/CP) |
| C/C++ | PARTIAL (clangd) |
| Java | PASS (Eclipse JDT LS READY) |
| C# | UNAVAILABLE / unproven |

Both engines share PATH-prepared capability via env envelope / Copilot home adapters
(`ag9/copilot-lsp.mjs`) — no duplicate ideological installs.

## SCIP

| Field | Status |
| --- | --- |
| Indexers | PASS — mature indexer orchestration + fingerprint cache |
| Large-repo case | PARTIAL — `docs/reports/g9-evidence/scip/` + `live-repos/scip-mono` prepare |
| Index time | recorded in scip prepare JSON |
| Query time | MCP-exposed; not a timed live engineering consumption proof |
| Observed usefulness | PARTIAL — prepare/MCP ready; not proven as decisive input in a live multi-package VERIFIED task |

## CHANGE IMPACT

| Field | Status |
| --- | --- |
| Mechanism | project-native where detected (cargo/pnpm/…) + conservative fallback |
| Selection classification | EXACT_BY_PROJECT_SYSTEM / CONSERVATIVE / UNAVAILABLE (truthful) |
| Affected checks | PASS in prepare briefs (e.g. cargo CONSERVATIVE, pnpm PROJECT_EXACT on scip-mono) |
| Final broader checks | PASS — independent PATH validation still runs at completion |
| Observed reduction | PARTIAL — architecture proven; not quantified on a large live monorepo edit |

## ANTIGRAVITY FULL ENGINE

| Field | Evidence |
| --- | --- |
| Real mutation | PASS — `docs/reports/g9-evidence/live/ag-rust-fix.summary.json` |
| Command execution | PASS |
| Build/test | PASS — cargo validation |
| Repair | PASS — fixed intentional `add` bug |
| Verified result | **VERIFIED** commit `0f79e36091f8b6c4112b65b1846a67af91f978cf`; primaryUntouched |

## COPILOT FULL ENGINE

| Field | Evidence |
| --- | --- |
| Integration surface | Copilot CLI programmatic (`ag9/copilot-engine.mjs`, `--allow-all-tools`, deny push) |
| Persistent session | PARTIAL — full turn harness; not a multi-hour ACP session |
| Real mutation | PASS — `mul` `a+b`→`a*b` |
| Command execution | PASS |
| Build/test | PASS — independent cargo check/test |
| Repair | PASS |
| Verified result | **VERIFIED** commit `5be55b9a2e1a60cb6d0156fd847d74a0d907b91c`; primaryUntouched |

Harness: `docs/reports/g9-evidence/run-live-copilot.mjs` · summary `live/cp-rust-fix.summary.json`.

## COLLABORATIVE ENGINEERING

| Field | Evidence |
| --- | --- |
| Same PATH task | PASS — `g9cl-fa911165` |
| Same worktree | PASS |
| Shared state | PASS — collab journal + mid validation handoff |
| Antigravity contribution | PASS — fixed `add` only (`addFixed: true`, `mulFixed: false`) |
| Copilot contribution | PASS — fixed `mul` (`mulFixed: true`) |
| Handoff mechanism | exclusive `withCollabTurn` leases + journal |
| Conflict protection | serialized turns; mid validation PARTIALLY_VERIFIED as expected |
| Return-to-engine continuation | PARTIAL — session repair loop supports return; this live case was AG→Copilot |
| Final verification | **VERIFIED** |
| Durable result | commit `701f038238d2972f2d78b5e0cbf8ddef4e606c5d`; primaryUntouched |

Evidence: `live/collab-dual.summary.json`, `live/runner-status.json`.

## CONTAINERS / SERVICES

| Field | Status |
| --- | --- |
| Environment case | compose fixture detected |
| Automatic startup | **UNAVAILABLE** — `docker_missing` on acceptance host |
| Engineering against environment | not live-proven |
| Cleanup | N/A (no PATH-started containers) |

Evidence: `docs/reports/g9-evidence/docker/compose-prepare.json`.

## LIVING UI

Provisioning / language-intelligence / SCIP / collaboration / affected / repair /
final verification events are wired into the cockpit (`session.capability.*`,
`path-studio/state.mjs`). Live harnesses exercised capability + collaborate event
streams (AG summary lists preparing/provisioning/ready; collab uses leases).

## SECURITY / PRODUCT INTEGRITY

| Field | Status |
| --- | --- |
| Primary checkout | PASS — untouched on AG/CP/collab lives |
| Credential isolation | PASS — PATH runtime / COPILOT_HOME / toolEnv envelope |
| Worktree boundary | PASS |
| Cancellation | preserved from G7/G8 (not re-broken in this drive) |
| Cleanup | task worktrees removed after VERIFIED; runtimes gitignored |

## FAILURE / RECOVERY

| Field | Status |
| --- | --- |
| Tool acquisition | PASS APIs + cold reprovision |
| Corrupt runtime | unit coverage (`tests/g9/g9-failure-matrix.test.ts`) |
| LSP | health-check gate before READY |
| SCIP | fingerprint cache; stale rebuild path |
| Dependency failure | engine repair loops |
| Cancellation | preserved session cancel path |

## CANONICAL VALIDATION

Published releases: **UNCHANGED**  
Publication: **NO**

---

## Key modules

- `scripts/pathcode-cli/ag9/` — layout, mise, resolve, provision, envelope, lsp, scip, services, collaborate, copilot-engine, prepare, seam  
- Session collaborative repair: `ag1/session.mjs`  
- AG1 bootstrap prefers Python ≥3.10: `ag1/runtime-bootstrap.mjs`  
- Live harnesses: `docs/reports/g9-evidence/run-live-{ag,copilot,collab}.mjs`

## Remaining for PASS

1. Live VERIFIED engineering for remaining polyglot families (JS/TS, Python, Go, C/C++, .NET where available) beyond prepare.  
2. SCIP facts **consumed** during a real multi-package VERIFIED task with measured usefulness.  
3. Disposable container/service live start + cleanup on a Docker-capable host.  
4. Broader live failure/recovery matrix beyond unit APIs.
