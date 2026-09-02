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
  ],
};

export const CANONICAL_GAP_LEDGER: Readonly<GapLedger> = deepFreeze(GAP_LEDGER_V1);

export function getCanonicalGapLedger(): Readonly<GapLedger> {
  return CANONICAL_GAP_LEDGER;
}
