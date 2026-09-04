# PATH CODE — PHASE 3 SAFE EDITING ENGINE
# INDEPENDENT FULL RE-AUDIT R1 (STAGE 3)

Governing instruction: `docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md`, Stage 3.

Audited checkpoint (Stage 2B HEAD): `63f6e87cf199b3b551196be09a486b81da2860dd`

---

## AUDITOR PROVENANCE

```text
executor product:                       Claude Code (claude-opus-5)
session:                                new session; product exposes no
                                        stable user-visible session identifier
this executor session prior writes to
  Phase 3-R1 chain:                     NONE
hardening execution transcripts
  received:                             NO
R1 Stage 0–2 execution transcripts
  received:                             NO
failed-auditor substantive transcripts
  received:                             NO
repository checkpoint received:         63f6e87cf199b3b551196be09a486b81da2860dd
other inputs received:                  the Stage 3 dispatch brief; the
                                        repository at the above checkpoint in
                                        its entirety (contracts, masters,
                                        amendments, reports, ledgers, source,
                                        tests) as permitted evidence
prior failed-attempt metadata received: none — operator stated there are no
                                        prior Stage 3 attempts from this
                                        Stage 2B checkpoint
operator attestation:                   Achahbi, 4 September 2026
report block presence admissibility:    REPOSITORY_RECORDED
independence claim admissibility:       ASSERTED — not mechanically proven;
                                        see GAP-055
```

No forbidden input class (§3.1) was present in this executor's context. No context
contamination stop was triggered.

---

## 0. BASELINE GATE

| Gate | Observed |
|---|---|
| `git rev-parse HEAD` | `63f6e87cf199b3b551196be09a486b81da2860dd` — matches required checkpoint |
| `git status --porcelain` | empty (clean) |
| `npm run ledger:verify` | **PASS** at `63f6e87cf199b3b551196be09a486b81da2860dd` |
| `npm run typecheck` | **PASS** |
| `npm test` (`vitest run`) | **612 passed (612)**, 64 files passed (64) |
| `npm run build` | **PASS** |
| `npm run cli:smoke` | **PASS** (shebang, `--help`, bare invocation, non-zero on unknown argument) |
| Runtime dependencies | **0** (`package.json` declares no `dependencies` block) |
| Working tree after build | clean (`dist/` is gitignored) |

### Ancestry (each `git merge-base --is-ancestor <sha> HEAD` exit 0)

| Commit | Role | Result |
|---|---|---|
| `696ef4fe58c21cdd527869309a2b9fd5abcd19a8` | first Phase 3 integration audit | ANCESTOR |
| `1136c40ab1667e4a5b70185c8bef68ce67d675a2` | Phase 3C-H1 corrections | ANCESTOR |
| `5386f349eccd7c69ff696619ffc426757e3e91d0` | public authority-surface correction | ANCESTOR |
| `5606b49ec753b8988213b6c912d7de5de51d52ee` | non-independent re-audit (historical) | ANCESTOR |
| `04591e400f6b8efe7190ce01faef4da97d0eb984` | Closure A | ANCESTOR |
| `ee586732ac602eabbf310888b7b44c9bdf8ef519` | prior closure linkage (superseded) | ANCESTOR |

---

## 1. FULL BASE AUDIT — SE-001 THROUGH SE-020

Frozen titles taken verbatim from `docs/PHASE_3_SAFE_EDITING_MASTER.md`.
Admissibility: **T** = current passing repository test, **M** = mechanical
source/dist/Git check performed in this audit, **D** = immutable repository document.

