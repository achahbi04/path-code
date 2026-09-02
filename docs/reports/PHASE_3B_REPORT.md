# PATH CODE — PHASE 3B MULTITASK ENGINEERING REPORT

**Phase:** 3B — Existing-File Atomic Replacement

**Phase 3 Safe Editing Master Contract:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**Phase 3A implementation freeze:** `087a30ff6fcf75eec695825593e1a1f98ee383f4`

**Self-Observation foundation:** `3c40a1163b708ef46e8d596c874f92aaa5b5598f`

**Implementation Commit A:** `76d106724a129a4101981db88c7c1a4d086fb100` — *Implement Path Code Phase 3B existing-file atomic replacement*

**Capability linkage Commit B:** `03e239cc0f7bc30373a25dc8bba6b703845a9435` — *Record Phase 3B existing-file-replacement capability ledger linkage*

**Final linkage HEAD:** `03e239cc0f7bc30373a25dc8bba6b703845a9435`

**Result:** **FAIL** — mutation-time config fail-closed obligation (spec B) not proven; live evidence shows stale-config fallback permits mutation after `loadProjectConfig` failure. Phase 3B ledger linkage at HEAD remains mechanically valid; evidence completion does **not** certify fail-closed config reload.

---

## 0. Master-contract obligation check

Verified frozen master at `58439d90cfb0b786137454d21bc88f994fcd0270`: **SE-001 through SE-020** present with exact frozen titles and wording. Report matrix below uses those titles verbatim.

---

## 1. Git freeze / capability linkage

| Check | Result |
|---|---|
| Commit A message | **PASS** — `Implement Path Code Phase 3B existing-file atomic replacement` |
| Commit B linkage | **PASS** — `Record Phase 3B existing-file-replacement capability ledger linkage` |
| `npm run ledger:verify` at FINAL HEAD `03e239c` | **PASS** |
| Derivation test: `existing-file-replacement` → `PASS_FROZEN` | **PASS** (`tests/selfobs/derivation.test.ts`) |
| Derivation test: `safe-editing` → `DECLARED` | **PASS** |
| Production diff after all falsifications | **PASS** — empty (`git diff` clean at HEAD) |

---

## 2. Proof-obligation matrix (SE-001..SE-020)

Uses exact frozen obligation titles. Status vocabulary: `SATISFIED_FOR_EXISTING_FILE_REPLACEMENT` | `FOUNDATION_EVIDENCE_ONLY` | `NOT_IN_3B`.

| ID | Obligation (frozen title) | Status | Evidence |
|---|---|---|---|
| SE-001 | NO UNVERIFIED MUTATION | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Two full Phase 2B before-state hash comparisons; F2/F3/F4 live falsifications |
| SE-002 | AUTHORIZATION BINDS EXACT BYTES | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Consumption binds exact prepared mutation; F9 byte-fidelity falsification |
| SE-003 | NO UNAUTHORIZED MUTATION | **FOUNDATION_EVIDENCE_ONLY** | 3A authorization contracts + 3B consumption gate before fs contact |
| SE-004 | NO AUTONOMOUS AUTHORITY | **FOUNDATION_EVIDENCE_ONLY** | 3A no public success issuer; registry-bound authorization |
| SE-005 | AUTHORIZATION IS SINGLE-USE | **FOUNDATION_EVIDENCE_ONLY** | 3A registry semantics; F5 live falsification; 3B consumes on entry |
| SE-006 | DENIED PATHS ARE NEVER MUTATED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Mutation-time lexical + physical denial recheck |
| SE-007 | NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Type/nlink/identity checks; F7 live falsification |
| SE-008 | EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Same-directory `O_EXCL` temp + rename; Windows refused pre-temp |
| SE-009 | PRE-COMMIT RECOVERY | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Recovery matrix (controlled adapter + real fs); temp-creation seam defect noted |
| SE-010 | AFTER-STATE IS VERIFIED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Phase 2B after-read hash/length gate on SUCCESS |
| SE-011 | PROVENANCE IS EARNED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | `PATH_CODE_MODIFIED` only on verified SUCCESS |
| SE-012 | EXACT AUTHORIZED BYTES ONLY | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | No normalization; F9 live falsification |
| SE-013 | BOUNDS HOLD | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | `MAX_EDIT_FILE_BYTES` before first fs contact |
| SE-014 | NO DURABLE HIDDEN PATH CODE STATE | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Transient temp only; no journal/undo DB |
| SE-015 | KNOWLEDGE INVALIDATED, NOT REPAIRED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | `KnowledgeInvalidation` on SUCCESS and committed failure |
| SE-016 | WRITE BOUNDARY HOLDS | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Single write module `atomic-fs.ts`; F1 live falsification |
| SE-017 | CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | Final pre-commit re-read + identity recheck; F3 live falsification |
| SE-018 | GIT SAFETY | **SATISFIED_FOR_EXISTING_FILE_REPLACEMENT** | No Git execution in editing; UNMERGED refusal when context supplied |
| SE-019 | SAFE CREATION | **NOT_IN_3B** (3C) | — |
| SE-020 | MULTI-FILE PARTIAL HONESTY | **NOT_IN_3B** (3D) | — |

