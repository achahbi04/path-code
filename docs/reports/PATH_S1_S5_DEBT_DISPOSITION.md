# PATH S1–S5 Debt Disposition Review

**Mode:** review / classification only — no implementation  
**Date:** 2026-09-27  
**Source audit:** `docs/reports/PATH_S1_S5_FULL_PLATFORM_AUDIT.md` @ `93a3596313851291dcbd779dc034567729b19660`

---

## 1. Executive disposition

The accepted S1–S5 audit (**PASS WITH DEBT**, 0 blockers) is **dispositioned for record**. After per-finding review:

**Overall disposition verdict: READY FOR NEXT STAGE**

No finding is placed in **FIX BEFORE ENGINE+MODEL PLANE** (Bucket 1). HIGH debt items **S4-01** and **S1-01** are **not** adoption-authority or Gateway/Fabric contradictions in default operator paths; they are **documented boundaries** and **isolated escape hatches**. Model-plane debt (**S3-01**) is assigned to the **next stage to absorb**, not to interim fixes.

**Minimum correction set before Engine+Model plane:** **none (code)**. Optional **design/documentation** boundaries for dual recovery and gateway bypass policy may accompany next-stage architecture work without changing closed Builder runtime `2ae7540`.

---

## 2. Source audit / baseline

| Artifact | SHA / reference |
|----------|-----------------|
| Accepted Builder implementation | `2ae7540da76e8d311e64465958d5f6ce03a72c25` |
| Builder repair closure | `903fd292e9828d4aeb7899d3e0b44affa58d11fd` |
| Full platform audit (committed) | `93a3596313851291dcbd779dc034567729b19660` |
| Audit verdict | PASS WITH DEBT (BLOCKER 0) |

---

## 3. Disposition rules (applied)

| Code | Meaning | Pre-next-stage bucket |
|------|---------|------------------------|
| **A** | FIX BEFORE NEXT STAGE | Bucket 1 |
| **B** | DEFER — NEXT STAGE WILL REPLACE / ABSORB | Bucket 2 |
| **C** | DEFER — LATER PLATFORM WORK | Bucket 3 |
| **D** | INTENTIONAL / KEEP | Bucket 5 |
| **E** | REMOVE LATER / CLEANUP | Bucket 4 |

---

## 4. Full finding-by-finding disposition

### S1-01 — Gateway bypass (`PATHCODE_USE_GATEWAY=0` / direct ag1)

**FINDING ID:** S1-01  
**SEVERITY:** HIGH DEBT  
**STAGE:** S1  
**AUDIT EVIDENCE:** `scripts/pathcode.mjs` ~562–565, 1195–1212 — `useGateway` false when `PATHCODE_USE_GATEWAY=0` or test IO injects `runAg1Session` / `runGeneralSession`; else branch calls `runAntigravityEngineeringSession` directly.  
**ACTUAL CURRENT BEHAVIOR:** PATH Code CLI local engineering uses in-process `ag1/session.mjs` without socket Gateway. PATH Build coordinator **always** uses `ensureGateway` (`build/coordinator/service.mjs`); **does not** read `PATHCODE_USE_GATEWAY`.  
**AUTHORITY / INVARIANT AFFECTED:** “One Gateway” as **default product contract**; not violated when Gateway is on (default). Bypass weakens **centralized task admission/socket observability**, not S2 merge primitives when checkpoints still written inside ag1/G10 path.  
**PRODUCTION REACHABLE?:** Yes for PATH Code **only** if operator sets env or test harness; not for default PATH Build operator path.  
**RISK IF CARRIED INTO NEXT STAGE:** Model provenance/registry design could be undermined **if** new plane assumes all engineering always entered via Gateway while bypass remains undocumented.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP** (isolated escape hatch)  
**RATIONALE:** Classified as **(1) legitimate explicit low-level/debug escape hatch** — single read site (`pathcode.mjs` only); Build cannot reach it; default remains Gateway-on. Not **(3) active architectural bypass** for closed Builder or default Code.  
**DEPENDENCY ON OTHER FINDINGS:** S3-01 (provenance trust) if bypass used in the wild.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Engine+Model design doc: “registry applies to Gateway/Fabric path; bypass out of scope.” Optional later deprecation (**E**) — not before registry.  
**MUST OPERATOR DECIDE?** NO (recorded; optional policy to deprecate later)

