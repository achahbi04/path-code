# PHASE 3-R2-H2 — MEMBER-SHAPE COMPLETENESS AND GENERATED FALSIFICATION

Governing contract:
`docs/passes/PHASE_3_R2_H2_MEMBER_SHAPE_COMPLETENESS_CONTRACT.md`
(committed unchanged in the Stage 0 commit; not rewritten after Stage 0).

Executor A: a fresh Claude Code session that authored none of `ecda537`,
`c60c782`, or `328f6fc`, and holds no transcript of those sessions. Executor
independence remains **ASSERTED**, not mechanically verifiable — GAP-055.

---

## 0. RECORD — BASELINE, FINDINGS, HAZARDS, ORIGINS, DIMENSION TABLE

### 0.1 Baseline gate — every item verified live at the required HEAD

| Gate item | Required | Observed | Result |
|---|---|---|---|
| `git rev-parse HEAD` | `328f6fc174388d85df01ae21311cf44354812ce9` | `328f6fc174388d85df01ae21311cf44354812ce9` | PASS |
| `git status --porcelain` | empty | empty | PASS |
| `npm run ledger:verify` | PASS | `ledger:verify PASS at 328f6fc174388d85df01ae21311cf44354812ce9` | PASS |
| Branch | — | `main` | recorded |

Ancestors — `git merge-base --is-ancestor <sha> HEAD`, each MUST exit 0:

| Ancestor | Exit |
|---|---|
| `696ef4fe` | 0 |
| `5386f349` | 0 |
| `63f6e87c` | 0 |
| `ecda537f` | 0 |
| `8520ab97` | 0 |
| `c60c7825` | 0 |
| `b2531ce8` | 0 |

All seven present. **PASS.**

### 0.2 Baseline verification of the contract's stated preconditions

| Precondition | Method | Observed | Result |
|---|---|---|---|
| R1 report at HEAD contains the exact NOT COMPLETE line | grep | `docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md:1048` — `**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE` | PASS |
| R1 report contains F-R1-004 / F-R1-005 / F-R1-006 | grep | all three present (report §§ 919–921 disposition table, §6, §7) | PASS |
| GAP-060 … GAP-065 unused | repo-wide grep over `*.ts`, `*.md`, `*.json` excluding `node_modules` | zero matches | PASS |
| `safe-editing` IMPLEMENTED | live derivation via `deriveAllCapabilityObservations` | `IMPLEMENTED` | PASS |
| Four mutation capabilities PASS_FROZEN | live derivation | `edit-contracts`, `existing-file-replacement`, `safe-file-creation`, `multi-file-coordination` = `PASS_FROZEN` | PASS |
| Phase 4 absent | grep | Phase 4 appears only as a *future* item in the Constitution §10 and Phase 3D Master; no Phase 4 Master, contract, or implementation exists | PASS |

Full baseline derived-state census at `328f6fc` (live, not transcribed):

| Capability | Derived state |
|---|---|
| `domain-contracts` | IMPLEMENTED |
| `canonical-workspace-path` | IMPLEMENTED |
| `git-discovery` | IMPLEMENTED |
| `project-configuration` | IMPLEMENTED |
| `cli-boundary` | IMPLEMENTED |
| `platform-foundation` | IMPLEMENTED |
| `foundation-kernel` | **PHASE_VERIFIED** |
| `repository-inventory` | IMPLEMENTED |
| `repository-reader` | IMPLEMENTED |
| `git-state-baseline` | IMPLEMENTED |
| `project-metadata-map` | IMPLEMENTED |
| `repository-search` | IMPLEMENTED |
| `freshness-snapshot` | PASS_FROZEN |
| `repository-intelligence` | **PHASE_VERIFIED** |
| `edit-contracts` | **PASS_FROZEN** |
| `existing-file-replacement` | **PASS_FROZEN** |
| `safe-file-creation` | **PASS_FROZEN** |
| `multi-file-coordination` | **PASS_FROZEN** |
| `safe-editing` | **IMPLEMENTED** — not promoted |

### 0.3 Baseline runtime total — VERIFIED, not hardcoded

`npm test` at `328f6fc`, host load average `10.90 12.58 13.36` (8 CPUs):

```
 Test Files  66 passed (66)
      Tests  626 passed (626)
     Errors  2 errors
   Duration  168.50s
```

Runtime total **626** — matches the contract's expected 626. **VERIFIED.**

The 2 errors are `Error: [vitest-worker]: Timeout calling "onTaskUpdate"`
reporter-RPC timeouts, not assertion failures. Zero assertion failures; 66/66
files passed. This is exactly the behavior recorded as **GAP-059** (full
`npm run check` wall-clock instability under host contention). No vitest,
worker, or timeout redesign is performed in this pass — operator decision D7.

### 0.4 Baseline disposition counts — DERIVED LIVE, never hardcoded

Produced by invoking the canonical analyzer
(`tests/architecture/public-authority-surface-analyzer.ts`,
`analyzePublicAuthoritySurface`) against the real repository with the
canonical approved-exception set:

| Figure | Contract expectation | Observed at `328f6fc` | Result |
|---|---|---|---|
| Public parameter roots | 28 | **28** | VERIFIED |
| Dispositions, total | 5302 | **5302** | VERIFIED |
| `TRAVERSED_PROJECT_GRAPH` | 1520 | **1520** | VERIFIED |
| `PRIMITIVE_TERMINAL` | 3522 | **3522** | VERIFIED |
| `EXTERNAL_LIBRARY_TERMINAL` | 229 | **229** | VERIFIED |
| `REVIEWED_TERMINAL` | 31 | **31** | VERIFIED |
| `CALLABLE_REJECTED` | — | **0** | recorded |
| `UNSAFE_ESCAPE_REJECTED` | — | **0** | recorded |
| Manifest rows | 2242 (per F-R1-005) | **2242** | VERIFIED |
| Findings | 0 | **0** | VERIFIED |
| `manifestedDispositionRoots` | 28 | **28** | VERIFIED |
| Program construction count | — | **1** | recorded |
| Analyzer wall-clock (cold Program) | — | **1433 ms** | recorded |

Exported callables discovered — **16**:

```
authorizePreparedChange, computeCreatedFileMode, createFile,
createMultiFilePlan, executeMultiFilePlan, explicitEditApproval,
isAtomicCreatePlatformSupported, isAtomicReplacePlatformSupported,
isCreateFileDisabled, isModifyExistingFileDisabled,
isMutationActionDisabledByConfig, prepareCreateFile,
prepareModifyExistingFile, replaceExistingFile,
validatePreparedBatchBounds, validateReaderByteLimit
```

Every contract-stated baseline figure reproduces exactly. Nothing in this
pass depends on a transcribed number.

### 0.5 THE THREE FINDINGS — EXACT DEFECTIVE LINES AT CURRENT LINE NUMBERS

All line numbers are the **current** numbers in
`tests/architecture/public-authority-surface-analyzer.ts` at `328f6fc`
(1436 lines), verified by `grep -n`.