---

## 3. Recovery matrix (mandatory recovery points)

Legend: **PASS** = observed via real filesystem or controlled `AtomicReplaceFsOps` fault at FINAL HEAD; **NOT PERFORMED** = not observed this pass; **NOT DETERMINISTICALLY PERFORMABLE** = no reliable seam without unsafe mock.

| Recovery point | Result | Evidence |
|---|---|---|
| Temp creation failure | **NOT DETERMINISTICALLY PERFORMABLE** (defect) | Injected `createTempExclusive` throw propagates uncaught from `prepareTempCandidate` (outside inner try); does not surface `FAILED_PRECOMMIT` |
| Partial write (mid-stream) | **NOT PERFORMED** | `writeAll` seam exists; zero-progress path observed instead |
| Failed / zero-progress write | **PASS** | `writeAll` inject → `FAILED_PRECOMMIT`, original bytes preserved (`replace-existing-file.test.ts`) |
| Pre-commit temp fsync failure | **PASS** | Live adapter inject (evidence run) → `FAILED_PRECOMMIT`, original preserved |
| Ownership (`fchown`) failure | **PASS** | Live adapter inject → `FAILED_PRECOMMIT`, original preserved |
| Chmod failure | **PASS** | Live adapter inject → `FAILED_PRECOMMIT`, original preserved |
| Candidate read-back / hash mismatch | **PASS** | F6 live falsification (controlled corrupted read-back) |
| Final content revalidation failure | **PASS** | Concurrency test: external write during temp prep → `FAILED_PRECOMMIT` |
| Rename failure | **PASS** | Live `renameAtomic` inject → `FAILED_PRECOMMIT`, original preserved, temp cleaned |
| Cleanup unlink failure | **NOT PERFORMED** | `cleanupTemp` seam exists; isolated inject not observed this pass |
| Post-commit directory fsync failure | **PASS** | `fsyncDirectory` inject → `COMMITTED_FAILURE`, new bytes remain, no rollback |
| After-state read failure | **NOT PERFORMED** | Post-commit reader failure not isolated without module mock |
| After-state hash/length mismatch | **NOT PERFORMED** | Would require post-rename reader corruption mock |

---

## 4. Live falsification evidence (F1–F9)

All performed at FINAL HEAD with production restored to clean tree after each cycle.

