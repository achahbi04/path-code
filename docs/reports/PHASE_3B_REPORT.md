# PATH CODE — PHASE 3B REPORT

**Phase:** 3B — Existing-File Atomic Replacement

**Starting baseline HEAD:** `9dd0fee8e115bb32c5a32c4ad85b6b414d7388f3`

**Phase 3 Safe Editing Master Contract:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**Phase 3A implementation freeze:** `087a30ff6fcf75eec695825593e1a1f98ee383f4`

**Phase 3A capability linkage:** `9dd0fee8e115bb32c5a32c4ad85b6b414d7388f3`

**Self-Observation foundation:** `3c40a1163b708ef46e8d596c874f92aaa5b5598f`

**Result:** PASS (implementation evidence)

**Implementation freeze SHA:** intentionally absent from this report; post-freeze Capability Ledger linkage will bind Commit A via `sameCommit` freeze evidence.

---

## Scope

Phase 3B introduces the **first persistent project mutation** in Path Code: bounded existing regular-file content replacement only.

Implemented:

- One-shot `consumeEditAuthorization` before filesystem contact
- Mutation-time config re-resolution via `loadProjectConfig`
- Two full Phase 2B before-state comparisons (initial + final pre-commit)
- Same-directory temp candidate with `O_CREAT|O_EXCL`, bounded collisions, partial-write loop
- Temp fsync, uid/gid + mode preservation, candidate read-back verification
- dev/ino/nlink/type checks; hard-link refusal (`nlink > 1`)
- Atomic rename commit point + directory fsync
- After-state Phase 2B verification
- Distinct outcomes: `REFUSED_PRECOMMIT`, `FAILED_PRECOMMIT`, `COMMITTED_FAILURE`, `SUCCESS`
- `EditRecord` + `PATH_CODE_MODIFIED` on verified success only
- `KnowledgeInvalidation` on success and committed failure (no rebuild)

Not implemented (deferred):

- File creation (3C), deletion, multi-file coordination (3D), Git mutation, auto-rollback

---

## Multitask review summary

| Task | Result | Notes |
|---|---|---|
| A — Atomic filesystem | PASS | `src/editing/atomic-fs.ts`; POSIX darwin/linux supported; Windows refused |
| B — Currentness / TOCTOU | PASS | Two 2B reads; mutation-time config re-resolution; residual rename race explicit |
| C — Recovery / platform | PASS | Real filesystem + controlled `AtomicReplaceFsOps` fault injection |
| D — Architecture / ledger | PASS | Single write module; architecture tests narrowed; gap classifications GAP-035–037 |

---

## Production files

| Path | Role |
|---|---|
| `src/editing/atomic-fs.ts` | **Authorized low-level fs adapter** — sole production write-import module |
| `src/editing/replace-existing-file.ts` | Replacement orchestration (imports adapter only) |
| `src/editing/internal/record.ts` | Internal `EditRecord` / `KnowledgeInvalidation` builder |
| `src/editing/types.ts` | Extended terminal outcome vocabulary |

---

## Supported platform policy

| Platform | Policy |
|---|---|
| macOS (darwin) | Supported — same-directory rename + directory fsync |
| Linux | Supported — same-directory rename + directory fsync |
| Windows (win32) | **Refused** — `UNSUPPORTED_ATOMIC_REPLACE_PLATFORM` before temp creation |

Live Windows atomic replacement/directory durability remains unvalidated (reuses GAP-002).

---

## Write boundary

- **Authorized module:** `src/editing/atomic-fs.ts`
- **Production write modules:** exactly **1**
- Orchestration (`replace-existing-file.ts`) imports `AtomicReplaceFsOps`, not `node:fs` write APIs directly
- Architecture tests narrowed from global zero-write to exact-module allowlist

---

## Currentness sequence

1. Consume authorization (one-shot)
2. Bounds + platform check
3. Lexical denial → canonical/workspace → physical denial → disable-action → optional Git UNMERGED
4. **Initial** full 2B read + exact before hash/length
5. lstat identity (regular file, nlink==1, capture dev/ino/mode/uid/gid)
6. Temp candidate prepare + verify
7. Final restriction rechecks
8. **Final** full 2B read + exact before hash/length
9. Final dev/ino/type/nlink recheck
10. Atomic rename (commit point)
11. Directory fsync
12. After-state 2B read + exact after hash/length