> **Correction of record.** The contract text cites line **873** for
> F-R1-004. The live line at `328f6fc` is **874**. The contract's other two
> citations (856, 954) are exact. The one-line discrepancy is recorded here
> rather than silently accepted; the defect itself is unchanged and is at
> line 874.

#### F-R1-004 — OPTIONAL CALLABLE NEVER CLASSIFIED CALLABLE

`tests/architecture/public-authority-surface-analyzer.ts:874`

```ts
    let rejected = false;
    if (hasUserDefinedCallSignatures(propType)) {
      rejected = true;
      pushFinding(
```

with, at line 861:

```ts
    const propType = checker.getTypeOfSymbol(prop);
```

and the classifier at lines 461–463:

```ts
function hasUserDefinedCallSignatures(type: ts.Type): boolean {
  return type.getCallSignatures().length > 0;
}
```

`propType` is the **un-unwrapped** member type. For an optional member
`q?: (m) => string` the type is `((m) => string) | undefined`;
`getCallSignatures()` on a union returns `[]`, so `rejected` stays false and
no `CALLABLE_REJECTED` disposition and no finding are emitted.

The unwrapped value exists twelve lines later — line 926,
`const unwrappedProp = unwrapNonNullish(propType);` — and is used for the
*disposition identity* (line 915) and for *descent* (line 934), but never for
*classification*. The nested-literal path at line 969 does classify the
unwrapped type (line 956), which is why the defect is confined to the
top-level member loop and to every nested project-defined node reached
through `walkType`.

Every existing option member on every options type in this repository is
optional. Optional is the natural way to write one.

#### F-R1-005 — SYMBOL-KEYED MEMBERS SKIPPED BEFORE THE MANIFEST PUSH

`tests/architecture/public-authority-surface-analyzer.ts:853–858`

```ts
  for (const prop of type.getProperties()) {
    const propName = prop.getName();
    // Skip well-known symbol properties (iterators) — not caller substitution.
    if (propName.startsWith("__@")) {
      continue;
    }
```

`tests/architecture/public-authority-surface-analyzer.ts:952–956`

```ts
          for (const nested of unwrappedProp.getProperties()) {
            const nestedName = nested.getName();
            if (nestedName.startsWith("__@")) continue;
            const nestedPath = `${memberPath}.${nestedName}`;
            const nestedType = unwrapNonNullish(
```

TypeScript's `escapedName` for **every** symbol-keyed property — well-known
and unique alike — begins `__@`. Both guards therefore fire for unique
symbols, not only iterators. Decisively, both run **before** the
`ctx.manifest.push({...})` at lines 863–871 (and 959–967). The member never
enters the manifest, so the R2-H1 per-root completeness proof cannot observe
its absence: a corrupted tree analyzes byte-identical to a clean one
(**5302** dispositions, **2242** manifest rows, **0** findings — the exact
baseline figures reproduced in §0.4).

This is a **name-pattern skip** — precisely the class GAP-057/F-R1-003
eliminated at the *root* level — surviving at the *member* level. It is also
the only remaining `startsWith` on a property name in the analyzer.

#### F-R1-006 — OBJECT-VALUED BARREL EXPORTS DROPPED FROM DISCOVERY

`tests/architecture/public-authority-surface-analyzer.ts:1269–1273`

```ts
    const signatures = type.getCallSignatures();
    if (signatures.length === 0) {
      continue;
    }
    exportedCallables.push(name);
```

An exported value whose type carries no call signatures is `continue`d out of
discovery entirely — before any disposition is recorded. An exported object
literal or namespace object whose *members* are functions is a public
callable surface reachable by any consumer, and it never becomes a root. No
export-level completeness proof exists to notice, because the export loop
records nothing for a skipped export.

### 0.6 THE TWO HAZARDS THE AUDITOR FLAGGED WITHOUT CALLING THEM FINDINGS

**H-1 — `programCache` has no invalidation source.**
`tests/architecture/public-authority-surface-analyzer.ts:157`:

```ts
const programCache = new Map<string, ts.Program>();
```

keyed at line 206 on `repoRoot` alone:

```ts
  const cached = programCache.get(repoRoot);
  if (cached !== undefined) {
    return { program: cached, constructed: false };
  }
```

No content, size, or mtime participates. The cache is stale in **both**
directions across a `src/` mutation that preserves size and mtime. Correct
behavior currently depends on callers invoking
`clearRepositoryTypeScriptProgramCache()` (line 216) by convention. Safety by
convention is not safety. Recorded as **GAP-063**, BLOCKING_INVARIANT.

**H-2 — `process.cwd()` affects lib resolution.**
`createRepositoryTypeScriptProgram` (lines 159–192) passes `ts.sys` to
`ts.parseJsonConfigFileContent` and calls `ts.createProgram` with no explicit
`host`; the default host resolves default-lib and relative paths through
`ts.sys.getCurrentDirectory()`, i.e. `process.cwd()`. It degrades fail-closed,
but an evidence tool whose output depends on the directory it was invoked
from is not deterministic. Recorded as **GAP-064**,
NON_BLOCKING_LIMITATION.

Note that `architectureTestsRepoRoot()` (line 1434) is already cwd-independent
— it derives from `import.meta.url`. The residual dependence is inside Program
construction, not root discovery.

### 0.7 THE AUDITOR'S ONE-SENTENCE CAUSE — QUOTED VERBATIM

From `docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md` §6, lines 530–534:

> The R2-H1 correction removed the *naming gate* on roots (F-R1-003) and made
> discovery export-driven (F-R1-001). Both fixes hold. But the walker still
> contains member-level skip authority that neither prior auditor nor the
> implementer's own falsifications reached, because every prior probe used a
> **required, string-keyed** member.

### 0.8 THE THREE-PASS TABLE

| # | Checkpoint | Verdict | Finding(s) | Mechanism the falsifications missed |
|---|---|---|---|---|
| 1 | `ecda537` | NOT COMPLETE | **F-R1-001** — discovery enumerated three type names | enumerated discovery |
| 2 | `c60c782` | NOT COMPLETE | **F-R1-003** — traversal gated on parameter/type naming | root-level name gate |
| 3 | `328f6fc` | NOT COMPLETE | **F-R1-004** optional callable members never classified callable; **F-R1-005** symbol-keyed members skipped before manifest push; **F-R1-006** object-valued barrel exports dropped from discovery | member-level shape assumptions |

Three fresh independent auditors, three checkpoints, three NOT COMPLETE
verdicts. Each found a defect the implementer's own falsifications did not
reveal. R2's `2-F1…2-F7`, R2-H1's `H1-F1…H1-F7`, and both prior auditors
shared one unexamined assumption: a **required, string-keyed** member.

### 0.9 ORIGINS

**PRIMARY ORIGIN — IMPLEMENTATION**, for F-R1-004 / F-R1-005 / F-R1-006.
Foundation Extensibility Constitution V1 Amendment 1 §4 D requires failure on
an unreviewed member carrying a user-defined call signature, **without**
qualification by optionality, key kind, or export kind. The analyzer at
`328f6fc` qualifies on all three.