---

### S1-02 — Fake gateway engine (`PATHCODE_GATEWAY_FAKE_ENGINE=1`)

**FINDING ID:** S1-02  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S1  
**AUDIT EVIDENCE:** `gateway/runtime.mjs` ~488–672 scripted events and `deadbeef…` commit.  
**ACTUAL CURRENT BEHAVIOR:** Gateway short-circuits real Fabric when env set; emits synthetic tool stream.  
**AUTHORITY / INVARIANT AFFECTED:** Operator-visible engineering truth **if** env set.  
**PRODUCTION REACHABLE?:** Only with explicit env; real acceptance scripts refuse fake fabric.  
**RISK IF CARRIED INTO NEXT STAGE:** Low if registry work does not treat fake path as reference implementation.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP** (test/evidence infrastructure)  
**RATIONALE:** Required for continuity/S1 tests without live engines; env-gated.  
**DEPENDENCY ON OTHER FINDINGS:** S5-01 (coordinator fake) — parallel test pattern.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Keep until harnesses no longer need scripted gateway; no registry coupling.  
**MUST OPERATOR DECIDE?** NO

---

### S1-03 — In-process vs external Gateway modes

**FINDING ID:** S1-03  
**SEVERITY:** INFO  
**STAGE:** S1  
**AUDIT EVIDENCE:** `pathcode.mjs` ~566–653 — `PATHCODE_GATEWAY_EXTERNAL`, embedded runtime + socket.  
**ACTUAL CURRENT BEHAVIOR:** Same `createGatewayRuntime` implementation; clients attach in-process or via socket.  
**AUTHORITY / INVARIANT AFFECTED:** None — single runtime authority.  
**PRODUCTION REACHABLE?:** Yes — intentional multi-client attach.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Multi-client Gateway is product requirement (CLI + Build + attach).  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** N/A.  
**MUST OPERATOR DECIDE?** NO

---

### S1-04 — Socket bind failure fallback messaging

**FINDING ID:** S1-04  
**SEVERITY:** LOW DEBT  
**STAGE:** S1  
**AUDIT EVIDENCE:** `pathcode.mjs` ~647–651 stderr when socket unavailable.  
**ACTUAL CURRENT BEHAVIOR:** Continues with in-process gateway runtime without socket server.  
**AUTHORITY / INVARIANT AFFECTED:** Multi-client attach only.  
**PRODUCTION REACHABLE?:** Edge case (bind failure).  
**RISK IF CARRIED INTO NEXT STAGE:** Negligible.  
**PRIMARY DISPOSITION:** **E — REMOVE LATER / CLEANUP** (clarity only)  
**RATIONALE:** Messaging/UX debt, not authority.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Small CLI polish pass.  
**MUST OPERATOR DECIDE?** NO

---

### S2-01 — `pendingCandidate` vs checkpoint lifecycle overlap

**FINDING ID:** S2-01  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S2  
**AUDIT EVIDENCE:** `build/record.mjs`, `result-lifecycle.mjs` — parallel “awaiting human” semantics.  
**ACTUAL CURRENT BEHAVIOR:** Builder stages review in `pendingCandidate` + `awaiting_review`; checkpoint gets `resultLifecycle` on discard/merge via S2 APIs at Apply/Discard time, not at candidate staging.  
**AUTHORITY / INVARIANT AFFECTED:** **Adoption:** only `adoptTaskResult` via Apply — **not** pendingCandidate.  
**PRODUCTION REACHABLE?:** Yes — by design.  
**RISK IF CARRIED INTO NEXT STAGE:** Confusion in registry docs if mislabeled as duplicate adoption authority.  
**PRIMARY DISPOSITION:** **C — DEFER — LATER PLATFORM WORK**  
**RATIONALE:** Healthy separation: **task durability (G10 + S2)** vs **creator-review staging (S5 record)**. Phase 2–7 frozen; do not merge stores.  
**DEPENDENCY ON OTHER FINDINGS:** None for registry.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** PATH Studio / shared-core documentation; optional schema annotation, not merge.  
**MUST OPERATOR DECIDE?** NO

