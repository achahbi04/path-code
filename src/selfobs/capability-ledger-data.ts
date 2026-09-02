/**
 * Canonical Capability Ledger v1 — machine-readable proven engineering state.
 */

import type { CapabilityLedger, CapabilityRecord } from "./capability-types.js";
import { doc, mod, obligation, SHA } from "./citation-helpers.js";
import { deepFreeze } from "./freeze.js";

const RECORDS: CapabilityRecord[] = [
  {
    capabilityId: "domain-contracts",
    title: "Core Domain Contracts",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1B,
        "Phase 1B core domain contracts declared in master architecture",
      ),
    ],
    implementationEvidence: [
      mod("src/domain/index.ts", SHA.phase1B, "Domain contract public surface"),
      mod("src/domain/authority.ts", SHA.phase1B, "Authority decision contracts"),
      mod("src/domain/evidence.ts", SHA.phase1B, "Evidence record contracts"),
    ],
    dependencies: [],
    proofObligations: [],
    knownLimitations: [{ kind: "gap", id: "GAP-005", admissibility: "REPOSITORY_RECORDED" }],
  },
  {
    capabilityId: "canonical-workspace-path",
    title: "Canonical Workspace Path Foundation",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1C,
        "Phase 1C workspace and canonical path foundation declared",
      ),
    ],
    implementationEvidence: [
      mod("src/workspace/boundary.ts", SHA.phase1C, "Workspace boundary creation"),
      mod("src/workspace/canonical-path.ts", SHA.phase1C, "CanonicalPath branding"),
      mod("src/workspace/path-semantics.ts", SHA.phase1C, "Path containment semantics"),
    ],
    dependencies: ["domain-contracts"],
    proofObligations: [],
    knownLimitations: [
      { kind: "gap", id: "GAP-003", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-004", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "git-discovery",
    title: "Git Repository Discovery",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1D,
        "Phase 1D Git and workspace discovery declared",
      ),
    ],
    implementationEvidence: [
      mod("src/git/discovery.ts", SHA.phase1D, "Read-only Git root discovery"),
      mod("src/git/runner.ts", SHA.phase1D, "Fixed-vocabulary Git runner"),
    ],
    dependencies: ["canonical-workspace-path"],
    proofObligations: [],
    knownLimitations: [
      { kind: "gap", id: "GAP-001", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-017", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-018", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-019", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "project-configuration",
    title: "PATHCODE.md + Project Configuration",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1E,
        "Phase 1E configuration representation declared",
      ),
    ],
    implementationEvidence: [
      mod("src/config/loader.ts", SHA.phase1E, "Project configuration loader"),
      mod("src/config/parser.ts", SHA.phase1E, "PATHCODE.md directive parser"),
    ],
    dependencies: ["canonical-workspace-path"],
    proofObligations: [],
    knownLimitations: [],
  },
  {
    capabilityId: "cli-boundary",
    title: "CLI Platform Boundary",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1F,
        "Phase 1F CLI and platform foundation declared",
      ),
    ],
    implementationEvidence: [
      mod("src/cli/main.ts", SHA.phase1F, "Pure CLI boundary"),
      mod("src/cli/entry.ts", SHA.phase1F, "CLI compiled entry"),
      mod("src/cli/startup.ts", SHA.phase1F, "Startup gate"),
    ],
    dependencies: ["domain-contracts"],
    proofObligations: [],
    knownLimitations: [],
  },
  {
    capabilityId: "platform-foundation",
    title: "Platform Abstraction Foundation",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1F,
        "Platform abstraction foundation declared",
      ),
    ],
    implementationEvidence: [
      mod("src/platform/detect.ts", SHA.phase1F, "Platform detection"),
      mod("src/platform/current.ts", SHA.phase1F, "Current platform accessor"),
    ],
    dependencies: ["domain-contracts"],
    proofObligations: [],
    knownLimitations: [
      { kind: "gap", id: "GAP-002", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "foundation-kernel",
    title: "Phase 1 Foundation Kernel",
    phaseId: "phase-1",
    declarationEvidence: [
      doc(
        "docs/PATH_CODE_MASTER_V1.md",
        SHA.phase1Closure,
        "Phase 1 foundation kernel declared in master architecture",
      ),
    ],
    implementationEvidence: [
      mod("src/index.ts", SHA.phase1F, "Phase 1 public package surface"),
    ],
    phaseAuditEvidence: {
      auditReportPath: "docs/PHASE_1_FOUNDATION_CLOSURE.md",
      auditCommit: SHA.phase1Closure,
      auditConclusionNeedle: "**PHASE 1 FOUNDATION COMPLETE**",
      closureDocumentPath: "docs/PHASE_1_FOUNDATION_CLOSURE.md",
      closureCommit: SHA.phase1Closure,
      auditCheckpointNeedle: "57980bd3972822f4cbdf9e78fbec31e1f776c445",
    },
    dependencies: [
      "domain-contracts",
      "canonical-workspace-path",
      "git-discovery",
      "project-configuration",
      "cli-boundary",
      "platform-foundation",
    ],
    proofObligations: [],
    knownLimitations: [],
    recordedFigures: [
      {
        kind: "recordedFigure",
        label: "Runtime tests",
        value: "150",
        exactEvidenceNeedle: "Runtime tests: 150/150 PASS",
        inDocument: "docs/PHASE_1_FOUNDATION_CLOSURE.md",
        atCommit: SHA.phase1Closure,
        admissibility: "REPOSITORY_RECORDED",
      },
    ],
  },
  {
    capabilityId: "repository-inventory",
    title: "Repository Inventory + Traversal Safety",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2A,
        "Phase 2A inventory and traversal safety declared",
      ),
    ],
    implementationEvidence: [
      mod("src/inventory/traverse.ts", SHA.phase2A, "Bounded inventory traversal"),
      mod("src/inventory/index.ts", SHA.phase2A, "Inventory public surface"),
    ],
    dependencies: ["foundation-kernel"],
    proofObligations: [
      obligation(
        "RI-002",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-002",
      ),
      obligation(
        "RI-003",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-003",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-006", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-007", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "repository-reader",
    title: "Bounded Reader + Content Fingerprints",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2B,
        "Phase 2B bounded reader declared",
      ),
    ],
    implementationEvidence: [
      mod("src/reader/read.ts", SHA.phase2B, "Bounded repository content reader"),
      mod("src/reader/constants.ts", SHA.phase2B, "Reader hard ceilings"),
    ],
    dependencies: ["repository-inventory"],
    proofObligations: [
      obligation(
        "RI-001",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-001",
      ),
      obligation(
        "RI-007",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-007",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-008", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-009", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-012", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-013", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "git-state-baseline",
    title: "Git State Baseline + Ignore Annotation",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2C,
        "Phase 2C Git state baseline declared",
      ),
    ],
    implementationEvidence: [
      mod("src/git/baseline.ts", SHA.phase2C, "Git state baseline collection"),
      mod("src/git/check-ignore.ts", SHA.phase2C, "Git ignore annotation"),
    ],
    dependencies: ["git-discovery", "repository-inventory"],
    proofObligations: [
      obligation(
        "RI-017",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-017",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-014", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-015", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-016", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "project-metadata-map",
    title: "Project Metadata + Evidence-Backed Repository Map",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2D,
        "Phase 2D metadata and repository map declared",
      ),
    ],
    implementationEvidence: [
      mod("src/metadata/map.ts", SHA.phase2D, "Evidence-backed repository map"),
      mod("src/metadata/observe.ts", SHA.phase2D, "Manifest observation"),
    ],
    dependencies: ["repository-inventory", "repository-reader"],
    proofObligations: [
      obligation(
        "RI-010",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-010",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-021", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-022", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-023", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-027", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "repository-search",
    title: "Search + Candidate Retrieval",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2E,
        "Phase 2E search declared",
      ),
    ],
    implementationEvidence: [
      mod("src/search/engine.ts", SHA.phase2E, "Lexical search engine"),
      mod("src/search/corpus.ts", SHA.phase2E, "Search corpus construction"),
    ],
    dependencies: ["project-metadata-map"],
    proofObligations: [
      obligation(
        "RI-009",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-009",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-028", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-029", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "freshness-snapshot",
    title: "Freshness + In-Memory Snapshot Integrity",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2FImpl,
        "Phase 2F freshness and snapshot integrity declared",
      ),
    ],
    implementationEvidence: [
      mod("src/snapshot/snapshot.ts", SHA.phase2FImpl, "In-memory repository snapshot"),
      mod("src/snapshot/verify.ts", SHA.phase2FImpl, "Snapshot verification dimensions"),
    ],
    freezeEvidence: {
      kind: "twoCommit",
      implementationCommit: SHA.phase2FImpl,
      evidenceCommit: SHA.phase2FEvidence,
      reportPath: "docs/reports/PHASE_2F_REPORT.md",
      productionScopes: ["src/snapshot/"],
    },
    dependencies: ["repository-reader", "git-state-baseline", "project-metadata-map"],
    proofObligations: [
      obligation(
        "RI-008",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-008",
      ),
      obligation(
        "RI-011",
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "RI-011",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-031", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "repository-intelligence",
    title: "Phase 2 Repository Intelligence",
    phaseId: "phase-2",
    declarationEvidence: [
      doc(
        "docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md",
        SHA.phase2Master,
        "Phase 2 Repository Intelligence master contract",
      ),
    ],
    implementationEvidence: [
      mod("src/inventory/index.ts", SHA.phase2Closure, "Inventory public surface at closure"),
    ],
    phaseAuditEvidence: {
      auditReportPath: "docs/reports/PHASE_2G_AUDIT_REPORT.md",
      auditCommit: SHA.phase2GAudit,
      auditConclusionNeedle: "**Result:** PHASE 2 REPOSITORY INTELLIGENCE COMPLETE",
      closureDocumentPath: "docs/PHASE_2_CLOSURE.md",
      closureCommit: SHA.phase2Closure,
      auditCheckpointNeedle: "f2e175886f888ce3ce42d5b1982f153971b75320",
    },
    dependencies: [
      "repository-inventory",
      "repository-reader",
      "git-state-baseline",
      "project-metadata-map",
      "repository-search",
      "freshness-snapshot",
    ],
    proofObligations: [],
    knownLimitations: [],
    recordedFigures: [
      {
        kind: "recordedFigure",
        label: "Final runtime total",
        value: "437",
        exactEvidenceNeedle: "| Runtime tests | 437 PASS |",
        inDocument: "docs/PHASE_2_CLOSURE.md",
        atCommit: SHA.phase2Closure,
        admissibility: "REPOSITORY_RECORDED",
      },
    ],
  },
  {
    capabilityId: "edit-contracts",
    title: "Phase 3A Edit Contracts / Preparation / Authorization",
    phaseId: "phase-3",
    declarationEvidence: [
      doc(
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "3A — EDIT CONTRACTS / PREPARATION / AUTHORIZATION",
      ),
    ],
    implementationEvidence: [
      mod(
        "src/editing/index.ts",
        SHA.phase3AImpl,
        "Phase 3A public editing contract surface",
      ),
      mod(
        "src/editing/preparation.ts",
        SHA.phase3AImpl,
        "Point-in-time preparation through Phase 2B reader",
      ),
      mod(
        "src/editing/authorization.ts",
        SHA.phase3AImpl,
        "Explicit authorization and single-use semantics",
      ),
    ],
    freezeEvidence: {
      kind: "sameCommit",
      implementationCommit: SHA.phase3AImpl,
      reportPath: "docs/reports/PHASE_3A_REPORT.md",
    },
    dependencies: [
      "safe-editing",
      "repository-reader",
      "repository-inventory",
      "project-configuration",
      "canonical-workspace-path",
    ],
    proofObligations: [
      obligation(
        "SE-002",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-002 — AUTHORIZATION BINDS EXACT BYTES",
      ),
      obligation(
        "SE-003",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-003 — NO UNAUTHORIZED MUTATION",
      ),
      obligation(
        "SE-004",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-004 — NO AUTONOMOUS AUTHORITY",
      ),
      obligation(
        "SE-005",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-005 — AUTHORIZATION IS SINGLE-USE",
      ),
      obligation(
        "SE-012",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-012 — EXACT AUTHORIZED BYTES ONLY",
      ),
      obligation(
        "SE-013",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-013 — BOUNDS HOLD",
      ),
      obligation(
        "SE-016",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-016 — WRITE BOUNDARY HOLDS",
      ),
    ],
    knownLimitations: [],
  },
  {
    capabilityId: "existing-file-replacement",
    title: "Phase 3B Existing-File Atomic Replacement",
    phaseId: "phase-3",
    declarationEvidence: [
      doc(
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "3B — EXISTING-FILE ATOMIC REPLACEMENT",
      ),
    ],
    implementationEvidence: [
      mod(
        "src/editing/atomic-fs.ts",
        SHA.phase3BH1Impl,
        "Authorized low-level filesystem mutation adapter (H1-corrected)",
      ),
      mod(
        "src/editing/replace-existing-file.ts",
        SHA.phase3BH1Impl,
        "Existing-file atomic replacement with fail-closed mutation-time config and temp-creation recovery",
      ),
    ],
    // freezeEvidence intentionally absent: Phase 3B evidence at 035cb5f failed;
    // H1 corrects blocking defects but does not itself re-freeze PASS_FROZEN.
    dependencies: [
      "edit-contracts",
      "safe-editing",
      "repository-reader",
      "repository-inventory",
      "project-configuration",
      "canonical-workspace-path",
    ],
    proofObligations: [
      obligation(
        "SE-001",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-001 — NO UNVERIFIED MUTATION",
      ),
      obligation(
        "SE-008",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-008 — EXISTING-FILE COMMIT IS ATOMIC WHERE CLAIMED",
      ),
      obligation(
        "SE-009",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-009 — PRE-COMMIT RECOVERY",
      ),
      obligation(
        "SE-010",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-010 — AFTER-STATE IS VERIFIED",
      ),
      obligation(
        "SE-011",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-011 — PROVENANCE IS EARNED",
      ),
      obligation(
        "SE-015",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-015 — KNOWLEDGE INVALIDATED, NOT REPAIRED",
      ),
      obligation(
        "SE-017",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-017 — CONCURRENT CHANGE FAILS CLOSED WHEN DETECTED",
      ),
      obligation(
        "SE-018",
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "SE-018 — GIT SAFETY",
      ),
    ],
    knownLimitations: [
      { kind: "gap", id: "GAP-035", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-036", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-037", admissibility: "REPOSITORY_RECORDED" },
      { kind: "gap", id: "GAP-040", admissibility: "REPOSITORY_RECORDED" },
    ],
  },
  {
    capabilityId: "safe-editing",
    title: "Phase 3 Safe Editing Engine",
    phaseId: "phase-3",
    declarationEvidence: [
      doc(
        "docs/PHASE_3_SAFE_EDITING_MASTER.md",
        SHA.phase3Master,
        "Phase 3 Safe Editing master contract frozen declaration",
      ),
    ],
    implementationEvidence: [],
    dependencies: ["repository-intelligence"],
    proofObligations: [],
    knownLimitations: [],
  },
];

const CAPABILITY_LEDGER_V1: CapabilityLedger = {
  revision: "v1",
  records: RECORDS,
};

export const CANONICAL_CAPABILITY_LEDGER: Readonly<CapabilityLedger> =
  deepFreeze(CAPABILITY_LEDGER_V1);

export function getCanonicalCapabilityLedger(): Readonly<CapabilityLedger> {
  return CANONICAL_CAPABILITY_LEDGER;
}
