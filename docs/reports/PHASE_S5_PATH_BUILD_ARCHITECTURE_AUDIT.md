# PATH CODE — S5
# PATH BUILD — ARCHITECTURE AUDIT
# Product-level autonomous engineering over PATH Code

**Document type:** AUDIT AND ARCHITECTURE REPORT ONLY  
**Implementation:** NOT AUTHORIZED  
**Slice plan (S5.1 / S5.2 / …):** NOT DEFINED  

**Refinement (settled recommendation):** [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md) — Option A′ (thin orchestrator + fabric cognition). This audit remains the capability/gap baseline; the refinement supersedes §10 where they differ.

**Prior stage:** S4 — **IMPLEMENTATION FROZEN**  
- S4.3 implementation: `093a29aa963e8132a5d47598dcc9ac62b15609b5`  
- S4.3 tip: `2d56b23ad922f6e1947c7f48d2059a389ac7badf`  
- Autonomous / live verification: **PASS**  
- Physical Mac reboot acceptance: **DEFERRED BY OPERATOR**  

**S3 freeze (engine fabric):** `89eea9992c1bb30763413aa0054d93481c65fcb2`  

This report answers: how the engineering system PATH already owns becomes an autonomous **product-level** software builder — not how PATH can scaffold an app.

---

## 0. Locked product definition (audit target)

| Mode | Contract |
| --- | --- |
| **PATH Code** | “Here is software. Engineer it.” |
| **PATH Build** | “Here is the software outcome I want. Establish what must exist and keep engineering toward it.” |

PATH Build is a **product-level autonomous engineering control loop over PATH Code**.

It is **not**:

- an app scaffolder / template generator  
- a web-app-only builder  
- a one-repository or one-runtime assumption  
- a frontend generator / small-project mode  
- a separate engineering backend  

**PATH Build v1** means: first complete version of PATH’s greenfield / outcome-driven workflow — **not** “builder for small applications.”

Conceptual stack:

```text
                    USER OUTCOME
                         │
                         ▼
                    PATH BUILD
               product-level control
                         │
       What is required? · What exists? · What is missing?
                         │
               What should happen next?
                         │
                         ▼
                    PATH CODE
                         │
                   PATH Gateway
                         │
              Unified Engine Fabric
           Antigravity · Copilot · Cursor
                         │
                 REAL ENGINEERING
           run / observe / repair / verify
                         │
                         ▼
              CURRENT PRODUCT STATE ──► back to PATH BUILD
```

---

## 1. Current PATH capability map (S1–S4 reuse)

What Build can call **without inventing a second engineering system**.

### 1.1 Gateway / product runtime (S1–S2)

| Capability | Where | Reuse for Build |
| --- | --- | --- |
| Bind project, start/attach/steer/cancel/await task | `gateway/runtime.mjs`, `gateway/client.mjs`, `gateway/protocol.mjs` | Primary execution API |
| Headless client | `gateway/headless.mjs` | Non-TUI Build driver |
| Extensibility slots | `listCapabilities().extensibility` → `path_build_slot`, `build_slot` | Reserved; **empty today** |
| Client roles | `GatewayClientRole` includes `'build'` | Protocol-ready; unused |
| Installed product, history, inspect, prefs | S2 surfaces + `task-history.mjs` | Operator continuity for Build-driven work |
| Result lifecycle adopt/discard/PR | `result-lifecycle.mjs`, AG4 publish | Optional delivery of Build increments |

### 1.2 Engineering substrate (AG1 / AG5 / AG8 / AG9)

| Capability | Where | Reuse for Build |
| --- | --- | --- |
| Project admission (Git **or** unversioned) | `ag1/admission.mjs` | Once *some* project dir exists |
| Task worktree isolation / resume | `ag1/task-worktree.mjs` | Per engineering increment |
| Unversioned in-place bootstrap | `createTaskWorktree` → `bootstrapMode: "unversioned_inplace"` | Early Build phases before Git |
| Polyglot discovery | `ag8/discover.mjs` `discoverCapabilityPlane` | After manifests exist |
| Resolve / provision / mise | `ag9/resolve.mjs`, `provision.mjs`, `mise.mjs` | Multi-runtime once declared |
| LSP / SCIP / MCP | `ag9/lsp.mjs`, `scip*.mjs`, `ag8/mcp.mjs` | Engineering quality loop |
| Disposable services (compose) | `ag9/services.mjs` | After compose/devcontainer exist |
| Affected / monorepo checks | `ag9/affected.mjs` (Nx, Turborepo, …) | Multi-package validation |
| Native validation families | `ag5/native-validation.mjs` | Build/test evidence |