| ID | Frozen title | Status | Mechanism (prep / replace / create / coordinate) | Admissibility | Exercised here | Relied-upon current tests |
|---|---|---|---|---|---|---|
| SE-001 | NO UNVERIFIED MUTATION | SATISFIED_PHASE_WIDE | commit-time 2B re-read + before-state fingerprint compare in 3B; NON_EXISTENT precondition revalidation in 3C; per-target full sequence in 3D | T, M | YES (B1, B3, A-F3) | `phase3-safe-editing-audit` B1/B3; `replace-existing-file` refusals/concurrency; `create-file` absence-vs-inconclusive |
| SE-002 | AUTHORIZATION BINDS EXACT BYTES | SATISFIED_PHASE_WIDE | `authorizePreparedChange` binds target/action/before/after fingerprints and prepared-object identity | T, M | YES (B1) | `authorization` binds-to-identity, refuses-reconstructed-copies |
| SE-003 | NO UNAUTHORIZED MUTATION | SATISFIED_PHASE_WIDE | `consumeEditAuthorization` gate on 3B/3C; plan entries require registered authorizations | T, M | YES | `authorization`; `multi-file-coordination` preflight AUTHORIZATION_NOT_REGISTERED |
| SE-004 | NO AUTONOMOUS AUTHORITY | SATISFIED_PHASE_WIDE | `ExplicitEditApproval` required; no model/config/plan path issues authority | T, M | YES | `authorization` requires-explicit-approval |
| SE-005 | AUTHORIZATION IS SINGLE-USE | SATISFIED_PHASE_WIDE | one-shot WeakMap registry; replay refused before filesystem contact; plan refuses duplicate authorization refs | T, M | YES (B5 moment 2) | `authorization` one-shot; `create-file` replay; `multi-file-coordination` duplicate-auth |
| SE-006 | DENIED PATHS ARE NEVER MUTATED | SATISFIED_PHASE_WIDE | `refuseIfTargetDenied` at mutation time in 3B/3C; 3D preflight names every denied target | T | YES (B5 both moments, A-F5) | audit B5; `replace-existing-file` C3; `create-file` C3 |
| SE-007 | NO ESCAPE / NO INTENTIONAL SYMLINK MUTATION | SATISFIED_PHASE_WIDE | preparation refuses `physicalKind !== "FILE"`; 3D preflight `SYMLINK_REFUSED`; canonical-path containment | T, M | YES (M) | `preparation`; `multi-file-coordination` alias-collision |
| SE-008 | EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED | SATISFIED_PHASE_WIDE | same-directory `renameAtomic` after fsync'd exclusive temp; platform gate refuses first | T, M | YES (recovery shapes) | `replace-existing-file` success/platform-policy |
| SE-009 | PRE-COMMIT RECOVERY | SATISFIED_PHASE_WIDE | 3B FAILED_PRECOMMIT + temp cleanup; 3C prepublication cleanup; explicit `cleanupFailure` | T | YES (all five recovery shapes actively induced) | audit recovery shapes; `replace-existing-file` temp-creation recovery; `create-file` recovery |
| SE-010 | AFTER-STATE IS VERIFIED | SATISFIED_PHASE_WIDE | 3B trusted re-read hash/length; 3C operation-bound `CreationAfterStateEvidence`; nested per-target in 3D | T, M | YES (B1 fingerprint bridge, A-F1) | audit B1; `create-file` after-state mismatch |
| SE-011 | PROVENANCE IS EARNED | SATISFIED_PHASE_WIDE | `PATH_CODE_MODIFIED` emitted only from terminal editing evidence in `internal/record.ts` | T, M | YES (M) | `replace-existing-file` success; `create-file` success |
| SE-012 | EXACT AUTHORIZED BYTES ONLY | SATISFIED_PHASE_WIDE | candidate fingerprint equality before commit; no normalization anywhere in editing | T, M | YES (B1) | byte-fidelity tests (CRLF/BOM/binary) for both 3B and 3C |
| SE-013 | BOUNDS HOLD | SATISFIED_PHASE_WIDE | `MAX_EDIT_FILE_BYTES`, `MAX_FILES_PER_EDIT_OPERATION`, `MAX_TOTAL_PROPOSED_AFTER_BYTES` as constants; caller cannot widen | T, M | YES (M) | `bounds`; `multi-file-coordination` construction bounds |
| SE-014 | NO DURABLE HIDDEN PATH CODE STATE | SATISFIED_PHASE_WIDE | authorization registry is an in-memory `WeakMap`; no journal/index/cache/undo store in source or dist | T, M | YES (C2 scan) | audit persistence scan; `editing/architecture`; `import-side-effects` |
| SE-015 | KNOWLEDGE INVALIDATED, NOT REPAIRED | SATISFIED_PHASE_WIDE | `KnowledgeInvalidation` per mutation; plan aggregates only APPLIED/COMMITTED_FAILURE; no Phase 2 repair path | T, M | YES (B2) | audit B2; `multi-file-coordination` invalidation aggregation |
| SE-016 | WRITE BOUNDARY HOLDS | SATISFIED_PHASE_WIDE | exactly one write module `src/editing/atomic-fs.ts`; dist agrees | T, M | YES (A-F9, A-F10) | `architecture/write-boundary`; `editing/architecture` |
| SE-017 | CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED | SATISFIED_PHASE_WIDE | pre-commit identity (dev/ino) and content re-checks; 3C `linkNoOverwrite` EEXIST | T | YES (B3, B8, A-F3) | audit B3/B8; `replace-existing-file` concurrency; `create-file` window race |
| SE-018 | GIT SAFETY | SATISFIED_PHASE_WIDE | no `child_process`/Git execution anywhere under `src/editing/`; only type-only `GitStateBaseline` imports; UNMERGED refused; absent context does not manufacture refusal | T, M | YES (B4) | audit B4; `editing/architecture` |
| SE-019 | SAFE CREATION | SATISFIED_PHASE_WIDE | admitted parent + validated leaf + honest NON_EXISTENT + no-overwrite hard link + operation-bound verification | T, M | YES (B1, B2, recovery 3C shapes) | `preparation`; `create-file` suite; `creation-verification` |
| SE-020 | MULTI-FILE PARTIAL HONESTY | SATISFIED_PHASE_WIDE | full preflight before first mutation; sequential stop; structurally distinct `NOT_ATTEMPTED`; no rollback | T | YES (B8, A-F8, recovery 3D) | audit B8; `multi-file-coordination` stop/partial suite |

No obligation is SATISFIED_FOR_SUBSET at this checkpoint.

---

## 2. B1 THROUGH B8 — CROSS-PHASE COMPOSITION

All eight seams were re-established by executing the committed integration
suite `tests/integration/phase3-safe-editing-audit.test.ts` at this checkpoint
and, for each, by running the corresponding falsification listed in §5.

| Seam | Result | Note |
|---|---|---|
| B1 full read/write/re-observe fingerprint bridge | **PASS** | every 3B/3C/3D after-state fingerprint equals the fresh Phase 2B `ContentObservation` fingerprint taken through a newly earned `RepositoryEntry` |
| B2 authored mutation evidence → fresh re-observation | **PASS** | old inventory/map/corpus never see the authored path; admission occurs only through re-observation (Constitution §7 exercised behaviourally) |
| B3 stale snapshot / stale edit / fresh edit | **PASS** | old snapshot reports `STALE_CONTENT`; old prepared mutation refuses `TARGET_STALE`; freshly prepared mutation succeeds |
| B4 Git point-in-time | **PASS** | G0 stays `CLEAN`, G1 reports `MODIFIED`; supplied UNMERGED refuses; absent Git context does not manufacture refusal |
| B5 deny-path enforcement (both moments) | **PASS** | admission, map/corpus, preparation and mutation surfaces all refuse; 3D preflight names every denied target and consumes no authorization |
| B6 action-class enforcement | **PASS** | `EDIT` and `CREATE_FILE` restrictions independent at single-target and plan scale |
| B7 ConfigFailure fail-closed plus successful ABSENT | **PASS** | malformed config → `CONFIG_RELOAD_FAILED` at 3B/3C and at every 3D preflight target with no authorization consumed; ABSENT permits inventory, 3B, 3C and 3D |
| B8 partial plan then re-observe | **PASS** | committed target matches fresh observation; `NOT_ATTEMPTED` carries no unchanged claim; no rollback |

---

## 3. WRITE BOUNDARY, PERSISTENCE, RECOVERY, CORRECTIVE PASSES

### 3.1 Write boundary (C1)

Mechanical scan of `src/**/*.ts` and `dist/**/*.js` for filesystem-mutation
primitives (`writeFile`, `appendFile`, `createWriteStream`, `rename`, `unlink`,
`link`, `symlink`, `mkdir`, `rm`, `chmod`/`fchmod`, `chown`/`fchown`,
`truncate`, `fsync`, `O_CREAT`/`O_EXCL`).

- Source: mutation primitives are imported only in `src/editing/atomic-fs.ts`
  (`link`, `rename`, `unlink`, `open`, `constants`, `fsync`). Every other
  `node:fs` import in `src/**` is read-only (`lstat`, `stat`, `open(…, "r")`,
  `realpath`, `readdir`).
- Dist: `dist/editing/atomic-fs.js` carries the identical import set; every
  other `dist/**` `node:fs` import is read-only. **Dist agrees with source.**
- The architecture allowlist names the exact file
  (`AUTHORIZED_WRITE_MODULE = "src/editing/atomic-fs.ts"`). No directory or
  wildcard exemption exists.

**Exactly one production filesystem write module remains, as contracted.**

### 3.2 Persistence / residue (C2)