**CONTRIBUTING ORIGIN — EVIDENCE.** Three rounds of falsification design, by
three different authors, shared one blind spot about member shape.
Falsifications written from imagination test what the author imagined. This
pass records that as a process finding (**GAP-065**) and corrects it
structurally: from this pass forward, falsifications for this detection
mechanism are **generated** from an enumerated, operator-reviewed dimension
table committed as data, not hand-written. The next auditor's task becomes
"find a dimension the table lacks" — a far smaller target than "imagine a
shape nobody tested."

**No active leak exists at `328f6fc`.** Every finding is *absent detection*,
not present authority escape. The clean public surface produces 0 findings,
and §0.4 confirms it.

### 0.10 THE REVIEWED DIMENSION TABLE — VERBATIM AS REVIEWED

Reproduced here exactly as the operator reviewed it (contract §THE REVIEWED
DIMENSION TABLE). Per operator decision **D5** this is the reviewed table:
the implementer may *propose additions* in the Stage 1 report but may **not
remove** a dimension or a value. The table is committed as data; the fixtures
are generated from it; a dimension is added by adding a row.

Every generated fixture is one cell: a public function (or object-valued
export) whose parameter graph carries ONE seeded callable member at ONE
placement, with the member's shape chosen from each dimension. The analyzer
MUST emit exactly the expected CALLABLE_REJECTED (or UNSAFE_ESCAPE_REJECTED
where noted) at the expected path, and the member MUST appear in the
manifest.

```
DIM-1  OPTIONALITY
  required
  optional (`?`)
  explicit `| undefined`
  explicit `| null`
  explicit `| null | undefined`

DIM-2  KEY KIND
  identifier key
  string-literal key (quoted, including keys with spaces and `__@` prefix
    as a plain string)
  numeric-literal key
  well-known symbol key (Symbol.iterator, Symbol.asyncIterator,
    Symbol.toPrimitive)
  unique symbol key (`declare const k: unique symbol`)
  computed key from a const string

DIM-3  CALLABLE FORM
  property with function type
  method signature
  property with construct signature (`new (...) => X`)
  call signature on the containing type itself
  construct signature on the containing type itself
  index signature whose value type is callable
  getter whose type is callable
  overloaded function type (two or more call signatures)
  generic function type
  function type nested inside a non-callable object member (one level)

DIM-4  PLACEMENT
  top-level member of the parameter type
  nested object, depth 1
  nested object, depth 3
  union constituent
  intersection constituent
  array element
  readonly array element
  tuple element
  type argument of a project-defined generic
  type argument of an external generic (Promise, ReadonlyArray, Map value,
    Record value, Partial, Readonly, Pick)
  inherited via interface extends
  through a type-alias chain (three aliases)
  through a mapped type over a project type
  through a conditional type that resolves to an object type
  rest-parameter element type
  overload signature (second overload only)

DIM-5  MUTABILITY
  readonly
  mutable

DIM-6  NAMING
  mechanism keyword (ops, executor, loader, …)
  neutral (quill, tide, marble, …)
  single letter

DIM-7  ROOT KIND
  function parameter
  object-valued export member's parameter
  object-valued export member that is itself callable (the member IS the
    root; its parameters are traversed)

CELL SELECTION — REQUIRED MINIMUM
  A. Full cross-product DIM-1 × DIM-2 × DIM-3 at top-level placement,
     readonly, neutral naming, function-parameter root.
     (5 × 6 × 10 = 300 cells)
  B. Every DIM-4 placement × {required, optional} × {identifier key,
     unique symbol key} × {property-fn, method}.
     (16 × 2 × 2 × 2 = 128 cells)
  C. Every DIM-7 root kind × {required, optional} × {identifier, unique
     symbol} at top-level.
     (3 × 2 × 2 = 12 cells)
  D. A pairwise covering array over ALL seven dimensions (every pair of
     values from any two dimensions appears in at least one cell).
  E. CONTROL cells: for every cell in A, the same shape with a NON-callable
     member type (string, number, project data object without callables).
     Expected: 0 findings, member manifested with a non-rejected disposition.
```

The generator MUST emit cell identity (dimension values) into each finding so
a failure names the cell. The table is a committed data file. Cells that
TypeScript cannot express (e.g. a getter on a type alias) are recorded as
INEXPRESSIBLE with the reason, not silently omitted; the count of
inexpressible cells is asserted and must be justified in the report.

### 0.11 GAPS APPENDED IN THIS STAGE

Per operator decision **D2** — one gap per mechanism, all IDs verified unused
at baseline (§0.2), all with `reviewClassification` set because the operator
has reviewed them.

| Gap | Title | Classification | Lifecycle at Stage 0 | Attached |
|---|---|---|---|---|
| GAP-060 | optional / union-wrapped callable classification | BLOCKING_INVARIANT | OPEN | `safe-editing`, `edit-contracts` |
| GAP-061 | symbol-keyed member skip; manifest blind to skip | BLOCKING_INVARIANT | OPEN | `safe-editing`, `edit-contracts` |
| GAP-062 | object-valued export discovery | BLOCKING_INVARIANT | OPEN | `safe-editing`, `edit-contracts` |
| GAP-063 | Program cache without content-based invalidation | BLOCKING_INVARIANT | OPEN | `safe-editing`, `edit-contracts` |
| GAP-064 | cwd-dependent lib resolution | NON_BLOCKING_LIMITATION | OPEN | unattached |
| GAP-065 | falsification design shared implementer assumptions | NON_BLOCKING_LIMITATION | OPEN | unattached |

### 0.12 GAP-057 — NOTES SCOPED, NOT REOPENED

Per operator decision **D1**, GAP-057 **stays CLOSED**. Root discovery and
root-level traversal are correct; the auditor reproduced 28/28 roots and every
disposition count (independently re-reproduced in §0.4). Its notes are amended
to scope precisely what its closure established — root discovery, root-level
traversal, no root-level name gate — and to cite GAP-060/061/062 for
member-level and export-level completeness. Its `lifecycle`,
`reviewClassification`, `closedByCommit`, and `closureEvidence` are
unchanged. Prior closure commits remain immutable.

### 0.13 NO COMPONENT DOWNGRADE — D3 HELD STRUCTURALLY

`knownLimitations` is not an input to capability-state derivation
(`src/selfobs/derivation.ts` — `deriveCandidateState` and `deriveVerifiedState`
consider `phaseAuditEvidence`, `freezeEvidence`, `implementationEvidence`, and
`declarationEvidence` only). Attaching four OPEN BLOCKING_INVARIANT gaps
therefore cannot lower a derived state. The four mutation capabilities keep
their `freezeEvidence`; `safe-editing` keeps its `implementationEvidence` and
acquires no `phaseAuditEvidence`. Derived states after Stage 0 are re-derived
live and compared against §0.2 in §0.14.

### 0.14 STAGE 0 GATE

