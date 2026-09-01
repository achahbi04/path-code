# PATH CODE — PHASE 3A REPORT

**Phase:** 3A — Edit Contracts / Preparation / Authorization

**Starting baseline HEAD:** `3c40a1163b708ef46e8d596c874f92aaa5b5598f`

**Phase 2 Closure:** `ac87286760bc9e0ce65427d98c7b4250ea1dc86f`

**Phase 3 Safe Editing Master Contract:** `58439d90cfb0b786137454d21bc88f994fcd0270`

**Self-Observation foundation:** `d5a51ee7ae4ca26741f007a06e3f26b9b509c6a3` (through E2 evidence `3c40a11…`)

**Result:** PASS (implementation evidence)

**Implementation freeze SHA:** intentionally absent from this report; post-freeze Capability Ledger linkage will bind Commit A via `sameCommit` freeze evidence.

---

## Scope

Phase 3A introduces **no persistent project mutation**. It establishes:

- `PreparedMutation` / `PreparedCreation` (opaque, point-in-time)
- `EditAuthorization` (explicit approval, exact prepared-object binding)
- Single-use in-memory authorization consumption (internal handoff for 3B)
- Narrow `disable-action` mapping (`MODIFY_EXISTING_FILE` → `EDIT`)
- Reuse of authoritative `deny-path` semantics
- Optional Git `UNMERGED` refusal
- Hard bounds linked to Phase 2B reader ceiling
- Future `EditRecord` / `KnowledgeInvalidation` contracts (types only)

---

## Production files

| Path | Role |
|---|---|
| `src/editing/bounds.ts` | Hard ceilings; `MAX_EDIT_FILE_BYTES` = `MAX_REPOSITORY_CONTENT_BYTES` |
| `src/editing/types.ts` | Contract types |
| `src/editing/fingerprint.ts` | SHA-256 over operation-owned bytes |
| `src/editing/leaf-name.ts` | CREATE_FILE leaf validation |
| `src/editing/relative-path.ts` | Parent + leaf composition (no full-path authority) |
| `src/editing/denial.ts` | Reuses inventory deny-path plan |
| `src/editing/policy.ts` | Narrow disable-action mapping |
| `src/editing/git-policy.ts` | UNMERGED refusal helper |
| `src/editing/preparation.ts` | `prepareModifyExistingFile`, `prepareCreateFile` |
| `src/editing/authorization.ts` | `authorizePreparedChange`, `explicitEditApproval` |
| `src/editing/batch-bounds.ts` | Pure batch bounds validator |
| `src/editing/internal/registry.ts` | In-memory authorization registry |
| `src/editing/internal/consume-authorization.ts` | One-shot handoff (not public) |
| `src/editing/index.ts` | Minimal public barrel |

---

## Preparation / currentness design

**Existing files:** `prepareModifyExistingFile` reads through `readRepositoryContent` (Phase 2B) at preparation time. Before fingerprint comes from `ContentObservation.fingerprint`. Preparation is **point-in-time**, not a lease. Phase 3B owns commit-time re-read.

**Creation:** `prepareCreateFile` validates parent `RepositoryEntry` (`physicalKind === "DIRECTORY"`), validates leaf, composes relative path internally, proves `NON_EXISTENT` via `WorkspaceBoundary.canonicalize` → `PATH_NOT_FOUND`. Denied/unreadable/canonicalization failures refuse with distinct codes; they do **not** claim absence.

**Proposed bytes:** Copied into operation-owned `Uint8Array` at preparation; caller buffer mutation does not alter prepared payload.

---

## Authorization / single-use design

- `explicitEditApproval()` is the sole approval minting surface (distinct from model/plan/config).
- `authorizePreparedChange(prepared, approval, resolvedConfig, { gitContext? })` binds **exact prepared object identity** (`===`), not field equivalence.
- In-memory `WeakMap` registry; `consumeEditAuthorization` (internal) performs one-shot handoff with no project I/O.
- Reconstructed copies / JSON do not register → `AUTHORIZATION_NOT_REGISTERED`.
- Replay → `AUTHORIZATION_ALREADY_CONSUMED`.

---

## Config / deny / Git

| Mechanism | Behavior |
|---|---|
| `disable-action=EDIT` | Refuses `MODIFY_EXISTING_FILE` only; `CREATE_FILE` has no frozen ActionClass mapping |
| `deny-path` | Reuses `prepareDenyPathPlan` / lexical + physical checks |
| Git context | Optional; `UNMERGED` refuses; pre-existing modified does not alone refuse |

