# PATH CODE — PHASE 3C REPORT

**Pass:** Phase 3C — Safe Single-File Creation

**Result:** PASS (implementation + evidence; capability linkage deferred to Commit B)

**Starting HEAD:** `a6f87cb60a06070f5dc188eadff3c4eb95f08862`

**Frozen Phase 3 Master:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**3C implementation SHA:** intentionally absent; post-freeze Capability Ledger linkage will bind it.

**Phase 3D:** not started.

---

## 1. Multitask join gate

| Task | Verdict |
|---|---|
| A Publication / platform / mode | PASS |
| B Absence / parent / config / Git | PASS |
| C Recovery / commit-point / injection | PASS |
| D Architecture / adversarial / ledger | PASS |

### Disable-action (C4) resolution

Frozen Phase 1E `ActionClass` cannot express `CREATE_FILE`. Phase 3A documented that `disable-action=EDIT` disables modification only. Phase 3C **does not invent** a mapping. Permanent test proves `disable-action=EDIT` does not disable creation. C4 `ACTION_DISABLED` for creation remains **Not Validated / documented 3A limitation**.

---

## 2. PreparedCreation sufficiency

Reused frozen 3A `PreparedCreation`:

- branded opaque authority
- parent `RepositoryEntry` + validated leaf
- immutable proposed bytes/hash/length
- point-in-time `NON_EXISTENT` precondition
- workspace/config provenance
- one-shot `EditAuthorization`

`PreparedCreation ≠ PreparedMutation`.

---

## 3. Absence / parent / config / Git

| Concern | Behavior |
|---|---|
| Absence | Only `WorkspaceBoundary.canonicalize` → `PATH_NOT_FOUND` |
| Inconclusive | Any other canonicalization failure → `ABSENCE_UNVERIFIABLE` refuse |
| Parent | Must currently resolve as in-workspace directory; no mkdir |
| Config | 3B mutation-time reload; `ConfigFailure` → `CONFIG_RELOAD_FAILED` |
| Git | Optional UNMERGED refuse via existing policy |

---

## 4. Publication primitive

**Commit point:** successful `link(candidate, target)` via `atomic-fs.linkNoOverwrite`.

Sequence:

1. Same-directory exclusive temp (`.path-code-create-` + unpredictable suffix)
2. Write exact authorized bytes (partial-write loop)
3. Candidate fsync
4. Final mode = `0o666 & ~process.umask()` (umask not mutated)
5. Candidate read-back hash/length verify
6. Final parent / denial / absence rechecks
7. `linkNoOverwrite` (EEXIST → `TARGET_ALREADY_EXISTS`, external bytes untouched)
8. Unlink candidate name
9. Directory fsync
10. Bounded published-path after-state verify through write adapter (`readPublishedBytes` + `fingerprintBytes`)

**Platform:** darwin/linux via independent `isAtomicCreatePlatformSupported()`. win32 refused before staging.

**Why not Phase 2B `readRepositoryContent`:** a branded `RepositoryEntry` does not exist until inventory refresh, which 3C explicitly does not perform. After-state uses the same SHA-256 fingerprinting and byte ceiling as Phase 2B/3A over a bounded read of the published path.

---

## 5. Window-race evidence

**REAL_FILESYSTEM:** test intercepts `linkNoOverwrite`, creates the target with real `writeFile`, then delegates to production `link`.

Expected: EEXIST → `TARGET_ALREADY_EXISTS`; external bytes unchanged; candidate cleaned.

**PASS.**

---

## 6. Recovery matrix

| Failure | Outcome | `commitPointReached` |
|---|---|---|
| Temp/write/fsync/mode/verify | `FAILED_PRECOMMIT` | false |
| EEXIST at link | `REFUSED_PRECOMMIT` / `TARGET_ALREADY_EXISTS` | false |
| Other link failure | `FAILED_PRECOMMIT` | false |
| Unlink after link | `COMMITTED_FAILURE` + `cleanupFailure` | true |
| Directory fsync | `COMMITTED_FAILURE` | true |
| After-state mismatch/read | `COMMITTED_FAILURE` | true |

