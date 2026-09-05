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

**Lifecycle:** CLOSED

**Required condition to close:** A historical derivation at immutable eabbc19 establishing the committed downgrade state, the restore direction using exact pre-downgrade freezeEvidence from the preceding canonical checkpoint, and current bidirectional freeze falsifications.

**Closed by checkpoint:** `2208dfa91e8f16571c3df884441aef7c75b1a062`

**Evidence:** docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §2

**Notes:** Original live §1.4 run remains NOT PROVEN. Closure means the historical semantic disposition is now independently evidenced at eabbc19 (IMPLEMENTED) with in-memory restore to PASS_FROZEN and current forward relink falsification, not that the original failed script is retroactively repaired. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.

---

### GAP-054 — Closure B §6.6 jointly unsatisfiable and historical audit mechanism removed

**Discovered in / source:** Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519

**Description:** Prior §6.6 simultaneously required PHASE_VERIFIED/GAP-051 CLOSED, unchanged audit tests, and final npm test PASS while those audit tests bound live canonical state. ee58673 edited two audit suites and scripts/ledger-verify.ts without contract authorization and removed the historical half-citation issueLedgerVerification probe.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** Restored historical probe; a ledger:verify consistency mechanism that derives expectations from ledger shape rather than hardcoding phase status; an explicit bounded rule authorizing only live-state assertion updates during closure.

**Closed by checkpoint:** `7f4267d5d59feee8a73e5e3217c6ab2b1abd7a48`

**Evidence:** docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §1 plus docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md Stage 4 bounded live-state update rule

**Notes:** Historical probe restored; ledger gate generalized and falsified; prior unsatisfiable §6.6 preserved as historical contract evidence. Primary origin: CONTRACT. Contributing cause: EVIDENCE shape. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.

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

### GAP-057 — Standing public authority-surface guard omits AuthorizePreparedChangeOptions and does not derive complete public parameter coverage

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at ecda537

**Description:** authorizePreparedChange is exported from the public editing barrel and issues authorization. Its options type is declared in src/editing/types.ts and re-exported by name. The standing guard hardcodes three option types in three files, performs no export-driven census and no recursive type-graph traversal, and never inspects that type. An authority-bearing callable member added to it was not detected by the guard, the P1–P14 suite, or the full test suite. Hardening report §9 recorded the standing-guard deferral as scoped "beyond the Phase 3 editing option types already guarded", which is false for this type and masked the omission during the first audit. After R2, discovery was derived but recursive traversal remained gated on parameterName === 'options' or a /Options$/ type-name pattern, leaving 24 of 28 public parameter roots uninspected.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** export-driven public-surface discovery; named re-export resolution; recursive cycle-safe project type-graph traversal; detection of the auditor's exact authorityOps corruption; detection of an unlisted future public options type; preserved legitimate data/context; immutable corrective evidence; unconditional structural traversal of every derived public parameter root with explicit dispositions

**Closed by checkpoint:** `c6b922c8dc4950e7f0da8ff34fceaee132495c76`

**Evidence:** docs/reports/PHASE_3_R2_H1_TRAVERSAL_REPORT.md

**Notes:** First closure at 4aadb06047173b09cfceee542f140ad6fce7b06f / docs/reports/PHASE_3_R2_CORRECTION_REPORT.md was superseded as insufficient by independent re-audit c60c78254ce273235921694faac57ec5e4a30d5f (F-R1-003). Re-closed by Phase 3-R2-H1 Stage 1 c6b922c8dc4950e7f0da8ff34fceaee132495c76 against unconditional structural traversal proven by H1-F1, H1-F2, H1-F3 and H1-F7. No active leak ever existed. Prior closure commits remain immutable. SCOPE OF THIS CLOSURE (Phase 3-R2-H2 Stage 0, operator decision D1 — this gap stays CLOSED and is NOT reopened): the closure establishes export-driven ROOT DISCOVERY, unconditional ROOT-LEVEL TRAVERSAL, and the absence of any ROOT-LEVEL name gate. The independent re-audit at 328f6fc reproduced 28/28 roots and every disposition count, confirming that scope holds. The closure does NOT establish MEMBER-LEVEL or EXPORT-LEVEL completeness: member callable classification on the un-unwrapped type is GAP-060, the member-level name-pattern skip and the manifest blindness it creates are GAP-061, and object-valued export discovery is GAP-062. Consult those three records for member-level and export-level completeness.

---

### GAP-058 — Derived public-surface guard covers the editing barrel only, not the package root

**Discovered in / source:** Phase 3-R2 correction at the Stage 0 commit

