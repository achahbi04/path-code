# PATH Builder — P13.4 → P16 Master Architecture & Codex Cloud Implementation Specification — Version 2.1

**Status:** **FINAL GOVERNING SPECIFICATION — owner architecture decisions frozen for Codex Cloud implementation**<br>
**Date:** 2026-10-18<br>
**Product:** **PATH Builder**<br>
**Repository:** `achahbi04/path-code`<br>
**Authoritative implementation baseline:** `5638ac85bf7edfbca9eb1f1df8da223ee033be03`<br>
**Current roadmap boundary:** P13.3 is **CLOSED / ACCEPTED / PROTECTED**. This document begins at P13.4 and stops at the end of P16.<br>
**Explicitly out of scope:** **P17 — PATH Studio + Engine Expansion**, including the deliberate Codex-primary Engine Fabric migration across PATH Code, PATH Builder, and PATH Studio. P17 is preserved, not implemented here.

**Supersession:** This Version 2.1 supersedes the earlier master draft, Version 2, the first repository addendum, and the V2 mini-addendum. All owner-approved repository findings are integrated directly here. Codex Cloud receives **this document only** as governing implementation authority.

**Preservation doctrine:** Closed stages may receive only the smallest compatibility or security corrections that are demonstrably required by P13.4–P16. A missing capability is **not permission to invent a more general platform**. Prefer the smallest extension of an existing authority, coordinator, adapter, projection, state machine, or materialization path.

---

## 0. Executive decision

This document defines one **substantial PATH Builder implementation tranche** covering:

- **P13.4 — Database Builder UX + final P13 closure**
- **P14 — Authentication orchestration + Builder UX**
- **P15 — Stripe-first payments orchestration + Builder UX**
- **P16 — Native / mobile packaging with Capacitor**
- **Cross-stage hardening, regression, evidence, and closure ledger**

The tranche is intentionally designed for **Codex Cloud to execute as one engineering mission on an isolated branch**, with enough autonomy to investigate the repository, close ordinary implementation gaps, refactor locally where needed, run tests, and continue through non-blocking findings.

The Cloud branch is **not acceptance authority**. Nothing becomes accepted, merged, deployed, or frozen merely because Codex implemented it. The target workflow is:

```text
Architecture + dependency reconciliation
        ↓
Owner reviews / freezes this master specification
        ↓
Codex Cloud implements P13.4 → P16 as one tranche
        ↓
Codex produces implementation + evidence + owner-gate ledger
        ↓
Owner + architecture review of the completed body of work
        ↓
One independent tranche review
        ↓
One consolidated correction / hardening mission
        ↓
Local live/provider acceptance where required
        ↓
Stage acceptance and freeze
```

This replaces the previous micro-pass rhythm. Engineering discipline is preserved at the **tranche boundary**, not by interrupting the owner after every small code change.

The Cloud mission is therefore expected to behave like a senior implementation team: investigate repository reality, repair ordinary implementation defects, keep a closure ledger, and continue. It should return to the owner only for genuine authority, credential, irreversible-provider, product-policy, or unavailable-toolchain gates.

---

# 1. Naming and product boundaries

Throughout this specification, the product is called **PATH Builder**.

Do **not** casually shorten it to “PATH” when the wording could be confused with another application or with the shared platform.

The ecosystem remains:

```text
PATH Core / shared platform
├── PATH Code       — terminal-first engineering product
├── PATH Builder    — outcome-first creator / product builder
└── PATH Studio     — future full engineering workstation
```

P13.4–P16 belong to **PATH Builder product operations**. They may reuse shared core services and coordinator authority, but they do not turn PATH Code or PATH Studio into the owner surface for these workflows.

P17 is separate. The future canonical tranche is **P17 — PATH Studio + Engine Expansion**. That tranche will make Codex the default primary engineering engine across the shared Engine Fabric used by PATH Code, PATH Builder, and PATH Studio, while retaining Cursor as an available non-default/delegated engine rather than removing it. Nothing in P13.4–P16 may pre-empt or destabilize that migration.

---

# 2. Frozen baseline entering this tranche

## 2.1 Platform stages already accepted

The following are treated as frozen dependencies, not redesign targets:

```text
S1–S5  Shared Gateway / result lifecycle / Engine Fabric / durability / Builder trust semantics
P6     Engine + Model Plane
P7     Creator References & Inputs
P8     Product Version History
P9     Environments & Secrets
P10    Deployment & Release
P11    Domains / DNS / SSL
P12    APIs & Integrations
P13.1  Database Authority
P13.2  Supabase Connection Boundary
P13.3  Supabase Provisioning + Migration Coordination
```

P13.3 final live acceptance proved, on a disposable Supabase project:

- provider provisioning through PATH Builder authority;
- exactly one provider creation effect;
- provider health `ACTIVE_HEALTHY`;
- real PostgreSQL Session-pooler connection;
- PostgreSQL server version `17.11`;
- bounded migration-history observation;
- canonical Git `authoritativeSha` migration authority;
- migration state `none` with local and remote counts both zero;
- no credential leakage;
- no pending provisioning operation.

The accepted P13 TLS repair is at:

```text
5638ac85bf7edfbca9eb1f1df8da223ee033be03
```

That baseline is the required branch point for this tranche unless the owner explicitly advances it before Cloud execution.

## 2.2 Current repository realities that matter

The repository already contains:

- durable P9 environment + secret-reference authority;
- P10 canonical Git snapshot / deployment authority;
- P11 domain and TLS authority;
- P12 typed integration authority, currently with GitHub as the production provider;
- P13 Supabase database authority, provider/connection observation, provisioning state machine, migration comparison, and live-proven adapters;
- PATH Builder surface patterns for Versions, Environments and Integrations;
- P10/P11 server/coordinator authority and HTTP routes, but **no creator Deploy or Domains dialog** in the current Builder UI;
- coordinator protocol + client methods for P9–P13 operations;
- safe Browser projections that avoid exposing P9 secret references or secret material;
- engineering objective framing that can project factual product-operation metadata without exposing secrets;
- canonical source materialization in `deploy-source.mjs`, suitable for bounded reuse by P16 rather than cloning;
- a repository/package contract that is intentionally macOS Apple Silicon at product runtime, while Codex Cloud runs Linux.

The tranche should **extend these patterns**, not create a second platform.

## 2.3 Repository reconciliation and frozen owner dispositions

An independent repository review was performed against the accepted baseline before Cloud launch. The following are now **decided**, not open questions.

### Cloud/Linux baseline

`package.json` declares:

```json
"os": ["darwin"],
"cpu": ["arm64"]
```

Codex Cloud on Linux therefore uses:

```text
npm ci --force
```

for repository installation. **Do not remove or weaken the macOS/arm64 product constraint merely to make Linux Cloud installation prettier.**

Before the first implementation change, Cloud records the untouched Linux baseline as `BASELINE_FAILURES`. The verified pre-change baseline was:

```text
npm ci                → EBADPLATFORM
npm ci --force        → PASS
npm run typecheck     → PASS
npm run build         → PASS
vitest run            → 2052 passed / 51 failed
```

Most failures are macOS-host-gated and are classified `ENVIRONMENT_LIMITATION`. P9–P13 suites were green.

Cloud acceptance is therefore:

```text
no NEW failures relative to BASELINE_FAILURES
+
all touched P9–P13 regression suites green
+
all new P13.4–P16 suites green
+
typecheck green
+
build green
+
git diff --check green
```

A full `npm run check` remains a **local macOS acceptance gate** after the Cloud tranche is reviewed.

### `pg` is approved

The P13.2 PostgreSQL client dependency is **approved**. It is not an unresolved owner decision and must not be removed.

The three accepted-baseline tests that still assume zero runtime dependencies are stale:

```text
tests/cli/package.test.ts
tests/general-session/architecture.test.ts
tests/adapters/openai/architecture.test.ts
```

Codex is explicitly authorized to update those assertions to permit the exact approved `pg` runtime dependency while preserving the tests' intent against arbitrary dependency growth.

### P17 documentation drift

The historical roadmap document still describes P17 only as PATH Studio. Do **not** rewrite or renumber that roadmap in this tranche. Record a `DOCUMENTATION_GAP` noting that the future canonical P17 is **PATH Studio + Engine Expansion / Codex-primary Fabric migration**. No Engine Fabric change is authorized here.

### Closed-stage preservation

The following bounded changes to closed stages are explicitly authorized **only because this tranche requires them**:

- shared localhost Builder HTTP ingress protection;
- P9/P12 secret-pattern recognition for Stripe/Supabase credential forms;
- P12 provider catalog extension for Stripe and directly invalidated catalog tests;
- narrow coordinator-level referential-integrity checks protecting new P14/P15/P16 references;
- small helper generalization of P10 canonical-source materialization for P16, while keeping P10 behavior and error contracts intact.

Anything broader requires an entry in the closure ledger and must be justified as a concrete blocker rather than convenience.

## 2.4 Final repository precision integrated before Cloud launch

A final repository check against `5638ac85bf7edfbca9eb1f1df8da223ee033be03` identified three additional implementation facts. They refine execution only; they do **not** change any frozen architecture decision.

1. **P16 must use an explicit native build environment.** The current selected-environment runtime path rejects an environment if any secret binding uses `vercel_env`, and it only allows variables for `planKind === "spawn"`. Because a production environment may legitimately contain Vercel-backed Stripe/Supabase runtime secrets, P16 must not assume that production environment is usable for local native packaging. Each native profile therefore selects a dedicated `buildEnvironmentId`. That environment must contain only ordinary config plus `local_env_file` secret bindings. A `vercel_env` entry makes readiness `build_environment_unusable`; PATH must not silently choose another environment or omit variables.

2. **Ingress content type is required only for a non-empty JSON body.** Existing lifecycle POSTs (`stop`, `pause`, `resume`, `recover`, `apply`, `discard`) are intentionally bodyless and currently send no `Content-Type`. They must remain functional. Host / Origin / `Sec-Fetch-Site` checks still apply to those requests.

3. **The localhost ingress guard is a foreign-origin guard, not preview isolation.** The current product preview is same-origin with the Builder API and the product runtime already executes locally as the creator. Do not claim the ingress guard isolates preview code, and do not introduce a separate-origin/session-token security subsystem in this tranche. Record `Product preview is same-origin with the Builder API; separate-origin preview is future hardening` as `NONBLOCKING_DEBT`.


---

# 3. Engineering doctrine for the Codex Cloud tranche

## 3.1 Codex Cloud gets broad implementation freedom inside the approved architecture

Codex may:

- inspect any repository code necessary to understand dependencies;
- research current official provider/tool contracts when implementation requires it;
- add/refactor PATH Builder modules inside P13.4–P16 scope;
- modify coordinator protocol/client/service where required;
- modify Builder surface server, projections, public HTML/JS/CSS, objectives and declarations;
- extend a closed provider catalog when a later stage legitimately adds a provider;
- repair ordinary defects it discovers during the tranche;
- run focused and tranche-wide tests repeatedly;
- make coherent commits on the Cloud branch;
- continue to later phases when an earlier issue is non-blocking;
- keep a `CONFIRMED_DEFECT`, `NONBLOCKING_DEBT`, `ENVIRONMENT_LIMITATION`, `DOCUMENTATION_GAP`, and `OWNER_GATE` ledger rather than stopping for every imperfection.

