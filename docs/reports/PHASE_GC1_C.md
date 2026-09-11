# PATH CODE — PHASE GC1-C CONTINUOUS DRIVE

**Result: BLOCKED/PARTIAL — product surface corrected locally; live still operator-only**

```text
GC1-c LIVING PRODUCT SURFACE: LOCALLY GREEN
— Execution readiness: 2s interval / 180s deadline (was leaked 2×1ms test defaults)
— Transient SSH (exit 255 / Connection refused) retries; auth/config fail-closed
— ONE authoritative PATH projection (Complete illegal while Starting/Cleaning)
— In-place TTY owns stdout; raw Cloud preparation dumps suppressed while active
— MACHINE band: one-shot live toolchain query after Ready (no hardcoded versions)
— Focused proofs: gc1c-product-surface (+ readiness R1–R10 + machine)
— Canonical npm run check PASS — 137 files / 1280 tests
— Live model cycles NOT run: OPENAI_API_KEY absent in this agent environment
— Warm cluster + pathcode-gc1b-config-v4 preserved; no IAM/image rebuild
```

---

## Baseline verification (pre-edit)

| Check | Result |
|---|---|
| Worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase-gc1c` |
| Branch | `cursor/phase-gc1c` |
| HEAD (start) | `462a18dfb9e6395f6efdd4028d0f2707f4b1be2e` |
| Status | CLEAN |
| Frozen GC1-AB | untouched (this branch only) |

Baseline report (frozen): canonical PASS, 123 files / 1190 tests, 39 GC1 tests.

---

## Compatibility map

| Requirement | Actual file/function/type | Reused interface | Additive extension | Preserved proof |
|---|---|---|---|---|
| Process dispatch | `src/execution/execute.ts` → `runDetachedProcess` | `PreparedLocalProcess` / `LocalProcessResult` | ALS `runWithProcessObservationRunner` | Local unbound path identical; execution architecture tests |
| Validation → Gate 2 | `executeValidationPlan` → `executeEngineeringRun` → `evaluateExecutionEvidence` | Existing EngineeringRun identity | Bound runner supplies remote observations | Authentic-run registry / applicability |
| Mutation writes | `openEngineeringMutationSession` / `replaceExistingFile` | Recovery REQUIRED + checkpoint | `projectWriteEffects` + `authoritativeContentReader` | Recovery floor; write-boundary |
| Scope E/P | `admitScopePlan` editable/context | `ApprovedScope` | Optional `hydrationPaths` (H); E⊆H P⊆H | Existing scope-contract tests |
| Hydration | `createWorkspaceHydrator` / GC1-b | archive-init-snapshot | Exact H snapshot via `task-snapshot.mjs` | GC1B hydration / linked-worktree proofs |
| Transport / tunnel | `remote-exec.mjs` Control-SA tunnel | `WorkstationTransport.executeCommand` | Thin `remote-worker.mjs` v1 outside project root | GC1A I/O three-channel / readiness |
| Lifecycle | `createWorkstationLifecycleManager` | cost fences + Runtime SA | CLEANUP_PENDING journal gate | GC1A lifecycle suite |
| Living terminal | `session-events.mjs` / PS1-INLINE | existing event types | cloud lifecycle events + ANSI sanitize | R2-K heartbeat; renderer ≠ evidence |
| CLI | `scripts/pathcode.mjs` | `--model` / `--autonomy` | `--execution local\|cloud` | Local default unchanged |

### Draft design reconciliation

1. **GC1-AB “src zero-diff + operator smoke”** vs **GC1-c “living CLI continuous drive”**
   Reconciled by keeping GCP composition under `scripts/pathcode-cli/gc1/**` and authorizing only provider-neutral `src/` injection seams (process observation binding, mutation write/read effects, scope H). No second engine; no GCP imports in `src/`.

2. **“Validate-remote-only”** vs **“remote-authoritative workspace effects”**
   Reconciled by PATH-owned task workspace (never primary) + remote publish after READY checkpoint + remote process observation for validation. Primary tree is asserted unchanged; remote owns check evidence.

---

## Local / remote ownership

| Concern | Owner |
|---|---|
| Task admission, model gateway, scope, approvals, budgets, checkpoints, EngineeringRun, Gate 2, journal | Local control plane |
| Admitted project reads (post-admission), authorized text publishes, dependency install, validation processes | Remote task workspace via worker/tunnel |
| Recovery store bytes | Local durable store outside repo/workstation |
| Provider credentials / ADC / Control-SA tokens | Never transferred to workstation |

---

## E / P / H admission

- **E** = `editableTargets` (mutation kinds)
- **P** = `contextPaths` (provider-visible)
- **H** = optional `hydrationPaths`; when omitted, effective H = E ∪ P ∪ validation support files present in inventory
- Admission requires E ⊆ H and P ⊆ H when H is explicit
- Secrets, `.git`, `node_modules`, traversal, escaping symlinks refused at snapshot capture

---

## Snapshot protocol

1. After scope approval, `captureTaskSnapshot` hashes actual working-tree bytes for H
2. Materialize PATH-owned task workspace
3. Hydrate remote; verify content; install deps under disclosed strategy
4. Drift → refuse (fresh admission)
5. Bind taskId / snapshotId / manifestDigest / imageDigest / workstation identity in journal
6. Retain diff artifact before dispose; no silent rsync-back to primary

---

## Recovery ordering

`recoveryProtection=REQUIRED` unchanged. Sequence: currentness → preimage → durable READY checkpoint → authorized write (task ws + remote publish) → post-write observation. Checkpoint failure ⇒ zero publishes (proven in GC1C-E). After disposal, journal + checkpoint remain inspectable.

---

## Authentic-run binding

Object identity remains in the control-plane process. Remote observations enter only through `executeAuthorizedLocalProcess` → `issueLocalProcessResult` under a host-bound runner. Fabricated JSON from project output cannot mint Gate 2. Manual SSH remains diagnostic.

---

## Trust limits

- Allowlisted child env (R2-K); no `process.env` wholesale copy
- Credential canaries inspected on worker requests / env
- Runtime SA on VM; Control SA never attached to workstation
- Not advertised as hostile-code sandbox
- No IAM/VPC/firewall broadening in this drive

---

## Dependency effects

Reuse GC1-b `detectDependencyStrategy`. Install disclosed in cloud prep events. Script/lifecycle policy remains host-admitted; altered scripts cannot reuse stale admission (GC1C-B + existing validation admission).

---

## CLI event evidence

New truthful events (only when transitions occur):

`session.cloud.selected` → `session.environment.preparing` → `session.hydration` → (existing checkpoint/apply/validation/gate2) → `session.artifacts.saving` → `session.cleanup` / `session.cleanup.pending`

Human render sanitizes ESC as `\u001b`. Heartbeats remain liveness-only.

### Launch command for this checkout’s living cloud session

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-phase-gc1c
npm run build
node scripts/pathcode.mjs --execution cloud --autonomy bounded --model <model-id>
```

Trusted cloud disclosure shows pinned `pathcode-gc1b-config-v4`. Live GCP requires `GC1_LIVE_SMOKE=1` (transport construction gate). Provider key via env `OPENAI_API_KEY` or interactive hidden prompt.

Mock / canonical path (default in tests): inject `cloudTransport` or leave `skipLiveGcp` true.

Host-admitted live cancel probe (not model success):

```bash
GC1_LIVE_SMOKE=1 node scripts/gc1c-live-cancel-probe.mjs --confirm-cloud
```

---

## Proof / falsification matrix

| ID | Coverage | Status |
|---|---|---|
| GC1C-A | Backend / I/O / sentinel 17 | PASS (`gc1c-backend.test.ts`) |
| GC1C-B | Execution authority / injection refuse | PASS (`gc1c-authority.test.ts`) |
| GC1C-C | E/P/H + secrets/siblings | PASS (`gc1c-scope-snapshot.test.ts`) |
| GC1C-D | Snapshot consistency / drift | PASS (same) |
| GC1C-E | Recovery READY before publish | PASS (`gc1c-recovery.test.ts`) |
| GC1C-F | Authentic evidence surface | PASS (`gc1c-evidence.test.ts`) |
| GC1C-G | Credential canaries | PASS (backend) |
| GC1C-H | Cleanup pending blocks acquire | PASS (`gc1c-lifecycle-terminal.test.ts`) |
| GC1C-I | Living terminal / ANSI | PASS (same) |
| GC1C-J | Session freshness (fresh snapshot ids) | PASS (same) |
| GC1C-K | Durable journal / primary unchanged | PASS + session integration |
| GC1C-L | Regression floor markers | PASS (`gc1c-falsify.test.ts`) |
| Falsify | E⊆H / no local fallback / primary refuse — mutate→fail→restore by hash | PASS |

Session integration (mock cloud, no network): lifecycle event order + primary unchanged — PASS.

---

## Live attempts

| # | Attempt | Outcome |
|---|---|---|
| L0 | Credential presence (Cursor agent) | Absent in agent env — expected |
| L1 | Config inventory (read-only) | `pathcode-gc1b-config-v4` present; image pin matches; Runtime SA correct; fences preserved |
| L2 | Operator live begin (`gpt-5.6-terra`, canary seeded) | **FAILED** — `no writeRemoteFile` (transport capability gap). Not $0: leftover `pathcode-gc1-probe` STOPPED on legacy config; **deleted**; verified absence |
| L3 | Local transport fix + proofs A–L / F1–F5 | **PASS** — READY TO RETRY |
| L4 | Live accepted / honest-failure / cancel | **PENDING** operator credential-terminal retry |

### Unmet gates (exact)

1. **LIVE_ACCEPTED_CLI_CYCLE** / **LIVE_HONEST_FAILURE_CYCLE** / **LIVE_CANCELLATION** — blocked until operator re-runs live harness after transport fix.
2. Transport gap itself is **closed locally** (conformance before acquire; verified host-runtime delivery).

Cleanup state: workstation lists empty on both configs; cluster preserved; no CLEANUP_PENDING attributed after probe delete.

---

## Durable artifacts

- Journal root (runtime): `~/.pathcode/gc1c-journal/` (or test overrides)
- Synthetic fixture: `fixtures/gc1c-live/` (labeled synthetic; not PATH Code itself)
- Cancel probe script + intended artifact path under `/tmp/gc1c-cancel-*` (when run)

---

## Exact test totals

| Command | Result |
|---|---|
| Prior `npm run check` | **PASS** — 131 files / 1210 tests (pre-delivery tip) |
| `tests/gc1/` (post delivery fix) | **83 passed / 14 files** |
| `tests/gc1/gc1c-runtime-delivery.test.ts` | **18 passed** (A–L + F1–F5 + sentinel) |
| `git diff --check` | **PASS** |
| External calls in GC1 suite | **ZERO** GCP / provider |

---

## Remaining infrastructure (not invented pricing)

| Resource | State |
|---|---|
| Project `path-code-gc1-260910` | standing |
| Cluster `pathcode-gc1-cluster` | warm, preserved |
| Config `pathcode-gc1b-config-v4` | reused; image pin gc1b-v4 |
| poolSize | absent in describe JSON (unchanged by this drive; create body still encodes `poolSize: 0`) |
| idleTimeout / runningTimeout | 900s / 3600s preserved |
| Control SA / Runtime SA | unchanged |
| Engineering Image | **not rebuilt** |

---

## Findings (non-blocking)

1. PS1 `SRC_DIFF_BYTES=0` assertions were updated to an **allowlist** of GC1-c seams (same floor as GC1 lifecycle), preserving “PS1 invents no new src surfaces” without blocking authorized GC1-c seams.
2. `gcloud workstations configs describe` omits `poolSize` when zero; fences remain in code `GC1_COST_FENCES`.
3. Live model success still requires an interactive credential or operator-exported `OPENAI_API_KEY`.

---

## Exact change list (vs GC1-AB baseline)

### src/
- `src/execution/internal/observation-runner.ts` (new)
- `src/execution/execute.ts`, `src/execution/index.ts`
- `src/editing/host-dependencies.ts` (new)
- `src/orchestrator/mutation/{types,session,index}.ts`
- `src/scope/{bounds,types,parse,validate,index}.ts`

### scripts/
- `scripts/pathcode.mjs`, `pathcode-cli/{banner,owners,session-events,general-session}.mjs`
- `scripts/pathcode-cli/gc1/{index,lifecycle,mock-transport}.mjs`
- `scripts/pathcode-cli/gc1/{cloud-constants,cloud-effects,cloud-session,remote-worker,task-journal,task-snapshot}.mjs` (new)
- `scripts/gc1c-live-cancel-probe.mjs` (new)

### tests / fixtures /
- `tests/gc1/gc1c-*.test.ts` (new), `tests/gc1/lifecycle.test.ts`
- `tests/path-studio/{inline-studio,path-studio}.test.ts` (allowlist)
- `fixtures/gc1c-live/**` (new synthetic fixture)

### docs/
- `docs/reports/PHASE_GC1_C.md` (this report)

---

## Operator decision required (smallest)

1. Export `OPENAI_API_KEY` (or run interactively so the hidden credential prompt works).
2. Approve/run live mutate budget (≤6 sessions) via the prepared harness:
   ```bash
   GC1_LIVE_SMOKE=1 node scripts/gc1c-live-closure.mjs --confirm-cloud
   ```
   (accepted + honest-failure + cancel; seeds `PATHCODE_GC1C_SECRET_CANARY`; never prints secrets)
   Or separately: living CLI on `fixtures/gc1c-live` + `gc1c-live-cancel-probe.mjs`.
3. Re-open continuous drive only after live evidence lands; do not invent proof.

---

## FINAL LIVE CLOSURE — progress log (2026-09-11)

### 0 — H-scope admission audit — PASS (local)

**Invariant:** when `hydrationPaths` is omitted, effective H is **not** “hydrate arbitrary inventory.”

Implementation:

- `computeEffectiveHydrationSet` / `collectValidationSupportPaths` in `scripts/pathcode-cli/gc1/cloud-session.mjs`
- Support paths = fixed `VALIDATION_SUPPORT_BASENAMES` only, **plus** deterministic `VALIDATION_SUPPORT_TEST_SUFFIXES` **only when** a planned check kind includes `TARGETED_TEST`
- Unrelated siblings and secrets never enter H
- Support-only paths are **not** added to E or P
- For `executionMode === "cloud"`, H is computed **after** `admitScopePlan` and **disclosed** (`renderCloudHydrationDisclosure`) **before** scope challenge / bounded admission display
- Exact disclosed list is persisted onto `approved.hydrationPaths` / `precomputedHydrationPaths` — **no silent re-widen** at hydrate time

Positive proof + falsification: `tests/gc1/gc1c-h-scope-audit.test.ts`
Fixture result: H = `{src/edit.ts, src/context.ts, package.json}`; excludes sibling + `.env`; with TARGETED_TEST planned, `*.test.ts` joins as support-only only.

### 1 — Synthetic credential canary — PASS (local); LIVE remote assertion pending retry

- Module: `scripts/pathcode-cli/gc1/credential-boundary.mjs`
- Forbidden remote keys: `OPENAI_API_KEY`, `PATHCODE_OPENAI_API_KEY`, `PATHCODE_LIVE_OPENAI`, `PATHCODE_GC1C_SECRET_CANARY`
- Remote command reports only `CREDENTIAL_BOUNDARY_PASS` or `CREDENTIAL_BOUNDARY_VIOLATION:<name>` (never values)
- Wired in `prepareCloudTaskEnvironment` after worker install; violation refuses the task
- Local proofs: `tests/gc1/gc1c-credential-canary.test.ts` (3)

### 2 — Operator credential live begin → TRANSPORT CAPABILITY GAP (closed locally)

Operator terminal (credential-bearing; not Cursor agent):

```text
phase: GC1-c live closure begin
modelId: gpt-5.6-terra
canarySeeded: true
→ CLOSURE_ERROR: transport cannot install remote worker (no writeRemoteFile)
artifact: /var/folders/.../T/gc1c-live-closure-2026-09-11T07-08-20-992Z
```

**Not** an OpenAI / model / IAM / ADC / image problem.

#### Exact previous capability gap

```text
prepareCloudTaskEnvironment
  → assertGc1cTransportConformance  (was missing; now before acquire)
  → lifecycle.acquireProbeWorkstation
  → installRemoteWorker
      → required transport.writeRemoteFile | uploadTextFile
      → MockWorkstationTransport had writeRemoteFile → local GREEN
      → GcpWorkstationTransport had only executeCommand (Control-SA tunnel)
      → live FAIL: no writeRemoteFile
```

Mock ↔ production capability mismatch allowed local proofs to pass without the production primitive.

**Prior live cost honesty:** ModelCalls may be zero while GCP still ran. Inventory after failure showed `pathcode-gc1-probe` **STOPPED** under legacy `pathcode-gc1-config` (lifecycle default). **Not** callable as `$0`. Probe **force-deleted**; verified absence on both `pathcode-gc1-config` and `pathcode-gc1b-config-v4` (0 items). Cluster preserved. No IAM/ADC/image change.

#### Concrete production transport implementation

| Piece | Detail |
|---|---|
| Shared delivery | `scripts/pathcode-cli/gc1/runtime-delivery.mjs` → `deliverVerifiedHostRuntimeFile` |
| Conformance | `transport-conformance.mjs` → `assertGc1cTransportConformance` (requires `executeCommand`) |
| GCP alias | `GcpWorkstationTransport.writeHostRuntimeFile` → same delivery (stdin over existing tunnel) |
| Mock | Same `executeCommand` cat/wc/sha256sum/chmod/mv path — **no** install-only `writeRemoteFile` shortcut |
| Install | `installRemoteWorker` → **only** `deliverVerifiedHostRuntimeFile` |
| Fail path | install throw → `safeTeardown` (force-dispose); refuse task |

#### Remote runtime root

`/tmp/pathcode-runtime/<safe-session-id>/`
Host-constructed only. Refuse project workspace, `.git`, recovery store, `..`, absolute escapes, model-derived destinations.

#### Upload protocol

1. `mkdir -p` + restrict dir mode
2. `cat > .remote-worker.<nonce>.tmp` with **raw stdin Buffer** (no PTY; bytes never shell-interpolated)
3. await writer completion
4. remote `wc -c` + `sha256sum`
5. require `LOCAL_LENGTH === REMOTE_LENGTH` **and** `LOCAL_SHA256 === REMOTE_SHA256`
6. `chmod 0500` → atomic `mv` → `remote-worker-<sha256>.mjs`
7. invoke uses **published** path + expected SHA from receipt

Named failures: `GC1_REMOTE_RUNTIME_WRITE_FAILED` / `LENGTH_MISMATCH` / `INTEGRITY_MISMATCH` / `PUBLISH_FAILED` / `PATH_REFUSED` / `GC1_REMOTE_TRANSPORT_CAPABILITY_MISSING`.

#### Integrity receipt schema (install)

```text
{ ok, remotePath, runtimeRoot, version, sha256, length, published, stagingPath }
```

Journal event `worker.installed` binds sha256 / remotePath / length / version / runtimeRoot. Worker source: host-authored `REMOTE_WORKER_SCRIPT_SOURCE` in `remote-worker.mjs` (not model-supplied).

#### GC1-c config pin (follow-on from same failure)

Lifecycle now accepts `configId` / `probeWorkstationId`. Cloud session passes `GC1C_CONFIG=pathcode-gc1b-config-v4` and `GC1C_PROBE_WORKSTATION=pathcode-gc1c-probe` (no longer silently acquires under legacy `pathcode-gc1-config`).

#### Production / mock parity + falsifications

| ID | Result |
|---|---|
| A–L (exact bytes, truncate, corrupt, early exit, nonzero, publish fail, temp cleanup, confinement, model path, secrets, GCP fake-tunnel, mock same-abstraction) | PASS |
| F1 remove capability check | FAILS as expected; restored by hash |
| F2 mock bypass delivery | FAILS as expected; restored by hash |
| F3 skip SHA compare | FAILS as expected; restored by hash |
| F4 allow arbitrary destination | FAILS as expected; restored by hash |
| F5 execute staging before publish | FAILS as expected; restored by hash |
| Three-channel sentinel (stdout/stderr/exit 17) after install | PASS |

#### Focused totals (this fix)

| Suite | Result |
|---|---|
| `tests/gc1/gc1c-runtime-delivery.test.ts` | **18 passed** |
| `tests/gc1/` | **83 passed / 14 files** |
| `git diff --check` | **PASS** |
| GCP/provider from tests | **ZERO** |
| Canonical `npm run check` | not required for this transport-only gate (prior: 131 files / 1210 tests) |

### 3 — Worker bootstrap / execution channel (live `node,/tmp` failure) — CLOSED LOCALLY

#### Prior live cleanup (attempt `2026-09-11T07-58-01-496Z`)

| Field | Evidence |
|---|---|
| Acquisition | YES — journal `workstation.acquired` → `pathcode-gc1c-probe` |
| Worker install | YES — sha256 `8c9e41c1…c9aa` (pre-stream-end worker bytes) |
| Failure | `WORKER_PROTOCOL` / exit=127 — remote saw `node,/tmp/...: No such file` |
| Teardown | incomplete (probe left **STOPPED**); force-deleted; lists now **0** on both configs |
| CLEANUP_PENDING | none in artifact journals |
| ModelCalls | 1 on task1 — **not** $0; GCP runtime also incurred |

#### Exact root cause

| | |
|---|---|
| EXPECTED | structured `{ executable: "node", argv: [workerPath] }` → encoded shell string `'/usr/bin/node' '/tmp/.../remote-worker-<sha>.mjs'` |
| ACTUAL INTERMEDIATE | `const argv = ["node", workerRemotePath]; command: argv` |
| MALFORMED REMOTE | `node,/tmp/pathcode-runtime/...mjs` via `Array.toString()` / join(",") when array passed as single ssh argv |
| SOURCE | `scripts/pathcode-cli/gc1/remote-worker.mjs` `invokeRemoteWorker` → `transport.executeCommand({ command: argv })` → `remote-exec.mjs` `sshArgs.push(opts.command)` |

Mock previously bypassed via `invokeWorkerRequest` — second mock↔reality gap.

#### Corrected path

1. **Canonical encoder** `shell-encode.mjs` — per-arg POSIX quoting; refuse NUL/arrays; `assertRemoteCommandString`
2. **Bootstrap** `worker-bootstrap.mjs` — only `TRUSTED_REMOTE_NODE=/usr/bin/node` + receipt-bound path grammar
3. **invokeRemoteWorker** — encode bootstrap string; stdin = one JSON request; **no** default in-process shortcut
4. **remote-exec** — refuse non-string command; `stdin.end(buf, cb)` explicit EOF
5. **Protocol parse** — require version + invocationId; project stdout cannot spoof outer envelope
6. **Worker** — `spawn(..., { shell: false })`; stream-end before reply; one request document

New worker identity (bytes changed for stream-end / EOF protocol):

| | |
|---|---|
| version | `gc1c-worker-v1` |
| length | 9134 |
| sha256 | `d69f29301f45f828987f29d262b38be1957f3d534e9531ba49e774815513d60c` |

#### Proofs

| Suite | Result |
|---|---|
| R1–R17 + F1–F10 (`gc1c-execution-channel.test.ts`) | **27 passed** |
| Verified delivery (`gc1c-runtime-delivery.test.ts`) | **18 passed** |
| `tests/gc1/` | **110 passed / 15 files** |
| Product Law R16/R17 | proved by existing inline-studio PI-B / PI-C / P1 (no rewrite) |

### 4 — Worker packaging `.cjs` + living product surface — LOCAL PASS

#### Packaging

CommonJS worker bytes were published as `.mjs` → Node ESM load → `require` failure.
**Contract now:** publish/bootstrap `remote-worker-<sha256>.cjs`. Local preflight: `.cjs` boots + protocol OK; same bytes as `.mjs` fail (regression lock).

Worker identity unchanged in content hash until next source edit:
`gc1c-worker-v1` · sha256 `d69f2930…d60c` · artifact extension **`.cjs`**.

#### Living product UI (product-surface rejection — corrected)

Wide TTY (≥120 cols): **PROJECT | PATH | EVIDENCE** + **MACHINE** + cloud footer
([`inline-studio.mjs`](scripts/pathcode-cli/inline-studio.mjs), [`path-studio/state.mjs`](scripts/path-studio/state.mjs)).
- Authoritative PATH via `projectAuthoritativePathPhase` — Complete illegal while Starting/Hydrating/Cleaning; infra failures render Failed inside the frame.
- Production execution readiness: `GC1_EXECUTION_READY_INTERVAL_MS=2000`, `GC1_EXECUTION_READY_DEADLINE_MS=180000` (cloud-session no longer injects 2×1ms test defaults).
- Collision guard suppresses raw mid-frame dumps; challenge prompts still surface.
- MACHINE: one-shot `queryMachineCapabilities` after Ready on live (`skipLiveGcp===false`).
Gate 2 ✓ only on authentic `session.gate2` accepted.

#### Normal CLI live path

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-phase-gc1c
cd fixtures/gc1c-live   # or a disposable copy
export OPENAI_API_KEY=…  # operator terminal only
export PATHCODE_OPENAI_MODEL=gpt-5.6-terra
GC1_LIVE_SMOKE=1 node ../../scripts/pathcode.mjs \
  --execution cloud --autonomy bounded --model gpt-5.6-terra
```

`skipLiveGcp: false` only when `--execution cloud` **and** `GC1_LIVE_SMOKE=1`.

#### Local proofs (product drive)

| Suite | Result |
|---|---|
| packaging preflight | PASS (`.cjs` ok / `.mjs` fail) |
| delivery + execution-channel | 45 passed |
| living-product + product-surface | 19 passed |
| `tests/gc1/` | **129 passed / 17 files** |
| inline-studio regression | 15 passed |
| `npm run check` | **137 files / 1280 tests PASS** |
| `git diff --check` | PASS |
| IAM/ADC/image | unchanged |

### 5 — Live product cycles — TRUE OPERATOR-ONLY BLOCKER

Cursor agent process:

- `OPENAI_API_KEY` **absent**
- `PATHCODE_OPENAI_MODEL` **absent**
- `stdin.isTTY` **false** (hidden credential prompt unavailable)

No live OpenAI cycle can run from this process without requesting/copying the secret (forbidden).

Leftover from prior operator live: `pathcode-gc1c-probe` STOPPED on `pathcode-gc1b-config-v4` — force-delete required before next live (operator/cleanup).

---

## Checkpoints

| Checkpoint | Full SHA |
|---|---|
| GC1-AB baseline | `462a18dfb9e6395f6efdd4028d0f2707f4b1be2e` |
| Implementation (initial GC1-c) | `be457781d24fb5943dfbe3acaced8ce25e4274fa` |
| Closure local (H/canary/harness) | `f74282c883985c31ee16838da64b7c6f4bb0ba5b` |
| Pre-delivery report tip | `2276a488451013b634d7958d3c3dd4f3e7220138` |
| Product drive (packaging + living UI + live CLI wire) | *(uncommitted)* |

```text
GC1-c CONTINUOUS DRIVE: BLOCKED/PARTIAL
TRUE OPERATOR-ONLY BLOCKER: OPENAI_API_KEY inaccessible to Cursor agent process
PRODUCT LOCAL: living three-column surface + .cjs worker + live CLI wiring READY
UNMET LIVE: accepted cycle; honest-failure cycle; cancellation
PRESERVED: H-scope; Gate 1/2 honesty; Recovery Floor; no IAM/ADC/image change;
           provider max=3; OpenAI-only for this closure
NEXT (operator credential terminal, living product — not JSON harness):
  cd fixtures/gc1c-live
  export PATHCODE_OPENAI_MODEL=gpt-5.6-terra
  GC1_LIVE_SMOKE=1 node ../../scripts/pathcode.mjs \
    --execution cloud --autonomy bounded --model gpt-5.6-terra
Also dispose any leftover pathcode-gc1c-probe before acquire if still listed.
```
