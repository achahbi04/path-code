# PATH CODE — PHASE 3B-H1 ENGINEERING REPORT

**Pass:** Phase 3B-H1 — mutation-time config fail-closed + temp-creation recovery + self-observation status correction (implementation)

**Result:** PASS (corrective implementation; Phase 3B itself remains NOT COMPLETE)

**Starting evidence HEAD:** `035cb5f36b989496b30c289ee931b950bd61fa7d`

**Original defective 3B Commit A (implementation):** `76d106724a129a4101981db88c7c1a4d086fb100`

**Original defective 3B Commit B (capability linkage):** `03e239cc0f7bc30373a25dc8bba6b703845a9435`

**Failed Phase 3B evidence checkpoint:** `035cb5f36b989496b30c289ee931b950bd61fa7d`

**Frozen Phase 3 Master:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**H1 implementation SHA:** intentionally absent; document-only bookkeeping commit will bind it afterward.

**Phase 3C:** not started.

---

## 1. Review classification

| Defect | Classification | Source |
|---|---|---|
| Mutation-time config stale fallback (`prepared.config` after `loadProjectConfig` ConfigFailure) | **BLOCKING_INVARIANT** | Phase 3B evidence FAIL §5 |
| Temp-creation `createTempExclusive` escaping throw | **BLOCKING_INVARIANT** | Phase 3B evidence FAIL recovery matrix |

Both defects were confirmed present at starting evidence HEAD before any corrective edit.

Conflict with frozen Phase 3 Master: **none** — fail-closed deny-path/action recheck and pre-commit recovery are required by the master; H1 restores those semantics without redesigning atomic replacement.

---

## 2. Config correction (Defect 1)

### Exact correction

`resolveMutationConfig` no longer returns success with stale `prepared.config` on loader failure.

- **CASE A — config present and valid:** `loadProjectConfig` success → use `reloaded.value`, freshness `MUTATION_TIME_RE_RESOLVED`.
- **CASE B — config absent:** missing `PATHCODE.md` is a **successful ABSENT** `ResolvedProjectConfig` from the frozen loader — **not** `ConfigFailure` — mutation may continue.
- **CASE C — config exists but load/parse/validation fails:** `ConfigFailure` → `REFUSED_PRECOMMIT` with `refusalReason: "CONFIG_RELOAD_FAILED"` **before** temp creation / write / rename. No fallback, no default, no `SUPPLIED_ONLY` continuation.

Caller-side second fallback (`configResult.ok ? … : prepared.config`) removed.

### ABSENT vs ConfigFailure

Do not conflate:

- ABSENT = loader success with `source.kind === "ABSENT"`.
- ConfigFailure = present-but-unreadable / malformed / invalid encoding / etc.

C1 uses an **unterminated** `pathcode-config` fence (`CONFIG_MALFORMED`). Note: prose-only `PATHCODE.md` without a fence is a successful repository-file load (guidance only), not ConfigFailure — the failed 3B probe wording “broken config without fence” was imprecise relative to loader semantics.

### `SUPPLIED_ONLY` vocabulary

Retained for **pre-reload** terminal refusals only (wrong action, spent auth, bounds, unsupported platform). Documented on `ConfigFreshness` in `src/editing/types.ts`. Not used to continue mutation after reload failure. Successful mutation paths always use `MUTATION_TIME_RE_RESOLVED`.

### Distinguishing refusal reasons

`MutationTimeRefusalReason` on terminal failures:

| Reason | Meaning |
|---|---|
| `CONFIG_RELOAD_FAILED` | Case C loader failure |
| `TARGET_DENIED` | Fresh deny-path hit |
| `ACTION_DISABLED` | Fresh disable-action EDIT mapping |
| `TARGET_STALE` | Before-state mismatch |

---

## 3. Permanent config tests (C1–C4)

| ID | Scenario | Expected | Observed |
|---|---|---|---|
| C1 | Unterminated PATHCODE.md after authorize | `REFUSED_PRECOMMIT`, `CONFIG_RELOAD_FAILED`, `commitPointReached=false`, target unchanged, no temp, auth spent | PASS |
| C2 | Delete PATHCODE.md after authorize | Successful ABSENT reload, mutation SUCCESS, `MUTATION_TIME_RE_RESOLVED` | PASS |
| C3 | Deny-path covering target after authorize | `REFUSED_PRECOMMIT`, `TARGET_DENIED` (not `CONFIG_RELOAD_FAILED`) | PASS |
| C4 | `disable-action = EDIT` after authorize | `REFUSED_PRECOMMIT`, `ACTION_DISABLED` | PASS |

---

## 4. Live falsifications (config)

