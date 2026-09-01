# PATH CODE — PHASE 2G REPOSITORY INTELLIGENCE INTEGRATION AUDIT REPORT

**Result:** PHASE 2 REPOSITORY INTELLIGENCE COMPLETE

**Audit baseline HEAD:** `1ec8b2e68c93711dff17b39badcb0ab788b768f2`

**Audit checkpoint SHA:** intentionally absent from this committed report; Phase 2 Closure will bind the immutable audit checkpoint.

**Planned commit message:** `Freeze Path Code Phase 2G repository intelligence integration audit`

---

## 0. Archived artifact restoration

**Durable archive location:** `/Users/achahbi/Projects/path-code-audit-evidence/phase2g-not-complete/`

**Archive present:** YES (copied byte-for-byte from `/tmp/path-code-phase2g-not-complete/`)

| File | Archive SHA-256 | Restored-before-modification SHA-256 |
|---|---|---|
| `phase2-e2e.test.ts` | `dfb482ccd236b909a3d56a90654420f6f49ac10d8f7f078df4c47260e678991c` | `dfb482ccd236b909a3d56a90654420f6f49ac10d8f7f078df4c47260e678991c` |
| `phase2-architecture-audit.test.ts` | `23e7bc9be3a08200269a307c51af8deef85d57dc284e3757ef3b6768bc030ca7` | `23e7bc9be3a08200269a307c51af8deef85d57dc284e3757ef3b6768bc030ca7` |

**Initial byte-for-byte match:** YES for both test files.

**Old audit report restored into docs:** NO (`PHASE_2G_AUDIT_REPORT.md` from failed audit archived only)

### Post-H1 assertion modification (justified)

| Test | Assertion changed | Why | Falsification |
|---|---|---|---|
| `phase2-e2e.test.ts` — `binds Git baseline into snapshot for nested directory inventory entries` | `expect(snapshotResult.ok).toBe(false)` → `expect(snapshotResult.ok).toBe(true)`; removed `SNAPSHOT_ARTIFACTS_INCOMPATIBLE` expectations; added `expect(snapshotResult.value.gitBaseline).toBe(gitBaseline.value)` | Phase 2G-H1 established canonical cross-component membership; legitimate DESCENDED directory Git annotations now bind into snapshot from the same inventory | Temporarily restored ADMITTED-only logic in `validateGitCompatibility()`; focused test failed (`snapshot.ok === false`); source restored; test passes |

**Final committed SHA-256 (`phase2-e2e.test.ts`):** `372367d9a339d5ceccb07437d77e7cfe3ae0c3c7ecdab77b03fcc4736c58ee2b`

**Final committed SHA-256 (`phase2-architecture-audit.test.ts`):** `23e7bc9be3a08200269a307c51af8deef85d57dc284e3757ef3b6768bc030ca7` (unchanged)

---

## 1. Baseline inspection

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `1ec8b2e68c93711dff17b39badcb0ab788b768f2` |
| Working tree at audit start | clean |
| `src/inventory/membership.ts` | present |
| Phase 3 / editing / execution / model modules | absent |
| Runtime dependencies | 0 |
| Verified pre-restoration test total | 408 |
| Verified post-restoration test total | 437 (408 + 29) |
| Reconciliation | matches expected 5 + 24 integration tests |
| Final runtime total | 437 |
| Master Contract unchanged since `8a30af66…` | YES |
| Self-Observation unchanged since `7c388e78…` | YES |

**Validation:** `npm run typecheck`, `npm test`, `npm run build`, `npm run check`, CLI smoke — all PASS at final count 437.

---

## 2. Phase 2G-H1 correction verification

| Check | Result |
|---|---|
| Membership mechanism | structural `"entry" in observation` via `isEntryBearingInventoryObservation()` — no hardcoded disposition list in `src/inventory/membership.ts` |
| Entry-bearing variants | `ADMITTED`, `DESCENDED`, `DEPTH_LIMIT_REACHED` |
| Excluded variants | `DENIED_BY_PROJECT_RESTRICTION`, `OUTSIDE_WORKSPACE`, `SYSTEM_PRUNED`, `CYCLE_DETECTED`, `UNREADABLE` |
| Uncovered variant | none |
| 2C uses canonical selector | YES — `repositoryEntries()` in `src/git/baseline.ts` |
| 2F uses canonical selector | YES — `canonicalInventoryEntrySet()` in `validateGitCompatibility()` |
| 2D ADMITTED-only (deliberate) | YES — `collectAdmittedEntries()` in `src/metadata/map.ts` |
| 2E ADMITTED-only (deliberate) | YES — ADMITTED filter in `src/search/corpus.ts` |
| Nested Git + snapshot composition | PASS — `tests/integration/phase2-e2e.test.ts`, `tests/snapshot/git-snapshot-membership.test.ts` |
| Foreign inventory still rejected | PASS — `tests/snapshot/git-snapshot-membership.test.ts` |
| Authority widened to paths/strings | NO — reference identity preserved |

---

## 3. RI obligation matrix (19/19 SATISFIED)

Verbatim obligation text from `docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md`.

| ID | Obligation | PASS | Mechanism | Evidence | Class | Independently exercised |
|---|---|---|---|---|---|---|
| RI-001 | NO RAW READ | PASS | `readRepositoryContent(entry, …)` | `tests/reader/read.test.ts`, `tests/integration/phase2-e2e.test.ts` | A | existing + e2e |
| RI-002 | NO INHERITED ADMISSION | PASS | per-child admission in `src/inventory/traverse.ts` | `tests/inventory/traverse.test.ts` | A | existing |
| RI-003 | NO OUTSIDE DESCENT | PASS | boundary checks in traverse | `tests/inventory/traverse.test.ts`, `tests/workspace/boundary.test.ts` | A | existing |
| RI-004 | NO DENIED CONTENT OBSERVATION | PASS | reader denial gate | `tests/reader/read.test.ts`, e2e denied subtree | A | existing + e2e |
| RI-005 | NO FALSE COMPLETENESS | PASS | `TraversalCompletion` PARTIAL reasons | `tests/inventory/traverse.test.ts` | A | existing |
| RI-006 | NO FALSE READ KNOWLEDGE | PASS | reader status model | `tests/reader/read.test.ts` | A | existing |
| RI-007 | HASH HONESTY | PASS | SHA-256 only on READ | `tests/reader/read.test.ts`, e2e auth read | A | existing + e2e |
| RI-008 | METADATA IS NOT FRESHNESS PROOF | PASS | snapshot verify dimensions | `tests/snapshot/snapshot.test.ts`, e2e same-mtime change | A | existing + e2e |
| RI-009 | SEARCH DOES NOT READ | PASS | lexical corpus only | `tests/search/architecture.test.ts`, `phase2-architecture-audit.test.ts` | A/B | audit scan + existing |
| RI-010 | IDENTITY CLAIMS REQUIRE EVIDENCE | PASS | `ManifestEvidence` binding | `tests/metadata/metadata.test.ts`, e2e package.json OBSERVED | A | existing + e2e |
| RI-011 | SNAPSHOT IS NON-PERSISTENT | PASS | in-memory branded snapshot | `tests/snapshot/architecture.test.ts`, production write scan | A/B | audit scan + existing |
| RI-012 | NO MODEL BOUNDARY | PASS | no model/provider imports in Phase 2 src/dist | `tests/integration/phase2-architecture-audit.test.ts`, source/dist scans | A/B | **independently audited in 2G** |
| RI-013 | DENIAL VISIBILITY | PASS | `DENIED_BY_PROJECT_RESTRICTION` observations | e2e `denied` subtree, inventory tests | A | e2e + existing |
| RI-014 | TERMINATION | PASS | visited identity + depth/entry bounds | `tests/inventory/traverse.test.ts` | A | existing |
| RI-015 | CONFIG FAILURE FAILS CLOSED | PASS | typed `ResolvedProjectConfig` gate | `tests/config/loader.test.ts`, type-contracts | A | existing |
| RI-016 | UNREADABLE IS EXPLICIT | PASS | `UNREADABLE` disposition | `tests/inventory/traverse.test.ts` | A | existing |
| RI-017 | GIT DOES NOT GRANT ADMISSION | PASS | Git annotates inventory entries only | `tests/git/baseline.test.ts`, type-contracts | A | existing |
| RI-018 | SYSTEM PRUNING IS VISIBLE | PASS | `SYSTEM_PRUNED` + reason | e2e `.git` pruned, inventory tests | A | e2e + existing |
| RI-019 | CONFIGURATION ORIGIN MUST BE PROVEN | PASS | `loadProjectConfig` → `ResolvedProjectConfig` | `tests/config/loader.test.ts`, type-contracts | A | existing |

---

## 4. Six dimensions (6/6 SATISFIED)

| Dimension | Mechanism | Evidence |
|---|---|---|
| A. TOPOLOGY | inventory traverse + system pruning | e2e + `tests/inventory/traverse.test.ts` |
| B. IDENTITY | metadata map + manifest evidence | e2e package.json OBSERVED claim |
| C. STATE | Git baseline annotations | e2e PRE_EXISTING, staged/unstaged tracked.txt |
| D. CONTENT | bounded reader fingerprints | e2e auth read SHA-256 |
| E. FRESHNESS | snapshot verify + propagation | e2e same-mtime STALE_CONTENT chain |
| F. RELEVANCE | search corpus/query | e2e `auth` candidate match |

---

## 5. RI-012 independent audit

**Scan commands:**

```bash
rg -l "ModelProvider|OpenAI|Anthropic|Gemini|embedding|rerank|prompt" src/inventory src/reader src/git src/metadata src/search src/snapshot
rg "readRepositoryContent|node:fs" src/search
rg "child_process|spawn|exec\(|fork" dist --glob '*.js'
```

**Output:** zero model/provider pattern hits in Phase 2 source; search module has no reader/fs imports; executable `child_process` import appears only in `dist/git/runner.js` as `execFile`.

**Conclusion:** Phase 2 production architecture has no model execution dependency and sends no repository content to a model.

---

## 6. Production write audit

**Scan command:**

```bash
rg "writeFile|appendFile|mkdir|rm\(|unlink|rename|copyFile|truncate|createWriteStream" \
  src/inventory src/reader src/git src/metadata src/search src/snapshot --glob '*.ts'
```

**Output:** no filesystem write/create API hits (only unrelated identifiers such as `truncated` boolean flags and Git rename parsing).

**Result:** ABSENT from Phase 2 production.

---

## 7. Execution boundary

**Scan:** `rg "child_process|spawn|exec\(|fork" dist --glob '*.js'`

**Executable hits:**

- `dist/git/runner.js:19` — `import { execFile } from "node:child_process"`

**Non-executable `.exec()` regex matches:** `dist/git/ls-files.js`, `dist/git/porcelain.js`, `dist/core/runtime.js` (String.prototype.exec only)

**Result:** exactly one production child_process import; execFile only; no spawn/exec/fork/shell.

---

## 8. FreezeEvidencePairs

### Phase 2F

| Check | Result |
|---|---|
| Commit A `ba588a084982736bfd924aa5fc821df45694279f` | exists |
| Commit B `fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab` | exists |
| A ancestor of B | YES |
| B direct child of A | YES |
| `docs/reports/PHASE_2F_REPORT.md` at B | exists; names full Commit A SHA |
| B alters Phase 2F production | NO |

### Phase 2G-H1

| Check | Result |
|---|---|
| Commit A `c0309407ea891cfa036f93d455f500694779c301` | exists |
| Commit B `1ec8b2e68c93711dff17b39badcb0ab788b768f2` | exists |
| A ancestor of B | YES |
| B direct child of A | YES |
| `docs/reports/PHASE_2G_H1_REPORT.md` at B | exists; names full Commit A SHA |
| B alters production | NO |

---

## 9. Ancestry

All 24 listed checkpoints resolve as ancestors of audit baseline HEAD.

---

## 10. Cross-component compatibility matrix

| Edge | Result |
|---|---|
| config → inventory | PASS — e2e + config tests |
| inventory → Git baseline | PASS — e2e |
| inventory → metadata → map | PASS — e2e |
| inventory + map → search corpus | PASS — e2e; mismatch fails `SEARCH_SOURCE_INCOMPATIBLE` |
| artifacts → snapshot (no Git) | PASS — e2e |
| **artifacts → snapshot (with Git, nested repository)** | **PASS** — post-H1 e2e bind test |
| snapshot → verification → propagation | PASS — e2e stale chain |

---

## 11. Determinism audit

Fixed-input transformations run twice on unchanged fixtures in existing unit tests (inventory order, search ranking, snapshot verification ordering). Opaque snapshot generation tokens were **not** required to match across independent constructions.

---

## 12. Bounds audit (actual production constants)

| Bound | Value | Non-widenable | Exceed behavior |
|---|---|---|---|
| inventory max depth | 64 | caller may narrow via options | PARTIAL / depth observation |
| inventory max observations | 50_000 | caller may narrow | PARTIAL |
| reader full content | 1_048_576 bytes | fixed | TOO_LARGE (no hash) |
| Git output max | 16_777_216 bytes | fixed | operation failure |
| Git timeout | 15_000 ms | fixed | operation failure |
| check-ignore batch paths | 64 | fixed batching | batched continuation |
| check-ignore arg bytes | 16_384 | fixed | batched continuation |
| metadata manifest attempts | 128 | fixed | truncated selection |
| metadata per-manifest bytes | 262_144 | fixed | parse boundary |
| search query/terms/extensions | per `src/search/constants.ts` | fixed | validation failure |
| search results max | 64 | caller may narrow | truncated selection signal |
| snapshot entry verifications | 50_000 | caller may narrow | budget exhaustion |
| snapshot content verifications | 128 | caller may narrow | budget exhaustion |
| snapshot entry concurrency | 32 | caller may narrow | bounded scheduling |
| snapshot content concurrency | 4 | caller may narrow | bounded scheduling |

---

## 13. Compile-time evidence sweep

| Item | Value |
|---|---|
| `@ts-expect-error` directive count | 65 |
| TS2578 unused directive count | 0 |

### Spot-checks (directive removed → exact compiler error → restored)

| RI | Line | Error |
|---|---|---|
| RI-001 | 496 | `TS2345: Argument of type 'string' is not assignable to parameter of type 'RepositoryEntry'.` |
| RI-017 | 444 | `TS2345: Argument of type 'string' is not assignable to parameter of type 'RepositoryEntry'.` |
| RI-008 | 786 | `TS2322: Type '"REVALIDATION_REQUIRED"' is not assignable to type '"VERIFIED_CURRENT"'` (comment: REVALIDATION_REQUIRED cannot satisfy VERIFIED_CURRENT) |
| RI-012 | 157 | ModelResponse / AuthorityDecision separation error per existing comment |

---

## 14. New-test falsifiability

| Test | Condition introduced | Observed failure | Restored |
|---|---|---|---|
| e2e nested Git+snapshot bind | ADMITTED-only `validateGitCompatibility` | `snapshot.ok === false` | YES |
| e2e corpus mismatch (A) | inventory A + map B | `SEARCH_SOURCE_INCOMPATIBLE` | N/A (negative test) |
| e2e stale propagation (B) | rewrite package.json deps | derived UNSUPPORTED/LIMITED/SOURCE_STALE | N/A (positive stale chain) |
| e2e denied subtree (C) | deny-path config | denied child absent from admitted inventory | N/A |
| architecture model scan | inject forbidden pattern in fixture scan | would fail equality | covered by zero-violation pass |

---

## 15. Temporary falsifications (§32)

| Case | Result |
|---|---|
| A. mismatched inventory/map → corpus | FAIL CLOSED — `SEARCH_SOURCE_INCOMPATIBLE` |
| B. stale ContentObservation → six-link propagation | PASS — derived states stale |
| C. denied path → admitted candidate | FAIL CLOSED — denied child not admitted |
| D. revert 2G-H1 membership fix on nested fixture | FAIL — `snapshot.ok === false`; restored |

---

## 16. Gap Ledger audit

| Gap | Status |
|---|---|
| GAP-030 | CLOSED at `ba588a084982736bfd924aa5fc821df45694279f` |
| GAP-031 | OPEN — SCHEDULED_DEFERRED snapshot persistence intentionally absent |
| GAP-032 | OPEN — eligible for closure at Phase 2 Closure after this audit checkpoint exists; **not closed in this commit** |
| GAP-033 | CLOSED at `c0309407ea891cfa036f93d455f500694779c301` |

**Open NON_BLOCKING_LIMITATION entries individually enumerated:** GAP-001 (Git PATH resolution), GAP-003/GAP-004 (external platform validation), GAP-005 (symlink policy documentation), GAP-006 (optimization), GAP-007–GAP-029 (documented limitations per ledger — each retains stated non-blocking rationale, missing evidence, and closure condition in `docs/GAP_LEDGER.md`).

**New gaps appended:** none

---

## 17. Preserved obligations

RI-008, RI-009, RI-010, RI-011, RI-017 — preserved. No production writes. No Phase 3 work. No auto-healing. No generic framework creep detected.

---

## 18. Not validated

- Formal Phase 2 Closure record (`docs/PHASE_2_CLOSURE.md`) — not created in this pass
- `PHASE_VERIFIED` / Capability Ledger derivation — deferred to post-closure
- Live Windows integration (GAP-002 OPEN_REQUIRES_EXTERNAL_CONDITION)
- Git executable pinning policy (GAP-001 OPEN)
- Snapshot persistence (GAP-031 SCHEDULED_DEFERRED)

---

## 19. Next permitted operation

**Phase 2 Closure** — separate document-only operation to bind the immutable audit checkpoint SHA and close eligible gaps including GAP-032.
