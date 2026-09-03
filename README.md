# Path Code

**Path Code is the coherent engineering system connecting intelligence, awareness, authority, action, evidence, and responsibility.**

The model supplies intelligence. Path Code supplies engineering conduct.

Path Code does not merely possess capabilities. It gives capabilities engineering conduct.

## Engineering Principle

Reliability precedes capability. Capability precedes optimization.

Path Code is built through small, bounded engineering phases. Each phase must be implemented, tested, challenged, reviewed, and frozen before the next capability layer begins.

## Source of Truth

The governing architecture, Engineering Constitution, capability model, and engineering roadmap are defined in:

[`docs/PATH_CODE_MASTER_V1.md`](docs/PATH_CODE_MASTER_V1.md)

Production implementation must remain consistent with that document.

## Current Status

**Phase 0 — FROZEN**

**Phase 1 — Foundation Kernel: COMPLETE / FROZEN**

Closure evidence:

[`docs/PHASE_1_FOUNDATION_CLOSURE.md`](docs/PHASE_1_FOUNDATION_CLOSURE.md)

Preserved Phase 1 sub-pass history:

**Phase 1A — Project + TypeScript Foundation: FROZEN**

**Phase 1B — Core Domain Contracts: FROZEN**

**Phase 1B WorkspaceBoundary Amendment: FROZEN**

**Phase 1C — Workspace + Canonical Path Foundation: FROZEN**

**Phase 1C CanonicalPath Encapsulation Hardening: FROZEN**

**Phase 1D — Git + Workspace Discovery: FROZEN**

**Phase 1E — PATHCODE.md + Configuration: FROZEN**

**Phase 1E ConfigFailure Surface Correction: FROZEN**

**Phase 1F — CLI + Platform Foundation Closure: FROZEN**

Next:

**Phase 2 — Repository Intelligence**

Master contract:

[`docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md`](docs/PHASE_2_REPOSITORY_INTELLIGENCE_MASTER.md)

**MASTER CONTRACT FROZEN**

**Phase 2 Pre-2A — Resolved Configuration Provenance Hardening: FROZEN**

**Phase 2A — Inventory + Traversal Safety: FROZEN**

**Phase 2B — Bounded Reader + Content Fingerprints: FROZEN**

**Phase 2C — Git State Baseline + Ignore / Provenance Annotation: FROZEN**

**Phase 2C-H1 — execFile-only Git Runner Hardening: FROZEN**

**Phase 2D — Project Metadata + Evidence-Backed Repository Map: FROZEN**

**Phase 2E — Search + Candidate Retrieval: FROZEN**

**Engineering Self-Observation Architecture: FROZEN**

[`docs/ENGINEERING_SELF_OBSERVATION.md`](docs/ENGINEERING_SELF_OBSERVATION.md)

**Gap Ledger: V1 ACTIVE**

[`docs/GAP_LEDGER.md`](docs/GAP_LEDGER.md)

**Phase 2F — Freshness + In-Memory Snapshot Integrity: FROZEN**

[`docs/reports/PHASE_2F_REPORT.md`](docs/reports/PHASE_2F_REPORT.md)

**Phase 2G-H1 — Canonical Cross-Component RepositoryEntry Membership: FROZEN**

[`docs/reports/PHASE_2G_H1_REPORT.md`](docs/reports/PHASE_2G_H1_REPORT.md)

**Phase 2G — Repository Intelligence Integration Audit: COMPLETE**

[`docs/reports/PHASE_2G_AUDIT_REPORT.md`](docs/reports/PHASE_2G_AUDIT_REPORT.md)

**Phase 2 — Repository Intelligence: COMPLETE / FROZEN**

[`docs/PHASE_2_CLOSURE.md`](docs/PHASE_2_CLOSURE.md)

**Engineering Self-Observation: RUNTIME FOUNDATION FROZEN**

[`docs/reports/SELF_OBSERVATION_V1_REPORT.md`](docs/reports/SELF_OBSERVATION_V1_REPORT.md)

**Capability Ledger: V1 ACTIVE**

**ledger:verify: ACTIVE IN npm run check**

**Phase 3 Safe Editing Master Contract: FROZEN**

[`docs/PHASE_3_SAFE_EDITING_MASTER.md`](docs/PHASE_3_SAFE_EDITING_MASTER.md)

**Phase 3A — Edit Contracts / Preparation / Authorization: PASS_FROZEN**

**Phase 3B — Existing-File Atomic Replacement: PASS_FROZEN**

**Phase 3B-H1 — Corrective pass: PASS_FROZEN**

**Phase 3C — Safe Creation: PASS_FROZEN** (contract-corrected via Phase 3C-H1)

**Phase 3C-H1 — Contract Correction: COMPLETE**

[`docs/reports/PHASE_3C_H1_REPORT.md`](docs/reports/PHASE_3C_H1_REPORT.md)

**Foundation Extensibility Constitution V1: FROZEN**

[`docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md`](docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1.md)

**Foundation Extensibility Constitution V1 Amendment 1 — Public Authority Surfaces: FROZEN**

[`docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md`](docs/FOUNDATION_EXTENSIBILITY_CONSTITUTION_V1_AMENDMENT_1_PUBLIC_AUTHORITY_SURFACE.md)

**Phase 3D — Multi-File Coordination Master Contract: FROZEN**

[`docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md`](docs/PHASE_3D_MULTI_FILE_COORDINATION_MASTER.md)

**Phase 3D — Multi-File Coordination: PASS_FROZEN**

[`docs/reports/PHASE_3D_REPORT.md`](docs/reports/PHASE_3D_REPORT.md)

**Capabilities:**

- `edit-contracts` PASS_FROZEN
- `existing-file-replacement` PASS_FROZEN
- `safe-file-creation` PASS_FROZEN
- `multi-file-coordination` PASS_FROZEN
- `safe-editing` PHASE_VERIFIED

Existing-file replacement is available as a bounded internal capability through the Phase 3B mechanism.

Safe-file-creation is available as a bounded internal capability through the Phase 3C mechanism (CREATE_FILE ActionClass + operation-bound post-creation verification).

Multi-file coordination is available as a bounded internal capability through the Phase 3D mechanism (opaque plan, read-only preflight, sequential 3B/3C execution, honest partial results).

**Phase 3 — Safe Editing Engine: COMPLETE / FROZEN**

[`docs/PHASE_3_CLOSURE.md`](docs/PHASE_3_CLOSURE.md)

[`docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md`](docs/reports/PHASE_3_INTEGRATION_REAUDIT_REPORT.md)

Path Code may:

- replace the content of an existing authorized regular file through the bounded 3B mechanism
- create one new authorized regular file under an admitted parent through the bounded 3C mechanism
- coordinate a bounded sequence of already-prepared, separately authorized 3B/3C mutations in one workspace through the Phase 3D mechanism

It still cannot:

- delete files
- create directories
- roll back a partially applied multi-file plan
- claim plan-level atomicity
- mutate Git state
- execute models or edit autonomously

Next permitted operation:

**ONE bounded Closed-Vocabulary & Foundation Extensibility Audit combined with preparation of the Phase 4 Master Contract.**

No Phase 4 implementation yet.
