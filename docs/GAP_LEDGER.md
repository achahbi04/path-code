# PATH CODE — GAP LEDGER V1

## Status

**ACTIVE**

**MACHINE-READABLE SOURCE OF TRUTH**

Rendered deterministically from canonical Gap Ledger v1 data.

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

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Fixed Git command vocabulary and execFile-only architecture remain intact.

**Required condition to close:** Deliberate executable-resolution/pinning policy plus adversarial evidence.

---

### GAP-002 — Live Windows filesystem validation

**Discovered in / source:** Phase 2A / 2B / 2D / 2E

**Description:** No live supported Windows environment integration suite has been executed.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Core path and inventory semantics are tested on available platforms; Windows-specific behavior is not yet established.

**Required condition to close:** Live supported Windows environment and platform-specific integration suite.

**Assigned closure phase/environment:** Live supported Windows environment and platform-specific integration suite.

---

### GAP-003 — Case-insensitive filesystem behavior

**Discovered in / source:** Phase 2A / 2C

**Description:** Case-insensitive filesystem and Git/core.ignorecase interaction not validated on representative hosts.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Locale-independent lexical comparators are locked; case-folding filesystem semantics remain unproven on target hosts.

**Required condition to close:** Case-insensitive filesystem validation matrix including Git/core.ignorecase.

**Assigned closure phase/environment:** Case-insensitive filesystem validation matrix including Git/core.ignorecase.

---

### GAP-004 — Invalid-encoding pathname bytes

**Discovered in / source:** Phase 2A / 2C

**Description:** Raw pathname byte sequences with invalid encoding are not modeled with a deliberate policy.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Current bounded claims do not assert universal pathname-byte coverage.

**Required condition to close:** Deliberate raw-path-byte model or explicit permanent unsupported-path policy.

---

### GAP-005 — Hostile TypeScript assertions

**Discovered in / source:** Pre-2A onward

**Description:** `as unknown as TrustedType` can bypass compile-time brands intentionally.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** TypeScript is not a security sandbox. Normal architectural bypasses remain forbidden.

**Required condition to close:** TypeScript is not a security sandbox; hostile casts remain outside the trust model.

**Notes:** Compile-time brands remain the primary production guard; hostile casts are out of scope for TypeScript alone to prevent.

---

### GAP-006 — Single-directory readdir memory

**Discovered in / source:** Phase 2A

**Description:** Directory enumeration loads a single readdir result into memory per directory.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Inventory hard ceilings bound worst-case observation count; correctness claims remain valid within declared bounds.

**Required condition to close:** Bounded/streamed deterministic directory enumeration design if required.

---

### GAP-007 — Unpruned dependency trees may exhaust inventory budget

**Discovered in / source:** Phase 2A

**Description:** Large dependency trees (e.g. `node_modules`) may consume inventory observation budget before project-owned entries are fully observed.

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Required condition to close:** Evidence-backed pruning/priority policy after sufficient repository metadata exists.

---

### GAP-008 — Filesystem may mutate during already-open read

**Discovered in / source:** Phase 2B

**Description:** Content may change between stat/open and read completion.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Current hash describes bytes actually observed, not an atomic repository snapshot.

**Required condition to close:** Platform-specific stronger atomic observation mechanism if ever required.

---

### GAP-009 — dev/ino portability

**Discovered in / source:** Phase 2B

**Description:** Entry identity assumptions tied to dev/ino semantics are not validated across Windows/network/virtual filesystems.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN_REQUIRES_EXTERNAL_CONDITION

**Why non-blocking:** Stale-entry detection remains best-effort within tested environments.

**Required condition to close:** Windows/network/virtual filesystem validation and identity-policy review.

**Assigned closure phase/environment:** Windows/network/virtual filesystem validation and identity-policy review.

---

### GAP-010 — Global concurrent reader memory budget

**Discovered in / source:** Phase 2B

**Description:** No orchestration-level concurrent reader memory budget exists across parallel operations.

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Required condition to close:** Future orchestration/concurrency budget if measurements require it.