Scanned: repository root (recursive, excluding `node_modules/`, `.git/`,
`dist/`) and the host temporary root used by fixtures.

- No `.path-code-replace-*`, `.path-code-create-*`, `.bak`, `.orig`, editor
  backup, journal, lock, progress, undo-state, plan-state or
  authorization/provenance database was found anywhere.
- `.path-code-tmp/` exists in the repository root, is gitignored, and is empty.
- 73 leftover `pc-*` directories exist under the host temp root. These are
  **vitest fixture roots created by the test harness** (`mkdtemp`), containing
  only authored fixture files. They are not Path Code persistence artifacts.
  Recorded here for completeness.
- Source scan for persistence-shaped identifiers (journal / undoStack /
  persistDir / saveState / sqlite / leveldb) found no hits in production code.

**GAP-031 (snapshot persistence intentionally absent) remains OPEN and was not
silently closed by Phase 3.**

### 3.3 Recovery shapes (C3) — all five actively induced and non-vacuous

For each shape the committed test's induced fault was removed and the test was
observed to fail, proving the fault seam is genuinely exercised. Each removal
was restored exactly and the test re-passed.

| Shape | Induced fault | Vacuity probe result |
|---|---|---|
| 3B PRECOMMIT | `createTempExclusive` throws | with fault removed / with escaping throw restored (A-F12): `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` / `induced temp create failure` escaped |
| 3B COMMITTED_FAILURE | post-rename byte corruption via `renameAtomic` seam | fault removed → `expected 'SUCCESS' to be 'COMMITTED_FAILURE'` |
| 3C PREPUBLICATION | `writeAll` throws | fault removed → `expected 'SUCCESS' to be 'FAILED_PRECOMMIT'` |
| 3C COMMITTED_FAILURE | `verifyPublishedCreation` returns mismatched evidence | fault removed → `expected 'SUCCESS' to be 'COMMITTED_FAILURE'` |
| 3D PARTIAL | mid-plan external write to the second target | fault removed → `expected 'ALL_APPLIED' to be 'PARTIALLY_COMMITTED'` |

All fault injection uses **internal-only seams**
(`replaceExistingFileWithDependencies`, `createFileWithDependencies`,
`executeMultiFilePlanWithDependencies`). No audit test fabricates
committed/success evidence. Public composition tests use public wrappers only.

### 3.4 Phase 3B-H1 corrections (C4)

- No stale prepared-config fallback exists: `resolveMutationConfig` refuses
  `CONFIG_RELOAD_FAILED` on `ConfigFailure` and never falls back to
  `prepared.config` or a default config. Falsified as A-F11.
- Temp-creation failure becomes `FAILED_PRECOMMIT` rather than an escaping
  throw. Falsified as A-F12.

**Both corrections remain present and falsifiable.**

### 3.5 Phase 3C-H1 corrections (C5)

- `CREATE_FILE` maps to the amended Phase 1 `ActionClass` `CREATE_FILE`
  (`DISABLE_ACTION_FOR_CREATE_FILE`), independent of `EDIT`. Authorization-time
  and mutation-time restrictions both hold. Falsified as A-F13 and A-F6.
- `PublishedCreationVerificationTarget` is opaque (unique-symbol brand), minted
  only after successful no-overwrite publication, bound to operation identity
  via a `WeakMap`, and is not exported from the public editing barrel.
  Verification accepts no caller path. `CreationAfterStateEvidence` is a
  distinct type that no Phase 1/2 module imports or accepts. Falsified as A-F14.

**Both corrections remain present and falsifiable.**

---

## 4. PHASE 3D COORDINATION OBLIGATIONS

`docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md` §4 contains the required
Foundation Compatibility Preflight with all ten rows source-confirmed at
`dcb347fc613114be810b8caf371f0bea8b261285`. No provisional wording remains.

| Obligation | Result | Evidence at this checkpoint |
|---|---|---|
| P3D-001 PER-TARGET AUTHORITY | PASS | each entry carries its own prepared+authorization; per-target consumption |
| P3D-002 NON-CONSUMING PREFLIGHT | PASS | audit B5 moment 2 / B7: `inspectAuthorizationReadiness` still ok after refused preflight |
| P3D-003 ALL FAILING TARGETS REPORTED | PASS | `multi-file-coordination` "reports every preflight failure and marks ready peers" |
| P3D-004 SINGLE WORKSPACE | PASS | "refuses cross-workspace plans" |
| P3D-005 PROVABLE TARGET COLLISIONS REFUSED | PASS | modify/modify, create/create, modify/create collision tests; no false collisions |
| P3D-006 EXPLICIT DETERMINISTIC ORDER | PASS | "preserves explicit input order (no lexical sort)" |
| P3D-007 PREFLIGHT IS NOT A LEASE | PASS | config re-resolved per target; mid-plan restriction stops later targets |
| P3D-008 CONFIG PER TARGET | PASS | restrictive and malformed mid-plan config tests |
| P3D-009 SEQUENTIAL STOP | PASS | "marks later targets NOT_ATTEMPTED after first non-success" |
| P3D-010 NOT_ATTEMPTED IS HONEST | PASS | audit B8 + "NOT_ATTEMPTED carries no unchanged claim fields"; falsified as A-F8 |
| P3D-011 COMMIT-POINT PLAN STATUS | PASS | "treats COMMITTED_FAILURE as committed and stops" |
| P3D-012 NO ROLLBACK | PASS | recovery 3D PARTIAL; audit B8 |
| P3D-013 AUTHORED EVIDENCE STAYS DISTINCT | PASS | audit B2; no Phase 1/2 module imports `CreationAfterStateEvidence` |
| P3D-014 NO HIDDEN PERSISTENCE | PASS | §3.2 persistence scan |
| P3D-015 ONE WRITE MODULE PRESERVED | PASS | §3.1 write boundary; falsified as A-F9/A-F10 |

---

## 5. PUBLIC AUTHORITY-SURFACE AUDIT — P1 THROUGH P14

Every P-dimension below was re-derived mechanically in this audit, not taken
from the committed P-dimension suite.