| Step | Command | Observed | Result |
|---|---|---|---|
| 0.4 | `npm run gap:render` | `Rendered /Users/achahbi/Projects/path-code/docs/GAP_LEDGER.md` | PASS |
| 0.4 | `npm run ledger:verify` | `ledger:verify PASS at 328f6fc174388d85df01ae21311cf44354812ce9` | PASS |
| 0.4 | `npx tsc -p tsconfig.json --noEmit` | no diagnostics | PASS |
| 0.4 | derived-state re-census vs §0.2 | all 19 capabilities identical | **UNCHANGED** |

Derived-state re-census after appending six gaps and attaching four of them to
two capabilities — compared line-for-line against the §0.2 baseline census:

| Capability | §0.2 baseline | After Stage 0 edits | Delta |
|---|---|---|---|
| `domain-contracts` | IMPLEMENTED | IMPLEMENTED | none |
| `canonical-workspace-path` | IMPLEMENTED | IMPLEMENTED | none |
| `git-discovery` | IMPLEMENTED | IMPLEMENTED | none |
| `project-configuration` | IMPLEMENTED | IMPLEMENTED | none |
| `cli-boundary` | IMPLEMENTED | IMPLEMENTED | none |
| `platform-foundation` | IMPLEMENTED | IMPLEMENTED | none |
| `foundation-kernel` | PHASE_VERIFIED | PHASE_VERIFIED | none |
| `repository-inventory` | IMPLEMENTED | IMPLEMENTED | none |
| `repository-reader` | IMPLEMENTED | IMPLEMENTED | none |
| `git-state-baseline` | IMPLEMENTED | IMPLEMENTED | none |
| `project-metadata-map` | IMPLEMENTED | IMPLEMENTED | none |
| `repository-search` | IMPLEMENTED | IMPLEMENTED | none |
| `freshness-snapshot` | PASS_FROZEN | PASS_FROZEN | none |
| `repository-intelligence` | PHASE_VERIFIED | PHASE_VERIFIED | none |
| `edit-contracts` | PASS_FROZEN | **PASS_FROZEN** | none |
| `existing-file-replacement` | PASS_FROZEN | **PASS_FROZEN** | none |
| `safe-file-creation` | PASS_FROZEN | **PASS_FROZEN** | none |
| `multi-file-coordination` | PASS_FROZEN | **PASS_FROZEN** | none |
| `safe-editing` | IMPLEMENTED | **IMPLEMENTED** | none |

**D3 satisfied: no component downgrade.** Four mutation capabilities remain
PASS_FROZEN; `safe-editing` remains IMPLEMENTED and is not promoted.

Gap ledger record count: **59 → 65**. `MAX_GAPS` is 256; `MAX_CAPABILITIES`
is 64; `MAX_TOTAL_CITATIONS` is 2048. Adding 8 `knownLimitations` citations
keeps every bound satisfied — `ledger:verify` enforces all three and passed.

### 0.15 STAGE 0 SCOPE OF CHANGE

Files changed in the Stage 0 commit:

| File | Nature |
|---|---|
| `docs/passes/PHASE_3_R2_H2_MEMBER_SHAPE_COMPLETENESS_CONTRACT.md` | new — this pass's governing contract, committed verbatim per Constitution V1 §9 |
| `docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md` | new — this report, §0 |
| `src/selfobs/gap-ledger-data.ts` | canonical self-observation ledger bookkeeping — GAP-060…065 appended; GAP-057 notes scoped |
| `src/selfobs/capability-ledger-data.ts` | canonical self-observation ledger bookkeeping — GAP-060…063 attached to `edit-contracts` and `safe-editing` |
| `docs/GAP_LEDGER.md` | regenerated by `npm run gap:render` from the machine-readable source |

The only `src/` changes are inside the canonical self-observation ledger
surface, as the contract permits. No analyzer, editing, domain, or runtime
source is touched in Stage 0. No authorization semantics, ActionClass,
evidence tier, or ledger schema is altered — six records are appended to an
existing ledger using the existing `ReviewedGapRecord` shape, and eight
citations are appended using the existing `gap` citation shape.

### 0.16 STAGE 0 CHECKLIST LINES ANSWERED

| # | Question | Answer |
|---|---|---|
| 1 | Start HEAD exactly `328f6fc…`; tree clean; ancestors present? | **YES** — §0.1 |
| 2 | GAP-060…065 unused at baseline? | **YES** — §0.2, zero repo-wide matches |
| 3 | Three defective lines quoted with current line numbers? | **YES** — §0.5, lines 874 / 856 / 954 / 1270, with the contract's 873→874 discrepancy recorded |
| 4 | Baseline disposition counts recorded, not hardcoded? | **YES** — §0.4, all derived by live analyzer invocation |
| 5 | GAP-057 notes scoped, not reopened? | **YES** — §0.12; lifecycle CLOSED, closure fields untouched |
| 33 | Committed `src/` change outside canonical ledger surface? | **NO** — §0.15 |
| 38 | Any closure artifact; Stage 4; push; remote; history rewrite? | **NO** |

Remaining checklist lines are answered in §1 and §2.

---

## 1. CORRECTION AND GENERATED FALSIFICATION

Stage 0 commit: `80c5f8359d6b5164b47ea99be9a3e96b9607edfa`.
Every §1.1 reproduction below was executed against the **Stage 0 HEAD
analyzer**, before any line of the analyzer was modified.

### 1.1 PRE-CORRECTION REPRODUCTION — ALL FIVE, CAPTURED FIRST

Method for (a)–(d): corrupt a real `src/` file → invoke the canonical analyzer
→ capture verbatim → `git checkout --` → assert blob-hash equality against the
pre-corruption `git hash-object`. Original blobs:
`src/editing/types.ts` = `68a641cdcda3041b24559f78f771a7558c113dfd`,
`src/editing/index.ts` = the Stage 0 HEAD blob. Every restore was verified
`true` and the tree was `(clean)` at the end of the run.

**CLEAN BASELINE inside the same process** (for byte-comparison):

```
findings 0 | dispositions 5302 | manifest 2242 | exports 16
TRAVERSED_PROJECT_GRAPH 1520, PRIMITIVE_TERMINAL 3522,
EXTERNAL_LIBRARY_TERMINAL 229, REVIEWED_TERMINAL 31
manifest SHA-256 9c8d31ce89eaf62e1abc2a898cf9324bed2be2846f608fc8ed2187226577a457
```

#### 1.1(a) — Optional callable on the real `AuthorizePreparedChangeOptions`

Corruption (`src/editing/types.ts`, corrupted blob
`6907e84fed9b1f8bb724d434c1ff1b851786d6ec`):

```ts
export type AuthorizePreparedChangeOptions = {
  readonly gitContext?: GitStateBaseline;
  readonly quill?: (message: string) => string;
};
```

`quill` is deliberately **neutral-named** so that the Amendment 1 §4 D
mechanism-name rule cannot mask the call-signature rule.

Verbatim result:

```
findings 0 | dispositions 5303 | manifest 2243 | exports 16
TRAVERSED_PROJECT_GRAPH 1521, PRIMITIVE_TERMINAL 3522,
EXTERNAL_LIBRARY_TERMINAL 229, REVIEWED_TERMINAL 31
findings: []
quill rows present in manifest: 1
restored blob equality: true
```

