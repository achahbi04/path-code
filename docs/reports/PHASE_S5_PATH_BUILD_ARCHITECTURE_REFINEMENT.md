# PATH CODE — S5
# PATH BUILD — ARCHITECTURE REFINEMENT
# Option A′ · Impact-aware re-inspection · Durable Build loop

**Document type:** SETTLED ARCHITECTURE (documentation only)  
**Parent audit:** [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)  
**Implementation:** NOT AUTHORIZED — pending operator review of this settlement  
**Slice plan:** NOT DEFINED  

**S4 status (unchanged):**

```text
IMPLEMENTATION FROZEN
AUTONOMOUS / LIVE VERIFICATION — PASS
PHYSICAL MAC REBOOT ACCEPTANCE — DEFERRED BY OPERATOR
```

S4.3 implementation `093a29aa…` · tip `2d56b23a…`

---

## Settlement judgment

**Option A′ is settled and ready for implementation authorization review.**

No repository-level contradiction blocks building it. Remaining work is implementation, not open architecture.

Challenges below **strengthen** thin orchestration: deep intelligence stays in the S3 fabric; Build stays a durable control loop with impact-proportionate inspection.

---

## Preserved product / architecture

PATH Build = product-level autonomous engineering control loop over PATH Code (S1–S4).

| Reuse | Role |
| --- | --- |
| Gateway + task lifecycle | Dispatch / await / steer / resume children |
| S3 engine fabric | Engineer, evaluate, challenge (need-fit) |
| S4 continuity | Child recovery + host reconcile |
| Ordinary PATH projects + `projectBindings` | Authoritative trees |
| Tools / runtimes / services / Git / checks / reports | Evidence |
| Thin durable Build record | Outcome, linkage, criteria, hypotheses — not a twin product |

“Thin” = minimal duplicated infrastructure/state — **not** reduced ambition or intelligence.

Architecture stays general; first proof does not define the ceiling.

---

## Settled stack

```text
                         USER OUTCOME
                         + explicit requirements
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │ PATH BUILD (thin loop) │
                     │ record · policy · S4   │
                     └───────────┬────────────┘
                                 │
              child tasks: engineer | evaluate | challenge
                                 │
                                 ▼
                           PATH CODE / Gateway
                         Unified Engine Fabric
                      AG · Copilot · Cursor
                                 │
                    FS / Git / checks / runtime / reports
                                 │
                                 ▼
              impact-aware re-inspect → update criteria
              (hypotheses yield to reality)
```

**Task kinds** (labels on ordinary PATH tasks — not new executors):

| Kind | Purpose |
| --- | --- |
| `engineer` | Close a gap / establish structure |
| `evaluate` | Judge existence, gaps, next objective, criterion proposals |
| `challenge` | Falsify important claims against real evidence |

---

## 1. Intent representation — separate four layers

Smallest coherent Build-record split:

```text
intent: {
  outcome: string,                    // software result the user wants
  outcomeRevision: number,            // bumps when user revises intent
  revisedAt?: ISO,
  explicitRequirements: [             // user-stated invariants / constraints
    {
      id,
      statement,                      // e.g. offline-capable, specific stack, data rules
      status: SATISFIED | VIOLATED | UNKNOWN,
      evidence: EvidenceRef[],        // same ref shape as criteria
      required: true,                 // explicit requirements are required by default
    }
  ]
}

outcomeCriteria: [                    // observable “does the result exist?”
  {
    id,
    statement,
    required: boolean,
    status: PROVEN | UNMET | UNKNOWN,
    evidence: EvidenceRef[],
    challengedByTaskId?,
    updatedAt,
  }
]

hypotheses: {                         // NON-AUTHORITATIVE
  architectureNotes?,
  gapPlan?,
  ordering?,
  topologyAssumptions?,
  proposedNextAction?,
  revisedByTaskId?,
  updatedAt,
}
```

| Layer | Authority | Who may change |
| --- | --- | --- |
| **Outcome** | User intent | Operator revision only (Build records revision; does not invent) |
| **Explicit requirements** | User constraints | Operator revision; engines must **respect**, not silently weaken |
| **Outcome criteria** | Observable product claims | Evaluate/challenge + mechanical invalidation from evidence |
| **Hypotheses** | Inferred plan only | Fabric evaluate / engineering revelation — freely revisable |