---

### GAP-011 — Binary classifier is deterministic but not universal

**Discovered in / source:** Phase 2B

**Description:** Binary vs text classification uses a fixed deterministic rule, not universal format detection.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** Current definition is explicit: valid UTF-8 without NUL → TEXT; otherwise supported binary classifications.

**Required condition to close:** Not a universal file-format detector by design.

---

### GAP-012 — Repository content above 1 MiB is not fully observed

**Discovered in / source:** Phase 2B

**Description:** Reader hard ceiling rejects full observation of content above 1 MiB.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** TOO_LARGE outcomes are explicit; no silent truncation claim is made.

**Required condition to close:** Deliberate large-content architecture decision if product requirements need it.

---

### GAP-013 — Close-failure runtime falsification

**Discovered in / source:** Phase 2B

**Description:** Deterministic production-safe test seam for read close-failure paths is not established.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure vocabulary exists; runtime falsification of close failure remains incomplete.

**Required condition to close:** Deterministic test seam that does not widen production architecture.

---

### GAP-014 — Denied Git path bytes may enter process memory

**Discovered in / source:** Phase 2C

**Description:** When command-level pathspec exclusion is not expressible, Git may emit denied bytes before authoritative parser rejection.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Denied path cannot cross parser visibility boundary into Path Code knowledge.

**Required condition to close:** Stronger Git-side literal exclusion mechanism if one becomes available.

---

### GAP-015 — Git baseline fixed output ceiling

**Discovered in / source:** Phase 2C

**Description:** Repositories exceeding 16 MiB path-bearing Git output fail baseline collection.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure is explicit; no partial silent Git state is presented as complete.

**Required condition to close:** Deliberate scalable Git-state transport if real repositories require it.

---

### GAP-016 — Git timeout runtime falsification absent

**Discovered in / source:** Phase 2C / 2C-H1

**Description:** Fixed-Git timeout behavior is not deterministically falsified at runtime.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Timeout bounds exist in architecture; falsification seam remains incomplete.

**Required condition to close:** Safe fixed-Git timeout test mechanism without generic process execution.

---

### GAP-017 — Global/system Git ignore semantics excluded

**Discovered in / source:** Phase 2C

**Description:** Global and system Git ignore configuration is excluded from deterministic Phase 1D semantics.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** ACCEPTED_PERMANENT

**Why non-blocking:** Current Phase 1D deterministic semantics sanitize global/system Git config.

**Required condition to close:** Intentional permanent limitation unless policy changes.

**Notes:** If policy changes later, this gap must be reopened as an architectural decision.

---

### GAP-018 — Recursive submodule state not observed

**Discovered in / source:** Phase 2C

**Description:** Nested/recursive submodule Git state is not observed.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2C claims are bounded to supported Git baseline scope.

**Required condition to close:** Explicit submodule engineering capability if required.

---

### GAP-019 — Multiple independent nested Git roots

**Discovered in / source:** Phase 2C

**Description:** Workspaces with multiple independent nested Git roots are not modeled.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Single discovered repository root remains the supported model.

**Required condition to close:** Explicit multi-repository workspace model.

---

### GAP-020 — check-ignore batching performance near inventory ceiling

**Discovered in / source:** Phase 2C-H1

**Description:** check-ignore batching at scale near inventory ceiling is not performance-characterized.

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Required condition to close:** Measurement on large repositories followed by optimization only if necessary.

---

### GAP-021 — Non-JSON manifests are not semantically parsed

**Discovered in / source:** Phase 2D

**Description:** UNPARSED_TEXT manifests are read but not semantically parsed for OBSERVED identity.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Limitation is explicit; INFERRED-only ecosystem claims remain labeled.

**Required condition to close:** Deliberately approved parser capability for each ecosystem if required.

---

### GAP-022 — JSONC tsconfig is not parsed

**Discovered in / source:** Phase 2D

