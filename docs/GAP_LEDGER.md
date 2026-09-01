# PATH CODE — GAP LEDGER V0

## Status

**ACTIVE**

**DOCUMENT-ONLY**

**NO RUNTIME AUTHORITY**

## Purpose

Record known engineering limitations and deferred obligations before they can be forgotten or reconstructed after the fact.

The Gap Ledger does **not** decide correctness.

**Review** classifies gaps.

---

## GAP RECORD FORMAT

Every entry should contain:

- Gap ID
- Discovered in / source checkpoint
- Description
- Evidence / observation
- Implementer proposed class, if any
- Review classification
- Lifecycle state
- Why blocking/non-blocking
- Required condition to close
- Assigned closure phase/environment if one exists
- Closed by checkpoint if closed
- Notes

---

## INITIAL GAP LEDGER

---

### GAP-001 — Git executable resolution

**Discovered in / source:** Phase 1D / Phase 2C

**Description:** Git executable still resolves through inherited PATH.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Fixed Git command vocabulary and execFile-only architecture remain intact.

**Required condition to close:** Deliberate executable-resolution/pinning policy plus adversarial evidence.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-002 — Live Windows filesystem validation

**Discovered in / source:** Phase 2A / 2B / 2D / 2E

**Description:** No live supported Windows environment integration suite has been executed.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Core path and inventory semantics are tested on available platforms; Windows-specific behavior is not yet established.

**Required condition to close:** Live supported Windows environment and platform-specific integration suite.

**Assigned closure phase/environment:** External Windows host

**Notes:** —

---

### GAP-003 — Case-insensitive filesystem behavior

**Discovered in / source:** Phase 2A / 2C

**Description:** Case-insensitive filesystem and Git/core.ignorecase interaction not validated on representative hosts.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Locale-independent lexical comparators are locked; case-folding filesystem semantics remain unproven on target hosts.

**Required condition to close:** Case-insensitive filesystem validation matrix including Git/core.ignorecase.

**Assigned closure phase/environment:** External case-insensitive filesystem host

**Notes:** —

---

### GAP-004 — Invalid-encoding pathname bytes

**Discovered in / source:** Phase 2A / 2C

**Description:** Raw pathname byte sequences with invalid encoding are not modeled with a deliberate policy.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Current bounded claims do not assert universal pathname-byte coverage.

**Required condition to close:** Deliberate raw-path-byte model or explicit permanent unsupported-path policy.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-005 — Hostile TypeScript assertions

**Discovered in / source:** Pre-2A onward

**Description:** `as unknown as TrustedType` can bypass compile-time brands intentionally.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** TypeScript is not a security sandbox. Normal architectural bypasses remain forbidden.

**Required condition to close:** N/A — intentional permanent limitation.

**Assigned closure phase:** N/A

**Notes:** Compile-time brands remain the primary production guard; hostile casts are out of scope for TypeScript alone to prevent.

---

### GAP-006 — Single-directory readdir memory

**Discovered in / source:** Phase 2A

**Description:** Directory enumeration loads a single readdir result into memory per directory.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Inventory hard ceilings bound worst-case observation count; correctness claims remain valid within declared bounds.

**Required condition to close:** Bounded/streamed deterministic directory enumeration design if required.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-007 — Unpruned dependency trees may exhaust inventory budget

**Discovered in / source:** Phase 2A

**Description:** Large dependency trees (e.g. `node_modules`) may consume inventory observation budget before project-owned entries are fully observed.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Why non-blocking:** PARTIAL inventory completion is explicit; no false COMPLETE claim is made.

**Required condition to close:** Evidence-backed pruning/priority policy after sufficient repository metadata exists.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-008 — Filesystem may mutate during already-open read

**Discovered in / source:** Phase 2B

**Description:** Content may change between stat/open and read completion.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Current hash describes bytes actually observed, not an atomic repository snapshot.

**Required condition to close:** Platform-specific stronger atomic observation mechanism if ever required.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-009 — dev/ino portability

**Discovered in / source:** Phase 2B

**Description:** Entry identity assumptions tied to dev/ino semantics are not validated across Windows/network/virtual filesystems.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Stale-entry detection remains best-effort within tested environments.

**Required condition to close:** Windows/network/virtual filesystem validation and identity-policy review.

**Assigned closure phase/environment:** External representative filesystem hosts

**Notes:** —

---

### GAP-010 — Global concurrent reader memory budget

**Discovered in / source:** Phase 2B

**Description:** No orchestration-level concurrent reader memory budget exists across parallel operations.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Why non-blocking:** Per-read bounds remain enforced; no unbounded parallel read API is exposed in Phase 2.

**Required condition to close:** Future orchestration/concurrency budget if measurements require it.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-011 — Binary classifier is deterministic but not universal

**Discovered in / source:** Phase 2B

**Description:** Binary vs text classification uses a fixed deterministic rule, not universal format detection.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** Current definition is explicit: valid UTF-8 without NUL → TEXT; otherwise supported binary classifications.

**Required condition to close:** N/A — not a universal file-format detector by design.

**Assigned closure phase:** N/A

**Notes:** —

---

### GAP-012 — Repository content above 1 MiB is not fully observed

**Discovered in / source:** Phase 2B

**Description:** Reader hard ceiling rejects full observation of content above 1 MiB.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** TOO_LARGE outcomes are explicit; no silent truncation claim is made.

**Required condition to close:** Deliberate large-content architecture decision if product requirements need it.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-013 — Close-failure runtime falsification

**Discovered in / source:** Phase 2B

**Description:** Deterministic production-safe test seam for read close-failure paths is not established.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure vocabulary exists; runtime falsification of close failure remains incomplete.

**Required condition to close:** Deterministic test seam that does not widen production architecture.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-014 — Denied Git path bytes may enter process memory

**Discovered in / source:** Phase 2C

**Description:** When command-level pathspec exclusion is not expressible, Git may emit denied bytes before authoritative parser rejection.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Denied path cannot cross parser visibility boundary into Path Code knowledge.

**Required condition to close:** Stronger Git-side literal exclusion mechanism if one becomes available.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-015 — Git baseline fixed output ceiling

**Discovered in / source:** Phase 2C

**Description:** Repositories exceeding 16 MiB path-bearing Git output fail baseline collection.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure is explicit; no partial silent Git state is presented as complete.

**Required condition to close:** Deliberate scalable Git-state transport if real repositories require it.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-016 — Git timeout runtime falsification absent

**Discovered in / source:** Phase 2C / 2C-H1

**Description:** Fixed-Git timeout behavior is not deterministically falsified at runtime.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Timeout bounds exist in architecture; falsification seam remains incomplete.

**Required condition to close:** Safe fixed-Git timeout test mechanism without generic process execution.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-017 — Global/system Git ignore semantics excluded

**Discovered in / source:** Phase 2C

**Description:** Global and system Git ignore configuration is excluded from deterministic Phase 1D semantics.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** Current Phase 1D deterministic semantics sanitize global/system Git config.

**Required condition to close:** N/A unless policy changes — then reopen as architectural decision.

**Assigned closure phase:** N/A

**Notes:** If policy changes later, this gap must be reopened as an architectural decision.

---

### GAP-018 — Recursive submodule state not observed

**Discovered in / source:** Phase 2C

**Description:** Nested/recursive submodule Git state is not observed.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2C claims are bounded to supported Git baseline scope.

**Required condition to close:** Explicit submodule engineering capability if required.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-019 — Multiple independent nested Git roots

**Discovered in / source:** Phase 2C

**Description:** Workspaces with multiple independent nested Git roots are not modeled.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Single discovered repository root remains the supported model.

**Required condition to close:** Explicit multi-repository workspace model.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-020 — check-ignore batching performance near inventory ceiling

**Discovered in / source:** Phase 2C-H1

**Description:** check-ignore batching at scale near inventory ceiling is not performance-characterized.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Why non-blocking:** Correctness and bounds remain intact; performance at extreme scale is unknown.

**Required condition to close:** Measurement on large repositories followed by optimization only if necessary.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-021 — Non-JSON manifests are not semantically parsed

**Discovered in / source:** Phase 2D

**Description:** UNPARSED_TEXT manifests are read but not semantically parsed for OBSERVED identity.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Limitation is explicit; INFERRED-only ecosystem claims remain labeled.

**Required condition to close:** Deliberately approved parser capability for each ecosystem if required.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-022 — JSONC tsconfig is not parsed

**Discovered in / source:** Phase 2D

**Description:** tsconfig.json with JSONC syntax fails JSON.parse and yields explicit parse failure.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure mode is explicit, not silent UNKNOWN.

**Required condition to close:** Deliberate JSONC parser decision or TypeScript-native configuration parser architecture.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-023 — No dependency-tree/version compatibility reasoning

**Discovered in / source:** Phase 2D

**Description:** Declared dependencies are observed only as declarations; no lockfile/tree/version reasoning exists.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2D claims remain declaration-only by design.

**Required condition to close:** Future dependency-intelligence capability if explicitly required.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-024 — Lexical inference registries are intentionally incomplete

**Discovered in / source:** Phase 2D

**Description:** Fixed extension and manifest-name inference registries do not cover all ecosystems or markers.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Absence of inference is not evidence of absence; UNKNOWN remains explicit.

**Required condition to close:** Evidence-backed registry expansion only when justified.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-025 — Metadata content ceiling

**Discovered in / source:** Phase 2D

**Description:** Manifest observations above 256 KiB are rejected by metadata operation.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** TOO_LARGE and PARTIAL metadata are explicit.

**Required condition to close:** Deliberate bound change with evidence if real manifests require it.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-026 — Manifest-attempt ceiling

**Discovered in / source:** Phase 2D

**Description:** More than 128 manifest candidates may yield PARTIAL metadata.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** MANIFEST_LIMIT_REACHED is explicit.

**Required condition to close:** Evidence-backed bound/selection change if real monorepos require it.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-027 — RepositoryMap is not a stable serialized format

**Discovered in / source:** Phase 2D

**Description:** RepositoryMap exists in memory only; no persistence or serialization contract exists.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2 Master Contract defers persistence.

**Required condition to close:** Future persistence/versioning architecture.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-028 — Search is lexical/topological only

**Discovered in / source:** Phase 2E

**Description:** No semantic intent, typo tolerance, synonyms, stemming, fuzzy search, AST/symbol/import search, or general content search.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2E bounded claims are lexical/topological only.

**Required condition to close:** Advanced context/session intelligence or another explicitly approved retrieval phase.

**Assigned closure phase:** Post–Phase 2 retrieval intelligence (not Phase 2E)

**Notes:** Do not solve inside Phase 2E.

---

### GAP-029 — Search performance at maximum corpus is not characterized

**Discovered in / source:** Phase 2E

**Description:** Lexical search performance near Phase 2A's 50,000-observation ceiling is not benchmarked.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Why non-blocking:** Algorithmic bounds are declared; product performance at max scale is unknown.

**Required condition to close:** Benchmark near Phase 2A's 50,000-observation ceiling if performance becomes a product requirement.

**Assigned closure phase:** (not assigned)

**Notes:** —

---

### GAP-030 — Freshness is not yet implemented

**Discovered in / source:** Phase 2A–2E

**Description:** No freshness or snapshot-integrity engine exists; RI-008 remains deferred.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Deferred by frozen Master Contract until Phase 2F.

**Required condition to close:** RI-008 and freshness/snapshot evidence.

**Assigned closure phase:** Phase 2F

**Notes:** —

---

### GAP-031 — Snapshot persistence intentionally absent

**Discovered in / source:** Phase 2 Master Contract

**Description:** Repository snapshots remain in memory only; no durable snapshot store exists.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Current Phase 2 rule explicitly forbids persistence in 2A–2F scope.

**Required condition to close:** Advanced session/context persistence architecture.

**Assigned closure phase:** Post–Phase 2 (not Phase 2F)

**Notes:** This MUST NOT be "fixed" in Phase 2F.

---

### GAP-032 — No model-boundary integration audit yet

**Discovered in / source:** Phase 2 Master Contract

**Description:** RI-012 independent integration audit covering model/provider boundaries is not complete.

**Implementer proposed class:** (none recorded at v0)

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Assigned to Phase 2G by frozen contract.

**Required condition to close:** RI-012 independent integration audit.

**Assigned closure phase:** Phase 2G

**Notes:** —

---

## GAP CLOSURE CONDUCT

When a later pass closes a gap:

**Do NOT** delete the record.

Set:

**Lifecycle:** CLOSED

and add:

**Closed by checkpoint:** `<full SHA>`

**Evidence:** `<repository evidence reference>`

History remains visible.

---

## PHASE CLOSURE REQUIREMENT

At Phase 2 closure, every still-open **NON_BLOCKING_LIMITATION** must be individually reviewed.

No bulk statement such as "remaining limitations accepted" is sufficient.

Each must be:

- closed
- explicitly carried
- OPEN_REQUIRES_EXTERNAL_CONDITION
- ACCEPTED_PERMANENT
- scheduled to a later architecture

Nothing silently disappears.