### 1.3 Unified Engine Fabric (S3)

| Capability | Where | Reuse for Build |
| --- | --- | --- |
| Need-fit routing | `ag10/engine-contract.mjs` `inferTurnNeeds` / `selectEngineForTurn` | Build must **not** pick engines by brand |
| Collaborative turns + leases | `ag9/collaborate.mjs`, `ag10/index.mjs` `createG10Fabric` | Execution of each Build-issued objective |
| Structured handoff | `pathcode.s3.fabric-handoff.v1` | Cross-engine continuity inside a task |
| Engine adapters | Cursor / Copilot / Antigravity | Peer engineering power |

### 1.4 Durability & truth (S4 / G10)

| Capability | Where | Reuse for Build |
| --- | --- | --- |
| Task checkpoint (atomic) | `ag10/task-checkpoint.mjs` | Per PATH task |
| Git/FS wins over stale memory | `ag10/task-reality.mjs` | Product inspection authority |
| Host startup reconcile | `ag10/host-startup.mjs` | Recover Build-issued tasks after interrupt |
| Process identity pid+startKey | process registry + Copilot/AG registration | Long Build sessions |
| Engineering reports | `engineering-report.mjs` | Evidence of what a task achieved |
| Task history index | `task-history.mjs` | Chronology of Build child tasks |

**Verdict:** Execution, collaboration, polyglot prepare, validation, and durability are **already built**. Build’s job is orchestration intelligence, not another engine.

---

## 2. Current existing-project assumptions

Exact assumptions that matter for greenfield / outcome-driven work.

### 2.1 Project root must already look like a project

`resolveTargetProjectRoot` (`paths.mjs`):

1. Prefer Git toplevel; else  
2. Walk for `looksLikeExistingProject` markers (`package.json`, `Cargo.toml`, `go.mod`, `src/`+…, etc.)  
3. Else **fail** with `NOT_A_PROJECT`:

> “PATH needs an existing project directory (source or config markers).”

**Implication:** An empty directory, a named folder with only a wish, or “outcome with no filesystem yet” cannot bind today.

Three-root law comment in `paths.mjs`:

> `TARGET_PROJECT_ROOT — user's existing project (Git or unversioned)`

### 2.2 Unversioned is admitted — but still “existing”

`admitPrimaryCheckout` and `createTaskWorktree` support `unversioned` / `unversioned_inplace` so PATH can engineer **in place until Git exists**.

That is **bootstrap of source control on an existing tree**, not **origin of software from outcome alone**.

### 2.3 One bound `projectRoot` per Gateway session

`gateway/runtime.mjs` `bindProject` / `startTask` store a single `project.projectRoot` (+ optional `workingSubdir`).

Tasks share that root. There is **no first-class multi-repo product graph** in Gateway state.

### 2.4 One Git repository topology for isolation

Versioned path: linked worktrees under `PATH_RUNTIME_ROOT/ag1-tasks/<taskId>` off the **primary** repo.

Multi-repo outcomes (separate remotes for frontend/backend/infra) are not modeled as peer PATH projects under one Build identity.

### 2.5 Task = engineering objective, not product outcome

`startTask` requires an `objective` string. Checkpoints store that objective. Reports resolve “Asked” from session/product objective (`engineering-report.mjs`).

There is **no durable type** for:

- product outcome  
- remaining gaps  
- acceptance criteria spanning many tasks  
- parent Build identity linking child taskIds  

### 2.6 Capability / services discovery is evidence-driven from *existing* files

`discoverCapabilityPlane`, `detectProjectServices`, `discoverAffectedChecks` read what is already on disk (manifests, compose, nx.json, …).