**Description:** tsconfig.json with JSONC syntax fails JSON.parse and yields explicit parse failure.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Failure mode is explicit, not silent UNKNOWN.

**Required condition to close:** Deliberate JSONC parser decision or TypeScript-native configuration parser architecture.

---

### GAP-023 — No dependency-tree/version compatibility reasoning

**Discovered in / source:** Phase 2D

**Description:** Declared dependencies are observed only as declarations; no lockfile/tree/version reasoning exists.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2D claims remain declaration-only by design.

**Required condition to close:** Future dependency-intelligence capability if explicitly required.

---

### GAP-024 — Lexical inference registries are intentionally incomplete

**Discovered in / source:** Phase 2D

**Description:** Fixed extension and manifest-name inference registries do not cover all ecosystems or markers.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Absence of inference is not evidence of absence; UNKNOWN remains explicit.

**Required condition to close:** Evidence-backed registry expansion only when justified.

---

### GAP-025 — Metadata content ceiling

**Discovered in / source:** Phase 2D

**Description:** Manifest observations above 256 KiB are rejected by metadata operation.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** TOO_LARGE and PARTIAL metadata are explicit.

**Required condition to close:** Deliberate bound change with evidence if real manifests require it.

---

### GAP-026 — Manifest-attempt ceiling

**Discovered in / source:** Phase 2D

**Description:** More than 128 manifest candidates may yield PARTIAL metadata.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** MANIFEST_LIMIT_REACHED is explicit.

**Required condition to close:** Evidence-backed bound/selection change if real monorepos require it.

---

### GAP-027 — RepositoryMap is not a stable serialized format

**Discovered in / source:** Phase 2D

**Description:** RepositoryMap exists in memory only; no persistence or serialization contract exists.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2 Master Contract defers persistence.

**Required condition to close:** Future persistence/versioning architecture.

---

### GAP-028 — Search is lexical/topological only

**Discovered in / source:** Phase 2E

**Description:** No semantic intent, typo tolerance, synonyms, stemming, fuzzy search, AST/symbol/import search, or general content search.

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Phase 2E bounded claims are lexical/topological only.

**Required condition to close:** Advanced context/session intelligence or another explicitly approved retrieval phase.

**Notes:** Do not solve inside Phase 2E.

---

### GAP-029 — Search performance at maximum corpus is not characterized

**Discovered in / source:** Phase 2E

**Description:** Lexical search performance near Phase 2A's 50,000-observation ceiling is not benchmarked.

**Review classification:** OPTIMIZATION

**Lifecycle:** OPEN

**Required condition to close:** Benchmark near Phase 2A's 50,000-observation ceiling if performance becomes a product requirement.

---

### GAP-030 — Freshness is not yet implemented

**Discovered in / source:** Phase 2A–2E

**Description:** No freshness or snapshot-integrity engine exists; RI-008 remains deferred.

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** CLOSED

**Why non-blocking:** Deferred by frozen Master Contract until Phase 2F.

**Required condition to close:** RI-008 and freshness/snapshot evidence.

**Closed by checkpoint:** `ba588a084982736bfd924aa5fc821df45694279f`

**Evidence:** docs/reports/PHASE_2F_REPORT.md

**Notes:** RI-008 behavioral evidence includes same-size same-mtime in-place content change detection via bounded 2B re-read; metadata equality never produces `VERIFIED_CURRENT`.

---

### GAP-031 — Snapshot persistence intentionally absent

**Discovered in / source:** Phase 2 Master Contract

**Description:** Repository snapshots remain in memory only; no durable snapshot store exists.

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** OPEN

**Why non-blocking:** Current Phase 2 rule explicitly forbids persistence in 2A–2F scope.

**Required condition to close:** Advanced session/context persistence architecture.

**Notes:** This MUST NOT be "fixed" in Phase 2F.

---

### GAP-032 — No model-boundary integration audit yet

**Discovered in / source:** Phase 2 Master Contract

**Description:** RI-012 independent integration audit covering model/provider boundaries is not complete.

