PATH CODE — PHASE 3-R2
PUBLIC AUTHORITY-SURFACE GUARD CORRECTION REPORT

Implementation Result:
PASS

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

Implementation Result:
PASS

The Stage 1 implementation SHA is intentionally absent from this report and
will be bound by Stage 2 (non-circularity).

## Pre-correction failure-to-detect evidence (§1.1)

Before corruption:
- git hash-object src/editing/types.ts =
  68a641cdcda3041b24559f78f771a7558c113dfd
- git status --porcelain = empty

Applied exact auditor corruption to AuthorizePreparedChangeOptions:

  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };

During corruption blob:
  1c257469440ff8a37aee69d4a188c4402618b15b

Existing standing guard (verbatim summary):
  ✓ tests/architecture/public-authority-surface.test.ts (5 tests) 38ms
  Test Files  1 passed (1)
  Tests  5 passed (5)

Existing P1–P14 suite (verbatim summary):
  ✓ tests/integration/phase3-reaudit-public-surface.test.ts (9 tests) 5877ms
  Test Files  1 passed (1)
  Tests  9 passed (9)

Defect reproduced at the R2 baseline by this executor: both suites PASS under
the corruption (failure to detect).

Restore:
  git restore --source=HEAD -- src/editing/types.ts
  post hash = 68a641cdcda3041b24559f78f771a7558c113dfd (MATCH)
  git diff --exit-code -- src/editing/types.ts PASS
  git status --porcelain empty for that path
  no authorityOps residue

## Analyzer design

Canonical path:
  tests/architecture/public-authority-surface-analyzer.ts
  function analyzePublicAuthoritySurface(...)

Standing guard and every permanent proof call this exact analyzer.
Cross-file src-corruption mutex:
  tests/architecture/public-authority-src-lock.ts

Export source of truth (operator D2):
  src/editing/index.ts as a resolved TypeScript module export surface

Resolution:
- load repository TypeScript Program from tsconfig (typescript already
  a devDependency; program cached per process, cleared after src corruption)
- TypeChecker.getExportsOfModule on the editing barrel
- resolve aliases to declarations; include named re-exports
- select exported callables; enumerate every call signature and parameter
- deep-inspect options parameters and *Options types recursively:
  type aliases, interfaces + extends, nested objects, unions, intersections,
  tuples/arrays to project-defined element types, generic wrappers present
  on the surface
- resolve index.ts → types.ts for AuthorizePreparedChangeOptions
- cycle-safe visited set keyed by resolved symbol/type identity (anonymous
  `__type` constituents discriminated by typeToString)
- stop at non-project symbols (typescript lib / node_modules); Buffer and
  Uint8Array method graphs are boundaries
- deterministic manifest sorted by export, signature, parameter, type path,
  member path (locale-independent stable comparator)

Detection semantics (Amendment 1 §4 D preserved; no new vocabulary):
- unreviewed user-defined call signatures on options/input members or on
  parameters that are themselves callable
- operation / adaptor / adapter / bindings / executor / loader / reader /
  writer / verifier / *Ops mechanism-substitution shapes
- any / unknown / index / rest escapes on the inspected surface
- positional earned opaques are represented in the manifest but are not
  recursive method-graph roots (preserves 2-F5 positive controls such as
  WorkspaceBoundary.canonicalize)

Exceptions:
- PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS remains empty
- entries require function + parameter + optional exact memberPath +
  governing contract + reason + targeted test; wildcards FAIL

unknown/any/rest/index: fail when present on the inspected public options /
callable surface per Amendment 1 D and the empty approved-exception policy.

## Legacy mechanism removed / retained

Removed as coverage mechanism:
- hardcoded option type names ReplaceExistingFileOptions /
  CreateFileOptions / ExecuteMultiFilePlanOptions
- hardcoded source files replace-existing-file.ts / create-file.ts /
  multi-file-types.ts
- shallow optionTypePropertyNames allowlist discovery

Those three types are now covered by the derived walker (plus
AuthorizePreparedChangeOptions).

Retained as cheap additional checks (not coverage mechanism):
- package exports map assert ["."]
- barrel named-export + source regex bans for fsOps / targetOps /
  WithDependencies
- public wrapper body forbidden-input regexes
- empty approved-exception allowlist assertion

Legacy enumerated discovery remains available only behind
useLegacyEnumeratedDiscovery for 2-F7 falsification.

## Files changed (Stage 1 candidate)

- tests/architecture/public-authority-surface-analyzer.ts (new, canonical)
- tests/architecture/public-authority-surface-derived.test.ts (new, 2-F1–2-F7)
- tests/architecture/public-authority-src-lock.ts (new, cross-file mutex)
- tests/architecture/public-authority-surface.test.ts (derived standing guard)
- tests/architecture/public-authority-approved-exceptions.ts (memberPath field;
  canonical list still empty)
- docs/reports/PHASE_3_R2_CORRECTION_REPORT.md (this section)

src/ committed changes: NONE
Historical report changes: NONE

## Derived public editing census (post-correction)

Exported callables (16):
authorizePreparedChange, computeCreatedFileMode, createFile,
createMultiFilePlan, executeMultiFilePlan, explicitEditApproval,
isAtomicCreatePlatformSupported, isAtomicReplacePlatformSupported,
isCreateFileDisabled, isModifyExistingFileDisabled,
isMutationActionDisabledByConfig, prepareCreateFile,
prepareModifyExistingFile, replaceExistingFile,
validatePreparedBatchBounds, validateReaderByteLimit

Manifest entries: 148
Findings on clean tree: 0

Options members (all four *Options types):
- authorizePreparedChange / options / AuthorizePreparedChangeOptions / gitContext
- createFile / options / CreateFileOptions / gitContext
- executeMultiFilePlan / options / ExecuteMultiFilePlanOptions / gitContext
- replaceExistingFile / options / ReplaceExistingFileOptions / gitContext

Compared with preflight census: the omitted AuthorizePreparedChangeOptions
graph is now covered; the original three remain covered via the same derived
path; other public editing functions appear in the callable/parameter
manifest.

## Falsifications 2-F1 … 2-F7

2-F1 AUTHORIZE OPTIONS REGRESSION — REAL SURFACE
- corruption: authorityOps on src/editing/types.ts AuthorizePreparedChangeOptions
- pre/post blob hash: 68a641cdcda3041b24559f78f771a7558c113dfd (match)
- standing-guard findings empty assertion FAILED as intended
- finding named: authorizePreparedChange, AuthorizePreparedChangeOptions,
  authorityOps, parameter options / resolved member path
- restore + focused PASS

2-F2 FUTURE PUBLIC FUNCTION AUTO-DISCOVERY
- isolated fixture: futurePublicMutate + FutureMutateOptions.fsOps
- type name added to NO list
- analyzer discovered and failed naming function, options type, member
- fixture removed; repository PASS

2-F3 NAMED RE-EXPORT
- options type in other module, re-exported by name through barrel
- seeded adaptor callable; guard followed re-export and failed naming chain
- fixture removed; PASS

2-F4 RECURSIVE PROJECT TYPE GRAPH
- nested object, type alias, extended interface, union, intersection,
  generic wrapper all reached seeded mechanism members
  (executor/loader/writer/verifier/bindings)
- fixture removed; PASS

2-F5 FALSE-POSITIVE BOUNDARY
- clean repo: findings []; gitContext on all four options types; parameter
  roots include PreparedChange/EditAuthorization/MultiFilePlan/
  ResolvedProjectConfig; Buffer/Uint8Array-bearing params present without
  findings
- synthetic external .d.ts ExternalBlob.danger treated as boundary (no finding)
- ownership decision corrupted → danger surfaced; analyzer candidate bytes
  restored (§1.5 B); PASS

2-F6 APPROVED EXCEPTION MODEL
- canonical PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS remains empty
- synthetic exact function+parameter+member exception permits only that member
- wildcard / missing rationale / broader parameter / sibling member rejected
- no real exception added

2-F7 STRUCTURAL LEGACY-MECHANISM FALSIFICATION
- useLegacyEnumeratedDiscovery=true
- under authorityOps corruption: no finding for AuthorizePreparedChangeOptions
  (2-F1 regression fails to detect); authorizePreparedChange absent from
  legacy callables
- future fixture function absent from enumerated set (2-F2 fails)
- structural completeness: legacy callable coverage incomplete vs derived
- candidate analyzer bytes restored (§1.5 B); focused PASS

No falsification errored before its intended assertion.
No mechanism-shaped member other than seeded corruptions was discovered on
the clean public surface.

## F-R1-002 disposition

Cast-read form detected only by the P4 runtime proof remains governed by
GAP-005 (ACCEPTED_PERMANENT hostile casts). No new gap. Declaration guard
not expanded toward defeating arbitrary hostile casts (operator D4).

## GAP-058

Recorded OPEN at Stage 0. Derived walker scoped to editing barrel only.
Package-root expansion not implemented (operator D2).

## Totals / dependencies / gates

Baseline runtime total at ecda537: 612
Stage 1 runtime total: 619 PASS (7 permanent derived-walker proofs added)

Runtime dependencies: 0 (unchanged)
typescript remains a devDependency only

src/ diff scan for Stage 1 candidate: empty (no path under src/ changed)
Historical reports: unchanged

npm run check (Stage 1 final):
- attempt history prior to analyzer program-narrowing included unconstrained-worker
  and default-5s timeouts under load (recorded honestly in working notes; not a
  product failure class beyond the existing flake)
- final gate after barrel-rooted program narrowing: PASS
  - typecheck PASS
  - build PASS
  - tests 619/619 PASS
  - cli:smoke PASS
  - ledger:verify PASS at Stage 0 HEAD (pre-Stage-1-commit)

## NOT VALIDATED

- the correction is not independently audited by this pass; a fresh executor
  must re-run R1 Stage 3 in full
- package-root callable-surface coverage is not implemented (GAP-058)
- hostile TypeScript casts and cast-read forms remain outside declaration-guard
  responsibility (GAP-005); the runtime P4 layer owns them (F-R1-002)
- auditor independence remains ASSERTED, not mechanically proven (GAP-055)
- the false statement in hardening report §9 remains in that immutable report;
  it is corrected only by this pass's report and GAP-057's description
- single host (darwin, Node); no live Windows validation (GAP-002)
- residual filesystem races remain (GAP-035, GAP-036, GAP-037, GAP-044,
  GAP-045)
- no rollback, no delete, no directory creation
- npm run check timing behavior remains an unconstrained-worker flake
- Foundation §10 audit not run; Phase 4 absent
- a guard that derives coverage is not a proof that no authority can leak; it
  is a proof that declared public option graphs are inspected
- vitest worker RPC timeout observed once during a long parallel architecture
  run after all assertions already passed; not treated as a product defect
