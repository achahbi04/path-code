# PATH CODE — PHASE 3 PUBLIC AUTHORITY-SURFACE CENSUS

## Stage 0 Result

**Outcome: B — ACTIVE INSTANCE(S), ALL LIMITED TO PHASE 3**

Baseline HEAD: `696ef4fe58c21cdd527869309a2b9fd5abcd19a8`  
Working tree at census: clean `main`  
Actual runtime total at baseline: **589** PASS  
Runtime dependencies: **0**  
Phase 3 closure: ABSENT  
Phase 4: ABSENT

### Baseline gates

| Gate | Result |
|---|---|
| `ledger:verify` | PASS at `696ef4f…` |
| `typecheck` | PASS |
| `build` | PASS |
| `vitest run --maxWorkers=2` | **589/589** PASS |
| `cli:smoke` | PASS |
| unconstrained `npm run check` | flake: concurrent default-worker Git/snapshot timeouts; not a Phase 3 authority-surface mismatch |

## Supported public entry points

### Package-specifier surface (`package.json` exports)

Exactly one supported package import:

- `path-code` → `./dist/index.js` / `./dist/index.d.ts`

Mechanical package-specifier probes:

- `path-code` → IMPORT_OK
- `path-code/editing` → `ERR_PACKAGE_PATH_NOT_EXPORTED`
- `path-code/editing/atomic-fs.js` → `ERR_PACKAGE_PATH_NOT_EXPORTED`
- `path-code/src/editing/internal/consume-authorization.js` → `ERR_PACKAGE_PATH_NOT_EXPORTED`

Runtime `Object.keys(path-code)` (sorted):  
`MINIMUM_SUPPORTED_NODE_MAJOR`, `createWorkspaceBoundary`, `discoverGitRepository`, `evaluateNodeVersion`, `failure`, `isJsonValue`, `isNodeVersionSupported`, `loadProjectConfig`, `parseNodeVersion`, `requiresReRead`, `success`

CLI `bin` `pathcode` is a process entry, not a package import subpath.

### Repository public barrels (documented subsystem surfaces)

Enumerated from `src/**/index.ts`:

- `src/index.ts` — package root
- `src/editing/index.ts` — Phase 3 edit contracts public surface
- `src/domain/index.ts`
- `src/workspace/index.ts`
- `src/git/index.ts`
- `src/config/index.ts`
- `src/inventory/index.ts`
- `src/reader/index.ts`
- `src/metadata/index.ts`
- `src/search/index.ts`
- `src/snapshot/index.ts`
- `src/platform/index.ts`
- `src/selfobs/index.ts`

Relative filesystem imports of non-exported modules are **not** treated as supported package public API.

## Confirmed active instances (PUBLIC_AUTHORITY_SURFACE_LEAK)

### Instance 1 — `replaceExistingFile` public `fsOps`

- Public signature: `replaceExistingFile(authorization, prepared, options?: ReplaceExistingFileOptions)`
- Public options property: `fsOps?: AtomicReplaceFsOps`
- Runtime: `const fsOps = options.fsOps ?? productionAtomicReplaceFs`
- Replaces: frozen Phase 3B filesystem mutation / evidence operation set
- Capability: **`existing-file-replacement`**
- Introducing commit: `76d106724a129a4101981db88c7c1a4d086fb100`
- Governing sources: `docs/PHASE_3_SAFE_EDITING_MASTER.md`, `docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md`
- Correction shape: **signature/internalization only** — public wrapper keeps legitimate context (`gitContext`); fault adapter moves internal; production path remains real `productionAtomicReplaceFs`

### Instance 2 — `createFile` public `fsOps`

- Public signature: `createFile(authorization, prepared, options?: CreateFileOptions)`
- Public options property: `fsOps?: AtomicCreateFsOps`
- Runtime: `const fsOps = options.fsOps ?? productionAtomicCreateFs`
- Replaces: frozen Phase 3C filesystem mutation and operation-bound verification set
- Capability: **`safe-file-creation`**
- Introducing commit: `5deb63e96d9a11d44410e02eafe950d562032cbf`
- Governing sources: `docs/PHASE_3_SAFE_EDITING_MASTER.md`, `docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md`, `docs/reports/PHASE_3C_H1_REPORT.md`
- Correction shape: **signature/internalization only**

