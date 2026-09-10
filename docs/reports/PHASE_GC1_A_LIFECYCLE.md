# PATH CODE — PHASE GC1-a CLOUD WORKSTATION LIFECYCLE & AUTHENTICATION

**Result: PASS**

```text
PHASE GC1-a GOOGLE CLOUD WORKSTATION LIFECYCLE IMPLEMENTED
— IMPERSONATED ADC, NO JSON KEY, CONTROL SA NEVER IN THE WORKSTATION
— DUAL-STAGE READINESS: LIFECYCLE + AUTHENTICATED REMOTE ROUND-TRIP
— CLUSTER AND WORKSTATION COSTS DISCLOSED SEPARATELY; FENCES ENFORCED (POOL=0, IDLE=900s, RUN=3600s)
— ORPHAN RECONCILIATION + IDEMPOTENT TEARDOWN; R2-K CLEAN
— CANONICAL SUITE ON MOCK TRANSPORT, $0, ZERO GCP CALLS
— ENGINE UNTOUCHED (src/** ZERO-DIFF)
```

---

## SHA discipline

| Concept | Value | Meaning |
|---|---|---|
| **PS1-INLINE IMPLEMENTATION SHA (dispatch base)** | `e4e89e9ce9da3edc5e2e2d9db4b28941359019f0` | Banked PS1-INLINE tip used as branch point (`--no-track` fresh worktree) |
| **Fresh worktree** | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase-gc1a` | One agent per worktree; not a shared tree |
| **Branch** | `cursor/phase-gc1a` | Created from the PS1-INLINE IMPLEMENTATION SHA above |
| **IMPLEMENTATION SHA** | `0485bd71920bfd1939f4ea0c29399bec631ad519` | Initial GC1-a lifecycle engine + GC1A-A…H/P1 |
| **AUTH-HEADER BUGFIX SHA** | _(filled after commit)_ | Bearer attachment fix + GC1A-I + report update |
| **BRANCH TIP SHA** | `git rev-parse HEAD` on `cursor/phase-gc1a` | Tip after any docs-only commits |
| **Main** | `d997ae13185013b4312755c38da4cd7099041621` | **Unchanged**. No push. No merge. |

---

## Zero-diff proof — `src/**` engine boundary

| Check | Result |
|---|---|
| `git diff HEAD -- src/` / `SRC_DIFF_BYTES` | **0** (proven at focused suite and at canonical check) |
| Touched paths | `scripts/pathcode-cli/gc1/**`, `scripts/gc1-live-smoke.mjs`, `tests/gc1/**`, `package.json` / `package-lock.json` (`optionalDependencies` only), this report |
| Engine modules (`src/**`) | **not modified** |

---

## Verified infrastructure constants (committed)

| Constant | Value |
|---|---|
| Project ID | `path-code-gc1-260910` |
| Region (LOCKED) | `europe-west4` |
| Control SA | `pathcode-gc1-control@path-code-gc1-260910.iam.gserviceaccount.com` |
| Runtime SA | `pathcode-gc1-runtime@path-code-gc1-260910.iam.gserviceaccount.com` |
| Cluster | `pathcode-gc1-cluster` |
| Config | `pathcode-gc1-config` |
| Probe workstation | `pathcode-gc1-probe` |
| Machine type | `e2-standard-2` (no persistent disk in GC1-a) |

**IAM note honored:** `roles/workstations.user` is **not** granted at project scope. GC1-a performs **no IAM mutations**. If a resource-scoped grant is later required, that is STOP-AND-REPORT (not applied here).

---

## Authentication — impersonation only

- Path: Application Default Credentials → `google-auth-library` `Impersonated` targeting the **Control SA**.
- Static SA JSON keys are **refused** (`keyFilename` / `credentials` / `keyFile` → `GC1_AUTH_IMPERSONATION_UNAVAILABLE`); no fallback to a key; no billable work on auth failure.
- Token refresh lives in the control-plane auth client only.
- Identity separation: Control SA authenticates the control plane; workstation config `host.gceInstance.serviceAccount` is the **Runtime SA**. Control SA email/token never appears in workstation-facing payloads (GC1A-H).

### Live-smoke bugfix — missing Authorization header

**Symptom:** first real Workstations REST call returned `401 CREDENTIALS_MISSING` after successful impersonation / `reconcileStartup()`. A raw curl with the same impersonated bearer against the same endpoint succeeded — IAM and credential were fine.

**Root cause:** `google-auth-library` `getRequestHeaders()` returns a Fetch `Headers` instance. The transport did `{ ...headers }` into the fetch init; `Headers` has no enumerable own properties, so the spread was `{}` and **no `Authorization` was attached**.

**Fix:**
- `headersToPlainRecord` / `buildBearerAuthHeaders` in `auth.mjs` — always force `Authorization: Bearer <token>` via `getAccessToken()`.
- Every Workstations REST call goes through a single `authedFetch` helper that refuses to send without a Bearer (except the intentional GC1A-I falsification hook).
- Auth headers win over `init.headers` so a caller cannot strip Bearer.

**Proof:** GC1A-I (+ falsification) — $0 mock `fetch`; every REST method must attach Bearer; weaken omit on `getCluster` fails the proof; restore by hash.

---

## Transport abstraction — $0 canonical rule

| Implementation | Role |
|---|---|
| `WorkstationTransport` | Narrow create/get/list/start/stop/delete + `executeCommand` |
| `MockWorkstationTransport` | Deterministic in-memory state machine; **all** canonical/unit tests |
| `GcpWorkstationTransport` | Real REST + impersonated ADC; **only** via live smoke when `GC1_LIVE_SMOKE=1` |

Hard rule proven by GC1A-G: canonical suite constructs zero real transports, makes zero network calls, spends $0.

### Libraries (live path only)

| Package | Version | Where loaded |
|---|---|---|
| `google-auth-library` | **11.0.2** (pinned in `optionalDependencies`) | Dynamic import inside `auth.mjs` → used by `GcpWorkstationTransport` / live smoke only |
| `@google-cloud/workstations` | **not added** | Thin REST via `fetch` against `https://workstations.googleapis.com/v1` |

`optionalDependencies` (not `dependencies`) preserves prior architecture gates that require `package.json` `dependencies: {}`. Mock + lifecycle never import the auth library.

---

## Cost model — cluster ≠ workstation

| Surface | Resource | Billing | GC1-a behavior |
|---|---|---|---|
| **CLUSTER (standing)** | `pathcode-gc1-cluster` | **Hourly while it exists**, independent of any workstation | Never auto-created by probe/task path; `ensureClusterAndConfig()` is a deliberate disclosed act (live smoke announces creation); teardown of probe never deletes the cluster |
| **CONFIG** | `pathcode-gc1-config` | Cheap/free template | Created with cost fences baked in |
| **WORKSTATION (per-task)** | `pathcode-gc1-probe` | **While RUNNING** | Cost fences enforced + asserted (GC1A-B) |

### Cost fences (exact)

| Fence | Value |
|---|---|
| `poolSize` | `0` |
| `idleTimeout` | `"900s"` |
| `runningTimeout` | `"3600s"` |

### Cluster teardown (operator; stops standing charge)

```bash
gcloud workstations clusters delete pathcode-gc1-cluster \
  --project=path-code-gc1-260910 --region=europe-west4 --quiet
```

Or: `GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud --teardown-cluster`

---

## Lifecycle manager

Module: `scripts/pathcode-cli/gc1/lifecycle.mjs`

| Method | Behavior |
|---|---|
| `reconcileStartup()` | Lists GC1-owned (`pathcode-gc1-*`) workstations; stop/delete orphans; **never** deletes cluster/config; reports reclaimed IDs |
| `ensureClusterAndConfig()` | Verifies cluster/config; creates only if missing (disclosed); bakes cost fences + Runtime SA |
| `startProbeWorkstation()` | Starts probe → waits for `STATE_RUNNING` = **LIFECYCLE READY**; does **not** create the cluster |
| `verifyExecutionReadiness()` | One authenticated `echo HEALTH_CHECK_OK` round-trip = **EXECUTION READY** |
| `acquireProbeWorkstation()` | Returns workstation only when **both** stages pass (unless P1 weaken hook) |
| `teardown()` | Idempotent dispose of **probe only**; SIGINT/SIGTERM/uncaughtException → async cleanup; handlers detached; timers cleared (R2-K) |

**Deadline / stuck-state:** bounded poll deadline; never-ready → force stop/delete → `GC1_WORKSTATION_NOT_READY` (never left running to bill).

**Dual-stage readiness:** `STATE_RUNNING` alone is insufficient. Execution-ready requires the command channel to return exact `HEALTH_CHECK_OK`.

---

## Operator live smoke (real GCP; not run in this pass)

```bash
GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud
```

Prerequisites: local ADC; `roles/iam.serviceAccountTokenCreator` on Control SA; Control SA has `workstations.admin` + `serviceUsageConsumer`; Control SA has `iam.serviceAccountUser` on Runtime SA; **no JSON key**.

Without `GC1_LIVE_SMOKE=1` **and** `--confirm-cloud`, the entrypoint prints prerequisites and exits without touching GCP.

This bugfix pass: **zero live GCP calls**. Operator re-runs the smoke to verify europe-west4 end-to-end with Bearer attached.

---

## Proofs — GC1A-A…H + P1 + GC1A-I

Focused file: `tests/gc1/lifecycle.test.ts` (**16/16 PASS**). Canonical path uses `MockWorkstationTransport`; GC1A-I exercises `GcpWorkstationTransport` against a **mock fetch** ($0, zero real GCP).

| Proof | Result |
|---|---|
| **GC1A-A** | Mock lifecycle observes CREATING → STATE_STARTING → STATE_RUNNING → STATE_STOPPING → DELETED |
| **GC1A-B** | Config create payload exact fences: poolSize 0, idle 900s, run 3600s |
| **GC1A-C** | Probe path does not `createCluster`; teardown/reconcile preserve cluster/config |
| **GC1A-D** | Orphan `pathcode-gc1-*` reclaimed; non-GC1 workstation untouched |
| **GC1A-E** | Lifecycle-ready + failed command channel → `GC1_EXECUTION_NOT_READY`; acquire refuses |
| **GC1A-F** | Double teardown / partial startup / SIGINT clean; zero dangling timers/handlers (R2-K) |
| **GC1A-G** | Without `GC1_LIVE_SMOKE=1`, `GcpWorkstationTransport` throws `GC1_LIVE_SMOKE_FORBIDDEN`; mock networkCalls=0 |
| **GC1A-H** | Runtime SA in config; Control SA absent from workstation-facing payloads |
| **P1** | `weakenReadinessGate: true` hands back lifecycle-only station (GC1A-E defect); honest path refuses; `lifecycle.mjs` SHA-256 unchanged |
| **GC1A-I** | Every REST method attaches `Authorization: Bearer`; proves Headers-spread defect class; `$0` mock fetch |
| **GC1A-I falsification** | `weakenAuthAttachment: true` omits Bearer on `getCluster` → proof fails; `gcp-transport.mjs` hash unchanged on restore |

### Content hashes (auth-header bugfix working tree)

| Path | SHA-256 |
|---|---|
| `scripts/pathcode-cli/gc1/auth.mjs` | `3b3e254b451a4a02f4dd4db3d3416d078743c3365a654d80bcbe3a032c1f71ae` |
| `scripts/pathcode-cli/gc1/gcp-transport.mjs` | `35e35cfe3f4afcff2f30266f4d98e4e1189d29f7240a0f17a5524bb6781b8d64` |
| `tests/gc1/lifecycle.test.ts` | `bda8d759ce206bd11915e58497451059b7fe85b859ba028d67cddab7d472bf82` |

---

## Validation

| Gate | Result |
|---|---|
| Focused GC1A suite | **16/16 PASS** (includes GC1A-I + falsification) |
| `npm run typecheck` / `build` | **PASS** |
| Vitest | **1167/1167 PASS** (121 files) |
| `cli:smoke` / `ledger:verify` | **PASS** |
| Live GCP calls in this bugfix pass | **zero** (operator re-runs smoke) |
| JSON key material | **none** |
| IAM mutations | **none** |
| Push | **none** |

**Causal correction (first check):** root architecture tests require `dependencies: {}`. `google-auth-library@11.0.2` was placed in `optionalDependencies` so the live smoke can load it without violating those gates or pulling auth into the mock path.

**Auth-header bugfix:** `Headers` object-spread → missing Bearer; fixed via `buildBearerAuthHeaders` + single `authedFetch`; GC1A-I prevents regression in canonical ($0).

---

## FINDINGS LOG (non-blocking)

1. **No REST execute-command API** on Cloud Workstations. Live execution-ready channel uses `gcloud workstations ssh --command=…`. Mock simulates the channel in-process.
2. **`@google-cloud/workstations` not added** — thin `fetch` REST keeps the dependency surface to `google-auth-library` only.
3. **`roles/workstations.user` project-scope grant** remains forbidden; not attempted. If SSH IAM proves insufficient at live smoke time, that is operator STOP-AND-REPORT for a resource-scoped binding — out of GC1-a scope.
4. **Cluster standing charge** persists after probe teardown by design; operator must run the documented cluster teardown when finished with GC1 work.
5. **Vitest 5s default** is tight for general-session git fixtures on a busy host; recorded as one-off contention, not a GC1 defect.
6. **Live smoke 401 CREDENTIALS_MISSING** was transport header attachment (`Headers` spread), not IAM — fixed under GC1A-I; operator re-run required.

---

## HARD-STOP checklist

| Condition | Status |
|---|---|
| `src/**` engine edit | **No** — `SRC_DIFF_BYTES=0` |
| Canonical-path construction of real transport | **No** — GC1A-G |
| Billable resource creation during tests | **No** — mock only; networkCalls=0 |
| JSON key write / project-scope `workstations.user` grant | **No** |

---

## Operator next step

```bash
GC1_LIVE_SMOKE=1 node scripts/gc1-live-smoke.mjs --confirm-cloud
```

Then STOP for GC1-b (hydration / toolchain) — not in this pass.