| ID | Result | Independent evidence |
|---|---|---|
| P1 | **PASS** | `package.json` `exports` has exactly one key `"."`. Live ESM probes: `path-code` → IMPORT_OK exporting exactly 11 names (`MINIMUM_SUPPORTED_NODE_MAJOR`, `createWorkspaceBoundary`, `discoverGitRepository`, `evaluateNodeVersion`, `failure`, `isJsonValue`, `isNodeVersionSupported`, `loadProjectConfig`, `parseNodeVersion`, `requiresReRead`, `success`) — none authority-bearing. `bin.pathcode` is a process entry, not an import subpath. Thirteen `src/**/index.ts` repository barrels enumerated. |
| P2 | **FAIL** | See Finding **F-R1-001** in §8. The standing guard represents `ReplaceExistingFileOptions`, `CreateFileOptions` and `ExecuteMultiFilePlanOptions` completely, but **does not represent `AuthorizePreparedChangeOptions`**, the option surface of the authority-issuing public function `authorizePreparedChange`, nor does it produce the per-function parameter manifest required by the hardening contract §2.4(C). |
| P3 | **PASS** (state), see F-R1-001 for standing coverage | Independent TypeScript-compiler AST sweep over **all thirteen barrels** and every type they export: zero public type members carry a call signature, an `Ops`/`Operations`/`Executor`/`Adaptor`/`Bindings`/`Verifier` shape, or an `any`/`unknown`/rest/index escape. `AtomicReplaceFsOps`, `AtomicCreateFsOps` and `MultiFileTargetOperations` are referenced only inside `src/editing/**` and are exported from no barrel. No unapproved mechanism-substitution parameter exists at this checkpoint. |
| P4 | **PASS** | `tests/editing/public-authority-malicious.test.ts` passes hostile throwing `fsOps`/`targetOps` through each public wrapper via JS widening and observes real production success. Falsified live as A-F20 (a hidden cast-read of `options.fsOps` makes this suite fail). |
| P5 | **PASS** | Source: `replaceExistingFile` constructs a fresh `{ fsOps: productionAtomicReplaceFs, …gitContext }` object; it never reads `options.fsOps` or `arguments[]`. Falsified as A-F16. |
| P6 | **PASS** | Source: `createFile` constructs `{ fsOps: productionAtomicCreateFs, …gitContext }`. Falsified as A-F17. |
| P7 | **PASS** | Source: `executeMultiFilePlan` constructs `{ targetOps: productionOps, …gitContext }`. Falsified as A-F15. |
| P8 | **PASS** | The correction commit `5386f349…` touched exactly four editing files implementing exactly the three corrected wrappers. The barrel sweep confirms no fourth public wrapper accepts mechanism substitution. |
| P9 | **PASS** | `src/editing/index.ts` exports no `*WithDependencies` symbol and its source contains no `fsOps`/`targetOps`/`WithDependencies` token. Falsified as A-F18. |
| P10 | **PASS** | Live probes under both CJS `require.resolve` and ESM `import()`: `path-code/editing`, `path-code/editing/index.js`, `path-code/dist/editing/index.js` and `path-code/src/editing/internal/consume-authorization.js` all fail `ERR_PACKAGE_PATH_NOT_EXPORTED`. Falsified as A-F21. |
| P11 | **PASS** | `npm run check` = `typecheck && build && test && cli:smoke && ledger:verify`; the standing guard runs inside the vitest suite. `PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS` is a frozen empty array — no unjustified entries. |
| P12 | **PASS** | AST sweep (see P3) found no `any`/`unknown`/rest/index escape narrowed into any authority-bearing operation. |
| P13 | **PASS** | Every audit fault injection uses an internal `*WithDependencies` seam and always delegates to the real production operation; no audit test fabricates committed/success evidence. Falsified as A-F22. |
| P14 | **PASS** | At `696ef4f` the first audit's suite contained 8 public `fsOps`/`targetOps` injection references; at this checkpoint it contains none and instead uses 9 internal-seam references. The removal is documented in `docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md`. |

---

## 6. FALSIFICATIONS

Every falsification below was performed live: corruption applied → focused test
run → exact failure observed → intended reason confirmed → exact restoration by
`git checkout --` → `git status --porcelain` verified empty → final PASS.

### 6.1 Original audit probes A-F1 through A-F14

