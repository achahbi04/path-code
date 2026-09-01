# PATH CODE — PHASE 2G-H1 ENGINEERING REPORT

**Result:** PASS

**Failed-audit baseline:** `fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab`

**Implementation Commit A:** `c0309407ea891cfa036f93d455f500694779c301`

**Evidence Commit B:** (this document-only commit)

---

## Blocking finding

A valid Phase 2C `GitStateBaseline` could not bind into a Phase 2F `RepositorySnapshot` for an ordinary nested repository when Git legitimately annotated a **DESCENDED** directory `RepositoryEntry` from the same inventory.

**Review classification:** BLOCKING_INVARIANT

**Blocking trigger:** B — downstream work would inherit a false assumption.

**Local frozen invariant independently violated:** NO (neither 2C nor 2F violated its local contract in isolation)

**Downstream false assumption:** "A Git baseline produced from a `RepositoryInventory` is always compatible with a `RepositorySnapshot` built from that same inventory."

**Original symptom:** `SNAPSHOT_ARTIFACTS_INCOMPATIBLE`

**Root defect:** The canonical cross-component `RepositoryEntry` membership set was never declared as a shared inventory-layer contract. Phase 2C annotated every entry-bearing observation; Phase 2F validated Git annotation membership against an ADMITTED-only subset.

---

## Files changed (Commit A)

**Added**

- `src/inventory/membership.ts`
- `tests/inventory/membership.test.ts`
- `tests/snapshot/git-snapshot-membership.test.ts`

**Modified**

- `src/inventory/index.ts` — export canonical membership helpers
- `src/git/baseline.ts` — use shared `repositoryEntries()` instead of local disposition list
- `src/snapshot/snapshot.ts` — `validateGitCompatibility()` uses `canonicalInventoryEntrySet()`

---

## Canonical membership

**Inventory source of truth:** `src/inventory/membership.ts`

**Helper / type guard:**

- `isEntryBearingInventoryObservation(observation)` — structural `"entry" in observation`
- `repositoryEntries(inventory)` — actual earned `RepositoryEntry` references from entry-bearing observations
- `canonicalInventoryEntrySet(inventory)` — `ReadonlySet` of the same references

**Entry-bearing variants (included):**

- `ADMITTED`
- `DESCENDED`
- `DEPTH_LIMIT_REACHED`

**Excluded non-entry variants (representative):**

- `DENIED_BY_PROJECT_RESTRICTION`
- `OUTSIDE_WORKSPACE`
- `SYSTEM_PRUNED`
- `CYCLE_DETECTED`
- `UNREADABLE`

**Hardcoded disposition list introduced:** NO — selection is structural entry-bearing observation membership.

---

## Cross-component membership matrix

| Component | Before H1 | After H1 | Changed? |
|---|---|---|---|
| **2C Git baseline** | Entry-bearing observations via local hardcoded disposition helper (`ADMITTED`, `DESCENDED`, `DEPTH_LIMIT_REACHED`) | Same semantic via shared `repositoryEntries(inventory)` | YES (shared source; semantics unchanged) |
| **2D RepositoryMap** | `collectAdmittedEntries()` — ADMITTED only (intentional map-file subset) | Same ADMITTED-only derivation | NO |
| **2E RepositorySearchCorpus** | ADMITTED-only candidate derivation (intentional search subset) | Same ADMITTED-only derivation | NO |
| **2F snapshot Git validation** | ADMITTED-only via `collectAdmittedEntries()` | `canonicalInventoryEntrySet(inventory)` — all entry-bearing observations | YES |

---

## Positive regression

Nested repository fixture: `src/example.ts` inside a real Git worktree.

- Real Phase 2A inventory and Phase 2C Git baseline from the same inventory
- Phase 2F `buildRepositorySnapshot` with map, corpus, Git baseline, and content observations
- **Result:** SUCCESS — no `SNAPSHOT_ARTIFACTS_INCOMPATIBLE`
- DESCENDED directory Git annotation binds correctly

---

## Negative regression

Two inventories (`rootA`, `rootB`) with coincidentally identical lexical path `same.txt`.

- Git baseline built from inventory B
- Snapshot attempted with inventory A + Git baseline B
- **Result:** `SNAPSHOT_ARTIFACTS_INCOMPATIBLE` — reference identity / provenance mismatch still fails closed

---

## Union coverage

| Variant | Canonical membership |
|---|---|
| ADMITTED | included |
| DESCENDED | included |
| DEPTH_LIMIT_REACHED (when entry-bearing) | included |
| DENIED_BY_PROJECT_RESTRICTION | excluded |
| OUTSIDE_WORKSPACE | excluded |
| SYSTEM_PRUNED | excluded |
| CYCLE_DETECTED | excluded |
| UNREADABLE | excluded |

Cross-component coherence test verifies Git annotations, map entries, and search corpus admitted entries are all members of the canonical set (map/search remain ADMITTED subsets ⊆ canonical set).

---

## Original defect falsification

1. Corrected nested Git+snapshot integration test **PASS**
2. Temporarily restored pre-H1 ADMITTED-only logic in `validateGitCompatibility()` (`new Set(collectAdmittedEntries(inventory))`)
3. Focused test **FAIL** — `binds nested Git baseline into snapshot from the same inventory` received `snapshot.ok === false`
4. Corrected source restored
5. Focused test **PASS**
6. Temporary diff removed; full suite **PASS**

---

## Archived failed-audit artifacts

**Archive path:** `/tmp/path-code-phase2g-not-complete/`

| File | SHA-256 |
|---|---|
| `phase2-e2e.test.ts` | `dfb482ccd236b909a3d56a90654420f6f49ac10d8f7f078df4c47260e678991c` |
| `phase2-architecture-audit.test.ts` | `23e7bc9be3a08200269a307c51af8deef85d57dc284e3757ef3b6768bc030ca7` |
| `PHASE_2G_AUDIT_REPORT.md` | `c416d3e5fff3315ca952424f0dcd463a4b0c81a2397ea58bd713856134dacf16` |

**E2E test preserved byte-for-byte:** archived outside repo; not restored during H1

**Architecture audit test preserved byte-for-byte:** archived outside repo; not restored during H1

**Repository working tree cleaned before H1:** YES at `fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab`

---

## Test totals

| Metric | Count |
|---|---|
| Verified baseline runtime total | 402 |
| H1 runtime delta | +6 |
| Final runtime total | 408 |

---

## Preserved obligations

| Obligation | Status |
|---|---|
| RI-008 | preserved — verification dimensions unchanged |
| RI-009 | preserved — search corpus semantics unchanged |
| RI-010 | preserved — map derivation unchanged |
| RI-011 | preserved — Git annotates only; no admission |
| RI-017 | preserved — execFile-only Git; no mutation |

No production writes. No snapshot persistence. No Git execution from snapshot. No Phase 3 work.

---

## Validation (post Commit A)

| Check | Result |
|---|---|
| typecheck | PASS |
| unit / integration / adversarial / failure suites | PASS (408) |
| build | PASS |
| full check | PASS |
| CLI smoke | PASS |

---

## Not Validated

- Phase 2G full repository intelligence integration audit (NOT COMPLETE — must be rerun after H1)
- Archived Phase 2G integration tests not yet restored byte-for-byte into the repository
- RI-012 model-boundary integration audit (GAP-032 remains OPEN)
- Live Windows filesystem integration (GAP-002 remains OPEN_REQUIRES_EXTERNAL_CONDITION)
- Phase 2 closure document / PHASE 2 COMPLETE claim

---

## Gap Ledger

**GAP-033 added:** Canonical cross-component RepositoryEntry membership was undeclared, causing Git/snapshot incompatibility

**Review classification:** BLOCKING_INVARIANT

**Lifecycle before Commit A:** OPEN

**Lifecycle after Commit B:** CLOSED

**Closed by full Commit A SHA:** `c0309407ea891cfa036f93d455f500694779c301`

**Evidence:** this report

---

## Next permitted operation

**RE-RUN PHASE 2G REPOSITORY INTELLIGENCE INTEGRATION AUDIT** — full audit; restore archived integration tests byte-for-byte and verify archived SHA-256 before execution.