Codex is expected to **solve**, not merely report, ordinary engineering problems within the approved scope.

## 3.2 Freedom is not permission to invent architecture

When repository reality is missing a capability, use this decision order:

```text
existing authority / helper / adapter / projection can be extended safely?
        ↓ yes
extend it minimally
        ↓ no
new bounded stage-owned module required?
        ↓ yes
add the smallest typed module
        ↓ no / cross-platform redesign required
ledger + owner/architecture gate
```

Examples of the preservation rule:

```text
Need Stripe mode?
→ P12 capability string
NOT a P12 schema redesign.

Need stable auth/webhook URL?
→ verified P11 domain or explicit validated URL
NOT a new P10 alias subsystem.

Need native source snapshot?
→ generalize proven P10 materialization helper
NOT a second Git snapshot engine.

Need dependency deletion protection?
→ narrow coordinator reference guard
NOT a universal dependency graph platform.

Need Supabase Auth mutation?
→ typed fixed Supabase adapter
NOT generic HTTP/OAuth proxy machinery.

Need Cloud install on Linux?
→ npm ci --force
NOT removal of macOS/arm64 product constraints.
```

## 3.3 Owner Gates do not stop unrelated work

Record an Owner Gate when implementation reaches something only the owner/provider/local machine can supply, such as:

- Supabase auth-management token/permissions;
- Google/GitHub OAuth credentials;
- Stripe test/live keys, Price IDs, webhook endpoint/signing secret;
- an irreversible provider mutation not already authorized;
- local Xcode/Android SDK/signing identity;
- a product-policy choice absent from this specification.

The affected proof becomes pending; unrelated implementation continues.

## 3.4 Cloud branch authority

Recommended branch:

```text
codex/path-builder-p13-4-p16
```

The Cloud-assigned branch is acceptable if it starts from:

```text
5638ac85bf7edfbca9eb1f1df8da223ee033be03
```

Rules:

- never push implementation to `cursor/pathcode-antigravity-v1`;
- never force-push an accepted branch;
- no merge into production/default branches;
- no production deployment merely for repository proof;
- no unapproved irreversible provider effect;
- draft PR is allowed, unmerged;
- commit this Version 2.1 under `docs/passes/` as the first tranche commit so the governing contract is visible in review;
- the old draft/addendum are not separate implementation authorities.

## 3.5 Completion philosophy

The Cloud mission returns one **completed body of work**, not a sequence of micro-pass requests.

For a local bug:

```text
investigate → fix → test → continue
```

Stop only when continuing would be unsafe or impossible without owner authority. Tomorrow's workflow is whole-tranche review, one independent review, one consolidated correction/hardening mission, then local live gates and stage acceptance.

---

# 4. Non-negotiable cross-stage invariants

These apply to P13.4, P14, P15 and P16.

## 4.1 Authority boundaries

### Git / S2 remains product-source authority

- `Build.authoritativeSha` is canonical product source.
- Dirty worktree state never becomes product authority implicitly.
- Source changes still use the existing engineering candidate / Apply / adoption lifecycle.
- Generated native trees and provider configuration are operational artifacts/state, not a second source repository.

### P9 remains credential authority

- No P14–P16 secret store.
- New records persist references/variable identities only.
- Browser never receives raw P9 `secretRef` where a variable-name selection can be resolved server-side.
- Secret material never enters Build authority, event payloads, Browser JSON, objective text, logs, or operation history.
- P9 backends have different capabilities and **must not be conflated**:
  - `local_env_file`: PATH may safely resolve material after verification;
  - `vercel_env`: PATH may observe/configure locator/presence but does not possess plaintext material.

### Providers remain provider authority

PATH Builder coordinates and records bounded truth. It does not become a database engine, IdP, Stripe, DNS provider, app store, or arbitrary provider proxy.

## 4.2 Local Builder ingress security — required before new mutating routes

The localhost Builder gains materially stronger mutation power in P14–P16. Before exposing any new mutating route, add one shared `/api/*` ingress guard.

Required behavior:

1. `Host` must match the actual local Builder host/port (`127.0.0.1` or `localhost` for the bound port).
2. For non-GET requests, `Origin`, when present, must be same-origin.
3. `Sec-Fetch-Site`, when present, must be `same-origin` or `none`.
4. A POST with a **non-empty JSON body** requires `Content-Type: application/json`.
5. Existing bodyless lifecycle POSTs remain valid without a content type after they pass the Host / Origin / `Sec-Fetch-Site` checks.
6. JSON request bodies are capped (target 256 KiB); creator reference uploads keep their existing dedicated cap.
7. Reject before provider/coordinator mutation.

Do not build a generic auth/session subsystem for the local UI merely to solve this. The smallest shared host/origin/content/body guard is the intended correction.

**Threat-model boundary:** this guard protects the Builder from **foreign web origins**, including cross-site requests and DNS-rebinding-style access. It does **not** isolate the product preview from the Builder API. The preview is currently served same-origin and the product runtime already executes locally as the creator. Do not claim stronger isolation than exists and do not add a separate-origin preview/session-token architecture in P13.4–P16. Record that future hardening item in the `NONBLOCKING_DEBT` ledger.

Tests must prove foreign Host, cross-origin POST, unsafe fetch-site, wrong content type for non-empty JSON, and oversized JSON are rejected; existing bodyless lifecycle actions continue to work; normal local JSON requests and reference uploads remain functional.

## 4.3 External effects

Mutating provider flows follow the proven authority pattern:

```text
snapshot / prepare
↓
durable effect-started where ambiguity matters
↓
one bounded provider mutation
↓
credential + stale-authority recheck
↓
reduced provider truth / uncertain / action-required
```

No hidden retries for externally mutating calls. Read-only calls may retry only where the stage contract explicitly permits it and the retry cannot create effects.

## 4.4 Browser safety

- Browser calls PATH Builder server/coordinator only.
- No Browser direct Supabase Management API or Stripe API calls.
- No raw provider credentials or authorization headers.
- No credential persistence in `localStorage`/`sessionStorage`.
- Request bodies use exact allowlisted keys.
- Browser-supplied `secretRef` is rejected.
- IDs selected by the user are re-resolved against current server authority.

## 4.5 Restore and source-bound staleness

P8 restore changes source authority, not operational planes.

- P14/P15/P16 configuration is **not version-restored** with product source.
- Existing operational authority remains current.
- Any source-bound native operation/artifact whose SHA no longer matches `Build.authoritativeSha` becomes `stale` and cannot be presented as current.
- Pending restore blocks mutating operational transitions.

## 4.6 Narrow cross-plane referential integrity

New references must not silently become dangling during ordinary mutations.

Required hard references:

```text
P14 auth → P13 database
P15 payment → P12 Stripe integration/binding
P15 optional dependency → P14 auth / P13 database
P16 optional auth readiness → P14 auth
```

Implement the smallest guard at the **coordinator mutation boundary** so frozen pure plane modules do not acquire circular dependencies on later stages. Examples:

- refuse P13 database deletion when a P14 auth record references it;
- refuse P12 integration/environment-binding deletion when P15 references it;
- refuse P14 auth deletion when P15 or a hard P16 profile reference requires it.

Do **not** build a generic dependency graph subsystem.

Legacy or manually corrupted dangling references must project `dependency_missing` / action-required and never crash or report ready. P9 unbind does not need a universal new cross-plane lock in this tranche; downstream readiness must degrade truthfully.

## 4.7 Secret recognition hardening

Extend existing secret-like detection/leak-scan patterns to recognize at least:

```text
rk_test_
rk_live_
whsec_
sb_secret_
```

while preserving existing Stripe `sk_*`, GitHub and private-key protections. These are admission/redaction safeguards, not a new secret system.

## 4.8 Engine neutrality / P17 preservation

P13.4–P16 may project facts into generic engineering objectives but must not route by engine brand or modify the frozen Engine Fabric.

No Cursor removal, no Codex engine adapter, no preferred-engine hierarchy rewrite, no PATH Code/Studio fabric migration in this tranche.

P17 must be able to make Codex primary later **without rewriting database/auth/payment/native authority**.

---

# 5. Cross-stage dependency model

```text
P9  Environments & Secrets
 │
 ├────────────────────┐
 ↓                    ↓
P10 Deploy          P12 Integrations
 │                    │
 ↓                    ├───────────────┐
P11 Domains           ↓               ↓
 │                   P13 DB        Stripe connection
 │                    │               │
 └──────────┬─────────┘               │
            ↓                         │
          P14 Auth ───────────────────┤
            │                         │
            └────────────┬────────────┘
                         ↓
                      P15 Payments
                         │
                         ↓
                      P16 Native
```

Interpretation:

- P14 uses P13's Supabase project and P9 credentials. Stable production Auth Site URL comes from a **verified/TLS-ready P11 domain or an explicit validated URL**, not the per-deployment P10 `*.vercel.app` URL.
- P15 hard-depends on P9/P10/P12 for secret/deploy/integration foundations, but its stable webhook/success base likewise comes from a verified P11 domain or explicit URL. P13/P14 dependencies are explicit and optional according to product design.
- P16 packages canonical Git product source into a local native artifact. It observes P14/P15 compatibility but does not require every mobile app to use auth or payments.
- P10/P11 creator UI is not added in this tranche; P14/P15 server projections consume existing authority and tell the creator when a verified domain is missing.

---

# 6. Tranche phase plan

Codex Cloud should treat the following as one mission with internal phases:

```text
Phase A — P13.4 Database Builder UX + P13 finalization
Phase B — P14 Auth authority + provider adapters
Phase C — P14 Builder auth experience + engineering projection
Phase D — P15 Stripe connection + payment authority
Phase E — P15 Builder payments experience + engineering projection
Phase F — P16 native packaging authority + mechanical packaging runtime
Phase G — P16 Builder native experience + cross-stage readiness
Phase H — cross-stage regression, security, evidence, closure ledger
```

Do not ask the owner to approve each internal phase unless a genuine Owner Gate is reached.

---

# 7. Phase A — P13.4 Database Builder UX + final P13 acceptance

## 7.1 Purpose

P13.1–P13.3 already own database identity, credentials, provider truth, connection truth, provisioning, and migration observation.

P13.4 must **not introduce new database backend architecture**.

Its job is to make the accepted P13 capability a coherent PATH Builder product experience and complete final Database-stage acceptance.

## 7.2 Required Builder capabilities

A creator should be able to open a **Database** experience and understand, without reading internal records:

- database label;
- Supabase/Postgres provider identity;
- connected environment;
- source type: `existing` vs `path_provisioned`;
- project reference / region where safe;
- provider health;
- connection health;
- migration comparison state;
- which credential variable roles are configured, without seeing values or secretRefs;
- current pending provisioning state, if any;
- what action is available next.

## 7.3 Surface/API layer

Implement Builder HTTP projection and actions following existing Environments and Integrations surface patterns.

Suggested route family:

```text
GET  /api/builds/:buildId/databases/catalog
GET  /api/builds/:buildId/databases
GET  /api/builds/:buildId/databases/:databaseId
POST /api/builds/:buildId/databases/mutate
POST /api/builds/:buildId/databases/verify-provider
POST /api/builds/:buildId/databases/verify-connection
POST /api/builds/:buildId/databases/regions
POST /api/builds/:buildId/databases/provision-prepare
POST /api/builds/:buildId/databases/provision-execute
POST /api/builds/:buildId/databases/provision-observe
POST /api/builds/:buildId/databases/migrations-observe
```

