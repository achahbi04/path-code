# PHASE 2 LIVE AUDIT — Dark-mode Build (honest)

**Audit time:** 2026-09-25  
**Builder SHA (footer):** `9b49cdc`  
**Build:** `351d7275-a6ea-498b-a48d-a32e91f669f4`  
**Verdict:** Phase 2 Discard/Apply review path is **not closed** for the continue-after-Discard case. The UI is lying about the new message. Engineering is stuck for a concrete, proven reason.

ICE (`dcca5ffb-…`): paused, `bb9cb66`, dirty 0 — not touched by this audit.

---

## What you are seeing vs what is true

| What the UI shows | What the durable record says |
|---|---|
| New message “add a logo…” labeled **DISCARDED** | That message is stored as **`queued`**, intent **revision 2** — it was **never** discarded |
| No Apply / Discard review | Correct: **no pending candidate**, no new engineer child for rev 2 |
| Preview empty / “candidate was discarded” | Correct for product tree: authoritative SHA is empty origin |
| Composer looks usable | Message was accepted into the record — then **nothing ran** |

So: you did send a follow-up. It did **not** go through review. It was **not** discarded. The UI painted it as Discarded because of a projection bug.

---

## Exact durable state (source of truth)

```
loop.status                 = paused
coordinator.autoRun         = false
pendingCandidate            = null
lastDiscardedCandidate      = task 57967a1a… (rev 1 Nordlys only)
lastAppliedCandidate        = null
adoptionHistory             = []
authoritativeSha            = a60a1e262ec6…  (empty Build origin)
product folder files        = []   (only .git)
intent.outcomeRevision      = 2
pendingConversationSteer    = true
forceNextKind               = brief
```

### Conversation (stored)

1. rev=1 · status=`discarded` · original dark-mode homepage request  
2. rev=2 · status=`queued` · “add a logo to the dark-mode homepage…”  ← **this is your new ask**

### Children (engineering)

- brief rev1 consumed  
- engineer `57967a1a` rev1 · VERIFIED · S2 **DISCARDED** · never adopted  
- **No brief/engineer for rev 2**

### Events after your logo message (16:45:38Z)

- `conversation.queued`
- `intent.revised` → revision 2  
- `brief.bootstrap` (mechanical)  
- **STOP.** No `engineer.selected`, no `candidate.ready`, no `build.resumed` for that steer, no Apply banner.

---

## Root causes (two defects, both Phase 2 continue-path)

### Defect A — False DISCARDED label on new messages (UI projection)

In `product-view.mjs`, when `lastDiscardedCandidate` exists, **any** conversation status in `{failed, review, queued}` is rewritten to **`discarded`**.

That is wrong after a later revision. Your rev=2 `queued` logo message is displayed as Discarded even though S2 never discarded it and no candidate was staged for it.

**Missing:** status remap must be scoped to the discarded revision / discarded task’s conversation, not every later message.

### Defect B — Post-Discard new request never starts the loop (lifecycle)

After Discard we correctly set:

- `loop.status = paused`
- `coordinator.autoRun = false`

When you sent “add a logo…”:

1. `applyConversation` / `reviseIntent` bumped revision, set `pendingConversationSteer=true`, `forceNextKind=brief`
2. **`reviseIntent` does not set `loop.status = running` when status is `paused`** (only when `complete`)
3. `BUILD_MESSAGE` calls `ensureLoop`
4. `shouldAutoRun` requires `status === "running"` **and** `autoRun !== false`
5. Both fail → **ensureLoop is a no-op**
6. No brief/engineer dispatch → **no candidate** → **no Apply/Discard review**

**Missing:** a creator message after Discard must re-arm the Build (`running` + `autoRun`) so the candidate-review loop can produce a new pending candidate for Apply/Discard — without resurrecting the old discarded result, without auto-Apply, without treating Discard as failure.

---

## Apply / Discard contract — what is present vs missing

| Contract item | Status on this Build |
|---|---|
| First engineer VERIFIED → candidate, not auto-adopt | **Present** (rev1 did this) |
| Apply adopts once | **Not exercised** (never Applied; adoptionHistory empty) |
| Discard → S2 DISCARDED, SHA unchanged, candidate cleared | **Present** for rev1 |
| After Discard, UI not FAILED / Needs attention | **Mostly present** on `9b49cdc` (blocked path fixed) |
| After Discard, new chat → new engineer → **new** Apply/Discard review | **MISSING — stuck** |
| Truthful labels for new messages after a prior Discard | **MISSING — false DISCARDED** |
| Authoritative preview of a real product after Discard | **N/A here**: nothing was ever Applied; `a60a1e2` is empty origin. Nordlys lived only on discarded task branch `path/task-57967a1a…` |

---

## Why preview is empty (not a separate “fake complete”)

- Authoritative product was **never** Applied.  
- Discard restored empty origin `a60a1e2`.  
- Task branch with Nordlys still exists: `path/task-57967a1a-…` (retained by Discard contract).  
- Empty tree → `awaiting_product` / no live iframe is truthful for authoritative checkout.  
- It is **not** proof that Apply/Discard review works for the next request.

---

## What is NOT true (do not rely on prior closeout claims for this case)

- “Phase 2 complete for operator continue-after-Discard” — **false** for this Build.  
- “Logo message was discarded” — **false**; UI lie.  
- “Engineering ran and you skipped review” — **false**; engineering never started for rev 2.  
- “Apply is available” — **false**; no `pendingCandidate`.

---

## Minimal fix list (Phase 2 only — not Phase 3)

1. **Projection:** only map conversation → `discarded` for messages tied to the discarded revision/task; leave later `queued`/`applying`/`review` alone.  
2. **Steer after Discard:** on creator `message` while paused after Discard (or any paused Build with a new steer), set `loop.status=running`, `coordinator.autoRun=true`, then `ensureLoop` — so brief/engineer can create a **new** candidate.  
3. **Invariant:** old S2 `DISCARDED` stays discarded; new engineer result still requires explicit Apply; no auto-adopt; authoritative SHA unchanged until Apply.  
4. **Test:** Discard → send follow-up message → pending candidate + Apply/Discard visible; conversation status for follow-up is not `discarded`; no engine until message; ICE untouched.

---

## Bottom line

You are stuck because **Discard turned the loop off and a new message never turned it back on**, and the UI **mis-labeled the waiting message as Discarded**. Apply/Discard review cannot appear until a new engineer candidate is staged. That continue-path was not closed on `9b49cdc`.
