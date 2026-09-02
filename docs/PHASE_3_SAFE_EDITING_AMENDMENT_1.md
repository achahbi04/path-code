# PATH CODE — PHASE 3 SAFE EDITING AMENDMENT 1

**Amendment ID:** PHASE_3_SAFE_EDITING_AMENDMENT_1

**Status:** FROZEN (document-only; implementation follows in Phase 3C-H1 Stage 2)

**Amends:** Frozen Phase 3 Safe Editing Master Contract

**Frozen Master (immutable, untouched):** `docs/PHASE_3_SAFE_EDITING_MASTER.md` at `58439d90cfb0b786137454d21bc88f994fcd0270`

**Companion amendment:** [`docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md`](PHASE_1_ACTION_CLASS_AMENDMENT_1.md)

**Pattern:** The frozen Master remains byte-identical. This amendment is read **together with** the Master and Phase 1 Action Class Amendment 1.

---

## A. CREATE_FILE action restriction

### Mapping

| Phase 3 semantic action | Phase 1 ActionClass |
|---|---|
| `MODIFY_EXISTING_FILE` | `EDIT` (unchanged historical mapping) |
| `CREATE_FILE` | `CREATE_FILE` (new; Phase 1 Action Class Amendment 1) |

No other action mappings change.

### Enforcement points

`CREATE_FILE` must be refused when the current resolved config disables ActionClass `CREATE_FILE`:

1. **Authorization issuance** — refuse; no `EditAuthorization` issued.
2. **Mutation time** — after freshly re-resolved mutation-time config, refuse with `REFUSED_PRECOMMIT` / `ACTION_DISABLED` (or exact existing outcome vocabulary) **before** candidate publication.

Config may REFUSE. Config never grants authority.

Successful ABSENT config (no PATHCODE.md) continues to mean restrictions absent.

`ConfigFailure` at mutation-time reload continues to fail closed (`CONFIG_RELOAD_FAILED`); no stale fallback.

`disable-action=EDIT` does **not** automatically disable `CREATE_FILE`.

### Rejected alternative (Option A)

Reviewed and rejected: amend Phase 3 so creation remains non-disableable by ActionClass.

Reason: would intentionally preserve asymmetric action authority and conflict with the frozen Master’s requirement that `MODIFY_EXISTING_FILE` and `CREATE_FILE` are distinct mutation classes. `deny-path` is not an equivalent substitute.

---

## B. POST_CREATION_VERIFICATION_READ authority

### Problem

A newly created path has no `RepositoryEntry`. Phase 3C performs no reinventory. The Phase 2B entry-bound reader therefore cannot verify the published target. A bounded published-path read is required for after-state verification, but must not become generic repository-read authority.

### Frozen concepts

#### `PublishedCreationVerificationTarget`

Must be:

- opaque
- internal to `src/editing/**`
- non-serializable as authority
- **not** exported from the public editing barrel
- minted **only** by **this** creation operation after its own successful no-overwrite publication commit point (`linkNoOverwrite` / equivalent)
- bound to the exact target path **this** operation published
- bound to the exact operation / publication identity
- unable to be caller-constructed from a path string
- unable to be minted for a target that existed before this operation
- unable to be retargeted to another path
- unable to verify another creation operation’s target

The publication primitive earns/returns this token as a consequence of successful publication.

#### Verification read

Must:

- accept **only** `PublishedCreationVerificationTarget`
- perform a bounded read of **only** the target encoded by that token
- use the same 1 MiB ceiling as Phase 2B / Phase 3 per-file editing (`MAX_EDIT_FILE_BYTES` / `MAX_REPOSITORY_CONTENT_BYTES`)
- compute SHA-256 + byte length
- return `CreationAfterStateEvidence`
- remain internal to editing
- perform **no** arbitrary caller-path read

A low-level physical read may remain inside the sole write module (`src/editing/atomic-fs.ts`) **only** behind this opaque token boundary. Unrestricted path-shaped post-creation verification entrypoints are forbidden.

#### `CreationAfterStateEvidence`

Must:

- contain mutation-verification evidence only
- contain observed SHA-256
- contain observed byte length
- retain/bind the publication/target identity required by the creation `EditRecord`
- **NOT** be `RepositoryEntry`
- **NOT** be `ContentObservation`
- **NOT** imply inventory membership or admission
- **NOT** enter RepositoryMap / Search / Snapshot as repository knowledge

### Plain statement

**POST_CREATION_VERIFICATION_READ IS NOT REPOSITORY KNOWLEDGE.**

It verifies what **this** operation published.

It does not admit the path.

It does not create `RepositoryEntry`.

It does not close inventory staleness.

It cannot be used to read a pre-existing file.

---

## C. SE clarifications (additive; no renumbering)

- **SE-003 / SE-016 / action restriction:** Phase 3 mutation mechanisms must honor ActionClass `CREATE_FILE` for creation and `EDIT` for existing-file modification as distinct classes (this amendment + Phase 1 Amendment 1).
- **SE-010 / SE-019 after-state:** For creation, trusted after-state verification is satisfied by operation-bound `CreationAfterStateEvidence` under this amendment; inventing a branded `RepositoryEntry` or performing reinventory is not required and remains forbidden in 3C.

Do not renumber SE-001 through SE-020. Do not rewrite the frozen Master.

---

## D. Implementation note

Source/tests implementing these contracts are **not** part of this document-only commit. They occur in Phase 3C-H1 Stage 2 after this amendment is immutable.