They do **not** invent topology from a prose outcome.

### 2.7 Classification of assumptions

| Assumption | Fundamental PATH architecture? | Only Code-workflow inheritance? |
| --- | --- | --- |
| Real engineering happens in a filesystem + (eventually) Git reality | **Fundamental** | — |
| Engines mutate a shared worktree / project cwd | **Fundamental** | — |
| Gateway binds one project at a time | **Current architecture** (can stay; Build can own multi-root *above* Gateway) | Soft for multi-repo products |
| Must have project markers before bind | **Code-workflow** | Soft — Build must establish markers/Git first |
| One task objective = one engineering cycle | **Code product unit** | Soft — Build sequences many tasks |
| Prepare discovers from manifests | **Fundamental honesty** (don’t invent tools) | Build must create manifests via engineering |
| Validation from project-native commands | **Fundamental** | Same |

---

## 3. The true S5 gap

What **does not exist** today between:

```text
user outcome
    ↓
no existing project
```

and:

```text
normal PATH engineering task / project reality
```

### 3.1 Missing intelligence (core)

1. **Outcome comprehension** — durable representation of what “done” means for a *product*, not a single task.  
2. **Required-reality planning** — what must exist (components, runtimes, data, auth, services, tests, config) without collapsing to a template.  
3. **Authoritative existence inspection** — reuse Git/FS/prepare/reports; do not mirror into a fake twin world.  
4. **Gap ranking** — next highest-value engineering action as a PATH Code objective.  
5. **Multi-task product loop** — issue `startTask` / await / evaluate / next, across interruptions (S4).  
6. **Product-level evaluation** — did the last result move the *outcome*, not merely complete the *task*?  
7. **Greenfield origin** — create the first bindable project reality from outcome (directory + identity + initial Git/topology) so Code can take over.

### 3.2 Missing substrate (thin)

| Gap | Why it cannot be ignored |
| --- | --- |
| Empty / outcome-only cwd cannot `bindProject` | Hard stop at `NOT_A_PROJECT` |
| No Build durable record spanning child tasks | History lists tasks; nothing owns “the product we are building” |
| No Build → Gateway client role wired | `build_slot` is a label only |
| No product evaluation harness | Reports answer task Asked/Checks/Result, not product completeness |

### 3.3 What is *not* the gap

- Another engine / agent runtime  
- A parallel mutate/build/test stack  
- A template catalog as the product  
- Replacing S3 fabric routing  

---

## 4. Product-level control loop (repository-grounded)

### 4.1 Authoritative sources already available

| Question | Inspect today |
| --- | --- |
| What was asked (task-level)? | Checkpoint `objective`, report “Asked”, history |
| What files/commits changed? | Worktree Git, `changedFiles`, result SHA/branch |
| What checks ran / outcome? | Report Checks / classification; validation on checkpoint |
| What capabilities exist now? | Re-run `discoverCapabilityPlane` / prepare (read-only) |
| What services are declared? | `detectProjectServices` |
| What engines did? | Collab journal, `latestEngineTurn`, fabric handoff |
| Is work interrupted? | S4 continuity dispositions + `reconcileHostStartup` |

### 4.2 What is missing for the loop

Durable **product-level** answers:

| Question | Today | Needed |
| --- | --- | --- |
| What are we building (outcome)? | Only last task objective | Build outcome identity |
| Where does the product stand? | Infer ad hoc from FS + last report | Explicit evaluation against outcome (still FS-first) |
| What remains? | Not structured | Gap set derived from outcome + inspection |
| What next? | Operator types next objective | Build proposes next PATH objective |

### 4.3 Realistic loop shape (thin layer)

```text
[Build durable record]
  outcome, acceptanceNotes?, projectRoot?, childTaskIds[], status

loop:
  1. INSPECT   — FS/Git + optional prepare dry facts + latest child reports/history
  2. EVALUATE  — compare outcome ↔ inspected reality → gaps[]
  3. SELECT    — nextGap → PATH Code objective (string) + constraints
  4. DELEGATE  — gateway.bindProject(projectRoot) → startTask(objective)
                 Engine Fabric runs unchanged
  5. OBSERVE   — awaitTask / report / checkpoint / Git reality
  6. UPDATE    — append childTaskId; refresh evaluation; continue or complete
```

