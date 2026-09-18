# PATH CODE — S5
# PATH BUILD — ARCHITECTURE REFINEMENT
# Thin orchestrator · fabric intelligence · no second state universe

**Document type:** REFINED ARCHITECTURE RECOMMENDATION ONLY  
**Parent audit:** [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)  
**Implementation:** NOT AUTHORIZED  
**Slice plan:** NOT DEFINED  

**Judgment on challenges:** These challenges **strengthen Option A** — they do **not** require Option B’s fat product graph, and they do **not** expose a different repository-grounded architecture.  
They convert the prior “Build invents evaluation intelligence” soft spot into: **Build remains thin; S3 fabric performs deep product-level reasoning as ordinary PATH tasks.**

---

## Settled recommendation

**Option A′ — Thin Build orchestrator + fabric-executed cognition**

```text
                    USER OUTCOME
                         │
                         ▼
              ┌─────────────────────┐
              │   PATH BUILD (thin) │
              │  durable record +   │
              │  loop / policy only │
              └──────────┬──────────┘
                         │
         issue PATH tasks (kinds below)
                         │
                         ▼
                    PATH CODE
                   PATH Gateway
              Unified Engine Fabric
           AG · Copilot · Cursor (need-fit)
                         │
              FS / Git / run / test / report
                         │
                         ▼
         evidence → Build updates thin record
              (hypotheses yield to reality)
```

**Build owns:** outcome identity, thin durable record, loop cadence, bind/re-bind policy, when to issue which *kind* of PATH task, when to claim BUILD COMPLETE.  

**Build does not own:** a permanent reasoning brain, a twin product graph, engine selection by provider brand, or authoritative “what exists.”

---

## 1. Thin state, deep intelligence

### Problem in the prior audit

Option A risked implying that “evaluator / gap select” is a **new permanent Build brain**. That would either:

- stay dumb (heuristic-only), or  
- become a second agent architecture beside the fabric.

### Refinement

Product-level evaluation, gap discovery, architectural reconsideration, and next-objective selection are **PATH Code tasks** driven through the frozen S3 fabric — same Gateway, same need-fit routing (`inferTurnNeeds` / `selectEngineForTurn`), same worktree/reality rules.

Build only:

1. Chooses the **task kind** and **binding**  
2. Frames a precise **objective** for that kind  
3. Awaits the authoritative **report + Git/FS**  
4. Updates thin durable fields (hypotheses + evidence refs)  
5. Decides the next loop step  

### Task kinds (policy labels on child tasks — not new executors)

| Kind | Intent | Fabric participation |
| --- | --- | --- |
| `engineer` | Close a gap (implement / repair / establish structure) | Need-fit edit/shell/repair as today |
| `evaluate` | Against outcome + bindings: what exists, what’s missing, ranked gaps, proposed next objective | Prefer assessment-shaped objectives (fabric already classifies `assessment` needs) |
| `challenge` | Attempt to **falsify** a product-level claim against real evidence | Assessment + shell/validation needs; peer rotate allowed |

No permanent “planner engine” or “reviewer engine.” Provider names never get fixed Build roles. Continuity preference and rotate-among-fit-peers remain S3 law.

### How one PATH product stays coherent

- Every cognitive step is a real `taskId` with checkpoint, report, history, S4 resume.  
- Operator `/history` / `/inspect` sees Build child tasks as PATH tasks.  
- Engines never talk to a secret Build channel — only ordinary objectives + shared project reality.

### What stays in thin Build (non-brain)

- `buildId`, outcome text  
- `projectBindings[]` (see §3)  
- `childTaskIds[]` (+ optional kind tags)  
- `outcomeCriteria[]` status + evidence refs (see §5)  
- `hypotheses` (gap plan / architecture notes) — **explicitly non-authoritative**  
- loop status (`running` / `blocked` / `complete`)

Mechanical inspection Build may do **without** a fabric turn (cheap, deterministic):

- existsSync / Git porcelain / read last reports / list child dispositions  

Anything that requires judgment → **fabric task**, not a Build-local LLM.

---

## 2. Evidence-challenge loop

### Yes — bounded, fabric-backed falsification

Before Build may mark a criterion `PROVEN`, or claim `BUILD COMPLETE`, it should be able to issue a **`challenge` task**:

> Attempt to falsify: “\<claim\>”.  
> Use only repository, runtime, tests, services, and PATH reports under the bound project(s).  
> Return: claim stands | claim falsified | evidence insufficient — with concrete paths/commands/check ids.

### Design rules

| Rule | Rationale |
| --- | --- |
| Challenge is a PATH task | Reuses fabric, validation, S4 |
| No permanent reviewer role | Need-fit + peer rotate; never “Copilot always reviews” |
| Bounded | Not every micro-claim; **required outcome criteria** and **BUILD COMPLETE** gate |
| Evidence beats rhetoric | Challenge that cannot cite FS/Git/check/runtime evidence → criterion stays `UNKNOWN`, not `PROVEN` |
| Engineer may not self-certify Completeness alone | Completeness requires evaluate ± challenge after engineering evidence exists |

