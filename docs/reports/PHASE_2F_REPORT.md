# PATH CODE — PHASE 2F ENGINEERING REPORT

**Result:** PASS

**Baseline HEAD:** `7c388e7851f0332e0a8bcf73b3481b56088e88f9`

**Implementation Freeze HEAD (Commit A):** `ba588a084982736bfd924aa5fc821df45694279f`

**Evidence ancestry:** `7de4bf07a1cad3215f63d9abb5dedc20d28d2255`, `f166857ff9fe39c9dc9dea82786eb054345e4e27`, `fd324aaca43c054f3577f5c269a6cdf4da56658f`, `d45dd96f68c9f117b4f0de7faaa3ed8c0fabb680`, `bc178d3f3b1c073f8945e032a0a608b500ccadab`, `559499def1d463535e51ebc84a7d370a7ed2f8ee`, `6455d6b1a43b27587325f67d4aff3f12b64a772a`, `d1fb57c8353a98ab032bf5b27a791a92218aecb9`, `8691b7f98fb74a43c0a1e98c6cc10e2b41a51935`, `57980bd3972822f4cbdf9e78fbec31e1f776c445`, `ca35f9dbfbc29cc839ddc7586acbf86fc1af7703`, `8a30af66ba0d0f40d1949342cde2a0fca971c437`, `8272c33a52fd98ab2127e3c14b84a38c2bbb616d`, `784d171ac2187a38ebebfc351bb5d5edc451da55`, `7a204ad6d05ef8ff2bc67f1ea77cfe20f03d8ddb`, `733c4e0bc295746af8529e02ea40b9fe8b224de2`, `c864466b5c27556125a7a4381f18d35929420e0b`, `16e978c4840757c9c5484f75d9de7ab3d688ae2a`, `621b0f47c7d90627721c37f21fc63e2f084d8629`, `7c388e7851f0332e0a8bcf73b3481b56088e88f9`, `ba588a084982736bfd924aa5fc821df45694279f`

**Evidence record:** this report is intended for the subsequent document-only evidence commit.

---

## Summary

Phase 2F adds in-memory `RepositorySnapshot` assembly and bounded `verifyRepositorySnapshot` freshness assessment. Three verification dimensions remain separate: entry identity, content bytes, and derived knowledge. Detection is not correction: no repair, re-inventory, Git execution, or persistence.

---

## Files

**Added:** `src/snapshot/**`, `tests/snapshot/**`

**Modified:** `tests/domain/type-contracts.ts`, `tests/architecture/boundaries.test.ts`

---

## Snapshot

| Item | Evidence |
|---|---|
| earned/opaque | `buildRepositorySnapshot` only; `__repositorySnapshotBrand: never` |
| brand technique | declaration-safe opaque intersection (same as 2A–2E) |
| artifact compatibility validation | map/inventory ref identity; corpus structural ref identity; manifest evidence closure; duplicate baseline observation rejection |
| incompatible artifacts behavior | `SNAPSHOT_ARTIFACTS_INCOMPATIBLE`; no partial bind |
| generation token opaque/in-memory | `SnapshotGeneration` object identity per build; not wall-clock/random/hash derived |
| cross-process/stable generation ID claimed | NO |
| assembledAt recorded | YES; does not claim atomic observation |
| atomic snapshot claim absent | YES |
| dependency closure validation | manifest evidence ContentObservation must resolve in bound set |
| duplicate baseline ContentObservation handling | rejected at build |
| Git baseline optional | YES |

---

## Verification dimensions

| Item | Evidence |
|---|---|
| entry / content / derived separate | distinct branded result types |
| mutually assignable | NO (type-contract falsification C) |
| entry verification opens files | NO |
| entry verification hashes | NO |

---

## RI-008 evidence

| Item | Evidence |
|---|---|
| metadata equality → VERIFIED_CURRENT possible | NO |
| identity-only → VERIFIED_CURRENT possible | NO |
| same-size same-mtime in-place change result | `STALE_CONTENT` on content verify; `REVALIDATION_REQUIRED` on identity-only |
| how the fixture forced equal mtime | `utimes` restored original second-granularity mtime after same-length rewrite |
| size difference → STALE_CONTENT without hash | YES (`lstat` size vs baseline `byteLength`) |
| REVALIDATION_REQUIRED satisfies currency check | NO (type-contract falsification B) |
| downstream inheritance from REVALIDATION_REQUIRED | `UNVERIFIED` via fixed propagation chain |

---

## Content verification

| Item | Evidence |
|---|---|
| reader used | `readRepositoryContent` only |
| second hashing path | NO |
| direct fs content read | NO (only `lstat` pre-check) |
| impossible TOO_LARGE-as-ContentObservation model absent | YES |
| entry with no baseline ContentObservation | `UNVERIFIABLE` / `NO_BASELINE_CONTENT_OBSERVATION` |
| BINARY ContentObservation full-hash verification | supported via same 2B path |
| denied at verification time | `DENIED`; no read |

---

## Budgets

