# PATH S1–S5 Full Platform Audit

**Audit mode:** read-only — no implementation changes  
**Audit date:** 2026-09-27  
**Audited tree:** documentation closure commit `903fd292e9828d4aeb7899d3e0b44affa58d11fd`  
**Accepted Builder implementation (runtime):** `2ae7540da76e8d311e64465958d5f6ce03a72c25`  
**Closure tag:** `path-builder-repair-closed-20260927` → `903fd29…`  
**Package version:** `1.0.1`  
**Operator reference (Phase 7 applied product):** `810a63a3b33dc8bdf28c2a14f6aa565126936a4d`

---

## 1. Executive summary

PATH S1–S5, as implemented at `903fd29` (runtime `2ae7540`), presents **one live engineering platform** for PATH Code and PATH Build: a **single socket Gateway** (`scripts/pathcode-cli/gateway/`), a **single Engine Fabric façade** (`scripts/pathcode-cli/ag10/`), **shared task checkpoints and result lifecycle** (`ag10/task-checkpoint.mjs`, `result-lifecycle.mjs`), and **explicit human adoption** before authoritative project SHA moves. The Builder repair track (Phases 1–7, operator-closed) materially aligned S5 with that core: explicit candidate review, no evaluate/challenge dispatch in the cognitive loop, recoverable applied preview, and lifecycle truth separated from persistence clocks.

**Overall verdict: PASS WITH DEBT.** No audit finding rises to **BLOCKER** for continuing roadmap work after operator review, provided Dynamic Model Registry work treats env-level model resolution and legacy bypass paths as consolidation targets—not as the current canonical plane.

| Stage | Verdict |
|--------|---------|
| S1 Gateway | PASS WITH DEBT |
| S2 Result lifecycle | PASS |
| S3 Engine Fabric | PASS WITH DEBT |
| S4 Durability / recovery | PASS WITH DEBT |
| S5 PATH Builder | PASS WITH DEBT |

Supporting evidence includes stage test suites under `tests/s1`–`tests/s5`, repair-track closure artifacts (`docs/reports/PATH_BUILDER_REPAIR_TRACK_FREEZE.md`, `docs/reports/PHASE_7_ACCEPTANCE/acceptance.json`), and the code citations below. Green tests are corroboration only; this audit is code- and authority-truth-based.

---

## 2. Audit baseline

| Item | Value |
|------|--------|
| `HEAD` | `903fd292e9828d4aeb7899d3e0b44affa58d11fd` |
| Implementation parent | `2ae7540da76e8d311e64465958d5f6ce03a72c25` |
| Branch | Detached `HEAD` (no branch) |
| Closure tag | `path-builder-repair-closed-20260927` → `903fd29…` |
| `git diff 2ae7540..HEAD` | **Only** `docs/reports/` (freeze + Phase 7 acceptance evidence) |
| Runtime code delta vs accepted Builder | **None** — docs-only closeout on top of `2ae7540` |

---

## 3. Current architecture map

```
                    PATH Code CLI / PATH Build surface
                              │
                    ensureGateway / bindProject
                              │
              ┌───────────────┴───────────────┐
              │   S1: createGatewayRuntime    │
              │   (gateway/runtime.mjs)       │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │ ag1/session.mjs (admission,   │
              │ worktree, validation handoff) │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┴───────────────┐
              │ S3: ag10/index.mjs (Fabric)   │
              │ cursor / copilot / antigravity│
              └───────────────┬───────────────┘
                              │
         G10 task checkpoint + engineering report + task trace
                              │
         ┌────────────────────┴────────────────────┐
         │                                         │
   PATH Code /merge, /discard              S5: pendingCandidate
   (result-lifecycle.mjs)                  → applyCandidate → adopt.mjs
         │                                         │
         └────────────────────┬────────────────────┘
                              │
              Authoritative git revision (primary or path-build/*)
                              │
         S5-only: *.build.json + preview runtime (manager.mjs)
```

**PATH Build** adds a **coordinator** (`build/coordinator/service.mjs`) and **build record** (`build/record.mjs`) as product orchestration over the same Gateway and adoption primitives—not a second engine backend.

---

## 4. S1 — Gateway / live foundation

### What S1 owns

