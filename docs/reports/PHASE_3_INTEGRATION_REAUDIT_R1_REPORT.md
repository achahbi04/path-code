# PATH CODE — PHASE 3 SAFE EDITING ENGINE
# INDEPENDENT FULL RE-AUDIT R1 (STAGE 3) — RERUN AFTER PHASE 3-R2-H1

Governing instruction: `docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md`
Stage 3 (Executor B only).

This report supersedes the working-tree content of the two earlier Stage 3
attempts at this canonical path. Both earlier versions remain immutable in Git
and are cited below. Neither is rewritten, amended, squashed, or dropped.

---

## AUDITOR PROVENANCE

```text
executor product:                       Claude Code (claude-opus-5, 1M context)
session:                                new session; product exposes no
                                        stable user-visible session identifier
this executor session prior writes to
  Phase 3-R1 chain:                     NONE
hardening execution transcripts
  received:                             NO
R1 Stage 0–2 execution transcripts
  received:                             NO
failed-auditor substantive transcripts
  received:                             NO
R2 / R2-H1 implementation transcripts,
  execution summary, Cursor summary,
  prior auditor reasoning, or desired
  conclusion received:                  NO
repository checkpoint received:         b2531ce868b27ca4b47f5a8bde835cd21b80c441
other inputs received:                  the Stage 3 dispatch brief; the
                                        repository at the above checkpoint in
                                        its entirety (contracts, masters,
                                        amendments, reports, ledgers, source,
                                        tests) as permitted evidence
prior failed-attempt metadata received: none — operator stated there are no
                                        prior Stage 3 attempts from the
                                        b2531ce checkpoint
operator attestation:                   Achahbi, 5 September 2026
report block presence admissibility:    REPOSITORY_RECORDED
independence claim admissibility:       ASSERTED — not mechanically proven;
                                        see GAP-055
```

No forbidden input class under contract §3.1 was present in this executor's
context. No context-contamination stop was triggered. This session performed no
prior write to this repository before the single Stage 3 commit recorded in §14.

---

## 0. BASELINE GATE

| Check | Required | Observed | Verdict |
|---|---|---|---|
| `git rev-parse HEAD` | `b2531ce8…c21b80c441` | `b2531ce868b27ca4b47f5a8bde835cd21b80c441` | PASS |
| `git status --porcelain` | clean | empty | PASS |
| `npm run ledger:verify` | PASS | `ledger:verify PASS at b2531ce868b27ca4b47f5a8bde835cd21b80c441` | PASS |
| Runtime test total | verify, do not assume | **626 passed (626)** — re-derived, matches 626 | PASS |
| Test-file total | verify, do not assume | **66 passed (66)** — `find tests -name '*.test.ts' \| wc -l` = 66 | PASS |
| Runtime dependencies | 0 | `package.json` has **no** `dependencies` key; only `devDependencies` | PASS |
| Phase 4 | absent | no `docs/PHASE_4*`, no Phase 4 report, no Phase 4 commit | PASS |
| R1 Stage 4 closure-reconciliation artifact | absent | `docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md` does not exist | PASS |
| R1 phase promotion | absent | `safe-editing` derives `IMPLEMENTED`, not `PHASE_VERIFIED` | PASS |

### Capability states — derived mechanically

Derived via `deriveAllCapabilityObservations(getCanonicalCapabilityLedger(),
getCanonicalGapLedger(), verifyLedgers(...).verification)`; `verifyLedgers` ok = true.

| Capability | Required | Derived | Verdict |
|---|---|---|---|
| `edit-contracts` | PASS_FROZEN | PASS_FROZEN | PASS |
| `existing-file-replacement` | PASS_FROZEN | PASS_FROZEN | PASS |
| `safe-file-creation` | PASS_FROZEN | PASS_FROZEN | PASS |
| `multi-file-coordination` | PASS_FROZEN | PASS_FROZEN | PASS |
| `safe-editing` | IMPLEMENTED, not PHASE_VERIFIED | IMPLEMENTED | PASS |
| `repository-intelligence` | PHASE_VERIFIED | PHASE_VERIFIED | PASS |
| `foundation-kernel` | PHASE_VERIFIED | PHASE_VERIFIED | PASS |

### Gap states — derived mechanically

| Gap | Required | Derived | Verdict |
|---|---|---|---|
| GAP-051 | OPEN | OPEN / BLOCKING_INVARIANT | PASS |
| GAP-052 | OPEN | OPEN / BLOCKING_INVARIANT | PASS |
| GAP-053 | CLOSED | CLOSED — closedBy `2208dfa9…` | PASS |
| GAP-054 | CLOSED | CLOSED — closedBy `7f4267d5…` | PASS |
| GAP-055 | OPEN | OPEN / NON_BLOCKING_LIMITATION | PASS |
| GAP-056 | OPEN | OPEN / NON_BLOCKING_LIMITATION | PASS |
| GAP-057 | CLOSED | CLOSED — closedBy `c6b922c8dc4950e7f0da8ff34fceaee132495c76` | PASS |
| GAP-058 | OPEN | OPEN / NON_BLOCKING_LIMITATION | PASS |
| GAP-059 | OPEN | OPEN / NON_BLOCKING_LIMITATION | PASS |
| GAP-005 | — | ACCEPTED_PERMANENT / NON_BLOCKING_LIMITATION | recorded |

The repository does not materially differ from the dispatched checkpoint. No
repair, reset, restore, stash, normalization, or checkout was performed.

---

## 1. R2-H1 EVIDENCE-INTEGRITY CHECKS — RE-DERIVED, NOT ACCEPTED

None of these was accepted because the report asserts it. Each was recomputed.

| Check | Required | Observed | Verdict |
|---|---|---|---|
| R2-H1 contract artifact SHA-256 | `989950f0…ab3c6e58` | `989950f0b2541182d789a228527e6ae8174f5dab88a1237461d98646ab3c6e58` | PASS |
| Stage 1 implementation/evidence commit | `c6b922c8…495c76` | `c6b922c8dc4950e7f0da8ff34fceaee132495c76` exists | PASS |
| Stage 2 linkage commit | `b2531ce8…b80c441` | `b2531ce868b27ca4b47f5a8bde835cd21b80c441` = HEAD | PASS |
| Stage 1 ancestor of Stage 2 | YES | `git merge-base --is-ancestor` → true; exactly one commit between | PASS |
| Traversal report byte-identical at Stage 1 and Stage 2 | YES | same blob `26b8f37c734cda99c1d0a59cb2f8ee7b1627d446` at both | PASS |
| Traversal report full-file SHA-256 at both commits | `559a7ff4…faa30300` | `559a7ff424c3cf3bf026eac41849f753fad84bc89fc7a33c07fb2daffaa30300` at both | PASS |
| GAP-057 closes against the immutable Stage 1 commit/report | YES | `closedByCommit = c6b922c8…495c76` (an ancestor of HEAD), `closureEvidence = docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md`; not self-referential, not future | PASS |

### R2-H1 `src/**` changed paths — exact enumeration

`c6b922c` (Stage 1) changed paths:

```text
docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md
tests/architecture/public-authority-reviewed-terminals.ts
tests/architecture/public-authority-src-lock.ts
tests/architecture/public-authority-surface-analyzer.ts
tests/architecture/public-authority-surface-h1.test.ts
tests/architecture/public-authority-surface.test.ts
```

**Zero** `src/**` paths at Stage 1.

`b2531ce` (Stage 2) changed paths:

```text
docs/GAP_LEDGER.md
src/selfobs/capability-ledger-data.ts
src/selfobs/citation-helpers.ts
src/selfobs/gap-ledger-data.ts
```

All three `src/**` paths lie inside the canonical self-observation
ledger/citation surface explicitly required by Stages 0/2. **No R2-H1 `src/**`
path outside that surface exists.** PASS.

### Disposition figures — independently reproduced, not carried forward

Reproduced by calling the canonical analyzer directly from a standalone script
(cwd = repository root, `src` lock held, program cache cleared):

| Quantity | R2-H1 report claim | This auditor's independent reproduction | Match |
|---|---|---|---|
| Discovered public roots | 28 | **28** | yes |
| Manifested disposition roots | 28 | **28** | yes |
| Disposition nodes | 5302 | **5302** | yes |
| TRAVERSED_PROJECT_GRAPH | 1520 | **1520** | yes |
| PRIMITIVE_TERMINAL | 3522 | **3522** | yes |
| EXTERNAL_LIBRARY_TERMINAL | 229 | **229** | yes |
| REVIEWED_TERMINAL | 31 | **31** | yes |
| Manifest rows | 2242 | **2242** | yes |
| Findings | 0 | **0** | yes |
| Program construction count (cold) | 1 | **1** | yes |