| Item | Value / evidence |
|---|---|
| entry budget | 50_000 |
| content budget | 128 |
| caller may narrow | YES |
| caller may widen | NO |
| failed attempts consume | YES |
| exhaustion state | `PARTIAL` assessment; `NOT_VERIFIED` / `BUDGET_EXHAUSTED` |
| deterministic truncation | locale-independent lexical order |
| entry concurrency ceiling | 32 (sequential implementation satisfies ceiling) |
| content concurrency ceiling | 4 |
| caller may widen concurrency | NO |
| deterministic result order under concurrency | YES (sequential scheduling) |

---

## Scope

| Item | Evidence |
|---|---|
| explicit request required | `VerificationRequest.entries` and `.content` mandatory |
| content NONE performs reads | NO |
| foreign entry | `ENTRY_NOT_IN_SNAPSHOT` |
| unrequested entries state | `NOT_VERIFIED` / `NOT_REQUESTED` |

---

## Propagation

| Item | Evidence |
|---|---|
| fixed six-link chain | ContentObservation → ManifestEvidence → OBSERVED claim → map → corpus → result |
| generic graph/subscriber present | NO |
| stale content → evidence → claim → map → corpus → result | integration test |
| mutation during propagation | NO |

---

## Honesty boundaries

| Item | Evidence |
|---|---|
| new files detectable | NO |
| assessment claims repository unchanged | NO (`repositoryUnchangedClaim: false`) |
| Git baseline currency | `POINT_IN_TIME` only |
| verifiedAt recorded | YES on every result |

---

## No heal / no persistence

| Item | Evidence |
|---|---|
| snapshot repaired | NO |
| observation written back | NO |
| files created | NO |
| write API imported | architecture tests |

---

## Falsifications

| Probe | Compiler error after `@ts-expect-error` removal |
|---|---|
| plain snapshot fabrication (A) | `TS2379`: `RepositorySnapshotData` is not assignable to `RepositorySnapshot` |
| REVALIDATION where VERIFIED_CURRENT required (B) | `TS2345`: `"REVALIDATION_REQUIRED"` is not assignable to `"VERIFIED_CURRENT"` |
| dimension collapse (C) | `TS2345`: `"CURRENT_IDENTITY"` is not assignable to `ContentVerificationState` |
| raw path scope (F) | `TS2322`: `string[]` is not assignable to `readonly RepositoryEntry[] \| "ALL"` |

Sources restored; typecheck green after restoration.

---

## Proof obligations

| Rule | Status |
|---|---|
| RI-008 | CLOSED |
| RI-011 | CLOSED |
| RI-001, RI-007 | preserved (single 2B hashing path) |
| RI-012 | deferred to 2G |
| RI-001–RI-019 otherwise | preserved |

**Local invariants P2F-001–P2F-010:** satisfied by implementation + tests.

---

## Gap Ledger

| Gap | Status |
|---|---|
| GAP-030 | CLOSED at `ba588a084982736bfd924aa5fc821df45694279f` |
| GAP-031 | OPEN / SCHEDULED_DEFERRED (not closed by 2F) |

---

## Validation

| Check | Result |
|---|---|
| previous runtime total | 369 |
| Phase 2F delta | +33 |
| final runtime total | 402 |
| compile-time tests | type-contracts Phase 2F probes |
| typecheck / unit / integration / adversarial / failure | PASS |
| build / full check / CLI smoke / dist audit | PASS |

**Dependencies:** runtime 0; development unchanged (`@types/node`, `tsx`, `typescript`, `vitest`).

**Architecture:** 2A–2E preserved; traversal absent; Git execution absent in 2F; `child_process` absent; model absent; Phase 2G absent; Master Contract unchanged; Self-Observation architecture unchanged.

**Git:** Commit A message exact; working tree clean after Commit A validation; push NO; Phase 2G started NO.

---

## Not validated

- Windows live validation
- dev/ino semantics on Windows, network, and virtual filesystems (GAP-009 remains)
- filesystem timestamp granularity across all hosts (same-size same-mtime test proves rule on this macOS host only)
- cross-process / cross-session snapshot comparison (no persistence by design)
- verification performance at full snapshot scale across all target environments
- hostile TypeScript casts (GAP-005 remains)

---

## Unresolved issues

None blocking Phase 2F freeze.

---

## Next permitted phase

**Phase 2G — Repository Intelligence Integration Audit**

---

## Required honesty statements

1. `RepositorySnapshot` is an in-memory knowledge generation assembled from artifacts observed at different moments; it is **not** an atomic filesystem snapshot.
2. Phase 2F cannot detect entries created since the snapshot; an all-current assessment says nothing about new files.
3. `VERIFIED_CURRENT` is true at the verification moment only; content may change immediately afterward.
4. Content verification is bounded to 128 observations per operation; larger snapshots require multiple deliberate operations.
5. Entries with no baseline `ContentObservation` are `UNVERIFIABLE` for content currentness until a baseline is deliberately earned outside verification.
6. Git baseline currency is not verifiable without recollection by Phase 2C.
7. No persistence exists; GAP-031 remains deliberately open.