- **Canonical runtime:** `createGatewayRuntime` in `scripts/pathcode-cli/gateway/runtime.mjs` (header: “S1 — PATH Gateway runtime”).
- **Transport:** Unix socket server (`gateway/server.mjs`, `server-main.mjs`), client (`gateway/client.mjs`), ensure/attach (`gateway/ensure.mjs`).
- **Admission:** `admitPrimaryCheckout` via ag1; task lifecycle in-memory `Map` plus durable checkpoint writes.
- **Dispatch:** Real path imports `runAntigravityEngineeringSession` from `ag1/session.mjs` inside `startTask` (after optional fake-engine branch).
- **Cancellation:** `cancelTaskProcesses` / task context (`process-registry.mjs`).

### Findings

| ID | Severity | Finding | Evidence | Production reachable? |
|----|----------|---------|----------|------------------------|
| S1-01 | HIGH DEBT | **Gateway bypass** when `PATHCODE_USE_GATEWAY=0` or tests inject `runAg1Session` / `runGeneralSession`: CLI calls `ag1/session.mjs` directly without socket Gateway. | `scripts/pathcode.mjs` ~562–565, 1195–1212 | Yes, if operator sets env or test harness |
| S1-02 | MEDIUM DEBT | **Scripted fake engineering** when `PATHCODE_GATEWAY_FAKE_ENGINE=1`: Gateway emits synthetic tool events and fixed `deadbeef…` commit. | `gateway/runtime.mjs` ~488–672 | Only if env set; acceptance harnesses refuse it |
| S1-03 | INFO | **In-process vs external** Gateway modes (`PATHCODE_GATEWAY_EXTERNAL`, embedded `createGatewayRuntime` + `startGatewayServer`). Single implementation, multiple attach patterns. | `pathcode.mjs` ~566–653 | Yes — intentional |
| S1-04 | LOW DEBT | Socket bind failure falls back to “continuing in-process” without socket (`pathcode.mjs` ~647–651). | Same | Edge case |

**S1 STATUS: PASS WITH DEBT** — One canonical Gateway implementation; bypass and fake paths are explicit and env-gated, not a second live authority in default configuration.

---

## 5. S2 — Result lifecycle / authoritative project truth

### Canonical contract

- **Durable lifecycle** on G10 checkpoints: `readLifecycleFromCheckpoint`, `writeResultLifecycle`, `discardTaskResult`, `adoptTaskResult` in `scripts/pathcode-cli/result-lifecycle.mjs` (header: “S2.2”).
- **PATH Code:** `/merge` and discard commands call `adoptTaskResult` / `discardTaskResult` (`pathcode.mjs` ~2124+).
- **PATH Build:** `applyCandidate` → `adoptEngineerResultIntoBuild` → **`adoptTaskResult`** (`build/adopt.mjs` ~387+; `build/controller.mjs` ~1667–1797).
- **Candidate staging:** Engineer completion sets `pendingCandidate` and `loop.status = "awaiting_review"`; **no** `authoritativeSha` update until Apply (`controller.mjs` ~1499–1578).

### Verified behaviors

- **No auto-adopt** on engineer completion (adoption object is staging only until Apply).
- **Discard** writes `DISCARDED` lifecycle, restores authoritative checkout (`discardCandidate` ~1804+).
- **Idempotency:** Apply/discard dedupe via `lastAppliedCandidate` / `lastDiscardedCandidate` and lifecycle states (`adoptTaskResult` ~506–514).
- **Stale lifecycle:** `ALREADY_DISCARDED` / `ALREADY_MERGED` guards in `discardTaskResult` and `adoptTaskResult`.

### Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| S2-01 | MEDIUM DEBT | **Parallel presentation state:** `pendingCandidate` on build record duplicates “awaiting human” semantics already partially mirrored in checkpoint `resultLifecycle`. Build record is authoritative for Builder UI; checkpoint is authoritative for PATH Code merge/discard. | `build/record.mjs`, `result-lifecycle.mjs` |
| S2-02 | LOW DEBT | **PR publish path** (`publishTaskPullRequest`) can mark `PR_OPEN` without Builder involvement — intentional PATH Code delivery, not Builder auto-push. | `result-lifecycle.mjs` ~399+ |
| S2-03 | INFO | Merge into **Build product branch** uses same `adoptTaskResult` primitive as Code primary. | `build/adopt.mjs` |