**REPRODUCED.** A user-defined call signature is present on a public options
member and the analyzer emits **zero** findings and **zero**
`CALLABLE_REJECTED` dispositions. Note precisely what this proves: the member
*is* manifested (2242 → 2243) and *is* dispositioned (5302 → 5303 as
`TRAVERSED_PROJECT_GRAPH`). Discovery and traversal are correct — F-R1-004 is
purely a **classification** defect, exactly as GAP-060 records.

#### 1.1(b) — Unique-symbol-keyed callable on the same real type

Corruption (corrupted blob `a9fdbdd5ee6769ec194375da7a39add6e912174d`):

```ts
export declare const tideKey: unique symbol;

export type AuthorizePreparedChangeOptions = {
  readonly gitContext?: GitStateBaseline;
  readonly [tideKey]: (message: string) => string;
};
```

The member is **required** and **non-optional** — it defeats the analyzer by
key kind alone, independently of F-R1-004.

Verbatim result:

```
findings 0 | dispositions 5302 | manifest 2242 | exports 16
TRAVERSED_PROJECT_GRAPH 1520, PRIMITIVE_TERMINAL 3522,
EXTERNAL_LIBRARY_TERMINAL 229, REVIEWED_TERMINAL 31
findings: []
manifest byte-identical to clean: TRUE
manifest SHA-256 9c8d31ce89eaf62e1abc2a898cf9324bed2be2846f608fc8ed2187226577a457
restored blob equality: true
```

**REPRODUCED, including the decisive property.** The corrupted tree analyzes
**byte-identical** to the clean tree — identical manifest SHA-256, identical
5302/2242/1520/3522/229/31. There is no observable difference for any
completeness proof to detect. This is why F-R1-005 is the most serious of the
three: the R2-H1 completeness machinery is not merely silent, it is
structurally incapable of speaking.

#### 1.1(c) — Object-valued export with a callable member

Corruption appended to the real barrel `src/editing/index.ts` (corrupted blob
`26554ecc60fa1384aefb6dd1f23b9597aa163d00`):

```ts
export const marbleSurface = {
  invoke: (message: string): string => message,
};
```

Verbatim result:

```
findings 0 | dispositions 5302 | manifest 2242 | exports 16
manifest byte-identical to clean: TRUE
marbleSurface discovered as callable export: false
marbleSurface rows in manifest:      0
marbleSurface rows in dispositions:  0
findings: []
restored blob equality: true
```

**REPRODUCED.** A publicly exported object carrying a function member is
absent from discovery, from the manifest, and from the disposition census
entirely — `exportedCallables` stays at 16 and the analysis is byte-identical
to clean. Nothing records that an export was even considered and dropped.

#### 1.1(d) — Program cache staleness, same process, size preserved

Warm the cache, then corrupt with a **same-length** replacement and restore
the mtime, then re-analyze **with no `clearRepositoryTypeScriptProgramCache()`
call**:

```
from: "readonly gitContext?: GitStateBaseline;"   (39 chars)
to:   "readonly q?: (m: string) => string;    "   (39 chars)
```

Verbatim result:

```
warm:  findings 0, programConstructionCount 1
same-length replacement: 39 vs 39 -> true
size preserved:  true   9730 -> 9730
mtime preserved: 1788607177207.346 -> 1788607177207  (identical to
                 millisecond granularity; utimesSync truncates the
                 sub-millisecond fraction — see note)
after corruption, NO clear call:
       findings 0, programConstructionCount 0
stale result identical to warm: TRUE
restored blob equality: true
```

**REPRODUCED.** A live callable member was introduced on a public options type
and the analyzer returned the **stale clean result** — 0 findings,
`programConstructionCount` 0, byte-identical to the warm run. The cache
returned a Program built from the pre-corruption text.

Note on mtime: `utimesSync` restores millisecond precision, so the recorded
mtime went from `…207.346` to `…207` — identical at the granularity any
mtime-based cache would observe, and a 0.346 ms sub-millisecond difference
otherwise. This does not weaken the demonstration, because the cache key
(`tests/architecture/public-authority-surface-analyzer.ts:206`) is
`repoRoot` **alone**: neither size, nor mtime, nor content participates at
all. No filesystem metadata could have invalidated it.

#### 1.1(e) — cwd dependence: REPRODUCED, and more strongly than predicted

The identical analyzer call — same explicit `repoRoot`, same exceptions, same
process image — run from two working directories:

| | from repository root | from a temporary directory |
|---|---|---|
| `cwd` | `/Users/achahbi/Projects/path-code` | `…/scratchpad/elsewhere` |
| findings | **0** | **2** |
| dispositions | **5302** | **5286** |
| manifest rows | 2242 | 2242 |
| `TRAVERSED_PROJECT_GRAPH` | 1520 | 1520 |
| `PRIMITIVE_TERMINAL` | 3522 | 3522 |
| `EXTERNAL_LIBRARY_TERMINAL` | **229** | **211** |
| `REVIEWED_TERMINAL` | 31 | 31 |
| `UNSAFE_ESCAPE_REJECTED` | **0** | **2** |
| manifest SHA-256 | `9c8d31ce…6577a457` | `edf6f89a…fa654824` |
| dispositions SHA-256 | `edf5706a…3dfc309f` | `499cee5c…e6524fd18` |

The two spurious findings, verbatim:

```json
[
 {"functionName":"prepareCreateFile","parameterName":"proposedBytes",
  "memberPath":"proposedBytes","typeName":"any","typePath":"any",
  "reason":"unreviewed any/unknown escape on public parameter/options surface"},
 {"functionName":"prepareModifyExistingFile","parameterName":"proposedBytes",
  "memberPath":"proposedBytes","typeName":"any","typePath":"any",
  "reason":"unreviewed any/unknown escape on public parameter/options surface"}
]
```

**REPRODUCED.** From a foreign cwd the `Uint8Array` parameter type fails to
resolve and degrades to `any`, which the analyzer then correctly rejects. The
degradation is **fail-closed** — it produces *more* findings, never fewer,
which is why the auditor declined to class it a finding. But the analyzer's
output is demonstrably a function of the directory it was invoked from: two
different manifests, two different disposition censuses, two different
verdicts. An evidence tool with that property is not deterministic. Recorded
as GAP-064.

**All five reproductions succeeded. No STOP AND REPORT condition was
triggered at §1.1.** Working tree verified `(clean)` after the run.

### 1.2–1.7 THE CORRECTION

All Stage 1 code changes are confined to `tests/architecture/`. **No `src/`
file is changed in Stage 1 at all** (§1.11).

#### 1.2 Classification on the unwrapped type (F-R1-004 / GAP-060)

`hasUserDefinedCallSignatures(propType)` at line 874 is replaced, on the
default path, by `isCallableMemberType(type, checker)`:

```ts
function isCallableMemberType(type: ts.Type, checker: ts.TypeChecker): boolean {
  for (const part of callableConstituents(unwrapNonNullish(type))) {
    if (typeIsCallableAtOwnLevel(part, checker)) return true;
    for (const info of checker.getIndexInfosOfType(part)) {
      if (typeIsCallableAtOwnLevel(unwrapNonNullish(info.type), checker)) return true;
    }
  }
  return false;
}
```

`callableConstituents` flattens unions and intersections **recursively** and
drops `null` and `undefined`; `typeIsCallableAtOwnLevel` accepts **call OR
construct** signatures. Methods, callable getters, overloaded function types
and generic function types all reduce to this one rule, because the
TypeChecker reports a method's and a getter's type as the underlying type and
an overloaded or generic function type carries call signatures like any other.
Optionality is no longer a shield. The same classifier now also guards the
parameter-root check, so an optional or union-wrapped **parameter** is caught
exactly like a required one.

#### 1.3 Member iteration with no name-based skip (F-R1-005 / GAP-061)

Both `startsWith("__@")` guards are gone from the default path. The member
census is now unconditional over `checker.getPropertiesOfType`, every call
signature, every construct signature and every index info, and the manifest
push happens for **every** one of them.

Symbol-keyed members are serialized by **declaration identity**:

```
@@[<declaring file, repository-relative>#<symbol description>]
```

for example `@@[src/editing/types.ts#editAuthorizationBrand]`. Symbol-keyed-ness
is decided from the declaration SHAPE (a computed property name) and the KEY
TYPE FLAGS (`ESSymbol` / `UniqueESSymbol`) — **never** from the text of the
member name. TypeScript's own `escapedName` embeds a per-Program symbol id and
is not stable across runs; this identity is.

The three R2-H1 stop authorities (primitive, external after type-argument
inspection, reviewed terminal) now apply to members exactly as to roots, and
descent is unconditional — a rejection no longer stops the walk. This also
allowed the previous special-case nested-literal re-walk (former lines
949–1017) to be deleted: `walkType` is now the single member-census authority
(checklist 40 — material work removed while strengthening the proof).

#### 1.4 Per-node completeness

Every traversed project-defined node emits a `NodeCompletenessRecord`:

```
|getPropertiesOfType| + |callSignatures| + |constructSignatures| + |indexInfos|
    == manifested entries for that node
```

On the clean surface there are **911 nodes and 0 mismatches**. This identity is
what makes an omission observable at all: under the previous shape a skipped
symbol-keyed member produced a byte-identical analysis (§1.1(b)).

#### 1.5 Export disposition (F-R1-006 / GAP-062)

Every VALUE export of the barrel now receives a disposition on a **separate
closed axis** — `ExportDisposition` — so `TraversalDisposition` remains exactly
six values with no seventh, as its contract comment requires.

Object-valued exports are traversed by the same walker used for parameter
graphs, and every callable member is promoted to a `CALLABLE_ROOT` whose own
parameters are traversed through `analyzeCallableRoot` — one canonical path,
no second rule set (checklist 31).

#### 1.6 Content-hash Program cache (GAP-063)

The cache key is the sorted list of (repository-relative path, SHA-256 of
current content) for **every** source file in the Program, plus a hash of the
compiler options. Path, size and mtime are not keys; an unreadable file hashes
as `missing`, so deletion invalidates too. `clearRepositoryTypeScriptProgramCache()`
is retained for compatibility with existing proofs but correctness no longer
depends on any caller invoking it — it is a belt, not the suspenders.

#### 1.7 cwd independence (GAP-064)

`parseJsonConfigFileContent` now receives an explicit `ParseConfigHost` with an
absolute basePath, and the Program is built with an explicit CompilerHost whose
`getCurrentDirectory()` returns the repository root. Nothing resolves through
`process.cwd()`.

### 1.8 THE GENERATOR

| Artifact | Purpose |
|---|---|
| `tests/architecture/public-authority-surface-dimensions.ts` | the reviewed dimension table, committed **as data** |
| `tests/architecture/public-authority-surface-matrix.ts` | the generator: cell selection, source construction, in-memory Program, canonical analysis |
| `tests/architecture/public-authority-surface-matrix.test.ts` | H2-F2 — the permanent matrix proof |

Each cell is built as an **in-memory virtual source overlay** added to a
TypeScript Program through a custom CompilerHost — **no disk writes for cells**
— and analyzed by `analyzePublicAuthoritySurface`, the canonical analyzer.
Cell identity (every dimension value) is carried into every assertion message,
so a failure names the cell that produced it.

**Expressibility is decided by the TypeScript compiler, not by the author.**
Every generated cell is compiled and its syntactic and semantic diagnostics are
collected; any diagnostic makes the cell INEXPRESSIBLE with the exact `TS####`
message recorded. Shapes TypeScript cannot express at all are recorded
structurally with a stated reason.

**Cell counts and runtime:**

| Group | Cells | Expressible | INEXPRESSIBLE | Runtime |
|---|---|---|---|---|
| A — full DIM-1 × DIM-2 × DIM-3 | **300** | 282 | 18 | 286 ms |
| B — every DIM-4 placement | **128** | 128 | 0 | 205 ms |
| C — every DIM-7 root kind | **12** | 12 | 0 | 142 ms |
| D — pairwise over all 7 dimensions | **182** | 168 | 14 | 183 ms |
| E — non-callable controls | **300** | 300 | 0 | 165 ms |
| **TOTAL** | **922** | **890** | **32** | **981 ms** |

Group A/B/C counts are derived from the table, not transcribed:
5 × 6 × 10 = 300, 16 × 2 × 2 × 2 = 128, 3 × 2 × 2 = 12 — all asserted.

**Group D covering property is asserted, not assumed:** `uncoveredPairsAfter`
independently recomputes every pair of values from any two of the seven
dimensions and confirms **0 uncovered pairs** across 182 cells.

Total runtime is under one second, so no sharding was necessary; the matrix
lives in one test file that completes in ~2.6 s standalone.

### 1.8b INEXPRESSIBLE CELLS — COUNTED AND JUSTIFIED

All **32** inexpressible cells (18 in A, 14 in D) share exactly **one** reason,
asserted by the test to be the only reason that may appear:

> a method signature declares its own type and cannot be unioned with
> null/undefined at the declaration site (DIM-1 explicit-nullish × DIM-3 method)

**Justification.** DIM-1's three explicit-nullish values (`| undefined`,
`| null`, `| null | undefined`) require writing a member type as a union.
DIM-3's `method` value is a *method signature*, which declares its own type
inline; TypeScript provides no syntax to union a method signature with
`null`/`undefined` at its declaration site. Writing
`readonly k: ((m: string) => string) | undefined` would silently substitute the
`property-fn` form and pretend a method had been tested — so these cells are
recorded, counted and reported instead. In group A this is 3 DIM-1 values × 6
DIM-2 values × 1 DIM-3 value = **18**; group D's pairwise selection hits the
same combination **14** times.

Every other reviewed value remains fully expressible for every other
combination, because the generator places the callable form inside a
**carrier member** wherever the form itself cannot carry the DIM-1/DIM-2/DIM-5
modifiers: callable getters, call/construct signatures on the containing type,
callable index signatures and nested function types are all reached through an
ordinary property, so optionality, key kind and mutability remain independently
variable. One further modifier interaction is recorded rather than hidden:
`readonly` is not permitted on a method signature (TS1024), so method cells
record `dim5Applied: false`.

**Proposed additions to the table** (D5 permits proposals, forbids removals).
None are adopted in this pass; all are recorded for the next:

1. **DIM-1 `optional + explicit null`** (`k?: T | null`) — the mixed form.
2. **DIM-3 `abstract construct signature`** (`abstract new (...) => X`).
3. **DIM-3 `callable setter`** — a `set` accessor taking a callable.
4. **DIM-4 `index-signature value type`** — the carrier reached through another
   type's index signature.
5. **DIM-4 `recursive self-referential placement`** — carrier reachable only
   through a cycle.
6. **DIM-2 `private/ES `#` name`** — outside the structural type surface today,
   but worth an explicit INEXPRESSIBLE record.

### 1.9 PERMANENT FALSIFICATIONS — H2-F1 … H2-F9

Every corruption of a committed baseline file is restored from a byte copy and
proven by **Git blob-hash equality inside a `finally`**. No falsification
errored before its intended failure.

| Proof | Result | What it establishes |
|---|---|---|
| **H2-F1(a)** | PASS | Optional callable on the real `AuthorizePreparedChangeOptions` FAILS, naming function `authorizePreparedChange`, parameter `options`, type `AuthorizePreparedChangeOptions`, member `quill`, with a `CALLABLE_REJECTED` disposition and a manifest row |
| **H2-F1(b)** | PASS | Unique-symbol-keyed callable FAILS, member path `@@[src/editing/types.ts#tideKey]`; and the corrupted manifest digest is **no longer** byte-identical to clean — the exact property F-R1-005 exploited |
| **H2-F1(c)** | PASS | Object-valued export: `marbleSurface` → `OBJECT_SURFACE`, `marbleSurface.invoke` → `CALLABLE_ROOT`, finding raised, export present in `exportedCallables` |
| **H2-F2** | PASS | The generated matrix: 890 expressible cells all rejected at the expected path with the member manifested; all 300 group E controls pass with 0 findings; 32 INEXPRESSIBLE counted and justified; per-node completeness holds for every generated node |
| **H2-F3** | PASS | Restoring the `__@` skip breaks per-node completeness **with no corruption at all**, because the real surface carries a unique-symbol member; withholding one censused member from the manifest also breaks it; both restore to 0 mismatches |
| **H2-F4** | PASS | Restoring the `signatures.length === 0` exclusion makes the object-valued export escape entirely, and the export-completeness assertion (every value export dispositioned, derived independently from the checker) FAILS |
| **H2-F5** | PASS | Same process, both directions, size preserved exactly and mtime preserved to the millisecond, **no clear call**: corruption is detected, restoration is observed |
| **H2-F6** | PASS | Manifest SHA-256, findings, disposition count and `exportedCallables` identical from the repository root and from a temporary directory, with the cache cleared after `chdir` so a **new** Program is genuinely built from the foreign cwd |
| **H2-F7(a)** | PASS | See below — the decisive proof |
| **H2-F7(b)** | PASS | Restored `__@` skip → symbol-keyed callable escapes, is **absent from the manifest**, and completeness fails |
| **H2-F7(c)** | PASS | Restored export exclusion → object-valued export escapes |
| **H2-F8** | PASS | Clean surface: 0 findings, 0 `CALLABLE_REJECTED`, 0 `UNSAFE_ESCAPE_REJECTED`; `WorkspaceBoundary` still the only reviewed terminal; `gitContext` manifested and non-rejected; 28 roots; 0 completeness mismatches |
| **H2-F9** | PASS | All of `2-F1…2-F7` and `H1-F1…H1-F7` still present in their committed suites; `useLegacyEnumeratedDiscovery` and `useLegacyNamingGate` still reproduce their historical escapes; the first auditor's exact `authorityOps` corruption still fails |

#### H2-F7 — THE DECISIVE PROOF, AND A RESULT WORTH RECORDING

Each defect is restored **separately**, through an explicitly-flagged,
default-off option — the pattern the repository already uses for
`useLegacyEnumeratedDiscovery` (2-F7) and `useLegacyNamingGate` (H1-F7).

H2-F7(a) initially **did not** produce an escape, and that is itself a finding
about the correction rather than a defect: restoring only the un-unwrapped
member classification was **not sufficient** to let the optional callable
through, because the node-level own-signature census added by §1.3
independently rejects it at `quill#call(0)`. The correction has two independent
mechanisms.

The proof therefore now records both facts explicitly:

- With **both** legacy switches (`useLegacyUnUnwrappedMemberCallableCheck` +
  `useLegacyNoOwnSignatureCensus`), reconstructing the 328f6fc member-handling
  shape faithfully, the optional callable **escapes completely** — no finding,
  no `CALLABLE_REJECTED` — while the member remains manifested, exactly as
  §1.1(a) observed. The correction is load-bearing.
- With **only** the classification switch, member-level classification does
  escape (`memberPath === "quill"` is not rejected) but the node-level census
  still catches it (`memberPath === "quill#call(0)"`). Two mechanisms must now
  fail together for this shape to get through.

### 1.10 FULL GATE — EVERY ATTEMPT RECORDED WITH HOST LOAD

| # | Command | Load at start → end (8 CPUs) | Result |
|---|---|---|---|
| 1 | `npm run check` | 12.00 → 32.06 | 68 files, **2 test failures**: `2-F2`, `2-F5` (assertion) + reporter timeouts. Investigated, root-caused, fixed — see below |
| — | `npm test` (diagnostic) | 29.15 → 34.18 | 4 failures: `2-F2`, `2-F5` (assertion), `H2-F5` (assertion), `tests/git/baseline.test.ts` (**timeout**, not assertion) |
| — | `npx vitest run tests/architecture/` | 16.69 → 19.50 | **7 files, 52 tests, all PASS** after the fixes |
| 2 | `npm run check` | 18.02 → **80.03** | 67/68 files pass; single failure `tests/git/baseline.test.ts` — `Test timed out in 5000ms`, **zero assertion failures** |
| — | `npx vitest run tests/git/baseline.test.ts` | 66.16 → 61.18 | **20/20 PASS in isolation** |
| 3 | `npm run check` | 56.68 → 56.49 | **68 files, 644 tests, ALL PASS**; `ledger:verify PASS` |

**No unexplained assertion failure remains.** The attempt-2 failure is a
5000 ms wall-clock timeout on a git-subprocess suite at host load **80**, which
passes 20/20 in isolation and produced zero assertion failures — precisely the
behavior recorded as **GAP-059**, which operator decision **D7** forbids
redesigning in this pass.

Runtime total moved **626 → 644** (+18): 12 H2-F falsifications + 6 matrix
tests. No test was removed.

#### The two assertion failures in attempt 1 — root cause and fix