---

### S2-02 — PR_OPEN lifecycle without Builder

**FINDING ID:** S2-02  
**SEVERITY:** LOW DEBT  
**STAGE:** S2  
**AUDIT EVIDENCE:** `result-lifecycle.mjs` ~399+ `publishTaskPullRequest`.  
**ACTUAL CURRENT BEHAVIOR:** PATH Code delivery marks `PR_OPEN` on checkpoint; no auto-merge to primary content.  
**AUTHORITY / INVARIANT AFFECTED:** Delivery channel, not Builder product SHA.  
**PRODUCTION REACHABLE?:** Yes — Code operator action.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Intentional AG4 delivery path.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** N/A.  
**MUST OPERATOR DECIDE?** NO

---

### S2-03 — Shared `adoptTaskResult` for Build and Code

**FINDING ID:** S2-03  
**SEVERITY:** INFO  
**STAGE:** S2  
**AUDIT EVIDENCE:** `build/adopt.mjs` → `adoptTaskResult`.  
**ACTUAL CURRENT BEHAVIOR:** Single merge + MERGED lifecycle primitive.  
**AUTHORITY / INVARIANT AFFECTED:** Authoritative adoption — unified.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** None — positive architecture fact.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Confirms shared core.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Preserve in Engine+Model work.  
**MUST OPERATOR DECIDE?** NO

---

### S3-01 — Env-based `resolveCursorModel`

**FINDING ID:** S3-01  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S3  
**AUDIT EVIDENCE:** `ag10/cursor-sdk.mjs` ~165–169 `PATHCODE_CURSOR_MODEL` / `CURSOR_MODEL`.  
**ACTUAL CURRENT BEHAVIOR:** Cursor turns use env or caller `options.model`; stored on child as `engineModel` when provenance returned (`controller.mjs` ~1459).  
**AUTHORITY / INVARIANT AFFECTED:** Model selection seam inside Cursor adapter — not Engine Fabric routing.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** **Second ad hoc model layer** if registry added without replacing env pins.  
**PRIMARY DISPOSITION:** **B — DEFER — NEXT STAGE WILL REPLACE / ABSORB**  
**RATIONALE:** Correct absorption point for Dynamic Model Plane inside engine adapter after Fabric selects engine.  
**DEPENDENCY ON OTHER FINDINGS:** None must precede.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** `resolveCursorModel` → registry-backed resolver behind same adapter API; Fabric unchanged.  
**MUST OPERATOR DECIDE?** NO (absorption is the planned stage)

---

### S3-02 — evaluate/challenge via `dispatchChild` / fakeMode

**FINDING ID:** S3-02  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S3  
**AUDIT EVIDENCE:** `controller.mjs` ~1243–1257 fake reports; tick does not select evaluate/challenge (~2464–2465).  
**ACTUAL CURRENT BEHAVIOR:** Production tick only `brief`/`engineer`; evaluate/challenge only fakeMode/legacy child handling.  
**AUTHORITY / INVARIANT AFFECTED:** None in operator Build path.  
**PRODUCTION REACHABLE?:** fakeMode / headless only.  
**RISK IF CARRIED INTO NEXT STAGE:** None if registry ignores fakeMode.  
**PRIMARY DISPOSITION:** **E — REMOVE LATER / CLEANUP**  
**RATIONALE:** Dead control path residue; safe dormant in production.  
**DEPENDENCY ON OTHER FINDINGS:** S3-03, S5-01.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Bounded cleanup with test harness updates — not before registry.  
**MUST OPERATOR DECIDE?** NO

---

### S3-03 — Legacy `lastEvaluateTaskId` / `lastChallengeTaskId`

**FINDING ID:** S3-03  
**SEVERITY:** LOW DEBT  
**STAGE:** S3  
**AUDIT EVIDENCE:** `build/record.mjs` ~105–106 skeleton fields.  
**ACTUAL CURRENT BEHAVIOR:** Written if evaluate/challenge dispatched (non-tick); inert in Phase 3+ tick.  
**AUTHORITY / INVARIANT AFFECTED:** None.  
**PRODUCTION REACHABLE?:** Only non-production dispatch kinds.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **E — REMOVE LATER / CLEANUP**  
**RATIONALE:** Schema residue.  
**DEPENDENCY ON OTHER FINDINGS:** S3-02.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Schema migration cleanup pass.  
**MUST OPERATOR DECIDE?** NO

