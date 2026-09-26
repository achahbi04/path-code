# Phase 3 — Remove surviving automatic re-engineering paths — COMPLETE

Ended: `PHASE 3 — COMPLETE, READY FOR OPERATOR VERIFICATION`

## Closeout

Bound to the PATH Builder genuine repair roadmap (D2 / D3 / D4), plus the
startBuild creator-seed correction (no PATH-authored first-engineer product
instruction).

**Implementation SHA:** `42cba9850ffdc8607f9289b7e35b46ef4cbae834`  
**Prior incomplete tip:** `eb8f2a4` still seeded a PATH product instruction on `startBuild`.

## Contract

- **D2:** `NON_WEB` (and empty-tree Apply) are truthful non-success. Zero automatic PATH-authored engineer turns.
- **D3:** Fabric steps are real instructions. Follow-up objectives include `CURRENT FABRIC STEP` alongside the creator request; fabric queue outranks a bare steer so step text is never silently dropped.
- **D4:** `forceNextKind: evaluate|challenge` never dispatches. Load/write migrate those values away. Dead evaluate/challenge tick branches removed.
- **Creator seed:** `startBuild` sets `hypotheses.proposedNextAction` to the **verbatim creator outcome**. Greenfield engineer objectives use `CURRENT CREATOR REQUEST` only for product instructions (workspace git contract remains).
- **Provider fallback:** may select another engine for the same creator-authorized task; does not rewrite `proposedNextAction` or invent a PATH repair objective.
- Exit: the only product engineering instruction sources are the creator request and an explicit Engine Fabric step.

## Falsification

`tests/s5/build-phase3-auto-reengineer.test.ts`

1. NON_WEB → blocked, no new engineer on tick, no PATH repair `proposedNextAction`
2. Two-step follow-up fabric → distinct objectives, each with creator request + step text
3. Loaded `forceNextKind: evaluate|challenge` → no cognitive dispatch
4. `startBuild` seed equals creator outcome; first engineer objective carries it, not PATH architecture text
5. Fallback leaves the same creator seed unchanged
6. Source assertion: retired PATH repair / architecture seed sentences are gone

## Preserve

- ICE untouched
- Phase 2 Apply/Discard / candidate review unchanged in intent
- Phase 4–6 / Phase 6 UI not started