**S2 STATUS: PASS** — S2 human-decision contract is canonical; S5 consumes it for Apply, not a parallel adoption mechanism.

---

## 6. S3 — Unified Engine Fabric

### Canonical entry

- **Contract:** `scripts/pathcode-cli/ag10/engine-contract.mjs` (header: “S3 — Unified Engine Fabric contract”).
- **Runtime:** `createG10Fabric` in `ag10/index.mjs`; engines: Cursor SDK, Copilot SDK, Antigravity via `ag-session.mjs`.
- **Selection:** `selectEngineForTurn`, `resolvePreferredEngine`, capability templates in `engine-capabilities.mjs`.
- **Gateway integration:** `buildEngineCapabilityList`, `resolvePreferredEngine` imported in `gateway/runtime.mjs`.

### Phase 3 doctrine (code verification)

| Doctrine | Status |
|----------|--------|
| evaluate/challenge `forceNextKind` never dispatches | Stripped in `record.mjs` ~127–131, 171–177; `stripStaleCognitiveForceNextKind` in `controller.mjs` ~197–204; tick comment ~2464–2465 |
| Tick dispatches only `brief` / `engineer` | `controller.mjs` ~2484–2521 |
| NON_WEB does not spawn repair engineer | `decideEngineerProductAdoption` branch ~1511–1520 |
| Empty Apply does not spawn repair | `applyCandidate` ~1766–1778 |
| Fabric steps retain distinct step text | `fabricStepsRemaining` + tick ~2498–2505 |
| Preferred engine / fallback | `resolveDispatchPreferredEngine`, `engine-contract.mjs` |

### Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| S3-01 | MEDIUM DEBT | **`resolveCursorModel`** reads `PATHCODE_CURSOR_MODEL` / `CURSOR_MODEL` — env-based model pin, **not** a Dynamic Model Registry, but the nearest “model plane” code today. | `ag10/cursor-sdk.mjs` ~165–169 |
| S3-02 | MEDIUM DEBT | **evaluate/challenge dispatch still possible** if `dispatchChild` called with those kinds (e.g. `fakeMode` `runFakeChild` writes fake PROVEN criteria). Production tick does not select them. | `controller.mjs` ~1243–1257, ~1135–1136 |
| S3-03 | LOW DEBT | Legacy fields `lastEvaluateTaskId`, `lastChallengeTaskId` on build loop schema. | `build/record.mjs` ~105–106 |
| S3-04 | INFO | `engine-readiness.mjs` explicitly “not Dynamic Model Registry”. | file header |

**No hidden Model Registry** was found (no registry module, no model catalog store). Model identity is executor-local env + SDK defaults.

**S3 STATUS: PASS WITH DEBT**

---

## 7. S4 — Durability / recovery

### Persistent stores (summary; see §13)

| Store | Role |
|-------|------|
| `PATH_RUNTIME_ROOT/metadata/tasks/*.checkpoint.json` | G10 task truth, lifecycle, SHA, worktree |
| `PATH_RUNTIME_ROOT/metadata/builds/*.build.json` | S5 product control + candidate + authoritativeSha |
| `~/.path-code/runtime/v{version}/` default runtime root | `paths.mjs` `resolvePathRuntimeRoot` |
| `src/recovery` checkpoint blobs | General Session / editing host (separate substrate) |
| OS state dir `PATH Code` / XDG (`state-dir.mjs`) | Phase 5G recovery store root (outside repo) |
| Gateway socket + pid (`gateway/server.mjs`) | Live ownership |
| Task trace, engineering reports, process sidecars | Derived / observability |

### Recovery behaviors

- **Host startup:** `reconcileHostStartup` (`ag10/host-startup.mjs`) — marks interrupted checkpoints, reclaims stale Gateway socket, **does not** run engines.
- **Builder coordinator startup:** `reconcileStartup` (`coordinator/service.mjs` ~227–277) calls `controller.recover` → `reconcileBuildChildren`; **auto-loop** only if `shouldAutoRun` and (`fakeMode` **or** `updatedAt` within 10 minutes).
- **Recover consume:** `reconcileBuildChildren` may `consumeChildResult` for `terminal_seen` children — stages candidate, does not Apply (`controller.mjs` ~654–711).
- **Preview recovery:** `projectLastGoodPreview` / runtime `sync` rematerialize preview from `authoritativeSha` (`lifecycle-truth.mjs`, `runtime/sync.mjs`).

### Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| S4-01 | HIGH DEBT | **Two durability substrates:** TypeScript `src/recovery/store.ts` (manifest/blobs for General Session) vs CLI G10 checkpoints. Not unified; different hosts. | `general-session.mjs` uses `owners.createRecoveryStore`; Gateway uses `task-checkpoint.mjs` |
| S4-02 | MEDIUM DEBT | **`updatedAt` vs `lifecycleActivityAt`:** `writeBuildRecord` bumps `updatedAt` on any persist; lifecycle rail uses `lifecycleActivityAt` only (`lifecycle-truth.mjs` ~99–101). Correct by design but easy to misread. | `record.mjs` ~133–142 |
| S4-03 | MEDIUM DEBT | Coordinator **may restart autonomous loop** within 10 minutes of last `updatedAt` on cold start (`recentlyActive`). Operator Phase 7 verified no unwanted engineer after Apply; window remains a policy edge. | `coordinator/service.mjs` ~261–267 |
| S4-04 | LOW DEBT | Build temp scrub on reconcile (`scrubBuildTempFiles`). | `controller.mjs` ~655 |

**S4 STATUS: PASS WITH DEBT**

---

## 8. S5 — PATH Builder

### Architecture role

- **Not an engineer:** Dispatches via `gateway.startTask` (`controller.mjs` `dispatchChild`).
- **Not semantic judge:** `assessCompletion` keys off adopted engineer + preview readiness, not criteria PROVEN (`controller.mjs` ~2005–2073).
- **Phase 5:** No manufactured `outcomeCriteria` from brief (`startBuild` ~524–541).
- **Phase 6/7 UI:** Project rail + build identity footer (`tests/s5/build-phase6-project-rail.test.ts`; surface under `build/surface/public/`).
- **Explicit review:** `applyCandidate` / `discardCandidate` only paths to move or reject product SHA.

### S5-only mechanisms (candidates for future core extraction — **not moved in this audit**)

| Mechanism | Location | Note |
|-----------|----------|------|
| Build record schema | `build/record.mjs` | Product loop, conversation, children |
| Cognitive loop / tick | `controller.mjs` `runUntilDone` | Orchestrates brief → engineer |
| Coordinator RPC | `build/coordinator/*` | Durable mutation serialization |
| Product view projection | `build/surface/product-view.mjs` | UI truth layering |
| Preview runtime manager | `build/runtime/manager.mjs` | Static server / dev server child |

### Findings

| ID | Severity | Finding | Evidence |
|----|----------|---------|----------|
| S5-01 | MEDIUM DEBT | **`fakeMode` coordinator** stubs Gateway (`coordinator/service.mjs` ~36–59) — used in headless/proof, not operator path-build default. | `PATHCODE_BUILD_COORDINATOR_FAKE` |
| S5-02 | LOW DEBT | Residual **`outcomeCriteria`** array in schema and tests; UI ceremony removed Phase 5 but field persists for harness/history. | `product-view.mjs` exports `criteria` |
| S5-03 | INFO | Engineering activity projection is **read-only** from children, traces, checkpoints (`engineering-activity.mjs` header). | |

**S5 STATUS: PASS WITH DEBT** — Builder is a genuine experience over shared Gateway/Fabric/S2 adoption; orchestration layer is necessarily S5-local today.

---

## 9. Cross-stage authority matrix