These **flat sub-actions are intentional**: the current surface router supports only the existing `/:action/:sub` shape. Do not introduce deeper path nesting simply for aesthetics. Reserved sub-actions such as `catalog` must not collide with record IDs. Every operation routes through the Builder server/coordinator.

## 7.4 Browser projection rules

The database projection may expose safe facts such as:

- `databaseId`;
- provider / engine;
- label;
- environment name/id;
- source;
- project ref;
- region;
- observation states;
- adapter versions;
- server version;
- migration counts/head versions/digest/sourceSha;
- variable names and backend type for credential roles;
- operation state / project name where non-secret.

It must not expose:

- database password;
- database URL;
- management token;
- canonical P9 secretRef values;
- raw provider responses;
- SQL contents;
- `.env.local` path or contents.

## 7.5 Credential selection pattern

Follow the already proven P12 Builder integration pattern:

- browser selects a **P9 variableName** from the selected environment;
- server resolves the canonical secret binding;
- coordinator receives canonical secretRef internally;
- browser never supplies a secretRef.

This applies to:

- Supabase management token;
- database provision password;
- database URL.

## 7.6 Existing database flow

For `source=existing`, PATH Builder should support:

1. create local database identity;
2. select environment;
3. set provider target (`organizationSlug`, `projectRef`, `region` where known);
4. bind management credential by selected P9 variable;
5. bind database URL by selected P9 variable;
6. explicitly verify provider;
7. explicitly verify connection;
8. explicitly observe migration state.

No automatic SQL or schema mutation.

## 7.7 PATH-provisioned database flow

For `source=path_provisioned`, Builder should support the accepted P13.3 state machine:

1. create database identity;
2. bind management credential;
3. discover provider regions explicitly;
4. select organization + region;
5. select provision-password variable;
6. display explicit provider-resource/billing acknowledgement;
7. `provisionPrepare`;
8. display generated provider project name and durable operation summary;
9. require a second explicit execution confirmation;
10. `provisionExecute` once;
11. explicit `provisionObserve` until factual state changes — no hidden polling loop;
12. bind database URL after provider project is ready;
13. verify connection;
14. observe migration state.

The UI should make the distinction between **prepared intent** and **actual provider creation** obvious.

## 7.8 Delete semantics

Deleting a PATH Builder database record does **not** delete the provider resource.

Retain the existing explicit acknowledgement that external resource is retained.

Do not add provider project deletion to P13.4.

## 7.9 Database engineering context

Extend generic Builder engineering objective framing with safe factual database metadata, for example:

```text
CONFIGURED DATABASES
Database: Primary DB
Provider: Supabase / Postgres
Environment: Production
Project: llgg...
Region: eu-central-1
Provider: ready
Connection: ready (PostgreSQL 17.11)
Migration state: in_sync | none | pending | diverged
Database credential variable: DATABASE_URL
```

Never include:

- connection URL;
- password;
- management token;
- secretRef.

This lets whatever engineering engine is selected later write correct product code without coupling P13 to Cursor or Codex.

## 7.10 Builder UI

Add a creator-facing **Manage database…** action using the established dialog visual language.

Recommended layout:

```text
Database list
  ↓
Selected database summary
  ├─ Provider target
  ├─ Environment / credentials
  ├─ Provider health
  ├─ Connection health
  ├─ Migration state
  └─ Contextual actions
```

Use factual status language:

- Not configured
- Needs credential
- Provider ready
- Connection unavailable
- Connection ready
- Migration not checked
- No migrations
- In sync
- Local migrations pending
- Diverged

Do not label an unavailable connection as “broken database” when only PATH verification failed.

## 7.11 P13.4 test requirements

At minimum:

- legacy Build projects P13 authority as empty without write;
- catalog/list/read surface projections;
- existing-database lifecycle through HTTP with synthetic adapters;
- provision flow through HTTP using synthetic provider adapter;
- browser cannot pass secretRef;
- browser cannot see secretRef or secret material;
- explicit provider verification only;
- explicit connection verification only;
- migration observation only when prerequisites are ready;
- stale P9/P13 revisions handled as conflicts;
- pending restore blocks mutation/effects;
- delete retains external resource and requires acknowledgement;
- no browser direct provider fetch;
- database dialog refresh is observational and non-mutating;
- engineering objective projection contains safe database facts and no secret identity;
- new localhost ingress guard protects every mutating database route;
- P13 deletion is refused at the coordinator boundary while P14 references the database;
- all P13.1–P13.3 regression suites remain green.

## 7.12 P13 final acceptance

P13 may be considered implementation-complete when:

- P13.1–P13.3 remain green;
- P13.4 UX tests pass;
- full P13 regression passes;
- Builder database surface cannot leak credential material;
- the previously live-proven provider/connection/migration semantics remain unchanged;
- local final acceptance can project the existing P13 live fixture correctly.

Cloud must report P13 as:

```text
IMPLEMENTED — LOCAL FINAL UX ACCEPTANCE PENDING
```

unless it actually has access to the same accepted local live fixture and the owner explicitly authorized using it.

It must not self-declare P13 frozen merely because unit tests pass.

---

# 8. Phase B — P14 Authentication authority + provider orchestration

## 8.1 Product decision for P14 V1

P14 V1 is **Supabase Auth first** and deliberately bounded.

Why:

- P13 already owns a live-proven Supabase project/resource identity;
- Supabase exposes typed Auth configuration GET/PATCH Management API endpoints;
- P14 can reuse the existing P13 management credential reference;
- PATH Builder remains an orchestrator rather than becoming an identity provider;
- a single provider lets this tranche reach product quality without premature generic IdP architecture.

Future Clerk/Auth0/other providers remain possible, but they are not implemented now.

## 8.2 Authority boundary

PATH Builder owns:

- auth configuration identity and desired intent;
- link to the P13 Supabase project and P9 environment;
- safe URL and sign-in-method configuration;
- P9 references to social-provider client secrets;
- bounded provider observation and mutation state;
- creator UX and safe engineering projection.

Supabase Auth owns:

- users/password hashes;
- sessions/refresh/access tokens;
- identities and OAuth callback runtime;
- JWT issuance;
- auth tables and provider runtime.

P14 does **not** add user administration, session introspection, JWT secret management, custom SMTP, MFA, SAML/SSO, custom OIDC providers, Auth Hooks, or arbitrary Auth PATCH capability.

## 8.3 Bounded V1 sign-in methods

Support:

```text
Email
Google
GitHub
```

Bounded settings:

- Site URL;
- redirect allow-list;
- signup enabled/disabled;
- email sign-in enabled/disabled;
- email confirmation requirement;
- Google enabled/client ID/client secret reference;
- GitHub enabled/client ID/client secret reference;
- application publishable-key variable readiness.

## 8.4 Canonical authority

Recommended schema:

```text
pathcode.p14.auth.v1
```

Conceptual shape:

```js
{
  schema,
  revision,
  items: [{
    authId,
    provider: "supabase",
    label,
    databaseId,
    environmentId,
    config: {
      siteUrlSource: "p11_domain" | "explicit",
      domainId: null | string,
      siteUrl: string,
      redirectUrls: string[],
      signupEnabled: boolean,
      emailEnabled: boolean,
      emailConfirmationRequired: boolean,
      publishableKeyVariableName: string,
      socialProviders: [{
        provider: "google" | "github",
        enabled: boolean,
        clientId: string,
        clientSecretRef: string | null
      }]
    },
    observation: {
      state: "unverified" | "ready" | "action_required" | "unavailable",
      adapterVersion: string | null,
      projectRef: string | null,
      configDigest: string | null,
      siteUrl: string | null,
      redirectUrlsDigest: string | null,
      enabledMethods: string[],
      observedAt: string | null,
      failureCode: string | null
    },
    createdAt,
    updatedAt
  }],
  pendingOperation,
  operationHistory
}
```

The exact representation may be tightened to repository conventions, but these semantics are frozen.

Rules:

- `databaseId` is a hard P13 reference;
- `environmentId` must equal the linked P13 database's environment;
- social secret material is never persisted, only P9 references;
- browser projections show variable names/backend/readiness, never secretRefs;
- client IDs and URLs are bounded non-secret intent;
- provider-returned secret fields are never persisted or returned raw.

## 8.5 Reuse P13/P9 authority

For Supabase Management API work:

```text
P14 auth
→ linked P13 database
→ providerTarget.projectRef
→ managementSecretRef
→ exact P9 binding
```

No second management-token binding is created.

The management credential must have resolvable material for live calls. With today's P9 behavior, `local_env_file` is usable after safe verification; `vercel_env` plaintext is unavailable and therefore produces action-required rather than false readiness.

Google/GitHub OAuth **client secrets** must likewise be resolvable when PATH sends them to Supabase. In V1 that means a safely verified `local_env_file` binding for the configuration operation. This does not place those social secrets in the product runtime: Supabase owns them after configuration.

## 8.6 Stable URL contract

`siteUrlSource` is exactly:

```text
p11_domain | explicit
```

A P11-derived URL is eligible only when domain authority proves:

```text
attachmentState = attached
verificationState = verified
tlsState = ready
```

Do **not** offer the per-deployment P10 `providerUrl` as stable auth Site URL: it changes across releases. A stable Vercel production alias is a possible future P10 extension and is `NONBLOCKING_DEBT`, not P14 scope.

If no verified P11 domain exists, the Builder may accept an explicit validated URL. UI should say factually that no verified PATH Builder domain is available; it must not fabricate one.

Drift warning compares configured Site URL only with the selected verified P11 domain when one is selected.

Redirect rules:

- exact production redirects are preferred;
- wildcard preview redirects require explicit creator intent;
- custom mobile schemes are permitted when they satisfy URI-scheme validation and Supabase redirect matching;
- P16 never silently mutates P14 redirect policy.

## 8.7 Supabase Auth provider adapter

Use current official Management API endpoints:

```text
GET   /v1/projects/{ref}/config/auth
PATCH /v1/projects/{ref}/config/auth
```

At final drafting, current documented permissions are:

```text
GET:   auth:read / auth_config_read
PATCH: auth:write / auth_config_write + project_admin_write
```

Codex re-checks current official docs at implementation time and records any contract change.

The adapter is fixed-host, bounded and typed. Extend the existing Supabase Management request helper rather than copy-pasting another network stack; preserve TLS verification, bounded timeout and response-size limits.

### Exact PATCH allowlist

P14 may send only the fields it owns:

```text
site_url
uri_allow_list
disable_signup
external_email_enabled
mailer_autoconfirm
external_google_enabled
external_google_client_id
external_google_secret
external_github_enabled
external_github_client_id
external_github_secret
```

Nothing else.

Mapping:

```text
signupEnabled               → disable_signup = !signupEnabled
emailEnabled                → external_email_enabled
emailConfirmationRequired   → mailer_autoconfirm = !emailConfirmationRequired
redirectUrls                → uri_allow_list as provider-required comma-separated string
```

Raw provider responses may contain secrets and must never be logged/persisted. GET/PATCH responses pass through the same strict reducer. Secret fields participate only as **presence booleans** in drift calculation; their values are never returned.

## 8.8 Provider-side drift / last-writer guard

Supabase Auth PATCH has no PATH-owned compare-and-set. Therefore P14 must not overwrite dashboard changes blindly.

Flow:

```text
observe GET
→ reduce owned fields
→ compute safe configDigest
→ applyPrepare snapshots desired config + observed digest
→ applyExecute performs ONE fresh GET
→ recompute digest
→ if digest changed: AUTH_PROVIDER_CONFIG_DRIFTED, NO PATCH
→ else PATCH only fields whose desired value differs
→ reduce response
→ explicit observe/reconcile as needed
```

Secret fields affect the digest only as configured/not-configured booleans.

No hidden PATCH retry.

## 8.9 Operation state machine

Recommended coordinator methods:

```text
build.auth.list
build.auth.read
build.auth.mutate
build.auth.observe
build.auth.applyPrepare
build.auth.applyExecute
build.auth.applyObserve
```

Browser route shape must remain compatible with the current two-level surface router, for example:

```text
GET  /api/builds/:buildId/auth
POST /api/builds/:buildId/auth/mutate
POST /api/builds/:buildId/auth/observe
POST /api/builds/:buildId/auth/apply-prepare
POST /api/builds/:buildId/auth/apply-execute
POST /api/builds/:buildId/auth/apply-observe
```

Exact server names may follow conventions, but do not create nested `/apply/prepare` routing.

Provider mutation semantics follow durable prepare/effect/result authority and stale guards across P14 + linked P13 + P9.

## 8.10 Application publishable-key readiness

Use a P9 **secret binding** for the Supabase publishable key so its value stays out of records/objectives/logs even though it is public by design at runtime.

The variable name must be **framework-correct** for client bundling. Determine from `runtime/artifact.mjs`, for example:

```text
Vite      → VITE_SUPABASE_PUBLISHABLE_KEY
Next      → NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
Astro     → PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

For unknown/custom frameworks, report action-required rather than inventing a prefix.

Backend readiness is contextual:

- production deployment may use `vercel_env` presence without PATH reading plaintext;
- local/native packaging requires selected environment material that `createProductRuntimeEnv` can actually supply;
- do not claim cross-backend identity proof between two separately stored copies.

The safe project URL is:

```text
https://<projectRef>.supabase.co
```

Engineering receives project URL + variable name, never the key value.

## 8.11 P14 tests

Require at minimum:

- legacy-empty authority without write;
- P13 Supabase/database/environment coupling;
- missing/dangling dependency projects action-required;
- coordinator deletion guard prevents referenced P13 database deletion;
- exact management credential resolution behavior;
- safe GET reduction despite secret-like raw provider fields;
- exact PATCH field allowlist;
- `uri_allow_list` provider shape;
- provider config digest deterministic and excludes secret values;
- fresh GET drift mismatch blocks PATCH;
- PATCH sends only changed owned fields;
- one mutation/no hidden retry;
- P14/P13/P9 stale races and credential change;
- pending restore;
- Google/GitHub local secret material requirements;
- framework-correct publishable variable projection;
- verified P11 domain vs explicit URL behavior;
- Browser cannot submit `secretRef` or provider transport data;
- Browser has no direct Supabase Management fetch;
- objective projection contains safe auth facts only;
- local HTTP ingress guard covers new routes.

## 8.12 Cloud completion state

If Cloud lacks owner auth-management credentials, it must still complete code and synthetic tests and report:

```text
P14 IMPLEMENTED — LIVE SUPABASE AUTH GATE PENDING
```

Then continue P15/P16.

---

# 9. Phase C — P14 PATH Builder authentication experience

## 9.1 Creator experience

Use the established Phase-6 project rail/dialog language. Add an **Authentication** row; do not add a generic identity dashboard.

Recommended dialog:

```text
Authentication
├─ Provider: Supabase Auth
├─ Linked database/project
├─ Environment
├─ Client publishable-key readiness
├─ Site URL source
│  ├─ Verified PATH Builder domain
│  └─ Explicit URL
├─ Allowed redirects
├─ Email sign-in
├─ Google sign-in
├─ GitHub sign-in
├─ Provider observation / drift
└─ Observe / Prepare apply / Execute apply
```

There is no Deploy or Domains screen added by this tranche. When no eligible P11 domain exists, show a factual message such as:

```text
No verified PATH Builder domain is available. Configure/verify a domain outside this dialog or use an explicit URL.
```

Do not offer the changing Vercel deployment URL as a stable production Site URL.

## 9.2 Mobile-aware auth metadata

P14 validates and stores redirect intent in a form P16 can inspect. P16 may recommend `<appId>://auth-callback`, but creating a native profile never silently PATCHes Supabase Auth.

## 9.3 Engineering projection

Project safe context such as:

```text
AUTHENTICATION
Provider: Supabase Auth
Project URL: https://<projectRef>.supabase.co
Client key variable: <framework-correct variable name>
Email: enabled/disabled
Google: enabled/disabled
GitHub: enabled/disabled
Site URL: <safe URL>
Redirect URLs: <safe bounded list>
Provider config: ready / action required / unavailable
```

No management token, OAuth client secret, P9 secretRef, provider-returned secret, or key material.

---

# 10. Phase D — P15 Stripe connection + payment authority

## 10.1 Product decision for P15 V1

P15 is **Stripe-first**, connecting the creator's existing Stripe account. It is **not** Stripe Connect marketplace/platform onboarding.

V1 uses **Stripe-hosted Checkout Sessions** for:

```text
payment
subscription
```

PATH Builder coordinates configuration; the product's own server/runtime creates Checkout Sessions. Stripe remains payment processor and payment truth.

Out of scope:

- Standard/Express/Custom connected-account onboarding;
- marketplace application fees/transfers;
- PATH merchant-of-record behavior;
- custom card-data UI;
- full Product/Price administration;
- native Stripe SDK / Apple Pay / Google Pay architecture.

## 10.2 Extend P12 minimally for Stripe

Add exactly one new typed provider:

```text
providerKey: stripe
credential role: secret_key (required)
```

Keep GitHub semantics byte-compatible except catalog expectations that legitimately become two-provider expectations.

Verification uses one bounded read-only Stripe account identity request under current official API contract. Reduce only safe provider account identity and capabilities.

Do **not** add a `mode` field to the strict P12 verification schema. Encode test/live mode as one capability:

```text
stripe.mode.test
stripe.mode.live
```

The adapter derives mode from credential material in memory and never persists key prefix/value.

Capabilities must represent what the single response actually proves. Do not advertise `stripe.checkout` or `stripe.subscriptions` merely because Stripe generally supports them.

Restricted keys without sufficient Account-read permission become bounded credential/permission action-required, never a guessed ready state.

## 10.3 Verification material vs production runtime material

Current P9 backend behavior is important:

- P12 Stripe verification requires readable key material → safely verified `local_env_file` binding;
- deployed product runtime needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the production Vercel environment → `vercel_env` presence.

These are **separate readiness facts**. PATH currently has no cryptographic proof that a local verification key and a Vercel-stored runtime key are identical.

Do not invent cross-backend secret synchronization or identity proof in P15.

Record non-blocking debt:

```text
no cross-backend identity proof for Stripe runtime key
```

P15 readiness therefore distinguishes:

```text
Stripe verification identity    verified / not verified
Verified key mode               test / live / unknown
Production runtime secret       present / missing / unknown
Webhook runtime secret          present / missing / unknown
```

## 10.4 Canonical payment authority

Recommended schema:

```text
pathcode.p15.payments.v1
```

Conceptual shape:

```js
{
  schema,
  revision,
  items: [{
    paymentId,
    provider: "stripe",
    label,
    integrationId,
    verificationBindingId,
    runtimeEnvironmentId,
    expectedMode: "test" | "live",
    checkout: {
      mode: "payment" | "subscription",
      priceIds: string[],
      successPath: string,
      cancelPath: string,
      webhookPath: string,
      requiredWebhookEvents: string[]
    },
    urlSource: {
      kind: "p11_domain" | "explicit",
      domainId: string | null,
      explicitBaseUrl: string | null
    },
    dependencies: {
      authId: string | null,
      databaseId: string | null
    },
    webhook: {
      endpointId: string | null,
      signingSecretVariableName: string | null,
      observation: object
    },
    readiness: object,
    createdAt,
    updatedAt
  }]
}
```

Exact property layout may adapt to repository conventions, but preserve the distinctions above.

## 10.5 Hosted Checkout contract

Engineering projection must be sufficient for the selected engine to implement product routes, for example:

```text
PAYMENTS
Provider: Stripe
Runtime environment: Production
Secret variable: STRIPE_SECRET_KEY
Expected mode: live
Checkout mode: subscription
Price IDs: price_...
Success path: /billing/success
Cancel path: /pricing
Webhook path: /api/stripe/webhook
Webhook signing variable: STRIPE_WEBHOOK_SECRET
Auth dependency: <authId or none>
Database dependency: <databaseId or none>
```

The product server creates a fresh Checkout Session and redirects to Stripe-hosted Checkout. Secret keys never enter browser code.

## 10.6 Price model

V1 references existing bounded Stripe Price IDs (`price_...`). PATH Builder does not become a Stripe catalog management UI.

## 10.7 Stable URL / webhook base

P15's stable base URL uses:

```text
verified P11 domain | explicit validated URL
```

Do not use changing P10 per-deployment `providerUrl` as webhook/success base.

If no stable base exists, payment configuration may be saved but readiness must state:

```text
production callback/webhook base missing
```

## 10.8 Webhook contract

V1 does **not** automatically create Stripe webhook endpoints, because creation returns signing-secret material and PATH does not yet have a safe provider-generated-secret capture/write path.

Workflow:

1. PATH Builder derives the exact expected webhook URL.
2. Creator configures endpoint in Stripe (owner gate / manual provider step).
3. Creator stores signing secret in the production P9/Vercel environment.
4. Safe endpoint ID may be stored.
5. PATH may read-only verify configured endpoint URL/events if credentials permit.

Do not persist provider webhook secret.

Frozen default event sets:

### one-time payment

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
```

### subscription

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.paid
invoice.payment_failed
```

Codex re-checks these event names against current official Stripe docs; any deviation must be justified in the Cloud report. Never subscribe to `*` by default.

## 10.9 Optional P13/P14 dependencies

Do not force a SaaS stack on every payment configuration.

- anonymous one-time payment may need neither P13 nor P14;
- authenticated subscription may reference P14;
- durable entitlement/subscription state may reference P13.

When present, references are validated and guarded against deletion at the coordinator boundary. Missing/dangling dependencies project action-required, never ready.

## 10.10 Mode/readiness rules

P12 capability `stripe.mode.test/live` feeds P15 readiness.

Required warnings:

- expected/live production flow using a verified test key → warning/action-required;
- expected/test flow using verified live key → warning/action-required;
- runtime Vercel secret missing → not deployment-ready;
- local verification and runtime presence are separate; never claim key identity proof;
- webhook signing secret missing → webhook not ready.

## 10.11 P15 tests

### P12 Stripe extension

- catalog now has GitHub + Stripe; GitHub entry semantics unchanged;
- direct updates are limited to the two previously exact GitHub-only assertions plus new Stripe coverage;
- one account verification call;
- safe identity/capability reduction;
- mode capability test/live;
- restricted/invalid credential behavior;
- stale integration/P9 and credential-change races;
- no key material leakage.

### P15 authority/readiness

