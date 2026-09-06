# PATH CODE — PHASE 5B REFERENCE BINDING + GATE 1 IMPLEMENTATION REPORT

**Status:** PASS  
**Branch:** `cursor/phase5b-reference-binding`  
**Contract:** `docs/passes/PHASE_5B_REFERENCE_BINDING_CONTRACT.md`  
**State line:**

```text
PHASE 5B REFERENCE BINDING + GATE 1 IMPLEMENTED — REFERENCES_ONLY — NOT SEMANTICALLY VERIFIED — NO ACTION AUTHORITY
```

---

## 1. Worktree / branch / SHA

| Field | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Start branch | `cursor/phase5a-reasoning-contracts` |
| Start HEAD | `7fcbf11fb81ce275f58011c724ea6c156eb8d177` |
| Working branch | `cursor/phase5b-reference-binding` (created in-place; no new worktree) |
| Contract commit | `0be75d9b974587ac43a12c88c3ade3bdcfa6f03d` |
| Implementation commit | `739ca6cf0179ab4d2fd5edf6dc3f759398cea4f3` |
| Typecheck-fix commit | `4015021ac86c33a4f93640be3dedc9ee32666c1b` |
| Phase 5A branch preserved | yes (`refs/heads/cursor/phase5a-reasoning-contracts`) |
| Main before integration | `bfd6fc5b5ec8888363b90745ba72e06db96198a1` |
| Merge / push of 5B runtime | none |

Budget: start `2026-09-06T15:47:51Z`; deadline `2026-09-06T17:17:51Z`; canonical check completed `2026-09-06T16:04:51Z`.

Canonical `npm run check` ran against HEAD `4015021…` (implementation + owned typecheck fix). Report commit is docs-only after that PASS.

---

## 2. Changed paths

| Path | Role |
|---|---|
| `docs/passes/PHASE_5B_REFERENCE_BINDING_CONTRACT.md` | Governing instruction + FOUNDATION COMPATIBILITY PREFLIGHT + API mapping |
| `src/reasoning/bounds.ts` | V1 ceilings / UTF-8 sizing |
| `src/reasoning/failures.ts` | Input/catalog failures; claim-refusal helper |
| `src/reasoning/internal/registry.ts` | WeakMap catalog + bound-result registration |
| `src/reasoning/catalog.ts` | Catalog factory, descriptors, dispose |
| `src/reasoning/parse.ts` | Bounded ReasoningProposal JSON parser |
| `src/reasoning/bind.ts` | Reference resolution, currentness, `bindReasoningProposalJson` |
| `src/reasoning/applicability.ts` | Fresh applicability observation |
| `src/reasoning/index.ts` | Explicit runtime + type exports (not package root) |
| `tests/reasoning/architecture.test.ts` | Amended A01/A02 for runtime allowlist |
| `tests/reasoning/parse.test.ts` | Parser/limit proofs |
| `tests/reasoning/helpers.ts` | Disposable fixture helpers |
| `tests/reasoning/gate.test.ts` | B01–B20 runtime proofs |
| `docs/reports/PHASE_5B_REFERENCE_BINDING_GATE1_REPORT.md` | This report |

`types.ts` and T01–T12 compile proofs unchanged. No package.json / vitest / dependency / ledger / root-export changes.

---

## 3. Inherited mappings (pinned to committed 5A + Phase 2)

| Concept | Actual mapping |
|---|---|
| Proposal schema | `schemaVersion: 1`; fields `proposalId`, `requestedOutcome`, `claims`, `hypotheses` |
| Evidence refs | `EVIDENCE_ID`/`id` \| `REPOSITORY_RELATIVE_PATH`/`relativePath` |
| Six kinds | `EXISTS` `CONTENT` `DEPENDS_DECLARED` `CONTAINS` `DEFINES` `BEHAVES` |
| Bound sources | `RepositoryEntry` / `ContentObservation` / `ManifestEvidence` / nonempty `ContentObservation[]` |
| Dependency predicate | `ManifestEvidence.fact.kind === "DECLARED_PACKAGE_DEPENDENCY" && fact.packageName === dependencyName` |
| Currentness | `verifyRepositorySnapshot` — entry `CURRENT_IDENTITY`; content `VERIFIED_CURRENT` |
| Config | `loadProjectConfig`; successful `ABSENT` retains empty restrictions; restriction fields compared deterministically |
| Refusal codes | Six 5A codes preserved; operational failures are reasoning-local `INPUT`/`CATALOG` kinds |

---

## 4. Internal API signatures

```ts
createReferenceCatalog(input: CreateReferenceCatalogInput)
  : Result<ReferenceCatalog, ReasoningCatalogFailure>

describeReferenceCatalog(catalog: ReferenceCatalog)
  : Result<readonly ReferenceDescriptor[], ReasoningCatalogFailure>

disposeReferenceCatalog(catalog: ReferenceCatalog): void

bindReasoningProposalJson(jsonText: string, liveCatalog: ReferenceCatalog)
  : Promise<Result<ReasoningBindSuccess, ReasoningBindFailure>>

checkReferenceBoundReasoningApplicability(
  reasoning: ReferenceBoundReasoning,
  liveCatalog: ReferenceCatalog,
): Promise<Result<ReferenceBoundApplicabilitySuccess, ReasoningApplicabilityFailure>>
```

Supporting types: `ReferenceCatalogSelection` (`entries?`, `contentObservations?`, `manifestEvidence?`); `ReferenceDescriptor` (`handle`, `evidenceKind`, optional `relativePath`); `ReasoningBindSuccess` (`reasoning`); applicability success (`applicable: true`, `reasoning`, `assessedAt`).

Private call-path exports used by focused bypass diagnostics: `resolveCatalogReference`, `verifyContentObservationsCurrent` (not package-root).

---

## 5. Six-kind behavior / refusal table

| Kind | Required source + check | Bound obligation | Typical refusals |
|---|---|---|---|
| EXISTS | Admitted entry; entry currentness | `OBSERVATION` | `UNBOUND_CLAIM`, `STALE_EVIDENCE`, `CLAIM_OUTSIDE_ADMITTED_SET` |
| CONTENT | Content observation; full-content verify | `OBSERVATION` | same + `EVIDENCE_IDENTITY_MISMATCH` on citation conflict |
| DEPENDS_DECLARED | Compatible `ManifestEvidence` + exact `DECLARED_PACKAGE_DEPENDENCY` | `OBSERVATION` | `GROUNDING_OVERCLAIM` if fact/name mismatch |
| CONTAINS | Current content + needle; **no search** | `DEFERRED_CONTENT_CHECK` | same as CONTENT for binding |
| DEFINES | Nonempty current content sources + symbol | `EXECUTION` (`TYPECHECK`, purpose from symbol) | unbound/stale; obligation remains outstanding |
| BEHAVES | Nonempty current content sources + scenario | `EXECUTION` (`TARGETED_TEST`, purpose from scenario) | unbound/stale; obligation remains outstanding |

Success stage is always `REFERENCES_ONLY`. Hypotheses remain `INFERRED`/`UNVERIFIED`. EngineeringRunCitation / Gate 2 not ingested.

---

## 6. Catalog / trust boundary

- Trusted caller supplies genuine workspace + snapshot-selected artifacts; untrusted input is JSON text only.
- Membership by reference identity against ADMITTED inventory, snapshot-bound content observations, and OBSERVED map `ManifestEvidence`.
- Opaque `randomUUID` handles; private WeakMap registration; freeze owned descriptors; explicit dispose.
- Path hints: strict repository-relative syntax; exact lexical match into selected catalog paths; no FS admission/search; 0 or >1 match refuses; bad ID never falls back to path.

---

## 7. B01–B20 proof map

| ID | Proof |
|---|---|
| B01 | `gate.test.ts` catalog compatible/safe descriptors; clone/mixed selection refused |
| B02 | `parse.test.ts` valid parse + malformed/version/unknown/forbidden cases |
| B03 | size/claim-count ceilings refuse |
| B04 | invented/other-catalog/path-after-bad-ID refuse; private `resolveCatalogReference` seam |
| B05 | exact path ok; absolute/traversal/unselected refuse |
| B06 | EXISTS/CONTENT bind to original objects; citation mismatch refuses |
| B07 | typescript declaration binds; absent `lodash` → `GROUNDING_OVERCLAIM` |
| B08 | same-length content change → `STALE_EVIDENCE` via full-content verify |
| B09 | deleted/denied refuse; diagnostics omit absolute root |
| B10 | ABSENT config success path; denial/restriction change fail-closed |
| B11 | CONTAINS deferred despite visible needle; DEFINES/BEHAVES EXECUTION nonempty |
| B12 | dup IDs/dangling bases refuse; INFERRED/UNVERIFIED labels retained |
| B13 | frozen descriptors + selection mutation cannot rewrite retained binding |
| B14 | JSON copy not registered; dispose invalidates bind |
| B15 | applicability fresh then stale; historical result unchanged |
| B16 | one bad claim → whole proposal refuse; no partial value |
| B17 | future-file outcome text allowed; no edit authority fields |
| B18 | E2E deps+content → REFERENCES_ONLY; changed bytes refuse rebind/applicability |
| B19 | T01–T12 file preserved; opacity markers present |
| B20 | A01 types-only `types.ts`; A02 finite runtime exports; A03 no reverse imports |

### Bounded bypass diagnostics

| Probe | Corruption | Private/focused result | E2E | Restore |
|---|---|---|---|---|
| 1 | `resolveCatalogReference` treats missing ID as first CONTENT | private B04/B06 **FAILED** (resolved.ok true) | B04 invented-handle **FAILED** (bind succeeded) | SHA restored; focused test **PASS** |
| 2 | `verifyContentObservationsCurrent` always returns ok | — | B08 **FAILED** (stale accepted) | SHA restored; B08 **PASS** |

No independent downstream escape required weakening. Tree clean after restores.

### A01/A02 amendments

- A01: `types.ts` remains types-only; runtime modules allowlisted and import-inspected.
- A02: `dist/reasoning/types.js` empty; `dist/reasoning/index.js` exports exactly the five runtime functions; package `exports` remains `["."]`.
- A03 unchanged; T01–T12 preserved.

---

## 8. Canonical verification

| Attempt | Result |
|---|---|
| 1 | FAIL — unused import + readonly cast in `gate.test.ts` (typecheck) |
| 2 (after owned fix) | **PASS** — exit 0 |

| Stage | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| tests | **81/81 files**, **774/774 tests**, zero required failures/skips |
| cli:smoke | PASS |
| ledger:verify | PASS at `4015021ac86c33a4f93640be3dedc9ee32666c1b` |
| Scheduling | unchanged (`maxWorkers=2`) |
| Duration (vitest) | 77.73s |

### Runtime totals

| Metric | Phase 5A baseline | Final | Delta |
|---|---|---|---|
| Test files | 79 | 81 | +2 (`parse.test.ts`, `gate.test.ts`) |
| Runtime tests | 745 | 774 | +29 |
| Compile-only proofs | T01–T12 preserved | unchanged | 0 |

`COMMITTED_BYTES_MATCH_TESTED=yes` for load-bearing sources at check HEAD `4015021…`.

---

## 9. Non-claims / honest limits

- Successful binding authenticates references relative to the held trusted catalog/context only.
- Does not certify arbitrary prose, semantic truth, task success, or action permission.
- No cryptographic attestation; no hostile same-process host proof; no whole-tree seal.
- CONTAINS search deferred; DEFINES/BEHAVES execution outstanding; Gate 2 not started.
- No provider, orchestration, edit, process execution, persistence, or phase promotion.

---

## 10. Final state

- Branch: `cursor/phase5b-reference-binding`
- Implementation HEAD (pre-report): `4015021ac86c33a4f93640be3dedc9ee32666c1b`
- Main after authorized FF: `7fcbf11fb81ce275f58011c724ea6c156eb8d177` (Phase 5A types-only checkpoint only)
- Phase 5B runtime commits remain on the feature branch only
- No push; no Gate 2 / 5C; worktree clean after report commit
