# PATH CODE — PHASE 5D2 VALIDATION STOP AMENDMENT 1

**Package:** Phase 5D2 Engineering Orchestrator Core  
**Status:** Authorized earlier-owner BEHAVIOR addition (control-only)  
**Does not amend historical 4B/4D documents in place.**

## Purpose

Add a narrowly scoped optional `AbortSignal` control path from Engineering Run into Validation so a stopped orchestrator cycle can refuse **later** check dispatches without redesigning the process host or claiming active-process cancellation.

## Affected contracts (named, not rewritten)

| Contract | Effect of this amendment |
|---|---|
| Phase 4B Validation | Optional `signal` on `executeValidationPlan`; between-check admission only |
| Phase 4D Engineering Run | Optional `signal` on `executeEngineeringRun`; forwarded unchanged to Validation |

## Unchanged without signal

When `signal` is omitted/undefined:

- Validation still consumes authorization exactly as before;
- checks still run sequentially under existing stop-on-failure rules;
- process host, timeouts, SIGTERM/SIGKILL escalation, classification, and LocalProcessResult shapes are unchanged;
- Engineering Run composition remains Validation + Run Evidence only.

## Control-only meaning

1. With no signal: existing behavior unchanged.
2. Validation checks the signal before starting the plan and before dispatching **each next** process-execution operation (including after awaited policy/subject checks immediately preceding that dispatch).
3. A pre-aborted new call refuses without spawning. Do not refund an already-consumed authorization. If not yet consumed, report actual owner state (no invented consumption).
4. When stop is observed with no command in progress: do not dispatch another; use existing `NOT_ATTEMPTED` / refusal conventions with a validation-local safe stop reason (`STOP_REQUESTED`); preserve earlier genuine results and aggregate non-success. Never invent a cancelled process result for an unstarted command.
5. A process-execution operation **already dispatched** may still reach spawn/run until its existing approved timeout/termination/cleanup completes. **No** SIGTERM-because-of-signal claim; **no** process-host redesign.
6. After that active operation returns, preserve original process facts; do not dispatch later checks.
7. The signal can only restrict scheduling; it cannot replace commands/results, create approval, or widen limits. No callback control or process adapter.

## Affected consumers / tests

| Consumer | Expectation |
|---|---|
| Orchestrator cycle | Forwards cycle-owned AbortSignal while Engineering Run is active; drains the run Promise |
| Existing Validation / Engineering Run tests | Must continue to PASS with no signal |
| New focused stop tests (E24) | Pre-stop zero checks; stop during first of two checks prevents second; real first outcome preserved |

## Files authorized to change

- `src/validation/execute.ts` — optional signal admission checks
- `src/engineering-run/execute.ts` — optional signal forward
- Narrow barrel type/docs only as needed for options objects
- Focused tests under `tests/orchestrator/` and, if needed, additive Validation stop cases

## Explicit non-goals

- Active process cancellation / host redesign
- Authorization refunds
- New LocalProcessResult cancelled discriminant for unstarted commands
- Global vocabulary expansion