**Description:** Amendment 1 A/B permit a package-root callable-surface manifest. This pass scopes the derived walker to src/editing/index.ts, where the authority surface and the finding live. package.json exports only "." and src/index.ts does not re-export editing, so no editing surface is reachable through a supported package subpath today.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** the omitted scope contains no authority-bearing surface reachable by a package consumer at this checkpoint; the editing barrel is where authority is issued and mutation is performed

**Required condition to close:** a derived manifest rooted at package.json exports and src/index.ts, with the same detection rules

**Notes:** Operator decision D2 — editing-barrel scope only for this pass. Not attached to any capability.

---

### GAP-059 — Full npm run check exhibits widespread wall-clock timeout instability under host contention

**Discovered in / source:** Phase 3-R1 Stage 3 fresh re-audit at c60c782

**Description:** 3 of 4 full check runs timed out (16, 1, 23 tests respectively); zero assertion failures; suspect files pass in isolation (52/52); excluding both R2 architecture files still left 4 timeouts; host load 26–30 on 8 CPUs; R2's 2-F6 timed out against its own 60s budget. Extent exceeds the previously recorded two-file flake.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** OPEN

**Why non-blocking:** no assertion defect established; all affected suites pass in isolation; one complete run passed; no production-semantic failure demonstrated.

**Required condition to close:** deterministic worker/concurrency policy or bounded test-program reuse, plus representative repeated clean checks under recorded load.

**Notes:** supersedes the narrower two-file disposition cited in the census baseline and hardening report §9 as the current description of this behavior. Not attached to any capability.

---

### GAP-060 — Member callable classification applied to the un-unwrapped type, so optional and union-wrapped callables are never rejected

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (F-R1-004)

**Description:** tests/architecture/public-authority-surface-analyzer.ts:874 calls hasUserDefinedCallSignatures(propType) on the member type before null/undefined removal. An optional member `q?: (m) => string` has type `((m) => string) | undefined`; getCallSignatures() on a union returns [], so no CALLABLE_REJECTED disposition and no finding are emitted. The unwrapped type exists at line 926 and is used for disposition identity and descent, but never for classification. Adding such a member to the real AuthorizePreparedChangeOptions yields 0 findings with the standing guard 5/5 and P1-P14 9/9. Every existing option member on every options type in this repository is optional; this is the natural way to write one. Amendment 1 §4 D requires failure on an unreviewed member carrying a user-defined call signature without qualification by optionality.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** callable classification performed on the non-nullable type and on every union/intersection constituent, covering call signatures, construct signatures, methods, callable getters and callable index-signature value types; generated matrix coverage of the optionality dimension.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: callable classification is now performed by isCallableMemberType on the non-nullable type and on every union/intersection constituent, accepting call signatures, construct signatures and callable index-signature value types; methods, callable getters, overloaded and generic function types reduce to the same rule. Established by H2-F1(a) (optional callable on the real AuthorizePreparedChangeOptions now fails naming function, parameter, type and member), by H2-F2 groups A/B/C/D (890 expressible generated cells, every one rejected at the expected path with the member manifested), by H2-F2 group E (300 non-callable controls, zero findings), and decisively by H2-F7(a): restoring the un-unwrapped check together with the pre-R2-H2 node-level census reconstructs the 328f6fc shape and the optional callable escapes completely. H2-F7(a) additionally records that the classification fix and the node-level own-signature census are two independent mechanisms, so restoring only one is not sufficient to let the shape through. ORIGINAL RECORD: No active leak at 328f6fc — this is absent detection, not present authority escape. Member-level counterpart to the root-level naming gate closed by GAP-057; GAP-057 remains CLOSED and correctly scoped. Primary origin: IMPLEMENTATION.

---

### GAP-061 — Symbol-keyed members skipped by a name pattern before the manifest push, leaving the completeness proof blind to the skip

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (F-R1-005)

**Description:** tests/architecture/public-authority-surface-analyzer.ts:856 and :954 execute `if (propName.startsWith("__@")) continue;`. TypeScript escapedName begins `__@` for every symbol-keyed property — well-known and unique alike — so both guards fire far beyond the iterators their comment names. Decisively, both run BEFORE the ctx.manifest.push at lines 863-871 and 959-967, so a skipped member never enters the manifest and the R2-H1 per-root completeness proof cannot observe its absence: a corrupted tree analyzes byte-identical to a clean one (5302 dispositions, 2242 manifest rows, 0 findings). This is a name-pattern skip — the class eliminated at the root level by GAP-057 — surviving at the member level.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** unconditional member iteration with no name-based skip anywhere in the analyzer; symbol-keyed members manifested by declaration identity and classified; a per-node completeness proof that fails when any checker-visible member is omitted from the manifest.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: both name-pattern member skips are removed from the default path; the member census is unconditional over getPropertiesOfType, every call signature, every construct signature and every index info, and the manifest push happens for all of them. Symbol-keyed members are serialized by declaration identity (declaring file plus symbol description), decided from the declaration shape and key type flags rather than from the member name. Per-node completeness (checker members equals manifested members) is asserted for all 911 nodes of the clean surface with zero mismatches. Established by H2-F1(b) (the symbol-keyed callable now fails AND the corrupted manifest digest is no longer byte-identical to clean, the exact property F-R1-005 exploited), by H2-F3 (restoring the skip breaks completeness with no corruption at all, because the real surface carries a unique-symbol member; withholding one censused member also breaks it), and by H2-F7(b). The correction immediately surfaced six REAL symbol-keyed members on the live public surface, the editAuthorizationBrand unique symbol on EditAuthorization, which the guard had never represented; they are correctly classified primitive and non-rejected, and H2-F8 now pins them. ORIGINAL RECORD: No active leak at 328f6fc — absent detection only. The manifest blindness is the load-bearing half: without it the omission would have been visible to the existing R2-H1 proof. Primary origin: IMPLEMENTATION.

