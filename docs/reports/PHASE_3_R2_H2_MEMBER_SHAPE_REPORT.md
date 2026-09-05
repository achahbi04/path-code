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