| ID | Corruption applied | Focused test | Failed as intended | Exact failure output | Restored | Final pass |
|---|---|---|---|---|---|---|
| F1 | Added `writeFile(` to `replace-existing-file.ts` | `write-boundary.test.ts` | **YES** | `violations` included `src/editing/replace-existing-file.ts matched /writeFile/` | **YES** | **YES** |
| F2 | Bypassed initial `refuseIfBeforeMismatch` | `refuses stale content before temp staging` | **YES** | `expected 'FAILED_PRECOMMIT' to be 'REFUSED_PRECOMMIT'` | **YES** | **YES** |
| F3 | Bypassed final `refuseIfBeforeMismatch` | `refuses content changed during temp preparation` | **YES** | `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` | **YES** | **YES** |
| F4 | Bypassed hash check in `refuseIfBeforeMismatch` | `refuses same-size same-mtime changed bytes` | **YES** | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` (received SUCCESS) | **YES** | **YES** |
| F5 | Permitted authorization replay in `consumeEditAuthorization` | `one-shot consumption semantics` | **YES** | `expect(second.ok).toBe(false)` received `true` | **YES** | **YES** |
| F6 | Bypassed candidate verification; injected corrupted `readCandidateBytes` | Dedicated candidate-verification probe | **YES** | `expected 'FAILED_PRECOMMIT' to be 'SUCCESS'` (received SUCCESS with bypass) | **YES** | **YES** (probe: `FAILED_PRECOMMIT` with verification restored) |
| F7 | Bypassed `nlink > 1` refusal | `refuses hard-linked targets` | **YES** | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` | **YES** | **YES** |
| F8 | (No corruption — observes honest no-rollback) | `reports committed failure without rollback` | **N/A** | Observed: `COMMITTED_FAILURE`, `commitPointReached: true`, target holds new bytes | **N/A** | **YES** |
| F9 | Normalized bytes in temp staging (`trim()` + `\n`) | `preserves CRLF, BOM, trailing spaces, and binary bytes` | **YES** | `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` | **YES** | **YES** |

**F6 exact failure with bypass (step 4):**

```
AssertionError: expected 'FAILED_PRECOMMIT' to be 'SUCCESS'
Expected: "FAILED_PRECOMMIT"
Received: "SUCCESS"
```

With verification restored, corrupted read-back probe returns `FAILED_PRECOMMIT` as intended.

---

## 5. Mutation-time config re-resolution audit

### A. Dependency direction — **PASS**

- `src/editing/replace-existing-file.ts` → `loadProjectConfig` (only new editing→config edge).
- Architecture tests confirm lower Phase 1/2 modules do not import editing (`tests/editing/architecture.test.ts`).

### B. Config failure fail-closed — **FAIL**

Observed implementation (`resolveMutationConfig`):

```typescript
const reloaded = await loadProjectConfig(prepared.workspace);
if (reloaded.ok) {
  return success({ config: reloaded.value, freshness: "MUTATION_TIME_RE_RESOLVED" });
}
return success({ config: prepared.config, freshness: "SUPPLIED_ONLY" });
```

On `loadProjectConfig` failure, mutation proceeds with **stale `prepared.config`** (`SUPPLIED_ONLY`). This violates required fail-closed semantics:

- Does **not** refuse before temp creation
- **Does** substitute previously resolved config for failed reload

**Live probe:** after successful prepare/authorize, write broken `PATHCODE.md` (`broken config without fence`) immediately before mutation.

| Expected (fail-closed) | Observed |
|---|---|
| `REFUSED_PRECOMMIT` before temp | `SUCCESS` |
| `commitPointReached: false` | `commitPointReached: true` |
| no stale-config fallback | `configFreshness: "SUPPLIED_ONLY"` |

Exact test failure:

```
AssertionError: expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'
Expected: "REFUSED_PRECOMMIT"
Received: "SUCCESS"
```

**Falsification (permissive fallback detection):** focused fail-closed probe **FAILS against current production** without temporary corruption — confirms detector is live. Temporary bypass to more-permissive default was not required to observe violation.

### C. Provenance — **PARTIAL**

When reload succeeds, config is legitimate `ResolvedProjectConfig` via frozen loader (`MUTATION_TIME_RE_RESOLVED`). On reload failure, provenance chain breaks (stale supplied config).