### Instance 3 — `executeMultiFilePlan` public `targetOps`

- Public signature: `executeMultiFilePlan(plan, options?: ExecuteMultiFilePlanOptions)`
- Public options property: `targetOps?: MultiFileTargetOperations`
- Runtime: `const ops = options?.targetOps ?? productionOps`
- Replaces: frozen Phase 3D binding to real `replaceExistingFile` / `createFile`
- Capability: **`multi-file-coordination`**
- Introducing commit: `4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9`
- Governing sources: `docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md`, `docs/passes/PHASE_3D_CONTRACT.md` (public plan-only executor), `docs/reports/PHASE_3D_E1_EVIDENCE_COMPLETION_REPORT.md`
- Correction shape: **signature/internalization only** — public API becomes `executeMultiFilePlan(plan)`; controlled injection moves to non-public internal executor

## Introduction timeline

| Instance | First introducing commit | Phase |
|---|---|---|
| replace `fsOps` | `76d106724a129a4101981db88c7c1a4d086fb100` | Phase 3B |
| create `fsOps` | `5deb63e96d9a11d44410e02eafe950d562032cbf` | Phase 3C |
| execute `targetOps` | `4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9` | Phase 3D |

**No active instance predates Phase 3.**

## Capability impact map

| Instance | Capability | Stage 1 action |
|---|---|---|
| replace `fsOps` | `existing-file-replacement` | remove only `freezeEvidence` → derive **IMPLEMENTED** |
| create `fsOps` | `safe-file-creation` | remove only `freezeEvidence` → derive **IMPLEMENTED** |
| execute `targetOps` | `multi-file-coordination` | remove only `freezeEvidence` → derive **IMPLEMENTED** |
| — | `edit-contracts` | **unaffected** — remains **PASS_FROZEN** |
| — | `safe-editing` | remains **DECLARED**; audit-supersession gap opened |

## Freeze supersession records (current claim only)

These are **current capability supersessions under later negative evidence**, not bookkeeping.

### `existing-file-replacement`

- Previous derived state: **PASS_FROZEN**
- Previous freeze form: `twoCommit`
- Previous implementation commit: `ad85c9f1262635f9a81b5608b20c198a7b8b489d`
- Previous evidence commit: `2b635316f7f08c0cf08ef42ec40ab2cd513d3969`
- Previous report path: `docs/reports/PHASE_3B_EVIDENCE_COMPLETION_REPORT.md`
- Superseding GAP ID: **GAP-048**
- Reason the old freeze is no longer admissible as the **CURRENT** claim: public `ReplaceExistingFileOptions.fsOps` remains reachable and honored at HEAD `696ef4f…`, so the freeze evidence no longer truthfully describes a sealed public authority surface for this capability.
- Historical freeze evidence remains **immutable in Git** at the cited commits and report path.

### `safe-file-creation`

- Previous derived state: **PASS_FROZEN**
- Previous freeze form: `twoCommit`
- Previous implementation commit: `1136c40ab1667e4a5b70185c8bef68ce67d675a2`
- Previous evidence commit: `2a573301f871ae506491ddbfa8f6407521b4b956`
- Previous report path: `docs/reports/PHASE_3C_H1_REPORT.md`
- Superseding GAP ID: **GAP-049**
- Reason the old freeze is no longer admissible as the **CURRENT** claim: public `CreateFileOptions.fsOps` remains reachable and honored at HEAD `696ef4f…`.
- Historical freeze evidence remains **immutable in Git** at the cited commits and report path.

### `multi-file-coordination`

- Previous derived state: **PASS_FROZEN**
- Previous freeze form: `sameCommit`
- Previous implementation commit: `4fd4567e1ed2b9e5bef303fb6bb90a23d83927d9`
- Previous evidence commit: same as implementation (`sameCommit`)
- Previous report path: `docs/reports/PHASE_3D_REPORT.md`
- Superseding GAP ID: **GAP-050**
- Reason the old freeze is no longer admissible as the **CURRENT** claim: public `ExecuteMultiFilePlanOptions.targetOps` remains reachable and honored at HEAD `696ef4f…`, contradicting the frozen 3D public plan-only executor surface.
- Historical freeze evidence remains **immutable in Git** at the cited commit and report path.

