# PATH CODE — PHASE 3C-H1 REPORT

**Pass:** Phase 3C-H1 — Contract Correction Package (full evidence)

**Result:** PASS (corrected progression; supersedes `PHASE_3C_REPORT.md` for freeze eligibility)

**Baseline (pre-H1):** `c82ed1042d06bed56485cf622871ded970d6d440`

**Stage 0:** `a23ce528` — Downgrade Phase 3C capabilities pending contract correction

**Stage 1:** `0b3bed86f8a05674a652359b958d728ae8086244` — Amend Path Code action classes and post-creation verification contract

**Stage 2 implementation:** `1136c40ab1667e4a5b70185c8bef68ce67d675a2`

**Frozen Phase 3 Master (untouched):** `58439d90cfb0b786137454d21bc88f994fcd0270`

**Amendments (immutable):**

- `docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md`
- `docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md`

**Phase 3D:** absent. **Phase 3:** not complete.

Historical `docs/reports/PHASE_3C_REPORT.md` remains immutable.

---

## 1. Package summary

| Stage | Outcome |
|---|---|
| 0 Honest downgrade | `safe-file-creation` + `edit-contracts` → IMPLEMENTED; GAP-046/047 OPEN BLOCKING_INVARIANT |
| 1 Amendments | Additive `CREATE_FILE`; post-creation verification authority; Option A rejected |
| 2 Implementation | ActionClass + policy + opaque verification; H1 impl report |
| 3 Live evidence | C-F1…C-F9 corrupt→fail→restore→pass; SE 1–20; recovery; REAL window race |
| 4 Evidence + relink | This report; close GAP-046/047; TWO_COMMIT_FREEZE (linkage commit) |

---

## 2. Live falsifications C-F1…C-F9

Performed against Stage 2 HEAD `1136c40…`. Each: corrupt → focused test fail for intended reason → restore → pass. Captured under `/tmp/phase3c-h1-stage3-evidence.md`. Production tree restored after each (only permanent test additions remain for this evidence commit).

| ID | Corruption | Focused test | Intended failure | Restored |
|---|---|---|---|---|
| C-F1 | `writeFile` import in `create-file.ts` | write-boundary + editing architecture | unauthorized module / `node:fs` orchestration | YES |
| C-F2 | `linkNoOverwriteImpl` → `rename` | REAL_FILESYSTEM window race | expected REFUSED_PRECOMMIT, got COMMITTED_FAILURE (EEXIST lost) | YES |
| C-F3 | treat non-`PATH_NOT_FOUND` as absence | inconclusive absence test | SUCCESS instead of ABSENCE_UNVERIFIABLE | YES |
| C-F4 | skip `cleanupTemp` on candidate failure | pre-publication write failure | temp residue remains | YES |
| C-F5 | `unlink` target on after-state mismatch | after-state mismatch keeps target | ENOENT reading preserved file | YES |
| C-F6 | force `knowledgeInvalidation = null` | success provenance/invalidation | null `.editRecordKind` | YES |
| C-F7 | `finalMode = 0o755` | umask-derived mode test | mode 493 ≠ 420; executable bits | YES |
| C-F8 | `isCreateFileDisabled` → false | C4b + auth disable CREATE_FILE | SUCCESS / `isCreateFileDisabled` false | YES |
| C-F9 | drop op-binding in resolve; remove `@ts-expect-error` | cross-op verify + tsc | cross-op verify resolves; TS2353 path-shaped assign | YES |

**Window race reconfirm (Stage 2, no corruption):** REAL_FILESYSTEM wrapper creates competing target → production `link` → EEXIST → `TARGET_ALREADY_EXISTS`; external bytes unchanged; candidate cleaned. **PASS.**

---

## 3. SE-001…SE-020 matrix (creation package)

Exact frozen titles from Master `58439d90…`. Status vocabulary per H1 contract.

