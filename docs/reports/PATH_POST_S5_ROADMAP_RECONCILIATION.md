# PATH Post-S5 Roadmap Reconciliation

**Mode:** design / roadmap / architecture only — no implementation  
**Date:** 2026-09-27  
**Purpose:** Reconcile the full post-S5 product roadmap so Builder capabilities (deployment, domains, APIs, auth, payments, references, version history, etc.) remain visible alongside Engine+Model and PATH Studio — without redesigning frozen S1–S5.

---

## 1. Executive reconciliation

PATH’s **proven foundation** is S1–S5 at Builder implementation `2ae7540`, audit `93a3596`, disposition `59df5a2` (**READY FOR NEXT STAGE**, Bucket 1 = 0).

This reconciliation:

1. **Recovers** historical stage labels and deferred capabilities from repository evidence (not invented commitments).
2. **Preserves** three distinct products — **PATH Code**, **PATH Build**, **PATH Studio** — over one **PATH Core** (Gateway, Engine Fabric, durability, S2 adoption).
3. **Places** **Engine+Model / Dynamic Model Registry** as the **immediate next implementation stage** (absorbs S3-01 only; no pre-stage code fixes).
4. **Sequences** Builder expansion (references → versions → env/secrets → deploy → domains → integrations → data/auth → payments → native) as **bounded stages**, not one megastage.
5. **Defers PATH Studio** (full workstation) until shared Gateway/Core APIs and Builder-first creator operations exist; **PS1** read-only Studio remains a precursor, not the roadmap Studio.

**Reconciliation verdict:** The post-S5 roadmap is **coherent and complete at the planning layer**. Capabilities discussed for a Lovable-class Builder were **never removed** — most were **never implemented** and were **out of scope** for the genuine repair track. They re-enter as **explicit future stages** below.

---

## 2. Frozen baseline

| Artifact | SHA / reference |
|----------|-----------------|
| Accepted Builder implementation | `2ae7540da76e8d311e64465958d5f6ce03a72c25` |
| Builder repair closure | `903fd292e9828d4aeb7899d3e0b44affa58d11fd` |
| S1–S5 platform audit | `93a3596313851291dcbd779dc034567729b19660` |
| Debt disposition (operator accepted) | `59df5a2bca88742ebd08b10057583a56fae46ef3` |

**Frozen (do not redesign):** S1 Gateway, S2 result lifecycle, S3 Engine Fabric routing, S4 durability/recovery, S5 Builder repair semantics (Apply/Discard, preview truth, no auto-reengineer).

**Invariant chain (unchanged):**

```text
TASK NEED → ENGINE FIT → chosen ENGINE → MODEL SELECTION → execution
```

ENGINE ≠ MODEL. Fabric owns engine choice; Model Plane owns model choice **inside** the chosen engine adapter.

**Terminology (frozen):**

- **Engine** = PATH engineering collaborator peer (today: Cursor, GitHub Copilot, Antigravity) selected by **Engine Fabric** from task need and capability fit.
- **Model** = provider model identity (e.g. GPT, Gemini, Grok, Composer, Claude-class IDs) selectable **only through** a compatible **engine/provider adapter** already on the Fabric.
- Adding a **model/catalog entry** ≠ adding a **new engineering engine**. Registry work catalogs and resolves models; it does **not** mint new Fabric engines.
- **P6 is explicitly out of scope** for adding new engineering engines (including treating Grok/xAI/Gemini/GPT brands as new PATH engines).

---

## 3. Historical roadmap lineage

| Era | Label | Source | Meaning then | Status now |
|-----|-------|--------|--------------|------------|
| Foundation | Phase 0–5G | `docs/PATH_CODE_MASTER_V1.md`, phase closures | Kernel, editing, validation, General Session, recovery | **Complete** (separate from S-track) |
| G10 / S0 | Product surface + fabric honesty | `PHASE_S0_G10_5_PRODUCT_CORRECTION.md` | Living terminal; not a second judge | **Retained** in Code UX |
| S1 | Gateway extract | `PHASE_S1_GATEWAY_EXTRACT.md` | Socket Gateway; slots for Build/Studio | **Frozen / live** |
| S2 | Installed product, lifecycle | S2 tests, `result-lifecycle.mjs` | /merge, discard, history | **Frozen / live** |
| S3 | Engine Fabric | `ag10/engine-contract.mjs`, S3 freeze SHA in audit docs | Peer engines; Cursor added later | **Frozen / live** |
| S4 | Durability | `host-startup.mjs`, continuity tests | Checkpoints, resume, no ghost engineering | **Frozen / live** |
| S5 pre-audit | Build architecture audit | `PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md` | Outcome loop, greenfield origin, **not** deploy platform | **Partially implemented** then **repair track** narrowed scope |
| S5 repair | Phases 1–7 | `PATH_BUILDER_REPAIR_TRACK_FREEZE.md` | Identity, candidate review, preview, rail — **not** Lovable ops | **Operator closed** @ `2ae7540` |
| S6 (historical) | PATH Studio | `s43-operator-acceptance.md`, `PHASE_S1_GATEWAY_EXTRACT.md` inventory | “PATH Studio = S6” after S4/S5 | **Superseded label** — see §18 |
| PS1 | Path Studio process | `scripts/path-studio/path-studio.mjs` | Read-only NDJSON viewer; no drive mode | **Implemented limited**; not full Studio |

**Lineage rule:** Old **“S6 = Studio”** described **order after S5**, not the current **repair-closed S5** scope. Post-S5 stages use **new IDs (P6+)** below to avoid collision with repair-track numbering.

---

## 4. Recovered deferred capability inventory

Legend: **E** = explicitly documented in repo; **I** = strongly implied by product role / audit language; **R** = new reconciliation recommendation (not a historical promise).

| CAPABILITY | SOURCE / EVIDENCE | ORIGINAL INTENT | CURRENT STATUS | STILL VALID? | SUPERSEDED? | OWNER SURFACE | BACKEND NEED | DEPENDENCIES |
|------------|-------------------|-----------------|----------------|--------------|-------------|---------------|--------------|--------------|
| Gateway multi-client | S1 report | CLI + headless attach | Live | Yes | No | Code, Build, Studio | S1 | — |
| Engine Fabric (3 engines) | S3, gateway registry | Peer engineering | Live | Yes | No | All | S3 | — |
| Apply/Discard adoption | S2, repair P2/P7 | Human adoption authority | Live | Yes | No | Build, Code | S2 + git | — |
| Local web preview | S5 P4/P7 | Last-good preview @ applied SHA | Live | Yes | No | Build | runtime manager | git product branch |
| GitHub PR publish | S1 inventory, `ag4/*`, `result-lifecycle` | Optional Code delivery | Implemented limited | Yes | No | Code (primary) | ag4 | git, remote |
| **Deployment / hosting** | Constitution §11 deployment; Phase 4 draft excludes “deployment orchestration as product” **for execution core** | Ship product beyond localhost | **Not built** | Yes (product) | No | **Build** (creator), Studio (inspect) | **Product ops plane** | env, secrets, artifact |
| **Custom domain / DNS / SSL** | Not named in code docs | Production URL for creators | **Not built** | I | No | **Build** | ops plane + provider | deployment target |
| **Environments / secrets** | Master §11 secrets; General Session recovery | Safe config boundaries | Partial (policy classes, redaction patterns) | Yes | No | Build + Code | **secrets store + policy** | Gateway authority for mutations |
| **API / integration connections** | S5 audit “services, external APIs” in planning | Connect SaaS/APIs | **Not built** | I | No | Build | integration registry | secrets, env |
| **Database (e.g. Supabase)** | S5 audit “data” in required-reality planning | Hosted DB for apps | **Not built** | I | No | Build | provider orchestration | secrets, deploy |
| **Authentication** | S5 audit “auth”; refinement doc examples | User accounts in shipped apps | **Not built** | I | No | Build orchestrates **external** auth providers | integration + env | DB often |
| **Stripe / payments** | Not in repo docs | Monetization | **Not built** | R (product-class) | No | Build | integration + webhooks | P9 secrets, P10 deploy, P12 integrations (P13/P14 if architecture needs) |
| **Attachments / references** | Not in repo docs; export attachment header in surface | Creator inputs | **Not built** | I | No | **Build** (input), Studio (context) | durable **reference store** (not adoption authority) | object storage or runtime metadata |
| **Version history (creator)** | `adoptionHistory`, git, task-history | Compare/restore product revisions | **Partial** (data exists; no Versions UX) | Yes | No | **Build** | projection on git + S2 | — |
| **Dynamic Model Registry** | Disposition S3-01; `engine-readiness` disclaimer | Model catalogs per engine | **Not built** (env pins only) | Yes | No | All surfaces | **Model Plane** inside adapters | S3 frozen |
| **PATH Studio (full)** | S1 slot `path_studio_slot`; PS1 read-only | Cursor-class workstation | **Not built** (PS1 only) | Yes | Partially (PS1 ≠ Studio) | Studio | same Gateway/Fabric | stable core APIs |
| **Capacitor / iOS / Android** | Not in repo | Mobile distribution | **Not built** | R | No | Build later | packaging + store pipelines | P9 secrets; P10 sequencing (not deploy-URL-only) |
| **Image generation workflow** | Not in repo | Design assets | **Not built** | R | No | Build | engine task or provider **model** via adapter | references |
| **Figma / design import** | Not in repo | Design reference | **Not built** | R | No | Build | reference pipeline | attachments |
| **ICE witness** | Repair freeze | Paused product | Frozen witness | Yes | N/A | Build | — | no engineering |

---

## 5. Product role definitions

| Product | Role | Must remain able to… |
|---------|------|----------------------|
| **PATH Code** | Terminal-first engineering | Bind project, run tasks via Gateway, merge/discard, history, General Session (separate recovery host) |
| **PATH Build** | Outcome-first creator | Conversation, preview, candidate review, Apply/Discard, **future** deploy/domain/secrets/versions without delegating creator ops to Studio-only |
| **PATH Studio** | Engineering workstation | Deep task/file/git/diff/terminal view over **same** tasks; advanced controls — **not** sole owner of deploy/domain |

---

## 6. Core / platform capability map (target)

```text
                         PATH CORE
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   S1 GATEWAY            S3 ENGINE FABRIC      S4 DURABILITY
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    S2 RESULT / GIT AUTHORITY
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   P6 MODEL PLANE      P9+ PRODUCT OPS PLANE   (future)
   (registry inside          deploy · env · secrets ·
    engine adapters)          domain · integrations ·
                              data · auth · payments
        │                     │
        └─────────────────────┴─────────────────────┘
                              │
          PATH Code · PATH Build · PATH Studio (UX)
```

**Shared product/service capability plane:** **Justified** as a **coordination + authoritative state** layer (not Vercel/Supabase/Stripe reimplementation). PATH records **bindings, environment names, deployment IDs, domain verification state, integration handles**; **providers** perform DNS, hosting, DB, payments.

---

## 7. Engine+Model position

| Topic | Reconciliation |
|-------|----------------|
| **Stage** | **P6 — Engine+Model Plane** (first implementation after this doc) |
| **Absorbs** | S3-01 (`resolveCursorModel` env pins) — **only** Bucket 2 finding |
| **Does not** | Replace `selectEngineForTurn`; add second router; change Builder repair |
| **Authority** | Fabric selects **engine**; Model Plane selects **model** within adapter |
| **Catalog** | Per-engine static + dynamic discovery; provenance on checkpoint/child |
| **Auto** | Policy on top of registry (task/session/project defaults), not a new engine |
| **OpenAI General Session** | Separate **brain/modelId** path; registry should **document boundary**, optionally converge later |
| **Grok / Gemini / GPT / Composer / xAI IDs** | **Models** (provider-model identities), not PATH engines — become available when listed on a **compatible existing engine adapter**; **not** P6 engine additions |

**Before deployment/domains?** **Yes.** Model plane is orthogonal but **foundational for honest provenance** and avoids env sprawl before service expansion.

**Post-P6 implementation order (frozen):** **P6 → P7 → P8** (no “P7 or P8” ambiguity). P8 follows P7 immediately; version history builds on creator reference inputs and git/S2 truth.

---

## 8. Builder capability families (reconciled)

### A. Product references / inputs

- **Build:** creator uploads/links (attachments, images, briefs) — **inputs to intent**, not adoption authority.
- **Studio:** view/reference in engineering context; same underlying **reference artifacts**.
- **Core:** durable reference metadata + blob store (runtime or object store); **not** a second git.

### B. Version / product history

- **Canonical:** git commits on `path-build/*`, `authoritativeSha`, `adoptionHistory`, S2 MERGED lifecycle.
- **Build UX:** named labels, compare, restore = **git checkout / revert operations** with creator confirmation — **not** new version store.
- **Studio:** diff/history tools at engineering depth.

### C. Engine + Model

- See §7; stage **P6**.

### D. Deployment / publishing

- **Build:** “Publish” / environment promotion UX.
- **Core:** deployment records (target, provider, URL, status, log refs).
- **Provider:** Vercel/Netlify/Fly/etc. via API — PATH does not host.

### E. Domains

- **Build:** attach domain, show DNS instructions, verify, SSL status.
- **Core:** domain binding linked to deployment target.
- **Provider:** DNS/SSL APIs.

### F. Environments / secrets

- **Core:** environment definitions (local/preview/production); **secret references** (never log); injection at deploy/runtime.
- **Build:** creator configures; redacted audit trail.
- **Code:** may read for engineering tasks under policy.

### G. Databases

- **Build:** connect/provision **via provider** (Supabase, etc.).
- **PATH** stores connection refs + migration **orchestration state**, not the database engine.

### H. Authentication

- **Build:** wizard to enable auth **through** Clerk/Supabase Auth/Auth0/etc.
- **PATH** does not become identity provider unless explicitly later product decision.

### I. APIs / integrations

- **Core:** integration registry (type, scopes, credential ref).
- **Build:** creator-facing “connect service”.

### J. Payments

- **Build:** Stripe connect, product/checkout setup UX.
- **Hard platform deps (P15):** P9 secrets, P10 deployment (webhook/callback URLs), P12 integrations.
- **Capability-dependent:** P13 database and P14 auth only when the product’s payment/subscription/entitlement design actually requires them — not every payment shape is full-stack SaaS.

### K. Native / mobile

- **Later track P16** — Capacitor wrap of web artifact; store submission out of near-term scope.

---

## 9. Builder vs Studio ownership matrix (summary)

| Capability | Build UX | Studio UX | Code UX | Shared core | Engine-owned | Provider-owned | Authority |
|------------|----------|-----------|---------|-------------|--------------|----------------|-----------|
| Creator conversation | Primary | View/steer | N/A | Build record | — | — | Build record |
| Preview | Primary | Embed/view | — | runtime mgr | — | — | applied SHA + URL |
| Candidate review | Primary | Optional inspect | — | Build + S2 | — | — | Apply/Discard |
| Versions/history | Primary (creator) | Deep git/history | /history | git + adoptionHistory | — | — | **git** |
| Attachments/references | Primary input | Context panel | — | reference store | — | blob/CDN | metadata in core |
| Engine preference | Primary | Advanced | CLI flags | Fabric | routing | — | Fabric |
| Model preference | Primary | Advanced | CLI/model | **Model Plane** | adapter | catalog | registry + provenance |
| Deploy | Primary | Inspect/logs | — | ops plane | — | host | core record |
| Domains/DNS/SSL | Primary | Inspect | — | ops plane | — | DNS/host | core binding |
| Environments/secrets | Primary | Inspect (redacted) | policy | secrets svc | — | vault | core + policy |
| Database | Primary connect | SQL/tools later | — | integration | engineer may migrate | Supabase etc. | provider data |
| Auth | Primary setup | Config view | — | integration | — | IdP | provider |
| APIs/integrations | Primary | Debug | — | integration registry | tools | SaaS | core refs |
| Payments | Primary | — | — | integration | — | Stripe | provider |
| Logs | Summary | Primary | task trace | trace + provider | — | host | derived |
| Terminal | — | Primary | Primary | — | — | — | session |
| Files/editor | — | Primary | via tools | git | engine edits | — | git |
| Git | Summary | Primary | Primary | git | — | — | git |
| Tests | Status | Primary | Primary | validation | engine | — | reports |
| Services (compose) | Status | Primary | prepare | ag9 | — | local docker | declared files |
| Diff/review | Candidate | Primary | — | git | — | — | git |
| Task history | Rail | Primary | /history | G10 + history index | — | — | checkpoints |
| Engine activity | Primary | Primary | stream | trace | Fabric | — | trace |
| Native/mobile | Primary (later) | Assist | — | packaging | build tools | app stores | artifacts |