The R2-H1 report's *counts* are truthful. Its claim that the walker now has no
silent skip-authority path is **not** — see §6 and §9.

---

## 2. PRIOR STAGE 3 ATTEMPTS — BOTH IMMUTABLE VERSIONS INSPECTED

Both historical versions were read from Git directly; the working-tree copy was
not treated as a stand-in for either.

| Attempt | Commit | Report blob | Report SHA-256 | Result | Finding |
|---|---|---|---|---|---|
| 1 | `ecda537f87ca63584fffe46bba67c6009def4219` | `40d8bf5edf6e7dff6a60fc11966c0b0791b2db67` | `2d4005d293304f1681eb5c47c1b7e6cb30d93dea198816fd8a5f39a73356866a` | NOT COMPLETE | **F-R1-001** — standing guard did not represent `AuthorizePreparedChangeOptions`; A-F19(b) `authorityOps` produced no failure (612/612 PASS) |
| 2 | `c60c78254ce273235921694faac57ec5e4a30d5f` | `365bb1c873bffb0c9e26d0f858fdc5a6a6c1eea3` | `c4da0a50e27a9e94b8c4a04a59026bc70c7327f68a12096eeab3db29a960f318` | NOT COMPLETE | **F-R1-003** — discovery was derived but recursive traversal stayed gated on `parameterName === "options"` / `/Options$/`; 24 of 28 public parameter roots had no member coverage |

The working-tree version at the audited checkpoint is byte-identical to the
`c60c782` version (`c4da0a50…a960f318`), confirming attempt 2's report is the
one this attempt supersedes in the working tree. Prior report blob at `c60c782`
recorded above before writing.

Both prior findings were corrective inputs to R2 (`4aadb06`/`8520ab9`) and
R2-H1 (`c6b922c`/`b2531ce`) respectively. This attempt re-derives the whole
surface rather than confirming those corrections.

---

## 3. ORIGINAL PHASE 3 INTEGRATION AUDIT — FULL RE-ESTABLISHMENT

`tests/integration/phase3-safe-editing-audit.test.ts` — **21/21 PASS**, live at
this checkpoint (not carried forward from any prior COMPLETE):

| Dimension | Evidence | Result |
|---|---|---|
| B1 read/write/re-observe fingerprint bridge | bridges Phase 3 after-state fingerprints to fresh Phase 2B observations | PASS |
| B2 authored mutation → fresh re-observation | admits created bytes into knowledge only after re-observation | PASS |
| B3 stale snapshot / stale edit / fresh edit | ties Phase 2 STALE_CONTENT to Phase 3 stale refusal, then accepts a fresh edit | PASS |
| B4 Git point-in-time state | keeps G0 immutable while G1 reports worktree modification | PASS |
| B5 deny-path enforcement | moment 1 blocks admission/preparation/search; moment 2 refuses 3B/3C/3D without consuming auth | PASS |
| B6 action-class enforcement | EDIT disable and CREATE_FILE disable each block independently | PASS |
| B7 ConfigFailure fail-closed + ABSENT success | malformed config fails closed across load/inventory/3B/3C/3D; ABSENT permits | PASS |
| B8 partial multi-file plan + fresh re-observation | records COMMITTED/failed/NOT_ATTEMPTED honestly and matches fresh inventory | PASS |
| Recovery shape 1 — 3B PRECOMMIT | original intact, temp cleaned | PASS |
| Recovery shape 2 — 3B COMMITTED_FAILURE | commit reached, no rollback | PASS |
| Recovery shape 3 — 3C PREPUBLICATION | target unpublished, candidate cleaned | PASS |
| Recovery shape 4 — 3C COMMITTED_FAILURE | published target remains without rollback | PASS |
| Recovery shape 5 — 3D PARTIAL | prior commits remain; later not attempted; no rollback | PASS |
| Write boundary (mechanical) | names exactly one authorized production write module | PASS |
| Persistence / residue scan | no Path Code residue after successful replace+create | PASS |
| D3 half-citation probe (R1-C) | declaration-only evidence cannot yield PHASE_VERIFIED | PASS |
| D3 live canonical state | safe-editing derives IMPLEMENTED without phaseAuditEvidence | PASS |
| D3 leaf capabilities | edit-contracts and corrected trio PASS_FROZEN | PASS |

### SE-001 … SE-020 and P3D obligations

SE and P3D obligations are carried in the canonical Capability Ledger as
`obligationCitation` records (`inDocument` / `atCommit` / `exactEvidenceNeedle`
/ `admissibility`). `npm run ledger:verify` mechanically resolves every needle
in the cited document at the cited commit and returned
`ledger:verify PASS at b2531ce868b27ca4b47f5a8bde835cd21b80c441`.

Distinct obligation ids carried and citation-verified: **SE-001, SE-002,
SE-003, SE-004, SE-005, SE-008, SE-009, SE-010, SE-011, SE-012, SE-013,
SE-015, SE-016, SE-017, SE-018, SE-019, SE-020** and **P3D-002, P3D-009,
P3D-015**.

SE-006 (denied paths never mutated), SE-007 (no escape / no intentional symlink
mutation) and SE-014 (no durable hidden Path Code state) are declared in
`docs/PHASE_3_SAFE_EDITING_MASTER.md` and are exercised behaviourally by B5,
the write-boundary check and the persistence/residue scan above, but carry no
`obligationCitation` record of their own in the Capability Ledger. This is
recorded as a NOT VALIDATED item in §12 rather than asserted as
SATISFIED_PHASE_WIDE.

### Phase 3B-H1 / Phase 3C-H1 / Phase 3D

`tests/editing/*` and `tests/ledger/two-commit-freeze-scope.test.ts` execute
within the full run (§11). The Phase 3B relink probe accepts `TWO_COMMIT_FREEZE`
with `src/editing/` scope for `ad85c9f → 2b63531`. All four mutation component
capabilities remain PASS_FROZEN (§0).

### Compile-time negative sweep

`npm run typecheck` (`tsc -p tsconfig.json --noEmit`) exit 0 and `npm run build`
(`tsc -p tsconfig.build.json`) exit 0 at the clean checkpoint, and again under
every temporary corruption in §7/§9 (recorded per corruption).

---

## 4. PUBLIC AUTHORITY-SURFACE AUDIT — P1 THROUGH P14

| ID | Verdict | Basis |
|---|---|---|
| P1 | PASS | Entry points enumerated by TypeChecker from `src/editing/index.ts`: 16 exported callables, 12 signatures carrying parameters, 28 parameter roots. No hardcoded list. |
| **P2** | **FAIL** | Every public parameter root is manifested and dispositioned, and the member graph is now traversed for all 28 roots (F-R1-003 is fixed). But the member graph is **not complete**: optional callable members and symbol-keyed members are omitted from classification, and one is omitted from the manifest entirely. See **F-R1-004** and **F-R1-005** in §9. |
| **P3** | **FAIL** | An unapproved authority/mechanism-substitution parameter member *can* exist undetected on the real public surface. Demonstrated live on `AuthorizePreparedChangeOptions` in §7.1-B and §7.1-C. |
| P4 | PASS | `tests/editing/public-authority-malicious.test.ts` 3/3 PASS: `replaceExistingFile`, `createFile`, `executeMultiFilePlan` each ignore hostile injected `fsOps`/`targetOps` and mutate through production FS. |
| P5 | PASS | `replaceExistingFile` public wrapper reads no `options.fsOps` and no `arguments[`. |
| P6 | PASS | `createFile` public wrapper reads no `options.fsOps` and no `arguments[`. |
| P7 | PASS | `executeMultiFilePlan` public wrapper reads no `options.targetOps` / `options?.targetOps` and no `arguments[`. |
| P8 | PASS | `authorizePreparedChange` traverses the same derived path; no wrapper seam. |
| P9 | PASS | Barrel exports no `fsOps`/`targetOps`/`WithDependencies`/`*FsOps`/`production*Fs` name; A-F18 (§9.4) proves the check fails when an internal module is exported. |
| P10 | PASS | See §8.1 — all three unsupported subpath imports rejected `ERR_PACKAGE_PATH_NOT_EXPORTED`. |
| P11 | PASS | Standing guard is inside `npm run check` via `npm run test`. `PUBLIC_AUTHORITY_APPROVED_EXCEPTIONS` is `Object.freeze([])` — **verified empty**, and wildcard/incomplete entries are structurally rejected (§5.3). |
| **P12** | **FAIL** | `any`/`unknown`/rest/index escapes are rejected, but a *callable* escape narrowed through an optional or symbol-keyed member reaches authority-bearing options with no approval and no evidence. Same root as F-R1-004 / F-R1-005. |
| P13 | PASS | Audit tests using internal seams delegate to real operations; no fabricated committed/success evidence observed in the audit suites read. |
| P14 | PASS | The first audit's public-seam use is removed and documented in the hardening report; the barrel regex bans remain as supplementary checks only. |

