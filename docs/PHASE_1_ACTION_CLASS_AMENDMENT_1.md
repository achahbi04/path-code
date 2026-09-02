# PATH CODE — PHASE 1 ACTION CLASS AMENDMENT 1

**Amendment ID:** PHASE_1_ACTION_CLASS_AMENDMENT_1

**Status:** FROZEN (document-only; implementation follows in Phase 3C-H1 Stage 2)

**Amends:** Phase 1E ActionClass vocabulary as closed in [`docs/PHASE_1_FOUNDATION_CLOSURE.md`](PHASE_1_FOUNDATION_CLOSURE.md)

**Phase 1E checkpoint (immutable source being amended):** `d1fb57c8353a98ab032bf5b27a791a92218aecb9`

**Machine representation before this amendment:** `ActionClass` in `src/domain/authority.ts` and the matching `ACTION_CLASSES` set in `src/config/parser.ts`.

**Pattern:** The original frozen Phase 1 / Phase 1E documents and commits remain untouched. This amendment is read **together with** those sources. Implementation applies the additive vocabulary in source after this document is committed.

---

## 1. Exact old ActionClass vocabulary

Before this amendment, `ActionClass` is exactly:

```
READ
LIST
SEARCH
INSPECT
EDIT
TARGETED_TEST
TYPECHECK
LINT
BUILD
DIAGNOSE
REPAIR
REVALIDATE
PACKAGE_INSTALL
NETWORK_ACCESS
SECRET_ACCESS
OUT_OF_WORKSPACE_ACCESS
BROAD_DELETION
DATABASE_MUTATION
PRODUCTION_DATA_ACCESS
GIT_COMMIT
GIT_PUSH
DEPLOYMENT
SYSTEM_LEVEL_OPERATION
PRIVILEGED_EXECUTION
```

Every listed class retains its historical meaning after this amendment.

---

## 2. Exact new creation ActionClass token

**New token:** `CREATE_FILE`

**Naming convention:** SCREAMING_SNAKE, matching existing Phase 1E wire tokens (e.g. `EDIT`, `GIT_COMMIT`, `BROAD_DELETION`).

**Semantic meaning:**

Disables **creation of a new regular file** through Path Code mutation mechanisms that map Phase 3 semantic action `CREATE_FILE` to this ActionClass.

It does **not**:

- disable modification of existing files (`EDIT` remains distinct)
- imply directory creation
- imply deletion, move, rename, symlink, or Git mutation
- grant any authority by itself

---

## 3. Phase 3 semantic mapping

| Phase 3 semantic mutation action | Phase 1 ActionClass token |
|---|---|
| `MODIFY_EXISTING_FILE` | `EDIT` (unchanged) |
| `CREATE_FILE` | `CREATE_FILE` (this amendment) |

Config `disable-action=CREATE_FILE` must refuse creation at authorization issuance and at mutation-time re-resolved config.

Config `disable-action=EDIT` continues to refuse modification only. **EDIT does not include creation.**

---

## 4. Backward compatibility

- All old ActionClass values retain exact meaning.
- Unknown `disable-action` values remain fail-closed / rejected per current config semantics.
- No wildcard / general policy engine.
- No reinterpretation of `EDIT` to absorb creation.
- Additive only: one new known token.

---

## 5. Why Option A was rejected

The alternative — leave creation non-disableable by ActionClass and document it as a permanent Phase 3 limitation — was reviewed and rejected.

Reason: it would intentionally preserve asymmetric action authority precisely when a new mutation capability (creation) arrives, and would conflict with the frozen Phase 3 promise that `MODIFY_EXISTING_FILE` and `CREATE_FILE` are distinct mutation classes. Path restriction (`deny-path`) is not an equivalent substitute for action restriction.

---

## 6. Implementation note

Source changes that add `CREATE_FILE` to `ActionClass` / parser validation are **not** part of this document-only commit. They occur in the subsequent Phase 3C-H1 Stage 2 implementation commit after this amendment is immutable.