---

### S3-04 — engine-readiness “not Dynamic Model Registry”

**FINDING ID:** S3-04  
**SEVERITY:** INFO  
**STAGE:** S3  
**AUDIT EVIDENCE:** `ag10/engine-readiness.mjs` header.  
**ACTUAL CURRENT BEHAVIOR:** Operational readiness probes only.  
**AUTHORITY / INVARIANT AFFECTED:** None.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Documents scope boundary for next stage.  
**DEPENDENCY ON OTHER FINDINGS:** S3-01.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Registry complements readiness, does not replace.  
**MUST OPERATOR DECIDE?** NO

---

### S4-01 — Dual recovery substrates (`src/recovery` vs G10 checkpoints)

**FINDING ID:** S4-01  
**SEVERITY:** HIGH DEBT  
**STAGE:** S4  
**AUDIT EVIDENCE:** `general-session.mjs` `owners.createRecoveryStore`; `task-checkpoint.mjs` under `PATH_RUNTIME_ROOT/metadata/tasks/`.  
**ACTUAL CURRENT BEHAVIOR:** See §5 deep review.  
**AUTHORITY / INVARIANT AFFECTED:** Different durability domains — not competing adoption SHA.  
**PRODUCTION REACHABLE?:** General Session path only for TS store; Gateway/Build use G10.  
**RISK IF CARRIED INTO NEXT STAGE:** Conceptual confusion in registry docs if stores conflated.  
**PRIMARY DISPOSITION:** **C — DEFER — LATER PLATFORM WORK**  
**RATIONALE:** **Not** a violation of “one authoritative project revision”; **two legitimate layers** (mutation-session vs engineering-task). Smallest unify boundary: shared **naming/doc contract**, not S4 rewrite before registry.  
**DEPENDENCY ON OTHER FINDINGS:** None in Bucket 1.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Formal architecture note + optional long-term convergence (PATH Studio / platform durability program).  
**MUST OPERATOR DECIDE?** NO (unless pursuing early unification — not required for registry)

---

### S4-02 — `updatedAt` vs `lifecycleActivityAt`

**FINDING ID:** S4-02  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S4  
**AUDIT EVIDENCE:** `record.mjs` ~133–142; `lifecycle-truth.mjs` ~99–101.  
**ACTUAL CURRENT BEHAVIOR:** `updatedAt` bumps on any persist (including recover); rail uses `lifecycleActivityAt` only.  
**AUTHORITY / INVARIANT AFFECTED:** Creator activity display — protected by Phase 4 design.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** Misread of “activity” if operators use `updatedAt`.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Deliberate split: persistence clock vs creator clock.  
**DEPENDENCY ON OTHER FINDINGS:** S4-03 (recentlyActive uses `updatedAt` — separate concern).  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Operator/docs guidance only.  
**MUST OPERATOR DECIDE?** NO

---

### S4-03 — Coordinator cold-start auto-loop (10-minute `updatedAt` window)

**FINDING ID:** S4-03  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S4  
**AUDIT EVIDENCE:** `coordinator/service.mjs` ~261–267 `recentlyActive` + `ensureLoop`.  
**ACTUAL CURRENT BEHAVIOR:** See §7 deep review.  
**AUTHORITY / INVARIANT AFFECTED:** Unintended engineering — qualified.  
**PRODUCTION REACHABLE?:** Yes on coordinator restart.  
**RISK IF CARRIED INTO NEXT STAGE:** Low for registry; policy edge for autonomy.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP** (session continuity policy)  
**RATIONALE:** Does not start **fresh** creator-authorized engineer without `loop.status === "running"` and tick rules; awaiting_review/paused/complete block auto-run.  
**DEPENDENCY ON OTHER FINDINGS:** S4-02.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Optional policy tighten (**E**) in later Builder track — not Bucket 1.  
**MUST OPERATOR DECIDE?** NO (optional tighten is product policy, not registry gate)