---

### GAP-062 — Object-valued barrel exports dropped from discovery before any disposition is recorded

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (F-R1-006)

**Description:** tests/architecture/public-authority-surface-analyzer.ts:1270 executes `if (signatures.length === 0) { continue; }` in the barrel export loop. An exported value whose type carries no call signatures is excluded from discovery entirely, before any disposition is recorded. An exported object literal or namespace object whose members are functions is a public callable surface reachable by any consumer, and it never becomes a root. No export-level completeness proof exists to notice, because the export loop records nothing for a skipped export.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** an export-disposition record for every value export of the barrel; traversal of object-valued exports; promotion of their callable members to roots with their own parameter roots traversed; an export-level completeness proof.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: every value export of the barrel now receives a disposition on a separate closed ExportDisposition axis, so TraversalDisposition remains exactly six values with no seventh. Object-valued exports are traversed by the same walker used for parameter graphs and every callable member is promoted to a CALLABLE_ROOT whose own parameters are traversed through the one canonical analyzeCallableRoot path. The clean surface reports 24 export dispositions (16 CALLABLE_ROOT, 8 PRIMITIVE_TERMINAL) plus 44 type-only exports. Established by H2-F1(c), by H2-F4 (restoring the callable-only export exclusion makes the object export escape and fails an export-completeness assertion derived independently from the TypeChecker), by H2-F7(c), and by H2-F2 group C which exercises all three DIM-7 root kinds including object-valued export members. ORIGINAL RECORD: No active leak at 328f6fc — the editing barrel exports no object-valued value today; this is absent detection of a shape a future export could take. Scope remains the editing barrel per operator decision D4; package-root coverage stays GAP-058. Primary origin: IMPLEMENTATION.

---

### GAP-063 — TypeScript Program cache has no content-based invalidation and is stale in both directions

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (auditor hazard, not classed a finding by the auditor)

**Description:** tests/architecture/public-authority-surface-analyzer.ts:157 declares `const programCache = new Map<string, ts.Program>()` keyed at line 206 on repoRoot alone. No content, size, or mtime participates in the key. Across a src/ mutation that preserves size and mtime the cache returns a stale Program in both directions: a corruption is not observed, and a restoration is not observed either. Correctness currently depends on callers invoking clearRepositoryTypeScriptProgramCache() by convention. An evidence mechanism whose correctness rests on caller convention is not mechanically safe.

**Implementer proposed class:** BLOCKING_INVARIANT

**Review classification:** BLOCKING_INVARIANT

**Lifecycle:** CLOSED

**Required condition to close:** a Program cache key derived from the content of every input source file plus the compiler options, and a same-process both-direction freshness falsification performed with size and mtime preserved and no explicit cache-clear call.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: the Program cache key is the sorted list of (repository-relative path, SHA-256 of current content) for every source file in the Program plus a hash of the compiler options; path, size and mtime are not keys, and an unreadable file hashes as missing so deletion invalidates too. clearRepositoryTypeScriptProgramCache() is retained for compatibility with existing proofs but correctness no longer depends on any caller invoking it. Established by H2-F5: same process, both directions, file size preserved exactly and mtime preserved to the millisecond, with no clear call between steps, the corruption is detected and the restoration is observed. Recorded consequence: the previous repoRoot-only cache had been masking a latent race in the 2-F2 probe, whose real-repository clean read did not hold the repository's own src mutex; the content-hash key made that visible and the probe now takes the lock, with its assertion unchanged. ORIGINAL RECORD: No incorrect result was produced at 328f6fc because the standing guard and every existing proof call clearRepositoryTypeScriptProgramCache(). Closing this gap makes that call a belt rather than the suspenders. Primary origin: IMPLEMENTATION.

---