| Authority | Canonical owner | Source of truth | Writers | Readers | Duplicates? |
|-----------|-----------------|-----------------|---------|---------|-------------|
| Creator intent (current request) | Build record `intent.outcome` + conversation | `*.build.json` | `reviseIntent`, `applyConversation`, `startBuild` | Surface `product-view.mjs` | No |
| Project identity | `projectBindings[].projectRoot` + git remote | Build record + git | `startBuild`, bind | Coordinator, Gateway bind | No |
| Authoritative product revision | `authoritativeSha` on product branch | Git HEAD at `path-build/*` | **Only** `applyCandidate` → `adopt.mjs` | Preview, surface | No (candidate is staging) |
| Candidate result | `pendingCandidate` | Build record | `consumeChildResult` engineer branch | Surface review UI | Checkpoint mirrors task, not candidate |
| Adoption | Creator Apply + `adoptTaskResult` | Git merge + checkpoint `MERGED` | `applyCandidate` | History, Code `/merge` | No |
| Discard | Creator Discard + `discardTaskResult` | Checkpoint `DISCARDED` | `discardCandidate` | Code `/discard` | No |
| Task identity | Gateway `taskId` | Checkpoint `taskId` | Gateway `startTask` | Trace, reports, children | No |
| Engine selection | G10 Fabric `selectEngineForTurn` | Checkpoint + events | `ag10/index.mjs` | Gateway events, children `provider` | No |
| Engine execution | Provider SDKs in Fabric | Worktree + checkpoint | Cursor/Copilot/AG adapters | Gateway stream | No |
| Executor provenance | Checkpoint + child `provider` | G10 checkpoint / task result | Fabric turn completion | `engineering-activity.mjs` | No |
| Model provenance | SDK/env when known | `engineModel` on child if set | Cursor/Copilot adapters | Surface receipt | Partial — not registry-backed |
| Validation result | ag1 validation / classification | Checkpoint `finalState`, report | ag1 session | consumeChildResult | No |
| Lifecycle status (product) | `loop.status` + conversation sync | Build record | controller, coordinator | Surface | No |
| Preview identity | `lastGoodPreview` / `authoritativeSha` | Build record + git | Apply, `setLastGoodPreview` | iframe preview | Runtime URL is derived |
| Preview runtime | `build/runtime/manager.mjs` | Process registry + port file | coordinator sync | Browser | Recreated from SHA |
| Project history | `adoptionHistory`, `children` | Build record | Apply, consume | Rail, activity | No |
| Conversation history | `conversation[]` | Build record | `applyConversation` | Surface | syncConversationLifecycle heals |
| Recovery (task) | G10 checkpoint + host-startup | `metadata/tasks/` | Gateway, Fabric, lifecycle | CLI notices, reconcile | Separate from src/recovery store |
| Stop/pause/resume | Build controller | Build record | `stopBuild`, `pauseBuild`, `resumeBuild` | Surface | Gateway cancel for active task |
| Gateway identity | `gatewayId`, hello handshake | Runtime process | `createGatewayRuntime` | Build identity footer | Single socket owner |
| Build identity | `loadedCodeIdentity` | package scripts SHA | coordinator boot | `/api/identity` | Docs commit does not change runtime SHA |

**Competing owners:** None identified for adoption or authoritative SHA. **Dual recovery substrates** (S4-01) are parallel systems for different hosts, not duplicate writers to the same authority.

---

## 10. PATH Code ↔ PATH Build shared-core analysis

### Shared

- Gateway client/runtime (`ensureGateway`, `createGatewayRuntime`)
- ag1 admission, worktrees, validation handoff
- ag10 Engine Fabric and checkpoints
- `result-lifecycle.mjs` adoption/discards
- Task trace, engineering reports, process registry
- Runtime root layout (`ag9/layout.mjs`)

### Divergent

| Area | PATH Code | PATH Build |
|------|-----------|------------|
| UX | Terminal / inline studio / NDJSON | Browser surface + coordinator RPC |
| Product orchestration | Session loop in `pathcode.mjs` | `build/controller.mjs` + build record |
| Authoritative tree | Usually primary repo | `path-build/<id>` product branch |
| Completion semantics | Task verified → operator `/merge` | Engineer → candidate → Apply |
| Extra durability | General Session `src/recovery` store | `*.build.json`, preview runtime |

### Answers

**A. Two experiences over one core?** **Yes** for live engineering (Gateway + Fabric + checkpoints + shared adopt primitive). **Partially** for editing-oriented General Session and TypeScript recovery store, which are Code-host paths not used by Builder.

**B. Where they diverge:** Build record cognitive loop, coordinator, preview runtime, product branch layout.

**C. Divergence class:** Presentation + product orchestration = **intentional**; dual recovery substrate = **technical debt**; Gateway bypass env = **compatibility debt**, not architectural contradiction for default operator paths.

---

## 11. No-synthetic / fake operator-product audit

