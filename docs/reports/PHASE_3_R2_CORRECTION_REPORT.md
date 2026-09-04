PATH CODE — PHASE 3-R2
PUBLIC AUTHORITY-SURFACE GUARD CORRECTION REPORT

Implementation Result:
NOT YET — Stage 0 finding/gap record only. Stage 1 fills the correction evidence.

==================================================
§0 — STAGE 0 FINDING / GAP RECORD
==================================================

## F-R1-001 (established at ecda537)

authorizePreparedChange is exported from the public editing barrel and is the
subsystem's authority-issuing function. Its options type,
AuthorizePreparedChangeOptions, is declared in src/editing/types.ts and
re-exported by name from src/editing/index.ts. The standing public
authority-surface guard hardcodes three option types and three source files
and never opens types.ts.

Exact auditor corruption applied in R1 Stage 3:

  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };

added to AuthorizePreparedChangeOptions.

Exact missed behavior: the standing guard passed 5/5, the P1–P14 suite passed
9/9, and all 612 tests passed. The defect is absent standing detection on the
authority-issuing surface. There is no active leak at ecda537 —
AuthorizePreparedChangeOptions currently holds only
{ gitContext?: GitStateBaseline }.

## Exact P2 text

Identical across hardening contract §5.2 and R1 Stage 3 §3.4:

> Every public function's complete parameter/options surface is represented
> in the standing manifest/test.

## Amendment 1 §4 C/D text

> **C.** produce a deterministic public callable-surface manifest containing every
> public function’s parameters and relevant user-defined option properties;
>
> **D.** fail on an unreviewed public parameter/property that contains:
>
> - a user-defined call signature;
> - operation / adaptor / bindings / executor / loader / reader / writer /
>   verifier shape;
> - a type originating from internal authority modules;
> - any / unknown / index / rest escape in an authority-sensitive operation;

## Exact current guard mechanism (baseline ecda537)

Files:
- tests/architecture/public-authority-surface.test.ts
- tests/architecture/public-authority-approved-exceptions.ts
- tests/integration/phase3-reaudit-public-surface.test.ts (P1–P14 asserts guard presence)
- tests/editing/public-authority-malicious.test.ts (runtime companion, not declaration guard)

Symbols:
- parsePackageExports, extractExportedNames, optionTypePropertyNames,
  publicWrapperReadsForbiddenInput, PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS
- describe block "public authority surface — Amendment 1 standing guard"

Discovery mechanism:
- package exports keys (hard assert ["."])
- barrel named-export name list + barrel source text regex bans
  (fsOps / targetOps / WithDependencies)
- hardcoded option type names + hardcoded source files for shallow
  `type Alias = { … }` property-name allowlists
- hardcoded three public wrapper bodies + forbidden regex patterns
- no export-driven function census; no TypeScript Program recursive type graph;
  no named re-export resolution for option inspection

Three hardcoded type names and three hardcoded source files:
1. ReplaceExistingFileOptions ← src/editing/replace-existing-file.ts
2. CreateFileOptions ← src/editing/create-file.ts
3. ExecuteMultiFilePlanOptions ← src/editing/multi-file-types.ts

Approved exceptions: empty frozen array.

## AuthorizePreparedChangeOptions re-export trace

src/editing/index.ts:
  export type { … AuthorizePreparedChangeOptions … } from "./types.js";

src/editing/types.ts:
  export type AuthorizePreparedChangeOptions = {
    readonly gitContext?: GitStateBaseline;
  };

Consumed by authorizePreparedChange(..., options?) in authorization.ts.

Why the guard never opens it: option inspection is a hardcoded triple of
type-name + file pairs. AuthorizePreparedChangeOptions / types.ts is not in
that list. extractExportedNames sees the type name in the barrel only for
forbidden-symbol filtering, not to drive option-type discovery.

## Full public editing census (preflight at ecda537)

Supported package import surface: package.json exports = "." only →
src/index.ts / dist/index.* — does not re-export editing.
Authority-surface scope for this pass: public editing barrel
src/editing/index.ts (operator decision D2).

| public function | declaration | parameters / options graph | represented by guard | omission |
|---|---|---|---|---|
| authorizePreparedChange | authorization.ts | PreparedChange, ExplicitEditApproval, ResolvedProjectConfig, options?: AuthorizePreparedChangeOptions → { gitContext?: GitStateBaseline } | NO | latent standing-coverage defect (F-R1-001) |
| replaceExistingFile | replace-existing-file.ts | EditAuthorization, PreparedMutation, ReplaceExistingFileOptions → { gitContext? } | YES (shallow) | absent |
| createFile | create-file.ts | EditAuthorization, PreparedCreation, CreateFileOptions → { gitContext? } | YES (shallow) | absent |
| executeMultiFilePlan | multi-file-execute.ts | MultiFilePlan, ExecuteMultiFilePlanOptions? → { gitContext? } | YES (shallow) | absent |
| prepareModifyExistingFile | preparation.ts | RepositoryEntry, Uint8Array\|Buffer, WorkspaceBoundary, ResolvedProjectConfig | NO (no parameter manifest) | latent incomplete manifest; not an omitted *Options* graph |
| prepareCreateFile | preparation.ts | RepositoryEntry, leafName, Uint8Array\|Buffer, WorkspaceBoundary, ResolvedProjectConfig | NO | same |
| createMultiFilePlan | multi-file-plan.ts | readonly MultiFilePlanEntry[] | NO | same |
| explicitEditApproval | authorization.ts | none | NO | n/a |
| validatePreparedBatchBounds | batch-bounds.ts | readonly PreparedChange[] | NO | latent incomplete manifest |
| validateReaderByteLimit | batch-bounds.ts | number | NO | same |
| isModifyExistingFileDisabled / isCreateFileDisabled / isMutationActionDisabledByConfig | policy.ts | config / action | NO | same |
| isAtomicReplacePlatformSupported / isAtomicCreatePlatformSupported / computeCreatedFileMode | atomic-fs.ts | none / platform | NO | n/a |

Non-function barrel values (MAX_*, DISABLE_ACTION_*, prefixes, CREATED_FILE_BASE_MODE)
are constants, not parameter graphs.

Only named *Options types in the editing barrel: four.
Guard covers three. Omitted options graph: only AuthorizePreparedChangeOptions.
Active leaks: none.

## False statement in hardening report §9 — disposition

docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md §9 records
the standing-guard deferral as scoped:

> beyond the Phase 3 editing option types already guarded

That statement is false for AuthorizePreparedChangeOptions, which is a Phase 3
editing option type that is not guarded. The repository has no mechanism for
mutating an immutable historical report in place. Therefore this pass does NOT
edit that report. The false line remains immutable historical evidence. The
correction is recorded in GAP-057's description, this R2 report, and the R2
commit chain.

## Origin

Primary: IMPLEMENTATION — the frozen governing text already required complete
derived coverage; the guard implements an enumerated subset.

Contributing: EVIDENCE — the false hardening-report §9 line masked the omission
during the first audit. Report metadata, not an immutable coverage limit.
Origins are descriptive report metadata under Constitution V1. No Gap Ledger
schema field or classification value for origin was added.

## Stage 0 gap / capability record

GAP-057 OPEN — BLOCKING_INVARIANT — attached to safe-editing.knownLimitations
AND edit-contracts.knownLimitations.

GAP-058 OPEN — NON_BLOCKING_LIMITATION — package-root scope deferred; not
attached to any capability.

Derived capability states unchanged from baseline (Stage 0 changes no derived
state):
- edit-contracts PASS_FROZEN
- existing-file-replacement PASS_FROZEN
- safe-file-creation PASS_FROZEN
- multi-file-coordination PASS_FROZEN
- safe-editing IMPLEMENTED
- repository-intelligence PHASE_VERIFIED
- foundation-kernel PHASE_VERIFIED

Baseline runtime total at ecda537: 612 PASS.

Contract artifact committed at:
docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md

## Stage 0 verification

- npm run gap:render — PASS
- npm run ledger:verify — PASS
- derived capability states unchanged (all seven match baseline above)
- npm run check attempt 1: FAIL — unconstrained-worker timeouts only:
  tests/git/baseline.test.ts ("physically denies symlink aliases…") 5000ms;
  tests/snapshot/git-snapshot-membership.test.ts ("rejects Git baseline from a foreign inventory…") 5000ms;
  610/612 passed otherwise
- npm run check attempt 2 (honest §1.7 retry): PASS — 612/612, ledger:verify PASS
- isolation re-run of the two timeout files: PASS — 23/23
- Do not represent the second-attempt pass as a single clean run.

==================================================
§1 — STAGE 1 CORRECTION EVIDENCE
==================================================

(Stage 1 fills this section before the Stage 1 commit.)