**Rules:**

1. Engines may reconsider **hypotheses** without touching explicit requirements.  
2. Evaluate/challenge must assess **both** criteria achievement **and** requirement respect.  
3. Product-level steering that changes outcome/requirements updates `intent` **before** (or as) it reaches child prompts; bumps `outcomeRevision`; invalidates hypotheses and any evidence whose scope depended on the old intent.  
4. Child-only steer (active task) uses existing Gateway `task.steer` / `pendingSteering`; Build-level intent change is recorded on the Build record and pushed into subsequent objectives (and into the live child via steer when one is running).

---

## 2. Impact-aware re-inspection policy

**Principle:**

```text
ALWAYS REFRESH REALITY CHEAPLY.
REVALIDATE ACCORDING TO IMPACT.
DEEPEN INSPECTION WHEN THE EVIDENCE WARRANTS IT.
```

Re-inspection is **mandatory** before advancing from a child terminal result (or Build recovery) to the next Build decision. It is **not** “rerun the whole product after every child.”

### Depth A — Lightweight reality refresh (normal loop)

**Triggers:** every child terminal disposition; Build-loop recovery; before selecting next action after consume.

**Consumes (existing facilities):**

| Fact | Source |
| --- | --- |
| Child disposition / result | Checkpoint `finalState`, Gateway snapshot, report, `task-history` |
| Binding + worktree identity | `projectBindings[].projectRoot`, checkpoint `worktreePath` / `repoRoot` |
| Git HEAD / dirty / untracked | `captureTaskReality` / `reconcileTaskReality` (`ag10/task-reality.mjs`) |
| Change fingerprint | `diffFingerprint`, `changedFiles`, porcelain |
| Check/report refs | Checkpoint `validation`, engineering report path, history hints |
| Prior runtime notes | Existing service metadata timestamps if present (`ag9/services` meta) — **read**, don’t start |

**Does not:** launch full suites, start compose, or request a fabric reasoning turn.

**Question:** What changed, and which conclusions may be stale?

**Distinguish:**

- **Child result identity** — task worktree / task branch / result SHA (`checkpoint.sha`, `branch`)  
- **Product revision** — binding primary HEAD + dirty fingerprint **after** any adopt/merge into the product tree  

A completed child and the product revision that incorporates it are different anchors.

**Action:** produce a `RealityDelta` (mechanical): changed paths, fingerprint before/after, candidate stale criterion/requirement ids (path/config heuristic). Set `pendingReinspect: false` only after this refresh completes (see §4).

### Depth B — Targeted revalidation (impact hits a claim)

**Triggers:** RealityDelta shows code/deps/config/interfaces/schemas/runtime touching a criterion or explicit requirement scope; **or** impact unknown for a required claim.

**Consumes / runs through PATH:**

- Scope the affected evidence  
- Mark affected `PROVEN`/`SATISFIED` → `UNKNOWN` (pending)  
- Reuse `discoverAffectedChecks` (`ag9/affected.mjs`) + `ag5/native-validation` / prepare validation paths  
- Run **relevant** tests/builds/probes via ordinary PATH mechanisms (engineer or evaluate task with shell/validation needs — not a new runner)  
- Update evidence refs + statuses from actual results  

**Examples:**

- Auth code change → session/auth checks in scope; docs-only change → retain auth evidence if independence established from changed-file set.  
- **Unknown impact → UNKNOWN**, then broaden enough to resolve — never assume harmless.

### Depth C — Deep product inspection (justified)

**Triggers:** architecture/topology change; cross-binding contract change; contradictory evidence; possible explicit-requirement violation; challenge needing broader runtime proof; **candidate BUILD COMPLETE**.

**Behavior:** sufficient coverage of outcome + requirements — not blindly every historical command. Reuse valid evidence when anchors still match (§3). Fabric `evaluate`/`challenge` where judgment is needed; mechanical freshness stays mechanical.

### Policy table

