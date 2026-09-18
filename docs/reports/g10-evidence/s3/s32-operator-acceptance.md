# S3.2 Unified Engine Fabric — operator acceptance

Confirm fabric *maturity* — need-fit routing and coherent handoff — not a mock.
Use the PATH checkout with working Cursor / Copilot auth as available.

## PREFLIGHT
1. Cursor detect → ready (or honest auth_required)
2. Gateway `capabilities.list` returns three engines with **traits** + distinct steering/cancel

## NEED-FIT ROUTING
3. In-flight steer need selects Cursor when ready (not Copilot/AG)
4. Typecheck/LSP repair need narrows to Copilot when it is the only lsp-capable ready peer
5. Preference and continuity still work; rotation has no permanent hierarchy
6. PATH does not score/rank engines as a model judge

## HANDOFF + SHARED REALITY
7. Fabric handoff text names previous collaborator, turn needs, and shared worktree facts
8. A peer turn (Copilot or Cursor) can continue on the same worktree under a mutation lease

## LIVE CURSOR PRIMARY
9. Gateway `preferredEngine: cursor` still completes VERIFIED with Engine fabric provenance

## AUTOMATED EVIDENCE
- `docs/reports/g10-evidence/s3/s32-live-fabric.json` — verdict **LIVE-VERIFIED**
- `s32-focused-tests.txt`

## STOP
Operator reviews this slice. **S3.1 remains frozen.** **S4 not started.**