| Pattern | Classification | Reachability |
|---------|----------------|--------------|
| `PATHCODE_GATEWAY_FAKE_ENGINE` scripted tools/commits | Test/evidence only if env set | Not default |
| `PATHCODE_BUILD_FAKE` / coordinator fake gateway | Headless/proof | Env-gated |
| `runFakeChild` fake PROVEN criteria text | fakeMode only | `controller.mjs` ~1243–1257 |
| HTML `placeholder=` on inputs | Harmless UI affordance | Production |
| `isUnderstandingPlaceholder` | Filters legacy copy | `project-library.mjs` |
| `engineering-activity.mjs` | Projects from trace/checkpoint; redacts secrets | Production — authoritative |
| `product-view.mjs` `requestReceipt` | Derived from children/checkpoint fields | Production |

**Verdict:** Default operator Build/Code paths show **engine-derived** activity. Synthetic streams require **explicit env** or `fakeMode` (HIGH visibility in harnesses that `REFUSE fake fabric`).

---

## 12. Legacy / dead-control-path audit

| Remnant | Class | Notes |
|---------|-------|-------|
| `evaluate` / `challenge` kinds | Dead in tick; fakeMode + old children handlers | `controller.mjs` |
| `forceNextKind` evaluate/challenge | Stripped on load/write | `record.mjs` |
| `outcomeCriteria`, `briefToOutcomeCriteria` | Schema + tests; not default ceremony | Phase 5 |
| `proposedNextAction` | Creator text carrier | Still used |
| `fabricSteps` | Explicit multi-step only | Active when checkpoint plan remains |
| `supersedeActiveCognitiveChildren` | Migration/cleanup for stale children | ~842+ |
| `<details>` rail | Removed Phase 6 | UI tests |
| Direct `ag1/session` | Active only when Gateway disabled | `pathcode.mjs` |
| `inline-studio.mjs` | Separate studio surface | Not Builder |

---

## 13. Data / store map

| STORE | PATH / LOCATION | AUTHORITY | FORMAT | WRITER | READER | RECOVERY ROLE | DUPLICATION RISK |
|-------|-------------------|-----------|--------|--------|--------|---------------|------------------|
| G10 task checkpoint | `$RUNTIME_ROOT/metadata/tasks/<id>.checkpoint.json` | Task/result | JSON | Fabric, Gateway, lifecycle | Code, Build, history | Resume, merge lifecycle | Low |
| Checkpoint index | `metadata/tasks/index.json` | Index | JSON | task-checkpoint | host-startup | Enumerate tasks | Low |
| Build record | `metadata/builds/<id>.build.json` | S5 product | JSON | controller/coordinator | surface | Loop, candidate, SHA pointer | Medium vs checkpoint for “pending” |
| Build index | `metadata/builds/index.json` | Catalog | JSON | record.mjs | list builds | Discovery | Low |
| Build events | `metadata/builds/events/` (via events.mjs) | Audit projection | JSONL | appendBuildEvent | activity UI | Diagnostics | Derived |
| Engineering report | runtime reports dir per task | Task narrative | text | ag1 | consumeChildResult | Human-readable | Derived |
| Task trace | runtime task-trace | Tool stream | JSONL | Gateway | engineering-activity | UI worklog | Derived |
| Git product branch | user-chosen / build origin | **Authoritative product** | git | adopt merge | preview serve | Truth | — |
| Git task branch | `path/task-*` | Engineer output | git | ag1 worktree | adopt | Pre-adopt | — |
| Preview runtime state | runtime manager files / registry | Ephemeral | process | manager.mjs | browser | Rematerialize | Not authoritative |
| Gateway socket/pid | under runtime root | Live gateway | fs | server | ensure | Reclaim stale | Low |
| TS recovery store | OS state dir / injected root | Edit session | manifest+blobs | General Session | owners | Checkpoint edits | **Separate from G10** |
| ICE witness | operator projects | Paused product | git + build record | not in repair track | witness | N/A | — |

---

## 14. End-to-end execution trace (Phase 7 class flow)