- legacy-empty authority;
- payment config CRUD/revision/stale authority;
- verification binding existence and readiness;
- runtime environment Vercel presence modeled separately;
- expectedMode mismatch warnings;
- Price ID/path/event validation;
- verified P11 domain vs explicit URL;
- optional P13/P14 refs and coordinator deletion guards;
- webhook endpoint/signing variable readiness;
- pending restore;
- no `secretRef` in Browser projection;
- safe objective projection.

### Builder/browser

- local ingress guard protects mutating routes;
- no direct Stripe browser request;
- no raw key fields;
- no local/session storage secret persistence;
- refresh/list is observational.

## 10.12 Cloud completion state

Without Stripe owner credentials/resources, code still completes and reports:

```text
P15 IMPLEMENTED — STRIPE LIVE/TEST OWNER GATES PENDING
```

Then continue P16.

---

# 11. Phase E — P15 PATH Builder payments experience

Add a **Payments** Phase-6 rail row/dialog.

Recommended UX:

```text
Payments
├─ Stripe verification connection
│  ├─ account verified / unavailable
│  └─ verified mode: Test / Live
├─ Production runtime environment
│  ├─ STRIPE_SECRET_KEY presence
│  └─ STRIPE_WEBHOOK_SECRET presence
├─ Checkout
│  ├─ payment / subscription
│  ├─ expected mode
│  ├─ Price IDs
│  ├─ success path
│  └─ cancel path
├─ Stable URL source
│  ├─ verified domain
│  └─ explicit URL
├─ Webhook
│  ├─ expected URL
│  ├─ endpoint ID
│  └─ required events
├─ optional Auth dependency
├─ optional Database dependency
└─ decomposed readiness summary
```

Never compress verification, runtime-secret presence, webhook configuration and dependency readiness into one misleading green badge.

---

# 12. Phase F — P16 Native / mobile packaging authority

## 12.1 Product decision for P16 V1

P16 packages the **canonical locally built web artifact** into Capacitor iOS/Android native projects.

It does not:

- wrap a production URL as the primary app runtime;
- automatically submit to App Store/Play Store;
- bypass Git/S2 product authority;
- introduce native Stripe SDK architecture;
- require P17 PATH Studio.

Generated native trees are runtime/package artifacts unless later intentionally adopted through normal engineering authority.

## 12.2 Current Capacitor contract

At final drafting, current official Capacitor docs are v8 and require Node 22+. Current platform docs require macOS/Xcode for iOS and Android Studio/SDK for Android; current v8 documentation lists Xcode 26+ and Android Studio 2025.2.1+.

Codex re-checks the current stable version before implementation, chooses one compatible **exact version set**, and records it in the operation snapshot. Do not float `latest` during packaging.

Cloud Linux limitations are `ENVIRONMENT_LIMITATION`, not product failure. Local macOS acceptance remains required for iOS/toolchain proof.

## 12.3 Canonical native authority

Recommended schema:

```text
pathcode.p16.native.v1
```

Conceptual shape:

```js
{
  schema,
  revision,
  profiles: [{
    nativeId,
    appId,
    appName,
    platforms: ["ios", "android"],
    buildEnvironmentId,
    packagePolicy: {
      capacitorVersion,
      webDir,
      iosPackageManager
    },
    authId: string | null,
    authCallbackScheme: string | null,
    createdAt,
    updatedAt
  }],
  pendingOperation,
  operationHistory,
  artifacts: [{
    artifactId,
    nativeId,
    sourceSha,
    sourceTreeSha,
    platforms,
    checksums,
    state,
    createdAt
  }]
}
```

Long-running operation snapshots bind to:

- `Build.authoritativeSha` + tree SHA;
- profile/app identity;
- selected P9 environment revision for web build inputs;
- detected framework/package manager/lockfile/build command;
- exact pinned Capacitor package versions;
- platform set;
- workspace identity.

## 12.4 Reuse canonical source materialization

P16 must reuse/generalize P10's `deploy-source.mjs` principle instead of cloning it.

A small helper generalization may parameterize snapshot directory/error prefix so P10 continues to behave byte-for-byte according to existing tests while P16 uses e.g. `native-snapshots/`.

Materialize canonical Git blobs only. No dirty creator tree, checkout filters/hooks, secret files, or symlinks.

Packaging is refused while `record.pendingCandidate` exists, matching P10's canonical-source rule.

## 12.5 Product dependency install and build safety

This is the first PATH-owned workflow that intentionally installs/builds product dependencies in an isolated workspace. Treat product lifecycle scripts as creator-controlled code.

Required safeguards:

### Lockfile / frozen installation

Require a lockfile consistent with detected package manager.

```text
npm   → npm ci
pnpm  → pnpm install --frozen-lockfile
yarn  → immutable/frozen-lockfile mode appropriate to detected Yarn
bun   → bun install --frozen-lockfile
```

No lockfile:

```text
NATIVE_LOCKFILE_REQUIRED
```

Never fall back to a plain mutable `npm install` of product dependencies.

### Dedicated native build environment

A P16 profile must select an explicit:

```text
buildEnvironmentId
```

The native build environment is intentionally distinct from the production deployment environment.

Eligibility is strict:

- ordinary `config` entries are allowed;
- `local_env_file` secret bindings are allowed after normal P9 verification;
- **any** `vercel_env` secret binding makes the selected native build environment unusable;
- readiness becomes `build_environment_unusable` / action-required;
- PATH must not silently fall back to another environment;
- PATH must not silently omit an offending variable.

This is required because the current selected-environment resolver rejects the whole environment when any secret uses `vercel_env`, while P15 correctly allows/needs Vercel-backed production runtime secrets.

Make one **narrow** extension to the existing runtime environment machinery:

```text
runtime/selected-env.mjs
runtime/product-env.mjs
```

Add a bounded `build` plan kind used by P16 packaging:

- no fake `PORT`, `HOST`, or `HOSTNAME`;
- allow the same exact-authority `config` + `local_env_file` materialization used by product runtime execution;
- preserve the existing `.env.local` exact-name safety boundary;
- preserve `spawn` / preview behavior and tests unchanged;
- do not create a second environment resolver or native-only secret plumbing.

The Cloud implementation must add regression tests proving:

1. production-like environments containing `vercel_env` secrets are rejected for native packaging;
2. a dedicated local/config build environment succeeds;
3. there is no silent environment substitution;
4. existing preview/runtime environment behavior remains unchanged.

### Child environment

Build/install child processes run through the existing selected-product environment machinery (`createProductRuntimeEnv` / selected-env path), not raw `process.env`.

Tests must prove child processes do **not** inherit:

```text
PATHCODE_*
OPENAI_API_KEY
CURSOR_API_KEY
PATH_CURSOR_API_KEY
GITHUB_TOKEN / GH_TOKEN
VERCEL_TOKEN
other PATH engine/provider host credentials
```

Only allowlisted host/runtime keys plus selected product environment may enter.

### Process bounds

- `spawn`/argv arrays, never shell strings;
- wall-clock timeout per step;
- captured stdout/stderr size cap;
- workspace disk cap;
- bounded reduced logs under PATH runtime root;
- secret sentinel scan on retained output;
- termination/cleanup on timeout.

### Coordinator concurrency

Do **not** hold the per-Build `exclusive` gate during install/build/capacitor work. Hold it only for durable state transitions and stale-authority checks.

A `running` operation found after coordinator restart becomes `interrupted` on explicit observe/recovery and its orphan workspace is cleaned safely. No hidden resume of arbitrary product scripts.

## 12.6 Web build eligibility

Supported V1 product shapes produce a static web bundle containing `index.html` after build.

Likely supported:

- static;
- Vite;
- Astro static;
- other explicitly detected static-output web frameworks.

Next/server-rendered output is not assumed Capacitor-ready. Next is eligible only when the actual build produces a verified static export such as `out/index.html`.

Unknown/server-only products return honest unsupported/readiness state.

## 12.7 Packaging-only Capacitor toolchain

Do not silently rewrite the authoritative product dependency graph.

After product web build succeeds, bootstrap/use an isolated packaging workspace with the exact pinned compatible versions of:

```text
@capacitor/core
@capacitor/cli
@capacitor/ios
@capacitor/android
```

Generated package metadata/native projects remain artifact workspace content unless the product already intentionally owns compatible Capacitor source and the future engineer chooses to adopt it through normal product authority.

Standard flow remains conceptually:

```text
web build
→ verify webDir/index.html
→ generate bounded capacitor config
→ add selected platforms
→ cap sync
→ verify generated artifacts
→ record checksums/state
```

## 12.8 Capacitor config / identity

Require bounded:

```text
appId
appName
webDir
```

`appId` is explicit creator intent, validated as a reverse-domain package identifier. Do not silently derive and accept it from project title.

`authCallbackScheme`, when configured, defaults conceptually to:

```text
<appId>://auth-callback
```

but validate the scheme against RFC 3986 scheme rules and current Supabase redirect matching before presenting it as ready.

## 12.9 Signing and platform toolchains

P16 may model signing readiness through P9 references, but it does not create/import secrets or submit stores.

Owner/toolchain gates include:

- macOS/Xcode for iOS build/open;
- Android Studio/SDK for Android build/open;
- Apple signing identity/team/provisioning;
- Android keystore/alias/password.

Unsigned/scaffold/simulator-grade packaging is valid implementation evidence where supported.

## 12.10 Auth and payment compatibility

If a profile references P14 auth:

- compute callback readiness from P14 intent/observation;
- do not silently PATCH P14;
- if redirect is missing, show action-required.

Hosted Stripe Checkout remains web-based. P16 does not add native Stripe SDK, Apple Pay or Google Pay automatically. Return/deep-link behavior is an explicit compatibility concern.

## 12.11 Artifact lifecycle

Retain a small bounded number of artifacts per profile (default target: 3) and enforce a total-size cap. Clean superseded workspaces/artifacts according to operation state.

Artifact with `sourceSha != Build.authoritativeSha` is `stale` after adoption/restore and must not appear as current.

P8 restore does not restore P16 authority; it only changes which source-bound artifacts are current.

## 12.12 P16 tests

Require mechanical/synthetic tests without Xcode/Android Studio dependency for ordinary Cloud CI:

- legacy-empty authority;
- profile CRUD/revision/stale authority;
- appId/appName/scheme validation;
- canonical SHA/tree snapshot;
- pending candidate/restore refusal;
- generalized materializer preserves all P10 behavior/codes;
- lockfile required and frozen command planning for npm/pnpm/yarn/bun;
- no shell invocation;
- child environment strips PATH/engine/provider host secrets;
- timeout/output/disk bounds;
- long external work happens outside coordinator exclusive gate;
- restart `running → interrupted` recovery and cleanup;
- unsupported web artifact classification;
- static `webDir/index.html` proof;
- exact pinned Capacitor versions in operation snapshot;
- fake add/sync executor;
- source SHA race after long work;
- artifact retention/staleness after P8 restore/adoption;
- no secret values in artifacts/events/reports/browser;
- auth callback readiness projection;
- no browser shell-command injection;
- local ingress guard covers new mutating native routes.

## 12.13 Cloud completion state

Cloud may fully implement and mechanically verify P16 while reporting local toolchain gates, for example:

```text
P16 IMPLEMENTED — LOCAL IOS/ANDROID TOOLCHAIN ACCEPTANCE PENDING
```

Do not block repository completion merely because Cloud Linux has no Xcode.

---

# 13. Phase G — P16 PATH Builder native experience