**Review classification:** SCHEDULED_DEFERRED

**Lifecycle:** CLOSED

**Why non-blocking:** Assigned to Phase 2G by frozen contract.

**Required condition to close:** RI-012 independent integration audit.

**Closed by checkpoint:** `f2e175886f888ce3ce42d5b1982f153971b75320`

**Evidence:** docs/reports/PHASE_2G_AUDIT_REPORT.md §RI-012 independent audit; tests/integration/phase2-architecture-audit.test.ts

**Notes:** Closed at Phase 2 Closure; not closed in the Phase 2G audit commit itself.

---

### GAP-033 — Canonical cross-component RepositoryEntry membership was undeclared, causing Git/snapshot incompatibility

**Discovered in / source:** Phase 2G NOT COMPLETE audit against baseline fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab

**Description:** Phase 2C legitimately annotates `RepositoryEntry` values carried by entry-bearing inventory observations such as DESCENDED directories. Phase 2F validated Git annotation membership against an ADMITTED-only subset. The root defect is broader than one comparison: the canonical `RepositoryEntry` set used for cross-component reference identity was not explicitly defined as a shared inventory-layer contract. This caused a valid `GitStateBaseline` produced from a `RepositoryInventory` to be rejected by a `RepositorySnapshot` built from the same inventory.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Downstream false assumption / composition failure — Phase 3 would inherit incorrect PRE_EXISTING binding semantics.

**Required condition to close:** Canonical cross-component `RepositoryEntry` membership defined; every relevant 2C/2D/2E/2F consumer audited against it; legitimate nested Git baseline binds into snapshot; foreign-inventory references still fail closed; original defect reproduced by falsification; immutable implementation checkpoint exists.

**Closed by checkpoint:** `c0309407ea891cfa036f93d455f500694779c301`

**Evidence:** docs/reports/PHASE_2G_H1_REPORT.md

**Notes:** Phase 2G remains NOT COMPLETE until the independent integration audit is rerun after H1.

---

### GAP-034 — Phase 2G compile-time spot-checks for RI-017 and RI-012 listed but unexecuted

**Discovered in / source:** Phase 2G re-audit, f2e175886f888ce3ce42d5b1982f153971b75320

**Description:** The committed Phase 2G audit report listed RI-017 and RI-012 among compile-time intended-error spot-checks, but a malformed shell loop meant those two probes did not execute during the audit.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** The frozen invariant "claims require evidence" was violated in the audit's own record. It blocked the closure evidence chain, not the production implementation.

**Required condition to close:** Execute or formally disposition RI-017 and RI-012 compile-time evidence; restore source; document reconciliation.

**Closed by checkpoint:** `2a4d81cefa6b3c32d6970fad8b9f985083fb24da`

**Evidence:** docs/reports/PHASE_2G_E1_EVIDENCE_SUPPLEMENT.md

**Notes:** BLOCKING_INVARIANT — AUDIT EVIDENCE. RI-017 executed with the intended error; RI-012 recorded NOT APPLICABLE with rationale rather than a manufactured probe.

---

### GAP-035 — Residual hostile concurrent filesystem race after final pre-commit revalidation

**Discovered in / source:** Phase 3B existing-file atomic replacement

**Description:** A narrow window remains between final pre-commit currentness revalidation and the atomic rename commit point during which a hostile concurrent writer could still mutate the target.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** The frozen Phase 3 Master explicitly limits the guarantee and does not claim hostile-filesystem linearizability.

**Required condition to close:** Proven stronger platform compare-and-swap, locking, or equivalent mechanism.

---

### GAP-036 — Crash-orphan temporary candidate possibility

**Discovered in / source:** Phase 3B existing-file atomic replacement

**Description:** An abrupt process or OS crash before handled temp cleanup can leave a same-directory Path Code temp candidate on disk.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Handled failures and normal completion clean up; abrupt crash is explicitly outside the stronger claim.

**Required condition to close:** Proven unnamed-temp or crash-recovery architecture.

---

