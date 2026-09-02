# PATH CODE — PHASE 3B EVIDENCE COMPLETION — FULL RE-RUN REPORT

**Result:** **COMPLETE**

**Baseline HEAD:** `6889fff87e08d6e5db1465f903357bdd217efbac`

**Supersedes for progression (failed evidence):** `035cb5f36b989496b30c289ee931b950bd61fa7d`

**Corrected implementation:** `ad85c9f1262635f9a81b5608b20c198a7b8b489d`

**H1 bookkeeping baseline:** `6889fff87e08d6e5db1465f903357bdd217efbac`

**Evidence commit SHA:** intentionally absent in this document; capability linkage Commit D binds the immutable evidence commit.

**Frozen Phase 3 Master:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**Phase 3C:** not started.

---

## Master contract

Verified directly via `git show 58439d90:docs/PHASE_3_SAFE_EDITING_MASTER.md`. **SE-001 through SE-020** present with exact frozen titles (verbatim below). No renumbering.

---

## SE obligation matrix (corrected implementation at `ad85c9f`)

| ID | Frozen title | Status | Mechanism | Evidence | Directly exercised this run | Committed test relied upon |
|---|---|---|---|---|---|---|
| SE-001 | NO UNVERIFIED MUTATION | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | `replaceExistingFile` one-shot auth + before-state gates | F2/F3/F5 live falsifications; architecture tests | partial (F2/F3/F5) | success/refusal tests |
| SE-002 | AUTHORIZATION BINDS EXACT BYTES | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | `prepareModifyExistingFile` + `PreparedMutation` | byte fidelity test; F9 | F9 | `preserves CRLF, BOM…` |
| SE-003 | NO UNAUTHORIZED MUTATION | FOUNDATION_EVIDENCE_ONLY | 3A authorization contracts | 3A PASS_FROZEN; editing architecture | no (3A scope) | `authorization.test.ts` |
| SE-004 | NO AUTONOMOUS AUTHORITY | FOUNDATION_EVIDENCE_ONLY | explicit approval required | 3A contracts | no (3A scope) | `authorization.test.ts` |
| SE-005 | AUTHORIZATION IS SINGLE-USE | FOUNDATION_EVIDENCE_ONLY | `consumeEditAuthorization` registry | F5 live falsification | F5 | `implements one-shot consumption semantics` |
| SE-006 | DENIED PATHS ARE NEVER MUTATED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | mutation-time `runRestrictionRechecks` + `refuseIfTargetDenied` | C3; F12; config audit D1 | C3/F12 | C3 permanent test |
| SE-007 | NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | canonicalization + physical denial + metadata checks | editing architecture; preparation tests | no | architecture + preparation |
| SE-008 | EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | same-dir temp + O_EXCL + atomic rename | atomic-fs architecture; success test | no | success + architecture |
| SE-009 | PRE-COMMIT RECOVERY | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | `prepareTempCandidate` try + cleanup | recovery matrix (temp/partial/fsync/fchown/fchmod/rename) | yes (adapter faults) | recovery tests |
| SE-010 | AFTER-STATE IS VERIFIED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | post-rename read + mismatch → COMMITTED_FAILURE | after-state mismatch test; F8 observation | partial | committed mismatch test |
| SE-011 | PROVENANCE IS EARNED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | `PATH_CODE_MODIFIED` success-only | success test provenance field | no | success test |
| SE-012 | EXACT AUTHORIZED BYTES ONLY | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | candidate read-back + byte loop | F6; F9 | F6/F9 | byte fidelity + F6 probe |
| SE-013 | BOUNDS HOLD | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | `MAX_EDIT_FILE_BYTES` pre-reload | bounds tests | no | `bounds.test.ts` |
| SE-014 | NO DURABLE HIDDEN PATH CODE STATE | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | temp prefix cleanup; hidden-state scan | controlled scan (see below) | yes | success temp absence check |
| SE-015 | KNOWLEDGE INVALIDATED, NOT REPAIRED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | invalidation on success + committed failure | F8 observation | F8 | post-commit fsync test |
| SE-016 | WRITE BOUNDARY HOLDS | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | single module `src/editing/atomic-fs.ts` | F1; source/dist scans | F1 | `write-boundary.test.ts` |
| SE-017 | CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | final before-state compare | F3; concurrency test | F3 | concurrency + F3 |
| SE-018 | GIT SAFETY | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | no Git mutation in editing | editing architecture | no | editing architecture |
| SE-019 | SAFE CREATION | **NOT_IN_3B** (Phase 3C) | — | — | — | — |
| SE-020 | MULTI-FILE PARTIAL HONESTY | **NOT_IN_3B** (Phase 3D) | — | — | — | — |

---

## Three-config governance

| Config | Governs | Stale consultation |
|---|---|---|
| CONFIG 1 — preparation (`prepared.config` in object) | preparation-time eligibility only | must not grant mutation-time permission after reload |
| CONFIG 2 — authorization-time | authorization-time eligibility only | must not grant mutation-time permission after reload |
| CONFIG 3 — mutation-time re-resolved | deny-path, disable-action, reader/config-dependent checks at mutation | **only** `resolveMutationConfig` success path (`MUTATION_TIME_RE_RESOLVED`) |
| CONFIG 3 failure | `REFUSED_PRECOMMIT` / `CONFIG_RELOAD_FAILED` | no fallback (F10 proves regression caught) |
| CONFIG 3 ABSENT | successful loader ABSENT | mutation eligible (C2/F11) |

**Config grants authority:** NO — verified in source; config only restricts or permits continuation of already-authorized operation.

**SUPPLIED_ONLY after reload attempt:** NO successful mutation path uses `SUPPLIED_ONLY` after reload. Legitimate `SUPPLIED_ONLY` only on pre-reload terminal refusals (`preReloadRefusal`, config-failure record metadata before reload completes).

---

## F1–F12 falsifications (live, this run, restored)

All corruptions applied to **current** `ad85c9f` sources, observed failure captured, exact source restored (`git diff src/editing` empty after each cycle).

| ID | Applied | Focused test failed | Exact failure | Restored | Final pass |
|---|---|---|---|---|---|
| F1 | second-module `writeFile(` in `authorization.ts` | YES | `AssertionError: expected [ Array(1) ] to deeply equal []` | YES | YES |
| F2 | bypass initial `refuseIfBeforeMismatch` | YES | `expected 'FAILED_PRECOMMIT' to be 'REFUSED_PRECOMMIT'` | YES | YES |
| F3 | bypass final `refuseIfBeforeMismatch` | YES | `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` | YES | YES |
| F4 | byteLength-only mismatch check | YES | `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | YES | YES |
| F5 | bypass consumed check | YES | `expected true to be false` | YES | YES |
| F6 | bypass candidate verification + corrupted read-back | YES | `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` | YES | YES |
| F7 | bypass `nlink > 1` refusal | YES | `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | YES | YES |
| F8 | observation (no corruption) | N/A | `COMMITTED_FAILURE`, `commitPointReached=true`, new bytes remain, no rollback | N/A | YES |
| F9 | normalize bytes in staging | YES | `expected 'FAILED_PRECOMMIT' to be 'SUCCESS'` | YES | YES |
| F10 | stale `prepared.config` fallback on ConfigFailure | YES | `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | YES | YES |
| F11 | refuse even on successful reload | YES | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` | YES | YES |
| F12 | ignore fresh reload; use `prepared.config` restrictions | YES | `expected undefined to be 'TARGET_DENIED'` | YES | YES |

Machine-readable capture: `/tmp/pc-3b-audit-results.json` (ephemeral runner output, not committed).

---

## Recovery matrix

| Point | Result | Evidence class | Pre/post | Notes |
|---|---|---|---|---|
| Temp creation failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | committed temp-create test |
| Partial mid-stream write | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | committed partial test (re-run this audit) |
| Failed / zero-progress write | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | committed writeAll throw test |
| Pre-commit temp fsync failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | audit recovery probe (this run) |
| Ownership preservation failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | audit recovery probe (this run) |
| Chmod / mode preservation failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | audit recovery probe (this run) |
| Candidate read-back mismatch | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | F6 + concurrency test |
| Final content revalidation failure | **PASS** | REAL_FILESYSTEM | pre-commit | concurrency test |
| Rename failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | audit recovery probe (this run) |
| Cleanup unlink failure | **PASS** | CONTROLLED_ADAPTER_FAULT | pre-commit | committed cleanup test (re-run) |
| Post-commit directory fsync failure | **PASS** | CONTROLLED_ADAPTER_FAULT | post-commit | committed fsync test |
| Post-commit after-state read failure | **NOT PERFORMED** | N/A | post-commit | no existing `AtomicReplaceFsOps` seam for `readRepositoryContent` |
| Post-commit after-state hash/length mismatch | **PASS** | CONTROLLED_ADAPTER_FAULT | post-commit | committed rename seam mismatch test (re-run) |
| Mutation-time config reload failure | **PASS** | REAL_FILESYSTEM | pre-commit | C1 permanent test |