| Trigger | Depth | Evidence consumed | Action | Invalidation |
| --- | --- | --- | --- | --- |
| Child terminal / recovery | A | Reality + reports | Delta; flag stale candidates | Potentially affected → UNKNOWN |
| Delta intersects claim scope | B | Affected checks / targeted probes | Fresh evidence | Failure → UNMET/VIOLATED; pass → restore PROVEN/SATISFIED |
| Impact unclear on required claim | B→widen | Broader checks until resolved | Don’t advance on assumption | Stay UNKNOWN until resolved |
| Topology / contradiction / COMPLETE candidate | C | Evaluate±challenge + needed runtime | Gate next action / COMPLETE | Stale proofs demoted first |

---

## 3. Evidence freshness and invalidation

### EvidenceRef (compact anchors — not a product copy)

```text
EvidenceRef: {
  kind: git | fs | check | runtime | report | validation,
  ref,                         // path, check id, report path, command id, …
  bindingId,
  taskId?,                     // child that produced observation
  headSha?,                    // commit when observed (may be null if dirty/unborn)
  dirtyFingerprint?,           // e.g. task-reality diffFingerprint / porcelain hash
  configFingerprint?,          // optional hash of scoped manifests/lockfiles
  toolchainHint?,              // when result depends on toolchain identity
  runtimeObservationAt?,       // ISO if runtime/service was observed
  scope: string[],             // criterion/requirement ids this supports
  observedAt: ISO,
}
```

**Existing fields to reuse:** checkpoint `headSha`, `diffFingerprint`, `changedFiles`, `sha`/`baseline`/`branch`, `validation`; `captureTaskReality`; report paths via `engineering-report.mjs` / `task-history.mjs`; affected-check command lists.

**Proposed Build-only additions:** `dirtyFingerprint` + `scope` on refs; `configFingerprint` when deps/config matter; store refs on criteria/requirements — **not** a parallel inspection engine.

**Commit alone is insufficient** when dirty or env changed. **Timestamp alone** does not prove validity.

### Invalidation rules

| Situation | Effect |
| --- | --- |
| Proof potentially affected or anchors mismatch | → `UNKNOWN` (criteria) / `UNKNOWN` (requirements) pending fresh evidence |
| Observed absence/failure | → `UNMET` or requirement `VIOLATED` |
| Fresh supporting evidence with matching anchors | → `PROVEN` / `SATISFIED` |
| Unrelated changes + independence established | **Retain** prior evidence |
| Unknown impact on required claim | Treat as stale → `UNKNOWN`, then Depth B |

Re-inspection **invalidates** stale conclusions — it does not merely append events beside old `PROVEN` rows.

Freshness check (mechanical): compare ref.`headSha`+`dirtyFingerprint`(+`configFingerprint` if present) to current binding reality; mismatch ⇒ stale.

---

## 4. S4 applied to the Build controller

Children already have checkpoints, process identity, `reconcileHostStartup`, resume/rehydrate. Build needs the **same honesty** for loop decisions and linkage.

### Durable Build record additions (loop control)

```text
buildId
intent / outcomeCriteria / hypotheses / projectBindings
children: [{
  taskId, bindingId, kind,
  actionId,                    // stable Build action identity
  dispatchState: selected | dispatched | terminal_seen | consumed,
  resultFingerprint?,          // from child checkpoint when consumed
}]
loop: {
  pendingReinspect: boolean,   // MUST be true after terminal until Depth A done
  lastRealityDelta?,
  lastConsumedActionId?,
  status: running | blocked | complete,
}
intentRevision / updatedAt
```

### Action identity / dispatch idempotency

**Reuse pattern:** `ExternalActionRegistry` / `EventIdempotencyGuard` (`ag10/guards.mjs`).  
**Gateway seam already present:** `startTask` accepts client `taskId`; duplicate in live map → `TASK_EXISTS` (`gateway/runtime.mjs`).

**Smallest coherent extension (identified gap):**

| Gap | Extension |
| --- | --- |
| Build must not double-dispatch after crash | Pre-allocate `taskId` = f(actionId); durable-record `dispatched` **before or atomically with** Gateway start; on replay: if checkpoint/history shows task, **resume/await** — do not create a second task |
| Gateway has no Build-level action log | Build record is that log (under `PATH_RUNTIME_ROOT` metadata, atomic write like checkpoints) |

No second Gateway protocol required if Build owns actionId↔taskId and uses existing start/resume/TASK_EXISTS.

### Recovery boundaries