| ID | Corruption | Focused test | Failed as intended | Exact failure | Restored | Final pass |
|---|---|---|---|---|---|---|
| FAL-C1 | Stale `prepared.config` success fallback restored | C1 | YES | `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` (Received SUCCESS) | YES | YES |
| FAL-C2 | Refuse even successful reload including ABSENT | C2 | YES | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` (Received REFUSED_PRECOMMIT) | YES | YES |
| FAL-C3 | Ignore fresh reload; use `prepared.config` restrictions | C3 | YES | `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` (Received SUCCESS) | YES | YES |

Production restored from H1-good backup after each cycle (`cmp` clean).

---

## 5. Temp-creation correction (Defect 2)

`prepareTempCandidate` now places `createTempExclusive` **inside** the try. On throw:

- returns `failure(Error)` (no escape),
- cleans up only if a handle/artifact is known,
- caller maps to `FAILED_PRECOMMIT`, `commitPointReached=false`, original target unchanged.

No change to temp naming, same-directory placement, `O_EXCL`, collision bounds, or write adapter architecture.

Permanent test: injected `createTempExclusive` via existing `AtomicReplaceFsOps` seam → resolves normally → `FAILED_PRECOMMIT` → no uncaught exception → no known temp.

### FAL-T1

| ID | Corruption | Failed as intended | Exact failure | Restored | Final pass |
|---|---|---|---|---|---|
| FAL-T1 | `createTempExclusive` moved outside try | YES | `expected Error: injected createTempExclusive failure… to be null` | YES | YES |

---

## 6. Escaping-call audit

Classification: **A** already terminal / **B** intentionally cannot throw (Result-returning) / **C** escaping throw defect.

| Call site | Class | Notes |
|---|---|---|
| Platform check `isAtomicReplacePlatformSupported` | B | Sync boolean |
| `loadProjectConfig` / `resolveMutationConfig` | A/B | Result; ConfigFailure → terminal refuse |
| Restriction rechecks / denial / canonicalize | A/B | Result-shaped |
| Before-state `readRepositoryContent` | A/B | Result |
| `lstatTarget` (initial/final) | A | try/catch → terminal |
| `createTempExclusive` | A | inside prepareTempCandidate try (was **C**, fixed) |
| `writeAll` / fsync / fchown / fchmod / read-back / close | A | prepareTempCandidate try |
| Final restriction / currentness / identity | A | Result + cleanup |
| `renameAtomic` | A | try/catch |
| Directory fsync | A | try/catch → durability flag |
| After-state read | A/B | Result → COMMITTED_FAILURE |
| Cleanup close/unlink | A | errors swallowed → `cleanupFailure` |

**No additional Class C defects found.** H1 scope not widened.

---

## 7. Recovery matrix reassessment (existing seams only)

| Recovery point | Result | Evidence |
|---|---|---|
| Temp creation failure | **PASS** | Controlled `createTempExclusive` adapter fault → `FAILED_PRECOMMIT` |
| Partial mid-stream write | **PASS** | `writeAll` seam writes one byte then throws → `FAILED_PRECOMMIT` |
| Failed / zero-progress write | **PASS** | Prior 3B permanent test retained |
| Pre-commit temp fsync / ownership / chmod / candidate mismatch | **PASS** | Prior 3B evidence + architecture unchanged |
| Final content revalidation | **PASS** | Prior concurrency test |
| Rename failure | **PASS** | Prior 3B evidence |
| Cleanup unlink failure | **PASS** | `unlink` inject after concurrency-triggered cleanup → `cleanupFailure: true` |
| Post-commit directory fsync | **PASS** | Prior permanent test |
| After-state hash/length mismatch | **PASS** | `renameAtomic` seam corrupts target after rename → `COMMITTED_FAILURE` |
| After-state read failure | **NOT PERFORMED** | After-state uses `readRepositoryContent` (no `AtomicReplaceFsOps` seam); isolating without a new generic mock/architecture change is not available |

---

## 8. Preserved 3B mechanisms

Verified unchanged in intent/structure: one-shot auth; bounds-before-fs; platform refusal; lexical + physical denial; canonical/workspace recheck; two full before-state comparisons; same-size/same-mtime protection; regular-file / nlink>1 / dev-ino checks; same-dir temp; O_EXCL; bounded collisions; partial-write loop; temp fsync; uid/gid/mode; candidate read-back; final before-state; atomic rename; dir fsync; after-state; COMMITTED_FAILURE without rollback; byte fidelity; `PATH_CODE_MODIFIED` success-only; KnowledgeInvalidation; no Git mutation; no hidden persistence; single write module `atomic-fs.ts`.

Existing F1–F9 targeted permanent tests retained (full 3B live re-corruption not re-run inside H1).

---

## 9. Runtime / validation (implementation tree)

Baseline at starting evidence HEAD: **492** tests.

H1 permanent additions: C1–C4, temp-create, partial mid-stream, cleanup unlink, after-state mismatch → **+8** → expected **500** at Commit A validation.

Phase 3B remains **NOT COMPLETE** pending full evidence re-run after H1 bookkeeping.

---

## 10. Gap Ledger (implementation commit)

Opened reviewed records (OPEN; not closed in this commit):

- **GAP-038** — Mutation-time config stale fallback — BLOCKING_INVARIANT
- **GAP-039** — Temp-creation escaping throw — BLOCKING_INVARIANT

Closure and capability honest-interim downgrade are deferred to the document-only bookkeeping commit.

---

## 11. Explicit non-claims

- This report does **not** freeze Phase 3B.
- H1 does **not** by itself certify `existing-file-replacement` as `PASS_FROZEN`.
- Full Phase 3B evidence completion re-audit is **not** performed inside H1.
- Phase 3C is absent.

---

## 12. Not Validated

- Full Phase 3B F1–F9 live corruption re-run
- After-state read-failure isolation without new seams
- Windows / non-POSIX atomic-replace platforms (still refused)
- Extended metadata preservation (GAP-037)
- Hostile residual race (GAP-035)
- Crash-orphan temps (GAP-036)