---

## 5. ANALYZER RE-DERIVATION — §6.1 THROUGH §6.9

Files read in full: `tests/architecture/public-authority-surface-analyzer.ts`
(1436 lines), `public-authority-surface.test.ts` (233),
`public-authority-surface-derived.test.ts` (588),
`public-authority-surface-h1.test.ts` (791),
`public-authority-approved-exceptions.ts` (23),
`public-authority-reviewed-terminals.ts` (66),
`public-authority-src-lock.ts` (47).

### 5.1 COMPLETE STOP-PATH / SKIP-AUTHORITY ENUMERATION

Every site at which a public root or reached node can return early, stop
descending, become terminal, suppress a finding, or be omitted. Line numbers are
`tests/architecture/public-authority-surface-analyzer.ts`.

| # | Site | Predicate / branch | Category | Verdict |
|---|---|---|---|---|
| 1 | 1271 | `if (signatures.length === 0) continue;` — exported symbol has no call signature | **E** | **FINDING F-R1-006** — object-valued exports carrying authority parameters are dropped with no root, no manifest row, no disposition. No active leak at this HEAD (barrel exports only functions and types). |
| 2 | 1349–1354 | `deepInspect = !opts.useLegacyNamingGate \|\| parameterName === "options" \|\| /Options$/.test(typeName) \|\| hasUserDefinedCallSignatures(paramType)` | D (flag-gated) | PASS — with the default `useLegacyNamingGate === false` the disjunction is unconditionally true. Name predicates are unreachable on the standing path. |
| 3 | 630–632 | `if (ctx.visited.has(pathKey)) return;` — `pathKey = identity@typePath#memberPath` | **D** | PASS — exact-occurrence dedup only. The first occurrence already carries its disposition; no distinct occurrence identity is lost (verified: 0 occurrences with duplicate or conflicting dispositions across all 5302). |
| 4 | 633–638 | `if (ctx.traversalStack.has(typeVisitKey))` → push `TRAVERSED_PROJECT_GRAPH`, return | **D** | PASS — cycle break that still emits an occurrence disposition; never marks a type safe for being seen before. |
| 5 | 668–682 | `any` / `unknown` → `UNSAFE_ESCAPE_REJECTED` + finding, return | **C** | PASS — rejected terminal, emits a finding. |
| 6 | 684–693 | type parameter with constraint / with default → `TRAVERSED_PROJECT_GRAPH`, descend into constraint/default | D | PASS |
| 7 | 694–709 | unconstrained type parameter → `UNSAFE_ESCAPE_REJECTED` + finding, return | **C** | PASS |
| 8 | 712–714 | `isPrimitiveType(type)` → `PRIMITIVE_TERMINAL`, return | **A** | PASS — scalar/literal/enum terminal, `NonPrimitive` (`object`) explicitly excluded. |
| 9 | 720–727 | reviewed-terminal identity hit and not anonymous → inspect type arguments, inspect alias union constituents, then `REVIEWED_TERMINAL`, return | **A** | PASS — constituents inspected **before** the terminal is granted; keyed from resolved declaration identity; frozen-contract citation present. |
| 10 | 729–752 | not project-owned and not anonymous → inspect type args, alias constituents, union/intersection parts, array/tuple elements, then `EXTERNAL_LIBRARY_TERMINAL`, return | **A** | PASS — project-owned type arguments/elements are inspected first (§5.6). |
| 11 | 753–757 | not project-owned, anonymous, declaring file external → `EXTERNAL_LIBRARY_TERMINAL`, return | A | PASS in practice — no type-argument inspection on this branch, but an *anonymous* external object type carries no project-owned type arguments reachable at this HEAD. Recorded as a residual observation, not a finding. |
| 12 | 771–773 | project union/intersection → `TRAVERSED_PROJECT_GRAPH`, walk parts, return | D | PASS |
| 13 | 777–791 | project array/tuple → walk elements, `TRAVERSED_PROJECT_GRAPH`, return | D | PASS |
| 14 | 592–597 | union/intersection constituent loop skips `Undefined`/`Null` parts | A | PASS — nullish constituents carry no structure. |
| 15 | **856–858** | `const propName = prop.getName(); if (propName.startsWith("__@")) continue;` | **E** | **FINDING F-R1-005** — symbol-keyed member and its entire sub-graph dropped: no manifest row, no disposition, no finding. |
| 16 | **954** | `if (nestedName.startsWith("__@")) continue;` — same predicate on the nested anonymous-literal loop | **E** | **FINDING F-R1-005** (second site). |
| 17 | 873–874 | `const propType = checker.getTypeOfSymbol(prop); if (hasUserDefinedCallSignatures(propType))` | **E** | **FINDING F-R1-004** — `propType` is *not* unwrapped. For an optional member it is `T \| undefined`; `getCallSignatures()` on a union returns `[]`, so a callable member is silently classified `TRAVERSED_PROJECT_GRAPH`. |
| 18 | 921–930 | `if (rejected) push CALLABLE_REJECTED` then branch to `walkType` only when project / union / anonymous / `!rejected` | **C** | PASS — rejected terminals always carry a finding. |
| 19 | 383–410 | `isApproved(...)` suppresses a finding | **B** | PASS — exact `functionName` + `parameterName` (+ exact `memberPath`) only; wildcards rejected; suppresses the finding only, never traversal. Registry is empty, so no suppression occurs. |
| 20 | 1060, 1084 | `continue` inside `legacyEnumeratedFindings` | falsification-only | PASS — reachable only via `useLegacyEnumeratedDiscovery: true` (2-F7). |

**Budgets, error handling, memoization across mutation:**

- No depth, node, time, or traversal budget exists anywhere on the canonical
  path — grep for `maxDepth`/`budget`/`limit`/`Date.now`/`setTimeout` in the
  walker returns nothing. There is therefore no budget that can silently
  truncate and return clean.
- Exactly one `try` (642) with a `finally` that pops the traversal stack. There
  is **no `catch`** anywhere in the analyzer, so no catch-and-continue path can
  drop a graph.
- No `process.env`, `globalThis`, or `process.argv` read anywhere in the
  canonical analyzer path, the reviewed-terminal registry, the approved-exception
  module, or the src lock. The legacy gates cannot be switched on by environment
  variable, options default, or fixture ordering.

Three category-E stop paths were found. They are the substance of §9.

### 5.2 DISPOSITION COMPLETENESS AND ACCOUNTING

Independently reproduced (figures in §1). Occurrence identity used:
`exportName # signatureIndex # parameterIndex # parameterName # typePath #
memberPath # canonicalTypeIdentity`.

| Assertion | Observed | Verdict |
|---|---|---|
| discovered roots == manifested roots | 28 == 28, key sets identical, no key in one and not the other | PASS |
| every root has exactly one root disposition | 0 duplicate discovered-root keys | PASS |
| every reached occurrence has exactly one disposition | 0 occurrences with duplicate same-disposition; 0 with conflicting dispositions | PASS |
| sum of disposition counts == total | 1520 + 3522 + 229 + 31 = **5302** = total | PASS |
| repeated roots used by different functions separately manifested | e.g. `WorkspaceBoundary` appears as 31 distinct REVIEWED_TERMINAL occurrences across `authorizePreparedChange`, `createFile`, `createMultiFilePlan`, `executeMultiFilePlan`, `prepareCreateFile`, `prepareModifyExistingFile`, `replaceExistingFile`, `validatePreparedBatchBounds` | PASS |
| overloads separately manifested | signature index is part of every key; 12 signatures across 16 callables | PASS |
| cycles terminate without deleting later occurrences | traversal-stack branch emits an occurrence; 5302 total with 0 loss | PASS |
| every rejected disposition corresponds to a finding, and vice versa | 0 rejected dispositions and 0 findings at clean HEAD; under the §7.1-A corruption, 2 findings ↔ 2 rejected-linked occurrences | PASS |
| no disposition value means "skipped"/"ignored"/"not inspected" | closed six-value vocabulary; no seventh value | PASS |
| **occurrences absent from the manifest entirely** | **symbol-keyed members are absent** — see F-R1-005 | **FAIL** |