Add a **Mobile** Phase-6 rail row/dialog.

Recommended UX:

```text
Mobile
├─ App identity
│  ├─ App name
│  └─ App ID
├─ Platforms
│  ├─ iOS
│  └─ Android
├─ Source authority
│  └─ current authoritative SHA
├─ Selected build environment
│  └─ usable / build_environment_unusable
├─ Web artifact readiness
├─ Auth callback readiness
├─ Signing/toolchain readiness
├─ Prepare package
├─ Operation status
└─ Generated artifacts / local-open instructions
```

Show platform facts separately:

```text
iOS      configured / packaged / local-toolchain-required / interrupted / failed
Android  configured / packaged / local-toolchain-required / interrupted / failed
```

Do not label missing Xcode in Cloud as a product defect. Do not automatically open Xcode/Android Studio or submit to stores from Cloud.

---

# 14. Phase H — Cross-stage hardening

## 14.1 Secret/leak scan

Scan all new authority records, events, browser payloads, retained logs and objective projections with synthetic sentinels covering:

```text
Supabase management tokens
Supabase sb_secret_*
Google/GitHub OAuth client secrets
Stripe sk_test_/sk_live_
Stripe rk_test_/rk_live_
Stripe whsec_*
DATABASE_URL/userinfo
Android keystore/password material
Apple signing material
```

No secret values or canonical P9 secretRefs in Browser-facing payloads.

## 14.2 Local HTTP mutation guard

Run dedicated tests for Host/Origin/Sec-Fetch-Site/content-type/body-size enforcement across representative P13.4/P14/P15/P16 mutations and prove existing allowed local calls still work.

## 14.3 Restore / source staleness matrix

At minimum prove:

- pending restore blocks all new plane mutations/effects;
- completed restore does not rewind P14/P15/P16 operational authority;
- P16 artifact/source state becomes stale when authoritative SHA changes;
- P14/P15 non-source configuration remains current and truthful.

## 14.4 Referential-integrity matrix

Prove the coordinator refuses normal deletion of referenced P13/P12/P14 records, while legacy/corrupted dangling references degrade downstream readiness to `dependency_missing` rather than crash.

## 14.5 Browser transport boundary

Browser source must not contain direct requests to:

```text
api.supabase.com
api.stripe.com
```

or direct provider authorization headers/credential handling.

No credential state in local/session storage.

## 14.6 Engineering projection

Extend `objectives.mjs` using the existing configured-integration pattern with pure record-derived functions such as:

```text
configuredDatabaseContext
configuredAuthContext
configuredPaymentsContext
configuredNativeContext
```

No I/O, no secret material, no P9 `secretRef`, and no engine-brand logic.

## 14.7 Closed-stage regression discipline

Explicitly rerun:

- P9 environments/secrets suites touched by secret-recognition changes;
- P10 canonical source/deployment suites touched by materializer generalization;
- P11 domain suites consumed by URL readiness;
- P12 integrations suites touched by Stripe catalog/guards;
- full P13 suites plus P13.4 UX.

Protected tests are not rewritten to hide regressions. Allowed assertion updates must be listed under `Protected test changes` in the Cloud report.

## 14.8 Linux Cloud evidence gate

Cloud runs the untouched baseline first and preserves its failure list. After implementation:

```text
npm run typecheck
npm run build
git diff --check
vitest run <all touched/new stage suites>
vitest run <full repository, compared to baseline>
```

`npm run check` is not required to become green on Linux when known macOS host-gated baseline failures remain. **No new failures** is the Cloud-wide rule.

The three stale package/dependency architecture tests must be intentionally updated to approve exact `pg` and should become green; they are not permitted to remain as unexplained baseline failures.

## 14.9 Final Cloud hardening outcome

Codex returns:

- branch/commit map;
- exact baseline-vs-final failure delta;
- new stage test counts;
- protected-test changes;
- security checklist results;
- confirmed defect ledger;
- nonblocking debt/documentation/environment ledgers;
- Owner Gate Ledger;
- stage-by-stage implementation status.

---

# 15. Proposed coordinator/API expansion

Use repository naming conventions; exact names may change, semantics may not.

## P13.4 Browser surface

Coordinator P13 methods already exist. Add Builder HTTP routes only, using flat sub-actions compatible with the current router:

```text
GET  .../databases
GET  .../databases/catalog
GET  .../databases/:databaseId
POST .../databases/mutate
POST .../databases/verify-provider
POST .../databases/verify-connection
POST .../databases/regions
POST .../databases/provision-prepare
POST .../databases/provision-execute
POST .../databases/provision-observe
POST .../databases/migrations-observe
```

## P14 coordinator

```text
build.auth.list
build.auth.read
build.auth.mutate
build.auth.observe
build.auth.applyPrepare
build.auth.applyExecute
build.auth.applyObserve
```

Surface flat subs:

```text
auth/mutate
auth/observe
auth/apply-prepare
auth/apply-execute
auth/apply-observe
```

## P15 coordinator

P12 gains Stripe through existing integration methods. New P15 methods are stage-owned, for example:

```text
build.payments.list
build.payments.read
build.payments.mutate
build.payments.observeWebhook
```

Avoid provider-resource creation methods in V1 when PATH cannot safely capture provider-generated webhook secret material.

## P16 coordinator

```text
build.native.list
build.native.read
build.native.mutate
build.native.prepare
build.native.execute
build.native.observe
```

`execute` performs long work outside the exclusive gate with durable pre/post transitions and stale-source checks.

## Wiring convention

Every new authority follows repository conventions:

- top-level Build section (`record.auth`, `record.payments`, `record.native`);
- legacy-empty projection via `own(record, key)`;
- strict `validAuthority`;
- pure prepare mutation + coordinator exclusive write;
- exports in `build/index.mjs`;
- declarations in `build/index.d.mts`;
- protocol constants in `coordinator/protocol.mjs`;
- client methods in `coordinator/client.mjs`;
- safe bounded events via `appendBuildEvent`.

---

# 16. Data-plane summary

| Stage | Canonical PATH Builder state | External authority | Secret authority | Source authority |
|---|---|---|---|---|
| P13.4 | existing `pathcode.p13.databases.v1` | Supabase project/Postgres | P9 | Git for migrations |
| P14 | new `pathcode.p14.auth.v1` | Supabase Auth config | P9 + linked P13 management ref | n/a except engineering product code |
| P15 | P12 Stripe connection + `pathcode.p15.payments.v1` | Stripe | P9 | Git for product payment implementation |
| P16 | `pathcode.p16.native.v1` | local native toolchains / app stores later | P9 | Git `authoritativeSha` |

---

# 17. Owner Gate Ledger

Cloud must record, not repeatedly ask about, owner-only gates.

Each entry:

```text
Gate ID
Stage
Why owner/provider/local authority is required
Exact prerequisite
What Cloud completed already
What remains for live acceptance
Whether later implementation can continue
```

## OG-P14-01 — Supabase Auth management authority

Need a token type/permission set that current Supabase docs actually support for:

```text
auth_config_read
auth_config_write
project_admin_write (where current PATCH contract requires it)
```

Do not promise fine-grained scoping if the chosen token type is account-wide. Re-check at live gate.

## OG-P14-02 — Google/GitHub OAuth credentials

Client IDs + secrets are owner/provider-created. Secret material is stored through P9 local authority for the configuration operation; never pasted into Cloud report.

## OG-P15-01 — Stripe verification key

Prefer test mode first. Requires a safely staged local key for P12 verification.

## OG-P15-02 — Stripe Price IDs

Existing `price_...` resources selected by the owner/product.

## OG-P15-03 — Stripe webhook endpoint/signing secret

Creator/provider step. PATH V1 does not auto-create the endpoint because safe capture of creation-time signing secret is not implemented.

## OG-P15-04 — Production runtime Stripe secrets

Production `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` must exist as `vercel_env` bindings in the production P9 environment. PATH observes presence only; it does not prove identity with the local verification key.

## OG-P16-01 — Local native toolchain

Local macOS/Xcode and Android toolchain proof where Cloud lacks them.

## OG-P16-02 — Signing identities

Apple team/signing/provisioning and Android keystore credentials remain P9/owner authority. Store submission remains out of scope.

---

# 18. Live acceptance after Cloud implementation

Cloud implementation is not final product acceptance.

## P13.4 / overall P13

P13.1–P13.3 are already **CLOSED / ACCEPTED / PROTECTED** and must not be reopened by Cloud. Cloud implements P13.4 UX/projection/regression only.

Cloud status:

```text
P13.4 IMPLEMENTED — LOCAL FINAL UX ACCEPTANCE PENDING
```

After local macOS review confirms the Builder UX projects accepted P13 authority correctly and regressions remain green, overall P13 can be marked CLOSED.

## P14

Live acceptance should eventually prove at minimum:

- real read of bounded Supabase Auth config;
- one owner-approved mutation or drift-blocked prepare/execute flow;
- correct Site URL/redirect behavior;
- no raw provider secret return;
- Google/GitHub only if owner supplies credentials.

## P15

Live acceptance should use Stripe test mode first:

- P12 Stripe identity verification;
- mode capability;
- PATH Builder readiness from stable URL and runtime-secret presence;
- product-created hosted Checkout Session on a disposable/test product when appropriate;
- webhook configuration/signature path as an owner gate.

Do not use live money merely to prove repository implementation.

## P16

Local acceptance should prove canonical source packaging, static webDir, generated native artifact, stale-source behavior, and at least one real platform workflow available on the owner machine. Store submission/signing can remain later owner gates unless specifically authorized.

---

# 19. P17 compatibility boundary — preserve now, implement later

The future tranche is **P17 — PATH Studio + Engine Expansion**.

Its key decision is already known:

```text
Codex = default primary engineering intelligence/engine
PATH  = orchestrator, evidence and execution-coordination authority
Cursor = retained optional/delegated engine, not default
```

P17 must apply coherently across:

```text
PATH Code
PATH Builder
PATH Studio
shared Gateway / Engine Fabric / task provenance / durability
```

This is deliberately **not** implemented in P13.4–P16 because changing primary engine semantics is a shared-system migration, not a Builder product-operations detail.

## 19.1 Do not touch now

Do not modify simply to prepare for Codex:

- engine IDs in `engine-contract.mjs`;
- routing/rotation semantics;
- Cursor/Copilot/Antigravity readiness contracts;
- Gateway fabric methods;
- task/checkpoint provenance shapes;
- P6 model-plane engine semantics;
- PATH Code primary selection;
- PATH Studio implementation.

P13.4–P16 stay engine-neutral and project safe facts through objectives.

## 19.2 Documentation drift

`PATH_POST_S5_ROADMAP_RECONCILIATION.md` historically labels P17 as PATH Studio only. Do not rewrite it in this tranche. Record a documentation gap so P17 planning can reconcile the historical label with the now-approved combined Studio + Codex-primary Engine Expansion tranche.

## 19.3 Future P17 audit target

Before P17 implementation, explicitly audit all hard-coded engine enumerations and assumptions across AG9/AG10, Gateway, PATH Code, Builder surface, model plane and future Studio so Codex can become primary without destabilizing adoption, task identity, collaboration, durability or evidence.

---

# 20. Suggested file-impact map

This is guidance, not a prison. Codex inspects the repository and chooses the smallest coherent structure. Any materially broader closed-stage edit must be justified in the final report.

## Shared/security likely changes

