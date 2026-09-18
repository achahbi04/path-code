# S3.2 Unified Engine Fabric — operator acceptance

**STATUS: ACCEPTED / FROZEN**

Confirm fabric *maturity* — need-fit routing and coherent handoff — not a mock.
Use the PATH checkout with working Cursor / Copilot auth as available.

## PREFLIGHT
1. Cursor detect → ready (or honest auth_required) — **VERIFIED**
2. Gateway `capabilities.list` returns three engines with **traits** + distinct steering/cancel — **VERIFIED**

## NEED-FIT ROUTING
3. In-flight steer need selects Cursor when ready (not Copilot/AG) — **VERIFIED**
4. Typecheck/LSP repair need narrows to Copilot when it is the only lsp-capable ready peer — **VERIFIED**
5. Preference and continuity still work; rotation has no permanent hierarchy — **VERIFIED**
6. PATH does not score/rank engines as a model judge — **VERIFIED** (boolean fit only)

## HANDOFF + SHARED REALITY
7. Fabric handoff text names previous collaborator, turn needs, and shared worktree facts — **VERIFIED**
8. A peer turn (Copilot or Cursor) can continue on the same worktree under a mutation lease — **VERIFIED**

## LIVE CURSOR PRIMARY
9. Gateway `preferredEngine: cursor` still completes VERIFIED with Engine fabric provenance — **VERIFIED**

## CLOSURE INVARIANTS
10. Engine traits originate from adapter capability declarations (`engine-capabilities.mjs` + adapter re-exports), not permanent stereotypes — **VERIFIED** (trait-swap test)
11. Selection path has no hidden numeric engine quality / provider ranking — **VERIFIED**

## AUTOMATED EVIDENCE
- `docs/reports/g10-evidence/s3/s32-live-fabric.json` — verdict **LIVE-VERIFIED**
- `s32-focused-tests.txt`

## STOP
**S3.2 FROZEN.** **S3.1 remains frozen.** **S3 Unified Engine Fabric is complete enough to freeze.** **S4** (durable crash/restart/reboot continuity) is the next separate stage — not an S3.3 fabric slice.