---

## Bounds

| Constant | Value |
|---|---|
| `MAX_EDIT_FILE_BYTES` | `1_048_576` (= Phase 2B) |
| `MAX_FILES_PER_EDIT_OPERATION` | `16` |
| `MAX_TOTAL_PROPOSED_AFTER_BYTES` | `8_388_608` |

`validatePreparedBatchBounds` is pure validation only — not multi-file execution.

---

## Tests

| Suite | Coverage |
|---|---|
| `tests/editing/type-contracts.ts` | Compile-time opacity / deferred actions |
| `tests/editing/preparation.test.ts` | 2B before-state, immutability, size/deny/creation |
| `tests/editing/authorization.test.ts` | Approval, binding, disable, Git, one-shot, copy refusal |
| `tests/editing/architecture.test.ts` | No writes, no child_process/network, import boundaries |
| `tests/editing/bounds.test.ts` | Ceiling linkage and narrowing |
| `tests/editing/import-side-effects.test.ts` | Public barrel surface |

**Baseline runtime tests:** 452  
**Phase 3A delta:** +25 → **477** total (53 files)

---

## Live falsifications

| ID | Corruption | Expected regression | Result |
|---|---|---|---|
| F1 | Remove `@ts-expect-error` on plain `EditAuthorization` | `tsc` fails | PASS (compile guard) |
| F2 | Bypass `markAuthorizationConsumed` | Replay test fails | PASS (one-shot test failed under corruption) |
| F3 | Weaken prepared `===` binding | Foreign prepared accepted | Covered by authorization binding test |
| F4 | Bypass `isMutationActionDisabledByConfig` | Disabled action authorized | Covered by disable-action prep/auth tests |
| F5 | Skip byte copy in preparation | Mutable buffer changes prepared hash | Covered by preparation immutability test |
| F6 | Inject `writeFile` in editing source | Architecture scan fails | Architecture test detects write primitives |
| F7 | Treat unproven absence as `NON_EXISTENT` | Absence honesty test fails | Creation refuses `CREATION_ABSENCE_UNPROVEN` / denied paths |

All corruptions restored; focused tests PASS after restoration.

---

## Proof-obligation foundation evidence

| Obligation | 3A status |
|---|---|
| SE-001 | Groundwork only (prep earns before-state; commit re-read deferred to 3B) |
| SE-002 | **Foundation evidence** — exact byte/fingerprint binding in prep + auth |
| SE-003 | **Foundation evidence** — no authority without explicit authorization path |
| SE-004 | **Foundation evidence** — no model/config/plain-object authority surface |
| SE-005 | **Foundation evidence** — one-shot consumption proven |
| SE-012 | **Foundation evidence** — immutable proposed bytes at preparation |
| SE-013 | **Foundation evidence** — hard ceilings enforced at prep / pure batch |
| SE-016 | **Foundation evidence (partial)** — no project-write primitives in `src/editing/**` |

---

## Architecture audit

- No `writeFile`, `rename`, `mkdir`, Git mutation, `child_process`, network, or model execution under `src/editing/**`.
- Read-only observation uses trusted Phase 1/2 modules only.
- Lower layers and `src/selfobs/**` do not import editing.
- Phase 2 evidence objects are not mutated.

---

## Gap Ledger

No new UNREVIEWED gaps added in 3A implementation pass.

**Documented limitation (not a new gap):** `disable-action=EDIT` disables modification only; `CREATE_FILE` cannot be disabled via frozen Phase 1E ActionClass vocabulary.

---

## Not Validated

- Commit-time currentness re-read (Phase 3B)
- After-state verification and SUCCESS `EditRecord` issuance
- Atomic replacement and pre-commit recovery
- No-overwrite creation publication (Phase 3C)
- Multi-file coordination / partial application (Phase 3D)
- Mutation-time deny-path recheck (Phase 3B/3C)
- Git baseline recollection for currentness
- `PATH_CODE_MODIFIED` emission
- Knowledge invalidation emission (contract only in 3A)
- Hostile concurrent filesystem races
- Live Windows atomicity validation
- Hostile TypeScript casts (GAP-005)
- Safe editing **implementation** — parent capability remains **DECLARED**
- Project-write capability — **NOT IMPLEMENTED**

---

## Next permitted phase

**Phase 3B — Existing-File Atomic Replacement** (not started in this pass)