---

## 10. Version / history model

| Kind | Canonical source | Creator-facing? |
|------|------------------|-----------------|
| **Engineering history** | Task trace, reports, checkpoints | Activity/worklog |
| **Task history** | `task-history.mjs`, G10 index | Code / Studio |
| **Conversation history** | `build.conversation[]` | Build chat |
| **Product version history** | **git** on product branch + `adoptionHistory` / `authoritativeSha` | Build “Versions” (projection) |
| **Deployment history** | **future** ops plane records | Build deploy timeline |

**No competing history store.** Restore = git operation + optional new engineer task; rollback deploy = provider API + core state.

---

## 11. Service / integration capability model

- **Integration** = typed connection (API key OAuth, DB URL, Stripe account) with **credential ref** in secrets plane.
- **Engineering** may implement integration **code** via normal tasks; **PATH** owns **connection state** and **deploy-time injection**.
- **Gateway methods** (future): `integration.list`, `secret.put` (policy-gated), `deploy.start` — not in S1–S5 today.

---

## 12. Deployment / domain dependency model

```text
secrets / env config
    ↓
deployment (build artifact → provider)
    ↓
preview URL (already: local runtime)
    ↓
production deployment
    ↓
custom domain attach
    ↓
DNS verification → SSL/TLS state

auth ──→ often needs deployed callback URLs + secrets
database ──→ connection strings in secrets + often deploy
APIs ──→ secrets + env
payments ──→ P9 secrets + P10 deploy (webhooks) + P12 integrations
         └──→ P13 DB / P14 auth only when architecture requires

```

**Minimum order:** **P9** before **P10**; **P10** before **P11**; **P12** before payment/auth/DB integrations that need credential refs. **P15** hard prerequisites: **P9, P10, P12**; **P13/P14** conditional on product architecture.

---

## 13. Native / mobile position

- **Not** immediate post-S5.
- **Capacitor** can package the **built web product artifact locally** from the product tree — it does **not** technically require a **deployed production URL**.
- **P16 after P10** is **deliberate roadmap / product maturity sequencing**: reuse environments, secrets, and release discipline from P9–P10 before mobile packaging and store-facing workflows — **not** because mobile can only consume a live deployed site.
- Signing/secrets use the **P9** plane; store submission remains deferred.
- Does **not** require Studio first.

---

## 14. Dependency graph (findings + capabilities)

```text
S3-01 env model pins
    → P6 Model Plane (absorb)

P6 → P7 References (locked next after P6)
    → P8 Version History (locked immediately after P7)
    → git/adoptionHistory only (no new authority)

P9 Environments/Secrets
    → P10 Deployment
        → P11 Domains
    → P12 Integrations
        → P13 Database
        → P14 Auth
        → P15 Payments (hard: P9+P10+P12; P13/P14 if architecture needs)

P6 Model Plane
    ⊥ deployment (orthogonal)

PATH Studio (P17)
    → technical minimum: P6 + P8 + P9–P11 + Gateway projections
    → P12–P16 NOT all technical prerequisites (product sequencing — see P17)
```

---

## 15. Reconciled ordered roadmap (post-S5)

New stage IDs **P6–P17** — not repair-track Phase numbers.

**Frozen sequence:**

```text
P6  Engine+Model Plane
P7  Creator References & Inputs      ← locked immediately after P6
P8  Product Version History          ← locked immediately after P7
P9  Environments & Secrets
P10 Deployment & Release
P11 Domains, DNS, SSL
P12 APIs & Integrations
P13 Database (provider)
P14 Authentication orchestration
P15 Payments (Stripe-first)
P16 Native / Mobile (Capacitor)
P17 PATH Studio (workstation)        ← after P16 by product sequencing; see P17 technical minimum
```

### P6 — Engine+Model Plane