### GAP-037 — Extended metadata not preserved or proven in existing-file replacement

**Discovered in / source:** Phase 3B existing-file atomic replacement

**Description:** ACLs, xattrs, resource forks, alternate data streams, and filesystem-specific metadata are not claimed preserved during existing-file atomic replacement unless actually proven.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Basic mode and owner/group preservation are proven; extended metadata is honestly excluded.

**Required condition to close:** Platform-specific preservation or explicit detection-and-refusal mechanism.

---

### GAP-038 — Mutation-time config stale fallback after loadProjectConfig failure

**Discovered in / source:** Phase 3B failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d

**Description:** resolveMutationConfig treated loadProjectConfig ConfigFailure as success by substituting stale prepared.config (SUPPLIED_ONLY), allowing mutation to continue instead of REFUSED_PRECOMMIT before temp creation.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Blocking — fail-closed mutation-time config reload is required; stale fallback permits mutation under failed trust revalidation.

**Required condition to close:** Immutable H1 corrective implementation commit with permanent fail-closed tests and live falsifications.

**Closed by checkpoint:** `ad85c9f1262635f9a81b5608b20c198a7b8b489d`

**Evidence:** docs/reports/PHASE_3B_H1_REPORT.md

**Notes:** Phase 3B remains NOT COMPLETE pending full evidence re-run after H1.

---

### GAP-039 — Temp-creation createTempExclusive throw escapes replaceExistingFile

**Discovered in / source:** Phase 3B failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d

**Description:** prepareTempCandidate invoked createTempExclusive outside the inner try/catch, so injected or real creation failures escaped as uncaught exceptions instead of terminal FAILED_PRECOMMIT with commitPointReached=false.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Blocking — pre-commit recovery must surface controlled FAILED_PRECOMMIT rather than escaping throws.

**Required condition to close:** Immutable H1 corrective implementation commit with permanent temp-creation recovery test and live falsification.

**Closed by checkpoint:** `ad85c9f1262635f9a81b5608b20c198a7b8b489d`

**Evidence:** docs/reports/PHASE_3B_H1_REPORT.md

**Notes:** Phase 3B remains NOT COMPLETE pending full evidence re-run after H1.

---

### GAP-040 — Capability Ledger v1 cannot let later negative evidence supersede PASS_FROZEN

**Discovered in / source:** Phase 3B-H1 corrective bookkeeping after failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d

**Description:** Capability Ledger v1 derives PASS_FROZEN from freezeEvidence citations resolving at HEAD. Later negative evidence reports cannot mechanically revoke or supersede an earlier PASS_FROZEN without an explicit canonical-record edit removing/superseding freezeEvidence. Historical linkage commits remain immutable.

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Operators must manually correct the current canonical capability record when later evidence fails; the limitation is honesty/process, not a silent production mutation hazard.

**Required condition to close:** Schema/runtime support for negative-evidence supersession of freeze state, or an equivalent explicit ledger revision protocol.

---

### GAP-041 — Pass contracts are not repository artifacts

**Discovered in / source:** Phase 3B evidence completion re-run after Phase 3B-H1 recovery

**Description:** Master contracts and phase reports are repository-recorded, but the exact per-pass execution instruction (e.g. merged audit contract prose) may not be present as an immutable repository artifact at audit time. Recovery and evidence passes then rely on recovery instructions, committed reports, and current tree inspection.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** (unreviewed)

**Lifecycle:** OPEN

**Notes:** Missing evidence: immutable repository record of bounded pass execution instructions. Closure requires deliberate process decision on storage/freeze location.

---

### GAP-042 — Two-commit freeze contamination was repository-wide instead of capability-scoped

**Discovered in / source:** Phase 3B evidence completion linkage failure at 2b635316f7f08c0cf08ef42ec40ab2cd513d3969