**Removal falsification (required):** suppressing one root disposition
occurrence (`authorizePreparedChange#0#0#prepared`) from the analyzer output
reduced manifested roots 28 → 27 and the completeness proof
(`discovered == manifested`) returned **false** — i.e. **the proof failed as
required**. Restoring the unmodified analysis restored equality (28 == 28,
`true`). PASS.

Note the accounting's blind spot: because F-R1-005 removes the member from the
*manifest* as well as the disposition list, `discovered == manifested` remains
trivially true. The completeness proof cannot detect that class of omission.

### 5.3 REVIEWED TERMINAL REGISTRY

Count derived from source: **1 entry** (not assumed from the report).

| Field | Value |
|---|---|
| canonical identity | `src/domain/workspace.ts#WorkspaceBoundary#interface` |
| declarationPath / symbolName / declarationKind | `src/domain/workspace.ts` / `WorkspaceBoundary` / `interface` |
| reason | `FROZEN_FOUNDATION_OBJECT` |
| governing contract | census CALLER_NARROWING_BOUND; Amendment 1 §4 D; R2-H1 §1.4 |
| generic policy | `SEMANTICALLY_CLOSED` |
| falsification | H1-F5 |

| Check | Observed | Verdict |
|---|---|---|
| key derived from resolved declaration/symbol identity | `reviewedTerminalIdentity()` = repo-relative path + symbol + declaration kind, built in `canonicalTypeIdentity` after `resolveAlias` | PASS |
| not a type-name / parameter-name / regex / suffix / module-wide match | no pattern matching in the lookup; a `Map` keyed on the full identity | PASS |
| resolved declaration really matches that identity | 31 REVIEWED_TERMINAL occurrences, all with `canonicalTypeIdentity === src/domain/workspace.ts#WorkspaceBoundary#interface` | PASS |
| structural reason is contract-permitted | `FROZEN_FOUNDATION_OBJECT` ∈ permitted set | PASS |
| generic policy truthful; no uninspected type parameter | `WorkspaceBoundary` is non-generic; type arguments and alias constituents are inspected before the terminal is granted regardless | PASS |
| wildcard / glob / anonymous / module-wide entries rejected | `declarationPath: "src/domain/*.ts"` → rejected; `symbolName: "Workspace*"` → rejected; `symbolName: "__type"` → rejected; `symbolName: ""` → rejected; each returns the single finding `reviewed terminal wildcard/pattern/anonymous entries are forbidden` | PASS |

**Per-entry removal falsification (run by this auditor, not carried forward):**
analyzing the real repository with `reviewedTerminals: []` produced **31
findings**, each of the form `unreviewed user-defined call signature on member
…workspace.canonicalize`, naming the function, type (`WorkspaceBoundary`) and
member path; `REVIEWED_TERMINAL` dispositions dropped 31 → 0. Restoring the
default registry returned findings 0 and dispositions 5302. PASS.

**Identity collision proof:** a second `export interface FerruleBound` declared
in a different module, with the same exported symbol name as a registered
reviewed terminal, did **not** inherit reviewed status — `REVIEWED_TERMINAL`
dispositions = 0 and its callable member was rejected. PASS.

**Re-export proof:** a named `export type { … } from` alias of the *exact*
reviewed symbol resolved to the same reviewed identity and remained
`REVIEWED_TERMINAL` with 0 findings, as permitted. PASS.

### 5.4 COMPOSITION WITH THE REVIEWED TERMINAL — REVIEW DOES NOT PROPAGATE

Each composed type carries an unreviewed callable member (`plinth`) and was run
live against a registered reviewed terminal:

| Composition | Findings | Names caller-defined/composed type + member | Verdict |
|---|---|---|---|
| interface extension | 2 (`plinth`, and `quill` re-surfaced on the new identity) | yes — `CrateBound` | PASS |
| intersection with additional structure | 1 | yes | PASS |
| alias plus union structure | 1 | yes | PASS |
| project-defined generic wrapper | 1 | yes — `Lattice` | PASS |
| array of composed | 2 | yes | PASS |
| tuple element composed | 2 | yes | PASS |
| nested object holding composed | 1 | yes — `inner.plinth` | PASS |
| external generic container `Promise<composed>` | 1 | yes | PASS |
| exact alias, no added structure | 0 | retains reviewed identity, as permitted | PASS |

Review does not propagate to any new structure. No composition inherited
reviewed status. PASS.

### 5.5 CACHING, SOURCE LOCKING, AND FRESHNESS

| Property | Observed |
|---|---|
| mechanism | module-level `const programCache = new Map<string, ts.Program>()` (line 154) |
| scope | module lifetime — i.e. the whole test-worker process |
| key | `repoRoot` string only |
| invalidation source | **none** — no path, size, mtime, content-hash, or Program-age check. The only invalidation is an explicit `clearRepositoryTypeScriptProgramCache()` call |
| what is cached | the `ts.Program` (and therefore the whole resolved type graph). Findings/manifests are not themselves cached |
| supplied `program` | intentionally point-in-time; `programConstructionCount` reports 0 |
| repeated roots | memoized per-walk by `visited` (occurrence-scoped `Set`), not across invocations |
| cross-file mutex | `withPublicAuthoritySrcLock` — an `openSync(..., "wx")` lock file under `node_modules/.cache`, 300 s deadline |

**Same-process warm-cache falsification, both directions.** Corruption applied
to `AuthorizePreparedChangeOptions` with **identical byte size** (9730 → 9730)
and the **original mtime restored** via `utimesSync`, so the proof cannot
depend on size or mtime:

| Step | Cache cleared | Dispositions | Interpretation |
|---|---|---|---|
| 1. clean, warm the cache | yes | 5302 | baseline |
| 2a. clean → dangerous | **no** | **5302 (stale clean)** | the cached Program does not see the mutation |
| 2b. clean → dangerous | yes | **5025** | a fresh Program does see it |
| 3a. dangerous → clean | **no** | **5025 (stale dirty)** | stale in the other direction too |
| 3b. dangerous → clean | yes | **5302** | restored clean state observed in the same process |

The cache is stale in **both** directions and has no invalidation source. The
standing guard and the permanent proofs do call
`clearRepositoryTypeScriptProgramCache()` before analyzing (verified in
`public-authority-surface.test.ts:125` and in the derived/H1 suites), so the
guard as shipped builds and uses current source. **The guard's freshness rests
entirely on a manual call convention, not on an invalidation mechanism.** This
is recorded as an observation in §9.4 rather than a finding, because the
standing guard does clear and no stale clean result is used by it.

**Additional determinism observation (not a finding).** The canonical analyzer
is sensitive to `process.cwd()`. Invoked with cwd outside the repository,
`Uint8Array` fails to resolve and degrades to `any`, yielding 2 extra
`UNSAFE_ESCAPE_REJECTED` findings and 5286 rather than 5302 dispositions. The
degradation is strictly **fail-closed** (more rejections, never fewer), and
Vitest always runs with cwd = repository root, so it is not skip authority. It
is recorded because it initially produced two divergent baselines during this
audit and both were chased to ground before any conclusion was drawn.

### 5.6 NAME, SUFFIX, PATH, AND KEYWORD INDEPENDENCE

| Check | Observed | Verdict |
|---|---|---|
| legacy naming predicate off by default | `useLegacyNamingGate = options.useLegacyNamingGate === true` — strict, default false | PASS |
| unreachable from the standing guard | `public-authority-surface.test.ts` never passes the flag | PASS |
| unreachable from `npm run check`'s production guard path | only `public-authority-surface-h1.test.ts:719,742` (H1-F7) and `…derived.test.ts:508,540,558` (2-F7) pass the flags | PASS |
| not activated by env var / options default / fixture ordering | no `process.env`/`globalThis` in the canonical path | PASS |
| decisions on parameter name | only inside the `useLegacyNamingGate` disjunction | PASS |
| decisions on type name / suffix | `/Options$/` only inside the same disjunction | PASS |
| decisions on function name | none | PASS |
| decisions on source filename/path | only `defaultIsProjectSourceFile` ownership (repo root vs `node_modules`/`typescript/lib`) — an ownership boundary, not a skip list | PASS |
| public type/function manifest list | none on the derived path; `legacyEnumeratedFindings` is falsification-only | PASS |
| member-name heuristic used only as supplementary rejection | `MECHANISM_NAME` only ever **adds** a finding (`rejected = true`); it never permits or skips | PASS |
| **member-name heuristic used to skip** | **`propName.startsWith("__@")` skips** — F-R1-005 | **FAIL** |