### Claim lifecycle (thin)

```text
hypothesis / engineer result
        │
        ▼
   evaluate → propose criterion statuses
        │
        ▼
   (optional/required) challenge important PROVEN candidates
        │
        ├── falsified → UNMET · revise hypotheses · next engineer
        ├── stands + evidence → PROVEN
        └── insufficient → UNKNOWN · gather evidence (engineer or evaluate)
```

This is how Build becomes **more intelligent than a one-shot generator** without a second universe: adversarial product claims inside the same fabric.

---

## 3. Project root generality — `projectBindings`

### Correction to the prior audit

“Same `projectRoot` forever” was too strong as a **product ceiling**.  
It remains the **simple/common case**, not the architectural limit.

Gateway still binds **one** root per session/task — that is fine. Build sits above that.

### Thin Build-owned model

```text
projectBindings: [
  {
    bindingId,
    projectRoot,          // ordinary PATH TARGET_PROJECT_ROOT
    roleHint?,            // hypothesis only: "api" | "web" | … — NOT authority
    createdByTaskId?,
  }
]
```

**Rules:**

1. Each binding is an ordinary authoritative PATH project (Git or Build-origin → then engineered).  
2. Each child task names **one** `bindingId`; Build **re-binds** Gateway to that `projectRoot` before `startTask` / `resumeTask`.  
3. **No** duplicate product graph of services/packages — topology lives in the trees.  
4. Default: **one** binding for the whole Build. Multi-binding only when the outcome genuinely requires separate repositories.  
5. Cross-binding evaluation: an `evaluate`/`challenge` task binds to one root at a time **or** Build runs one evaluate per binding and mechanically merges evidence refs into criteria (still no twin graph).  
6. PATH Code convergence: any single binding is forever a normal Code project; Build is optional orchestration above it.

### What this is not

- Not multi-root inside one Gateway task  
- Not a service mesh model in Build metadata  
- Not forced multi-repo for v1 proofs  

---

## 4. Greenfield origin without scaffolder architecture

### Smallest origin seam

Use the reserved Gateway **`build` client role / `path_build_slot`** to admit a **Build-origin root** that may initially be **empty** (or nearly empty):

| Step | Who | What |
| --- | --- | --- |
| O0 | Build | Create/select directory; register as first `projectBindings` entry with origin mark (e.g. `buildOrigin: true`) |
| O1 | Gateway (Build role) | Allow bind of that root **without** `looksLikeExistingProject` / without requiring Git — **Build client only**, not general Code cwd |
| O2 | Build | First child task kind=`engineer` on that binding: establish Git + architecture + manifests as **real engineering**, fabric-chosen |
| O3 | Reality | Once markers/Git exist, root is ordinary PATH project; further binds need no special case |

### What origin must not be

- Template catalog / “choose stack” as the product definition  
- PATH writing a fixed scaffold outside the fabric  
- Declaring architecture complete at O0  

Origin’s only job: **make the existing engineering system able to take over** with zero migration thereafter.

Unversioned_inplace already proves PATH can engineer before Git; Build-origin extends that one step earlier (empty dir), then prefers early Git via the first engineer task for isolation/S4 quality.

---

## 5. Product completion evidence

### Child `VERIFIED` ≠ BUILD COMPLETE

A child task can be VERIFIED for a local objective while the product outcome remains unmet.

### Thin outcome-criteria model

```text
outcomeCriteria: [
  {
    id,
    statement,                 // product-level claim
    status: PROVEN | UNMET | UNKNOWN,
    evidence: [                // references only — no blob twin of the tree
      { kind: git|fs|check|runtime|report|validation, ref, taskId? }
    ],
    challengedByTaskId?,
    updatedAt,
  }
]
```

| Status | Meaning |
| --- | --- |
| `PROVEN` | Challenge/evaluate accepted with concrete evidence refs; not merely engineer success |
| `UNMET` | Inspection or challenge shows absence/failure |
| `UNKNOWN` | Insufficient evidence to decide |

### BUILD COMPLETE gate (architecture)

Allowed only when:

1. All **required** criteria are `PROVEN` (none `UNMET`/`UNKNOWN`), and  
2. At least one recent `evaluate` (and bounded `challenge` on completeness / critical criteria) supports that set against live bindings, and  
3. Mechanical consistency: cited paths/checks still resolve (FS/Git wins — stale PROVEN demoted to UNKNOWN/UNMET on re-inspect).

Optional criteria may remain UNKNOWN without blocking if marked non-required.

---

## 6. Execution policy vs architecture

**Sequential child tasks are an execution policy for early Build, not a durable-schema assumption.**

Durable record tracks `childTaskIds` (and kinds/bindings). It must **not** encode “only one running child forever.”

Future-safe (no v1 concurrency required):

