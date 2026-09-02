# PATH CODE — PHASE 3C-H1 IMPLEMENTATION REPORT

**Pass:** Phase 3C-H1 Stage 2 — CREATE_FILE ActionClass mapping + post-creation verification authority

**Result:** PASS (corrective implementation; Phase 3C remains NOT COMPLETE until Stage 4 evidence + linkage)

**Starting Stage 1 HEAD:** `0b3bed86f8a05674a652359b958d728ae8086244`

**Frozen Phase 3 Master:** `58439d90cfb0b786137454d21bc88f994fcd0270` (untouched)

**Amendments applied:**

- `docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md`
- `docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md`

**H1 implementation SHA:** intentionally absent here; Stage 4 TWO_COMMIT_FREEZE binds Stage 2 SHA as `impl`.

**Phase 3D:** not started.

**Phase 3C status:** still NOT COMPLETE (capability freeze deferred to Stage 4).

---

## 1. Corrections shipped

### A. ActionClass `CREATE_FILE` (Option B)

| Surface | Change |
|---|---|
| `src/domain/authority.ts` | Additive `CREATE_FILE` on `ActionClass` |
| `src/config/parser.ts` | Additive parse membership; unknown values still fail closed |
| `src/editing/policy.ts` | `DISABLE_ACTION_FOR_CREATE_FILE = "CREATE_FILE"`; `isCreateFileDisabled`; mapped in `isMutationActionDisabledByConfig` |
| Preparation | `prepareCreateFile` refuses `ACTION_DISABLED` when config disables `CREATE_FILE` |
| Authorization | Existing `isMutationActionDisabledByConfig` refuses issuance |
| Mutation | Mutation-time re-resolved config refuses `ACTION_DISABLED` before staging |

`disable-action=EDIT` continues **not** to disable creation (permanent C4). Fresh `disable-action=CREATE_FILE` refuses creation (C4b + authorization prepare test).

Option A (leave creation non-disableable) remains rejected per Amendment 1.

### B. Post-creation verification authority

| Concept | Implementation |
|---|---|
| `PublishedCreationVerificationTarget` | Opaque branded token; WeakMap-bound path + operation identity; minted only after successful `linkNoOverwrite` |
| `CreationAfterStateEvidence` | `{ kind, publicationId, observedHex, observedByteLength }` — not `RepositoryEntry` / `ContentObservation` |
| Physical read | Sole write module `src/editing/atomic-fs.ts` behind `verifyPublishedCreation(target, operationIdentity)` |
| Token mint / bind | `src/editing/internal/creation-verification.ts` (no filesystem I/O; not public barrel) |

Removed unrestricted path-shaped `readPublishedBytes`.

`createFile` passes a per-operation `operationIdentity` into publication and verification; EditRecord after-state is populated from `CreationAfterStateEvidence` only.

---

## 2. Preserved invariants

- Hard-link no-overwrite publication (`link` / EEXIST)
- REAL_FILESYSTEM window-race harness (external create before link)
- Absence honesty / parent revalidation / config fail-closed / Git UNMERGED
- One authorized write module (`src/editing/atomic-fs.ts`)
- Phase 3B replace behavior unchanged
- Distinct create temp prefix (`.path-code-create-`)

---

## 3. Tests

| Area | Coverage |
|---|---|
| ActionClass parse | Config loader accepts `CREATE_FILE`; unknown still `CONFIG_MALFORMED` |
| Disable mapping | Auth prepare refuse; mutation-time C4b `ACTION_DISABLED`; C4 EDIT≠CREATE |
| Token opacity | Cross-operation reject; forged object reject; no path property on token |
| Architecture | Verification types not on public barrel; no `readPublishedBytes`; create/replace orchestration free of direct `node:fs` writes |
| Write boundary | Allowlist remains one module; create orchestration checked |
| Regression | Existing 3B replace + 3C create suites |

---

## 4. Explicit non-claims

- Phase 3C is **not** PASS_FROZEN at this commit.
- No capability ledger freezeEvidence restored here.
- No Stage 3 live C-F1…C-F9 evidence package in this commit.
- No Phase 3D work.
- Historical `docs/reports/PHASE_3C_REPORT.md` remains immutable; corrected progression continues in later H1 evidence report.

---

## 5. Gate

Stage 2 commit must leave `ledger:verify`, typecheck, tests, and `npm run check` green with `safe-file-creation` and `edit-contracts` still **IMPLEMENTED** (not PASS_FROZEN), `existing-file-replacement` **PASS_FROZEN**, `safe-editing` **DECLARED**.