### D. No side effect on Phase 2 — **PASS**

No Phase 2 consumer modules modified for 3B.

### E. Architecture / integration test — **MISSING (defect exposed)**

No committed test yet encodes fail-closed mutation-time config behavior. Ad-hoc probe used for this evidence pass fails against HEAD, as required to expose the defect.

**STOP AND REPORT:** Do **not** treat 3B config reload as frozen/certified until `resolveMutationConfig` refuses on loader failure.

---

## 6. Capability states (FINAL HEAD `03e239c`)

| Capability | Verified state | Notes |
|---|---|---|
| `existing-file-replacement` | **PASS_FROZEN** | Ledger linkage + derivation test pass at HEAD |
| `safe-editing` | **DECLARED** | Parent capability; ledger:verify derivation PASS |
| `edit-contracts` | **PASS_FROZEN** | Ancestor 3A freeze |

---

## 7. Final-head validation

| Check | Result |
|---|---|
| `git rev-parse HEAD` | `03e239cc0f7bc30373a25dc8bba6b703845a9435` |
| `npm run ledger:verify` | **PASS** |
| `npm run check` | **PASS** |
| Runtime tests | **492 passed** (55 files) |
| Working tree (pre-docs-commit) | **clean** |

---

## 8. Scope summary

Phase 3B introduces bounded existing regular-file content replacement:

- One-shot authorization consumption before filesystem contact
- Two full Phase 2B before-state comparisons
- Same-directory temp candidate (`O_CREAT|O_EXCL`), metadata preservation, candidate verification
- Atomic rename + directory fsync (POSIX darwin/linux; Windows refused)
- After-state verification; distinct terminal outcomes
- `EditRecord` + `PATH_CODE_MODIFIED` on verified success only

**Not in 3B:** creation (3C), multi-file (3D), deletion, Git mutation, auto-rollback.

---

## 9. Gap Ledger

| ID | Classification | Lifecycle |
|---|---|---|
| GAP-002 | Reused — live Windows validation | OPEN_REQUIRES_EXTERNAL_CONDITION |
| GAP-035 | Residual rename-window race | OPEN |
| GAP-036 | Crash-orphan temp candidate | OPEN |
| GAP-037 | Extended metadata not proven | OPEN |

No new gap entries added in this evidence pass.

---

## 10. Not Validated

- Mutation-time config fail-closed (blocking for evidence completion — see §5)
- Temp creation failure uncaught propagation (recovery seam defect)
- Residual race between final revalidation and atomic rename
- No hostile concurrent-filesystem immunity claim
- Crash before handled cleanup may leave orphan temp
- Extended ACL/xattr/resource-fork/ADS preservation not proven
- Live Windows atomic replacement/directory durability (GAP-002)
- Partial write mid-stream recovery not observed
- Cleanup unlink failure in isolation not observed
- After-state read/mismatch failures not observed without reader mock
- Phase 3C creation absent; Phase 3D multi-file absent

---

## 11. Unresolved issues (blocking evidence completion)

1. **`resolveMutationConfig` stale fallback** — `loadProjectConfig` failure must refuse before temp creation; current code mutates with `SUPPLIED_ONLY` stale config.
2. **Temp creation error propagation** — `createTempExclusive` failure outside inner try may escape as uncaught exception rather than terminal `FAILED_PRECOMMIT`.

**Next permitted action:** review/fix config fail-closed behavior in a dedicated H-pass; re-run config probe + recovery temp-creation probe; then re-audit evidence. Do **not** start Phase 3C until resolved and re-verified.

---

## 12. Git

| Item | Value |
|---|---|
| Commit A | `76d106724a129a4101981db88c7c1a4d086fb100` |
| Commit B / FINAL HEAD | `03e239cc0f7bc30373a25dc8bba6b703845a9435` |
| Evidence docs commit | pending (this report) |
| Push | **NO** |