| ID | Corruption | Observed failure | Intended reason confirmed | Restored | Final |
|---|---|---|---|---|---|
| A-F1 | external byte mutation of `replace-me.txt` after the Path Code write, before fresh re-observation (audit test) | B1: `expected '5ad4d6b8…' to be '24dbb68f…'` | fresh Phase 2B fingerprint no longer equals recorded after-state evidence | YES | PASS |
| A-F2 | use `invBefore` instead of the fresh inventory for the created file (audit test) | B2: `missing admitted file src/authored.txt` | authored path earns no `RepositoryEntry` without re-observation | YES | PASS |
| A-F3 | **production**: bypass the 3B before-state currentness comparison in `refuseIfBeforeMismatch` | B3: `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | old prepared mutation stopped refusing on stale before-state | YES | PASS |
| A-F4 | substitute G0 where the test collects fresh G1 (audit test) | B4: `expected 'CLEAN' to be 'MODIFIED'` | stale Git baseline treated as current | YES | PASS |
| A-F5 | remove the active deny-path condition, keep refusal expectations (audit test) | B5 moment 2: `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | denial composition no longer under test | YES | PASS |
| A-F6 | **production**: swap `DISABLE_ACTION_FOR_CREATE_FILE` from `CREATE_FILE` to `EDIT` | B6 both cases fail: `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` and `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | the two action classes stopped being independent | YES | PASS |
| A-F7a | valid config in place of malformed, fail-closed expectations retained (audit test) | B7: `expected true to be false` at `loadProjectConfig` | fail-closed half no longer under test | YES | PASS |
| A-F7b | malformed config in place of ABSENT, success expectations retained (audit test) | B7: `expected false to be true` at `openAuditFixture` (`phase3-audit-helpers.ts:102`) | permissive-ABSENT half no longer establishable | YES | PASS |
| A-F8 | **production**: attach `unchanged: true` to `NOT_ATTEMPTED` outcomes | B8: `expected { kind: 'NOT_ATTEMPTED', …(1) } to deeply equal { kind: 'NOT_ATTEMPTED' }` | not-attempted target acquired a currentness claim | YES | PASS |
| A-F9 | **production**: add `rename()` reference to `src/editing/denial.ts` | `src/editing/denial.ts matched /(?<![.\w])rename\s*\(/` | second write module inside editing named | YES | PASS |
| A-F10 | **production**: add `writeFile()` reference to `src/inventory/membership.ts` | `src/inventory/membership.ts matched /(?<![.\w])writeFile\s*\(/` | write primitive outside editing named | YES | PASS |
| A-F11 | **production**: reintroduce stale `prepared.config` fallback on `ConfigFailure` | `replace-existing-file` C1: `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | 3B-H1 fail-closed correction removed | YES | PASS |
| A-F12 | **production**: restore escaping throw from temp-candidate preparation | audit 3B PRECOMMIT: `induced temp create failure` escaped; `replace-existing-file`: `expected Error: injected createTempExclusive failu… to be null` | 3B-H1 recovery correction removed | YES | PASS |
| A-F13 | **production**: make `isCreateFileDisabled` return `false` | `authorization`: `expected false to be true`; `create-file` C4b and audit B6: `expected 'SUCCESS' to be 'REFUSED_PRECOMMIT'` | 3C-H1 CREATE_FILE restriction bypassed at both authorization and mutation time | YES | PASS |
| A-F14 | compile probe assigning a path-shaped plain object to `PublishedCreationVerificationTarget` and calling `verifyPublishedCreation` with a string path | `TS2741: Property '[publishedCreationVerificationBrand]' is missing…`; `TS2345: Argument of type 'string' is not assignable to parameter of type 'PublishedCreationVerificationTarget'` | operation-bound verification authority holds at the type boundary; runtime rejects forged objects (`not registered`) | YES (probe file deleted) | PASS |

### 6.2 Public authority-surface probes A-F15 through A-F22

| ID | Corruption | Observed failure | Intended reason confirmed | Restored | Final |
|---|---|---|---|---|---|
| A-F15 | reintroduce public `targetOps` on `executeMultiFilePlan` (type + `options?.targetOps ?? productionOps`) | `Error: malicious targetOps.replaceExistingFile invoked` at `multi-file-execute.ts:136` | hostile caller mechanism reached the production path | YES | PASS |
| A-F16 | reintroduce public `fsOps` on `replaceExistingFile` | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` (throwing `lstatTarget` reached) | replacement mechanism substitution restored | YES | PASS |
| A-F17 | reintroduce public `fsOps` on `createFile` | `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` | creation mechanism substitution restored | YES | PASS |
| A-F18 | export `replaceExistingFileWithDependencies` from the public editing barrel | standing guard: `+ "replaceExistingFileWithDependencies"` in forbidden list; P9: `expected … not to match /WithDependencies/` | the leak is named | YES | PASS |
| A-F19 (a) | add callable `targetOps` field to `ExecuteMultiFilePlanOptions` | standing guard: `expected [ 'targetOps', 'gitContext' ] to deeply equal [ 'gitContext' ]` and `expected [ '\boptions\?\.targetOps\b' ] to deeply equal []` | declaration/manifest test fails as required | YES | PASS |
| A-F19 (b) | add callable `authorityOps: { issue: (input: unknown) => unknown }` field to `AuthorizePreparedChangeOptions` — the option surface of the public authority-issuing function `authorizePreparedChange` | **NO FAILURE.** Standing guard 5/5 PASS; P1–P14 suite 9/9 PASS; full suite **612/612 PASS**; `npm run check` unaffected | **Required failure did not occur.** See Finding F-R1-001 | YES | n/a |
| A-F20 | **production**: read a hidden extra argument at runtime — `(options as { fsOps?: AtomicReplaceFsOps }).fsOps` in `replaceExistingFile` | malicious runtime suite: `expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` | hidden undeclared option field honoured at runtime. Note: the **standing guard passed** under this corruption (its pattern `\boptions\.fsOps\b` does not match the cast form); only the P4 runtime proof caught it | YES | PASS |
| A-F21 | add `"./editing": "./dist/editing/index.js"` to `package.json` `exports` | P1/P10 and standing guard: `expected [ '.', './editing' ] to deeply equal [ '.' ]`; live probe: `path-code/editing IMPORT_OK, exports: 24` | internal authority-bearing subpath became consumer-reachable | YES | PASS |
| A-F22 | **production**: replace `productionOps.replaceExistingFile` with a fabricated-success stub | `multi-file-coordination` 4 failures; audit B1: `Cannot read properties of null (reading 'observedAfterFingerprint')`; malicious runtime: `expected 'a0\n' to be 'a1\n'` | internal delegation to the real production operation broken | YES | PASS |

---

## 7. LEDGERS, CONSTITUTION, LESSONS, COMPILE-TIME

### 7.1 Constitution §11 integration-audit questions

**Q1 — Did the Phase 3D Master contain the required preflight with every row
source-confirmed?** YES. §4 of the 3D Master carries the ten-row Foundation
Compatibility Preflight plus a "Source-confirmed freeze results" table naming
the actual symbols/files confirmed at `dcb347fc…`, with explicit limitations
recorded rather than softened.

**Q2 — Were other relevant new Phase 3 concepts represented or amended before
dependent implementation?** Stated plainly: the creation `ActionClass` was
**not** initially represented before Phase 3C; Phase 3C-H1 corrected it via
`docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md`; the Foundation Extensibility
Constitution was introduced in response to that failure mode. Remaining
concepts inspected at this checkpoint:

| Concept | Existing representation | Truthful? | Would the next phase inherit a false assumption? |
|---|---|---|---|
| created-vs-modified provenance | `Provenance = "PRE_EXISTING" \| "PATH_CODE_MODIFIED"` | YES — limited but truthful | NO — recorded as GAP-043 (NON_BLOCKING_LIMITATION) |
| mutation evidence vocabulary | `EditRecord`, `KnowledgeInvalidation`, `CreationAfterStateEvidence` | YES | NO |
| authored-but-not-reobserved knowledge | `CreationAfterStateEvidence` is a distinct type; no Phase 1/2 module imports or accepts it (verified mechanically) | YES | NO |
| committed-failure vocabulary | distinct `COMMITTED_FAILURE` outcome with `commitPointReached: true` | YES | NO |
| plan partiality | `REFUSED_AT_PREFLIGHT` / `STOPPED_BEFORE_ANY_COMMIT` / `PARTIALLY_COMMITTED` / `ALL_APPLIED` + structurally distinct `NOT_ATTEMPTED` | YES | NO |

No remaining uncorrected concept was found.

**Q3 — Did Phase 3 silently map a new concept onto an older semantically
different one?** The known historical case (uncontracted published-path read in
3C) was corrected by 3C-H1 operation-bound verification authority. Independent
search at this checkpoint: no production module outside `src/editing/**`
imports from `src/editing/`; no Phase 1/2 consumer accepts
`CreationAfterStateEvidence`; the only `src/editing/` strings outside the
subsystem are citation literals in the self-observation ledgers. **No remaining
uncorrected semantic substitution found.**

### 7.2 Construction lessons and contract-defect traceability (D2)

Recorded here as report metadata only. No Gap Ledger schema field was invented.

| Lesson | Primary origin | Constitution obligation | Traceable through |
|---|---|---|---|
| 3C after-state through the Phase 2B reader was unsatisfiable | CONTRACT | §5.1 | `docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md` (lines 55, 123); `docs/reports/PHASE_3C_H1_REPORT.md`; GAP-047 (CLOSED at `1136c40a…`) |
| Draft 3D permissive-removal test could not pass because preflight already saw the restriction | CONTRACT | §5.1 | `docs/passes/PHASE_3D_CONTRACT.md` §14: "No impossible \"permissive mid-plan removal\" test is part of this contract." Caught before implementation. |
| GAP-046 was initially softened despite a frozen contradiction | CONTRACT | §5.5 | GAP-046 record (`reviewClassification: BLOCKING_INVARIANT`, CLOSED at `1136c40a…`); `docs/passes/PHASE_3D_CONTRACT.md:2391`; `docs/reports/PHASE_3C_H1_REPORT.md` |

All three are traceable. No closure-bookkeeping finding arises.

### 7.3 Capability Ledger (D3)

Derived mechanically at `63f6e87c…` through `verifyLedgers` +
`deriveAllCapabilityObservations`:

| Capability | Derived state |
|---|---|
| `edit-contracts` | **PASS_FROZEN** |
| `existing-file-replacement` | **PASS_FROZEN** |
| `safe-file-creation` | **PASS_FROZEN** |
| `multi-file-coordination` | **PASS_FROZEN** |
| `safe-editing` | **IMPLEMENTED** |
| `foundation-kernel` | PHASE_VERIFIED |
| `repository-intelligence` | PHASE_VERIFIED |
| `freshness-snapshot` | PASS_FROZEN |
| all remaining Phase 1/2 leaves | IMPLEMENTED |

The corrected trio each cite `freezeEvidence` of kind `sameCommit` at
implementation commit `5386f349eccd7c69ff696619ffc426757e3e91d0` with report
`docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md` — i.e.
corrected implementation evidence, not superseded defective code. All four
mutation component capabilities remain **PASS_FROZEN**. `safe-editing` was not
promoted by this audit.

The restored half-citation `issueLedgerVerification` probe **executed and
passed**, and was proven falsifiable: corrupting `deriveVerifiedState` so that
declaration-only resolution yields `PHASE_VERIFIED` makes the probe fail with
`expected 'PHASE_VERIFIED' to be 'DECLARED'`; restored; final PASS.

### 7.4 Gap Ledger (D4)

`npm run ledger:verify` PASS establishes schema integrity and that every CLOSED
gap's `closedByCommit` resolves to a real ancestor commit
(`tests/ledger/gap-closure-diagnostics.test.ts` proves that check is
falsifiable in both directions).

| Requirement | Result |
|---|---|
| Every Phase 3 gap has a lifecycle | YES |
| GAP-046, GAP-047 CLOSED against immutable corrective commit | YES — both `1136c40ab1667e4a5b70185c8bef68ce67d675a2` (ANCESTOR) |
| GAP-048, GAP-049, GAP-050 CLOSED | YES — all `5386f349eccd7c69ff696619ffc426757e3e91d0` (ANCESTOR) |
| GAP-043, GAP-044, GAP-045 OPEN with closure conditions | YES |
| GAP-031, GAP-035, GAP-036, GAP-037, GAP-040, GAP-041 retain current reviewed states | YES — untouched by the R1 diff (`ee58673..HEAD` touches only GAP-051…GAP-056) |
| Every NON_BLOCKING_LIMITATION states why non-blocking, missing evidence, closure condition | YES |

### 7.5 Compile-time sweep (D5)

- `@ts-expect-error` directives across `src/`, `tests/`, `scripts/`: **74**
- **TS2578 = 0** on a clean typecheck.

Spot checks (directive removed → exact compiler error captured → intended
type/property confirmed → restored → typecheck PASS):

| Phase | Boundary | Exact error |
|---|---|---|
| 3A | `PreparedMutation` opaque brand (`tests/editing/type-contracts.ts:24`) | `TS2322: Type '{ preparedId: string; … }' is not assignable to type 'PreparedMutation'.` |
| 3B | `EditAuthorization` opaque brand (line 61) | `TS2741: Property '[editAuthorizationBrand]' is missing … but required in type 'EditAuthorization'.` |
| 3C | `PreparedCreation` opaque brand (line 39) | `TS2322: Type '{ preparedId: string; action: "CREATE_FILE"; … }' is not assignable to type 'PreparedCreation'.` |
| 3C-H1 / Amendment 1 | `PublishedCreationVerificationTarget` (line 162) | `TS2741: Property '[publishedCreationVerificationBrand]' is missing in type '{ absolutePath: string; }' …` |
| 3D | `MultiFilePlan` opaque brand — **no committed `@ts-expect-error` directive exists**; verified instead by a temporary compile probe, then deleted | `TS2322: Type 'MultiFilePlanData' is not assignable to type 'MultiFilePlan'.` |

The Phase 3D type boundary is real but carries no permanent compile-time
directive; it is enforced at runtime by `createMultiFilePlan`. Recorded as an
observation, not a defect.

---

## 8. R1-SPECIFIC RECONCILIATION CHECKS

| ID | Requirement | Result |
|---|---|---|
| R1-A | safe-editing is NOT `PHASE_VERIFIED` at this checkpoint; record its actual derived state | **PASS** — actual derived state is **IMPLEMENTED** (`phaseAuditEvidence` absent, `freezeEvidence` absent, `implementationEvidence` present citing `src/editing/index.ts` at `5386f349…`) |
| R1-B | GAP-051, GAP-052 OPEN; GAP-053, GAP-054 CLOSED; GAP-055, GAP-056 OPEN | **PASS** — GAP-051 OPEN, GAP-052 OPEN, GAP-053 CLOSED (`2208dfa91e8f16571c3df884441aef7c75b1a062`), GAP-054 CLOSED (`7f4267d5d59feee8a73e5e3217c6ab2b1abd7a48`), GAP-055 OPEN, GAP-056 OPEN |
| R1-C | restored half-citation probe still proves the historical mechanism claim independently of live-state pins | **PASS** — the probe constructs its own `declarationOnly` record and forged ledger and asserts the derivation cannot reach `PHASE_VERIFIED`; the mechanism assertions do not depend on the live record's state. Executed, passed, and proven falsifiable (§7.3) |
| R1-D | `scripts/ledger-verify.ts` uses the universal `phaseAuditEvidence`-shape consistency rule and hardcodes neither safe-editing nor a list of closed phases | **PASS** — `scripts/lib/phase-audit-shape.ts` iterates every capability record and mentions no capability ID or phase name. Proven live: forcing the helper to emit one failure makes `npm run ledger:verify` print `[DERIVATION] AUDIT-PROBE: forced shape failure` and exit non-zero; restored; `ledger:verify PASS at 63f6e87c…` |
| R1-E | Stage 1 shape-consistency falsifications are permanent tests and falsifiable | **PASS** — `tests/selfobs/phase-audit-shape.test.ts` (1-F1, 1-F2, plus a truthful-match case) imports the exact helper `ledger:verify` calls. Neutering the helper makes 1-F1 and 1-F2 fail (`expected false to be true`); restored; 3/3 PASS |
| R1-F | no production file under `src/editing/` changed in R1 Stages 0–2 | **PASS** — `git diff ee58673..HEAD -- src/editing/` is empty. The whole R1 diff is 11 files: `docs/GAP_LEDGER.md`, the R1 contract, the R1 reconciliation report, `scripts/ledger-verify.ts`, `scripts/lib/phase-audit-shape.ts`, `src/selfobs/capability-ledger-data.ts`, `src/selfobs/gap-ledger-data.ts`, three audit/derivation test files, and `tests/selfobs/phase-audit-shape.test.ts` |
| R1-G | 607 remains bound only to Closure A / `04591e4` | **PASS** — exactly one `recordedFigure` carries `value: "607"`, with `inDocument: "docs/PHASE_3_CLOSURE.md"` and `atCommit: SHA.phase3Closure = 04591e400f6b8efe7190ce01faef4da97d0eb984`, needle `\| Runtime tests \| **607** PASS \|`, which resolves. No other 607 binding exists |
| R1-H | no R1 closure artifact or promotion exists yet | **PASS** — no R1 closure document; `safe-editing` not promoted; GAP-051/GAP-052 still OPEN; no Phase 4 artifact exists |

The capability-ledger supersession performed in Stage 1 is minimal and truthful:
only `phaseAuditEvidence` was removed; `implementationEvidence` and the 607
`recordedFigure` were retained; GAP-052 and GAP-056 were attached to
`knownLimitations`.

---

## 9. NEW FINDINGS

### F-R1-001 — Standing public-authority guard does not represent every public editing-barrel option surface; A-F19 does not fail for `authorizePreparedChange`

**Classification:** `proposedClass` only — this audit records no reviewed
classification and makes no Gap Ledger edit (Stage 3 §3.7 forbids ledger
edits). Proposed: **BLOCKING_INVARIANT** for the P2/A-F19 audit gate.

**Lifecycle:** OPEN — requires a separately reviewed corrective contract.

**Statement.** Audit dimension P2 requires that *every* public function's
complete parameter/options surface be represented in the standing
manifest/test, and falsification A-F19 requires that adding a callable
mechanism-substitution field to an otherwise public function surface makes the
standing declaration/manifest test fail.

`authorizePreparedChange` is exported from the public Phase 3 editing barrel
`src/editing/index.ts`, as is its public option type
`AuthorizePreparedChangeOptions`. It is the **authority-issuing** function of
the subsystem: it mints `EditAuthorization`. Its option surface is not
represented anywhere in `tests/architecture/public-authority-surface.test.ts`,
which hardcodes exactly three option types
(`ReplaceExistingFileOptions`, `CreateFileOptions`,
`ExecuteMultiFilePlanOptions`) and three wrapper bodies.

**Live evidence.** Adding

```ts
readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
```

to `AuthorizePreparedChangeOptions` in `src/editing/types.ts` produced:

- `tests/architecture/public-authority-surface.test.ts` — **5/5 PASS**
- `tests/integration/phase3-reaudit-public-surface.test.ts` — **9/9 PASS**
- full suite `vitest run` — **612 passed (612)**, 64 files
- `npm run check` — unaffected

The corruption was restored exactly; `git status --porcelain` empty.

**Why the barrel-level assertions do not cover it.** The guard's barrel checks
inspect exported *names* and the barrel *source text*. `AuthorizePreparedChangeOptions`
is declared in `src/editing/types.ts` and re-exported through the barrel's
`export type { … }` block, so a mechanism-substitution property added to its
body appears in neither the exported-name list nor the barrel source.

**Why this is not an already-recorded limitation.**
`docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md` §9 defers
"Full Amendment 1 standing guard items that require complete package-root
`.d.ts` callable-surface manifests **beyond the Phase 3 editing option types
already guarded**". `AuthorizePreparedChangeOptions` **is** a Phase 3 editing
option type, so it falls inside the class that record describes as already
guarded. The recorded deferral therefore does not cover this surface; it
overstates current coverage.

**Relationship to the frozen hardening contract.** §2.4(C) of
`docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md` requires the
standing guard to "produce a deterministic public callable-surface manifest
containing every public function's parameters and relevant user-defined option
properties". The implemented guard does not produce such a manifest; it
enumerates three hand-listed option types.

**What is NOT claimed.** No active `PUBLIC_AUTHORITY_SURFACE_LEAK` exists at
this checkpoint. An independent compiler-AST sweep across all thirteen
repository barrels and every type they export found **zero** public members
carrying a call signature, an operation/adaptor/executor/verifier shape, or an
`any`/`unknown`/rest/index escape. `AuthorizePreparedChangeOptions` is today
exactly `{ gitContext?: GitStateBaseline }`. The defect is the **absence of
standing detection**, not a present leak. Phase 3 mutation semantics and the
three corrected wrappers are not reopened by this finding.

**Primary origin:** EVIDENCE (the standing mechanism does not cover the surface
its governing contract requires). **Contributing origin:** CONTRACT — the
hardening report's NOT VALIDATED wording scopes the deferral in a way that
excludes the very surface that is unguarded.

**Frozen obligation affected:** Foundation Extensibility Constitution V1
Amendment 1 standing guard; hardening contract §2.4(C) and §2.3 obligation 8.8
("PUBLIC CALLABLE SURFACE IS COMPLETE AUTHORITY SURFACE").

**Smallest likely corrective surface:** extend
`tests/architecture/public-authority-surface.test.ts` to derive the public
option-type set from the editing barrel's own export list rather than a
hardcoded triple, and assert each such type's complete property list — plus
correct the hardening report's deferral wording (or record the deferral as a
gap). No production change is implied.

**Not repaired here.** Stage 3 §3.7 forbids editing prior tests and forbids
ledger edits; the Stage 3 gate directs findings to a separately reviewed
corrective contract.

### F-R1-002 (observation, non-gating) — standing guard's hidden-input patterns miss the cast-read form

Under falsification A-F20 the public wrapper was made to read
`(options as { fsOps?: AtomicReplaceFsOps }).fsOps`. The standing guard's
forbidden-pattern list (`/\boptions\.fsOps\b/`, `/\barguments\s*\[/`) does not
match this form and **passed**; only the P4 malicious-runtime proof detected it
(`expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'`).

This does not defeat P4 — the required runtime proof caught it, which is the
gate P4 actually specifies — so it is recorded as an observation supporting
F-R1-001's corrective surface rather than as an independent gate failure.

---

## 10. COMPLETE-CRITERIA EVALUATION (§3.8)

| Condition | Result |
|---|---|
| every original Phase 3 audit criterion passes | YES |
| SE-001…SE-020 all SATISFIED_PHASE_WIDE | YES |
| relevant P3D obligations pass | YES (P3D-001…P3D-015) |
| **P1 through P14 pass** | **NO — P2 fails (F-R1-001)** |
| **every applicable A-F15…A-F22 probe fails/restores as required** | **NO — A-F19 does not fail for `authorizePreparedChange` (F-R1-001)** |
| R1-A through R1-H pass | YES |
| no active PUBLIC_AUTHORITY_SURFACE_LEAK remains | YES |
| **every new finding is already recorded or causes NOT COMPLETE** | **F-R1-001 is a new finding, not already recorded → NOT COMPLETE under the No-Untracked-Finding Rule** |
| all four mutation component capabilities remain PASS_FROZEN | YES |
| safe-editing is NOT PHASE_VERIFIED before closure linkage | YES (IMPLEMENTED) |
| runtime dependencies remain 0 | YES |
| exactly one project filesystem write module remains | YES (`src/editing/atomic-fs.ts`) |
| working tree clean except permitted Stage 3 output before commit | YES |
| Phase 4 absent | YES |

Three conditions fail. The gate therefore returns NOT COMPLETE.

---

## 11. VALIDATION (§3.9)

Run at the clean audited checkpoint after every falsification was restored.

| Command | Result |
|---|---|
| `npm run ledger:verify` | **PASS** — `ledger:verify PASS at 63f6e87cf199b3b551196be09a486b81da2860dd` |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 612 passed (612); Test Files 64 passed (64)** |
| `npm run build` | **PASS** |
| `npm run cli:smoke` | **PASS** |
| `npm run check` (attempt 1) | **FAIL** — 2 failed / 610 passed (612); `Test Files 2 failed | 62 passed (64)`; exit 1 |
| `npm run check` (attempt 2) | **PASS** — `Test Files 64 passed (64)`, `Tests 612 passed (612)`, `ledger:verify PASS at 63f6e87c…`; exit 0 |

**Exact runtime test total at the audited checkpoint: 612.**

### `npm run check` attempt 1 — recorded honestly

Attempt 1 of the aggregate `npm run check` gate failed with exactly two
5000 ms test timeouts under unconstrained default-worker parallelism:

- `tests/snapshot/git-snapshot-membership.test.ts > Phase 2G-H1 cross-component
  membership > rejects Git baseline from a foreign inventory even with
  identical lexical paths` — `Error: Test timed out in 5000ms.`
- `tests/reader/adversarial.test.ts > reader architecture > does not export
  ContentObservation constructors from compiled dist` — `Error: Test timed out
  in 5000ms.`

Both files were then re-run in isolation and passed (**14/14**, 7.05 s), and
`npm run check` attempt 2 passed in full. Neither failure is an assertion
failure; both are wall-clock timeouts on Git/dist-import-bound tests.

This is the **already-recorded** environment characteristic, cited exactly:

- `docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_CENSUS.md` baseline gates
  table — "unconstrained `npm run check` | flake: concurrent default-worker
  Git/snapshot timeouts; not a Phase 3 authority-surface mismatch";
- `docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md` §9 —
  "Unconstrained default-worker `npm run check` flake characteristics
  (Git/snapshot timeouts) — unrelated to authority-surface correction".

It is therefore dispositioned under the No-Untracked-Finding Rule as an
already-recorded frozen limitation, not as a new finding. It is **not** a cause
of this audit's NOT COMPLETE result, and it is **not** evidence that the gate is
green on a single unconstrained run: it is not.

No test was weakened, narrowed, deleted or rewritten. No production code was
changed. No failing test is left under `tests/**`. Every temporary corruption
was restored by `git checkout --` and verified with an empty
`git status --porcelain`.

---

## 12. NOT VALIDATED

- This audit executed on a single host (darwin 25.5.0, Node 26). Platform- and
  environment-specific gaps remain unproven elsewhere.
- A NOT COMPLETE result means this evidence found a gate failure; a COMPLETE
  result would have meant no defect was found by this evidence, never that no
  defect can exist.
- Residual per-target filesystem races remain as recorded gaps (GAP-035,
  GAP-036, GAP-037, GAP-044, GAP-045).
- No rollback mechanism exists and none is tested.
- Deletion and directory creation are outside Phase 3.
- Authored creation evidence requires re-observation before it becomes
  repository knowledge; the frozen provenance vocabulary does not distinguish
  created from modified (GAP-043).
- Hostile TypeScript casts remain possible; the audit's own A-F20 probe shows
  the standing guard does not detect the cast-read form.
- `safe-editing` PHASE_VERIFIED depends on later closure evidence that does not
  exist at this checkpoint.
- Auditor independence is asserted, not mechanically proven (GAP-055). The
  presence of this report is REPOSITORY_RECORDED; the truth of the provenance
  block rests on operator attestation.
- The final-head runtime figure 612 recorded here is bound to this report at
  its own commit; GAP-056 concerns the separate 608 figure at `ee58673` and is
  not closed by this audit.
- The Constitution §10 bounded foundation baseline audit has not run.
- Phase 4 has not started.
- `npm run check` is not reliably green on a single unconstrained default-worker
  run on this host: attempt 1 failed with two 5 s timeouts, attempt 2 passed.
  The suite is deterministic under isolation and under `npm test`; the aggregate
  gate's timing behaviour is not validated here beyond the two runs recorded.
- No `tests/integration/phase3-reaudit-r1.test.ts` was written. Adding standing
  coverage for the surface named in F-R1-001 would have repaired the very
  defect that makes this audit NOT COMPLETE, which §3.8 forbids inside the
  audit; the two permitted files are a maximum, not a requirement.

---

## 13. GIT STATE

| Item | Value |
|---|---|
| Starting HEAD | `63f6e87cf199b3b551196be09a486b81da2860dd` |
| Audited Stage 2B checkpoint | `63f6e87cf199b3b551196be09a486b81da2860dd` |
| Working tree before this commit | clean except this report |
| Production changes | **NONE** |
| Test changes | **NONE** |
| Ledger changes | **NONE** |
| Capability promotion | **NONE** |
| Closure created | **NO** |
| Stage 4 started | **NO** |
| Foundation §10 audit started | **NO** |
| Phase 4 started | **NO** |
| Pushed | **NO** |
| Remote created | **NO** |

---

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE
