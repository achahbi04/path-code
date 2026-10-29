# PATH BUILDER — P13.4 → P16 CLOUD TRANCHE REPORT

This is implementation evidence for review, not stage acceptance or permission to merge. No production deployment, live Supabase mutation, Stripe resource creation, signing or store submission was performed.

## A–D. Source and untouched Linux baseline

- Accepted baseline: `5638ac85bf7edfbca9eb1f1df8da223ee033be03`.
- Repository: `achahbi04/path-code`; checkout `/workspace/path-code`, isolated Codex cloud machine.
- Cloud-assigned branch: `work`; it started at the exact accepted SHA. The accepted branch was not changed, pushed or merged.
- Linux x86_64; Node 24.19.0; npm 11.9.0. Existing checkout used; no additional development worktree created.
- Governing Version 2.1 specification was the first tranche commit: `d344070`, preserving the upload verbatim. For the final branch-wide whitespace check, six Markdown two-space line breaks are replaced by equivalent `<br>` breaks in the closure documentation commit; specification wording is unchanged and the verbatim original remains in the first commit.
- Untouched source baseline after that documentation-only commit: **2,069 passed / 34 failed / 0 skipped**, 2,103 tests. Typecheck and build passed. `npm ci --force` passed, with TLS and lockfile integrity verification retained. macOS/arm64 package metadata and approved `pg` dependency were preserved.
- The actual measured baseline differs from the specification's historical 2,052/51 result. `p13-4-p16-evidence/BASELINE_FAILURES.json` identifies every observed failing test; `baseline-vitest.json` retains full runner evidence.

## E. Bounded architecture adaptations

1. P9 rejected all public-prefixed secret names, contradicting the explicit P14 requirement for framework-prefixed publishable-key **references**. A concrete compatibility exception allows exactly `VITE_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`; arbitrary public-prefixed secrets remain rejected.
2. The scrubbed product environment could not reach npm on this managed host (`EAI_AGAIN`). Build mode now permits noncredential HTTP(S) proxy URLs and host CA-bundle settings, rejecting authenticated proxy URLs and product overrides of those transport controls. Spawn/preview inheritance stays unchanged. The affected npm operation then passed without weakening TLS.
3. Artifact scanning distinguishes private secret values from ordinary config and the three intentionally public client-key variables. Public client keys may occur in their intended client bundle, while their values remain absent from Build authority, events, objectives and management responses. Known private-key prefixes are still rejected in artifacts.
4. Explicit reconciliation can discard a prepared, no-effect Auth operation even after credential removal, and can clean a stale native preparation after source/environment changes. This prevents locally stuck pending operations without retrying external effects.

These are narrow corrections inside the frozen authorities, not a new secret store, OAuth platform, provider proxy, dependency graph, source authority, coordinator, preview isolation system or Engine Fabric.

## F. P13.4 Database experience

Added the Database rail and management dialog, safe catalog/list/read projections and flat mutation/observation routes. Browser credential selections use P9 variable names; canonical refs are resolved server-side. The experience covers existing/project-provisioned identities, provider targets, management/database URL bindings, explicit verification, explicit region discovery, two-step billing-acknowledged provisioning, explicit provisioning observation and migration observation. Delete requires external-retention acknowledgement and does not delete a provider project.

Historical observations are displayed separately from current credential usability. Refresh performs observational list/read requests. Database deletion is guarded at the coordinator when Auth or Payments references it. Objectives receive safe database facts and variable names.

Synthetic HTTP evidence proves prepare makes zero provider creation calls, execute makes exactly one, a repeated stale execute cannot create again, and explicit observation closes the operation. The accepted owner's P13 live fixture was not available in this cloud machine.

## G. P14 Authentication

Added strict legacy-empty Auth authority, CRUD/revisions, P13 database/environment coupling, stable verified P11 domain or explicit-URL intent, email/Google/GitHub configuration, framework-specific publishable-key readiness, variable-based social-secret selection, factual projections and the Authentication dialog.

The adapter uses the shared fixed-host Supabase request transport. GET responses reduce to owned safe fields; provider secrets contribute presence booleans only. Digests are independent of property order. PATCH permits exactly the eleven specified fields. Durable prepare binds P14/P13/P9/domain revisions and desired/observed digests. Execute performs a fresh GET, blocks drift before PATCH, records effect-started, sends changed owned fields once, and rechecks credentials/authority afterward. Uncertain outcomes remain visible and are reconciled explicitly; no hidden PATCH retry occurs.

## H. P15 Payments