**Principle:** Filesystem + Git + PATH reports are the product state. Build stores only what cannot be re-derived cheaply (outcome text, acceptance intent, child task linkage, last evaluation summary).

### 4.4 Earliest point PATH Code takes over

As soon as:

1. A directory exists that `resolveTargetProjectRoot` / `looksLikeExistingProject` accepts **or** Git toplevel exists, and  
2. Build issues an ordinary engineering `objective`,

then **`startTask` is PATH Code** — zero export/migration. Engines, prepare, worktrees, validation, reports, resume all apply unchanged.

Build may keep looping *above* Code for many tasks; each task is ordinary Code.

---

## 5. Project / system topology

### 5.1 What the architecture already supports (inside one project root)

Proven in G9 / S3:

- **Polyglot** — JS/TS, Python, Go, Rust, Java, C/C++, .NET (prepare + live evidence)  
- **Multi-runtime** — mise-provisioned toolchains under `PATH_RUNTIME_ROOT`  
- **Multi-package / monorepo signals** — `apps/`, `packages/` markers; Nx/Turborepo affected discovery  
- **Multi-service (declared)** — compose / Docker disposable services once files exist  
- **SCIP cross-package** — mono repo indexing  
- **Collaborative multi-engine** on one shared worktree  

Serious greenfield **within one repository** (API + web + worker + compose + tests + polyglot) is architecturally compatible.

### 5.2 Exact constraints

| Constraint | Effect on Build |
| --- | --- |
| **One Gateway-bound `projectRoot`** | Multi-repo products need Build to either (a) use one umbrella repo/worktree of workspaces, or (b) re-bind Gateway per repo while Build owns the product graph |
| **Linked worktrees assume one primary Git** | Separate Git remotes are not first-class siblings under one task |
| **Services start from existing compose** | Build must create compose/devcontainer via engineering before PATH can start disposable services |
| **Empty dir ≠ project** | Origin step required |
| **Working subdir** | Supported for cwd-inside-monorepo; still one root |

### 5.3 Does “one project root” block serious greenfield?

**No**, if Build treats the primary artifact as **one engineering product tree** (mono or polyglot multi-service). That matches how PATH validates and collaborates today.

**Yes**, if the product definition *requires* multiple independent Git repositories as peer roots with no umbrella. That needs an explicit Build-owned multi-bind strategy — **not** present today; do not pretend Gateway already models it.

---

## 6. Build → Code convergence

```text
OUTCOME
  │
  ▼
[ORIGIN]  create projectRoot (+ optional git init / initial markers)
  │         ← only Build-specific seam
  ▼
bindProject(projectRoot)     ← existing Gateway
  │
  ▼
startTask(nextObjective)     ← PATH Code
  │
  ▼
prepare → fabric → validate → report → checkpoint
  │
  ▼
[EVALUATE] gaps remain? ──yes──► next startTask (same projectRoot)
  │
  no
  ▼
Build complete · project remains ordinary PATH Code project forever
```

**Zero conversion/export:** same `projectRoot`, same runtime metadata, same task/history/report surfaces. Operator can later open PATH Code on that project and continue without “import from Build.”

---

## 7. Engine-fabric use

Build must:

1. Express each increment as a **PATH engineering objective** (and optional `preferredEngine` only as soft hint — fabric already resolves preference honestly).  
2. Let `createG10Fabric` / session path run need-fit routing, handoffs, leases, repair.  
3. Consume **authoritative results** (classification, report, Git reality), not engine chat transcripts as product truth.  
4. Prefer **iterative gap closure** over one-shot generation: inspect → engineer → observe → re-gap.

Why this is more intelligent than a conventional app-generation pipeline:

| Pipeline generator | PATH Build + fabric |
| --- | --- |
| Emit files once | Repeated real investigate/implement/run/repair |
| Template-shaped | Outcome + discovered reality |
| Single model path | Need-fit multi-engine collaboration |
| Weak runtime proof | Prepare + native validation + services |
| Fragile on interrupt | S4 continuity on child tasks |
| Opaque “done” | Reports + Git + re-evaluation |

**Do not** add a Build-private agent executor.

---

## 8. Durability (S4 applied to Build)

| Layer | Identity | Continuity |
| --- | --- | --- |
| PATH Code task | `taskId` | Checkpoints, processes, resume/rehydrate (S4) |
| PATH Build product | **new** `buildId` (proposed) | Must survive host restart; reference child `taskId`s + `projectRoot` |

Recommended durability rules:

1. Build record lives under `PATH_RUNTIME_ROOT` metadata (same honesty as checkpoints) — thin fields only.  
2. Child tasks use existing S4 machinery unchanged.  
3. On host reopen: reconcile child tasks via `reconcileHostStartup`; Build re-inspects FS and continues the loop — **do not** resurrect engines from Build state.  
4. Mid-Build interrupt mid-task = S4 task recovery; Build waits or resumes that `taskId` before selecting a new gap.  
5. Product truth after crash = Git/FS + last child report, not Build’s last in-memory plan.

Long-running Build = **many durable Code tasks** under one durable Build outcome — not one infinite engine session.

---

## 9. Realistic architecture options

### Option A — Thin Build orchestrator (recommended baseline)

**Shape:** Build client/workflow issues sequential Gateway `startTask` calls; durable Build record = outcome + projectRoot + childTaskIds + evaluation snapshots.

| Pros | Cons |
| --- | --- |
| Maximum reuse of S1–S4 | Evaluation quality depends on Build reasoning quality |
| No second engineering stack | Multi-repo needs explicit re-bind policy |
| Natural Code convergence | Must implement greenfield origin carefully |
| S4 applies per task | Product “done” criteria must be explicit |

### Option B — Fat product graph

**Shape:** Build maintains a structured component/service/runtime graph as primary state; engineering tasks are derived ticks against the graph.

| Pros | Cons |
| --- | --- |
| Clear multi-service planning | High risk of **duplicating** FS/Git truth |
| Good UX for Studio later | Drift vs actual tree; sync tax |
| Explicit topology | Overbuilt for v1; fights `task-reality` principle |

### Option C — Single mega-task Build

**Shape:** One PATH task objective = entire product outcome; rely on engines + steering until done.

| Pros | Cons |
| --- | --- |
| Minimal new types | Weak product-level gap control |
| Uses fabric as-is | Budget, interrupt, and evaluation blur |
| | Collapses Build into “long Code prompt” |

### Option D — Origin-only Build, then hand off forever

**Shape:** Build creates project + initial scaffold task, then exits to Code-only.

| Pros | Cons |
| --- | --- |
| Smallest change | Abandons continuous outcome evaluation |
| | Becomes scaffolder in practice — **rejected by locked philosophy** |

**Serious choice is A vs B.** C and D fail the locked definition. Hybrid: **A with optional lightweight topology notes** inside the Build record (hints, not authority) is compatible.

---

## 10. Recommended S5 architecture

**Superseded for settlement by the refinement:**  
[`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)

**Settled form: Option A′** — thin Build orchestrator; evaluation / gaps / next-objective / challenge are **fabric-backed PATH tasks** (not a permanent Build brain); thin `projectBindings` with re-bind; Build-origin empty root; outcome criteria `PROVEN|UNMET|UNKNOWN`; plans as hypotheses; sequential execution as policy only.

Baseline Option A from this audit remains directionally correct; A′ answers the challenge/refinement pass without adopting Option B.

---

## 11. Risks / constraints (real)

1. **`NOT_A_PROJECT` wall** — greenfield origin is mandatory; if origin is template-shaped, Build collapses into scaffolder.  
2. **Evaluation hallucination** — if Build “evaluates” from model memory instead of FS/report/Git, the loop lies.  
3. **One-root Gateway** — multi-repo products need an explicit policy; ignoring this produces silent architecture lies.  
4. **Unversioned_inplace hazards** — early Build without Git loses worktree isolation; origin should establish Git early for serious products.  
5. **Service/runtime chicken-and-egg** — PATH won’t start services until compose exists; Build must engineer that via Code tasks.  
6. **Overlong single objectives** — stuffing the whole outcome into one task wastes S4/task boundaries and weakens gap control.  
7. **Slot emptiness** — `path_build_slot` today proves reservation only; implementing Build as a side script outside Gateway would fork the product.  
8. **Deferred S4 reboot** — does not block architecture; long Build sessions should still assume S4 task recovery works as live-verified.

---

## 12. Proof strategy (without toy architecture)

### Principles

- Proof may be **bounded** for diagnostics.  
- Architecture must **not** be bounded to the proof.  
- Prefer one proof that forces: origin → multi-increment Code tasks → real run/test/service evidence → interrupt/resume → outcome evaluation.

### Recommended proof shape (illustrative, not a slice plan)

A **multi-surface product** originated from outcome text, e.g.:

- HTTP API + persistence  
- second process (worker or CLI)  
- web or admin UI **or** equivalent second client surface  
- automated tests that PATH actually runs  
- local service dependency via compose (when Docker available)  
- polyglot **or** multi-package layout if natural to the outcome  

**Exercise:**

1. Start from non-project / empty context → Build origin → bindable root.  
2. ≥2–3 sequential PATH Code tasks under one Build outcome (not one mega-prompt).  
3. At least one prepare/validation/service path that fails then repairs (fabric intelligence).  
4. Interrupt a child task; S4 resume; Build continues same outcome / same projectRoot.  
5. Final evaluation: outcome criteria met via **inspection + reports**, not demo narrative.  
6. Open PATH Code alone on the same project; continue a normal task — proves zero migration seam.

### Anti-proofs (reject as architecture proof)

- Single Next.js template emit  
- “Files appeared” without run/test evidence  
- Fake engine / `PATHCODE_GATEWAY_FAKE_ENGINE` as product claim  
- Web-only definition of Build  

---

## 13. Modules / seams inventory (quick reference)

| Area | Modules |
| --- | --- |
| Project bind | `paths.mjs`, `ag1/admission.mjs`, `gateway/runtime.mjs#bindProject` |
| Task exec | `gateway/runtime.mjs#startTask|#resumeTask`, `ag1/session.mjs` |
| Worktree | `ag1/task-worktree.mjs` |
| Prepare | `ag9/prepare.mjs`, `provision.mjs`, `mise.mjs`, `lsp.mjs`, `services.mjs` |
| Fabric | `ag10/index.mjs`, `engine-contract.mjs`, `ag9/collaborate.mjs` |
| Truth | `ag10/task-reality.mjs`, `task-checkpoint.mjs` |
| Continuity | `ag10/host-startup.mjs`, `task-continuity.mjs` |
| Evidence | `engineering-report.mjs`, `task-history.mjs`, `result-lifecycle.mjs` |
| Reserved Build slot | `gateway/runtime.mjs` extensibility; `protocol.mjs` client role `'build'` |

---

## 14. Audit conclusions

1. **PATH Build is the missing product-level control loop**, not missing engineering power.  
2. **Hard gap:** outcome → bindable project reality → multi-task gap closure with durable Build identity.  
3. **Soft gap:** multi-repo topology above one Gateway bind — decide policy; don’t silently assume.  
4. **Recommended architecture:** thin orchestrator (Option A) using Gateway + S3 fabric + S4 continuity; FS/Git/reports as product truth.  
5. **Convergence:** same `projectRoot` forever as PATH Code.  
6. **v1 meaning:** complete outcome-driven workflow — architecture stays general; first proof may be bounded but must exercise real multi-increment engineering.  

**S5 implementation is not authorized by this document.**

---

## 15. S4 freeze record (as of this audit)

```text
S4 — IMPLEMENTATION FROZEN
AUTONOMOUS / LIVE VERIFICATION — PASS
PHYSICAL MAC REBOOT ACCEPTANCE — DEFERRED BY OPERATOR
```

- Implementation: `093a29aa963e8132a5d47598dcc9ac62b15609b5`  
- Tip: `2d56b23ad922f6e1947c7f48d2059a389ac7badf`  
- Reboot procedure retained: `docs/reports/g10-evidence/s4/s43-operator-acceptance.md`
