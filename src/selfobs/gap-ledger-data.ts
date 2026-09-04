/**
 * Canonical Gap Ledger v1 — machine-readable source of truth.
 */

import { deepFreeze } from "./freeze.js";
import type { GapLedger } from "./gap-types.js";

const GAP_LEDGER_V1: GapLedger = {
  revision: "v1",
  records: [
    {
      id: "GAP-001",
      title: "Git executable resolution",
      sourceCheckpoint: "Phase 1D / Phase 2C",
      description: "Git executable still resolves through inherited PATH.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Fixed Git command vocabulary and execFile-only architecture remain intact.",
      missingEvidence:
        "Deliberate executable-resolution/pinning policy plus adversarial evidence.",
      closureCondition:
        "Deliberate executable-resolution/pinning policy plus adversarial evidence.",
    },
    {
      id: "GAP-002",
      title: "Live Windows filesystem validation",
      sourceCheckpoint: "Phase 2A / 2B / 2D / 2E",
      description:
        "No live supported Windows environment integration suite has been executed.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN_REQUIRES_EXTERNAL_CONDITION",
      whyNonBlocking:
        "Core path and inventory semantics are tested on available platforms; Windows-specific behavior is not yet established.",
      missingEvidence:
        "Live supported Windows environment and platform-specific integration suite.",
      closureCondition:
        "Live supported Windows environment and platform-specific integration suite.",
      requiredCondition:
        "Live supported Windows environment and platform-specific integration suite.",
    },
    {
      id: "GAP-003",
      title: "Case-insensitive filesystem behavior",
      sourceCheckpoint: "Phase 2A / 2C",
      description:
        "Case-insensitive filesystem and Git/core.ignorecase interaction not validated on representative hosts.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN_REQUIRES_EXTERNAL_CONDITION",
      whyNonBlocking:
        "Locale-independent lexical comparators are locked; case-folding filesystem semantics remain unproven on target hosts.",
      missingEvidence:
        "Case-insensitive filesystem validation matrix including Git/core.ignorecase.",
      closureCondition:
        "Case-insensitive filesystem validation matrix including Git/core.ignorecase.",
      requiredCondition:
        "Case-insensitive filesystem validation matrix including Git/core.ignorecase.",
    },
    {
      id: "GAP-004",
      title: "Invalid-encoding pathname bytes",
      sourceCheckpoint: "Phase 2A / 2C",
      description:
        "Raw pathname byte sequences with invalid encoding are not modeled with a deliberate policy.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Current bounded claims do not assert universal pathname-byte coverage.",
      missingEvidence:
        "Deliberate raw-path-byte model or explicit permanent unsupported-path policy.",
      closureCondition:
        "Deliberate raw-path-byte model or explicit permanent unsupported-path policy.",
    },
    {
      id: "GAP-005",
      title: "Hostile TypeScript assertions",
      sourceCheckpoint: "Pre-2A onward",
      description:
        "`as unknown as TrustedType` can bypass compile-time brands intentionally.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "ACCEPTED_PERMANENT",
      whyNonBlocking:
        "TypeScript is not a security sandbox. Normal architectural bypasses remain forbidden.",
      permanentReason:
        "TypeScript is not a security sandbox; hostile casts remain outside the trust model.",
      notes:
        "Compile-time brands remain the primary production guard; hostile casts are out of scope for TypeScript alone to prevent.",
    },
    {
      id: "GAP-006",
      title: "Single-directory readdir memory",
      sourceCheckpoint: "Phase 2A",
      description:
        "Directory enumeration loads a single readdir result into memory per directory.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Inventory hard ceilings bound worst-case observation count; correctness claims remain valid within declared bounds.",
      missingEvidence:
        "Bounded/streamed deterministic directory enumeration design if required.",
      closureCondition:
        "Bounded/streamed deterministic directory enumeration design if required.",
    },
    {
      id: "GAP-007",
      title: "Unpruned dependency trees may exhaust inventory budget",
      sourceCheckpoint: "Phase 2A",
      description:
        "Large dependency trees (e.g. `node_modules`) may consume inventory observation budget before project-owned entries are fully observed.",
      reviewClassification: "OPTIMIZATION",
      lifecycle: "OPEN",
      closureCondition:
        "Evidence-backed pruning/priority policy after sufficient repository metadata exists.",
    },
    {
      id: "GAP-008",
      title: "Filesystem may mutate during already-open read",
      sourceCheckpoint: "Phase 2B",
      description: "Content may change between stat/open and read completion.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Current hash describes bytes actually observed, not an atomic repository snapshot.",
      missingEvidence:
        "Platform-specific stronger atomic observation mechanism if ever required.",
      closureCondition:
        "Platform-specific stronger atomic observation mechanism if ever required.",
    },
    {
      id: "GAP-009",
      title: "dev/ino portability",
      sourceCheckpoint: "Phase 2B",
      description:
        "Entry identity assumptions tied to dev/ino semantics are not validated across Windows/network/virtual filesystems.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN_REQUIRES_EXTERNAL_CONDITION",
      whyNonBlocking:
        "Stale-entry detection remains best-effort within tested environments.",
      missingEvidence:
        "Windows/network/virtual filesystem validation and identity-policy review.",
      closureCondition:
        "Windows/network/virtual filesystem validation and identity-policy review.",
      requiredCondition:
        "Windows/network/virtual filesystem validation and identity-policy review.",
    },
    {
      id: "GAP-010",
      title: "Global concurrent reader memory budget",
      sourceCheckpoint: "Phase 2B",
      description:
        "No orchestration-level concurrent reader memory budget exists across parallel operations.",
      reviewClassification: "OPTIMIZATION",
      lifecycle: "OPEN",
      closureCondition:
        "Future orchestration/concurrency budget if measurements require it.",
    },
    {
      id: "GAP-011",
      title: "Binary classifier is deterministic but not universal",
      sourceCheckpoint: "Phase 2B",
      description:
        "Binary vs text classification uses a fixed deterministic rule, not universal format detection.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "ACCEPTED_PERMANENT",
      whyNonBlocking:
        "Current definition is explicit: valid UTF-8 without NUL → TEXT; otherwise supported binary classifications.",
      permanentReason:
        "Not a universal file-format detector by design.",
    },
    {
      id: "GAP-012",
      title: "Repository content above 1 MiB is not fully observed",
      sourceCheckpoint: "Phase 2B",
      description:
        "Reader hard ceiling rejects full observation of content above 1 MiB.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "TOO_LARGE outcomes are explicit; no silent truncation claim is made.",
      missingEvidence:
        "Deliberate large-content architecture decision if product requirements need it.",
      closureCondition:
        "Deliberate large-content architecture decision if product requirements need it.",
    },
    {
      id: "GAP-013",
      title: "Close-failure runtime falsification",
      sourceCheckpoint: "Phase 2B",
      description:
        "Deterministic production-safe test seam for read close-failure paths is not established.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Failure vocabulary exists; runtime falsification of close failure remains incomplete.",
      missingEvidence:
        "Deterministic test seam that does not widen production architecture.",
      closureCondition:
        "Deterministic test seam that does not widen production architecture.",
    },
    {
      id: "GAP-014",
      title: "Denied Git path bytes may enter process memory",
      sourceCheckpoint: "Phase 2C",
      description:
        "When command-level pathspec exclusion is not expressible, Git may emit denied bytes before authoritative parser rejection.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Denied path cannot cross parser visibility boundary into Path Code knowledge.",
      missingEvidence:
        "Stronger Git-side literal exclusion mechanism if one becomes available.",
      closureCondition:
        "Stronger Git-side literal exclusion mechanism if one becomes available.",
    },
    {
      id: "GAP-015",
      title: "Git baseline fixed output ceiling",
      sourceCheckpoint: "Phase 2C",
      description:
        "Repositories exceeding 16 MiB path-bearing Git output fail baseline collection.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Failure is explicit; no partial silent Git state is presented as complete.",
      missingEvidence:
        "Deliberate scalable Git-state transport if real repositories require it.",
      closureCondition:
        "Deliberate scalable Git-state transport if real repositories require it.",
    },
    {
      id: "GAP-016",
      title: "Git timeout runtime falsification absent",
      sourceCheckpoint: "Phase 2C / 2C-H1",
      description:
        "Fixed-Git timeout behavior is not deterministically falsified at runtime.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Timeout bounds exist in architecture; falsification seam remains incomplete.",
      missingEvidence:
        "Safe fixed-Git timeout test mechanism without generic process execution.",
      closureCondition:
        "Safe fixed-Git timeout test mechanism without generic process execution.",
    },
    {
      id: "GAP-017",
      title: "Global/system Git ignore semantics excluded",
      sourceCheckpoint: "Phase 2C",
      description:
        "Global and system Git ignore configuration is excluded from deterministic Phase 1D semantics.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "ACCEPTED_PERMANENT",
      whyNonBlocking:
        "Current Phase 1D deterministic semantics sanitize global/system Git config.",
      permanentReason:
        "Intentional permanent limitation unless policy changes.",
      notes:
        "If policy changes later, this gap must be reopened as an architectural decision.",
    },
    {
      id: "GAP-018",
      title: "Recursive submodule state not observed",
      sourceCheckpoint: "Phase 2C",
      description: "Nested/recursive submodule Git state is not observed.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Phase 2C claims are bounded to supported Git baseline scope.",
      missingEvidence: "Explicit submodule engineering capability if required.",
      closureCondition: "Explicit submodule engineering capability if required.",
    },
    {
      id: "GAP-019",
      title: "Multiple independent nested Git roots",
      sourceCheckpoint: "Phase 2C",
      description:
        "Workspaces with multiple independent nested Git roots are not modeled.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Single discovered repository root remains the supported model.",
      missingEvidence: "Explicit multi-repository workspace model.",
      closureCondition: "Explicit multi-repository workspace model.",
    },
    {
      id: "GAP-020",
      title: "check-ignore batching performance near inventory ceiling",
      sourceCheckpoint: "Phase 2C-H1",
      description:
        "check-ignore batching at scale near inventory ceiling is not performance-characterized.",
      reviewClassification: "OPTIMIZATION",
      lifecycle: "OPEN",
      closureCondition:
        "Measurement on large repositories followed by optimization only if necessary.",
    },
    {
      id: "GAP-021",
      title: "Non-JSON manifests are not semantically parsed",
      sourceCheckpoint: "Phase 2D",
      description:
        "UNPARSED_TEXT manifests are read but not semantically parsed for OBSERVED identity.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Limitation is explicit; INFERRED-only ecosystem claims remain labeled.",
      missingEvidence:
        "Deliberately approved parser capability for each ecosystem if required.",
      closureCondition:
        "Deliberately approved parser capability for each ecosystem if required.",
    },
    {
      id: "GAP-022",
      title: "JSONC tsconfig is not parsed",
      sourceCheckpoint: "Phase 2D",
      description:
        "tsconfig.json with JSONC syntax fails JSON.parse and yields explicit parse failure.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking: "Failure mode is explicit, not silent UNKNOWN.",
      missingEvidence:
        "Deliberate JSONC parser decision or TypeScript-native configuration parser architecture.",
      closureCondition:
        "Deliberate JSONC parser decision or TypeScript-native configuration parser architecture.",
    },
    {
      id: "GAP-023",
      title: "No dependency-tree/version compatibility reasoning",
      sourceCheckpoint: "Phase 2D",
      description:
        "Declared dependencies are observed only as declarations; no lockfile/tree/version reasoning exists.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking: "Phase 2D claims remain declaration-only by design.",
      missingEvidence:
        "Future dependency-intelligence capability if explicitly required.",
      closureCondition:
        "Future dependency-intelligence capability if explicitly required.",
    },
    {
      id: "GAP-024",
      title: "Lexical inference registries are intentionally incomplete",
      sourceCheckpoint: "Phase 2D",
      description:
        "Fixed extension and manifest-name inference registries do not cover all ecosystems or markers.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Absence of inference is not evidence of absence; UNKNOWN remains explicit.",
      missingEvidence:
        "Evidence-backed registry expansion only when justified.",
      closureCondition: "Evidence-backed registry expansion only when justified.",
    },
    {
      id: "GAP-025",
      title: "Metadata content ceiling",
      sourceCheckpoint: "Phase 2D",
      description:
        "Manifest observations above 256 KiB are rejected by metadata operation.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking: "TOO_LARGE and PARTIAL metadata are explicit.",
      missingEvidence:
        "Deliberate bound change with evidence if real manifests require it.",
      closureCondition:
        "Deliberate bound change with evidence if real manifests require it.",
    },
    {
      id: "GAP-026",
      title: "Manifest-attempt ceiling",
      sourceCheckpoint: "Phase 2D",
      description:
        "More than 128 manifest candidates may yield PARTIAL metadata.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking: "MANIFEST_LIMIT_REACHED is explicit.",
      missingEvidence:
        "Evidence-backed bound/selection change if real monorepos require it.",
      closureCondition:
        "Evidence-backed bound/selection change if real monorepos require it.",
    },
    {
      id: "GAP-027",
      title: "RepositoryMap is not a stable serialized format",
      sourceCheckpoint: "Phase 2D",
      description:
        "RepositoryMap exists in memory only; no persistence or serialization contract exists.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking: "Phase 2 Master Contract defers persistence.",
      missingEvidence: "Future persistence/versioning architecture.",
      closureCondition: "Future persistence/versioning architecture.",
    },
    {
      id: "GAP-028",
      title: "Search is lexical/topological only",
      sourceCheckpoint: "Phase 2E",
      description:
        "No semantic intent, typo tolerance, synonyms, stemming, fuzzy search, AST/symbol/import search, or general content search.",
      reviewClassification: "SCHEDULED_DEFERRED",
      lifecycle: "OPEN",
      whyNonBlocking: "Phase 2E bounded claims are lexical/topological only.",
      closureCondition:
        "Advanced context/session intelligence or another explicitly approved retrieval phase.",
      notes: "Do not solve inside Phase 2E.",
    },
    {
      id: "GAP-029",
      title: "Search performance at maximum corpus is not characterized",
      sourceCheckpoint: "Phase 2E",
      description:
        "Lexical search performance near Phase 2A's 50,000-observation ceiling is not benchmarked.",
      reviewClassification: "OPTIMIZATION",
      lifecycle: "OPEN",
      closureCondition:
        "Benchmark near Phase 2A's 50,000-observation ceiling if performance becomes a product requirement.",
    },
    {
      id: "GAP-030",
      title: "Freshness is not yet implemented",
      sourceCheckpoint: "Phase 2A–2E",
      description:
        "No freshness or snapshot-integrity engine exists; RI-008 remains deferred.",
      reviewClassification: "SCHEDULED_DEFERRED",
      lifecycle: "CLOSED",
      whyNonBlocking: "Deferred by frozen Master Contract until Phase 2F.",
      closureCondition: "RI-008 and freshness/snapshot evidence.",
      closedByCommit: "ba588a084982736bfd924aa5fc821df45694279f",
      closureEvidence: "docs/reports/PHASE_2F_REPORT.md",
      notes:
        "RI-008 behavioral evidence includes same-size same-mtime in-place content change detection via bounded 2B re-read; metadata equality never produces `VERIFIED_CURRENT`.",
    },
    {
      id: "GAP-031",
      title: "Snapshot persistence intentionally absent",
      sourceCheckpoint: "Phase 2 Master Contract",
      description:
        "Repository snapshots remain in memory only; no durable snapshot store exists.",
      reviewClassification: "SCHEDULED_DEFERRED",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Current Phase 2 rule explicitly forbids persistence in 2A–2F scope.",
      closureCondition: "Advanced session/context persistence architecture.",
      notes: "This MUST NOT be \"fixed\" in Phase 2F.",
    },
    {
      id: "GAP-032",
      title: "No model-boundary integration audit yet",
      sourceCheckpoint: "Phase 2 Master Contract",
      description:
        "RI-012 independent integration audit covering model/provider boundaries is not complete.",
      reviewClassification: "SCHEDULED_DEFERRED",
      lifecycle: "CLOSED",
      whyNonBlocking: "Assigned to Phase 2G by frozen contract.",
      closureCondition: "RI-012 independent integration audit.",
      closedByCommit: "f2e175886f888ce3ce42d5b1982f153971b75320",
      closureEvidence:
        "docs/reports/PHASE_2G_AUDIT_REPORT.md §RI-012 independent audit; tests/integration/phase2-architecture-audit.test.ts",
      notes:
        "Closed at Phase 2 Closure; not closed in the Phase 2G audit commit itself.",
    },
    {
      id: "GAP-033",
      title:
        "Canonical cross-component RepositoryEntry membership was undeclared, causing Git/snapshot incompatibility",
      sourceCheckpoint:
        "Phase 2G NOT COMPLETE audit against baseline fb1484afe9c6527dd906dfdb6aa5a907ac6d01ab",
      description:
        "Phase 2C legitimately annotates `RepositoryEntry` values carried by entry-bearing inventory observations such as DESCENDED directories. Phase 2F validated Git annotation membership against an ADMITTED-only subset. The root defect is broader than one comparison: the canonical `RepositoryEntry` set used for cross-component reference identity was not explicitly defined as a shared inventory-layer contract. This caused a valid `GitStateBaseline` produced from a `RepositoryInventory` to be rejected by a `RepositorySnapshot` built from the same inventory.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Downstream false assumption / composition failure — Phase 3 would inherit incorrect PRE_EXISTING binding semantics.",
      closureCondition:
        "Canonical cross-component `RepositoryEntry` membership defined; every relevant 2C/2D/2E/2F consumer audited against it; legitimate nested Git baseline binds into snapshot; foreign-inventory references still fail closed; original defect reproduced by falsification; immutable implementation checkpoint exists.",
      closedByCommit: "c0309407ea891cfa036f93d455f500694779c301",
      closureEvidence: "docs/reports/PHASE_2G_H1_REPORT.md",
      notes:
        "Phase 2G remains NOT COMPLETE until the independent integration audit is rerun after H1.",
    },
    {
      id: "GAP-034",
      title:
        "Phase 2G compile-time spot-checks for RI-017 and RI-012 listed but unexecuted",
      sourceCheckpoint: "Phase 2G re-audit, f2e175886f888ce3ce42d5b1982f153971b75320",
      description:
        "The committed Phase 2G audit report listed RI-017 and RI-012 among compile-time intended-error spot-checks, but a malformed shell loop meant those two probes did not execute during the audit.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "The frozen invariant \"claims require evidence\" was violated in the audit's own record. It blocked the closure evidence chain, not the production implementation.",
      closureCondition:
        "Execute or formally disposition RI-017 and RI-012 compile-time evidence; restore source; document reconciliation.",
      closedByCommit: "2a4d81cefa6b3c32d6970fad8b9f985083fb24da",
      closureEvidence: "docs/reports/PHASE_2G_E1_EVIDENCE_SUPPLEMENT.md",
      notes:
        "BLOCKING_INVARIANT — AUDIT EVIDENCE. RI-017 executed with the intended error; RI-012 recorded NOT APPLICABLE with rationale rather than a manufactured probe.",
    },
    {
      id: "GAP-035",
      title:
        "Residual hostile concurrent filesystem race after final pre-commit revalidation",
      sourceCheckpoint: "Phase 3B existing-file atomic replacement",
      description:
        "A narrow window remains between final pre-commit currentness revalidation and the atomic rename commit point during which a hostile concurrent writer could still mutate the target.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "The frozen Phase 3 Master explicitly limits the guarantee and does not claim hostile-filesystem linearizability.",
      missingEvidence:
        "Proven stronger platform compare-and-swap, locking, or equivalent mechanism.",
      closureCondition:
        "Proven stronger platform compare-and-swap, locking, or equivalent mechanism.",
    },
    {
      id: "GAP-036",
      title: "Crash-orphan temporary candidate possibility",
      sourceCheckpoint: "Phase 3B existing-file atomic replacement",
      description:
        "An abrupt process or OS crash before handled temp cleanup can leave a same-directory Path Code temp candidate on disk.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Handled failures and normal completion clean up; abrupt crash is explicitly outside the stronger claim.",
      missingEvidence: "Proven unnamed-temp or crash-recovery architecture.",
      closureCondition:
        "Proven unnamed-temp or crash-recovery architecture.",
    },
    {
      id: "GAP-037",
      title: "Extended metadata not preserved or proven in existing-file replacement",
      sourceCheckpoint: "Phase 3B existing-file atomic replacement",
      description:
        "ACLs, xattrs, resource forks, alternate data streams, and filesystem-specific metadata are not claimed preserved during existing-file atomic replacement unless actually proven.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Basic mode and owner/group preservation are proven; extended metadata is honestly excluded.",
      missingEvidence:
        "Platform-specific preservation or explicit detection-and-refusal mechanism.",
      closureCondition:
        "Platform-specific preservation or explicit detection-and-refusal mechanism.",
    },
    {
      id: "GAP-038",
      title: "Mutation-time config stale fallback after loadProjectConfig failure",
      sourceCheckpoint:
        "Phase 3B failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d",
      description:
        "resolveMutationConfig treated loadProjectConfig ConfigFailure as success by substituting stale prepared.config (SUPPLIED_ONLY), allowing mutation to continue instead of REFUSED_PRECOMMIT before temp creation.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Blocking — fail-closed mutation-time config reload is required; stale fallback permits mutation under failed trust revalidation.",
      closureCondition:
        "ConfigFailure refuses with CONFIG_RELOAD_FAILED before temp/write/rename; ABSENT remains successful reload; permanent C1–C4 and FAL-C1/C2/C3 evidence; immutable H1 implementation checkpoint.",
      missingEvidence:
        "Immutable H1 corrective implementation commit with permanent fail-closed tests and live falsifications.",
      closedByCommit: "ad85c9f1262635f9a81b5608b20c198a7b8b489d",
      closureEvidence: "docs/reports/PHASE_3B_H1_REPORT.md",
      notes:
        "Phase 3B remains NOT COMPLETE pending full evidence re-run after H1.",
    },
    {
      id: "GAP-039",
      title: "Temp-creation createTempExclusive throw escapes replaceExistingFile",
      sourceCheckpoint:
        "Phase 3B failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d",
      description:
        "prepareTempCandidate invoked createTempExclusive outside the inner try/catch, so injected or real creation failures escaped as uncaught exceptions instead of terminal FAILED_PRECOMMIT with commitPointReached=false.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Blocking — pre-commit recovery must surface controlled FAILED_PRECOMMIT rather than escaping throws.",
      closureCondition:
        "createTempExclusive failures map to FAILED_PRECOMMIT without escape; permanent adapter-fault test and FAL-T1; immutable H1 implementation checkpoint.",
      missingEvidence:
        "Immutable H1 corrective implementation commit with permanent temp-creation recovery test and live falsification.",
      closedByCommit: "ad85c9f1262635f9a81b5608b20c198a7b8b489d",
      closureEvidence: "docs/reports/PHASE_3B_H1_REPORT.md",
      notes:
        "Phase 3B remains NOT COMPLETE pending full evidence re-run after H1.",
    },
    {
      id: "GAP-040",
      title:
        "Capability Ledger v1 cannot let later negative evidence supersede PASS_FROZEN",
      sourceCheckpoint:
        "Phase 3B-H1 corrective bookkeeping after failed evidence 035cb5f36b989496b30c289ee931b950bd61fa7d",
      description:
        "Capability Ledger v1 derives PASS_FROZEN from freezeEvidence citations resolving at HEAD. Later negative evidence reports cannot mechanically revoke or supersede an earlier PASS_FROZEN without an explicit canonical-record edit removing/superseding freezeEvidence. Historical linkage commits remain immutable.",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Operators must manually correct the current canonical capability record when later evidence fails; the limitation is honesty/process, not a silent production mutation hazard.",
      missingEvidence:
        "Schema/runtime support for negative-evidence supersession of freeze state, or an equivalent explicit ledger revision protocol.",
      closureCondition:
        "Schema/runtime support for negative-evidence supersession of freeze state, or an equivalent explicit ledger revision protocol.",
    },
    {
      id: "GAP-041",
      title: "Pass contracts are not repository artifacts",
      sourceCheckpoint:
        "Phase 3B evidence completion re-run after Phase 3B-H1 recovery",
      description:
        "Master contracts and phase reports are repository-recorded, but the exact per-pass execution instruction (e.g. merged audit contract prose) may not be present as an immutable repository artifact at audit time. Recovery and evidence passes then rely on recovery instructions, committed reports, and current tree inspection.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: null,
      lifecycle: "OPEN",
      notes:
        "Missing evidence: immutable repository record of bounded pass execution instructions. Closure requires deliberate process decision on storage/freeze location.",
    },
    {
      id: "GAP-042",
      title:
        "Two-commit freeze contamination was repository-wide instead of capability-scoped",
      sourceCheckpoint:
        "Phase 3B evidence completion linkage failure at 2b635316f7f08c0cf08ef42ec40ab2cd513d3969",
      description:
        "TWO_COMMIT_FREEZE rejected unrelated src/selfobs bookkeeping between the corrected Phase 3B implementation commit and evidence commit because the verifier treated all src/** changes as contamination instead of validating only the frozen capability's declared productionScopes.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Blocking — unrelated self-observation bookkeeping must not invalidate an unrelated capability freeze when declared production scopes are unchanged.",
      closureCondition:
        "Verifier validates unchanged declared productionScopes for the frozen capability while allowing unrelated source changes outside those scopes; permanent tests and live falsifications at immutable H2 checkpoint.",
      missingEvidence:
        "Immutable H2 verifier correction commit with scoped contamination validation.",
      closedByCommit: "7e54424fd6a2bb1d298f28bd83f513046307a37e",
      closureEvidence: "docs/reports/SELF_OBSERVATION_V1_H2_FREEZE_SCOPE_REPORT.md",
    },
    {
      id: "GAP-043",
      title: "Created vs modified provenance is not distinguished",
      sourceCheckpoint: "Phase 3C safe single-file creation",
      description:
        "Successful Phase 3C creation earns PATH_CODE_MODIFIED using the frozen provenance vocabulary. The vocabulary does not distinguish files created by Path Code from files modified by Path Code.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Frozen provenance vocabulary remains truthful; creation vs modification distinction is not required for SE-019 safety claims.",
      missingEvidence:
        "Deliberate provenance-vocabulary revision if product semantics require the distinction.",
      closureCondition:
        "Deliberate provenance-vocabulary revision if product semantics require the distinction.",
    },
    {
      id: "GAP-044",
      title:
        "Residual race between final creation revalidation and hard-link publication",
      sourceCheckpoint: "Phase 3C safe single-file creation",
      description:
        "After final parent/absence/denial rechecks and before linkNoOverwrite, a concurrent actor may create the target. Hard-link EEXIST refuses overwrite, but the Master does not claim hostile concurrent-filesystem linearizability for the revalidation window.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Publication remains no-overwrite; residual race is detection/refusal, not silent corruption. Distinct from GAP-035 (3B rename window).",
      missingEvidence:
        "Proven stronger dirfd/openat2/locking/CAS-style platform mechanism.",
      closureCondition:
        "Proven stronger dirfd/openat2/locking/CAS-style platform mechanism.",
    },
    {
      id: "GAP-045",
      title:
        "Post-publication creation temp may remain as a second hard-link name",
      sourceCheckpoint: "Phase 3C safe single-file creation",
      description:
        "After successful linkNoOverwrite, candidate and target name the same inode. If candidate-name removal fails or the process crashes before removal, a Path Code temp name may remain as a second directory entry for the published file. GAP-036 covers crash-orphan unpublished temps for 3B; this records the post-publication second-name case for creation.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "Handled unlink failure is reported as COMMITTED_FAILURE with cleanupFailure; target is not deleted. Crash residue is an OS-visible honesty limit, not silent corruption.",
      missingEvidence:
        "Unnamed-temp or stronger platform primitive eliminating the second-name window.",
      closureCondition:
        "Unnamed-temp or stronger platform primitive eliminating the second-name window.",
    },
    {
      id: "GAP-046",
      title: "CREATE_FILE action restriction missing from Phase 1 ActionClass mapping",
      sourceCheckpoint:
        "Phase 3C-H1 review at c82ed1042d06bed56485cf622871ded970d6d440",
      description:
        "Frozen Phase 3 Master required Phase 3A to map CREATE_FILE to an honest disable-action ActionClass or STOP AND REPORT. 3A shipped without that mapping; disable-action=EDIT blocks modification only while creation remains permitted. This violates the frozen mutation-class distinction and would leave Phase 3D without a distinct creation restriction axis.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Blocking — deny-path is not an equivalent substitute for action-class restriction of CREATE_FILE.",
      missingEvidence:
        "Additive Phase 1 ActionClass amendment plus authorization-time and mutation-time CREATE_FILE disable enforcement with immutable corrective evidence.",
      closureCondition:
        "CREATE_FILE maps to a distinct amended Phase 1 ActionClass; authorization and mutation-time refusal work; Stage 2/3 evidence closes the defect.",
      closedByCommit: "1136c40ab1667e4a5b70185c8bef68ce67d675a2",
      closureEvidence: "docs/reports/PHASE_3C_H1_REPORT.md",
      notes:
        "Closed by Phase 3C-H1: Phase 1 Action Class Amendment 1 + Stage 2 CREATE_FILE mapping + C-F8 live falsification. Evidence: docs/PHASE_1_ACTION_CLASS_AMENDMENT_1.md, docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md, docs/reports/PHASE_3C_H1_REPORT.md §2/§5.",
    },
    {
      id: "GAP-047",
      title: "Uncontracted post-creation verification path read",
      sourceCheckpoint:
        "Phase 3C-H1 review at c82ed1042d06bed56485cf622871ded970d6d440",
      description:
        "Phase 3C requires after-state verification of a newly published path that has no RepositoryEntry and intentionally performs no reinventory. The shipped bounded path read in the editing filesystem layer lacked a frozen authority concept limiting it to the exact target this creation operation published.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      whyNonBlocking:
        "Blocking — post-creation verification must not become generic repository-read authority.",
      missingEvidence:
        "Frozen operation-bound PublishedCreationVerificationTarget / CreationAfterStateEvidence contract and implementation that cannot target caller-supplied or other-operation paths.",
      closureCondition:
        "Opaque publication-earned verification token gates the read; evidence is not RepositoryEntry/ContentObservation; C-F9 and Stage 2/3 evidence close the defect.",
      closedByCommit: "1136c40ab1667e4a5b70185c8bef68ce67d675a2",
      closureEvidence: "docs/reports/PHASE_3C_H1_REPORT.md",
      notes:
        "Closed by Phase 3C-H1: Phase 3 Safe Editing Amendment 1 + Stage 2 opaque verification + C-F9 type/runtime falsification. Evidence: docs/PHASE_3_SAFE_EDITING_AMENDMENT_1.md, docs/reports/PHASE_3C_H1_REPORT.md §2/§5.",
    },
    {
      id: "GAP-048",
      title:
        "PUBLIC_AUTHORITY_SURFACE_LEAK — replaceExistingFile public fsOps mechanism substitution",
      sourceCheckpoint:
        "Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8",
      description:
        "Public ReplaceExistingFileOptions.fsOps is accepted by the Phase 3 editing barrel and honored at runtime as options.fsOps ?? productionAtomicReplaceFs, allowing caller substitution of the frozen 3B filesystem mutation and evidence operation set.",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      missingEvidence:
        "Public wrapper without fsOps; internal-only dependency-bound helper; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.",
      closureCondition:
        "Supported public replaceExistingFile cannot accept, forward, or resolve filesystem mechanism substitution; internal test seam is non-public; malicious runtime and standing architecture guard pass.",
      closedByCommit: "5386f349eccd7c69ff696619ffc426757e3e91d0",
      closureEvidence:
        "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md",
      notes:
        "Closed by Stage 3 public authority-surface internalization: public replaceExistingFile binds productionAtomicReplaceFs only; fsOps confined to non-barrel replaceExistingFileWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.",
    },
    {
      id: "GAP-049",
      title:
        "PUBLIC_AUTHORITY_SURFACE_LEAK — createFile public fsOps mechanism substitution",
      sourceCheckpoint:
        "Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8",
      description:
        "Public CreateFileOptions.fsOps is accepted by the Phase 3 editing barrel and honored at runtime as options.fsOps ?? productionAtomicCreateFs, allowing caller substitution of the frozen 3C filesystem mutation and verification operation set.",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      missingEvidence:
        "Public wrapper without fsOps; internal-only dependency-bound helper; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.",
      closureCondition:
        "Supported public createFile cannot accept, forward, or resolve filesystem or verification mechanism substitution; internal test seam is non-public; malicious runtime and standing architecture guard pass.",
      closedByCommit: "5386f349eccd7c69ff696619ffc426757e3e91d0",
      closureEvidence:
        "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md",
      notes:
        "Closed by Stage 3 public authority-surface internalization: public createFile binds productionAtomicCreateFs only; fsOps confined to non-barrel createFileWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.",
    },
    {
      id: "GAP-050",
      title:
        "PUBLIC_AUTHORITY_SURFACE_LEAK — executeMultiFilePlan public targetOps mechanism substitution",
      sourceCheckpoint:
        "Phase 3 public authority-surface census at 696ef4fe58c21cdd527869309a2b9fd5abcd19a8",
      description:
        "Public ExecuteMultiFilePlanOptions.targetOps is accepted by the Phase 3 editing barrel and honored at runtime as options.targetOps ?? productionOps, allowing caller substitution of the frozen 3D delegation path to real replaceExistingFile and createFile.",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      missingEvidence:
        "Public executeMultiFilePlan(plan) only; internal-only test executor; malicious runtime proof; standing public-surface guard; immutable corrective checkpoint.",
      closureCondition:
        "Supported public multi-file execution cannot accept, forward, or resolve target-operation substitution; internal test seam is non-public; malicious runtime and standing architecture guard pass.",
      closedByCommit: "5386f349eccd7c69ff696619ffc426757e3e91d0",
      closureEvidence:
        "docs/reports/PHASE_3_PUBLIC_AUTHORITY_SURFACE_HARDENING_REPORT.md",
      notes:
        "Closed by Stage 3 public authority-surface internalization: public executeMultiFilePlan binds productionOps only; targetOps confined to non-barrel executeMultiFilePlanWithDependencies; malicious runtime and standing architecture guard pass at correction SHA.",
    },
    {
      id: "GAP-051",
      title:
        "First Phase 3 integration audit conclusion superseded by missed public authority-surface leak",
      sourceCheckpoint:
        "Phase 3 public authority-surface census after first integration audit 696ef4fe58c21cdd527869309a2b9fd5abcd19a8",
      description:
        "The first Phase 3 integration audit returned COMPLETE while public fsOps/targetOps mechanism-substitution seams remained active. That audit remains immutable historical evidence, but its COMPLETE conclusion is progression-ineligible until a fresh full re-audit returns COMPLETE after correction.",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "OPEN",
      missingEvidence:
        "Immutable corrective hardening chain plus fresh full Phase 3 integration re-audit COMPLETE by an independent Stage 3 R1 auditor.",
      closureCondition:
        "Fresh full Phase 3 re-audit R1 returns COMPLETE after correction and supersedes both the first audit and the non-independent 5606b49 re-audit for progression while preserving them as historical evidence.",
      notes:
        "Prior canonical closure landed in ee58673 and cited 5606b49 / docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md. Superseded for progression by GAP-052 and Phase 3-R1 reconciliation. Historical commits/reports remain immutable.",
    },
    {
      id: "GAP-052",
      title:
        "Phase 3 re-audit at 5606b49 executed by a non-independent auditor",
      sourceCheckpoint:
        "Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519",
      description:
        "The fresh auditor task required by the hardening contract failed with resource_exhausted before writing or committing. The Stage 0–4 writer session then executed Stage 5 and committed 5606b49. The committed report does not record that provenance break.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "OPEN",
      missingEvidence:
        "A fresh full Phase 3 re-audit at the corrected/reconciled checkpoint by an executor session with no prior write in this R1 chain, plus a complete auditor provenance/attestation block and immutable audit evidence.",
      closureCondition:
        "A fresh Stage 3 R1 auditor returns COMPLETE at the Stage 2 checkpoint; its report contains the required provenance block; safe-editing phaseAuditEvidence is later relinked to that immutable re-audit.",
      notes:
        "The prior GAP-051 canonical closure landed in ee58673 while its closedByCommit / closureEvidence pointed to 5606b49. Those historical records remain immutable; this gap supersedes them for progression. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.",
    },
    {
      id: "GAP-053",
      title: "Stage 1 §1.4 downgrade falsification not proven at eabbc19",
      sourceCheckpoint:
        "Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519",
      description:
        "The census asserted §1.4 success, but the live restore script raised IndexError before capturing the required MUST-FAIL evidence; the restore-back line did not run in that process; the following focused test failed in a state consistent with freezeEvidence remaining restored; ledger:verify evidence cited the pre-Stage-1 baseline rather than the committed downgrade checkpoint.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      missingEvidence:
        "A historical derivation at immutable eabbc19 establishing the committed downgrade state, the restore direction using exact pre-downgrade freezeEvidence from the preceding canonical checkpoint, and current bidirectional freeze falsifications.",
      closureCondition:
        "The missing original live run remains explicitly recorded as NOT PROVEN; historical verification at eabbc19 establishes the semantic state the commit actually encodes; both restore and removal directions are proven without rewriting history; an immutable evidence report records the disposition.",
      closedByCommit: "2208dfa91e8f16571c3df884441aef7c75b1a062",
      closureEvidence: "docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §2",
      notes:
        "Original live §1.4 run remains NOT PROVEN. Closure means the historical semantic disposition is now independently evidenced at eabbc19 (IMPLEMENTED) with in-memory restore to PASS_FROZEN and current forward relink falsification, not that the original failed script is retroactively repaired. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.",
    },
    {
      id: "GAP-054",
      title:
        "Closure B §6.6 jointly unsatisfiable and historical audit mechanism removed",
      sourceCheckpoint:
        "Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519",
      description:
        "Prior §6.6 simultaneously required PHASE_VERIFIED/GAP-051 CLOSED, unchanged audit tests, and final npm test PASS while those audit tests bound live canonical state. ee58673 edited two audit suites and scripts/ledger-verify.ts without contract authorization and removed the historical half-citation issueLedgerVerification probe.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "CLOSED",
      missingEvidence:
        "Restored historical probe; a ledger:verify consistency mechanism that derives expectations from ledger shape rather than hardcoding phase status; an explicit bounded rule authorizing only live-state assertion updates during closure.",
      closureCondition:
        "The deleted probe is restored without weakening; the ledger consistency gate is shape-driven and falsified; this immutable R1 contract explicitly authorizes only bounded live-state pin updates and forbids deletion/weakening of audit mechanisms; the reconciliation report records the contract defect.",
      closedByCommit: "7f4267d5d59feee8a73e5e3217c6ab2b1abd7a48",
      closureEvidence:
        "docs/reports/PHASE_3_R1_RECONCILIATION_REPORT.md §1 plus docs/passes/PHASE_3_R1_CLOSURE_RECONCILIATION_CONTRACT.md Stage 4 bounded live-state update rule",
      notes:
        "Historical probe restored; ledger gate generalized and falsified; prior unsatisfiable §6.6 preserved as historical contract evidence. Primary origin: CONTRACT. Contributing cause: EVIDENCE shape. Operator approved reviewClassification BLOCKING_INVARIANT unchanged at Stage 1.",
    },
    {
      id: "GAP-055",
      title:
        "Auditor independence is not mechanically verifiable from repository evidence",
      sourceCheckpoint:
        "Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519",
      description:
        "The repository can record an auditor's report and operator attestation, but the current self-observation model has no mechanical mechanism proving that the auditor session received no forbidden transcript/context or performed no prior write.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "R1 can structurally enforce executor separation and record the audit result mechanically while explicitly labeling the independence claim ASSERTED. The limitation concerns proof of process provenance, not the audit's repository-recorded tests/results themselves.",
      missingEvidence:
        "An approved repository-visible mechanism, if later required, that can bind an independent audit execution to mechanically verifiable provenance rather than operator testimony alone.",
      closureCondition:
        "A future Master/preflight deliberately defines and proves such a mechanism, or explicitly dispositions the limitation while preserving truthful admissibility. Do not preselect a schema field or force a foundation change in this pass.",
      notes:
        "The R1 report presence is REPOSITORY_RECORDED; the truth of independence attestation is ASSERTED. Do not invent OPERATOR_ATTESTED or another evidence tier. Not attached to any capability. Operator approved reviewClassification NON_BLOCKING_LIMITATION unchanged at Stage 1.",
    },
    {
      id: "GAP-056",
      title: "Final-head Phase 3 runtime test figure not durably recorded",
      sourceCheckpoint:
        "Phase 3-R1 reconciliation at ee586732ac602eabbf310888b7b44c9bdf8ef519",
      description:
        "Closure A correctly binds 607 runtime tests to 04591e4. Final validation at ee58673 reported 608 runtime tests, but no immutable closure/report/recordedFigure records that final-head figure.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "The historical 607 figure is already truthful and correctly bound. Missing 608 recording is a final reporting/evidence-completeness defect, not evidence that Safe Editing behavior is incorrect.",
      missingEvidence:
        "A final reconciliation closure artifact carrying the exact runtime total at its immutable checkpoint plus a Capability Ledger recordedFigure bound to that artifact/commit.",
      closureCondition:
        "The R1 closure reconciliation artifact records the exact final runtime total at its own immutable commit; Capability Ledger binds the figure to that document and commit; the historical 607 figure remains unchanged.",
      notes:
        "Operator approved reviewClassification NON_BLOCKING_LIMITATION unchanged at Stage 1 (explicit confirmation that F4 / Stage 0 contract text directs this gap).",
    },
    {
      id: "GAP-057",
      title:
        "Standing public authority-surface guard omits AuthorizePreparedChangeOptions and does not derive complete public parameter coverage",
      sourceCheckpoint:
        "Phase 3-R1 Stage 3 independent re-audit at ecda537",
      description:
        "authorizePreparedChange is exported from the public editing barrel and issues authorization. Its options type is declared in src/editing/types.ts and re-exported by name. The standing guard hardcodes three option types in three files, performs no export-driven census and no recursive type-graph traversal, and never inspects that type. An authority-bearing callable member added to it was not detected by the guard, the P1–P14 suite, or the full test suite. Hardening report §9 recorded the standing-guard deferral as scoped \"beyond the Phase 3 editing option types already guarded\", which is false for this type and masked the omission during the first audit. After R2, discovery was derived but recursive traversal remained gated on parameterName === 'options' or a /Options$/ type-name pattern, leaving 24 of 28 public parameter roots uninspected.",
      proposedClass: "BLOCKING_INVARIANT",
      reviewClassification: "BLOCKING_INVARIANT",
      lifecycle: "OPEN",
      missingEvidence:
        "export-driven public-surface discovery; named re-export resolution; recursive cycle-safe project type-graph traversal; detection of the auditor's exact authorityOps corruption; detection of an unlisted future public options type; preserved legitimate data/context; immutable corrective evidence; unconditional structural traversal of every derived public parameter root with explicit dispositions",
      closureCondition:
        "the standing guard derives its coverage from the complete supported public editing surface rather than an enumerated list; follows named re-exports and project-defined parameter graphs; fails on the auditor's corruption naming the function, the type and the member; fails on a new unlisted public options type; passes legitimate data and context; every falsification corrupts, fails for the intended reason, restores exactly, and passes; every derived public parameter root receives exactly one explicit structural disposition; no root is skipped by parameter name or type-name pattern; an adversarially named parameter and type carrying a mechanism-substitution member is detected.",
      notes:
        "Closed at 4aadb06047173b09cfceee542f140ad6fce7b06f with evidence docs/reports/PHASE_3_R2_CORRECTION_REPORT.md. Independent re-audit at c60c78254ce273235921694faac57ec5e4a30d5f (F-R1-003) proved that closure evidence insufficient: recursive traversal remained gated on parameter/type naming, so 'follows project-defined parameter graphs' was not met. Prior closure commits remain immutable. Reopened by Phase 3-R2-H1.",
    },
    {
      id: "GAP-058",
      title:
        "Derived public-surface guard covers the editing barrel only, not the package root",
      sourceCheckpoint:
        "Phase 3-R2 correction at the Stage 0 commit",
      description:
        "Amendment 1 A/B permit a package-root callable-surface manifest. This pass scopes the derived walker to src/editing/index.ts, where the authority surface and the finding live. package.json exports only \".\" and src/index.ts does not re-export editing, so no editing surface is reachable through a supported package subpath today.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "the omitted scope contains no authority-bearing surface reachable by a package consumer at this checkpoint; the editing barrel is where authority is issued and mutation is performed",
      missingEvidence:
        "a derived manifest rooted at package.json exports and src/index.ts, with the same detection rules",
      closureCondition:
        "the derived walker is rooted at the supported package exports in addition to the editing barrel, with falsifications proving coverage of both roots",
      notes:
        "Operator decision D2 — editing-barrel scope only for this pass. Not attached to any capability.",
    },
    {
      id: "GAP-059",
      title:
        "Full npm run check exhibits widespread wall-clock timeout instability under host contention",
      sourceCheckpoint:
        "Phase 3-R1 Stage 3 fresh re-audit at c60c782",
      description:
        "3 of 4 full check runs timed out (16, 1, 23 tests respectively); zero assertion failures; suspect files pass in isolation (52/52); excluding both R2 architecture files still left 4 timeouts; host load 26–30 on 8 CPUs; R2's 2-F6 timed out against its own 60s budget. Extent exceeds the previously recorded two-file flake.",
      proposedClass: "NON_BLOCKING_LIMITATION",
      reviewClassification: "NON_BLOCKING_LIMITATION",
      lifecycle: "OPEN",
      whyNonBlocking:
        "no assertion defect established; all affected suites pass in isolation; one complete run passed; no production-semantic failure demonstrated.",
      missingEvidence:
        "deterministic worker/concurrency policy or bounded test-program reuse, plus representative repeated clean checks under recorded load.",
      closureCondition:
        "a proven load-control mechanism and repeated clean full checks with recorded host conditions.",
      notes:
        "supersedes the narrower two-file disposition cited in the census baseline and hardening report §9 as the current description of this behavior. Not attached to any capability.",
    },
  ],
};

export const CANONICAL_GAP_LEDGER: Readonly<GapLedger> = deepFreeze(GAP_LEDGER_V1);

export function getCanonicalGapLedger(): Readonly<GapLedger> {
  return CANONICAL_GAP_LEDGER;
}