| Field | Content |
|-------|---------|
| **Purpose** | Dynamic model registry inside engine adapters; provenance; Auto policy |
| **Why now** | Disposition Bucket 2; S3-01 |
| **Dependencies** | Frozen S3 Fabric |
| **Reused** | `engine-contract.mjs`, cursor/copilot SDKs, checkpoints |
| **New** | Registry API, catalog discovery, preference hierarchy |
| **Builder UX** | Model picker, Auto, factual labels |
| **Studio UX** | Same metadata, advanced override |
| **Code impact** | CLI model flags → registry |
| **Out of scope** | **New engineering engines** (Grok/xAI as engines, new Fabric peers); adding provider **models** does not add engines; Fabric routing change |
| **Acceptance** | Replace env-only Cursor pin; provenance on tasks; no second router; model IDs are not engine IDs |

### P7 — Creator references & inputs

| Field | Content |
|-------|---------|
| **Purpose** | Attachments, images, design references for Build intent |
| **Why now** | Locked **immediately after P6**; foundational creator input before Versions UX |
| **Dependencies** | **P6 complete** (frozen order: P6 → P7 → P8) |
| **New** | Reference blob store + metadata |
| **Builder UX** | Upload/link in conversation |
| **Studio** | Read-only context |
| **Out of scope** | Figma API full sync (stretch) |

### P8 — Product version history (creator)

| Field | Content |
|-------|---------|
| **Purpose** | Versions UI: list adoptions, compare, restore with confirmation |
| **Dependencies** | **P7**; frozen S2/git |
| **Reused** | `adoptionHistory`, `authoritativeSha`, git |
| **New** | Projection + restore flows only |
| **Out of scope** | Second version database |

### P9 — Environments & secrets plane

| Field | Content |
|-------|---------|
| **Purpose** | Named envs; secret refs; injection policy; audit |
| **Dependencies** | Authority policy from Master §11 |
| **Gateway** | Future gated methods |
| **Builder UX** | Env editor (redacted secrets) |

### P10 — Deployment & release

| Field | Content |
|-------|---------|
| **Purpose** | Deploy web artifact to provider; deployment status/history |
| **Dependencies** | P9; local preview (exists) |
| **Provider** | Vercel-class (pluggable) |
| **Builder UX** | Publish preview → production |
| **Reused** | ag4 patterns (remote ops discipline) |

### P11 — Domains, DNS, SSL

| Field | Content |
|-------|---------|
| **Purpose** | Custom domain attach, verify, TLS state |
| **Dependencies** | **P10** production target |
| **Builder UX** | Domain wizard (creator) |

### P12 — APIs & integrations registry

| Field | Content |
|-------|---------|
| **Purpose** | Connect external APIs/SaaS with credential refs |
| **Dependencies** | P9 secrets |

### P13 — Database connections (provider)

| Field | Content |
|-------|---------|
| **Purpose** | Supabase/etc. provision/connect; migration hooks via engineering |
| **Dependencies** | P9, often P10 |

### P14 — Authentication orchestration

| Field | Content |
|-------|---------|
| **Purpose** | Enable auth via external IdP; env templates |
| **Dependencies** | P12/P13, deploy URLs |

### P15 — Payments (Stripe-first)

| Field | Content |
|-------|---------|
| **Purpose** | Stripe connect, checkout/subscription setup |
| **Hard dependencies** | **P9** Environments/Secrets, **P10** Deployment (webhooks/callback URLs), **P12** Integrations |
| **Capability-dependent** | **P13** Database and **P14** Authentication only when the product’s payment/subscription/entitlement architecture requires them — do not assume one SaaS stack for every payment integration |

### P16 — Native / mobile packaging (Capacitor)

| Field | Content |
|-------|---------|
| **Purpose** | Mobile artifact from web product (local built artifact packaging) |
| **Sequencing after P10** | **Product maturity** — reuse P9 secrets and P10 release/deploy foundation; **not** a technical requirement that Capacitor only wraps a production-deployed URL |
| **Defer** | App Store ops |

### P17 — PATH Studio (workstation)

| Field | Content |
|-------|---------|
| **Purpose** | Full engineering UI over Gateway (not PS1 read-only) |
| **Technical minimum (Studio can start after)** | **P6** model/provenance plane; **P8** creator version contract; **P9–P11** creator operations foundation (env/secrets, deploy, domains); stable **Gateway/client** task and build projections |
| **Not technical prerequisites for Studio** | **P12–P16** (integrations, database, auth, payments, Capacitor) — Studio does not require Stripe, DB, auth, or mobile packaging as backend dependencies |
| **Why P17 remains after P16 (product sequencing)** | PATH matures **Builder as a first-class creator product** through P12–P16 (integrations, data, auth, payments, native packaging) **before** shifting the main implementation track to the full Studio workstation — deliberate product priority, not because those stages block Studio technically |
| **Reused** | `inline-studio` patterns, `path-studio/state`, Gateway |
| **Out of scope** | Second backend |

