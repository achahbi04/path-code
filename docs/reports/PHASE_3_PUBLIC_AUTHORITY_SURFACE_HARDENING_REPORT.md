# PATH CODE — PHASE 3 PUBLIC AUTHORITY-SURFACE HARDENING REPORT

**Stage:** 3 — production internalization (no capability relink)  
**Baseline HEAD before Stage 3:** `164cf435de8a7920c6f428a6ae6a7a442d56dcc5` (Constitution Amendment 1)  
**Census commit:** `eabbc19da3916e050f9015fafdd8735026a17b45` — *Record Phase 3 public authority surface findings and downgrade affected capabilities*  
*(Census document authored against audit HEAD `696ef4fe58c21cdd527869309a2b9fd5abcd19a8`; Stage 1 supersession recorded at `eabbc19…`.)*  
**Constitution Amendment 1:** `164cf435de8a7920c6f428a6ae6a7a442d56dcc5` — `docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md`  
**Governing contract:** `docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md`

This report does **not** contain its future correction commit SHA.

---

## 1. Active instances corrected

| # | Gap | Public function | Mechanism field | Capability |
|---|---|---|---|---|
| 1 | GAP-048 | `replaceExistingFile` | `fsOps` | `existing-file-replacement` |
| 2 | GAP-049 | `createFile` | `fsOps` | `safe-file-creation` |
| 3 | GAP-050 | `executeMultiFilePlan` | `targetOps` | `multi-file-coordination` |

Correction shape for all three: **signature/internalization only** — frozen mutation behavior unchanged.

---

## 2. Before / after public signatures

### `replaceExistingFile`

**Before:**
```ts
replaceExistingFile(authorization, prepared, options?: {
  gitContext?: GitStateBaseline;
  fsOps?: AtomicReplaceFsOps; // AUTHORITY LEAK
})
```

**After:**
```ts
replaceExistingFile(authorization, prepared, options?: {
  gitContext?: GitStateBaseline; // SAFE_POINT_IN_TIME_CONTEXT only
})
```

Legitimate public field preserved: `gitContext`.  
Internal seam: `replaceExistingFileWithDependencies(..., { fsOps, gitContext? })` — module-local export; **not** in `src/editing/index.ts`.  
Public wrapper always binds `productionAtomicReplaceFs` and constructs a **fresh** internal options object from `gitContext` only (no wholesale spread of the caller object).

### `createFile`

**Before:**
```ts
createFile(authorization, prepared, options?: {
  gitContext?: GitStateBaseline;
  fsOps?: AtomicCreateFsOps; // AUTHORITY LEAK
})
```

**After:**
```ts
createFile(authorization, prepared, options?: {
  gitContext?: GitStateBaseline;
})
```

Legitimate public field preserved: `gitContext`.  
Internal seam: `createFileWithDependencies(..., { fsOps, gitContext? })` — not barrel-exported.  
Public wrapper always binds `productionAtomicCreateFs`.

### `executeMultiFilePlan`

**Before:**
```ts
executeMultiFilePlan(plan, options?: {
  gitContext?: GitStateBaseline;
  targetOps?: MultiFileTargetOperations; // AUTHORITY LEAK
})
```

**After:**
```ts
executeMultiFilePlan(plan, options?: {
  gitContext?: GitStateBaseline;
})
```

Legitimate public field preserved: `gitContext`.  
Internal seam: `executeMultiFilePlanWithDependencies(plan, { targetOps, gitContext? })` — not barrel-exported.  
Public wrapper always binds real public `replaceExistingFile` / `createFile` (themselves production-FS-bound). Runtime does **not** consult `options.targetOps`.

---

## 3. Public barrel / package exports

`src/editing/index.ts` continues to export only public wrappers and safe option types.

**Not** exported from the public barrel:

- `*WithDependencies`
- `MultiFileTargetOperations`
- `productionAtomicReplaceFs` / `productionAtomicCreateFs`
- `AtomicReplaceFsOps` / `AtomicCreateFsOps`

Package `exports` remains exactly `"."` → `./dist/index.js` / `./dist/index.d.ts`.

---

## 4. Standing guard (Amendment 1)

Implemented at:

- `tests/architecture/public-authority-surface.test.ts`
- `tests/architecture/public-authority-approved-exceptions.ts` (empty allowlist)

Practical coverage with existing typescript/vitest tooling (no new runtime deps):