| ID | Exact title | Status | Mechanism | Evidence | Directly exercised | Committed test |
|---|---|---|---|---|---|---|
| SE-001 | NO UNVERIFIED MUTATION | SATISFIED_FOR_SINGLE_FILE_CREATION | one-shot auth + absence + link commit | success + C-F2/C-F8 | YES | `create-file.test.ts` success/race/C4b |
| SE-002 | AUTHORIZATION BINDS EXACT BYTES | SATISFIED_FOR_SINGLE_FILE_CREATION | `PreparedCreation` immutable bytes/fingerprint | byte fidelity | YES | byte fidelity test |
| SE-003 | NO UNAUTHORIZED MUTATION | SATISFIED_FOR_SINGLE_FILE_CREATION | CREATE_FILE ActionClass + auth/mutation refuse | C-F8; Amendment 1 | YES | C4b; authorization disable |
| SE-004 | NO AUTONOMOUS AUTHORITY | FOUNDATION_EVIDENCE_ONLY | explicit approval; no public success issuer | 3A + H1 | NO (3A) | `authorization.test.ts` |
| SE-005 | AUTHORIZATION IS SINGLE-USE | FOUNDATION_EVIDENCE_ONLY | consume registry | replay refuse | YES | replay test |
| SE-006 | DENIED PATHS ARE NEVER MUTATED | SATISFIED_FOR_SINGLE_FILE_CREATION | mutation-time deny recheck | C3 | YES | C3 |
| SE-007 | NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION | SATISFIED_FOR_SINGLE_FILE_CREATION | canonicalize + parent identity | parent/absence tests | YES | absence/parent tests |
| SE-008 | EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT | 3B rename; creation uses distinct hard-link | 3B suite | YES (3B regression) | `replace-existing-file.test.ts` |
| SE-009 | PRE-COMMIT RECOVERY | SATISFIED_FOR_SINGLE_FILE_CREATION | candidate cleanup before link | C-F4; recovery | YES | write-failure cleanup |
| SE-010 | AFTER-STATE IS VERIFIED | SATISFIED_FOR_SINGLE_FILE_CREATION | `CreationAfterStateEvidence` via opaque token | C-F5/C-F9 | YES | after-state mismatch; creation-verification |
| SE-011 | PROVENANCE IS EARNED | SATISFIED_FOR_SINGLE_FILE_CREATION | `PATH_CODE_MODIFIED` success-only | success test | YES | success provenance |
| SE-012 | EXACT AUTHORIZED BYTES ONLY | SATISFIED_FOR_SINGLE_FILE_CREATION | candidate read-back + after evidence | byte fidelity | YES | byte fidelity |
| SE-013 | BOUNDS HOLD | SATISFIED_FOR_SINGLE_FILE_CREATION | `MAX_EDIT_FILE_BYTES` | bounds tests | YES | `bounds.test.ts` |
| SE-014 | NO DURABLE HIDDEN PATH CODE STATE | SATISFIED_FOR_SINGLE_FILE_CREATION | temp cleanup; no journal | success temp absence | YES | success names check |
| SE-015 | KNOWLEDGE INVALIDATED, NOT REPAIRED | SATISFIED_FOR_SINGLE_FILE_CREATION | `KnowledgeInvalidation` CREATION | C-F6 | YES | success invalidation |
| SE-016 | WRITE BOUNDARY HOLDS | SATISFIED_FOR_SINGLE_FILE_CREATION | sole `atomic-fs.ts` | C-F1 | YES | write-boundary + architecture |
| SE-017 | CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED | SATISFIED_FOR_SINGLE_FILE_CREATION | EEXIST / TARGET_ALREADY_EXISTS | window race | YES | REAL_FILESYSTEM race |
| SE-018 | GIT SAFETY | SATISFIED_FOR_SINGLE_FILE_CREATION | no Git mutation in editing | architecture | YES | editing architecture |
| SE-019 | SAFE CREATION | SATISFIED_FOR_SINGLE_FILE_CREATION | full 3C-H1 mechanism | this package | YES | create-file suite |
| SE-020 | MULTI-FILE PARTIAL HONESTY | NOT_IN_3C | — | — | NO | — |

---

## 4. Recovery matrix

| Failure | Result | Evidence class | Pre/post | Target | Candidate cleanup | Notes |
|---|---|---|---|---|---|---|
| Candidate create failure | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | attempted | FAILED_PRECOMMIT |
| Partial / injected write | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | yes | C-F4 proves necessity |
| Candidate fsync failure | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | attempted | via prepare catch |
| Mode failure | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | attempted | prepare catch |
| Candidate verify mismatch | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | attempted | prepare catch |
| Final parent/currentness | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | yes | parent identity / ENOENT |
| Target appears before publication | PASS | REAL_FILESYSTEM | pre | external preserved | yes | window race |
| Hard-link EEXIST | PASS | REAL_FILESYSTEM | pre | external preserved | yes | race |
| Other link failure | PASS | CONTROLLED_ADAPTER_FAULT | pre | none | yes | LINK_FAILED path |
| Temp unlink after publication | PASS | CONTROLLED_ADAPTER_FAULT | post | remains | cleanupFailure | COMMITTED_FAILURE |
| Directory fsync failure | PASS | CONTROLLED_ADAPTER_FAULT | post | remains | n/a post | COMMITTED_FAILURE |
| After-state read failure | PASS | CONTROLLED_ADAPTER_FAULT | post | remains | n/a | verify throw → COMMITTED_FAILURE |
| After-state mismatch | PASS | CONTROLLED_ADAPTER_FAULT | post | remains | n/a | C-F5 |
| Config reload failure | PASS | REAL_FILESYSTEM | pre | none | n/a | C1 |
| CREATE_FILE action-disabled | PASS | REAL_FILESYSTEM | pre | none | n/a | C4b / C-F8 |

Pre-publication invariants: `commitPointReached=false`; no Path Code target publication; cleanup attempted; auth spent.  
Post-publication: `commitPointReached=true`; target remains; no rollback; observed state reported.

---

## 5. Architecture audit Q1–70

### Original 3C mechanism questions (1–56)