| Boundary | Recovery |
| --- | --- |
| Next action **selected**, child not dispatched | Replay selection from durable `selected` row; dispatch with same `actionId`/`taskId` |
| Child **dispatched**, linkage not recorded | Scan runtime tasks/checkpoints for known `taskId` prefix / binding; repair `children[]`; treat as dispatched |
| Child **completed**, result not consumed | Load checkpoint/report; mark `terminal_seen`; run consume once (idempotent on `actionId`) |
| Evidence recorded, criteria update interrupted | Re-apply consume from child anchors (idempotent status write); set `pendingReinspect` |
| Criteria updated, next action not dispatched | Depth A if `pendingReinspect`; then select next — **never** skip re-inspect |

### Desired restart behavior

```text
recover buildId
  → reconcile child tasks (S4 assess/resume as needed)
  → determine what actually happened (checkpoints > Build memory)
  → consume each terminal result idempotently (once per actionId)
  → if pendingReinspect → Depth A (then B/C as policy)
  → continue same Build
```

**Hard rule:** restart must **not** skip unfinished re-inspection and launch the next task from stale conclusions (`pendingReinspect` gate).

Physical Mac reboot acceptance remains **DEFERRED BY OPERATOR**; child + Build-loop design assumes S4 live-verified behavior.

---

## 5. Integrated intelligence rules (still Option A′)

### Product-level steering

User revises outcome/requirements → update `intent` + `outcomeRevision` → invalidate hypotheses and scoped evidence → steer live child if any (`task.steer` with revision summary) → all **future** child objectives include current intent. Not merely patching the active prompt.

### Cross-binding evaluation

Fabric evaluate/challenge may receive a **referenced evidence package** (paths, SHAs, report refs, contract files, prior check ids) spanning multiple bindings while the task itself is bound to **one** cwd for mutation/tools.

**Two green repos ≠ integration.** Compatibility claims need contract/runtime evidence, e.g.:

- shared API schema / client stubs matching  
- end-to-end probe or compose spanning services  
- explicit contract tests  

Absent that → criterion stays `UNKNOWN`/`UNMET`, not `PROVEN`.

### Evaluate / challenge behavior

Assessment-shaped objectives (fabric already maps assess/inspect/review → `assessment` needs in `inferTurnNeeds`).  

**Must not** silently become implementation tasks. Temporary test/setup in the worktree must be distinguishable (prefer disposable paths / revertible probes; report must label probe artifacts vs product changes). If an evaluate mutates product intent, treat as control failure — follow with reality refresh and hypothesis correction.

### Challenge participation

For important claims, prefer a **different fit peer** when available (`selectEngineForTurn` rotate / continuity rules) — **not** permanent reviewer roles. Different providers alone ≠ independence; challenge must add real evidence.

### No-progress handling

Reuse `NoProgressCircuitBreaker` spirit (`ag10/guards.mjs`) at **Build loop** level:

- Same failure + no new evidence → stop identical retries  
- Force `evaluate` reconsideration, different investigation, or honest block (“missing X”)  
- Progress includes **learning an approach is wrong**, not only counting PROVEN criteria  

### Greenfield origin — settled from code

**Probe result (this settlement):**

| Starting cwd | `resolveTargetProjectRoot` | Admission |
| --- | --- | --- |
| Empty directory | `NOT_A_PROJECT` | — |
| Empty dir + `git init` only (unborn HEAD) | **ok** (Git toplevel) | **ok**, `unversioned: true` |

**Settled origin seam (smallest, no scaffolder):**

1. Build creates/selects directory.  
2. Build runs **`git init` only** (no commits, no manifests, no templates).  
3. Register `projectBindings` entry; bind via **ordinary** Gateway path.  
4. First child `engineer` establishes architecture/manifests/structure through the fabric.  
5. Thereafter: normal PATH project forever.

**Rejected as primary:** Build-role empty-dir Gateway exception — unnecessary given git-init already admits; keep Code’s `NOT_A_PROJECT` honest for casual empty cwds.  

**Optional later** empty bind remains possible but is **not** required for A′.

Architecture/implementation stay with the fabric — origin does not define the product.

---

## 6. Modules reused vs missing seams

### Reuse unchanged