```text
scripts/pathcode-cli/build/surface/server.mjs
scripts/pathcode-cli/build/environments.mjs          # secret-pattern hardening only
scripts/pathcode-cli/build/integrations.mjs          # Stripe catalog / secret-pattern / existing P12 semantics
scripts/pathcode-cli/build/coordinator/service.mjs   # cross-plane guards + new stage wiring
```

## P13.4 likely areas

```text
scripts/pathcode-cli/build/surface/server.mjs
scripts/pathcode-cli/build/surface/public/index.html
scripts/pathcode-cli/build/surface/public/app.js
scripts/pathcode-cli/build/surface/public/app.css
scripts/pathcode-cli/build/objectives.mjs
scripts/pathcode-cli/build/coordinator/client.mjs
```

P13.1–P13.3 backend modules should remain unchanged unless a concrete P13.4 projection defect is proven. Database deletion protection for P14 should preferably live at coordinator cross-plane mutation boundary rather than coupling P13 pure authority to P14.

## P14 likely new modules

```text
scripts/pathcode-cli/build/auth.mjs
scripts/pathcode-cli/build/auth-adapters.mjs
scripts/pathcode-cli/build/supabase-auth-adapter.mjs
scripts/pathcode-cli/build/auth-operations.mjs
```

plus bounded edits to:

```text
scripts/pathcode-cli/build/supabase-management-adapter.mjs  # shared bounded PATCH helper if appropriate
scripts/pathcode-cli/build/coordinator/protocol.mjs
scripts/pathcode-cli/build/coordinator/client.mjs
scripts/pathcode-cli/build/coordinator/service.mjs
scripts/pathcode-cli/build/index.mjs
scripts/pathcode-cli/build/index.d.mts
scripts/pathcode-cli/build/surface/server.mjs
scripts/pathcode-cli/build/surface/public/*
scripts/pathcode-cli/build/objectives.mjs
```

## P15 likely new/changed modules

```text
scripts/pathcode-cli/build/integration-adapters.mjs
scripts/pathcode-cli/build/stripe-integration-adapter.mjs
scripts/pathcode-cli/build/payments.mjs
scripts/pathcode-cli/build/payments-operations.mjs      # only if state machine separation helps
scripts/pathcode-cli/build/stripe-payment-adapter.mjs  # only for bounded read-only webhook observation if needed
```

Avoid the full Stripe SDK unless it materially improves safety/contract quality. A small fixed HTTPS adapter consistent with existing provider adapters is acceptable.

## P16 likely new/changed modules

```text
scripts/pathcode-cli/build/native.mjs
scripts/pathcode-cli/build/native-runtime.mjs
scripts/pathcode-cli/build/capacitor-adapter.mjs
scripts/pathcode-cli/build/deploy-source.mjs            # bounded reusable materializer generalization
scripts/pathcode-cli/build/runtime/product-env.mjs      # only if existing safe child-env API needs a narrow extension
```

Prefer reuse over `native-source.mjs` cloning of P10 materialization. P10 tests must prove behavior/error codes remain intact.

## Shared wiring for new authorities

Expect bounded edits to:

```text
scripts/pathcode-cli/build/coordinator/protocol.mjs
scripts/pathcode-cli/build/coordinator/client.mjs
scripts/pathcode-cli/build/coordinator/service.mjs
scripts/pathcode-cli/build/index.mjs
scripts/pathcode-cli/build/index.d.mts
scripts/pathcode-cli/build/surface/server.mjs
scripts/pathcode-cli/build/surface/public/index.html
scripts/pathcode-cli/build/surface/public/app.js
scripts/pathcode-cli/build/surface/public/app.css
scripts/pathcode-cli/build/objectives.mjs
```

---

# 21. Test / evidence matrix

| Area | Cloud mechanical/synthetic proof | Later live/local proof |
|---|---|---|
| Linux baseline | record exact untouched failures | n/a |
| P13.4 | HTTP/UX projection, secret safety, full P13 regressions | local Builder projection of accepted P13 fixture |
| P14 authority | CRUD, observe/apply synthetic adapter, drift guard, races | real Supabase Auth GET/PATCH gate |
| P14 UX | rail/dialog/URL readiness/objectives | creator flow with real project/domain |
| P15 P12 Stripe | account reducer, mode capability, races | Stripe test key/account |
| P15 authority/UX | readiness/deps/webhook config, no secrets | hosted Checkout/test webhook path |
| P16 authority | state machine, stale/recovery/artifacts | local native toolchain |
| P16 executor | frozen install, env scrub, caps, fake Capacitor | real scaffold/sync/build as available |
| Shared HTTP guard | Host/Origin/content/body tests | local browser smoke |
| Referential integrity | delete guards + dangling readiness | local integration smoke |
| Secret safety | sentinel scans | local log/browser inspection |
| Full repository | no new failures vs Linux baseline | full macOS `npm run check` |

## 21.1 Approved baseline-test changes

The following are explicitly allowed and must be reported:

1. three stale dependency assertions updated to allow exact approved `pg`;
2. two P12 exact GitHub-only catalog assertions updated to expect GitHub + Stripe while preserving GitHub semantics;
3. other protected-stage test edits only when a concrete tranche change directly invalidates the old assertion, with reason listed in the report.

Do not weaken tests merely to make Cloud green.

---

# 22. Security checklist

Codex explicitly checks each item in the final report.

## Local Builder ingress

- [ ] Host restricted to bound local origin
- [ ] cross-origin non-GET rejected
- [ ] unsafe `Sec-Fetch-Site` rejected
- [ ] JSON content type required for non-empty JSON bodies
- [ ] existing bodyless lifecycle POSTs remain functional
- [ ] JSON body size bounded
- [ ] existing reference-upload cap preserved
- [ ] guard is described honestly as foreign-origin protection, not preview isolation
- [ ] same-origin preview limitation recorded as `NONBLOCKING_DEBT`

## Secrets / browser

- [ ] no raw secret in Build authority
- [ ] no Browser `secretRef`
- [ ] no Browser provider key/password field where variable selection is used
- [ ] no credentials in events/objectives/reports
- [ ] Stripe/Supabase secret prefixes covered by detection/redaction
- [ ] no local/session storage credential persistence

## Network/provider

- [ ] fixed provider hosts/endpoints
- [ ] bounded time/response sizes
- [ ] strict response reduction
- [ ] P14 exact PATCH allowlist
- [ ] P14 provider drift GET before PATCH
- [ ] no hidden mutating retries
- [ ] browser never calls provider directly

## Referential integrity

- [ ] referenced P13/P12/P14 records cannot be normally deleted
- [ ] legacy dangling refs degrade to `dependency_missing`
- [ ] no generic cross-plane graph subsystem introduced

## Native execution

- [ ] canonical Git snapshot only
- [ ] pending candidate/restore guard
- [ ] matching lockfile required
- [ ] frozen dependency install only
- [ ] explicit `buildEnvironmentId` required
- [ ] native build environment rejects `vercel_env` entries as `build_environment_unusable`
- [ ] no silent build-environment fallback or variable dropping
- [ ] `build` plan kind reuses existing exact product-env authority without fake PORT/HOST
- [ ] child env strips PATH/engine/provider host secrets
- [ ] argv spawn, no shell strings
- [ ] timeout/output/disk caps
- [ ] long work outside coordinator exclusive gate
- [ ] restart interruption/cleanup
- [ ] exact pinned Capacitor versions
- [ ] generated artifacts do not become source authority
- [ ] bounded retention/staleness

## Closed-stage preservation

- [ ] P9–P13 semantics remain intact except explicitly authorized compatibility/security changes
- [ ] P10 source-materialization generalization keeps P10 behavior/codes green
- [ ] P12 GitHub provider behavior unchanged
- [ ] P13.1–P13.3 not reopened
- [ ] Engine Fabric untouched

---

# 23. UX quality bar

The tranche is not complete if backend APIs exist but PATH Builder looks like a debug console.

New experiences must match the existing PATH Builder visual language:

- compact creator-facing language;
- clear factual status;
- no backend-internal jargon as primary labels;
- advanced details available but secondary;
- loading and error states that do not lie;
- keyboard/focus accessibility consistent with existing dialogs;
- responsive behavior at existing mobile/tablet breakpoints;
- no giant forms when progressive disclosure is clearer.

Recommended top-level project rail additions:

```text
Database
Authentication
Payments
Mobile
```

Each rail item should summarize state and open its management dialog.

Example summaries:

```text
Database        Connected
Authentication Needs setup
Payments        Stripe · Test
Mobile          iOS + Android
```

Do not use “Connected” unless the relevant observation is actually ready.

---

# 24. Closure Ledger

Codex returns one consolidated ledger at the end.

Categories:

```text
CONFIRMED_DEFECT
OWNER_GATE
LIVE_ACCEPTANCE_PENDING
ENVIRONMENT_LIMITATION
NONBLOCKING_DEBT
- `Product preview is same-origin with the Builder API; separate-origin preview is future hardening.`

DOCUMENTATION_GAP
```

Each item must say whether it blocks:

- P13 acceptance;
- P14 acceptance;
- P15 acceptance;
- P16 acceptance;
- merge of the tranche;
- later P17 architecture.

Do not mix optional enhancements with release-blocking defects.

---

# 25. Required Codex Cloud final report

Return one consolidated report, not phase-by-phase owner interruptions.

Required sections:

```text
PATH BUILDER — P13.4 → P16 CLOUD TRANCHE REPORT

A. Branch / starting SHA / final SHA
B. Governing spec commit
C. Linux baseline evidence
D. Baseline failures by classification
E. Architecture deviations (if any) and justification
F. P13.4 implementation
G. P14 implementation
H. P15 implementation
I. P16 implementation
J. Shared ingress/security hardening
K. Cross-plane integrity hardening
L. Protected closed-stage changes
M. Protected test changes
N. pg stale-test correction
O. New/changed files by stage
P. Stage-specific test counts
Q. P9–P13 regression evidence
R. Final full-suite result vs BASELINE_FAILURES
S. Typecheck / build / diff-check
T. CONFIRMED_DEFECT ledger
U. NONBLOCKING_DEBT ledger
V. ENVIRONMENT_LIMITATION ledger
W. DOCUMENTATION_GAP ledger
X. OWNER_GATE ledger
Y. Unresolved product/live acceptance work
Z. Secret-safety evidence
AA. Worktree/branch cleanliness
AB. Recommended next correction/hardening mission
AC. Stage statuses
```

Stage status vocabulary:

```text
IMPLEMENTED — REVIEW REQUIRED
IMPLEMENTED — LIVE GATE PENDING
IMPLEMENTED — LOCAL TOOLCHAIN GATE PENDING
BLOCKED — <genuine blocker>
```

Cloud does **not** mark P14/P15/P16 CLOSED/PROTECTED. Acceptance happens after whole-tranche review, consolidated fixes, independent review and local/live gates.

---

# 26. Morning review / finalization workflow

When the Cloud mission returns, do not immediately merge.

## Step 1 — architecture reconciliation

Owner + lead architecture review:

- compare implementation to this document;
- inspect any design deviations;
- inspect owner gates;
- inspect actual test failures/flakes;
- decide what is release-blocking.

## Step 2 — independent tranche review

One independent reviewer receives:

- this master specification;
- Cloud branch diff;
- Cloud report;
- test evidence;
- owner-gate ledger.