| Step | Function / module | Boundary | Persisted | SHA behavior |
|------|-------------------|----------|-----------|--------------|
| 1 Creator message | `applyConversation` / surface API → coordinator | HTTP → RPC | conversation row | intent revision may bump |
| 2 Admission | `reviseIntent` / tick sets engineer objective | controller | build record | — |
| 3 Task creation | `dispatchChild` → `gateway.startTask` | Gateway | checkpoint skeleton | — |
| 4 Gateway | `runtime.startTask` | S1 | checkpoint early | — |
| 5 Fabric | `runAntigravityEngineeringSession` → `createG10Fabric` | S3 | checkpoint updates | worktree commits |
| 6 Cursor turn | `cursor-sdk.runEngineeringTurn` | provider | events → trace | task branch SHA |
| 7 Result | Gateway `session.engineering.result` | event | checkpoint `sha`, `changedFiles` | sourceSha |
| 8 Consume | `consumeChildResult` | controller | child `consumed` | — |
| 9 Candidate | `makePendingCandidate`, `awaiting_review` | S5 | `pendingCandidate` | restores auth checkout |
| 10 Review | Operator UI Apply | surface → `applyCandidate` | — | — |
| 11 Adopt | `adoptEngineerResultIntoBuild` → `adoptTaskResult` | S2 | MERGED lifecycle | **authoritativeSha** |
| 12 Preview | `setLastGoodPreview`, `runtimeSync.sync` | S5 runtime | preview URL, evidence | serves applied SHA |

**Failure stops:** Gateway start fail → `blocked` (`dispatchChild` ~1100–1127); merge fail → `lastAdoptionError`; discard → restore checkout.

---

## 15. Recovery trace (cold Builder restart, applied project)

| Step | Code | Side effects |
|------|------|--------------|
| Process start | `coordinator/server-main.mjs` → `createBuildCoordinatorService` | ensureGateway |
| Gateway identity | `ensureGateway` hello + `loadedCodeIdentity` | identity event |
| Coordinator startup | `reconcileStartup` | per-build `controller.recover` |
| Reconcile children | `reconcileBuildChildren` | may consume terminals → **candidate only if newly terminal** |
| Authoritative project | read `authoritativeSha`, checkout product branch | git read |
| Lifecycle projection | `syncConversationLifecycle`, `projectBuildForSurface` | read-only + heal flags |
| Runtime restoration | `runtimeSync.sync` / `runtimeManager.start` if web artifact | may spawn static server |
| Last-good preview | `projectLastGoodPreview` | embed path + SHA |
| Creator UI | surface polls build + preview iframe | no fake replay |

**Intentional writes on recover:** reconcile may persist healed child/conversation flags; **does not** call `applyCandidate` or `dispatchChild` unless `ensureLoop` + `shouldAutoRun` (and recent activity or fakeMode).

---

## 16. Findings table

| ID | Severity | Stage | Summary |
|----|----------|-------|---------|
| S1-01 | HIGH DEBT | S1 | Gateway bypass via `PATHCODE_USE_GATEWAY=0` / direct ag1 |
| S1-02 | MEDIUM DEBT | S1 | Fake gateway engine env produces synthetic activity |
| S1-03 | INFO | S1 | Multiple Gateway attach modes, one runtime |
| S1-04 | LOW DEBT | S1 | Socket start failure messaging |
| S2-01 | MEDIUM DEBT | S2 | pendingCandidate vs checkpoint lifecycle overlap |
| S2-02 | LOW DEBT | S2 | PR_OPEN lifecycle is Code-only path |
| S2-03 | INFO | S2 | Shared adoptTaskResult |
| S3-01 | MEDIUM DEBT | S3 | Env-based Cursor model resolution |
| S3-02 | MEDIUM DEBT | S3 | evaluate/challenge in fakeMode / dispatchChild |
| S3-03 | LOW DEBT | S3 | Legacy loop evaluate/challenge task id fields |
| S3-04 | INFO | S3 | Readiness module disclaims model registry |
| S4-01 | HIGH DEBT | S4 | src/recovery vs G10 checkpoint dual substrate |
| S4-02 | MEDIUM DEBT | S4 | updatedAt vs lifecycleActivityAt |
| S4-03 | MEDIUM DEBT | S4 | 10-minute auto-loop window on coordinator start |
| S4-04 | LOW DEBT | S4 | Temp scrub on reconcile |
| S5-01 | MEDIUM DEBT | S5 | Coordinator fakeMode stub gateway |
| S5-02 | LOW DEBT | S5 | outcomeCriteria schema remnant |
| S5-03 | INFO | S5 | Activity projection sourced from traces |