---

## 16. Stage-by-stage acceptance gates (summary)

| Stage | Gate |
|-------|------|
| P6 | Model choice + provenance without env-only pin; Fabric routing unchanged |
| P7 | References durable across restart; no fake activity |
| P8 | Restore never bypasses Apply/S2; git truth |
| P9 | Secrets never in logs; deploy injection policy tested |
| P10 | One provider E2E deploy; rollback documented |
| P11 | Domain verify + SSL state honest |
| P12–P15 | Provider E2E per integration; no PATH-as-Stripe |
| P16 | Capacitor packages local web product artifact; secrets/signing via P9 |
| P17 | Studio drives no adoption; same taskIds as Code/Build |

---

## 17. Intentionally deferred

- New **engineering engines** on Fabric (e.g. adding Grok/xAI as a peer engine — separate from **model** catalog entries on existing adapters)
- Astra / alternate fabric
- PATH-as-cloud-host (weak Vercel clone)
- Full app store submission automation
- Merging General Session recovery with G10 checkpoints (disposition S4-01)
- Builder repair reopening
- ICE engineering

---

## 18. Historical roadmap conflicts / supersession

| OLD DEFINITION | SOURCE | WHY CHANGED | RECONCILED POSITION | STATUS |
|----------------|--------|-------------|---------------------|--------|
| **S6 = PATH Studio** | `s43-operator-acceptance.md`, S1 inventory | S5 repair consumed years; Studio not built | **P17** full Studio; **PS1** remains read-only precursor | **SUPERSEDED label** |
| **S5 = full Lovable ops** | Pre-repair architecture audit imagination | Repair track scoped to trust/Apply/preview | Lovable ops → **P7–P16** | **PARTIALLY RETAINED** intent, **new stages** |
| **Build cognitive evaluate loop** | Pre-Phase 3 Builder | Removed in repair | Frozen dead | **SUPERSEDED** |
| **outcomeCriteria ceremony** | Pre-Phase 5 | Removed | Empty schema only | **SUPERSEDED** UX |
| **Stage 6 (Phase 3 editing)** | `PHASE_3_INTEGRATION_REAUDIT` GAP-051 | Different numbering (editing freeze) | Unrelated to PATH Studio S6 | **STILL VALID** in editing context only |

---

## 19. Immediate next implementation recommendation

**P6 — Engine+Model Plane** (design packet already authorized next; implementation after operator approves architecture from this reconciliation).

No code until separate implementation authorization.

---

## 20. Explicit non-actions

- No implementation in this pass  
- No commit of this document (unless operator later requests)  
- No Model Registry / routing / Gateway / S4 / Builder / ICE changes  
- No deploy/domain/DB/auth/payment implementation  
- No paid engineering runs  

---

## 21. Evidence index

| Topic | Path |
|-------|------|
| S1 slots Build/Studio | `docs/reports/PHASE_S1_GATEWAY_EXTRACT.md` |
| S5 architecture audit (gaps) | `docs/reports/PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md` |
| Repair freeze | `docs/reports/PATH_BUILDER_REPAIR_TRACK_FREEZE.md` |
| Audit + disposition | `PATH_S1_S5_FULL_PLATFORM_AUDIT.md`, `PATH_S1_S5_DEBT_DISPOSITION.md` |
| S6 historical label | `docs/reports/g10-evidence/s4/s43-operator-acceptance.md` |
| PS1 Studio | `scripts/path-studio/path-studio.mjs` |
| Gateway workflows | `scripts/pathcode-cli/gateway/runtime.mjs` |
| Adoption history | `scripts/pathcode-cli/build/controller.mjs`, `lifecycle-truth.mjs` |
| AG4 delivery | `scripts/pathcode-cli/result-lifecycle.mjs`, S1 inventory |
| Constitution deployment/secrets | `docs/PATH_CODE_MASTER_V1.md` §11 |

---

*End of post-S5 roadmap reconciliation (design only).*