- Independent gaps on **disjoint bindings** or clearly non-overlapping scopes could later run concurrent Gateway tasks.  
- Shared single-root mutation concurrency remains constrained by existing collab leases / worktree reality — Build must not invent a second lock universe.

v1 may run strictly sequential while keeping the schema concurrency-agnostic.

---

## 7. Self-correcting product plan

### Plans are hypotheses

Gap lists, architecture notes, `roleHint` on bindings, and “next objective” proposals are stored as **hypotheses** (from `evaluate` tasks or prior loops).

They are **never** authority over:

- what exists  
- what to keep building when reality diverges  

### S4 principle applied at product level

> FS/Git/reality wins over stale memory.  
> (`task-reality.mjs` / reconcile — already law for tasks)

Build loop:

```text
every cycle (and after every child terminal state):
  mechanical re-inspect bindings
  if reality contradicts hypotheses → invalidate affected criteria / gap hypotheses
  issue evaluate (fabric) when judgment needed
  only then select next engineer/challenge
```

If engineering proves the initial architecture wrong (e.g. mono vs multi-repo, wrong service split):

1. Do **not** finish the stale gap list  
2. `evaluate` rewrites hypotheses  
3. May add/remove `projectBindings`  
4. Demote relevant `PROVEN` → `UNKNOWN`/`UNMET` when evidence no longer holds  
5. Continue  

Blind plan completion is an architectural failure mode — explicitly rejected.

---

## Challenge → architecture verdict

| Challenge | Effect on Option A |
| --- | --- |
| 1 Fabric for evaluation/gaps | **Strengthens A** — removes Build-brain; cognition = PATH tasks |
| 2 Evidence-challenge | **Strengthens A** — bounded falsification via fabric |
| 3 projectBindings / re-bind | **Strengthens A** — lifts false one-root ceiling without Option B |
| 4 Build-origin empty root | **Strengthens A** — smallest seam; anti-scaffolder |
| 5 PROVEN/UNMET/UNKNOWN | **Strengthens A** — thin completion evidence |
| 6 Sequential ≠ schema | **Clarifies A** — policy vs durability |
| 7 Hypotheses vs authority | **Strengthens A** — aligns with S4 reality-wins |

**Hybrid?** Only in the weak sense that A′ uses **fabric tasks for cognition** (already PATH Code). That is **not** Option B (no authoritative product graph).

**Different architecture?** No. Still thin orchestrator over Gateway + S3 + S4.

---

## Refined durable Build record (ceiling — still thin)

```text
buildId
outcome
status: running | blocked | complete
projectBindings[]          // ≥1 ordinary PATH roots; origin allowed empty initially
childTaskIds[]             // + kind: engineer|evaluate|challenge; bindingId
outcomeCriteria[]          // PROVEN|UNMET|UNKNOWN + evidence refs
hypotheses                 // gap plan / architecture notes — non-authoritative
updatedAt
```

Anything richer belongs in **trees + reports**, not Build.

---

## Refined control loop

```text
1. Ensure ≥1 projectBinding (Build-origin if needed)
2. Re-inspect reality (mechanical); invalidate stale hypotheses/criteria
3. If judgment needed → startTask(kind=evaluate) via fabric
4. Update criteria + hypotheses from report + evidence refs
5. If completeness candidates → startTask(kind=challenge) as required
6. If required criteria all PROVEN → BUILD COMPLETE
7. Else select next gap → startTask(kind=engineer) on chosen binding
8. Await; S4-resume if interrupted; goto 2
```

---

## Risks updated

1. **Evaluate/challenge objectives must demand evidence** — otherwise fabric prose fakes PROVEN.  
2. **Build-origin bind must be role-gated** — must not weaken normal PATH Code `NOT_A_PROJECT` for casual cwd.  
3. **Criteria explosion** — keep required criteria few and product-level.  
4. **Re-bind thrash** — multi-binding is opt-in; default one root.  
5. **Challenge theater** — same engine rubber-stamping; mitigate with assessment needs + peer rotate + mechanical evidence checks, not provider reviewer roles.

---

## Proof implications (still not a slice plan)

A settling proof should exercise:

- Build-origin empty → first `engineer` establishes real structure (not a hidden template)  
- ≥1 `evaluate` and ≥1 `challenge` as real taskIds  
- Criteria reach PROVEN only with evidence refs  
- Optional: second binding **or** explicit single-binding path (both valid)  
- Interrupt/resume of a child under S4 while Build continues same `buildId`  
- After COMPLETE, PATH Code alone on a binding — zero migration  

---

## Final settlement

**Architecture settled for authorization review:**

> **Option A′ — Thin Build orchestrator; deep intelligence only through the frozen S3 engine fabric as ordinary PATH tasks; thin durable Build record; optional multi-binding via re-bind; Build-origin empty root; outcome criteria PROVEN/UNMET/UNKNOWN; plans as hypotheses; FS/Git wins.**

No implementation authorized by this document.  
No S5.x slices defined.