---

### S4-04 — Temp scrub on reconcile

**FINDING ID:** S4-04  
**SEVERITY:** LOW DEBT  
**STAGE:** S4  
**AUDIT EVIDENCE:** `controller.mjs` ~655 `scrubBuildTempFiles`.  
**ACTUAL CURRENT BEHAVIOR:** Removes ephemeral build temp on reconcile/recover.  
**AUTHORITY / INVARIANT AFFECTED:** None — hygiene.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **E — REMOVE LATER / CLEANUP** (only if scrub proves noisy) or **D** if kept as intentional hygiene — **D — INTENTIONAL / KEEP** as safe hygiene.  
**RATIONALE:** Prevents temp mistaken for truth.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** N/A.  
**MUST OPERATOR DECIDE?** NO

---

### S5-01 — Coordinator `fakeMode` stub Gateway

**FINDING ID:** S5-01  
**SEVERITY:** MEDIUM DEBT  
**STAGE:** S5  
**AUDIT EVIDENCE:** `coordinator/service.mjs` ~36–59; `PATHCODE_BUILD_COORDINATOR_FAKE`.  
**ACTUAL CURRENT BEHAVIOR:** Stub gateway for headless/proof; operator path-build uses real `ensureGateway`.  
**AUTHORITY / INVARIANT AFFECTED:** None in production Build.  
**PRODUCTION REACHABLE?:** Env-gated only.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Test harness isolation.  
**DEPENDENCY ON OTHER FINDINGS:** S1-02.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Keep with fake refusal in acceptance scripts.  
**MUST OPERATOR DECIDE?** NO

---

### S5-02 — Residual `outcomeCriteria` schema

**FINDING ID:** S5-02  
**SEVERITY:** LOW DEBT  
**STAGE:** S5  
**AUDIT EVIDENCE:** `record.mjs`, `product-view.mjs` criteria projection; Phase 5 empty default.  
**ACTUAL CURRENT BEHAVIOR:** See §9.  
**AUTHORITY / INVARIANT AFFECTED:** Completion uses adoption/preview when criteria empty (`assessCompletion` ~2098–2101).  
**PRODUCTION REACHABLE?:** Field present; default `[]`.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **E — REMOVE LATER / CLEANUP**  
**RATIONALE:** Dormant for default product; harness/history still reference.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Schema deprecation after harness migration — not Phase 5 reopen.  
**MUST OPERATOR DECIDE?** NO

---

### S5-03 — Engineering activity projection from traces

**FINDING ID:** S5-03  
**SEVERITY:** INFO  
**STAGE:** S5  
**AUDIT EVIDENCE:** `engineering-activity.mjs` header.  
**ACTUAL CURRENT BEHAVIOR:** Read-only projection from children, trace, checkpoints.  
**AUTHORITY / INVARIANT AFFECTED:** Positive truth pattern.  
**PRODUCTION REACHABLE?:** Yes.  
**RISK IF CARRIED INTO NEXT STAGE:** None.  
**PRIMARY DISPOSITION:** **D — INTENTIONAL / KEEP**  
**RATIONALE:** Correct operator truth model.  
**DEPENDENCY ON OTHER FINDINGS:** None.  
**PROPOSED FUTURE RESOLUTION BOUNDARY:** Reuse for Studio.  
**MUST OPERATOR DECIDE?** NO

---

## 5. HIGH debt deep review — S4-01

### What each substrate owns

| Substrate | Location | Owns |
|-----------|----------|------|
| **TS recovery store** | `src/recovery/store.ts` → OS state dir `…/recovery/checkpoints/` via `resolveRecoveryStoreRoot` (`state-dir.mjs`) | **General Engineering Session** mutation-session checkpoints (manifest + blobs); edit preimage before READY; brain-orchestrated scoped editing |
| **G10 task checkpoint** | `$PATH_RUNTIME_ROOT/metadata/tasks/<taskId>.checkpoint.json` | **Live engineering tasks** (Gateway/Fabric): worktree, objective, engine session ids, result SHA, `resultLifecycle`, continuity |

### Overlap questions