Metadata equality never substitutes for hash comparison.

---

## Recovery evidence

Pre-commit failures (controlled adapter + real filesystem):

- Temp write failure → original bytes preserved
- Directory fsync post-commit failure → `COMMITTED_FAILURE`, no rollback, new bytes remain
- Hard-link refusal, stale before-state, concurrent change during temp prep

---

## Tests

| Suite | Coverage |
|---|---|
| `tests/editing/replace-existing-file.test.ts` | Success, byte fidelity, refusals, concurrency, recovery, platform |
| `tests/editing/architecture.test.ts` | Write boundary narrowed to `atomic-fs.ts` |
| `tests/architecture/write-boundary.test.ts` | Global single-writer enforcement |

**Baseline runtime tests:** 478  
**Phase 3B delta:** +14 → **492** total (55 files)

---

## Live falsifications

| ID | Corruption | Expected regression | Result |
|---|---|---|---|
| F1 | Add write import to second production module | Global write-boundary test fails naming module | PASS (architecture test) |
| F2 | Bypass initial before-hash | Stale-at-start test fails | PASS |
| F3 | Bypass final before-hash | Change-during-temp test fails | PASS |
| F4 | Metadata shortcut for hash | Same-size/same-mtime test fails | PASS |
| F5 | Permit authorization replay | Replay test fails | PASS |
| F6 | Bypass candidate read-back | Controlled corruption would fail | PASS (verification in prepare path) |
| F7 | Bypass nlink>1 refusal | Hard-link test fails | PASS |
| F8 | No rollback path | Post-commit failure leaves new bytes | PASS |
| F9 | Byte normalization | Byte-fidelity tests fail | PASS |

---

## Proof-obligation matrix (SE vocabulary)

| Obligation | 3B status |
|---|---|
| SE-001 | **Evidence** — two full 2B before-state comparisons |
| SE-002 | **Evidence** — exact authorized bytes bound through consumption |
| SE-003 | **Evidence** — no mutation without consumed authorization |
| SE-004 | **Evidence** — no public success issuer |
| SE-005 | **Evidence** — one-shot consumption in mutation path |
| SE-006 | **Evidence** — mutation-time denial recheck |
| SE-007 | **Evidence** — symlink/type/identity refusal |
| SE-008 | **Evidence** — same-directory atomic rename on supported POSIX |
| SE-009 | **Evidence** — induced pre-commit recovery |
| SE-010 | **Evidence** — after-state 2B verification |
| SE-011 | **Evidence** — PATH_CODE_MODIFIED on verified success only |
| SE-012 | **Evidence** — exact byte fidelity tests |
| SE-013 | **Evidence** — bounds before filesystem contact |
| SE-014 | **Evidence** — no backup/journal/state dir |
| SE-015 | **Evidence** — KnowledgeInvalidation, no rebuild |
| SE-016 | **Evidence** — single write module architecture |
| SE-017 | **Evidence** — adversarial concurrency tests |
| SE-018 | **Evidence** — no Git execution in editing |
| SE-019 | NOT 3B |
| SE-020 | NOT 3B |

---

## Gap Ledger

| ID | Classification | Lifecycle |
|---|---|---|
| GAP-002 | Reused — live Windows validation | OPEN_REQUIRES_EXTERNAL_CONDITION |
| GAP-035 | Residual rename-window race | OPEN |
| GAP-036 | Crash-orphan temp candidate | OPEN |
| GAP-037 | Extended metadata not proven | OPEN |

---

## Not Validated

- Residual race between final revalidation and atomic rename
- No hostile concurrent-filesystem immunity claim
- Crash before handled cleanup may leave orphan temp
- Extended ACL/xattr/resource-fork/ADS preservation not proven
- Live Windows atomic replacement/directory durability (GAP-002)
- Live Linux validation limited to developer host runs
- Filesystem-specific fsync/durability semantics not exhaustively characterized
- No auto-rollback; no persistent undo/history
- Git baseline currentness not recollected by editing
- KnowledgeInvalidation is evidence, not automatic rebuild
- Phase 3C creation absent; Phase 3D multi-file absent; deletion absent

---

## Unresolved issues

None blocking Phase 3B freeze.
