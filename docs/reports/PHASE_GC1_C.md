# PATH CODE — PHASE GC1-C CONTINUOUS DRIVE

**Result: BLOCKED/PARTIAL**

```text
GC1-c CONTINUOUS DRIVE: BLOCKED/PARTIAL
— Local vertical slice implemented and canonically proven
— Living CLI --execution cloud wired (mock-by-default)
— Focused GC1C-A…L proofs + falsifications green
— Canonical npm run check PASS (131 files / 1210 tests)
— Live model cycles NOT run: OPENAI_API_KEY absent in non-interactive agent env
— Live GCP cancel probe prepared; operator approval for live mutate did not complete
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
| L0 | Credential presence check | `OPENAI_API_KEY` / `PATHCODE_OPENAI_API_KEY` / `PATHCODE_LIVE_OPENAI` **absent** |
| L1 | Config inventory (read-only) | `pathcode-gc1b-config-v4` present; image pin matches gc1b-v4; Runtime SA correct; idle 900s; running 3600s; workstation list empty |
| L2 | Live model accepted cycle | **NOT ATTEMPTED** — missing provider credential (blocker per §12) |
| L3 | Live honest-failure cycle | **NOT ATTEMPTED** — blocked by L2 prerequisite |
| L4 | Live cancel probe script | Prepared (`scripts/gc1c-live-cancel-probe.mjs`); **NOT EXECUTED** — live GCP mutate approval UI did not complete in this agent turn |
| L5 | Live cancel via living CLI | **NOT ATTEMPTED** |

### Unmet gates (exact)

1. **LIVE_PROVIDER_CREDENTIAL** — no OpenAI credential available non-interactively; contract forbids fake-provider substitution for live model success.  
2. **LIVE_GCP_CANCEL_AND_FULL_CLI_CYCLES** — disposable fixture + cancel probe ready; live workstation mutate not completed in this run.

Cleanup state: no GC1-c billable workstation created by this drive (list was empty; probe not run). Cluster preserved. No CLEANUP_PENDING resources attributed to this drive.

---

## Durable artifacts

- Journal root (runtime): `~/.pathcode/gc1c-journal/` (or test overrides)
- Synthetic fixture: `fixtures/gc1c-live/` (labeled synthetic; not PATH Code itself)
- Cancel probe script + intended artifact path under `/tmp/gc1c-cancel-*` (when run)

---

## Exact test totals

| Command | Result |
|---|---|
| `npm run check` | **PASS** — typecheck + build + vitest **131 files / 1210 tests** + cli:smoke + ledger:verify |
| `tests/gc1/` | **59 passed** (11 files) — was 39 at GC1-AB freeze |
| `git diff --check` | **PASS** (`DIFF_CHECK_EXIT:0`) |
| External calls in canonical suite | **ZERO** GCP / provider |

Baseline comparison: 123→131 files, 1190→1210 tests (additive GC1-c + unchanged floors).

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

### 1 — Synthetic credential canary — PASS (local); LIVE remote assertion NOT RUN

- Module: `scripts/pathcode-cli/gc1/credential-boundary.mjs`
- Forbidden remote keys: `OPENAI_API_KEY`, `PATHCODE_OPENAI_API_KEY`, `PATHCODE_LIVE_OPENAI`, `PATHCODE_GC1C_SECRET_CANARY`
- Remote command reports only `CREDENTIAL_BOUNDARY_PASS` or `CREDENTIAL_BOUNDARY_VIOLATION:<name>` (never values)
- Wired in `prepareCloudTaskEnvironment` after worker install; violation refuses the task
- Local proofs: `tests/gc1/gc1c-credential-canary.test.ts` (3)

### 2–5 — Live accepted / fail / cancel — NOT EXECUTED THIS TURN

Prepared harness: `scripts/gc1c-live-closure.mjs` (real Brain + real GCP + directionality hashes + canary seed + cancel probe).

**Blocking condition:** agent live-mutate / provider-credential execution requires an operator approval card; repeated approval attempts failed with `Could not find bubble for toolCallId` (no approval UI delivered). Per contract, live proof was **not invented**.

No GC1-c billable workstation was acquired in this closure turn. Cluster/config preserved. CLEANUP_PENDING: none from this turn.

### Focused local totals after H/canary closure

| Suite | Result |
|---|---|
| `tests/gc1/` | **65 passed / 13 files** |
| H-scope + canary + scope-snapshot focused | **8 passed** |

Canonical `npm run check` **not** re-run this turn (live gates unmet; avoid non-causal canonical churn). Prior canonical: 131 files / 1210 tests PASS.

---

## Checkpoints

| Checkpoint | Full SHA |
|---|---|
| GC1-AB baseline | `462a18dfb9e6395f6efdd4028d0f2707f4b1be2e` |
| Implementation (initial GC1-c) | `be457781d24fb5943dfbe3acaced8ce25e4274fa` |
| Report (initial BLOCKED/PARTIAL) | `d4ae930c559f9de707c22591f90bcbe522555c20` |
| Closure local (H/canary/harness) | *(this commit)* |

```text
GC1-c CONTINUOUS DRIVE: BLOCKED/PARTIAL
UNMET: LIVE_PROVIDER_AND_GCP_OPERATOR_APPROVAL (approval UI unavailable);
       LIVE_ACCEPTED_CLI_CYCLE; LIVE_HONEST_FAILURE_CYCLE; LIVE_CANCELLATION
PRESERVED: H-scope audit PASS; credential-canary local PASS; cluster pathcode-gc1-cluster;
           config pathcode-gc1b-config-v4; CLEANUP_PENDING=none
NEXT: export OPENAI_API_KEY; run
      GC1_LIVE_SMOKE=1 node scripts/gc1c-live-closure.mjs --confirm-cloud
```