Pre-commit failures: `commitPointReached=false`, original fingerprint/bytes preserved, auth spent per 3A (C1/C3 verify second call still refuses).

---

## Mutation-time config audit (A–G)

| Item | Result |
|---|---|
| A. Dependency direction | PASS — editing → config loader only; lower modules do not import editing |
| B. Config failure fail-closed | PASS — C1 + F10 |
| C. ABSENT ≠ failure | PASS — C2 + F11 |
| D1. Fresh deny-path | PASS — C3 + F12 |
| D2. Fresh disable-action | PASS — C4 |
| E. Provenance | PASS — `MUTATION_TIME_RE_RESOLVED` from frozen loader |
| F. Committed tests | PASS — C1–C4 in `replace-existing-file.test.ts` |
| G. SUPPLIED_ONLY | PASS — no post-reload continuation under `SUPPLIED_ONLY` |

---

## Write boundary

| Item | Value |
|---|---|
| Authorized production write module | `src/editing/atomic-fs.ts` |
| Total production write modules | **1** |
| F1 result | PASS — boundary test failed on injected second writer |
| Source scan | PASS — architecture tests |
| Dist scan | PASS — only `dist/editing/atomic-fs.js` among editing write primitives |
| child_process (production) | restricted to `src/git/runner.js` (`execFile` only); editing modules none |

---

## Hidden-state controlled scan

| Item | Value |
|---|---|
| Roots scanned | repository root; `/var/folders/**` depth 4 for `.path-code-replace-*` |
| Command | `find … -name '.path-code-replace-*'`; repo search for `.path-code`, `.bak`, `.orig` |
| Leftovers | **none** in scanned scope |
| Backup/journal/lock/state artifacts | **none** attributed to Path Code in scanned scope |

---

## Gap Ledger (reviewed states unchanged)

| Gap | State |
|---|---|
| GAP-002 | OPEN_REQUIRES_EXTERNAL_CONDITION |
| GAP-035 | OPEN |
| GAP-036 | OPEN |
| GAP-037 | OPEN |
| GAP-038 | CLOSED @ `ad85c9f…` |
| GAP-039 | CLOSED @ `ad85c9f…` |
| GAP-040 | OPEN — NON_BLOCKING_LIMITATION |

**New UNREVIEWED gap:** GAP-041 — Pass contracts are not repository artifacts (see machine-readable ledger).

---

## Validation (baseline at `6889fff`)

| Check | Result |
|---|---|
| Verified baseline runtime | **500** |
| `npm run typecheck` | PASS |
| `npm test` | PASS (500/500) |
| `npm run build` | PASS |
| `npm run check` | PASS |
| `ledger:verify` (pre-linkage) | PASS @ `6889fff…` |
| Runtime dependencies | **0** |
| `src/editing` diff since `ad85c9f` | **none** |

---

## Not Validated

- Live Windows / non-POSIX atomic replace (GAP-002)
- Residual rename-window race (GAP-035)
- Crash-orphan temp candidate (GAP-036)
- Extended metadata preservation beyond mode (GAP-037)
- After-state **read** failure isolation without new seams
- Capability Ledger negative-evidence supersession automation (GAP-040)
- Per-pass execution contract repository artifact (GAP-041 OPEN UNREVIEWED)
- Full Phase 3 (3C/3D) obligations SE-019/SE-020
- Hostile TypeScript cast resistance
- Entire-host filesystem scan (only controlled fixture/temp roots scanned)

---

## Explicit supersession statement

This report **supersedes the FAIL conclusion at `035cb5f` for corrected-code progression** only. Historical reports at `035cb5f`, `PHASE_3B_REPORT.md`, and `PHASE_3B_H1_REPORT.md` remain preserved as immutable evidence of process detection and correction.

**Phase 3B evidence completion:** **COMPLETE** against corrected implementation `ad85c9f1262635f9a81b5608b20c198a7b8b489d`.