**Counts:** BLOCKER **0** · HIGH DEBT **2** · MEDIUM DEBT **8** · LOW DEBT **4** · INFO **4**

---

## 17. Blockers

**None** identified at `903fd29` / runtime `2ae7540` for authoritative truth, adoption authority, or default operator engineering paths.

---

## 18. Technical debt (prioritized)

1. **Unify or formally boundary** General Session `src/recovery` vs G10 checkpoints (S4-01).
2. **Document and eventually remove** Gateway bypass default footgun (S1-01).
3. **Consolidate model resolution** ahead of Dynamic Model Registry (S3-01) without expanding ad hoc env sprawl.
4. **Tighten coordinator auto-loop policy** on cold start (S4-03) if operators want zero autonomous tick without explicit resume.
5. **Collapse candidate/lifecycle duplication** in docs and optional schema cleanup (S2-01, S5-02).

---

## 19. Next-stage readiness

| # | Question | Answer |
|---|----------|--------|
| 1 | S1–S5 one coherent platform? | **Yes**, with documented debt at bypass/dual-store edges |
| 2 | One authoritative project reality per product? | **Yes** — git SHA on product branch + build record pointer |
| 3 | One Gateway authority? | **Yes** in default config |
| 4 | One Engine Fabric authority? | **Yes** — `ag10/index.mjs` |
| 5 | S2 admit/discard canonical? | **Yes** |
| 6 | Recovery safe from unintended engineering/adoption? | **Yes** for Apply; **qualified** for auto-loop window (S4-03) |
| 7 | Code and Build share core? | **Yes** for Gateway/Fabric/adopt; **partial** for General Session store |
| 8 | Operator engineering activity authoritative? | **Yes** in default paths |
| 9 | Remaining S1–S5 blockers? | **None** in this audit |
| 10 | Ready to begin next roadmap stage after review? | **Yes — PASS WITH DEBT** |
| 11 | Resolve before Dynamic Model Registry? | Dual recovery clarity; gateway bypass policy; env model pins vs registry design |
| 12 | Do NOT change before next stage? | Builder repair semantics (Apply/Discard, preview truth), ICE witness, closed runtime `2ae7540` implementation without new track |

---

## 20. Explicit non-claims

- No npm publish, remote push, or tag beyond existing `path-builder-repair-closed-20260927`.
- No re-run of Phase 6/7 repair or ICE engineering.
- No claim that `903fd29` is a new Builder **implementation** SHA — runtime remains `2ae7540`.
- No approval to start Model Registry, Astra, Grok, or new engines from this document alone.
- Tests passing is not sole proof; operator Phase 7 verification remains the acceptance witness for Builder product truth.

---

## 21. Evidence index

| Artifact | Path |
|----------|------|
| Builder repair freeze | `docs/reports/PATH_BUILDER_REPAIR_TRACK_FREEZE.md` |
| Phase 7 acceptance | `docs/reports/PHASE_7_ACCEPTANCE/acceptance.json` |
| S1 tests | `tests/s1/s1-gateway.test.ts` |
| S2 tests | `tests/s2/result-lifecycle.test.ts` |
| S3 tests | `tests/s3/engine-fabric.test.ts`, `tests/s3/fabric-routing.test.ts` |
| S4 tests | `tests/s4/continuity.test.ts`, `tests/s4/host-startup.test.ts` |
| S5 tests | `tests/s5/build-candidate-review.test.ts`, `build-phase3-auto-reengineer.test.ts`, `build-phase4-preview-lifecycle.test.ts`, `build-phase5-criteria-removal.test.ts`, `build-phase6-project-rail.test.ts` |
| Gateway runtime | `scripts/pathcode-cli/gateway/runtime.mjs` |
| Result lifecycle | `scripts/pathcode-cli/result-lifecycle.mjs` |
| Engine contract | `scripts/pathcode-cli/ag10/engine-contract.mjs` |
| Build controller | `scripts/pathcode-cli/build/controller.mjs` |
| Build coordinator | `scripts/pathcode-cli/build/coordinator/service.mjs` |

---

*End of PATH S1–S5 Full Platform Audit (audit-only).*