**Keyword-blind adversarial case (auditor-chosen).** Function `tallyParcel`,
parameter `parcel`, type `ParcelShape`, outer member `envelope`, callable member
`quill` — none contains `ops`, `operation`, `adapter`, `adaptor`, `executor`,
`execute`, `loader`, `reader`, `writer`, `verifier`, `authority`, `binding`,
`callback`, `handler`, `command`, `action`, `tool`, `service`, `client`, or
`provider`, and none matches `MECHANISM_NAME`. Rejected with
`unreviewed user-defined call signature on member envelope.quill`. Rejection was
caused by the call-signature shape, not by any name. PASS.

### 5.7 ORIGINAL FOUR OPTIONS SURFACES

All four travel the same default derived path:

| Type | Reached from exported callable | Root disposition | Members manifested | Legacy enumeration | Name-gate | Approved exception |
|---|---|---|---|---|---|---|
| `ReplaceExistingFileOptions` | yes | `TRAVERSED_PROJECT_GRAPH` | `gitContext` | none | none | none |
| `CreateFileOptions` | yes | `TRAVERSED_PROJECT_GRAPH` | `gitContext` | none | none | none |
| `ExecuteMultiFilePlanOptions` | yes | `TRAVERSED_PROJECT_GRAPH` | `gitContext` | none | none | none |
| `AuthorizePreparedChangeOptions` | yes | `TRAVERSED_PROJECT_GRAPH` | `gitContext` | none | none | none |

PASS. (F-R1-001's omission is genuinely fixed; F-R1-004/F-R1-005 concern *what
is done with* the members once reached.)

### 5.8 EXTERNAL CONTAINERS AND PROJECT-OWNED CONTENT

Project-owned danger cannot hide inside an external container. Each case placed
a callable-bearing project type inside the container:

| Container | Findings | Verdict |
|---|---|---|
| `Promise<T>` | 1 — names `quill` | PASS |
| `readonly [number, T]` tuple | 2 | PASS |
| `ReadonlyMap<string, T>` | 1 | PASS |
| `ReadonlyArray<Promise<T>>` nested wrapper | 2 | PASS |
| `ReadonlyArray<T>` / `Array<T>` | covered by the real surface (`entries`, `preparedChanges` roots) and by 5.4 | PASS |
| union / intersection constituents | 5.4c and A-3 below | PASS |
| reviewed-terminal composition inside an external container | 5.4h | PASS |

Type arguments and elements are inspected **before** the external member graph
becomes `EXTERNAL_LIBRARY_TERMINAL` (analyzer 729–752). An external declaration
name is not a blanket safe boundary for project-owned type arguments. PASS.

### 5.9 PERFORMANCE / PROGRAM CONSTRUCTION

| Check | Observed | Verdict |
|---|---|---|
| one canonical analyzer path used by guard and proofs | all suites import `analyzePublicAuthoritySurface` from the single module; no duplicated rule set | PASS |
| ≤ 1 Program per real invocation | `programConstructionCount` = 1 cold, 0 warm | PASS |
| no Program per export/signature/parameter/node/disposition/registry entry | single `ts.createProgram` call site (line 188); the only other `createSourceFile` is inside the falsification-only legacy path | PASS |
| deterministic ordering independent of filesystem enumeration | `exportedCallables`, `manifest`, `findings`, `dispositions` all sorted by explicit comparators; two successive invocations produced byte-identical JSON for all four | PASS |
| analyzer timing recorded independently | cold **897 ms**, warm **142 ms** (standalone script, quiet host); the guard's in-suite run measured 569–1715 ms | recorded |
| optimization introduced no silent skip / stale cache / dedup loss | dedup is occurrence-exact (5.1 #3); stale cache is real but guard-cleared (5.5) | PASS with observation |

---

## 6. WHY THE "NO SILENT SKIP-AUTHORITY PATH" CLAIM FAILS

The R2-H1 correction removed the *naming gate* on roots (F-R1-003) and made
discovery export-driven (F-R1-001). Both fixes hold. But the walker still
contains member-level skip authority that neither prior auditor nor the
implementer's own falsifications reached, because every prior probe used a
**required, string-keyed** member.

Three independent stop paths defeat the claim; two are live-reachable on the
real public surface today.

---

## 7. A-F19 — LIVE FALSIFICATIONS ON THE REAL PUBLIC SURFACE

All corruptions target `src/editing/types.ts`
(original blob `68a641cdcda3041b24559f78f771a7558c113dfd`). Each follows:
corrupt → observe → restore from a byte copy → blob equality → path-scoped
empty diff → clean `git status`.

### 7.1-A CONTROL — required, string-keyed callable (the R2 shape)

Corruption: add `readonly authorityOps?: { readonly issue: (input: string) => string };`
to `AuthorizePreparedChangeOptions`.

Result: **2 findings**, naming `authorizePreparedChange` / parameter `options` /
type `AuthorizePreparedChangeOptions` / member `authorityOps` and nested member
`authorityOps.issue`. Manifest 2242 → 2244, dispositions 5302 → 5306.
Restored blob `68a641cd…c113dfd`, empty path-scoped diff. **The guard works for
this shape.** PASS.

### 7.1-B A-F19 — OPTIONAL callable member (auditor-chosen, keyword-blind)

Corruption: add `readonly quill?: (mark: string) => string;` to
`AuthorizePreparedChangeOptions`.

| Observation | Result |
|---|---|
| canonical analyzer findings | **0** |
| member manifested | yes — `authorizePreparedChange:quill` |
| disposition assigned | `TRAVERSED_PROJECT_GRAPH` (clean) |
| dispositions / manifest | 5303 / 2243 (grew, so the member *was* reached) |
| discovered == manifested roots | 28 == 28, still equal |
| `tests/architecture/public-authority-surface.test.ts` | **5/5 PASS** |
| `tests/integration/phase3-reaudit-public-surface.test.ts` (P1–P14) | **9/9 PASS** |
| `tests/editing/public-authority-malicious.test.ts` | 3/3 PASS |
| `npm run typecheck` | exit **0** |
| corruption present at end of run | verified by `grep` |
| restoration | blob `68a641cd…c113dfd`, empty diff, clean tree |

**The required A-F19 failure did not occur.** This is the exact obligation of
contract §3.5 A-F19 ("Add callable mechanism-substitution field to an otherwise
public function surface. Expected: standing declaration/manifest test fails.").

### 7.1-C A-F19 — SYMBOL-KEYED callable member

Corruption:

```ts
export declare const authorityGate: unique symbol;

export type AuthorizePreparedChangeOptions = {
  readonly gitContext?: GitStateBaseline;
  readonly [authorityGate]?: { readonly issue: (input: string) => string };
};
```

| Observation | Result |
|---|---|
| canonical analyzer findings | **0** |
| member manifested | **no** — absent from the manifest entirely |
| disposition assigned | **none** |
| dispositions / manifest | **5302 / 2242 — byte-identical to the clean baseline** |
| discovered == manifested roots | 28 == 28, still equal |
| `tests/architecture/public-authority-surface.test.ts` | **5/5 PASS** |
| `tests/integration/phase3-reaudit-public-surface.test.ts` | **9/9 PASS** |
| `tests/editing/public-authority-malicious.test.ts` | 3/3 PASS |
| `npm run typecheck` / `npm run build` | exit **0** / exit **0** |
| corruption present at end of run | verified by `grep` |
| restoration | blob `68a641cd…c113dfd`, empty diff, clean tree |

The corrupted tree is legal, compiling TypeScript. The guard is not merely
unable to name the member — it cannot observe that anything changed at all.

### 7.2 AUDITOR-CHOSEN ADVERSARIAL CASES — NO REUSE

No name or shape is reused from R2 2-F1…2-F7, R2-H1 H1-F1…H1-F7, either prior
R1 auditor, or the dispatch's examples.

**Pre-use search evidence.** For each chosen identifier, run before use:

```text
git grep -I -i -n -- '<name>' -- $(git ls-files)
```

| Name | Role | Result |
|---|---|---|
| `tallyParcel` | function | (zero matches) |
| `parcel` | parameter | (zero matches) |
| `ParcelShape` | type | (zero matches) |
| `envelope` | outer member | (zero matches) |
| `quill` | callable member | (zero matches) |
| `weighCrate` | function | (zero matches) |
| `crate` | parameter | (zero matches) |
| `CrateBound` | composed type | (zero matches) |
| `ferrule` | member / type | (zero matches) |
| `plinth` | callable member | (zero matches) |
| `lattice` | parameter | (zero matches) |
| `LatticeNode` | union type | (zero matches) |

Two further candidates, `stamp` (6 files) and `seal` (1 file), were **rejected**
for non-zero matches and replaced by `quill` and `ferrule`.

| Case | Shape | Requirement met | Result |
|---|---|---|---|
| **A-1** | `tallyParcel(parcel: ParcelShape)` with `envelope: { quill: (mark) => string }` | keyword-blind; callable below top level (nested object) | REJECTED — `unreviewed user-defined call signature on member envelope.quill` |
| **A-2** | `weighCrate(crate: CrateBound)` where `CrateBound` extends / intersects / wraps the reviewed terminal and adds `plinth` | composes with the reviewed terminal, adds caller-defined structure | REJECTED in all 8 composition shapes (§5.4); review did not propagate |
| **A-3** | `sortLattice(lattice: LatticeShape)` with `plinth` inside a **union constituent** inside a **`ReadonlyArray<>` type argument** | callable below top level, inside union + generic argument + array element | REJECTED — 2 findings naming `nodes.plinth` |
| **A-4** | `plinthWeigh(lattice: Ferrule)` — no `Options`/`Config`/`Context`/`Settings` suffix, no semantic hint | adversarial parameter and type name | REJECTED on shape — `unreviewed user-defined call signature on member quill` |
| **A-5** | 7.1-B optional `quill` on the real surface | keyword-blind, real public surface | **NOT REJECTED** — F-R1-004 |
| **A-6** | 7.1-C symbol-keyed `issue` on the real surface | real public surface | **NOT REJECTED** — F-R1-005 |

The analyzer was not taught any of these names; A-1 through A-4 are rejected by
type shape alone, which is the correct behaviour. A-5 and A-6 expose the defect.

### 7.3 BRAND-NEW PUBLIC CALLABLE AUTO-DISCOVERY

`ferrulePlinth(parcel: QuillLattice)` — previously unknown function name,
previously unknown project-defined parameter type, non-options parameter name,
no list/manifest/registry entry, nested unreviewed callable `envelope.crate`.

Result: auto-discovered (`exportedCallables: ["ferrulePlinth"]`, 1 root,
manifest 4, dispositions 5) and **REJECTED** —
`unreviewed user-defined call signature on member envelope.crate`. PASS.

A brand-new callable whose dangerous member is *optional* or *symbol-keyed* is
auto-discovered but **not** rejected, per F-R1-004 / F-R1-005.

### 7.4 RESTORATION DISCIPLINE

Every corruption in §7 and §9.4 completed the full cycle: corrupt → exact
observed outcome → intended reason → exact restoration from a byte copy → blob
SHA equality → path-scoped empty `git diff --stat` → clean `git status
--porcelain`. No falsification errored before its intended observation. The
working tree is clean apart from this report at the time of commit (§14).

---

## 8. GAP-058 AND GAP-059 — INDEPENDENT RE-EXAMINATION

Neither recorded disposition was inherited.

### 8.1 GAP-058 — PACKAGE-ROOT SCOPE

| Check | Observed |
|---|---|
| `package.json` supported exports | `{".":{"types":"./dist/index.d.ts","import":"./dist/index.js"}}` — only the root specifier |
| `files` | `["dist"]`; `bin` = `{"pathcode":"./dist/cli/entry.js"}` (an executable, not an importable specifier) |
| `src/index.ts` exports | no `editing` re-export of any kind |
| emitted package-root declarations | `dist/index.d.ts` contains **no** reference to `editing` |
| package-root runtime import | 11 exported names; editing authority names reachable = **`[]`** |
| `import("path-code/editing")` | **BLOCKED** — `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `import("path-code/dist/editing/index.js")` | **BLOCKED** — `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| `import("path-code/src/editing/index.js")` | **BLOCKED** — `ERR_PACKAGE_PATH_NOT_EXPORTED` |

No editing authority surface is reachable through a supported package export or
subpath. GAP-058's factual basis is **TRUE**; it is correctly preserved as an
OPEN `NON_BLOCKING_LIMITATION` and is **not** an active finding.

GAP-058 does **not** cover F-R1-004 or F-R1-005: its scope is which *barrel* the
walker is rooted at, not what the walker does with the members it reaches.

### 8.2 GAP-059 — CHECK TIMING

Three full `npm run check` runs, host load recorded at start of each. Worker
count, timeouts, Node options, package scripts and test selection were **not**
changed.

| Attempt | Load at start (8 cores) | Wall time | Test files | Tests | Errors | Exit |
|---|---|---|---|---|---|---|
| 1 (primary) | 10.37 / 9.27 / 10.04 | 133.88 s real (vitest 125.30 s) | **66 passed (66)** | **626 passed (626)** | 2 × `[vitest-worker]: Timeout calling "onTaskUpdate"` | **1** |
| 2 | 18.23 / 18.52 / 14.15 | 107.17 s real (vitest 101.07 s) | **66 passed (66)** | **626 passed (626)** | 1 × same | **1** |
| 3 | 7.97 / 10.82 / 13.40 | 173.77 s real (vitest 165.37 s) | 64 passed, **2 failed** (66) | 624 passed, **2 failed** (626) | 2 × same | **1** |

The primary run is preserved as the first result and is **not** replaced by any
later attempt. Attempt 3 is **not** reported as clean: it carried two genuine
test failures, both of which were `Error: Test timed out in 5000ms`:

| Failed test | Failure text |
|---|---|
| `tests/git/baseline.test.ts > collectGitStateBaseline — tracked file states > reports a staged modification as index MODIFIED and worktree CLEAN` | `Test timed out in 5000ms` |
| `tests/snapshot/git-snapshot-membership.test.ts > Phase 2G-H1 cross-component membership > rejects Git baseline from a foreign inventory even with identical lexical paths` | `Test timed out in 5000ms` |

**Timed-out suites run in isolation** (as §8.2 policy requires), on the same
host, with no change to worker count, timeouts, Node options, package scripts,
or test selection:

```text
npx vitest run tests/git/baseline.test.ts tests/snapshot/git-snapshot-membership.test.ts
  Test Files  2 passed (2)
       Tests  23 passed (23)
    Duration  17.60s
```

Both named tests pass in isolation, confirming a wall-clock exhaustion, not an
assertion defect. Attempt 3's run was the slowest of the three (837 s of test
time versus 640 s and 482 s) under a 3-minute load average of 20.08.

Across all three attempts:

- **zero** assertion failures — the only test failures were wall-clock timeouts
  (attempt 3), each of which passes in isolation;
- **zero** compiler, build, CLI or ledger failures;
- the remaining errors are vitest **worker RPC** timeouts (`onTaskUpdate`),
  which are reporter-transport failures under host contention.

No later PASS is reported as though the first run were clean. Only three full
attempts were run: one primary plus two additional, within the at-most-three
additional budget. No further attempts were manufactured to seek a different
outcome.

Because `npm run test` exits non-zero on unhandled errors, `npm run check` stops
before `cli:smoke` and `ledger:verify` in those attempts. Both were therefore run
independently and are recorded in §11.

**Comparison to GAP-059's current evidence:** the observed behaviour **matches**
GAP-059 — a full-suite run that passes every assertion but exits non-zero
through wall-clock/worker-transport timeouts under host load. It neither exceeds
nor improves upon the recorded basis. GAP-059 is correctly preserved as an OPEN
`NON_BLOCKING_LIMITATION`. It is not, by itself, a reason to fail this audit.

### 8.3 F-R1-002 — STATIC/RUNTIME DIVISION OF RESPONSIBILITY

The runtime P4 / malicious-input layer
(`tests/editing/public-authority-malicious.test.ts`, 3/3 PASS) independently
owns cast-read and undeclared-runtime-input defence: `replaceExistingFile`,
`createFile` and `executeMultiFilePlan` each ignore a hostile injected
`fsOps`/`targetOps` and mutate through the production filesystem. It remains
falsifiable (A-F20/A-F22 shapes).

The declaration/type-graph guard is therefore not required to defeat arbitrary
hostile TypeScript casts; **GAP-005** (`ACCEPTED_PERMANENT` /
`NON_BLOCKING_LIMITATION`) governs that accepted limitation. The division as
recorded is **truthful** and is not a finding.

Note the boundary that F-R1-004/F-R1-005 violate is on the **static** side, not
this one: a *declared* member on a *declared* public options type is exactly
what the static guard claims to own.

---

## 9. NEW FINDINGS

### 9.1 F-R1-004 — Optional callable members on public parameter graphs are never classified as callable

**Class (proposed):** BLOCKING_INVARIANT
**Category:** §6.1 **E — FORBIDDEN SILENT STOP**
**Active leak:** no known leak at HEAD; **detector defect with a live-reachable
corruption path on the real public authority surface**

**Mechanism.** `tests/architecture/public-authority-surface-analyzer.ts:873-874`:

```ts
const propType = checker.getTypeOfSymbol(prop);
…
if (hasUserDefinedCallSignatures(propType)) {
```

`propType` is **not** unwrapped before the test. For an optional member
(`quill?: T`) or an explicit `T | undefined`, `propType` is a union, and
`ts.Type.getCallSignatures()` on a union returns `[]`. The unwrapped type is
computed *afterwards* (`const unwrappedProp = unwrapNonNullish(propType)`) and is
used only to choose a traversal branch. `walkTypeBody` never tests call
signatures of the node type itself, so the function type is dispositioned
`TRAVERSED_PROJECT_GRAPH` and no finding is emitted.

**Evidence.**

| Shape | Findings |
|---|---|
| `readonly quill: (m: string) => string` (required) | 1 — REJECTED |
| `readonly quill?: (m: string) => string` | **0** |
| `readonly quill: ((m: string) => string) \| undefined` | **0** |
| `readonly quill?: Ferrule` (named callable interface) | **0** |
| `readonly envelope: { readonly quill?: (m) => string }` (nested) | **0** |
| `readonly envelope?: { readonly quill: (m) => string }` (optional container, required callable) | 1 — REJECTED |

Live on the real public surface: §7.1-B. Standing guard 5/5 PASS, P1–P14 9/9
PASS, typecheck exit 0, with the member present.

**Why this matters.** Every existing member of all four public options types is
optional (`gitContext?`). The optional form is the *natural* way to add an
options field, uses an ordinary identifier, and requires no unusual TypeScript.
A-F19 is defeated by it outright.

**Consequences.** Contract §3.4 P2, P3 and P12 fail. Contract §3.5 A-F19 fails to
produce its required failure.

### 9.2 F-R1-005 — Symbol-keyed members drop the member and its entire sub-graph from manifest, dispositions and findings

**Class (proposed):** BLOCKING_INVARIANT
**Category:** §6.1 **E — FORBIDDEN SILENT STOP**
**Active leak:** no known leak at HEAD; **detector defect with a live-reachable
corruption path on the real public authority surface**

**Mechanism.** Two sites apply a member-**name** predicate as skip authority —
`…analyzer.ts:856-858` and `…analyzer.ts:954`:

```ts
const propName = prop.getName();
// Skip well-known symbol properties (iterators) — not caller substitution.
if (propName.startsWith("__@")) {
  continue;
}
```

The escaped name of *any* symbol-keyed property begins `__@` — including a
project-declared `unique symbol` key, not only well-known symbols. The `continue`
occurs **before** the manifest row is pushed, so the member is absent from the
manifest, receives no disposition, and produces no finding. Its entire sub-graph
is dropped with it.

**Evidence.**

| Shape | Manifest rows | Dispositions | Findings |
|---|---|---|---|
| `readonly inner: InnerShape` where `InnerShape` has `gate` and `fsOps.write` | 7 | 10 | **3** (`inner.fsOps`, `inner.fsOps.write`, `inner.gate`) |
| `readonly [gateKey]: InnerShape` — identical sub-graph under a `unique symbol` key | **2** | **2** | **0** |
| `[Symbol.iterator]: (v: string) => string` | 2 | 2 | 0 |

Note the second row hides an `fsOps` member — precisely the
mechanism-substitution shape Amendment 1 §4 D bans, and one that the
`MECHANISM_NAME` heuristic would otherwise catch.

Live on the real public surface: §7.1-C. With the member present, the analysis
is **byte-identical to the clean baseline** (5302 dispositions, 2242 manifest
rows, 0 findings); standing guard 5/5 PASS; typecheck and build exit 0.

**Why the §6.2 accounting cannot catch it.** Because the member never enters the
manifest, `discoveredPublicRoots == manifestedDispositionRoots` remains trivially
true. The completeness proof is structurally blind to this omission class.

**Consequences.** Contract §3.4 P2, P3 and P12 fail. A-F19 fails to produce its
required failure. Contract §6.1's prohibition on "member-name keyword" decisions
and on stopping mechanisms that "omit an occurrence from the manifest" is
violated directly.

### 9.3 F-R1-006 — Object-valued barrel exports are dropped from discovery entirely

**Class (proposed):** NON_BLOCKING_LIMITATION
**Category:** §6.1 **E — FORBIDDEN SILENT STOP**
**Active leak:** **none at this HEAD**

**Mechanism.** `…analyzer.ts:1268-1271`:

```ts
const signatures = type.getCallSignatures();
if (signatures.length === 0) {
  continue;
}
```

An exported binding that is not itself callable is skipped before
`exportedCallables` is populated. An object-valued API export whose *methods*
take authority-bearing parameters is therefore invisible.

**Evidence.** `export const parcelDesk = { weigh(lattice: QuillShape) … }` where
`QuillShape` carries a callable member: `exportedCallables: []`, 0 roots, 0
manifest rows, 0 dispositions, **0 findings**. The same API as an exported
function is discovered and rejected (1 finding).

**Current reachability.** `src/editing/index.ts` exports only functions, consts
of primitive/scalar type, and types. No object-valued authority export exists, so
there is no active leak. Recorded under the No-Untracked-Finding Rule because it
is a silent stop path that yields a clean result, and the guard's coverage claim
is export-driven.

### 9.4 Observations recorded, not raised as findings

| # | Observation | Why not a finding |
|---|---|---|
| O-1 | The `programCache` has **no invalidation source** (§5.5) — stale in both directions across a source mutation with size and mtime preserved. | The standing guard and every permanent proof call `clearRepositoryTypeScriptProgramCache()` first, so the guard as shipped uses current source. The exposure is a call-convention dependency, not a stale result used by the guard. Worth a hardening note. |
| O-2 | Analyzer results depend on `process.cwd()` (§5.5). | Degrades strictly fail-closed (extra `any` rejections, never fewer). Vitest runs at repo root. |
| O-3 | Anonymous external object types take `EXTERNAL_LIBRARY_TERMINAL` without type-argument inspection (§5.1 #11). | No such type carrying project-owned arguments is reachable at this HEAD; every named external container does inspect arguments. |
| O-4 | SE-006, SE-007, SE-014 carry no `obligationCitation` record (§3). | Behaviourally exercised; recorded as NOT VALIDATED (§12) rather than asserted. |
| A-F18 | Live falsification: appending `export * from "./internal/authorization-readiness.js"` to the public barrel **failed** `tests/editing/architecture.test.ts` naming `authorization-readiness`. Restored to blob `d9131b34a31c510790a8cde9751716436e64d595`, empty diff, clean tree. | Behaved correctly — recorded as passing evidence. |

### 9.5 No-Untracked-Finding disposition

| Finding | Already represented by an existing Gap Ledger record? | Disposition |
|---|---|---|
| F-R1-004 | **No.** GAP-057 is CLOSED and its closure condition concerns root traversal and naming gates, not member classification. GAP-058 concerns barrel scope. GAP-005 concerns hostile *casts*, not declared members. GAP-055/056/059 are unrelated. | **RE-AUDIT R1 NOT COMPLETE**, recorded here |
| F-R1-005 | **No.** Same reasoning; additionally no record contemplates manifest omission. | **RE-AUDIT R1 NOT COMPLETE**, recorded here |
| F-R1-006 | **No.** | **RE-AUDIT R1 NOT COMPLETE**, recorded here |

No Gap Ledger entry was created or closed by this audit; canonical ledger work
belongs to a later corrective contract.

---

## 10. R1-SPECIFIC RECONCILIATION CHECKS — R1-A THROUGH R1-H

| ID | Requirement | Observed | Verdict |
|---|---|---|---|
| R1-A | safe-editing NOT PHASE_VERIFIED at the audited checkpoint | derived state **IMPLEMENTED** | PASS |
| R1-B | GAP-051/052 OPEN; GAP-053/054 CLOSED; GAP-055/056 OPEN | as §0 | PASS |
| R1-B′ | GAP-057 CLOSED against R2-H1 Stage 1 evidence | CLOSED, `closedByCommit = c6b922c8…495c76`, evidence `PHASE_3_R2_H1_TRAVERSAL_REPORT.md` | PASS |
| R1-B″ | GAP-058/059 OPEN | both OPEN `NON_BLOCKING_LIMITATION` | PASS |
| R1-C | restored half-citation probe still proves its historical mechanism | `historical half-citation probe — declaration-only evidence cannot yield PHASE_VERIFIED` executed live, **PASS** | PASS |
| R1-D | `ledger-verify` uses the universal `phaseAuditEvidence`-shape rule; no hardcoded safe-editing or closed-phase list | `scripts/ledger-verify.ts` and `scripts/lib/ledger-verifier.ts` contain **no** occurrence of `safe-editing`, `repository-intelligence`, `foundation-kernel`, or any phase list; only universal `record.phaseAuditEvidence` handling (lines 125, 459, 464, 662) | PASS |
| R1-E | Stage 1 shape-consistency falsifications are permanent and falsifiable | `tests/selfobs/phase-audit-shape.test.ts` 3/3 PASS — 1-F1 (evidence present with non-PHASE_VERIFIED rejected), 1-F2 (evidence absent with PHASE_VERIFIED rejected), plus the truthful-acceptance case | PASS |
| R1-F | no production file under `src/editing/` changed in R1/R2/R2-H1 | `git log … ee58673..HEAD -- src/editing/` is **empty**; all `src/**` change since `ee58673` is `src/selfobs/{capability-ledger-data,citation-helpers,gap-ledger-data}.ts` | PASS |
| R1-G | 607 remains bound only to Closure A at `04591e4` | single `value: "607"` with `exactEvidenceNeedle "\| Runtime tests \| **607** PASS \|"` at `atCommit 04591e400f6b8efe7190ce01faef4da97d0eb984`; no 608 or 626 recorded figure exists | PASS |
| R1-H | no R1 closure artifact / promotion exists yet | no `docs/PHASE_3_CLOSURE_RECONCILIATION_R1.md`, no Phase 4 artifact, no promotion commit | PASS |

All eight R1 reconciliation checks PASS. The R1 chain's own evidence work is
sound; what fails is the Phase 3 public-authority detector it was meant to
certify.

---

## 11. VALIDATION GATES (§3.9)

Run at the clean checkpoint, before writing this report.

| Gate | Result |
|---|---|
| `npm run ledger:verify` | **PASS** — `ledger:verify PASS at b2531ce868b27ca4b47f5a8bde835cd21b80c441` |
| `npm run typecheck` | exit **0** |
| `npm run build` | exit **0** |
| `npm test` | attempts 1 and 2: **66 test files passed (66)**, **626 tests passed (626)**. Attempt 3: 64 passed / 2 failed files, 624 passed / 2 failed tests — both failures `Test timed out in 5000ms`, both passing in isolation (§8.2). 1–2 vitest worker RPC (`onTaskUpdate`) timeout errors per run ⇒ process exit 1 |
| `npm run cli:smoke` | not reached inside `npm run check` (the chain stops at `npm run test`'s non-zero exit); no independent CLI failure was observed and the CLI architecture/package suites (`tests/cli/*`, 20 tests) pass |
| `npm run check` | **exit 1** in all three attempts, through vitest worker-RPC timeouts and (attempt 3) two wall-clock test timeouts; zero assertion, compiler, build, CLI or ledger failures |

Per-attempt totals and host load are tabulated in §8.2. No worker count,
timeout, Node option, package script, or test selection was modified to obtain a
pass.

---

## 12. NOT VALIDATED

1. **Independence of this audit.** ASSERTED under the existing evidence
   vocabulary, not mechanically proven — see GAP-055. No new evidence tier was
   invented; `OPERATOR_ATTESTED` was not used.
2. **SE-006, SE-007, SE-014** carry no `obligationCitation` record in the
   Capability Ledger. They are behaviourally exercised (B5, write boundary,
   persistence/residue) but are **not** asserted here as
   `SATISFIED_PHASE_WIDE` on citation evidence.
3. **Completeness of the stop-path enumeration** is established by reading the
   full canonical analyzer path and by live probing, not by a mechanical proof
   that no further stop path exists. Two prior auditors and this one each found
   defects the previous work did not; the enumeration in §5.1 should be treated
   as thorough, not as proven exhaustive.
4. **Absence of an active exploit** for F-R1-004/F-R1-005 at this HEAD is
   asserted from the current declared surface (0 findings at clean HEAD), not
   from a proof that no such member exists anywhere in the dependency graph.
5. **`npm run check` green exit** was never observed. All three attempts exited
   1 through worker-RPC timeouts and, in attempt 3, two wall-clock test
   timeouts (GAP-059), so a fully green single-process check remains
   unvalidated. `npm run cli:smoke` and `npm run ledger:verify` were therefore
   never reached *inside* the `npm run check` chain; `ledger:verify` was run
   independently and passed, and `cli:smoke` was not run independently.
6. **Anonymous external type-argument inspection** (O-3) is untested against a
   real reachable case because none exists at this HEAD.

---

## 13. COMPLETE-GATE EVALUATION (§3.8)

| Condition | Status |
|---|---|
| every original Phase 3 audit criterion passes | PASS (§3) |
| all SE-001…SE-020 SATISFIED_PHASE_WIDE | PARTIAL — 17 citation-verified; SE-006/007/014 NOT VALIDATED (§12.2) |
| relevant P3D obligations pass | PASS — P3D-002/009/015 citation-verified |
| **P1 through P14 pass** | **FAIL — P2, P3, P12** |
| **every applicable A-F15…A-F22 probe fails/restores as required** | **FAIL — A-F19 does not produce its required failure (§7.1-B, §7.1-C)** |
| R1-A through R1-H pass | PASS (§10) |
| no active PUBLIC_AUTHORITY_SURFACE_LEAK remains | no active leak observed at HEAD, but the guard cannot detect two live-reachable classes |
| **every new finding already recorded or causes NOT COMPLETE** | **F-R1-004, F-R1-005, F-R1-006 are new and unrecorded → NOT COMPLETE under the No-Untracked-Finding Rule** |
| all four mutation component capabilities PASS_FROZEN | PASS |
| safe-editing NOT PHASE_VERIFIED before closure linkage | PASS |
| runtime dependencies remain 0 | PASS |
| exactly one project filesystem write module | PASS |
| working tree clean except the Stage 3 output file before commit | PASS |
| Phase 4 absent | PASS |

Three gate conditions fail. No production fix was attempted inside this audit.

---

## 14. GIT / OUTPUT BOUNDARY

| Item | Value |
|---|---|
| Starting HEAD | `b2531ce868b27ca4b47f5a8bde835cd21b80c441` |
| Audited checkpoint | `b2531ce868b27ca4b47f5a8bde835cd21b80c441` |
| Files written | `docs/reports/PHASE_3_INTEGRATION_REAUDIT_R1_REPORT.md` (only) |
| Optional Stage 3 test file | **not created** — it would encode defective behaviour as a passing expectation, which §3.7 forbids |
| Ledger edits | none |
| Source edits | none (all §7/§9.4 corruptions restored to exact blob equality) |
| Prior reports edited | none |
| Prior tests edited | none |
| Prior report blob recorded before writing | `c60c782` → `365bb1c873bffb0c9e26d0f858fdc5a6a6c1eea3` (SHA-256 `c4da0a50…a960f318`) |
| Working tree before commit | clean except this report |
| Commit subject | `Record Path Code Phase 3 independent re-audit R1 finding` |
| Stage 4 | **not started** |
| safe-editing promotion | **not performed** |
| Phase 3 closure | **not created** |
| Foundation §10 | **not started** |
| Phase 4 | **not started** |
| Pushed | **no** — no remote created, nothing pushed |

Git history preserves both prior report versions at `ecda537` and `c60c782`.
Nothing was rewritten, amended, squashed, or dropped. Because this attempt is
NOT COMPLETE, **no prior report version is superseded for progression** — all
three attempts stand as successive NOT COMPLETE findings.

---

**Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE
