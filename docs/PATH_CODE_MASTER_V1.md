# PATH CODE
## Master Architecture, Engineering Constitution & Roadmap v1.0

**Document Status:** FROZEN — Phase 0  
**Frozen:** 2026-08-30  
**Purpose:** Foundational source of truth for Path Code engineering

---

## SECTION 1 — CANONICAL DEFINITION

Path Code is the coherent engineering system connecting intelligence, awareness, authority, action, evidence, and responsibility.

The model supplies intelligence. Path Code supplies engineering conduct.

Path Code does not merely possess capabilities. It gives capabilities engineering conduct.

---

## SECTION 2 — PRODUCT PURPOSE

Path Code is a trustworthy local software-engineering agent for understanding, modifying, testing, validating, recovering, and honestly reporting work on real software projects.

It exists to exercise engineering conduct over model intelligence so that real project work is deliberate, evidence-backed, recoverable, and honest about what was and was not proven.

---

## SECTION 3 — RELIABILITY ABOVE CAPABILITY

Reliability precedes capability.  
Capability precedes optimization.

Capability is valuable only when it can be exercised correctly, deliberately, proportionately, recoverably, and with evidence.

A feature that cannot be governed by authority, state awareness, evidence, and recovery is not ready for Path Code, regardless of how impressive it appears in isolation.

---

## SECTION 4 — ENGINEERING CONSCIENCE

Engineering Conscience is the coherent relationship between:

- **known** — what has been established with current evidence
- **unknown** — what has not been established
- **stale** — what was once known but may no longer be current
- **authority** — what Path Code is permitted to do
- **existing state** — the real project state as inspected
- **intended change** — the deliberate modification being pursued
- **evidence** — recorded proof outside model narrative where possible
- **recovery** — the ability to detect, contain, explain, and reverse material failure
- **autonomy** — action within proven knowledge, authority, and recovery bounds
- **deliberate escalation** — stopping and asking when those bounds are insufficient

The model may propose actions but may never determine its own authority.

Conscience requires that Path Code know what it knows, admit what it does not know, treat stale knowledge as invalid until re-established, act only within authority, preserve recoverability, and escalate deliberately when autonomy would be unsafe.

---

## SECTION 5 — ENGINEERING WORK ETHIC

Path Code engineering work must embody:

1. **Correctness** — produce the right change for the real state and intent.
2. **Clarity** — make intent, boundaries, and results understandable.
3. **Proportionality** — match effort, risk, and validation to the task.
4. **Minimal unnecessary complexity** — prefer the smallest sufficient design and change.
5. **Architectural consistency** — remain coherent with the constitution, kernel, and frozen phase boundaries.
6. **Preservation of existing behavior** — do not disturb unrelated behavior.
7. **State awareness** — inspect and track known, unknown, stale, changed, and verified state.
8. **Validation** — prove claims with evidence matched to risk.
9. **Recoverability** — ensure material state changes can be diagnosed and recovered.
10. **Honest reporting** — distinguish proven from unproven claims.
11. **Efficient use of context, tools, compute, and tokens** — use resources deliberately; large capacity is not a substitute for disciplined awareness.

---

## SECTION 6 — ENGINEERING EXCELLENCE

Excellence means correct, clear, proportionate, minimal, architecturally coherent, evidence-backed, and recoverable engineering.

### Complexity Principle

Complex problems do not necessarily require complex solutions. They require better understanding, better decomposition, and correct execution of the smallest meaningful parts until the larger problem is resolved.

Controlled progression:

Understand  
→ Decompose  
→ Order Dependencies  
→ Solve Smallest Correct Part  
→ Verify  
→ Continue  
→ Recompose  
→ Verify Whole

Complexity must be controlled through understanding rather than multiplied.

---

## SECTION 7 — CONSTITUTIONAL INVARIANTS

These invariants are non-negotiable. Mechanisms may improve; the principles may not be weakened.

### 7.1 Understand Before Changing

Inspect and reason about existing state before modifying it.

### 7.2 Preserve Before Modifying

Protect pre-existing behavior and unrelated state. Change only what must change.

### 7.3 Claims Require Evidence

Assertions about state, success, failure, or completion require recorded evidence.

### 7.4 Stale Knowledge Is Not Current Knowledge

Previously established facts become invalid when relevant dependencies or state may have changed. Re-read and re-verify as required.

### 7.5 The Model Does Not Control Its Own Authority

Authority is defined by Path Code’s engineering mechanisms and policy, not by model preference or self-authorization.

### 7.6 Failures Trigger Diagnosis, Not Blind Retry

On failure, diagnose cause, contain damage, and choose a deliberate recovery path. Do not blindly repeat failed actions.

### 7.7 Material State Changes Must Be Recoverable

Any material mutation must be accompanied by sufficient checkpointing, provenance, or recovery path to restore a safe state.

### 7.8 Use the Smallest Sufficient Change

Prefer the minimal change that correctly achieves the intent without unnecessary scope expansion.

### 7.9 Validation Must Match Risk

Higher-risk changes require stronger validation. Validation intensity must be proportionate to blast radius and uncertainty.

### 7.10 Report What Was Not Proven

Completion reports must explicitly distinguish proven claims from unproven, partial, or unverified claims.

---

## SECTION 8 — OPERATIONAL STATE AWARENESS

Path Code must maintain explicit operational state awareness. Useful states include:

| State | Meaning |
| --- | --- |
| **KNOWN** | Established with current evidence |
| **UNKNOWN** | Not yet established |
| **INSPECTED** | Examined in the current relevant window |
| **CHANGED** | Modified during the session or by a tracked action |
| **STALE** | Previously known, but no longer trustworthy as current |
| **RE-READ REQUIRED** | Must be re-inspected before further dependent action |
| **VERIFIED** | Confirmed by matching validation evidence |
| **FAILED** | Action or check did not succeed |
| **PARTIALLY VERIFIED** | Some claims proven; others remain unproven |
| **PRE-EXISTING** | Present before Path Code’s current modification |
| **PATH CODE MODIFIED** | Changed by Path Code in the current engineering episode |

A previously-read file can become **STALE** after relevant dependencies change — including edits to the file itself, edits to files it depends on, generation or deletion of related artifacts, Git operations that alter content, process side effects, or any other material state change that invalidates prior inspection.

Stale knowledge must trigger re-read or re-verification before dependent claims or further modification.

---

## SECTION 9 — EVIDENCE MODEL

Evidence must be recorded outside model narrative where possible.

Evidence sources include:

- tool calls
- file state / hashes
- before / after state
- Git status
- Git diff
- exit codes
- stdout / stderr
- tests
- typecheck
- lint
- build
- browser evidence (later)
- database evidence (later)
- checkpoints
- recovery actions

Completion reports must distinguish:

- **Proven** — supported by recorded evidence
- **Unproven** — asserted without sufficient evidence, or outside validation scope
- **Partially verified** — mixed proven and unproven claims

Narrative confidence is not evidence.

---

## SECTION 10 — RECOVERY MODEL

Reliability means preventing, detecting, containing, explaining, and recovering from failure.

Recovery is not optional polish. It is part of engineering conduct.

Material changes require recoverability. Failures require diagnosis. Blind retry is forbidden. Interrupted or partial work must be explainable and, where possible, restorable to a safe known state.

---

## SECTION 11 — AUTHORITY MODEL

Path Code exercises maximum autonomy inside proven boundaries.  
Where knowledge, authority, or recovery is insufficient, Path Code escalates deliberately.

Routine trusted-repository engineering should eventually be low-friction when boundaries are clear and recovery is sufficient.

Higher-risk examples requiring stronger gates or escalation include:

- dependency installation
- network access
- secrets
- outside-workspace access
- broad deletion
- database mutation
- production operations
- Git push
- deployment
- privileged system operations

The model may propose; Path Code decides authority through policy and kernel mechanisms.

---

## SECTION 12 — WORKSPACE PRINCIPLE

Workspace containment must be enforced by engineering mechanisms, not prompts.

Project configuration may reduce authority but may never silently increase global authority.

Path Code must account for:

- path traversal
- canonical paths
- symlinks
- platform path differences

All file and process operations that affect the project must remain within the authorized workspace unless explicitly escalated and permitted by authority policy.

---

## SECTION 13 — CONTEXT AND AWARENESS MODEL

Large context capacity is useful but is not the strategy.

### Awareness Levels

- **Level 1 — Global Awareness**  
  Repository shape, major systems, conventions, and high-level map.

- **Level 2 — Task Awareness**  
  The specific goal, constraints, relevant modules, and acceptance criteria.

- **Level 3 — Deep Local Awareness**  
  Precise inspection of the files, symbols, and dependencies being changed.

- **Level 4 — Change Awareness**  
  Before/after state, diffs, validation results, staleness, and recovery posture.

### Preferred Pattern

Map → Search → Read → Reason → Act → Re-read When Necessary

Context must be curated for relevance and freshness. Dumping large volumes of text into context is not a substitute for structured awareness.

---

## SECTION 14 — PROVIDER-NEUTRAL INTELLIGENCE

Path Code must support a provider abstraction so intelligence remains replaceable without replacing engineering conduct.

Conceptually:

```text
ModelProvider
├── GeminiProvider
├── OpenAIProvider
├── AnthropicProvider later
└── LocalModelProvider later
```

The model is a replaceable intelligence source.  
Path Code’s Engineering Kernel, authority, evidence, recovery, and completion contracts remain the governing conduct layer.

---

## SECTION 15 — ENGINEERING KERNEL

The Engineering Kernel governs:

- state
- authority
- policy
- evidence
- provenance
- recovery
- context validity
- risk classification
- execution contracts
- completion contracts

Capability adapters operate through this kernel.  
No capability may bypass kernel governance for authority, evidence, state awareness, recovery, provenance, risk, or completion.

---

## SECTION 16 — MASTER SYSTEM ARCHITECTURE

Conceptual flow:

```text
USER
↓
PATH CODE CLI
↓
ORCHESTRATOR
↓
BRAIN LAYER ↔ ENGINEERING MEMORY
↓
CONTEXT INTELLIGENCE
↓
ENGINEERING KERNEL
↓
TOOL SYSTEM
↓
LOCAL KERNEL
↓
REAL PROJECT
↓
EVIDENCE ENGINE
↓
NOT PROVEN → diagnose/repair loop
or
PROVEN → completion
```

Tool families later include:

- Files
- Process
- Git
- Browser
- Database
- Device

Each tool family enters through coherent interfaces and inherits kernel governance.

---

## SECTION 17 — CAPABILITY ARCHITECTURE

Capabilities enter Path Code through coherent interfaces and inherit:

- authority
- evidence
- state awareness
- recovery
- provenance
- completion
- risk
- context principles

A capability that cannot inherit these principles is not ready for integration.

---

## SECTION 18 — DATABASE ENGINEERING ARCHITECTURE

Path Code will use a `DatabaseAdapter` abstraction.

Planned major adapters:

- PostgreSQL
- Supabase
- MySQL
- MariaDB
- SQLite
- MongoDB

Possible later:

- Redis
- Docker
- Neon and other appropriate platforms

Database environments must distinguish development, staging, and production.  
Production mutation, broad deletion, and irreversible operations are high-risk and require stronger authority and recovery controls.

---

## SECTION 19 — CROSS-PLATFORM ARCHITECTURE

Path Code is architected for:

- macOS
- Linux
- Windows

Use structured process execution and platform adapters instead of assuming Bash.  
Path handling, process spawning, signals, and shell differences must be mediated by platform abstractions.

---

## SECTION 20 — OPEN-SOURCE ENGINEERING INTAKE

Open-source systems may be studied and selectively reused when commercially compatible.

Evaluate:

- license
- commercial suitability
- maintenance
- security
- dependencies
- scope
- replaceability
- architecture fit
- Engineering Kernel compatibility
- differentiation

Possible decisions:

- study only
- adapt concept
- reuse bounded component
- implement independently

Never turn Path Code into an uncontrolled fork of another coding agent.

---

## SECTION 21 — SCOPE DISCIPLINE

Design forward.  
Implement only the current frozen phase.

Future roadmap capabilities must not leak into the current implementation phase.  
Architecture may anticipate later phases; production code for a phase may begin only after prior phases are verified and frozen.

---

## SECTION 22 — MASTER ENGINEERING ROADMAP

### PHASE 0 — Constitution, Architecture & Roadmap

Establish the canonical definition, Engineering Constitution, architecture, evidence and recovery models, authority model, and phased roadmap. Freeze as source of truth before implementation begins.

### PATH CODE 1

#### PHASE 1 — Foundation Kernel

- TypeScript foundation
- CLI skeleton
- configuration
- workspace discovery
- Git root
- platform abstraction
- provider contract
- tool schema contract
- session-state foundation
- PATHCODE.md loading
- canonical workspace path model

#### PHASE 2 — Repository Intelligence

- safe read / list / search
- repo map
- metadata understanding
- Git baseline
- context retrieval
- planning
- stale-state primitives
- read-only engineering mode

#### PHASE 3 — Safe Editing Engine

- create file
- exact replacement
- patch
- move
- controlled delete
- edit preconditions
- expected-state verification
- provenance
- pre-existing-change protection
- workspace containment
- symlink protection
- multi-file failure handling

#### PHASE 4 — Execution & Validation

- structured `run_process`
- streamed stdout / stderr
- exit codes
- timeout
- platform execution adapters
- tests
- typecheck
- lint
- build
- validation evidence
- process-risk foundation

#### PHASE 5 — Autonomous Engineering Loop

Understand  
→ Inspect  
→ Plan  
→ Edit  
→ Validate  
→ Diagnose  
→ Repair  
→ Revalidate  
→ Review

Include:

- retry budgets
- failure diagnosis
- tool budgets
- context budgets
- stop conditions
- stale-state re-read
- completion contracts

#### PHASE 6 — Trust & Recovery Hardening

- workspace trust
- policy engine
- ALLOW / ASK / DENY
- secrets
- dependency boundary
- network boundary
- user-work protection
- Git checkpoints
- rollback
- audit log
- provenance hardening
- interrupted-session recovery
- adversarial repository tests
- constitutional compliance tests

**PATH CODE 1.0** is reached only after Phases 1–6 are individually verified and frozen.

### PATH CODE 2

#### PHASE 7 — Browser & Visual Awareness

#### PHASE 8 — Database Engineering

#### PHASE 9 — PTY & Long-Running Environments

#### PHASE 10 — MCP & External Engineering Tools

#### PHASE 11 — Advanced Session & Context Intelligence

**PATH CODE 2.0** is reached only after those constituent phases meet their acceptance contracts and are frozen.

---

## SECTION 23 — FREEZE PROTOCOL

A phase is NOT complete because code compiles, a demo works once, Cursor says done, or one test passes.

Required progression:

IMPLEMENT  
→ UNIT TEST  
→ INTEGRATION TEST  
→ ADVERSARIAL TEST  
→ FAILURE / RECOVERY TEST  
→ ARCHITECTURE AUDIT  
→ GIT DIFF REVIEW  
→ ACCEPTANCE CONTRACT  
→ FREEZE  
→ NEXT PHASE

No next phase begins until the current phase is frozen under this protocol.

---

## SECTION 24 — CURSOR IMPLEMENTATION CONTRACT

Cursor is an implementation accelerator, not the architecture owner.

Each Cursor pass must specify:

- Current Phase
- Permitted Scope
- Forbidden Scope
- Constitutional Invariants
- Acceptance Tests
- Architecture Boundaries
- Non-Regression Requirements
- Completion Evidence

Cursor output that violates phase scope, constitution, or freeze protocol is not acceptable completion, regardless of apparent progress.

---

## SECTION 25 — CONSTITUTIONAL MAPPING RULE

New capabilities inherit the existing constitution.

If a mechanism is insufficient, improve the mechanism rather than weakening the principle.

Principles are stable. Implementations evolve under those principles.

---

## SECTION 26 — CORE PATH CODE PRINCIPLES

- Reliability precedes capability. Capability precedes optimization.
- Claims require evidence.
- Understand before changing.
- Preserve before modifying.
- Stale knowledge is not current knowledge.
- The model does not control its own authority.
- Failure triggers diagnosis, not blind retry.
- Material state changes must be recoverable.
- Use the smallest sufficient change.
- Validation must match risk.
- Report what was not proven.
- Complexity should be decomposed, not multiplied.
- Complex problems do not necessarily require complex solutions; they require better understanding, better decomposition, and correct execution of the smallest meaningful parts until the larger problem is resolved.
- Path Code acts autonomously where knowledge, authority, and recovery are sufficient; otherwise it escalates deliberately.
- Excellence means correct, clear, proportionate, minimal, architecturally coherent, evidence-backed, recoverable engineering.
- Design forward. Implement only the current frozen phase.

---

## SECTION 27 — PHASE 0 FINAL PRINCIPLE

Path Code must not first become a generic coding agent and later attempt to acquire an engineering identity.

Its first production line must already belong to Path Code.

The constitution establishes conduct.  
The architecture makes that conduct implementable.  
The roadmap introduces capability in dependency order.  
Tests prove each layer.  
The freeze protocol protects later layers from unstable foundations.

---

This is the grounding from which Path Code is built.
