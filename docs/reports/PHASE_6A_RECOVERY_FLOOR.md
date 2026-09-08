# PHASE 6A — RECOVERY FLOOR

**Result: PASS**

```text
PHASE 6A RECOVERY FLOOR IMPLEMENTED
— PRE-EDIT STATE PRESERVED BEFORE WRITE
— RECOVERY EXPLICITLY AUTHORIZED
— CONFLICTING LATER WORK NEVER OVERWRITTEN
— CORRUPT RECOVERY STATE FAILS CLOSED
— PARTIAL RECOVERY REPORTED PER FILE
— REAL-REPOSITORY MUTATION STILL NOT ENABLED
```

---

## SHA concepts (deliberately distinct)

| Concept | Value | Meaning |
|---|---|---|
| **IMPLEMENTATION SHA** | `ded28f9724ae43d836877116bfd7ab7486c3362a` | Commit on which focused + canonical validation ran |
| **BRANCH TIP SHA** | `ded28f9724ae43d836877116bfd7ab7486c3362a` *(updated after docs commit)* | Tip after report recording |

Do not call both “Final SHA”.

---

## Part A — Phase 5F freeze

| Item | Value |
|---|---|
| Accepted Phase 5F main SHA (local FF) | `8c3b5df5df7d8b7e6f947a1ccc5c3e67d0c30a63` |
| Phase 6A starting SHA | `8c3b5df5df7d8b7e6f947a1ccc5c3e67d0c30a63` |
| Feature branch | `cursor/phase6a-recovery-floor` |
| Main worktree | `/Users/achahbi/Projects/path-code` @ `8c3b5df…` |
| Feature worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Live success report | `docs/reports/PHASE_5F_LIVE_TRIAL_SUCCESS.md` (operator-observed; not implementer-reproduced) |
| Push / remote merge | **not performed** |

Main canonical after FF: **PASS** (`npm run check` exit 0).

---

## Architecture

### Owner package

`src/recovery/` — package-internal barrel (`src/recovery/index.ts`).  
**Not** exported from `src/index.ts` or package root exports.

| Module | Role |
|---|---|
| `store.ts` / `store-fs.ts` | Injectable filesystem RecoveryStore (outside target workspace) |
| `checkpoint.ts` | Prepare / persist / load / integrity |
| `observe.ts` | Fresh Path Code content observation |
| `review.ts` | `prepareRecoveryReview` — classify vs pre + intended post |
| `authorization.ts` / `binding.ts` / `internal/*` | Host-only `RecoveryAuthorization` mint, WeakMap, one-shot consume |
| `execute.ts` | Authorized per-file restore with TOCTOU re-observation |

### Recovery protection mutation integration

`EngineeringMutationSessionSpec.recoveryProtection`: `"REQUIRED" | "NONE"` (default **`NONE`** for Trial 1 backward compatibility).

When **`REQUIRED`**:

1. Host must supply `recoveryStore` (refuse open if missing — no silent downgrade).
2. In `session.apply`, after Gate 1 applicability and **before any mutation write**:
   - capture exact pre-bytes (REPLACE) or prove absence (CREATE)
   - capture approved intended post-bytes
   - `prepareCheckpoint` → `persistCheckpoint` → read-back verify
3. Failure → `RECOVERY_CHECKPOINT_NOT_ESTABLISHED` / zero mutation writes.

Checkpoint id surfaces on `session.describe().recoveryCheckpointId`.

### Checkpoint durability scope

- Committed to local filesystem **before** mutation begins
- Independently reopenable after process restart (new `createRecoveryStore` instance)
- Integrity read-back required
- Atomic temp → fsync → rename where supported
- **Does not** claim protection against every hardware/power-loss failure
- Encryption / retention policy: **outside Phase 6A** (not claimed)

### Checkpoint integrity scheme

- Versioned manifest (`RECOVERY_MANIFEST_SCHEMA_VERSION`)
- Independent blob digests: SHA-256 + byteLength (`node:crypto`)
- Manifest structural validation + workspace binding (`workspace.canonicalize(".")`)
- Fail-closed:
  - **Manifest corrupt / unsupported / wrong workspace** → refuse entire review; zero writes
  - **One blob missing/corrupt** → that entry `RECOVERY_ENTRY_INVALID`; verified siblings may proceed
- Corruption/truncation **detection**, not malicious-tamper authenticity

### Storage location (tests / smoke)

- Injectable absolute store root
- Tests & smoke: OS temp directory **outside** the disposable workspace
- POSIX modes: directories `0o700`, files `0o600` where supported
- No Git objects; no credentials; no provider bodies

### Preimage / intended-post semantics

| Kind | Pre-state | Intended post |
|---|---|---|
| REPLACE_TEXT | Exact observed UTF-8 bytes at capture (fingerprint-matched to preparation) | Exact `prepared.proposedBytes` |
| CREATE_TEXT | Proven **ABSENT** | Exact created-file bytes |

No Git HEAD reconstruction. No model-supplied preimage.

### Conflict / currentness

Reuse Path Code reader observation + SHA-256 fingerprint equality (not mtime/size alone).

At review and again immediately before each restore action:

- exact intended post → eligible restore
- exact pre / expected absence → `ALREADY_PRE_STATE` / `NOT_APPLIED`
- neither → `RECOVERY_CONFLICT` (skip; never overwrite)

### RecoveryReview / RecoveryAuthorization

- Review is immutable, bound to checkpoint + fresh observations + proposed actions; grants **no** authority
- Authorization: host-only `explicitRecoveryApproval()` + `authorizeRecoveryReview(...)`
- Bound to exact review + selected eligible entry ids
- Not mintable by model / Brain / adapters / checkpoint data
- Execute consumes one-shot; TOCTOU re-observation can still refuse a selected file

### REPLACE_TEXT / CREATE_TEXT recovery

- REPLACE: write exact checkpoint pre-bytes → re-observe prove pre restored
- CREATE: remove file only if still exact intended post → re-observe prove absence
- Never remove directories; never leave workspace; unsupported kinds refused

### Multi-file / interruption

- Per-entry dispositions (`RESTORED`, `RECOVERY_CONFLICT`, `NOT_APPLIED`, …)
- Aggregate `RECOVERY_PARTIAL` when mixed
- Checkpoint covers full approved set before first write; only applied entries restore

### Idempotence

Second review after success sees pre-state; no destructive rewrite.

### Explicit non-behaviors

| Forbidden | Status |
|---|---|
| Git `checkout` / `restore` / `reset --hard` for recovery | absent (architecture proof) |
| Automatic rollback on validation failure | absent (6A-S) |
| Recovery as Gate 2 / Validation evidence | absent (6A-T) |
| Auto-delete checkpoints | retained |
| Model RecoveryAuthorization | impossible via registry brand |
| Real-repository / Phase 5G enablement | **not enabled** |

---

## Proof map 6A-A … 6A-T

| ID | Coverage |
|---|---|
| 6A-A | `tests/recovery/mutation-integration.test.ts` — REQUIRED without store; persist failure; drifted pre-state; zero writes |
| 6A-B | same — Git HEAD ≠ observed B; recover B not A; no Git restore |
| 6A-C | `tests/recovery/checkpoint.test.ts` — fresh store instance reopen |
| 6A-D | `tests/recovery/execute.test.ts` — REPLACE restore exact pre-bytes |
| 6A-E | same — CREATE remove exact created file |
| 6A-F | `tests/recovery/review.test.ts` — replaced file externally modified → conflict |
| 6A-G | same — created file externally modified → conflict |
| 6A-H | same — same size/mtime, different content → conflict |
| 6A-I | `tests/recovery/execute.test.ts` — TOCTOU after review |
| 6A-J | same — multi-file `RECOVERY_PARTIAL` |
| 6A-K | `tests/recovery/mutation-integration.test.ts` — interrupted / mixed live state |
| 6A-L | `tests/recovery/checkpoint.test.ts` — manifest corruption refuses all |
| 6A-M | same — blob corruption invalidates one entry |
| 6A-N | same — workspace mismatch refuses all |
| 6A-O | `tests/recovery/review.test.ts` — symlink / path escape |
| 6A-P | execute + architecture — no/forged/consumed auth; import boundary |
| 6A-Q | execute — second pass no destructive action |
| 6A-R | execute — CRLF / tabs / unicode / missing newline fidelity |
| 6A-S | mutation-integration + architecture — no auto-recovery on validation failure |
| 6A-T | architecture — recovery does not feed Gate 2 / validation evidence |

---

## Validation

### Focused

- `tests/recovery/**` + mutation + write-boundary: **PASS** (81 tests in that focused set)
- `npm run build && npm run recovery:smoke`: **PASS** (`RECOVERY_SMOKE: PASSED`, store outside workspace, byte proof matched)

### Canonical

1. `npm run check` on Phase 6A worktree after implementation: **PASS** (exit 0; ledger at pre-implementation tip during verify is expected until commit; full typecheck/build/test/cli:smoke green)

Zero live provider calls. Zero credentials.

---

## Worktree status at report authorship

| Worktree | Branch | HEAD | Status |
|---|---|---|---|
| Feature | `cursor/phase6a-recovery-floor` | IMPLEMENTATION SHA above | clean after implementation commit; this docs commit follows |
| Main | `main` | `8c3b5df5df7d8b7e6f947a1ccc5c3e67d0c30a63` | clean |

Phase 6A **not** merged to main. No push.