| Question | Answer |
|----------|--------|
| Same task/session? | **No** — different session models (mutation session id vs Gateway `taskId`). |
| Competing recovery truth? | **No** — different roots, schemas, writers; no shared key namespace. |
| Split-brain on adoption? | **No** — adoption remains git + `adoptTaskResult`; neither store authoritatively adopts product SHA. |
| PATH Code depends on both? | **Partially** — default engineering: G10; General Session / `recover.mjs`: TS store only. |
| PATH Build depends on both? | **G10 + build record only** — no `createRecoveryStore` in `scripts/pathcode-cli/build/**`. |
| Legacy? | TS store is **active** for General Session; G10 is **active** for Gateway — neither deprecated. |
| Shared task IDs? | **No.** |

### One durability model or two layers?

**Two legitimate layers within one platform durability architecture:**

1. **Engineering-task durability** (S1/S3/S4 operator engineering) → G10 + runtime root.  
2. **Hosted editing-session durability** (Phase 5G General Session) → TS recovery store outside repo.

This is **not** duplicate authority over the same engineering result. Unification is **documentation + long-term platform** concern, not a prerequisite to Engine+Model plane.

**S4-01 disposition:** **C — DEFER — LATER PLATFORM WORK** (Bucket 3).  
**Smallest boundary without S4 rewrite:** Publish a **durability layer map** (which host writes which store) in Engine+Model architecture packet — no code change required for readiness.

---

## 6. HIGH debt deep review — S1-01

| Question | Answer |
|----------|--------|
| Flag read | `pathcode.mjs` only: `process.env.PATHCODE_USE_GATEWAY !== "0"` |
| Path when disabled | `runAntigravityEngineeringSession` direct (`ag1/session.mjs`) |
| Ordinary PATH Code | Can reach if operator sets `PATHCODE_USE_GATEWAY=0` |
| PATH Build | **Cannot** — coordinator always `ensureGateway` |
| Installed default | Gateway **on** (`useGateway` true unless env/test override) |
| Test/debug only? | Primarily; env is explicit |
| Engineering without Gateway task authority? | **Yes** on bypass — in-process ag1 still uses Fabric/checkpoints internally, but **no socket Gateway task envelope** |
| S2 lifecycle on merge/discard? | **Yes** when operator uses `/merge` / discard APIs (checkpoint-based) |
| Contradicts “one Gateway”? | **Default contract: no.** Bypass is **opt-out**, not second shipped product path |

**Bypass classification:** **(1) legitimate explicit low-level/debug escape hatch that must remain isolated**

**S1-01 disposition:** **D — INTENTIONAL / KEEP** (Bucket 5). Not Bucket 1.

---

## 7. Model-plane-related debt (§4 + seams table)

### Current model-selection seams

| ENGINE | CURRENT MODEL SOURCE | DEFAULT | ENV OVERRIDE | CALLER OVERRIDE | PROVENANCE STORED? | MODEL CATALOG? | TASK SCOPED? | USER SCOPED? |
|--------|----------------------|---------|--------------|-----------------|-------------------|----------------|--------------|--------------|
| **Cursor** | `resolveCursorModel` + SDK | SDK default | `PATHCODE_CURSOR_MODEL`, `CURSOR_MODEL` | `options.model` in `cursor-sdk.mjs` | `child.engineModel` when returned | **No** | Per turn/task | Env global |
| **Copilot** | Copilot SDK / CLI | SDK default | (tool env) | `options.model` if passed | Partial via events | **No** | Per turn | Env/session |
| **Antigravity** | AG bridge session | AG-native | AG env | Fabric handoff | Provider on checkpoint | **No** | Per task | Session |
| **OpenAI General Session** | `options.modelId` / brain | `PATHCODE_OPENAI_MODEL` | Env | CLI `--model` | Session disclosure / events | **No** | Per session | Operator choice |

**Fabric** remains authoritative for **engine** selection (`selectEngineForTurn`, `resolvePreferredEngine`). Model debt to absorb in next stage: **S3-01** (primary), plus documenting Copilot/AG/OpenAI seams without building a second router.

**Must NOT “fix” now:** Env pins — **B — NEXT STAGE ABSORB** (Bucket 2).  
**Must NOT become second routing layer:** Registry resolves model **inside** chosen engine adapter after Fabric fit.