Extended P12 with Stripe's required `secret_key` role and one bounded read-only `/v1/account` request. Account identity and `stripe.mode.test/live` capabilities are reduced without adding fields to P12 verification or inferring Checkout/subscription capability. Restricted/invalid keys become credential action-required.

Added strict payment config CRUD, existing Price ID and path validation, frozen event sets, stable URL selection, optional Auth/database dependencies, coordinator deletion guards, safe objectives and Payments dialog. Readiness distinguishes local account verification/mode, Vercel runtime-key presence, webhook-key presence, endpoint metadata and dependencies. Existing Vercel presence authority can remain **unknown**; the UI does not turn a locator or local key into verified production presence. No cross-backend key identity proof is claimed.

Webhook creation is deliberately manual. The safe endpoint ID and expected URL/events can be configured; this tranche does not implement the optional read-only Stripe endpoint observer or claim webhook delivery has been proven.

## I. P16 Mobile/native

Added strict native profile authority with explicit `buildEnvironmentId`, app identity, platform set, exact Capacitor 8.5.3 policy, auth callback readiness, durable prepare/run/history/artifact state, guarded HTTP routes and Mobile dialog.

Canonical Git blobs reuse the P10 materializer with a bounded native namespace, plus retained-source revalidation. Candidate/restore guards, matching lockfile requirements and frozen npm/pnpm/yarn/bun command planning precede execution. Build mode reuses the selected-product resolver, supplies no invented PORT/HOST, refuses any Vercel-backed build secret and performs no environment substitution.

Long install/build/add/sync work runs outside the coordinator's exclusive gate. Processes use argv arrays and no shell option, deadlines, output caps, whole-workspace disk checks, owned-group termination and reduced failures. A private IPC execution guard terminates the creator process group if its coordinator dies; a real crash-injection regression proves the command is no longer running afterward. Native workspaces bootstrap exact packaging-only dependencies without rewriting product source. Static `index.html` output is required, including actual Next static export. Artifacts reject symlinks and private secret material; safe files receive SHA-256 checksums. Retention is bounded to three per profile and a total-size cap. Explicit recovery interrupts orphan runs and cleans stale preparations. Source/adoption/restore changes project artifacts as stale; profile identity updates also invalidate retained artifacts. Native Auth readiness requires a publishable-key binding in its own build environment, independently of the production Auth environment. Social credential removal degrades Auth management readiness. Explicit profile deletion cleans retained artifacts.

Real coordinator evidence, rerun after the crash guard was added, used a disposable canonical Git fixture, actual npm installation and Capacitor Android add/sync: source SHA matched, 69 files / 330,665 bytes retained, operation completed. This is scaffold/sync evidence, not APK or signed binary compilation.

## J–L. Shared security and protected-stage compatibility

- Central `/api/*` Host/port, non-GET Origin, Fetch-Site, nonempty JSON content type and 256 KiB body protection runs before mutation.
- Existing bodyless lifecycle POSTs work; the separate reference-upload transport and cap remain functional.
- Browser requests cannot introduce refs/provider transport; selectors resolve canonical identities at the server. No credential values are persisted by the new planes.
- P9/P12 admission, matching P13 database-label admission, and event redaction cover `rk_test_`, `rk_live_`, `whsec_`, `sb_secret_`, preserving existing protections.
- P13/P12/P14 deletions receive specific coordinator guards; legacy dangling dependencies project action-required. No generic graph was added.
- Supabase transport gained a bounded method/body extension; existing P13 verification remains GET and retains its error/verification behavior.
- P10 materialization retains default namespace/error contracts. Its 54-test regression run passed.
- P9 build-mode additions and exact public-key compatibility are the only credential/runtime extensions. P9–P13 authorities were not redesigned.
- Engine routing files are unchanged. P17 is not implemented. No Deploy or Domains dialog was introduced.

### Explicit security checklist

- [x] Local Host/bound-port validation; non-GET same-origin validation; unsafe Fetch-Site rejection.
- [x] Nonempty JSON content-type enforcement and 256 KiB cap; bodyless lifecycle POSTs and dedicated reference uploads preserved.
- [x] Foreign-origin protection described honestly; same-origin preview isolation remains debt.
- [x] New authorities persist P9 references/variable identities, not private credential material.
- [x] Browser projections exclude secretRefs; variable-based forms contain no provider-key/password value inputs.
- [x] New events/objectives/reports contain reduced facts; no local/session credential persistence was added.
- [x] Stripe restricted-key/webhook and Supabase secret prefixes participate in admission/redaction.
- [x] Fixed provider hosts/endpoints, bounded deadlines/body sizes, strict response reduction and exact P14 PATCH fields.
- [x] Fresh provider GET/drift comparison precedes one possible PATCH; no hidden mutating retries or direct browser-provider requests.
- [x] Specific P13/P12/P14 deletion guards; dangling or malformed Auth dependencies degrade safely; no generic graph.
- [x] Canonical Git materialization only; candidate/restore guards; retained source revalidated before execution.
- [x] Matching lockfile/frozen installation for dependency-bearing products; static products with no package manifest need no product dependency installation.
- [x] Explicit dedicated build environment; Vercel-backed entries rejected; no fallback or variable dropping.
- [x] Build mode reuses exact selected-product authority and `.env.local` safety without fake PORT/HOST; preview mode preserved.
- [x] Host engine/provider credentials stripped. Build-only noncredential proxy/CA controls retain TLS verification.
- [x] Argv spawn, no shell option; deadline/output/whole-workspace disk caps and owned-process-group cleanup.
- [x] Long external work outside the coordinator gate; explicit orphan interruption and cleanup; no hidden resume.
- [x] Exact four-package Capacitor 8.5.3 pins; native generated trees stay artifacts, not source authority.
- [x] Private artifact secret scan, SHA-256 checksums, bounded retention, stale source/profile handling and explicit cleanup.
- [x] P9–P13 preserved apart from the documented narrow compatibility/security adaptations; no Engine Fabric changes.
- [ ] Live Supabase Auth, social-provider, Stripe Checkout/webhook and production-runtime presence acceptance: owner/live gates.
- [ ] iOS/Android binary compilation, signing and store acceptance: local toolchain/owner gates.

## M–N. Protected test changes

The three obsolete zero-runtime-dependency assertions now allow exactly `{ pg: "^8.23.1" }` in `tests/cli/package.test.ts`, `tests/general-session/architecture.test.ts` and `tests/adapters/openai/architecture.test.ts`.

Three exact P12 catalog-array assertions now include GitHub + Stripe: two in `build-integrations.test.ts` and one in `build-integrations-ux.test.ts`. One production adapter-registry assertion in `build-integration-verification.test.ts` also includes Stripe. These four occurrences exceed the frozen review’s shorthand count of two; each was directly invalidated by the required provider/adapter addition. Existing empty-registry, rejected-provider, credential-role and GitHub behavior checks remain intact. No assertions were disabled or made vacuous. New readiness tests also cover missing canonical source, malformed referenced Auth authority, missing native client-key bindings, social-credential unbind and profile-bound artifact staleness.

### Test inventory

The new unit file has 46 cases across stage-owned and shared groups. The complete-surface file has six HTTP tests, and the guarded-provider file has two, for **54 new tests**. The versioned Chromium harness additionally saves all four configuration types, updates an existing database target without a rename and checks phone-width layout without JavaScript errors. It is not counted as a Vitest test.

| New test group | Cases | Scope |
|---|---:|---|
| P14 authentication authority and provider contract | 11 | Auth authority, drift, safety and provider transport |
| P15 payments | 5 | Stripe catalog, readiness, refs, config, reduction |
| P16 native authority | 8 | Profiles, canonical source, envs, frozen commands, bounds and recovery |
| Shared and final hardening groups | 22 | P14/P15/P16 races, freshness, redaction, real crash containment, artifact roles and retention |
| Complete Builder HTTP surface | 6 | Shared ingress plus P13.4 lifecycle/projection, legacy-empty and browser boundary |
| Guarded provider HTTP | 2 | P13.4 prepare/execute/observe and P14 social-variable projection |

## O–S. Files, commits and validation

Validated implementation SHA: `5387e0845d2ce4b469b9cd959e4085b7e5f17d59`. Final closure commit adds documentation/evidence and the equivalent Markdown line-break formatting only.

```text
d344070 docs(builder): record governing P13.4 through P16 specification
f6d1cda feat(builder): implement database UX, auth, Stripe payments and native packaging
b83dbf2 fix(builder): canonicalize Auth digests and enforce native workspace limits
148efa9 fix(builder): distinguish private artifact secrets from public build inputs
b22558a fix(builder): validate creator save flows and dependency readiness
878b238 fix(builder): keep credential and artifact readiness contextual
5387e08 fix(builder): terminate native commands when coordinator ownership is lost
```

| Check | Result |
|---|---|
| Untouched Linux full suite | 2,069 passed / 34 failed / 0 skipped |
| Final Linux full suite | **2,126 passed / 31 failed / 0 skipped** |
| New failing cases | **0** |
| Resolved baseline failures | 3 approved pg assertions |
| Missing baseline cases | 0; two renamed passed P12 titles explicitly normalized |
| New P13.4–P16 tests | **54 passed / 0 failed / 0 skipped** |
| Typecheck / build | PASS / PASS |
| Built CLI smoke / canonical ledger | PASS / PASS at tested implementation SHA |
| Chromium creator save flows / phone layout | PASS; no browser JavaScript errors |
| Real native Android add/sync via coordinator | PASS; 69 files / 330,665 bytes, SHA-256 records and canonical source match |
| Real coordinator-crash containment | PASS; creator command no longer running |
| Branch-wide whitespace check | PASS after equivalent formatting of six imported Markdown hard breaks |

The full test command correctly exits **1** for the remaining baseline failures; it is not described as a green whole-repository suite. Of the remaining 31 cases, **29 are ENVIRONMENT_LIMITATION** and **2 are CONFIRMED_DEFECT** in pre-existing fixtures/behavior. `FINAL_TEST_DELTA.json` lists every case, classification and resolved case. There were no missing baseline tests and no skips.

Protected regression counts extracted from that same final full run:

| Plane | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| P9 | 3 | 19 | 0 | 0 |
| P10 | 5 | 54 | 0 | 0 |
| P11 | 2 | 58 | 0 | 0 |
| P12 | 4 | 32 | 0 | 0 |
| P13 | 4 | 45 | 0 | 0 |

The remaining confirmed baseline failures are `gc1c-session-integration.test.ts` (missing expected mock artifact-saving event) and `build-running-identity.test.ts` (disposable copied checkout lacks installed pg). Neither was introduced by this tranche; Engine Fabric and unrelated fixture architecture were preserved. The README mechanical-probe failure is classified as a host limitation after confirming Git initializes `master` while that fixture assumes `main`.

Reproduction:

```bash
npm ci --force
npm run typecheck
npm run build
npm test
npm run cli:smoke
npm run ledger:verify
node tests/s5/fixtures/product-operations-browser.mjs /tmp/path-builder-browser-evidence
git diff --check 5638ac85bf7edfbca9eb1f1df8da223ee033be03 HEAD
```

Use macOS Apple Silicon for the later full native `npm run check` acceptance. The browser harness uses `/usr/bin/chromium` when present, otherwise the installed Playwright Chromium.

Complete changed-file inventory is in `p13-4-p16-evidence/FILES_CHANGED.txt`, including implementation, protected test edits, governing specification, screenshots and evidence.


## T–Y. Consolidated closure ledger

Each item has exactly one classification. The documentation-gap and live-acceptance labels below are descriptive tags inside the user's five required categories, not extra classifications.

| ID | Classification | Remaining fact/action | Acceptance affected | Merge/review consequence | P17 consequence |
|---|---|---|---|---|---|
| BASELINE | CONFIRMED_DEFECT | Pre-existing non-host fixture failures remain identified individually in the baseline/final delta; no new-plane defect is hidden in this group. Three stale pg failures were corrected. | Full repository acceptance; not a new P13–P16 failure | Review existing failures explicitly | None introduced |
| OG14-01 | OWNER_GATE | Supply a Supabase management credential with Auth read/write/project-admin permissions through P9; authorize live GET/drift/PATCH acceptance on a disposable project. No values in chat. | P14 live closure | Blocks live closure, not repository implementation review | None |
| OG14-02 | OWNER_GATE | Supply/authorize Google and GitHub OAuth client accounts/secrets and validate their callback behavior. | P14 social live closure | Live closure pending | None |
| OG15-01 | OWNER_GATE | Existing Stripe account/read-permitted test/live keys and existing Price IDs must be provided through P9. | P15 provider closure | Live closure pending | None |
| OG15-02 | OWNER_GATE | Owner configures webhook endpoint and production runtime/signing secrets in P9/Vercel; hosted Checkout, verified webhook delivery and durable fulfillment need live acceptance. | P15 closure | No readiness inferred from local verification | None |
| OG16-01 | OWNER_GATE | Apple/Android signing identities, accounts and any paid or irreversible delivery action remain owner-controlled. | P16 signed/store delivery | No store submission authorized/performed | None |
| ENV01 | ENVIRONMENT_LIMITATION | The public engineering CLI rejects Linux x64 by design; macOS Apple Silicon support metadata is unchanged. | Full local CLI acceptance | Expected baseline limits remain explicit | No routing change |
| ENV02 | ENVIRONMENT_LIMITATION | macOS/Xcode and Android SDK/Studio compilation/signing were not available/proven here. Linux Android scaffold/sync is proven. | P16 native binary acceptance | Requires local toolchain acceptance | None |
| ENV03 | ENVIRONMENT_LIMITATION | Baseline includes unavailable AG1 venv/bootstrap, home-directory sandbox and platform-gated tests. Exact test names are in the evidence. | Full repository/macOS acceptance | Do not treat expected host failures as new defects | None introduced |
| DEBT01 | NONBLOCKING_DEBT | Product preview is same-origin with the Builder API; separate-origin preview is future hardening. The ingress guard is foreign-origin protection only. | Future hardening | Not represented as isolation | Preserve boundary |
| DEBT02 | NONBLOCKING_DEBT | No cross-backend identity proof for Stripe runtime key. | Future secret-backend assurance | Already exposed truthfully in readiness | None |
| DEBT03 | NONBLOCKING_DEBT | Stable Vercel production-alias support remains outside this tranche; explicit URL/verified P11 domain is used. | Future URL convenience | No blocker for frozen URL contract | None |
| DEBT04 | NONBLOCKING_DEBT | DOCUMENTATION_GAP: the historical roadmap calls P17 PATH Studio only; canonical future scope is PATH Studio + Engine Expansion / Codex-primary Fabric migration. Historical roadmap left unchanged. | Future documentation cleanup | No Engine Fabric change authorized here | Carry into P17 planning |
| DEBT05 | NONBLOCKING_DEBT | Optional Stripe endpoint read-only observation is not implemented; webhook/provider acceptance remains manual and explicitly pending. | Optional provider diagnostics | No webhook verification claim | None |
| AP13 | ACCEPTANCE_PENDING | Validate final Database UX against the owner's previously accepted live P13 fixture. | P13 final acceptance | Owner/local UX review required | None |
| AP14 | ACCEPTANCE_PENDING | Live Auth, provider-side dashboard drift, social sign-in and actual framework client runtime acceptance. | P14 | No CLOSED/PROTECTED claim | None |
| AP15 | ACCEPTANCE_PENDING | Stripe test/live mode, hosted Checkout, stable callback URL and webhook fulfillment acceptance. | P15 | No CLOSED/PROTECTED claim | None |
| AP16 | ACCEPTANCE_PENDING | Xcode/Android binary build, auth deep links, hosted Checkout return links, signing and local artifact-open acceptance. | P16 | Scaffold evidence is bounded | None |
| APMAC | ACCEPTANCE_PENDING | Full native macOS `npm run check`, followed by whole-tranche and independent review and one consolidated correction mission. | Full tranche closure | Required before acceptance/freeze | Preserve future boundary |

No stage is marked CLOSED/ACCEPTED/PROTECTED by this report.

## Z. Secret-safety evidence

Tests exercise real coordinator-death process containment, provider response reduction, ref rejection at HTTP ingress, safe P9 variable projections, material-change races, event prefix redaction, selected child-env credential stripping, and refusal of private values in artifacts. Real native execution retained checksums and source identity only. Raw child stdout/stderr and provider responses are not retained by the new planes. Public Supabase publishable keys are intentionally client-bundle material; their management values still remain absent from records/objectives/events. No production credentials were supplied or copied into evidence. Synthetic credential sentinels in test names are fixtures. Native/browser proof projects were disposable and cleaned after validation; the evidence retains results and screenshots, not a signed app or an owner project.

## AA–AC. Review state, closure actions and stage status

Branch `work` remains unmerged and unpushed. All implementation is committed through `5387e0845d2ce4b469b9cd959e4085b7e5f17d59`; the following closure commit contains this report/evidence and documentation formatting. Source was clean after the completed test run. Final worktree cleanliness and the closure commit SHA are reported in the chat completion after committing these files. No production deployment or irreversible provider resource was created.

Recommended sequence: compare the governing specification and complete branch diff; review the baseline/final test delta and bounded adaptations above; run one independent tranche review; send confirmed corrections together; then resolve owner/live/local gates and execute the full macOS check. Do not merge, deploy, publish provider resources or freeze stages merely because cloud implementation tests pass.

- P13.4 / P13: **IMPLEMENTED — LOCAL FINAL UX ACCEPTANCE PENDING**; repository implementation requires review.
- P14: **IMPLEMENTED — LIVE GATE PENDING**.
- P15: **IMPLEMENTED — LIVE GATE PENDING**.
- P16: **IMPLEMENTED — LOCAL TOOLCHAIN GATE PENDING**.