Re-audited against Stage 2 HEAD + amendments. All **PASS** unless noted. Grouped by theme (full numbered answers):

1–8 **Authority / prep:** PreparedCreation branded; ≠ PreparedMutation; explicit approval; one-shot auth; leaf validation; parent admitted directory; NON_EXISTENT precondition; no mkdir. **PASS.**

9–16 **Absence / denial / config / Git:** PATH_NOT_FOUND-only absence success; inconclusive → ABSENCE_UNVERIFIABLE; deny-path mutation-time; ConfigFailure fail-closed; ABSENT eligible; EDIT≠CREATE historically then CREATE_FILE mapped; UNMERGED refuse when context supplied; no Git writes. **PASS.**

17–28 **Publication:** same-dir exclusive create temp; distinct `.path-code-create-` prefix; write exact bytes; candidate fsync; umask mode `0o666 & ~umask`; no parent-mode copy; candidate hash verify; final parent/absence/deny recheck; hard-link no-overwrite; EEXIST → TARGET_ALREADY_EXISTS; non-EEXIST link → FAILED_PRECOMMIT; darwin/linux platform gate. **PASS.**

29–40 **After-state / records:** opaque publication-earned token; no path-shaped `readPublishedBytes`; verify bound to operation; CreationAfterStateEvidence ≠ RepositoryEntry/ContentObservation; EditRecord CREATION; PATH_CODE_MODIFIED success-only; invalidation CREATION; no reinventory; committed failure keeps target; no auto-repair delete; observed fingerprints reported. **PASS.**

41–48 **Recovery / cleanup:** pre-pub cleanup; cleanupFailure explicit; post-pub unlink failure COMMITTED_FAILURE; dir fsync failure COMMITTED_FAILURE; after mismatch COMMITTED_FAILURE; auth spent on refuse; no Phase 3D multi-file; win32 refused. **PASS.**

49–56 **Architecture / ledger posture:** sole write module atomic-fs; create orchestration fs-free; 3B unchanged; permanent architecture tests; write-boundary allowlist; no public verification export; deps unchanged for Phase 3C surface; Phase 3 not closed. **PASS.**

### Amendment questions (57–70)

| # | Question | Answer |
|---|---|---|
| 57 | CREATE_FILE maps to amended ActionClass? | YES — `DISABLE_ACTION_FOR_CREATE_FILE = "CREATE_FILE"` |
| 58 | Auth issuance refuses when disabled? | YES — prepare + authorize |
| 59 | Mutation-time fresh config refuses? | YES — C4b |
| 60 | EDIT does not absorb creation? | YES — C4 |
| 61 | Frozen docs unedited; amendments separate? | YES |
| 62 | Opaque PublishedCreationVerificationTarget? | YES |
| 63 | Minted only after successful link? | YES — `linkNoOverwriteImpl` |
| 64 | Pre-existing / caller / other-op readable? | NO (C-F9) |
| 65 | Evidence ≠ RepositoryEntry/ContentObservation? | YES |
| 66 | Unremarked arbitrary published-path reader? | NO |
| 67 | C-F1…C-F9 live with restorations? | YES |
| 68 | SE matrix complete at twenty? | YES |
| 69 | Window race uses real hard-link? | YES |
| 70 | Committed Phase 3B tests pass? | YES |

**Audit total:** 70/70 PASS. No architecture failure.

---

## 6. Gap Ledger

| ID | Lifecycle after H1 evidence |
|---|---|
| GAP-046 | **CLOSED** — closedByCommit Stage 2 `1136c40…`; amendments + CREATE_FILE enforcement + C-F8 |
| GAP-047 | **CLOSED** — closedByCommit Stage 2 `1136c40…`; opaque verification + C-F9 |
| GAP-040 | OPEN (unchanged) |
| GAP-041 | OPEN (unchanged) |
| GAP-043 | OPEN (unchanged) |
| GAP-044 | OPEN (unchanged) |
| GAP-045 | OPEN (unchanged) |
| GAP-042 | CLOSED (unchanged) |

No new gaps opened.

---

## 7. Capability linkage (performed in linkage commit)

Prefer TWO_COMMIT_FREEZE:

| Capability | implementationCommit | evidenceCommit | productionScopes |
|---|---|---|---|
| `safe-file-creation` | Stage 2 `1136c40…` | this evidence commit SHA | `src/editing/` |
| `edit-contracts` | Stage 2 `1136c40…` | this evidence commit SHA | `src/editing/`, `src/domain/`, `src/config/` |

`existing-file-replacement` remains PASS_FROZEN. `safe-editing` remains DECLARED.

---

## 8. Explicit non-claims

- Phase 3 / Phase 3D not complete
- GAP-043/044/045 remain OPEN
- Windows creation unsupported
- Hostile concurrent FS linearizability not claimed (GAP-044)
- Post-creation evidence is not repository knowledge

---

## 9. Production scope statement

This evidence commit contains **no** changes under `src/editing/`, `src/domain/`, or `src/config/` (Stage 2 already shipped those). Evidence body: this report, gap closures/render, permanent tests only.