---

## 8. Recovery / cold-start review — S4-03

| Item | Detail |
|------|--------|
| **Exact condition** | `reconcileStartup` → after `controller.recover`, if `shouldAutoRun(current)` && (`fakeMode` \|\| `Date.now() - Date.parse(updatedAt) < 10 min`) → `ensureLoop` |
| **Code path** | `coordinator/service.mjs` ~261–267, ~121–125 `shouldAutoRun` requires `loop.status === "running"` |
| **Can start engineer?** | Only via `runUntilDone` → `tick` → `dispatchChild` when status **running** and tick selects `engineer` |
| **Resume authorized work?** | Yes — reconciles in-flight children; does not mint new `intentRevision` by itself |
| **Paused** | `status !== "running"` → **no** auto-loop |
| **Awaiting review** | `status === "awaiting_review"` → **no** auto-loop |
| **Applied / ready** | After Apply, engineer has `adoptedSha`; tick returns `await_runtime_refresh` or completion — **not** new creator request |
| **Creator authorization** | New engineer requires prior creator message / `reviseIntent` / conversation steer flags — not created by recover alone |
| **`updatedAt` from non-creator** | `writeBuildRecord` on recover/reconcile bumps `updatedAt` — can satisfy `recentlyActive` but **does not** change `lifecycleActivityAt` or loop status to running if paused/awaiting_review |
| **Phase 4 `lifecycleActivityAt`** | Rail truth unaffected; auto-loop gate uses `updatedAt` only for recency — policy quirk, not creator-clock violation |

**Fresh engineering without previously authorized running task?** **No path identified** that cold recovery alone sets `running` + dispatches a **new** engineer for a **new** intent without creator action. Mid-session restart within 10 minutes may **continue** an already-`running` loop (authorized cognitive steps).

**S4-03 disposition:** **D — INTENTIONAL / KEEP** (Bucket 5). Optional future policy tighten → Bucket 4, not Bucket 1.

---

## 9. Candidate / result lifecycle — S2-01

**Can both systems authoritatively decide whether a result is adopted?**

**No.** Only **S2 `adoptTaskResult`** (invoked from Builder **Apply** or Code **`/merge`**) moves authoritative git revision and marks **MERGED**. `pendingCandidate` is **staging for creator review** only; checkpoint `resultLifecycle` records discard/merge **after** human decision.

**Disposition:** **C — DEFER — LATER PLATFORM WORK** (documentation / Studio), not merge of stores.

---

## 10. Legacy `outcomeCriteria` — S5-02

| Question | Answer |
|----------|--------|
| In persisted schema? | Yes — `createBuildRecordSkeleton` defaults `[]` |
| Production writer populates default? | **No** — Phase 5 empty default (`startBuild` ~540) |
| Controller decisions depend? | **Only if** `requiredCriteria.length > 0` (`assessCompletion` ~2094+); default path skips |
| Caller/harness | `initialCriteria` + tests/headless still use |
| Old records | May contain historical rows — read-only |
| Safe dormant? | **Yes** for operator product |
| Remove when? | Harness migration + schema version bump (**E**, Bucket 4) |

**Disposition:** **E — REMOVE LATER / CLEANUP** — do not reopen Phase 5.

---

## 11. Shared-core / client-specific review

| Finding | Move to shared core before Model Registry? |
|---------|---------------------------------------------|
| S5 coordinator/controller/build record | **No** — defer to PATH Studio / shared-core program (Bucket 3) |
| S2-01 pendingCandidate | **No** — staging belongs with Build until Studio needs API |
| S5-01 fakeMode | **No** |
| S4-01 TS vs G10 | **No** — document only for registry stage |

**Revisit before PATH Studio (not before Model Registry):** S2-01 presentation contract; S5 orchestration RPC surface; engineering-activity projection reuse (S5-03).

---

## 12. Dependency graph

