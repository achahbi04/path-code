# S3.1 Unified Engine Fabric — operator acceptance

Confirm the live first-slice fabric — not a mock. Use the PATH checkout with working Cursor SDK login (`~/.cursor/sdk/auth.json` or env key).

## PREFLIGHT
1. `node -e "import('./scripts/pathcode-cli/ag10/cursor-sdk.mjs').then(m=>m.detectCursorEngine()).then(d=>console.log(d.status,d.ready))"` → `ready true`
2. Gateway capabilities list Cursor as `available` (never permanent `slot_reserved`)

## FABRIC CONTRACT
3. Engines remain distinct: Antigravity (bridge/continue), Copilot (SDK/CLI boundary steer), Cursor (local SDK, in-flight steer + native cancel)
4. Selection is capability-aware (`selectEngineForTurn`) — preference / continuity, not a fixed hierarchy

## LIVE CURSOR PRIMARY
5. Start a Gateway task with `preferredEngine: "cursor"` against a real project/fixture worktree
6. Confirm events: preferred routing → Cursor SDK ready → Cursor primary turn
7. Mid-task `/steer` (or Gateway `steerTask`) applies on the Cursor-owned path
8. Result is `VERIFIED` / completed with `engine` / `preferredEngine` provenance
9. Engineering report includes an **Engine fabric** section

## MULTI-PEER SHARED REALITY
10. Cursor and Copilot can both mutate the same task worktree under G10 leases (evidence: `s31-acceptance.json` → `multiPeerFabric`)
11. Default Gateway path (no preferred engine) still exercises Antigravity-led engineering events

## CANCEL / STEER
12. Cursor in-flight cancel returns `CANCELLED`
13. Steer either applies in-flight (`inflight`) or honestly reports `BOUNDARY_ONLY` when no active run

## AUTOMATED EVIDENCE
- `docs/reports/g10-evidence/s3/s31-acceptance.json` — verdict **LIVE-VERIFIED**
- `s31-live-fabric.json`, `s31-mechanical.json`, `s31-focused-tests.txt`, `s31-canonical-check.txt`

## STOP
Operator accepted the S3.1 live fabric experience.

**Result-capture closure (required before freeze):** Cursor-created
`S3_CURSOR_OPERATOR_ACCEPTANCE.md` must appear in `/inspect` as changed + Adoptable yes.
Evidence: `s31-result-capture.json` → **LIVE-VERIFIED**.

**S3.1 FROZEN.** S4 not started. S2 freeze tip preserved.