### GAP-064 — Analyzer Program construction resolves lib and config paths through process.cwd()

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (auditor hazard, not classed a finding by the auditor)

**Description:** createRepositoryTypeScriptProgram (tests/architecture/public-authority-surface-analyzer.ts:159-192) passes ts.sys to ts.parseJsonConfigFileContent and calls ts.createProgram with no explicit CompilerHost. The default host resolves the default lib and relative paths through ts.sys.getCurrentDirectory(), i.e. process.cwd(). Analyzer output can therefore depend on the directory from which it was invoked. architectureTestsRepoRoot() is already cwd-independent (it derives from import.meta.url); the residual dependence is inside Program construction only.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** CLOSED

**Why non-blocking:** the dependence degrades fail-closed — a lib that fails to resolve yields unresolved types that are rejected rather than silently admitted — and every current invocation path runs from the repository root. No incorrect admission has been demonstrated. The defect is determinism of an evidence tool, not authority leakage.

**Required condition to close:** repository root, tsconfig and lib directory resolved from the analyzer module location or an explicit root argument rather than process.cwd(), plus a proof that analyzer output is identical from two different working directories.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: parseJsonConfigFileContent now receives an explicit ParseConfigHost with an absolute basePath, and the Program is built with an explicit CompilerHost whose getCurrentDirectory() returns the repository root; nothing resolves through process.cwd(). Established by H2-F6: the full manifest SHA-256, the findings, the disposition count and exportedCallables are identical when the analyzer runs from the repository root and from a temporary directory, with the cache cleared after the directory change so a new Program is genuinely constructed from the foreign working directory. The pre-correction reproduction recorded in the closure evidence section 1.1(e) showed the defect was live: from a foreign cwd the analyzer produced 2 spurious any-escape findings and 5286 rather than 5302 dispositions. ORIGINAL RECORD: Recorded as a distinct mechanism from GAP-063 so each is closed by its own proof. Not attached to any capability per operator decision D2.

---

### GAP-065 — Falsification design for the public authority-surface detector shared the implementer's own assumptions across three passes

**Discovered in / source:** Phase 3-R1 Stage 3 independent re-audit at 328f6fc (process finding)

**Description:** Three fresh independent auditors returned NOT COMPLETE at three checkpoints (ecda537 / F-R1-001, c60c782 / F-R1-003, 328f6fc / F-R1-004+005+006). Each found a defect the implementer's own falsifications did not reveal. R2's 2-F1..2-F7, R2-H1's H1-F1..H1-F7 and both prior auditors shared one unexamined assumption: every probe used a required, string-keyed member. Falsifications written from imagination test what the author imagined, so coverage of a detection mechanism cannot be established by hand-written probes alone.

**Implementer proposed class:** NON_BLOCKING_LIMITATION

**Review classification:** NON_BLOCKING_LIMITATION

**Lifecycle:** CLOSED

**Why non-blocking:** this is a defect in evidence design, not in repository behavior. Every code defect it allowed through is separately recorded as GAP-060, GAP-061 and GAP-062 and is separately blocking. No production semantic is incorrect because of this gap alone.

**Required condition to close:** an operator-reviewed dimension table committed as data, a generator that produces one fixture per enumerated cell, and evidence that every required cell is exercised against the canonical analyzer with cell identity carried into each failure message.

**Closed by checkpoint:** `6a1d80b98f6743b97ce6ef56a7d145fb7208c892`

**Evidence:** docs/reports/PHASE_3_R2_H2_MEMBER_SHAPE_REPORT.md

**Notes:** CLOSED by Phase 3-R2-H2 Stage 1: the reviewed dimension table is committed as data at tests/architecture/public-authority-surface-dimensions.ts and the generator at tests/architecture/public-authority-surface-matrix.ts produces one fixture per enumerated cell as an in-memory virtual source overlay analyzed by the canonical analyzer. 922 cells were generated across the five required selections: group A 300, group B 128, group C 12, group D 182 pairwise, group E 300 controls. 890 are expressible and all pass; 32 are INEXPRESSIBLE for one recorded and justified reason (a method signature cannot be unioned with null or undefined at its declaration site). Group D's covering property is asserted rather than assumed: zero uncovered pairs across all seven dimensions. Cell identity is carried into every assertion message so a failure names the cell. Established by H2-F2. Scope: this closes the process finding for THIS detector only. Making generated falsification a Constitution rule for all future detection mechanisms remains a Phase 4 Master / Amendment 2 candidate and is deliberately NOT done in this pass. ORIGINAL RECORD: Process finding, closed by the generated matrix within this pass for this detector only. Making generated falsification a Constitution rule for ALL future detection mechanisms is a Phase 4 Master / Amendment 2 candidate and is explicitly NOT done here. Not attached to any capability per operator decision D2. Contributing origin: EVIDENCE.

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
