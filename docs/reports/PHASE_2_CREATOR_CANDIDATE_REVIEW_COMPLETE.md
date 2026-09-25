# Phase 2 — Creator candidate review (Apply / Discard) — COMPLETE

Ended: `PHASE 2 — COMPLETE, READY FOR OPERATOR VERIFICATION`

## Closeout SHA

Recorded after the Discard→authoritative-preview repair cold check.

## Dark-mode reproduction

1. **buildId:** `351d7275-a6ea-498b-a48d-a32e91f669f4`
2. **Authoritative SHA:** `a60a1e262ec6874ff3782d08edfaa6cad6f885ed` (empty origin — no applied product files)
3. **Candidate SHA (discarded):** `52d357f5d4fcbfb69dcc84d1acd384786dfb8927`
4. **Candidate taskId:** `57967a1a-39a8-4aae-a74e-44aab873c0a0`
5. **S2 lifecycle:** `DISCARDED`
6. **Conversation:** `discarded`

## Remaining live defect (operator ee66736) + fix

**Symptom:** After Discard/reload, right pane showed `Preview failed: no_preview_capability` instead of restoring authoritative preview / truthful empty product.

**Cause:**
- Authoritative tree at `a60a1e2` is the empty Build origin (no `index.html`) — first-product Discard, not a prior applied product.
- Discard stopped at S2/candidate clear; it did not stop candidate runtime + sync authoritative runtime.
- Empty-tree `start()` persisted `unavailable` / `no_preview_capability`, and the UI treated that as a red preview failure after Discard.

**Correction:**
- Discard restores checkout, stops candidate runtime, then `runtimeSync.sync` restores authoritative web preview when product files exist (`pendingRuntimeRefresh`).
- Empty authoritative tree → `awaiting_product` / `empty_tree` (not failure).
- Surface never paints `Preview failed: no_preview_capability` after Discard of a first-product candidate.

## Contract

- Discard with prior product → authoritative preview restored, zero engine.
- Discard with no prior product → truthful empty / no-product state, zero engine.
- Apply once / second Apply idempotent / no auto-adoption unchanged.
- ICE untouched.

## Operator note

Restart Builder / coordinator / gateway on the new Phase 2 SHA, then open Dark-mode and Refresh. Expect no red `Preview failed`; empty origin shows paused/discarded empty product truth. Builds with an applied authoritative web tree show that product immediately after Discard.