```
S3-01 (env model pins)
    ↓ absorbed by Engine+Model plane (adapter-internal resolver)

S1-01 (Gateway bypass)
    ↓ affects provenance assumptions only if used; orthogonal to registry routing

S3-02 ──→ S3-03 (evaluate/challenge residue)
S1-02 ──→ S5-01 (fake test paths)

S4-02 (updatedAt clock) ──→ S4-03 (recentlyActive uses updatedAt)
    ↓ tightening S4-03 policy would not require changing lifecycleActivityAt

S2-01 (pendingCandidate) ⊥ S4-01 (recovery substrates) — independent

S5-02 (outcomeCriteria) ⊥ S3-01 — independent cleanup vs registry
```

Solving **S3-01** in next stage does **not** retire **S4-01** or **S1-01**.  
Solving **S3-02** would naturally retire **S3-03**.

---

## 13. Pre-next-stage buckets

| Bucket | Count | Finding IDs |
|--------|------:|-------------|
| **1 — MUST FIX BEFORE ENGINE+MODEL** | **0** | — |
| **2 — ENGINE+MODEL SHOULD ABSORB** | **1** | S3-01 |
| **3 — DEFER UNTIL PATH STUDIO / SHARED-CORE** | **2** | S4-01, S2-01 |
| **4 — LATER CLEANUP** | **4** | S1-04, S3-02, S3-03, S5-02 |
| **5 — INTENTIONAL / NO ACTION** | **11** | S1-01, S1-02, S1-03, S2-02, S2-03, S3-04, S4-02, S4-03, S4-04, S5-01, S5-03 |

*Optional future policy tighten for S4-03 is Bucket 4-adjacent but not required; primary disposition remains intentional (Bucket 5). Total findings: 18.*

### Gate answers

1. **Counts:** Bucket 1=0, 2=1, 3=2, 4=4, 5=11.  
2. **HIGH in Bucket 1?** **No.**  
3. **MEDIUM in Bucket 1?** **No.**  
4. **Minimum correction set:** **None (code).** Optional non-code durability/bypass boundary notes alongside Engine+Model design.  
5. **Without reopening Builder?** N/A — no code corrections required.  
6. **Bucket 1 empty → ready to architect Engine+Model immediately?** **Yes**, after operator accepts this disposition record.  
7. **Bucket 1 order:** N/A.  
8. **Must NOT “fix” now (next stage absorbs):** **S3-01** — do not add parallel env/registry layers; replace pins inside adapters in Engine+Model work.

---

## 14. Minimum correction set

**Required before Engine+Model plane:** **none.**

**Optional (non-code, non-Builder):**

- Durability layer map (S4-01) in architecture packet.  
- Gateway bypass policy statement (S1-01) for registry provenance assumptions.

---

## 15. Next-stage readiness

| Question | Answer |
|----------|--------|
| Ready for Engine+Model / Dynamic Model Registry architecture? | **Yes** — disposition **READY FOR NEXT STAGE** |
| Closed Builder semantics modified by disposition? | **No** — disposition is classification only |
| ICE / repair track | Remain closed |

---

## 16. Explicit non-actions

- No runtime/code changes in this pass.  
- No commits.  
- No paid engineering.  
- No Model Registry / Astra / Grok / new-engine implementation.  
- No Builder repair reopening.  
- No implementation of dispositions — await operator approval.

---

## 17. Evidence index

| Topic | Path |
|-------|------|
| Platform audit | `docs/reports/PATH_S1_S5_FULL_PLATFORM_AUDIT.md` |
| Gateway bypass | `scripts/pathcode.mjs` |
| Build coordinator | `scripts/pathcode-cli/build/coordinator/service.mjs` |
| G10 checkpoints | `scripts/pathcode-cli/ag10/task-checkpoint.mjs` |
| TS recovery store | `src/recovery/store.ts`, `scripts/pathcode-cli/general-session.mjs` |
| State dir | `scripts/pathcode-cli/state-dir.mjs` |
| Cursor model | `scripts/pathcode-cli/ag10/cursor-sdk.mjs` |
| Apply/adopt | `scripts/pathcode-cli/build/controller.mjs`, `result-lifecycle.mjs` |
| Completion / criteria | `scripts/pathcode-cli/build/controller.mjs` `assessCompletion` |
| Lifecycle clocks | `scripts/pathcode-cli/build/lifecycle-truth.mjs`, `record.mjs` |

---

*End of debt disposition review (uncommitted).*