**Description:** TWO_COMMIT_FREEZE rejected unrelated src/selfobs bookkeeping between the corrected Phase 3B implementation commit and evidence commit because the verifier treated all src/** changes as contamination instead of validating only the frozen capability's declared productionScopes.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Blocking — unrelated self-observation bookkeeping must not invalidate an unrelated capability freeze when declared production scopes are unchanged.

**Required condition to close:** Immutable H2 verifier correction commit with scoped contamination validation.

**Closed by checkpoint:** `7e54424fd6a2bb1d298f28bd83f513046307a37e`

**Evidence:** docs/reports/SELF_OBSERVATION_V1_H2_FREEZE_SCOPE_REPORT.md

---

### GAP-043 — Created vs modified provenance is not distinguished

**Discovered in / source:** Phase 3C safe single-file creation

**Description:** Successful Phase 3C creation earns PATH_CODE_MODIFIED using the frozen provenance vocabulary. The vocabulary does not distinguish files created by Path Code from files modified by Path Code.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Frozen provenance vocabulary remains truthful; creation vs modification distinction is not required for SE-019 safety claims.

**Required condition to close:** Deliberate provenance-vocabulary revision if product semantics require the distinction.

---

### GAP-044 — Residual race between final creation revalidation and hard-link publication

**Discovered in / source:** Phase 3C safe single-file creation

**Description:** After final parent/absence/denial rechecks and before linkNoOverwrite, a concurrent actor may create the target. Hard-link EEXIST refuses overwrite, but the Master does not claim hostile concurrent-filesystem linearizability for the revalidation window.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Publication remains no-overwrite; residual race is detection/refusal, not silent corruption. Distinct from GAP-035 (3B rename window).

**Required condition to close:** Proven stronger dirfd/openat2/locking/CAS-style platform mechanism.

---

### GAP-045 — Post-publication creation temp may remain as a second hard-link name

**Discovered in / source:** Phase 3C safe single-file creation

**Description:** After successful linkNoOverwrite, candidate and target name the same inode. If candidate-name removal fails or the process crashes before removal, a Path Code temp name may remain as a second directory entry for the published file. GAP-036 covers crash-orphan unpublished temps for 3B; this records the post-publication second-name case for creation.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** Handled unlink failure is reported as COMMITTED_FAILURE with cleanupFailure; target is not deleted. Crash residue is an OS-visible honesty limit, not silent corruption.

**Required condition to close:** Unnamed-temp or stronger platform primitive eliminating the second-name window.

---

### GAP-046 — CREATE_FILE action restriction missing from Phase 1 ActionClass mapping

**Discovered in / source:** Phase 3C-H1 review at c82ed1042d06bed56485cf622871ded970d6d440

**Description:** Frozen Phase 3 Master required Phase 3A to map CREATE_FILE to an honest disable-action ActionClass or STOP AND REPORT. 3A shipped without that mapping; disable-action=EDIT blocks modification only while creation remains permitted. This violates the frozen mutation-class distinction and would leave Phase 3D without a distinct creation restriction axis.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Blocking — deny-path is not an equivalent substitute for action-class restriction of CREATE_FILE.

**Required condition to close:** Additive Phase 1 ActionClass amendment plus authorization-time and mutation-time CREATE_FILE disable enforcement with immutable corrective evidence.

**Closed by checkpoint:** `1136c40ab1667e4a5b70185c8bef68ce67d675a2`

**Evidence:** docs/reports/PHASE_3C_H1_REPORT.md

**Notes:** Closed by Phase 3C-H1: Phase 1 Action Class Amendment 1 + Stage 2 CREATE_FILE mapping + C-F8 live falsification. Evidence: docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md, docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md, docs/reports/PHASE_3C_H1_REPORT.md §2/§5.

---

### GAP-047 — Uncontracted post-creation verification path read

**Discovered in / source:** Phase 3C-H1 review at c82ed1042d06bed56485cf622871ded970d6d440

**Description:** Phase 3C requires after-state verification of a newly published path that has no RepositoryEntry and intentionally performs no reinventory. The shipped bounded path read in the editing filesystem layer lacked a frozen authority concept limiting it to the exact target this creation operation published.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Why non-blocking:** Blocking — post-creation verification must not become generic repository-read authority.

**Required condition to close:** Frozen operation-bound PublishedCreationVerificationTarget / CreationAfterStateEvidence contract and implementation that cannot target caller-supplied or other-operation paths.

**Closed by checkpoint:** `1136c40ab1667e4a5b70185c8bef68ce67d675a2`

**Evidence:** docs/reports/PHASE_3C_H1_REPORT.md

**Notes:** Closed by Phase 3C-H1: Phase 3 Safe Editing Amendment 1 + Stage 2 opaque verification + C-F9 type/runtime falsification. Evidence: docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md, docs/reports/PHASE_3C_H1_REPORT.md §2/§5.

---

### GAP-048 — PUBLIC_AUTHORITY_SURFACE_LEAK — replaceExistingFile public fsOps mechanism substitution

**Discovered in / source:** Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8

**Description:** Public ReplaceExistingFileOptions.fsOps is accepted by the Phase 3 editing barrel and honored at runtime as options.fsOps ?? productionAtomicReplaceFs, allowing caller substitution of the frozen 3B filesystem mutation and evidence operation set.

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** Public wrapper without fsOps; internal-only dependency-bound helper; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.

**Closed by checkpoint:** `5386f349eccd7c69ff696619ffc426757e3e91d0`

**Evidence:** docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md

**Notes:** Closed by Stage 3 public authority-surface internalization: public replaceExistingFile binds productionAtomicReplaceFs only; fsOps confined to non-barrel replaceExistingFileWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.

---

### GAP-049 — PUBLIC_AUTHORITY_SURFACE_LEAK — createFile public fsOps mechanism substitution

**Discovered in / source:** Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8

**Description:** Public CreateFileOptions.fsOps is accepted by the Phase 3 editing barrel and honored at runtime as options.fsOps ?? productionAtomicCreateFs, allowing caller substitution of the frozen 3C filesystem mutation and verification operation set.

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** Public wrapper without fsOps; internal-only dependency-bound helper; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.

**Closed by checkpoint:** `5386f349eccd7c69ff696619ffc426757e3e91d0`

**Evidence:** docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md

**Notes:** Closed by Stage 3 public authority-surface internalization: public createFile binds productionAtomicCreateFs only; fsOps confined to non-barrel createFileWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.

---

### GAP-050 — PUBLIC_AUTHORITY_SURFACE_LEAK — executeMultiFilePlan public targetOps mechanism substitution

**Discovered in / source:** Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8

**Description:** Public ExecuteMultiFilePlanOptions.targetOps is accepted by the Phase 3 editing barrel and honored at runtime as options.targetOps ?? productionOps, allowing caller substitution of the frozen 3D delegation path to real replaceExistingFile and createFile.

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** Public executeMultiFilePlan(plan) only; internal-only test executor; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.

**Closed by checkpoint:** `5386f349eccd7c69ff696619ffc426757e3e91d0`

**Evidence:** docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md

**Notes:** Closed by Stage 3 public authority-surface internalization: public executeMultiFilePlan binds productionOps only; targetOps confined to non-barrel executeMultiFilePlanWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.

---

### GAP-051 — First Phase 3 integration audit conclusion superseded by missed public authority-surface leak

**Discovered in / source:** Phase 3 public authority-surface census after first integration audit 696ef4fe58c21cdd527869309a2b9fd5abcd19a8

**Description:** The first Phase 3 integration audit returned COMPLETE while public fsOps/targetOps mechanism-substitution seams remained active. That audit remains immutable historical evidence, but its COMPLETE conclusion is progression-ineligible until a fresh full re-audit returns COMPLETE after correction.

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** OPEN

**Required condition to close:** Immutable corrective hardening chain plus fresh full Phase 3 integration re-audit COMPLETE by an independent Stage 3 R1 auditor.

**Notes:** Prior canonical closure landed in ee58673 and cited 5606b49 / docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md. Superseded for progression by GAP-052 and Phase 3-R1 reconciliation. Historical commits/reports remain immutable.

---

### GAP-052 — Phase 3 re-audit at 5606b49 executed by a non-independent auditor

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** The fresh auditor task required by the hardening contract failed with resource_exhausted before writing or committing. The Stage 0–4 writer session then executed Stage 5 and committed 5606b49. The committed report does not record that provenance break.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** OPEN

**Required condition to close:** A fresh full Phase 3 re-audit at the corrected/reconciled checkpoint by an executor session with no prior write in this R1 chain, plus a complete auditor provenance/attestation block and immutable audit evidence.

**Notes:** The prior GAP-051 canonical closure landed in ee58673 while its closedByCommit / closureEvidence pointed to 5606b49. Those historical records remain immutable; this gap supersedes them for progression. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.

---

### GAP-053 — Stage 1 §1.4 downgrade falsification not proven at eabbc19

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** The census asserted §1.4 success, but the live restore script raised IndexError before capturing the required MUST-FAIL evidence; the restore-back line did not run in that process; the following focused test failed in a state consistent with freezeEvidence remaining restored; ledger:verify evidence cited the pre-Stage-1 baseline rather than the committed downgrade checkpoint.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** OPEN

**Required condition to close:** A historical derivation at immutable eabbc19 establishing the committed downgrade state, the restore direction using exact pre-downgrade freezeEvidence from the preceding canonical checkpoint, and current bidirectional freeze falsifications.

**Notes:** Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.

---

### GAP-054 — Closure B §6.6 jointly unsatisfiable and historical audit mechanism removed

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** Prior §6.6 simultaneously required PHASE_VERIFIED/GAP-051 CLOSED, unchanged audit tests, and final npm test PASS while those audit tests bound live canonical state. ee58673 edited two audit suites and scripts/ledger-verify.ts without contract authorization and removed the historical half-citation issueLedgerVerification probe.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** OPEN

**Required condition to close:** Restored historical probe; a ledger:verify consistency mechanism that derives expectations from ledger shape rather than hardcoding phase status; an explicit bounded rule authorizing only live-state assertion updates during closure.

**Notes:** Primary origin in the corrective report: CONTRACT. Contributing cause: EVIDENCE shape. No Gap Ledger schema field is added for origin. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.

---

### GAP-055 — Auditor independence is not mechanically verifiable from repository evidence

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** The repository can record an auditor's report and operator attestation, but the current self-observation model has no mechanical mechanism proving that the auditor session received no forbidden transcript/context or performed no prior write.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** R1 can structurally enforce executor separation and record the audit result mechanically while explicitly labeling the independence claim ASSERTED. The limitation concerns proof of process provenance, not the audit's repository-recorded tests/results themselves.

**Required condition to close:** An approved repository-visible mechanism, if later required, that can bind an independent audit execution to mechanically verifiable provenance rather than operator testimony alone.

**Notes:** The R1 report presence is REPOSITORY_RECORDED; the truth of independence attestation is ASSERTED. Do not invent OPERATOR_ATTESTED or another evidence tier. Not attached to any capability. Operator approved reviewClassification NON_BLOCKING_LIMITATION unchanged at Stage 1.

---

### GAP-056 — Final-head Phase 3 runtime test figure not durably recorded

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** Closure A correctly binds 607 runtime tests to 04591e4. Final validation at ee58673 reported 608 runtime tests, but no immutable closure/report/recordedFigure records that final-head figure.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** The historical 607 figure is already truthful and correctly bound. Missing 608 recording is a final reporting/evidence-completeness defect, not evidence that Safe Editing behavior is incorrect.

**Required condition to close:** A final reconciliation closure artifact carrying the exact runtime total at its immutable checkpoint plus a Capability Ledger recordedFigure bound to that artifact/commit.

**Notes:** Operator approved reviewClassification NON_BLOCKING_LIMITATION unchanged at Stage 1 (explicit confirmation that F4 / Stage 0 contract text directs this gap).

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
