# PATH CODE — G9
SELF-PROVISIONING POLYGLOT + COLLABORATIVE ENGINEERING RUNTIME

**Result:** PASS  
**Baseline:** G8 freeze `3ca50e0acf04739b647624c840ca86530944e8f4`  
**Implementation commit:** `e2804d1a4d71340a025ccce299b1d9c282cd17f8`  
**Report/freeze commit:** `a527b9f7760ef0d867175e4b967203aff4289925`  
**Branch:** `cursor/pathcode-antigravity-v1`  
**Working tree:** clean after freeze  
**Canonical validation:** `npm run check` PASS (154 files / 1412 tests)  
**Published releases:** UNCHANGED  
**Publication:** NO  

Integrity: the stray hash `61ed3f2d8f8e3c0e0c8e0f0a0b0c0d0e0f1a2b3c` does **not** appear.
Prior gap-closure baseline implementation: `61ed3f272e9d03dc53490c92afc8cdb0b82f7d54`.
Prior PARTIAL report commit: `314103c68e15d9fda3c57ccbceba620315de44e1`.

This report follows the **G9 AUTHORITATIVE CONSOLIDATED PLAN**.

## Verdict

Remaining acceptance gaps from the PARTIAL freeze are closed with live evidence:

- polyglot live VERIFIED engineering (JS/TS, Python, Go, C/C++, .NET/C#)
- SCIP facts consumed via path-scip MCP tool calls during engineering
- AG → Copilot → AG round-trip in one worktree
- Colima/Docker disposable Redis service start + engineering + cleanup
- live failure/recovery (corrupt detect, LSP heal, SCIP rebuild, cancel)
- living cockpit event stream from a real task
- `npm run check` PASS

---

## POLYGLOT LIVE ACCEPTANCE

| Family | Result | Evidence |
| --- | --- | --- |
| JS/TS | VERIFIED | `live/ag-js-fix.summary.json` |
| Python | VERIFIED | `live/ag-py-fix.summary.json` |
| Go | VERIFIED | `live/ag-go-fix.summary.json` |
| Rust | VERIFIED (prior) | `live/ag-rust-fix.summary.json` |
| Java | VERIFIED cold+eng (prior cold; live not re-run) | `cold/java-*` |
| C/C++ | VERIFIED | `live/ag-c-fix.summary.json` |
| .NET/C# | VERIFIED eng + LSP ready | `live/ag-csharp-fix.summary.json`, `live/ag-csharp-lsp.prepare.json` |

## LSP LIVE

| LSP | Status |
| --- | --- |
| TS/JS | READY |
| Python | READY (prepare/live) |
| Go | READY (live prepare; gopls via `go:golang.org/x/tools/gopls`) |
| Rust | READY |
| Java | READY (Eclipse JDT LS) |
| C/C++ | READY (`c_cpp` → clangd mapping) |
| C# | READY (dotnet tool-path `csharp-ls` + DOTNET_ROOT wrapper) |

## SCIP LIVE ENGINEERING

| Field | Value |
| --- | --- |
| Repository/task | `live-repos/scip-mono` / tokenPrefix cross-package fix |
| Indexer | scip-typescript under PATH runtime |
| Symbol/query | `tokenPrefix` via `code_search_symbol` + `code_references` |
| Facts consumed by | Antigravity (path-scip MCP) |
| Material use | MCP returned definition/refs; then `bad:` → `tok:` mutation |
| Index/query | see `live/scip-mono-consume.proof.json` |
| Verified result | VERIFIED commit `a7d82d813c55e3fcf333cc66c819b07c1dfee3a0` |

Fix required for real MCP success: allowlist `PATHCODE_SCIP_*` in `sanitizeMcpEnv`; NDJSON MCP stdout for Antigravity.

## DUAL-ENGINE COLLABORATION

| Field | Status |
| --- | --- |
| AG → Copilot | PASS (prior collab-dual) |
| Round-trip AG → Copilot → AG | PASS — `live/roundtrip-dual.summary.json` (`materialRoundTrip: true`) |
| Conflict protection | exclusive `withCollabTurn` leases |
| Final result | VERIFIED `b74a1dfb5c21b3bf2bc32033a2becdc54978b4f0` |

## CONTAINER / SERVICE

| Field | Status |
| --- | --- |
| Backend | Homebrew Docker CLI + Colima (auto-established; not operator tutorial) |
| Automatic establishment | `docker/backend-establish.json` |
| Live service | Redis via compose — STARTED |
| Engineering use | VERIFIED against Redis PING + `expectedPong` fix |
| Cleanup | STOPPED PATH-owned compose project only |

Evidence: `live/compose-redis.summary.json`. Services code uses `resolveDockerCli` + `docker-compose` fallback + PATH-owned `DOCKER_CONFIG` without Desktop credsStore.

## LIVE FAILURE / RECOVERY

| Case | Status |
| --- | --- |
| Runtime corruption | BROKEN detected; rust-analyzer corrupt heal READY; gopls acquire may still timeout (truthful) |
| LSP failure | rust-analyzer heal → READY |
| SCIP stale cache | fingerprint mismatch → rebuild → query OK |
| Provision cancellation | abortedResult; sane |

Evidence: `live/failure-recovery.summary.json`.

## LIVING COCKPIT

| Field | Status |
| --- | --- |
| Real task | `cockpit-js` VERIFIED |
| Provisioning / LSP / indexing / inspect / implement / affected / verification | visible in NDJSON |
| Collaboration visible | not in that single-engine task (proven separately in roundtrip) |
| Repair visible | N/A when first pass succeeds |
| Terminal restore | session cancel/restore paths preserved (G7/G8) |

Evidence: `live/cockpit-js.summary.json`, `cockpit-js.events.ndjson`.

## SECURITY / PRODUCT INTEGRITY

Primary checkout untouched on live acceptances. Credential isolation via PATH runtime / toolEnv. Worktree boundary preserved. Published releases unchanged.

## CANONICAL VALIDATION

`npm run check` PASS (154 / 1412) — `docs/reports/g9-evidence/canonical-check.txt`  
Published releases: **UNCHANGED**  
Publication: **NO**

## Evidence root

`docs/reports/g9-evidence/live/` · fixtures under `live-repos/` · harnesses `run-live-*.mjs`