`2-F2` and `2-F5` asserted `clean.findings` equals `[]` on the **real
repository** while a concurrent suite legitimately held the tree corrupted.
The two findings were `quill` and `quill#call(0)` — my own H2-F1(a) corruption,
observed mid-flight.

The race **pre-existed this pass**: `2-F2`'s clean read was the one
real-repository read in the suite that did **not** hold
`withPublicAuthoritySrcLock`, the cross-file mutex the repository already
provides for exactly this (2-F1, 2-F5, 2-F7, H1-F1 and the standing guard all
hold it). It was previously **masked** by the old cache: keyed on `repoRoot`
alone, it usually returned a stale *clean* Program. The content-hash cache of
§1.6 correctly removes that masking, so a latent test race became visible.
That is a consequence of the correction worth recording in its own right — a
cache that could not see corruption also could not see a concurrent test's
corruption.

The fix is a **strengthening, not a weakening** (operator decision D6):
`2-F2`'s clean read is wrapped in the repository's existing mutex. The
assertion `expect(clean.findings).toEqual([])` is unchanged, no probe is
deleted, no case is relaxed, and every other line of
`public-authority-surface-derived.test.ts` is untouched. This is the only edit
to any prior probe file in this pass, and it is recorded here explicitly.
`H2-F5`'s own trailing clean reads were moved inside the mutex for the same
reason, and its mtime assertion now compares the millisecond-truncated `Date`
that `utimesSync` actually round-trips.

### 1.11 DIFF SCAN — NO `src/` CHANGE IN STAGE 1

`git diff --stat HEAD -- src/` is **empty**. Stage 1 changes only:

| File | Status |
|---|---|
| `tests/architecture/public-authority-surface-analyzer.ts` | modified — the correction |
| `tests/architecture/public-authority-surface-dimensions.ts` | new — reviewed table as data |
| `tests/architecture/public-authority-surface-matrix.ts` | new — generator |
| `tests/architecture/public-authority-surface-matrix.test.ts` | new — H2-F2 |
| `tests/architecture/public-authority-surface-h2.test.ts` | new — H2-F1, H2-F3…H2-F9 |
| `tests/architecture/public-authority-surface-derived.test.ts` | modified — 2-F2 clean read placed under the existing mutex (§1.10) |
| `docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md` | this report |

### 1.12 POST-CORRECTION MEASUREMENTS

| Figure | Stage 0 baseline | After correction | Note |
|---|---|---|---|
| Public parameter roots | 28 | **28** | unchanged — root discovery was never the defect |
| `manifestedDispositionRoots` | 28 | **28** | unchanged |
| Dispositions, total | 5302 | **5366** | +64: the 8 non-callable value exports are now walked |
| `TRAVERSED_PROJECT_GRAPH` | 1520 | 1522 | +2 |
| `PRIMITIVE_TERMINAL` | 3522 | 3584 | +62 |
| `EXTERNAL_LIBRARY_TERMINAL` | 229 | 229 | unchanged |
| `REVIEWED_TERMINAL` | 31 | 31 | unchanged |
| `CALLABLE_REJECTED` | 0 | **0** | clean surface |
| `UNSAFE_ESCAPE_REJECTED` | 0 | **0** | clean surface |
| Manifest rows | 2242 | **2248** | +6 — see below |
| Findings | 0 | **0** | clean surface |
| Node completeness records | — | **911** | **0 mismatches** |
| Export dispositions | — | **24** | 16 `CALLABLE_ROOT` + 8 `PRIMITIVE_TERMINAL` |
| Type-only exports | — | **44** | reached through parameter graphs |
| Analyzer runtime | 1433 ms | **578 ms** cold / **85 ms** warm | warm includes the full content-hash validation |
| Program construction count | 1 | **1** cold, **0** warm | |
| Runtime dependencies | 0 | **0** | `typescript` remains a devDependency |

#### The +6 manifest rows: six REAL symbol-keyed members, previously invisible

The correction immediately surfaced **six real members on the live public
surface** that the analyzer had never represented:

```
createFile           | @@[src/editing/types.ts#editAuthorizationBrand]
createMultiFilePlan  | authorization.@@[src/editing/types.ts#editAuthorizationBrand]   (x2)
executeMultiFilePlan | entries.authorization.@@[src/editing/types.ts#editAuthorizationBrand]  (x2)
replaceExistingFile  | @@[src/editing/types.ts#editAuthorizationBrand]
```

These are the `unique symbol` brand on `EditAuthorization`
(`src/editing/types.ts:105,108`):

```ts
declare const editAuthorizationBrand: unique symbol;

export type EditAuthorization = {
  readonly [editAuthorizationBrand]: true;
  ...
```

**No STOP AND REPORT condition was triggered.** The contract's rule fires when
unconditional member iteration surfaces a real **callable** on the clean public
surface other than the seeded ones. This member's type is the boolean literal
`true` — a `PRIMITIVE_TERMINAL`, correctly non-rejected, with the clean surface
still at 0 findings. But it is worth stating plainly: F-R1-005 was not
hypothetical. There was already a symbol-keyed member on the real public
authority surface that the guard could not see, and H2-F8 now pins it.

### 1.13 CHECKLIST LINE 9 — ONE DELIBERATE, RECORDED DEVIATION

Checklist line 9 asks whether any `startsWith` / regex / equality test on a
property name remains, and requires **NO**. After the correction the analyzer
contains, **on the default path**, exactly one such test:

```ts
function mechanismNameHit(name: string): boolean {
  return MECHANISM_NAME.test(name);
}
```

It is **kept deliberately**, and the reason is recorded rather than glossed:

- **Amendment 1 §4 D mandates it.** Its second bullet requires the guard to
  fail on an "operation / adaptor / bindings / executor / loader / reader /
  writer / verifier shape" — a rule that is inherently about the member's name
  and is listed *separately* from "a user-defined call signature". Deleting it
  would remove a detection mechanism a frozen amendment requires, contradicting
  checklist line 41 and this contract's own "NO new detection vocabulary —
  Amendment 1 §4 D governs".
- **It is ADDITIVE, never a gate.** It can only *add* a rejection. It never
  skips, gates or suppresses traversal, manifesting or classification. The
  defect class this pass exists to eliminate is name-based **skip authority**,
  and of that there is now none.
- **D6 forbids weakening probes.** DIM-6 of the reviewed table varies mechanism
  keyword naming as a live dimension, and the historical Phase 3 instances
  (`fsOps`, `targetOps`) are name-detected.

Every other name-shaped test in the file is either a **file path** test
(`defaultIsProjectSourceFile` — the R2-H1 external ownership boundary, lines
360/364/369), a **reviewed-terminal registry hygiene** test (lines 744–745,
fail-closed), or lives behind a default-off legacy falsification flag
(`useLegacySymbolKeyedMemberSkip` line 1213, `useLegacyEnumeratedDiscovery`
line 1363, `useLegacyNamingGate` line 1685). None of them can skip a member on
the default path.

**Answer to line 9: NO name-based skip remains. One additive, Amendment-1-
mandated name rule remains, deliberately, and is flagged here for the auditor.**