Post-publication: never delete/rewrite target.

---

## 7. Inventory invalidation

On SUCCESS and post-publication committed failure: `KnowledgeInvalidation` with `editRecordKind: "CREATION"`.

No reinventory / rebuild.

---

## 8. Provenance

SUCCESS earns `PATH_CODE_MODIFIED` only (frozen vocabulary). No `PATH_CODE_CREATED`. See GAP-043.

---

## 9. Write boundary

Single production write module: `src/editing/atomic-fs.ts`.

Orchestration in `create-file.ts` imports mutation only through the adapter.

Permanent architecture tests green. C-F1 covered by allowlist tests (live second-module write probe recorded as permanent regression target).

---

## 10. Live falsifications / permanent targets

| ID | Evidence |
|---|---|
| C-F1 write boundary | Permanent `write-boundary` / editing architecture allowlist |
| C-F2 no-overwrite | Window-race REAL_FILESYSTEM + rename-overwrite scaffolding proving external bytes would be destroyed |
| C-F3 inconclusive≠absent | Absence tests refuse non-`PATH_NOT_FOUND` |
| C-F4 cleanup before commit | Pre-publication write-failure residue test |
| C-F5 no delete on mismatch | After-state mismatch keeps target |
| C-F6 inventory invalidation | SUCCESS emits `CREATION` invalidation |
| C-F7 mode policy | Mode equals `computeCreatedFileMode()`, no executable bits |

---

## 11. SE matrix (creation)

| Obligation | Status |
|---|---|
| SE-001 | SATISFIED_FOR_SINGLE_FILE_CREATION |
| SE-008 | SATISFIED_FOR_EXISTING_FILE_REPLACEMENT (3B); creation uses no-overwrite link |
| SE-009 | SATISFIED_FOR_SINGLE_FILE_CREATION (pre-publication recovery) |
| SE-010 | SATISFIED_FOR_SINGLE_FILE_CREATION |
| SE-011 | SATISFIED_FOR_SINGLE_FILE_CREATION (PATH_CODE_MODIFIED) |
| SE-015 | SATISFIED_FOR_SINGLE_FILE_CREATION (inventory invalidation) |
| SE-016 | SATISFIED_FOR_SINGLE_FILE_CREATION (one write module) |
| SE-019 | SATISFIED_FOR_SINGLE_FILE_CREATION |
| SE-020 | NOT_IN_3C → Phase 3D |

---

## 12. Gaps

| ID | Lifecycle |
|---|---|
| GAP-002 | OPEN_REQUIRES_EXTERNAL_CONDITION (unchanged) |
| GAP-035 | OPEN (unchanged; 3B rename-scoped) |
| GAP-036 | OPEN (unchanged) |
| GAP-037 | OPEN (unchanged) |
| GAP-038/039/042 | CLOSED (unchanged) |
| GAP-040 | OPEN (unchanged) |
| GAP-041 | OPEN unreviewed (unchanged) |
| **GAP-043** | OPEN — created vs modified provenance |
| **GAP-044** | OPEN — final revalidation→link race |
| **GAP-045** | OPEN — post-publication temp second name |

---

## 13. Actual tests

- `tests/editing/create-file.test.ts` — success, bytes, race, absence, config C1–C4, recovery, replay, mode, leaf
- Existing 3B / architecture / write-boundary suites remain green

---

## 14. Not Validated

- CREATE_FILE disable-action via Phase 1E ActionClass (documented 3A limitation)
- GAP-040 superseding-negative-evidence semantics
- GAP-041 pass-contract repository artifact limitation
- Hostile concurrent filesystem linearizability (GAP-044)
- Branded Phase 2B `RepositoryEntry` after-state read without reinventory
- Windows / unsupported filesystem creation
- Phase 3C / 3D multi-file coordination
- Phase 3 not closed
- O_NOFOLLOW availability varies by platform constants (used when present)
