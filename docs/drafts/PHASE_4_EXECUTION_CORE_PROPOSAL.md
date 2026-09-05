# PATH CODE — PHASE 4 EXECUTION CORE PROPOSAL

```text
DRAFT — NOT IMPLEMENTED — NOT AUTHORIZED FOR MERGE
```

**Document kind:** repository-grounded design and implementation contract  
**Stream:** Cursor Stream B — Implementation Contract Preparation  
**Baseline HEAD:** `e4de37e90aa4bf43d1618d2fd5ab1fb0dbda40db`  
**Worktree:** `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core`  
**Branch:** `cursor/phase4-execution-core`  
**Scope:** first real Phase 4 capability only — non-interactive, explicitly authorized, local process execution  

This document does **not** implement process execution.  
It does **not** claim Phase 4 has started operationally.  
It does **not** claim Phase 3 is closed beyond what committed closure artifacts already state.  
It does **not** claim Constitution §10 pre-Phase-4 foundation review is complete.

Committed repository evidence at the baseline HEAD is the source of truth.

---

## 0. Status and non-claims

| Claim | Status in this draft |
|---|---|
| Phase 3 Safe Editing Engine COMPLETE / FROZEN (per `docs/PHASE_3_CLOSURE.md`) | Acknowledged as committed documentation status |
| Phase 3 “closed for Phase 4 progression” in the sense that §10 audit + Phase 4 Master are done | **NOT claimed** |
| Constitution §10 Closed-Vocabulary & Foundation Extensibility Audit | **NOT complete** (README + Constitution + Phase 3-R* contracts) |
| Phase 4 Master Contract frozen | **NOT claimed** — this draft is preparatory |
| Implementation of `src/execution/**` | **NOT authorized by this draft alone** |
| Isolation / sandbox for untrusted child processes | **Out of scope** |

Committed next-permitted operation (`README.md`):

> ONE bounded Closed-Vocabulary & Foundation Extensibility Audit combined with preparation of the Phase 4 Master Contract.  
> No Phase 4 implementation yet.

---

## 1. Existing execution boundaries

### 1.1 Where subprocess execution currently exists

| Location | Role | Primitive | Public? |
|---|---|---|---|
| `src/git/runner.ts` | **Sole production** `node:child_process` owner | `execFile` only; `shell: false`; `windowsHide: true` | **No** — `runGit` is not exported from `src/git/index.ts` or package root |
| Tests under `tests/**` | Test/harness use of `child_process` / `execFileSync` / `spawnSync` | Test-only | N/A |
| `package.json` `cli:smoke` | Smoke script uses `spawnSync` | Script-only | N/A |

`src/git/runner.ts` header states explicitly:

> Not a general process execution API (Phase 4).

Phase 3 Master (`docs/PHASE_3_SAFE_EDITING_MASTER.md`) states Phase 3 does **not** introduce generic process execution, shell, or PTY.

`src/editing/types.ts` lists `EXECUTE_COMMAND` under `DeferredMutationAction` — intentionally absent from Phase 3 mutation vocabulary.

### 1.2 Production module that owns child_process / process execution

**Exactly one production module:** `src/git/runner.ts`.

It is a fixed-purpose Git executable runner. It is not a reusable process adapter, executor callback, or Phase 4 API.

### 1.3 Architecture tests that restrict subprocess use

| Test / guard | Restriction relevant to Phase 4 |
|---|---|
| `tests/git/architecture.test.ts` | `src/git` free of `shell:true`, `spawn`/`exec`/`fork`, generic process abstractions (`CommandRunner`, `ProcessService`, `ShellExecutor`, `ExecutionEngine`), shell command strings; `execFile` sole primitive in `runner.ts` |
| `tests/git/baseline-architecture.test.ts` | No `shell:true` in `src/git`; dist production modules that touch `child_process` must use `execFile` only (no spawn/exec/fork); `runGit` not public |
| `tests/editing/architecture.test.ts` | Editing modules forbid `node:child_process` imports |
| `tests/domain/architecture-boundary.test.ts` | Domain forbids `child_process` |
| `tests/config/architecture.test.ts` | Config forbids `child_process` |
| `tests/metadata/architecture.test.ts` | Metadata forbids `child_process` |
| `tests/search/architecture.test.ts` | Search forbids `child_process` / `runGit` |
| `tests/snapshot/architecture.test.ts` | Snapshot forbids `child_process` |
| `tests/selfobs/architecture.test.ts` | Selfobs forbids `child_process` |
| `tests/cli/architecture.test.ts` | CLI forbids `child_process` |
| `tests/architecture/write-boundary.test.ts` | Global write-primitive boundary (editing `atomic-fs` only) — not process, but establishes the “authorized sole owner” pattern Phase 4 must mirror for spawn/execFile |

**Implication:** introducing a second production `child_process` consumer requires **explicit architecture-test amendment** naming the authorized execution module(s). Do not weaken Git-only rules by silent exclusion.

### 1.4 Applicable ActionClass / configuration restrictions

Machine vocabulary (`src/domain/authority.ts`, mirrored in `src/config/parser.ts` `ACTION_CLASSES`):

- Includes forward-looking tokens: `TARGETED_TEST`, `TYPECHECK`, `LINT`, `BUILD`, `PRIVILEGED_EXECUTION`, `SYSTEM_LEVEL_OPERATION`, …
- Config narrowing: `disable-action=<ActionClass>` → `ProjectRestrictions.disabledActions`
- Phase 3 applies disable-action **only** through narrow mappings in `src/editing/policy.ts`:
  - `MODIFY_EXISTING_FILE` → `EDIT`
  - `CREATE_FILE` → `CREATE_FILE`

No committed mapping binds generic local process execution / `run_process` to any ActionClass.

### 1.5 Authority concepts that can be reused (pattern, not types)

Reusable **patterns** from Phase 3 editing (`src/editing/authorization.ts`, `internal/registry.ts`, `internal/consume-authorization.ts`):

| Pattern | Reuse as |
|---|---|
| Prepare exact immutable request object with brand | `PreparedLocalProcess` |
| Explicit approval token with fixed `kind` discriminant | `ExplicitLocalProcessApproval` — **separate** from `ExplicitEditApproval` |
| Authorize only after approval + config restriction + binding checks | `authorizePreparedLocalProcess` |
| Opaque branded authorization; `WeakMap` registry; non-serializable; single-use | `LocalProcessAuthorization` |
| Consume immediately before side effect; refuse replay / wrong prepared identity | consume at execute entry |
| Evidence/result issued only by the owning engine | `LocalProcessResult` / evidence record |
| No public DI of ops / adapters / executors (Constitution Amendment 1) | private Node spawn helper only |

### 1.6 Concepts that must NOT be reused as command authorization

| Concept | Why unsafe to reuse for process execution |
|---|---|
| `EditAuthorization` / `ExplicitEditApproval` | Bound to file mutation fingerprints and mutation actions |
| `PreparedChange` / `MutationAction` | File create/modify only |
| `EditCommitGrant` | Internal edit commit handoff |
| Phase 3 write boundary / `atomic-fs` | Controls Path Code’s own writes — **not** child-process filesystem/network effects |
| Git runner env sanitization as “sandbox” | Strips selected `GIT_*` keys only; still inherits host env by default |
| `shell: false` | Prevents shell interpretation — **not** sandboxing |
| Workspace cwd containment | Constrains spawn cwd — **not** sandboxing of the child |

**Do not silently reuse edit authorization as command authorization.**

### 1.7 Actual prerequisite before Phase 4 implementation

Per Foundation Extensibility Constitution V1 §10 / §13 and committed README / Phase 3-R* contracts:

1. **Constitution §10** one bounded Closed-Vocabulary & Foundation Extensibility Audit — **not run** at baseline.  
2. Freeze that audit’s evidence.  
3. Freeze **Phase 4 Master Contract** with its own Foundation Compatibility Preflight (this draft feeds that Master; it is not a substitute).  
4. Resolve every preflight row (`MAPS_TO_EXISTING` | `AMENDMENT_REQUIRED` | `BLOCKING_GAP`).  
5. Freeze any required **smallest additive amendment** before dependent implementation.  
6. Explicitly authorize architecture-boundary changes (second production process owner).  
7. Only then implement.

GAP-055 (auditor independence) is committed `NON_BLOCKING_LIMITATION` / `OPEN` and must be addressed in Phase 4 Master preflight per Phase 3-R1/R2 contracts — it does **not** by itself block designing this execution core, and this draft does not invent a closure mechanism for it.

### 1.8 Foundation amendment required?

Using Constitution compatibility vocabulary only:

| Foundational concept consumed | Classification | Notes |
|---|---|---|
| WorkspaceBoundary / CanonicalPath for cwd | `MAPS_TO_EXISTING` | Reuse `createWorkspaceBoundary` / `canonicalize`; refuse outside workspace |
| Explicit authorization outside the model | `MAPS_TO_EXISTING` | Pattern exists; **types must be new** |
| Single-use opaque authority | `MAPS_TO_EXISTING` | WeakMap registry pattern exists |
| EvidenceKind `EXIT_CODE` / `STDOUT` / `STDERR` | `MAPS_TO_EXISTING` | `src/domain/evidence.ts` already lists these kinds |
| Result / Failure honesty | `MAPS_TO_EXISTING` | `src/domain/result.ts` |
| Platform identity (`PlatformId`) | `MAPS_TO_EXISTING` for detection | First capability still refuses Windows (see §2) |
| `disable-action` mapping for first local process execution | **`AMENDMENT_REQUIRED`** (exact token **OPEN**) | See §1.9 |
| Isolation / sandbox of child side effects | **`NOT_APPLICABLE` to first capability** | Explicit non-goal; separate future policy |
| Constitution §10 baseline audit itself | **Prerequisite incomplete** | Not an amendment; blocking process gate |

No new foundational vocabulary is invented in this draft. Where an additive ActionClass token is needed, the amendment document (not this draft) freezes the exact token.

### 1.9 OPEN — ActionClass mapping for first local process execution

**Decision:** `AMENDMENT_REQUIRED` for disable-action mapping; **exact ActionClass token = OPEN**.

**Why not `MAPS_TO_EXISTING` without further evidence:**

- Mapping generic argv execution onto `TARGETED_TEST` / `TYPECHECK` / `LINT` / `BUILD` would repeat the CREATE_FILE→EDIT class of error (semantic overloading).
- `PRIVILEGED_EXECUTION` and `SYSTEM_LEVEL_OPERATION` exist as tokens but have **no committed semantic definition** in Phase 1 closure / ActionClass Amendment 1 beyond the token list.
- No committed document maps Master `run_process` to any ActionClass.

**Evidence required to close OPEN:**

1. Foundation Compatibility Preflight row in the future Phase 4 Master, **and either**  
2a. Frozen citation proving an existing ActionClass already means “explicitly authorized local non-interactive process execution” with disable-action semantics, **or**  
2b. Smallest additive ActionClass amendment (same protocol as `PHASE_1_ACTION_CLASS_AMENDMENT_1`) freezing token + meaning + parser/`ACTION_CLASSES` consumer updates + one targeted falsification.

Until closed: implementation of authorization-time disable-action for process execution is blocked.

---

## 2. First execution scope

### 2.1 In scope (only)

```text
NON-INTERACTIVE
EXPLICITLY AUTHORIZED
LOCAL PROCESS EXECUTION
```

Structured executable + argv array (Master: structured `run_process`), workspace-bound cwd, finite timeout, captured stdout/stderr with limits, exit/signal/timeout/cancellation evidence.

### 2.2 Explicitly excluded

- autonomous reasoning loop
- model providers
- browser
- database
- remote execution
- MCP
- PTY
- interactive stdin
- background daemons / persistent services
- shell command strings (`shell: true`, `bash -c`, `sh -c`, PowerShell string execution)
- package install / network / deployment orchestration as product features
- untrusted-code isolation / sandbox product

### 2.3 Initially supported operating systems

| OS | First capability |
|---|---|
| macOS (`darwin`) | **Supported** |
| Linux | **Supported** |
| Windows | **Not supported** for this first capability |

**Honesty basis:** Phase 3 atomic create/replace already refuses non-`darwin`/`linux` (`src/editing/atomic-fs.ts`). Process-group signaling, `SIGTERM`/`SIGKILL` escalation, and descendant cleanup differ materially on Windows. Master §19 aspirationally lists Windows; Phase 1 closure also records “no process/signal platform adapters” and “no live Windows CLI / NTFS validation” as later-phase limitations. This draft does **not** claim Windows support until termination, environment, and process-group behavior are designed for Windows.

Unsupported platforms refuse **before spawn** with a truthful failure code (e.g. `UNSUPPORTED_EXECUTION_PLATFORM`).

### 2.4 Non-sandboxing statements (mandatory)

- **`shell: false` is NOT sandboxing.** It only disables shell interpretation of the argv vector.
- **A workspace cwd is NOT sandboxing.** It only constrains the child’s initial working directory under WorkspaceBoundary rules.
- An authorized executable may still:
  - read files;
  - write files;
  - spawn children;
  - access the network;
  - mutate resources outside Path Code’s editing engine.
- **Phase 3’s write boundary does NOT control arbitrary child processes.**
- Execution of untrusted repository code therefore requires a **separately approved** policy/isolation capability. **This proposal does not design that system.**

---

## 3. Authority model

### 3.1 Lifecycle

```text
REQUEST
  → PREPARE
  → AUTHORIZE
  → EXECUTE
  → RESULT / EVIDENCE
```

| Stage | Public entry | Side effects |
|---|---|---|
| REQUEST | Caller constructs plain input DTO | None |
| PREPARE | `prepareLocalProcess(...)` | Validates; freezes prepared object; **no spawn** |
| AUTHORIZE | `authorizePreparedLocalProcess(prepared, explicitApproval, resolvedConfig)` | Issues opaque one-shot authorization; **no spawn** |
| EXECUTE | `executeAuthorizedLocalProcess(prepared, authorization, …)` | Consumes authorization, revalidates, spawns, captures, terminates as needed |
| RESULT / EVIDENCE | Returned `LocalProcessResult` | Truthful process evidence only |

### 3.2 Trusted approval source

Trusted approval is an **`ExplicitLocalProcessApproval`** value produced only by:

```ts
explicitLocalProcessApproval(): ExplicitLocalProcessApproval
```

returning a frozen object `{ kind: "EXPLICIT_LOCAL_PROCESS_APPROVAL" }`.

**Must NOT independently mint execution authority:**

- model request / tool-call proposal
- arbitrary boolean
- editable JSON / PATHCODE guidance prose
- caller-supplied reconstructed authorization object
- structural clones of branded tokens
- `ExplicitEditApproval` (wrong domain)

### 3.3 Authorization properties

`LocalProcessAuthorization` must be:

- **opaque** (unique brand; not constructible by structural typing in disciplined APIs)
- **single-use** (registry `consumed` flag)
- **bound to the exact prepared object identity** (`preparedRef === prepared`)
- **non-serializable as reusable authority** (WeakMap registration; reconstruct → `AUTHORIZATION_NOT_REGISTERED`)
- **resistant to caller mutation** (frozen fields; argv/env copied at prepare)
- **resistant to replay** (second execute refuses)
- **resistant to concurrent double-use** (consume is synchronous compare-and-set on registry entry before spawn)

Bound fields (complete request):

- executable identity (absolute path string as prepared)
- argv (immutable copy)
- canonical workspace root identity (WorkspaceBoundary / root CanonicalPath)
- cwd (canonical workspace-bound path)
- environment policy identity + immutable env snapshot
- timeout
- output limits
- platform policy (supported OS set / refusal)
- approval scope (`EXPLICIT_LOCAL_PROCESS_APPROVAL`)
- ActionClass disable mapping once §1.9 closes

### 3.4 When authorization is consumed

Consumed **synchronously at the start of EXECUTE**, after binding checks and **before** pre-spawn revalidation completes successfully enough to call spawn — specifically:

1. Verify approval already satisfied at authorize-time (not re-minted at execute).
2. `consumeLocalProcessAuthorization(authorization, prepared)` → success grant **or** refuse.
3. On consume success: mark consumed **immediately**.
4. Then perform immediate pre-spawn revalidation (cwd currentness, executable identity, platform).
5. If revalidation fails after consume: return refusal/failure result with evidence that authorization was consumed and **no process was started** (or spawn was not attempted). Do **not** un-consume (prevents retry-with-stale-token loops). Caller must prepare+authorize again.

### 3.5 Behavior matrix (authority / pre-spawn)

| Situation | Behavior |
|---|---|
| Refusal before spawn (policy, platform, cwd outside, auth missing) | No child; result `REFUSED_BEFORE_SPAWN`; auth consumed only if execute entry consumed it |
| Spawn failure (`ENOENT`, `EACCES`, etc.) | Auth already consumed; result `SPAWN_FAILED` with errno/code; no fabricated exit 0 |
| Concurrent replay / second execute | `AUTHORIZATION_ALREADY_CONSUMED` or not registered; no second spawn |
| Policy/config change before spawn (re-resolved disable-action) | Refuse execute; record config freshness refusal; no spawn |
| Cwd change before spawn (realpath / containment no longer matches prepared) | Refuse; `CWD_CHANGED` / `WORKSPACE_INCOMPATIBLE`; no spawn |
| Executable change before spawn (identity revalidation fails) | Refuse; `EXECUTABLE_CHANGED`; no spawn |

### 3.6 Proposed TypeScript public signatures

```ts
/** Frozen explicit approval — sole trusted mint is explicitLocalProcessApproval(). */
export type ExplicitLocalProcessApproval = {
  readonly kind: "EXPLICIT_LOCAL_PROCESS_APPROVAL";
};

export type LocalProcessRequest = {
  readonly executable: string; // absolute path required in first scope
  readonly argv: readonly string[];
  readonly cwd: string; // must canonicalize inside workspace
  readonly env?: Readonly<Record<string, string>>; // explicit extras only
  readonly timeoutMs?: number; // clamped to module max
  readonly maxStdoutBytes?: number; // clamped to module max
  readonly maxStderrBytes?: number; // clamped to module max
};

declare const preparedLocalProcessBrand: unique symbol;
export type PreparedLocalProcess = {
  readonly [preparedLocalProcessBrand]: true;
  readonly preparedId: string;
  readonly executable: string;
  readonly argv: readonly string[];
  readonly cwd: string; // canonical
  readonly workspace: WorkspaceBoundary;
  readonly envSnapshot: Readonly<Record<string, string>>;
  readonly envPolicyId: string;
  readonly timeoutMs: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly platformPolicyId: string;
  readonly config: ResolvedProjectConfig;
  readonly preparedAtMs: number;
};

declare const localProcessAuthorizationBrand: unique symbol;
export type LocalProcessAuthorization = {
  readonly [localProcessAuthorizationBrand]: true;
  readonly authorizationId: string;
  readonly preparedRef: PreparedLocalProcess;
  readonly issuedAtMs: number;
};

export function explicitLocalProcessApproval(): ExplicitLocalProcessApproval;

export function prepareLocalProcess(
  request: LocalProcessRequest,
  workspace: WorkspaceBoundary,
  resolvedConfig: ResolvedProjectConfig,
): Promise<Result<PreparedLocalProcess, LocalProcessPreparationFailure>>;

export function authorizePreparedLocalProcess(
  prepared: PreparedLocalProcess,
  explicitApproval: ExplicitLocalProcessApproval,
  resolvedConfig: ResolvedProjectConfig,
): Promise<Result<LocalProcessAuthorization, LocalProcessAuthorizationFailure>>;

export function executeAuthorizedLocalProcess(
  prepared: PreparedLocalProcess,
  authorization: LocalProcessAuthorization,
): Promise<Result<LocalProcessResult, LocalProcessExecutionFailure>>;
```

Optional cancellation: a **non-substituting** `AbortSignal` may be accepted later only if Constitution Amendment 1 obligation 8.8 is satisfied and it cannot replace authorization/execution. First implementation may omit it and still test timeout-initiated termination; if included, it is cancellation intent only — not authority.

### 3.7 Private boundaries (no public seams)

**Forbidden on public surface** (package root / barrels / options):

- process adapter
- executor callback
- `child_process` dependency object
- filesystem operation bag
- evidence issuer / brand mint
- success callback
- any DI seam capable of replacing execution behavior

Private modules may import `node:child_process` **only** inside the authorized execution owner (see §8).

---

## 4. Executable / argv / cwd / environment / stdin

### 4.1 Executable

| Rule | Specification |
|---|---|
| Absolute resolution | First scope requires **absolute** executable path after prepare validation |
| PATH policy | **PATH lookup is not permitted** in first scope (avoids repeating Git runner’s documented PATH-substitution limitation) |
| Identity evidence | Record resolved absolute path string; optionally record `stat` identity fields available without claiming anti-TOCTOU perfection |
| Replacement race | Documented limitation: between revalidation and spawn, the inode may still change (classic TOCTOU). Immediate pre-spawn revalidation reduces but does not eliminate this |
| Immediate pre-spawn revalidation | Re-`stat` / re-check absolute path equality and regular-file+executable bits as platform allows; mismatch → refuse spawn |

### 4.2 Argv

| Rule | Specification |
|---|---|
| Immutable copy | Prepare copies into `Object.freeze([...argv])` |
| Exact ordering | Preserved exactly |
| Count limit | `MAX_LOCAL_PROCESS_ARGV_COUNT = 256` |
| Byte limit | `MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES = 65_536` (sum of UTF-8 byte lengths) |
| NUL rejection | Any argv element containing `\0` → prepare failure |
| Metacharacters | Quotes, spaces, dashes, `|`, `;`, `$`, etc. are **argv data** — no shell interpretation |
| No shell | Always `shell: false` |

### 4.3 Cwd

| Rule | Specification |
|---|---|
| Canonical workspace-bound | `workspace.canonicalize(cwdInput)`; failure → prepare refuse |
| Symlink / physical path | Use existing WorkspaceBoundary realpath containment (`src/workspace/boundary.ts`) |
| Pre-spawn currentness | Re-canonicalize prepared cwd string; physical path must still equal prepared cwd and remain inside workspace |
| Outside workspace | Refuse |

### 4.4 Environment

| Rule | Specification |
|---|---|
| Default | **Do NOT inherit `process.env` wholesale** |
| Minimal explicit inherit allowlist (host values copied if present) | `PATH`, `HOME`, `TMPDIR`, `TMP`, `TEMP`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TZ`, `USER`, `LOGNAME` — and nothing else by default |
| Caller extras | Only via `request.env` string map; keys validated; denylist applied |
| Denylist (always stripped if present) | Common secret patterns: `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `*_API_KEY`, `AWS_*`, `GITHUB_TOKEN`, `NPM_TOKEN`, `OPENAI_*`, `ANTHROPIC_*`, plus exact matches for `SSH_AUTH_SOCK` unless later explicitly opted (first scope: deny) |
| PATH handling | Inherited allowlisted PATH may exist for child convenience; **executable itself is still absolute** — PATH is not used for resolution in first scope |
| HOME / TMP | Allowlisted for normal tool behavior; not a security boundary |
| Secret leakage prevention | Denylist + no wholesale inherit; evidence records **policy id**, not full secret values |
| Immutable snapshot | Frozen record on prepared object; execute uses that snapshot only |
| Host mutation | **Must not** mutate `process.env` or `process.cwd()` |

Git’s `buildGitChildEnvironment` remains **Git-private**. Execution uses its own env builder; do not couple domains.

### 4.5 Stdin

First scope: **stdin closed / ignored** (no interactive input; no stdin payload API).

---

## 5. Process lifecycle

### 5.1 State-transition table

| State / event | Meaning | Next / terminal |
|---|---|---|
| `REFUSED_BEFORE_SPAWN` | Validation/auth/platform/cwd/exe refused | Terminal failure/refuse; no pid |
| `SPAWN_FAILED` | OS spawn error | Terminal; spawn error evidence |
| `RUNNING` | Child exists; streams draining | Active |
| `EXIT_CODE_0` | Observed exit code 0 | Toward finalize |
| `EXIT_NONZERO` | Observed nonzero exit | Toward finalize |
| `SIGNAL_TERMINATED` | Observed termination by signal | Toward finalize |
| `TIMEOUT_INITIATED` | Timeout fired; termination requested | `TERMINATION_REQUESTED` |
| `CANCELLATION_INITIATED` | Cancel intent (if AbortSignal supported) | `TERMINATION_REQUESTED` |
| `OUTPUT_OVERFLOW` | Capture limit reached; overflow policy engaged | May co-exist with `RUNNING` / termination |
| `STREAM_ERROR` | stdout/stderr stream error | Recorded; continue toward finalize |
| `TERMINATION_REQUESTED` | Signal/kill escalation started | Wait for observe / cleanup deadline |
| `TERMINATION_OBSERVED` | exit/close proves process ended | Toward finalize |
| `TERMINATION_NOT_CONFIRMED` | Cleanup deadline elapsed without observed death | Terminal **honest** incomplete termination |
| `DESCENDANT_REMAINS_ALIVE` | Process-group / pipe evidence suggests descendants | Recorded in cleanup result; not claimed killed unless observed |
| `CLOSE` | stdio `close` observed | Contributes to finalize readiness |
| `INCOMPLETE_OUTPUT_CAPTURE` | Streams ended with truncation or error | Represented in result |
| `FINAL` | Single completion emitted | Terminal truthful `LocalProcessResult` |

### 5.2 Required handling rules

- **error / exit / close races:** one completion gate (mutex / `finalizeOnce`); first terminal classification wins; later events only enrich evidence if still open fields, never second public completion.
- **Double-completion prevention:** mandatory.
- **Signal-request vs termination:** `terminationRequested=true` does **not** imply `terminationObserved=true`.
- **Timeout result** must not claim termination succeeded unless observed.
- **Output streams open after parent exit / descendants holding pipes:** continue drain until stream end **or** cleanup deadline; then mark incomplete capture / descendant caveat.
- **Finite cleanup deadlines:** see §6 — no infinite kill loops, no orphan-producing retry loops, no background recovery daemons.
- **Process-group (POSIX):** spawn with `detached: true` **or** explicit `setsid`/group strategy chosen so Path Code can signal the group; prefer killing the process group on timeout. Exact Node options are private implementation detail but must be tested on macOS/Linux.
- **Escalation policy:** `SIGTERM` → grace → `SIGKILL` → final cleanup deadline → stop signaling; record `TERMINATION_NOT_CONFIRMED` if needed.

---

## 6. Finite resource limits

| Limit | Value | Reason |
|---|---|---|
| `MAX_LOCAL_PROCESS_DURATION_MS` | `120_000` | Finite wall clock above Git state `15_000` so real test/typecheck/build invocations can complete; still bounded |
| `LOCAL_PROCESS_TERMINATION_GRACE_MS` | `2_000` | Time after SIGTERM before SIGKILL |
| `LOCAL_PROCESS_FINAL_CLEANUP_DEADLINE_MS` | `5_000` | Hard stop waiting for exit/close after escalation; prevents hang |
| `MAX_LOCAL_PROCESS_ARGV_COUNT` | `256` | Prevents pathological argv vectors |
| `MAX_LOCAL_PROCESS_ARGV_TOTAL_BYTES` | `65_536` | OS argv practicality + Path Code safety bound |
| `MAX_LOCAL_PROCESS_ENV_TOTAL_BYTES` | `65_536` | Bound env snapshot size |
| `MAX_LOCAL_PROCESS_STDOUT_BYTES` | `16_777_216` | Align with `MAX_GIT_STATE_COMMAND_OUTPUT_BYTES` precedent |
| `MAX_LOCAL_PROCESS_STDERR_BYTES` | `16_777_216` | Same |

Caller-supplied timeout/limits are **clamped down** to these maxima; they cannot widen them.

### 6.1 Output overflow semantics — **Option A (terminate) + continued drain**

**Decision: A — overflow terminates execution**, with truthful truncation evidence.

When stdout or stderr captured bytes would exceed the limit:

1. Mark `stdoutTruncated` / `stderrTruncated` (or unified overflow flag) **true**.
2. Initiate termination (`TIMEOUT`-like escalation path labeled `OUTPUT_OVERFLOW`).
3. **Continue draining** pipes until close or cleanup deadline so the child does not deadlock on a full pipe.
4. Do **not** claim full capture; do **not** claim termination observed unless observed.

Discarded drained bytes after the limit still count toward a `bytesDiscardedAfterLimit` evidence field when practical; at minimum, completeness flags must be truthful.

---

## 7. Execution evidence

### 7.1 Required evidence fields on `LocalProcessResult`

At minimum:

- prepared request identity (`preparedId`)
- authorization identity (`authorizationId`)
- executable
- argv (as executed)
- cwd
- environment policy identity (`envPolicyId`) — not secret values
- start observation (monotonic timestamp / `hrtime` basis)
- finish observation
- monotonic duration
- process id if spawn succeeded
- exit code (`number | null`)
- signal (`string | null`)
- timeout status
- cancellation status
- termination requested
- termination observed
- stdout byte count / stderr byte count
- capture completeness
- truncation / overflow
- spawn error
- stream error
- cleanup result (including descendant/pipe caveats)

### 7.2 Exit code 0 is only PROCESS EVIDENCE

Exit code 0 does **not** automatically mean:

- test passed
- build succeeded semantically
- requested engineering task succeeded

Validation / CompletionReport composition belongs **above** raw execution (existing `ValidationOutcome`, `EvidenceRecord`, `CompletionReport` in domain).

### 7.3 Feeding future EngineeringRunEvidenceManifest (or equivalent)

**Committed fact:** no type named `EngineeringRunEvidenceManifest` exists at baseline.

**Non-freezing integration path:**

1. `LocalProcessResult` remains the **execution-core** truth object.
2. Upper layers may later map selected fields into `EvidenceRecord` entries using existing `EvidenceKind` values (`EXIT_CODE`, `STDOUT`, `STDERR`, plus future kinds only via amendment if needed).
3. A future run-manifest type — whatever name the Phase 4 Master freezes — should **reference** execution result identities rather than re-implementing process lifecycle.
4. This draft does **not** freeze that future type’s shape.

---

## 8. Implementation map (future work — not done now)

Prefer a bounded new area:

```text
src/execution/
```

### 8.1 Proposed modules

| Path | Role |
|---|---|
| `src/execution/types.ts` | Public + internal type declarations for prepare/auth/result/failures |
| `src/execution/bounds.ts` | Numeric limits (public constants) |
| `src/execution/preparation.ts` | `prepareLocalProcess` |
| `src/execution/authorization.ts` | `explicitLocalProcessApproval`, `authorizePreparedLocalProcess` |
| `src/execution/internal/registry.ts` | WeakMap one-shot registry (private) |
| `src/execution/internal/consume-authorization.ts` | Consume helper (private) |
| `src/execution/execute.ts` | `executeAuthorizedLocalProcess` orchestration |
| `src/execution/internal/process-host.ts` | Private Node spawn/signal/group/stream helper — **sole** `child_process` import in this area |
| `src/execution/environment.ts` | Env allowlist/denylist snapshot builder (does not mutate host env) |
| `src/execution/evidence.ts` | Result assembly / evidence field normalization |
| `src/execution/policy.ts` | disable-action mapping once §1.9 closes |
| `src/execution/index.ts` | Public barrel for execution surface |

### 8.2 Public barrel / package export changes (future)

| File | Why touch |
|---|---|
| `src/index.ts` | Export approved public execution API types/functions only |
| `package.json` `exports` | Remains single `"."` entry unless Master explicitly adds a subpath; prefer root re-exports only |

No public subpath for `src/execution/internal/**`.

### 8.3 Architecture-test / config / foundation changes (future)

| File | Why |
|---|---|
| New `tests/execution/architecture.test.ts` | Authorize sole process owner; forbid DI seams; forbid `shell:true`; import side-effect absence |
| New `tests/execution/*.test.ts` | Finite acceptance matrix (§9) |
| `tests/git/baseline-architecture.test.ts` | Today assumes every dist `child_process` consumer is execFile-only; must be amended to allow the named execution host module and its chosen primitive(s) without weakening Git rules |
| `tests/architecture/public-authority-surface-*` | New public functions must satisfy Constitution Amendment 1 standing guard |
| `src/domain/authority.ts` / `src/config/parser.ts` | **Only if** ActionClass amendment adds a token |
| Foundation amendment doc under `docs/` | **Only if** §1.9 chooses additive amendment |
| Phase 4 Master (future, not this file) | Freezes preflight + scope |

### 8.4 Must NOT modify during this assignment

`src/**`, `tests/**`, ledgers, historical contracts/reports, `package.json`, Vitest config, Phase 3 status docs — unchanged by this commit except the draft path below.

---

## 9. Finite test matrix

Controlled local fixtures only. No paid APIs. No real network. No destructive commands. No `shell: true`. Do not create another generalized TypeScript-detector project. Do not reopen H2.

| # | Case |
|---|---|
| 1 | Successful executable (exit 0) |
| 2 | Nonzero exit |
| 3 | Executable not found / spawn ENOENT |
| 4 | Exact argv fidelity |
| 5 | Argv with spaces |
| 6 | Argv with quotes |
| 7 | Argv with leading dashes |
| 8 | Argv with shell metacharacters as data |
| 9 | No shell interpretation (metacharacters do not invoke shell) |
| 10 | Allowed cwd inside workspace |
| 11 | Outside-workspace cwd refused |
| 12 | Symlinked cwd resolves physically inside workspace |
| 13 | Cwd changed before spawn → refuse |
| 14 | Executable changed before spawn → refuse |
| 15 | Explicit environment applied |
| 16 | No unintended host-secret inheritance |
| 17 | Host `process.cwd()` unchanged |
| 18 | Host `process.env` unchanged |
| 19 | Authorization required |
| 20 | Exact prepared-request binding |
| 21 | Caller mutation after prepare does not affect execution |
| 22 | Replay refusal |
| 23 | Concurrent replay refusal |
| 24 | Spawn failure classification |
| 25 | Timeout initiates termination; result truthful about observation |
| 26 | Signal termination observed |
| 27 | Termination signal ignored → escalation / not-confirmed honesty |
| 28 | Descendant process behavior / group cleanup caveats |
| 29 | Stdout capture |
| 30 | Stderr capture |
| 31 | Stdout overflow (terminate + drain + truncation flags) |
| 32 | Stderr overflow |
| 33 | Output stream error if practically testable |
| 34 | Descendant holding pipe open → cleanup deadline / incomplete capture |
| 35 | Import side-effect absence |
| 36 | Public dependency-injection seam absent |

Fixture strategy: tiny compiled/native helpers or checked-in scripts under `tests/execution/fixtures/` invoked by **absolute path** with `process.execPath` where appropriate.

---

## 10. Integration handoff (Claude Stream A)

### 10.1 Known intended Stream A scope (without inspecting Claude’s worktree)

Claude Stream A owns **test/runtime stabilization** on branch intent `claude/test-stability`.

This Stream B draft only adds documentation. Future implementation on `cursor/phase4-execution-core` will touch execution modules and architecture tests.

### 10.2 Likely dependency / conflict points (baseline-structure analysis only)

| Area | Conflict risk |
|---|---|
| `tests/git/baseline-architecture.test.ts` dist `child_process` sole-primitive assumptions | **High** when execution host lands |
| Global / package `npm run check` timing and flake surfaces | **High** for validation sequencing — Stream A stabilizes harness before full-suite Phase 4 validation |
| `tests/architecture/public-authority-surface-*` | **Medium** when new public execution exports appear |
| `package.json` scripts / Vitest config | **Medium** if Stream A changes harness while Stream B later adds tests |
| `src/git/runner.ts` | **Low** if Phase 4 does not “reuse” Git runner as general executor (this draft forbids that) |
| `src/editing/**` | **Low** if process auth stays separate (required) |
| Ledgers / selfobs | **Low** for this draft; medium later if capability registration is required by Master |
| `src/index.ts` export surface | **Medium** at integration |

Do **not** inspect uncommitted files from Claude’s worktree. Analysis above is from this branch’s committed baseline + known Stream A intent + repository structure.

### 10.3 Isolation until combined review

Future Phase 4 implementation remains isolated until:

1. this proposal is reviewed;
2. required foundation compatibility decisions are resolved (§1.8–1.9, §10 audit, Phase 4 Master);
3. architecture boundary changes are explicitly authorized;
4. implementation is performed;
5. focused execution tests pass;
6. full validation passes using the stabilized harness;
7. combined diff is reviewed.

**A green test run alone does not authorize phase promotion.**  
**Do not prescribe automatic merge** merely because either agent reports PASS.

---

## 11. Decisions summary

### Fully resolved in this draft

- First capability scope and exclusions
- Non-sandboxing honesty statements
- Initial OS support: macOS + Linux only; Windows refused
- Separate authority types from editing; explicit approval mint
- Lifecycle REQUEST→PREPARE→AUTHORIZE→EXECUTE→RESULT
- Consume-before-spawn; no un-consume
- Absolute executable; no PATH lookup in first scope
- Argv immutability / limits / NUL / no shell
- Workspace-canonical cwd + pre-spawn currentness
- Env non-wholesale inherit + allowlist/denylist
- Stdin closed
- Lifecycle state table + completion gate + escalation finiteness
- Overflow = terminate + continue drain + truthful truncation
- Numeric resource limits
- Evidence field set; exit 0 ≠ semantic success
- Module map under `src/execution/`
- Finite test matrix
- Handoff / non-automatic-merge rule
- Git runner remains Git-only; not the Phase 4 public API

### OPEN

| ID | Decision | Evidence required |
|---|---|---|
| OPEN-1 | Constitution §10 audit + Phase 4 Master freeze | Committed audit evidence + frozen Master with preflight |
| OPEN-2 | Exact ActionClass token / disable-action mapping for local process execution | Preflight row + either MAPS_TO_EXISTING citation or additive amendment |
| OPEN-3 | Exact POSIX process-group spawn options in Node | Implementation spike recorded in Master/impl report with macOS+Linux tests (design requires group kill; option bits not frozen here without runtime proof) |
| OPEN-4 | Whether first public API includes `AbortSignal` cancellation | Amendment 1 obligation 8.8 analysis in Master; default in this draft = omit |
| OPEN-5 | Optional executable identity fields beyond absolute path (device/inode) | Platform-stat proof vs flakiness; may remain documented TOCTOU limitation |

---

## 12. Document control

| Field | Value |
|---|---|
| Path | `docs/drafts/PHASE_4_EXECUTION_CORE_PROPOSAL.md` |
| Baseline | `e4de37e90aa4bf43d1618d2fd5ab1fb0dbda40db` |
| Implementation | **None** |
| Merge authorization | **None** |

```text
DRAFT — NOT IMPLEMENTED — NOT AUTHORIZED FOR MERGE
```