Reviewer returns:

```text
ACCEPTABLE AS IMPLEMENTED
```

or one consolidated defect list.

Do not ask the reviewer to redesign already-frozen architecture unless a concrete contradiction is found.

## Step 3 — consolidated Codex correction mission

All confirmed defects go back to Codex together.

Codex fixes the full list and reruns affected + tranche-wide evidence.

## Step 4 — live acceptance

Resolve owner/provider/local-toolchain gates in a deliberate sequence.

## Step 5 — accept/freeze stages

Only after evidence:

```text
P13 CLOSED / ACCEPTED / PROTECTED
P14 CLOSED / ACCEPTED / PROTECTED
P15 CLOSED / ACCEPTED / PROTECTED
P16 CLOSED / ACCEPTED / PROTECTED
```

Stages may close independently if an external gate leaves a later stage open.

---

# 27. Codex Cloud master execution directive

This document is the controlling implementation contract.

> Implement **PATH Builder P13.4 through P16** as one coherent Cloud tranche from accepted SHA `5638ac85bf7edfbca9eb1f1df8da223ee033be03`. Start by committing this Version 2.1 under `docs/passes/`, then record the untouched Linux test baseline using `npm ci --force`. Preserve P13.1–P13.3 and all other closed-stage authority. Add the shared localhost foreign-origin ingress guard before exposing new mutating P14–P16 routes; require JSON content type only for non-empty JSON bodies and preserve existing bodyless lifecycle POSTs. Complete P13.4 Database Builder UX; implement Supabase-first P14 auth orchestration with an exact config allowlist and provider-drift guard; implement P15 Stripe-first hosted-Checkout configuration by minimally extending P12 and separating local verification from Vercel runtime-secret presence; implement P16 Capacitor packaging from canonical Git source with an explicit dedicated `buildEnvironmentId`, a narrow reusable `build` product-env mode, frozen installs, scrubbed child environment, bounded processes, durable operations and artifact staleness. Reuse existing authority/coordinator/materialization patterns and do not invent generic secret stores, OAuth platforms, provider proxies, dependency graphs, preview-isolation subsystems or a second Git authority. `pg` is an approved runtime dependency; update the three stale zero-dependency tests. Keep all new product-operation code engine-neutral and do not implement P17 or modify Engine Fabric. Work autonomously: investigate, fix ordinary defects, test and continue. Record owner-only credentials/provider effects/toolchains as Owner Gates rather than stopping unrelated work, and record same-origin preview isolation as nonblocking future hardening rather than solving it in this tranche. Never merge accepted branches, deploy production, create irreversible provider resources without authorization, or weaken tests to hide regressions. Return one tranche report, ledgers, test delta, and clean unmerged Cloud branch for whole-system review tomorrow.

---

# 28. Public provider/tool contracts verified for Version 2

Codex must re-check current official contracts while implementing and record material changes. Version 2 was reconciled against the following current documentation on 2026-10-18.

## Supabase Auth

References:

```text
https://supabase.com/docs/guides/auth/redirect-urls
https://supabase.com/docs/guides/auth/general-configuration
https://supabase.com/docs/reference/api/v1-get-auth-service-config
https://supabase.com/docs/reference/api/v1-update-auth-service-config
```

Current facts used by this spec:

- Site URL is the default auth redirect and production should use the real production URL.
- additional redirect URLs are allowlisted by Supabase; mobile custom-scheme redirects are supported.
- Management API exposes `GET /v1/projects/{ref}/config/auth` and `PATCH /v1/projects/{ref}/config/auth`.
- current GET docs require `auth_config_read`; current PATCH docs list `auth_config_write` and `project_admin_write` for fine-grained tokens.
- current PATCH body includes the exact fields used in the P14 allowlist, including `site_url`, `uri_allow_list`, `disable_signup`, `external_email_enabled`, `mailer_autoconfirm`, and Google/GitHub provider client/secret fields.

Do not persist the broad raw Auth config object merely because the provider exposes it.

## Stripe

References:

```text
https://docs.stripe.com/payments/checkout/quickstarts
https://docs.stripe.com/api/checkout/sessions
https://docs.stripe.com/api/events
```

Current facts used by this spec:

- Checkout Sessions support hosted redirect flows and payment/subscription use cases.
- server creates the Session; hosted mode exposes a Stripe Checkout URL.
- Stripe event catalog includes the event names frozen in P15's default lists.
- webhook/event handling is the durable fulfillment mechanism; browser success redirect alone is not payment truth.

Re-check current account identity endpoint/permission behavior when implementing the P12 Stripe adapter.

## Capacitor

References:

```text
https://capacitorjs.com/docs/getting-started
https://capacitorjs.com/docs/getting-started/environment-setup
https://capacitorjs.com/docs/updating/8-0
```

Current facts used by this spec:

- current docs are v8;
- Node 22+ is required;
- Capacitor integrates with an existing web app and syncs built `webDir` assets into native projects;
- standard tooling includes `cap add ios`, `cap add android`, and `cap sync`;
- iOS development requires macOS/Xcode; current v8 docs list Xcode 26+;
- Android requires Android Studio/SDK; current v8 docs list Android Studio 2025.2.1+;
- these local platform requirements are later acceptance gates, not reasons for Linux Cloud to abandon P16 implementation.

---

# 29. Repository evidence reconciled into Version 2

Key implementation evidence reviewed at baseline `5638ac85...` includes:

```text
package.json

docs/reports/PATH_POST_S5_ROADMAP_RECONCILIATION.md

scripts/pathcode-cli/build/environments.mjs
scripts/pathcode-cli/build/integrations.mjs
scripts/pathcode-cli/build/integration-adapters.mjs
scripts/pathcode-cli/build/databases.mjs
scripts/pathcode-cli/build/database-verification.mjs
scripts/pathcode-cli/build/database-provisioning.mjs
scripts/pathcode-cli/build/database-migrations.mjs
scripts/pathcode-cli/build/supabase-management-adapter.mjs
scripts/pathcode-cli/build/supabase-postgres-adapter.mjs
scripts/pathcode-cli/build/supabase-migration-adapter.mjs

scripts/pathcode-cli/build/deploy-source.mjs
scripts/pathcode-cli/build/runtime/artifact.mjs
scripts/pathcode-cli/build/runtime/product-env.mjs

scripts/pathcode-cli/build/coordinator/protocol.mjs
scripts/pathcode-cli/build/coordinator/client.mjs
scripts/pathcode-cli/build/coordinator/service.mjs

scripts/pathcode-cli/build/surface/server.mjs
scripts/pathcode-cli/build/surface/product-view.mjs
scripts/pathcode-cli/build/surface/public/index.html
scripts/pathcode-cli/build/surface/public/app.js
scripts/pathcode-cli/build/surface/public/app.css
scripts/pathcode-cli/build/objectives.mjs

scripts/pathcode-cli/ag10/engine-contract.mjs
scripts/pathcode-cli/ag10/engine-readiness.mjs
scripts/pathcode-cli/ag9/collaborate.mjs
scripts/pathcode-cli/gateway/runtime.mjs
```

Frozen repository conclusions:

1. Linux Cloud installation requires `npm ci --force`; do not remove macOS/arm64 package constraints.
2. `pg` is an intentional approved P13 dependency; three zero-runtime-dependency tests are stale.
3. Builder server needs one shared localhost ingress guard before P14–P16 mutation expansion.
4. P9 can read local secret material but not Vercel plaintext; verification and deployment presence are separate facts.
5. P10 per-deployment provider URL is not a stable production callback base; verified P11 domain or explicit URL is used.
6. Current surface router favors flat sub-actions; avoid deeper nested route schemes.
7. Builder currently has no Deploy/Domains dialogs; do not build them in this tranche.
8. P12 strict verification shape stays unchanged; Stripe mode is a capability.
9. P16 must reuse canonical source/env machinery and safely execute product build code in isolation.
10. Engine Fabric still enumerates Cursor/Copilot/Antigravity in shared code; P17 is a deliberate future migration, not incidental tranche cleanup.

---

# 30. Frozen owner decisions — no further pre-launch questions

These decisions are final for the Cloud tranche unless the owner explicitly changes them later.

## 30.1 P14 provider

```text
Supabase Auth is the only P14 V1 auth provider.
```

## 30.2 P14 sign-in methods

```text
Email + Google + GitHub
```

No MFA/SSO/custom SMTP/general IdP platform in this tranche.

## 30.3 P14 stable URL

```text
verified P11 domain | explicit validated URL
```

No P10 per-deployment provider URL as stable auth Site URL.

## 30.4 P15 business model

```text
creator's existing Stripe account
Stripe-hosted Checkout
existing Price IDs
not Stripe Connect marketplace/platform
```

## 30.5 P15 secret/readiness model

```text
local readable key = verification truth
Vercel secret presence = production runtime truth
no cross-backend identity proof claimed
```

## 30.6 P16 artifact model

```text
canonical Git source → isolated web build → Capacitor artifact
native generated trees do not silently become product Git authority
store submission/signing automation deferred
```

## 30.7 Approved runtime dependency

```text
pg is approved
```

Update stale zero-dependency tests; do not remove `pg`.

## 30.8 P17

```text
P17 = PATH Studio + Engine Expansion
Codex will become default primary engineering engine across PATH Code / PATH Builder / PATH Studio
Cursor remains available non-default/delegated
P17 is NOT implemented in this tranche
```

## 30.9 Cloud working style

Codex Cloud receives broad branch autonomy, fixes ordinary defects, and returns the completed tranche. No pass-by-pass owner interruption unless a genuine Owner Gate is reached.

---

# 31. Final architecture verdict

Version 2 is the **single governing architecture and implementation specification** for the PATH Builder P13.4→P16 Cloud tranche.

The system boundary is coherent:

```text
P9 credential/config authority
        ↓
P10 canonical deployment/source foundation
        ↓
P11 stable verified domain truth
        ↓
P12 typed external-service connections
        ↓
P13 database authority
        ↓
P14 Supabase Auth orchestration
        ↓
P15 Stripe hosted-Checkout configuration
        ↓
P16 canonical-web-artifact native packaging
```

The document intentionally resolves the repository mismatches discovered during independent review without allowing them to become architecture expansion:

- Linux Cloud works around package platform metadata; product platform constraints stay intact.
- `pg` is explicitly approved and stale tests are corrected.
- localhost mutation security is hardened once, centrally.
- secret backends are represented honestly rather than papered over.
- callback/webhook URLs rely on stable domain truth rather than changing deployment URLs.
- P12 is extended for Stripe without schema redesign.
- Supabase Auth mutation has an exact field allowlist and provider drift guard.
- cross-plane references receive narrow coordinator integrity guards, not a new graph system.
- native packaging reuses canonical source/environment machinery and bounds execution of product code.
- P13.1–P13.3 remain protected.
- Engine Fabric remains untouched so P17 can introduce Codex-primary execution deliberately across PATH Code, PATH Builder and PATH Studio.

The required next action is therefore **not another architecture pass**. It is to give this exact Version 2 document to Codex Cloud on an isolated branch and let it implement the full tranche.

Tomorrow's engineering work begins from the completed Cloud branch: whole-tranche review → one independent review → one consolidated correction/hardening mission → local/provider live gates → final acceptance/freeze.

---

**END — PATH Builder P13.4 → P16 Master Architecture & Codex Cloud Implementation Specification — Version 2**