| Amendment requirement | Implementation |
|---|---|
| A package entry points | Assert `package.json` exports keys `=== ["."]` |
| B/C option/callable surface | TypeScript compiler API parses public option type literals |
| D fail on mechanism fields | Public option types must be exactly `["gitContext"]` |
| E approved exceptions | Empty frozen allowlist; structure enforced |
| F hidden-input patterns | Public wrapper bodies scanned for `options.fsOps` / `options.targetOps` / `arguments[` |
| G package deep exports | Root-only exports map |

---

## 5. Malicious runtime tests

`tests/editing/public-authority-malicious.test.ts`:

1. `replaceExistingFile` with throwing Proxy `fsOps` via JS widening → **SUCCESS** on real FS bytes.
2. `createFile` with throwing Proxy `fsOps` → **SUCCESS** and published file present.
3. `executeMultiFilePlan` with throwing `targetOps` → **ALL_APPLIED** with real target bytes.

Malicious mechanism never governs; real production path proves execution.

---

## 6. Moved induction (assertions unchanged)

Callers that injected `fsOps` / `targetOps` now use internal seams:

| Suite | Seam |
|---|---|
| `tests/editing/replace-existing-file.test.ts` | `replaceExistingFileWithDependencies` |
| `tests/editing/create-file.test.ts` | `createFileWithDependencies` |
| `tests/editing/multi-file-coordination.test.ts` | `executeMultiFilePlanWithDependencies` |
| `tests/integration/phase3-safe-editing-audit.test.ts` | all three `*WithDependencies` |

Recovery / concurrency / order / partial-commit assertions preserved.

Additional honesty fix in the audit suite (Stage 1 supersession already removed freeze evidence for the corrected trio): D3 now expects `edit-contracts` **PASS_FROZEN** and the three corrected capabilities **IMPLEMENTED** (no freezeEvidence). This matches Stage 1 ledger state; it is not a mutation-behavior change.

---

## 7. Live falsifications H-F1–H-F8

All applicable. Each: exact corruption → focused failure → exact restoration. Temporary corruption diff empty after restore.

| ID | Corruption | Focused failure (quoted) | Restored |
|---|---|---|---|
| **H-F1** | Public `executeMultiFilePlan` honors `options.targetOps` | `FAIL … executeMultiFilePlan ignores throwing targetOps and applies via real wrappers` | YES |
| **H-F2** | Public `replaceExistingFile` honors `options.fsOps` | `AssertionError: expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` (malicious Proxy consulted) | YES |
| **H-F3** | Public `createFile` honors `options.fsOps` | `AssertionError: expected 'REFUSED_PRECOMMIT' to be 'SUCCESS'` | YES |
| **H-F4** | Export `replaceExistingFileWithDependencies` from editing barrel | `AssertionError: expected [ Array(1) ] to deeply equal []` | YES |
| **H-F5** | Add `targetOps` to public `ExecuteMultiFilePlanOptions` | `AssertionError: expected [ 'gitContext', 'targetOps' ] to deeply equal [ 'gitContext' ]` | YES |
| **H-F6** | Read `arguments[1].targetOps` while declaration stays clean | Architecture: `expected [ '\\barguments\\s*\\[' ] to deeply equal []`; malicious wrapper test also FAIL | YES |
| **H-F7** | Add package export `./editing/internal/replace` | `AssertionError: expected [ '.', './editing/internal/replace' ] to deeply equal [ '.' ]` | YES |
| **H-F8** | Internal executor ignores injected `targetOps` | `AssertionError: expected [] to deeply equal [ 'z.txt', 'a.txt' ]` | YES |

---

## 8. Capability state after Stage 3 (no relink)

| Capability | Expected derived state | Notes |
|---|---|---|
| `edit-contracts` | **PASS_FROZEN** | Unaffected |
| `existing-file-replacement` | **IMPLEMENTED** | freezeEvidence still absent (Stage 1); no Stage 3 relink |
| `safe-file-creation` | **IMPLEMENTED** | same |
| `multi-file-coordination` | **IMPLEMENTED** | same |
| `safe-editing` | **DECLARED** | GAP-051 open; no Phase 3 closure |

---

## 9. NOT VALIDATED

- Capability relink / freeze re-attachment (Stage 4).
- Gap closure for GAP-048 / GAP-049 / GAP-050 / GAP-051.
- Fresh full Phase 3 integration re-audit COMPLETE conclusion.
- Phase 4 readiness.
- Full Amendment 1 standing guard items that require complete package-root `.d.ts` callable-surface manifests beyond the Phase 3 editing option types already guarded (deferred proportional depth; current guard covers the confirmed leak class and package map).
- Unconstrained default-worker `npm run check` flake characteristics (Git/snapshot timeouts) — unrelated to authority-surface correction.