## Audit supersession

- GAP ID: **GAP-051**
- Title: First Phase 3 integration audit conclusion superseded by missed public authority-surface leak
- First audit commit preserved: `696ef4fe58c21cdd527869309a2b9fd5abcd19a8`
- Closure condition: fresh full Phase 3 integration re-audit returns COMPLETE after correction

## No-active-instance findings (inspected; not AUTHORITY_OR_MECHANISM_SUBSTITUTION)

### Editing

| Function | Classification notes |
|---|---|
| `explicitEditApproval()` | fixed token constructor — no substitution param |
| `prepareModifyExistingFile(target, bytes, workspace, config)` | `RepositoryEntry` EARNED_AUTHORITY; `workspace` CALLER_NARROWING_BOUND; `config` ORDINARY_DATA/policy; `bytes` ORDINARY_DATA |
| `prepareCreateFile(parent, leaf, bytes, workspace, config)` | same pattern |
| `authorizePreparedChange(prepared, approval, config, options?)` | `explicitApproval` EXPLICIT_USER_APPROVAL; `gitContext?` SAFE_POINT_IN_TIME_CONTEXT |
| `createMultiFilePlan(entries)` | earned prepared/auth pairs only |
| `isModifyExistingFileDisabled` / `isCreateFileDisabled` / `isMutationActionDisabledByConfig` | pure policy readers |
| `validatePreparedBatchBounds` / `validateReaderByteLimit` | CALLER_NARROWING_BOUND |
| `computeCreatedFileMode` / platform support / temp prefixes | mechanism policy helpers; no caller op-set |

### Foundation / intelligence public barrels

| Function | Options / notes |
|---|---|
| `createWorkspaceBoundary` | no op-set |
| `discoverGitRepository` | no op-set |
| `loadProjectConfig` | no op-set |
| `inventory(..., options?)` | `maxDepth`/`maxEntries` ORDINARY_DATA |
| `readRepositoryContent(..., options?)` | `maxBytes` CALLER_NARROWING_BOUND |
| `collectGitStateBaseline` | no op-set; uses internal runner |
| `buildRepositoryMap(..., options?)` | limits + optional earned `gitBaseline` SAFE_POINT_IN_TIME_CONTEXT |
| `searchRepository(..., options?)` | `maxResults` ORDINARY_DATA |
| `buildRepositorySnapshot` / `verifyRepositorySnapshot` | verification limits ORDINARY_DATA |
| `reduceCheckIgnoreBatches(executeBatch)` | **not** exported from `src/git/index.ts` — not supported public surface |
| `runCli(args, io)` | CLI stdout/stderr boundary; not a Phase 3 mutation-mechanism substitute; not package import surface |

## Runtime hidden-input sweep

- No `arguments[n]` consultation found under `src/`
- No public `any` / `unknown` / rest parameters on editing mutation wrappers
- Confirmed declared-but-authority-bearing fields: `fsOps`, `targetOps`
- Legitimate optional fields retained: `gitContext` (SAFE_POINT_IN_TIME_CONTEXT)
- Mutation wrappers select specific option fields; they do not wholesale-spread caller options into unrelated internal authority constructors

## Package deep-import boundary

No authority-bearing internal module is importable through a supported package subpath.  
No packaging-map narrowing is required for Stage 1.

## Stage 1 actions recorded by this commit

1. Freeze exact executed contract at `docs/passes/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_CONTRACT.md`
2. Open GAP-048, GAP-049, GAP-050, GAP-051
3. Remove only `freezeEvidence` from the three affected capabilities
4. Leave `edit-contracts` PASS_FROZEN and `safe-editing` DECLARED
5. Downgrade falsifications (§1.4): for each downgraded capability, temporarily restore the prior `freezeEvidence` on a focused derivation input while expecting **IMPLEMENTED**; derivation returns **PASS_FROZEN**, so the IMPLEMENTED expectation fails; intended downgrade retained in the canonical ledger; focused derivation PASS; `ledger:verify` PASS

## Not validated

- Hostile direct filesystem imports inside the repository remain architecture-boundary concerns, not package-specifier public API
- Hostile TypeScript casts / `any` evasion of declaration inspection
- Residual host/platform filesystem races
- Completeness beyond the enumerated supported barrels and package exports