| Module | Use |
| --- | --- |
| `gateway/runtime.mjs` start/resume/steer/await | Child lifecycle; client `taskId`; `TASK_EXISTS` |
| `ag10/task-reality.mjs` | Depth A freshness |
| `ag10/task-checkpoint.mjs` | Child truth + anchors |
| `ag10/host-startup.mjs` / continuity | Child reconcile after interrupt |
| `ag10/engine-contract.mjs` / fabric | Engineer/evaluate/challenge |
| `ag10/guards.mjs` | Idempotency + no-progress patterns |
| `ag9/affected.mjs` / native-validation / prepare | Depth B/C |
| `engineering-report.mjs` / `task-history.mjs` | Evidence refs |
| `ag1/admission.mjs` + `paths.mjs` | Bind after git-init origin |

### Missing seams (smallest coherent set — not a new engine)

| Seam | Why |
| --- | --- |
| Durable Build record I/O (atomic) | Loop state, intent, criteria, children, `pendingReinspect` |
| Build actionId ↔ taskId dispatch protocol | Idempotent dispatch/consume |
| EvidenceRef freshness compare helper | Mechanical stale detection using reality fingerprints |
| Build-level no-progress counter | Across child attempts, not only intra-task handoffs |
| Intent revision → steer + invalidate | Product-level steering |
| Evaluate evidence-package prompt convention | Cross-binding claims without multi-root Gateway |

No separate inspection engine. No fat product graph.

---

## 7. Worked traces

### T1 — Unrelated change retains valid evidence

1. Criterion `auth-works` PROVEN with EvidenceRef scoped to `src/auth/**`, anchors SHA+dirty FP.  
2. Child engineers `README.md` only.  
3. Depth A: delta = README; auth scope untouched; independence established.  
4. **Retain** `auth-works` PROVEN. No Depth B.

### T2 — Relevant change invalidates and revalidates

1. Same `auth-works` PROVEN.  
2. Child changes `src/auth/session.ts`.  
3. Depth A: delta intersects auth scope → mark `auth-works` **UNKNOWN**.  
4. Depth B: affected/auth tests via PATH → pass → PROVEN with new anchors; fail → UNMET.

### T3 — Restart after child completion

1. Child terminal; Build crashes after checkpoint written, before consume.  
2. Recover `buildId` → see child terminal via checkpoint → consume **once** (`actionId`) → `pendingReinspect=true`.  
3. Depth A → then next decision.  
4. Replay does **not** `startTask` again (`TASK_EXISTS` / existing checkpoint).

### T4 — Cross-binding compatibility

1. Binding `api` and `web` each have VERIFIED children.  
2. Criterion `api-web-contract` cannot PROVEN from two solos.  
3. Evaluate/challenge with evidence package + e2e/contract probe → only then PROVEN; else UNKNOWN/UNMET.

### T5 — BUILD COMPLETE

Allowed only when:

- all **required** criteria `PROVEN` with **fresh** anchors, and  
- all **explicit requirements** `SATISFIED` (none VIOLATED/UNKNOWN), and  
- Depth C evaluate±challenge supports completeness against current intent revision, and  
- `pendingReinspect` is clear.

Child VERIFIED counts are insufficient.

---

## 8. Refined control loop (settled)

```text
1. Ensure binding (git-init origin if needed)
2. Recover/reconcile children (S4); idempotent consume; honor pendingReinspect
3. Depth A reality refresh → invalidate stale proofs
4. Depth B/C as policy (impact / COMPLETE / contradictions)
5. If required criteria+requirements satisfied → BUILD COMPLETE
6. Else issue evaluate (judgment) or engineer (gap) or challenge (important claim)
7. Await child; on terminal goto 2
```

Sequential children = **v1 execution policy**, not schema.

---

## 9. Conclusion

| Question | Answer |
| --- | --- |
| Architecture | **Option A′ settled** |
| Open contradiction? | **None** at repository level |
| Origin | **`git init` only** — existing bind/admission; fabric builds the software |
| Inspection | Impact-aware A/B/C; cheap by default |
| Build durability | ActionId + pendingReinspect + idempotent consume on S4 children |
| Ready for implementation authorization? | **YES** — pending your review of this settlement |

**No implementation or S5 slice plan is authorized by this document.**
