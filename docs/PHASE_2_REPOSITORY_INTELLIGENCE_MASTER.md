# PATH CODE — PHASE 2 REPOSITORY INTELLIGENCE MASTER CONTRACT

## Status

**PHASE 2 MASTER CONTRACT — FROZEN**

Implementation status:

**NOT STARTED**

Foundation baseline:

`ca35f9dbfbc29cc839ddc7586acbf86fc1af7703`

---

## 1. Canonical Definition

Repository Intelligence is Path Code's bounded, read-only, evidence-bearing,
freshness-aware understanding of the authorized repository state.

It establishes:

- what exists
- what was discovered
- what earned admission
- what was actually read
- what evidence supports a claim
- what is inferred rather than observed
- what remains unknown
- what is restricted
- what is incomplete
- what has become stale

without modifying the project.

---

## 2. Guiding Principle

**PHASE 1:** Authority must be earned.

**PHASE 2:** Knowledge must be earned through observation.

Path Code may never promote a convenient assumption into repository knowledge
merely because it appears plausible.

---

## 3. Knowledge Separation

Lock this distinction:

**DISCOVERED ≠ ADMITTED ≠ READ ≠ UNDERSTOOD**

### DISCOVERED

Path Code observed a lexical filesystem entry. Discovery proves only that
something was encountered.

### ADMITTED

The entry independently passed WorkspaceBoundary physical canonicalization
and containment. Admission proves authority to treat the physical target as
belonging to the workspace.

### READ

Path Code successfully observed bounded file content through the repository
reader. Read requires read evidence.

### UNDERSTOOD

A claim about repository meaning is supported by sufficient observations and
explicit claim provenance. A state must never silently imply a stronger state.

---

## 4. InventoryObservation vs RepositoryEntry

Lock two distinct concepts.

### InventoryObservation

Represents something encountered during traversal. It may represent:

- admitted target
- outside-workspace target
- denied target
- unreadable target
- cycle
- system-pruned subtree
- bounded/incomplete traversal

It does **NOT** necessarily contain CanonicalPath.

### RepositoryEntry

Represents only an **ADMITTED** repository object. It must contain an
already-earned CanonicalPath. An outside-workspace symlink can therefore be an
InventoryObservation but can **NEVER** be a RepositoryEntry. Discovery does not
create authority.

---

## 5. Admission Never Inherits

This is the central Phase 2 traversal security rule.

Admission of a parent directory **NEVER** grants admission to its children.

**EVERY** child filesystem entry, including:

- regular file
- directory
- symlink
- nested directory

must independently pass the required workspace admission process before:

- becoming RepositoryEntry
- being read
- being descended into

Never use: "parent was admitted, therefore child is trusted."

---

## 6. Traversal Uses Physical Authority

Traversal must follow admitted physical structure.

If `workspace/src/vendor` is lexically inside the workspace but is a symlink to
`/outside/location` then:

- lexical entry may be observed
- physical target is rejected
- no RepositoryEntry for the outside target
- traversal **MUST NOT** descend

After successful canonicalization, descent should use the admitted physical
CanonicalPath rather than continuing through an untrusted lexical alias.

---

## 7. Deny-Path Visibility Decision — LOCKED

Phase 2 **DOES** enforce: `deny-path` as a repository **CONTENT VISIBILITY**
restriction.

Phase 2 **DOES NOT** apply: `disable-action` or any general authority/action
policy.

Phase 6 remains the general authority/policy layer.

The distinction is:

- `deny-path` = visibility / content-observation restriction
- `disable-action` = action authority restriction

Reading restricted content is itself the confidentiality harm. Therefore
`deny-path` must be enforced before content observation.

---

## 8. Denied Subtree Behavior

A denied subtree:

- is represented at its denial boundary
- is marked `DENIED_BY_PROJECT_RESTRICTION`
- is **NOT** descended
- is **NOT** content-read
- is **NOT** hashed
- does **NOT** expose child filenames
- is **NOT** included in content search
- is **NOT** included in future repository context

Denial **MUST NEVER** produce silent absence. Path Code must distinguish
**UNKNOWN** from **NOT OBSERVED BECAUSE DENIED**.

---

## 9. Denial Must Resist Aliasing

`deny-path` must not be bypassable through symlinks or alternate lexical routes.

Example: `deny-path = secrets/` and `public-link -> secrets/` must **NOT**
allow content beneath `public-link` to be observed.

Phase 2A must enforce denial through:

**A.** lexical workspace-relative denial matching

**AND**, where the denied target exists and can be resolved:

**B.** physical canonical denial-root matching

If a configured denied target does not currently exist:

- retain its lexical denial rule
- do not silently discard it
- record that its physical denial root could not be resolved

No fail-open alias bypass.

---

## 10. Configuration Failure & Provenance — Fail Closed

ProjectConfig is a **DATA REPRESENTATION**. Phase 2 introduces a distinct
concept: **ResolvedProjectConfig**.

**ResolvedProjectConfig** = successfully resolved configuration data carrying
trusted resolution provenance.

Repository Intelligence must consume **ResolvedProjectConfig**, **NOT**
ProjectConfig.

ResolvedProjectConfig must be opaque/branded or otherwise structurally
unforgeable through the normal public API. It must be **EARNED** through
successful resolution.

Conceptual successful paths:

- PATHCODE.md absent → loadProjectConfig succeeds → ResolvedProjectConfig
  (source: ABSENT)
- PATHCODE.md present → loadProjectConfig succeeds → ResolvedProjectConfig
  (source: REPOSITORY_FILE)

Failure path:

- loadProjectConfig → ConfigFailure → **NO** ResolvedProjectConfig

The `source.kind` discriminant alone is necessary but **NOT** sufficient to
prove provenance. It must be paired with opaque successful-resolution
provenance.

`defaultProjectConfig` **MUST NOT** manufacture ResolvedProjectConfig. This code
pattern must become impossible:

```typescript
const config = result.ok ? result.value : defaultProjectConfig();
inventory(workspace, config);
```

If `loadProjectConfig` failed, inventory **MUST NOT** be startable. A failed
configuration load must never silently become unrestricted repository
intelligence.

---

## 11. Future User Override Question

Phase 2 has **NO** user-override channel. Therefore `deny-path` is absolute for
Phase 2 visibility.

A future explicit human override may be introduced only through a deliberate
higher-authority design in a later phase. Such override behavior must be
explicit, auditable, follow authority precedence, and never emerge
accidentally.

---

## 12. Traversal Disposition

Repository inventory must be able to represent why traversal did or did not
continue. Conceptual dispositions must include at least:

- `DESCENDED`
- `DENIED_BY_PROJECT_RESTRICTION`
- `OUTSIDE_WORKSPACE`
- `SYSTEM_PRUNED`
- `CYCLE_DETECTED`
- `UNREADABLE`
- `DEPTH_LIMIT_REACHED`
- `ENTRY_LIMIT_REACHED`

Do not collapse `UNREADABLE` into `DENIED` / `PRUNED` / `OUTSIDE` / `ABSENT`. A
permissions failure is an engineering fact of its own.

---

## 13. System Pruning Is Not Security

System pruning is a **PERFORMANCE / BUDGET** mechanism. It is **NOT** a security
mechanism. Security comes from WorkspaceBoundary admission and deny-path
visibility.

Any system-pruned subtree must always be represented explicitly with
`SYSTEM_PRUNED` and a declared reason. No subtree may silently disappear. At
minimum, `.git` must never be recursively inventoried as repository source
content.

---

## 14. Traversal Bounds

Inventory traversal must be bounded (maximum traversal depth, maximum inventory
entries, cycle detection). Bounds must never create silent truncation.

RepositoryInventory must explicitly distinguish **COMPLETE** from **PARTIAL**. A
PARTIAL inventory must carry explicit limitations/reasons. A caller must not be
able to mistake PARTIAL for COMPLETE.

---

## 15. Termination

Traversal must terminate even with symlink cycles, aliases to visited
directories, pathological nesting, extremely large trees, and unreadable
subtrees. Physical canonical directory identity must participate in cycle/visited
tracking.

---

## 16. Reader Authority Rule

The general repository-content reader must **NEVER** accept a raw path string.

Preferred authority input: **RepositoryEntry**

**NOT** string, **NOT** CanonicalPath alone.

The intended chain is:

```
raw filesystem name
  → WorkspaceBoundary
  → RepositoryEntry
  → Repository Reader
  → ContentObservation
```

RepositoryEntry provides authority proof via CanonicalPath **AND** repository-state
proof via prior inventory.

---

## 17. Just-In-Time Read Revalidation

Before content observation, the reader must revalidate authoritative state.

Conceptual flow:

```
RepositoryEntry
  → visibility still permits access?
  → physical path still admitted?
  → regular file?
  → open file handle
  → fstat / authoritative open-handle metadata
  → bounded read
  → content classification
  → hash fully-observed bytes
  → ContentObservation
```

Do not use an old RepositoryEntry as permanent evidence that the filesystem has
not changed.

---

## 18. Content States

Repository intelligence must distinguish content states:

- `NOT_READ`
- `READ`
- `BINARY`
- `TOO_LARGE`
- `UNREADABLE`
- `DENIED`
- `STALE`

A file that was discovered is not automatically considered read. A file rejected
as too large has no full-content knowledge.

---

## 19. Fingerprint Honesty

SHA-256 fingerprint means: hash of the **FULL** bytes that Path Code actually
observed.

If content is not fully read (too large, denied, unreadable, unsupported) there
is **NO** full-content SHA-256 claim. Do **NOT** hash a prefix and represent it
as the full file hash.

---

## 20. Mtime / Size Are Not Freshness Proof

size + mtime may be used as cheap change indicators to trigger `REVALIDATE`,
`REHASH`, or `REREAD`. They may **NOT** establish `VERIFIED_CURRENT` by
themselves. Metadata equality cannot prove content equality.

---

## 21. Git Enriches — Git Does Not Grant Admission

Phase 2C extends the **EXISTING** private Git capability created in Phase 1D.
Do **NOT** create a second process execution architecture.

The existing private structured execFile-based Git runner may have its **FIXED
READ-ONLY** command vocabulary deliberately widened (e.g., `rev-parse`, `status
--porcelain=v2 -z`, `ls-files`).

Git may annotate repository state. Git must **NEVER** manufacture CanonicalPath,
RepositoryEntry, or workspace authority from raw Git output.

---

## 22. Git Ignore Decision — LOCKED

Do **NOT** implement `.gitignore` parsing in Path Code. Filesystem inventory is
the primitive. Git ignore status is enrichment/annotation in Phase 2C. Git
ignore is **NOT** the Phase 2A traversal authority mechanism.

---

## 23. Git State Baseline Purpose

Phase 2C must establish pre-edit repository state before Phase 3 exists. The
baseline is read-only (tracked, untracked, modified, staged, unstaged, ignored,
HEAD).

The critical purpose is: **PRE_EXISTING** user changes must be distinguishable
from future Path Code changes. No Git mutation is introduced.

---

## 24. Project Identity Claims

Repository names alone do not prove project identity (`pages/` does **NOT**
prove Next.js). Project/framework/build/test identity claims require observed
content evidence from appropriate manifests/configuration.

Use explicit epistemic classification such as: **OBSERVED**, **INFERRED**,
**UNKNOWN**.

---

## 25. Repository Map

RepositoryMap is an evidence-backed structural representation. The map must
distinguish observation from inference. No deep AST parsing is required by
Phase 2.

---

## 26. Search Does Not Read

Phase 2E search/retrieval is deterministic candidate selection. It returns
`RepositoryCandidate[]`.

Search must **NOT** trigger new file reads. Candidate selection ≠ content
observation. A selected candidate remains unread unless an explicit reader call
occurs.

---

## 27. Denied Candidates

Denied content must not be returned as an apparently readable candidate.
Search/retrieval must preserve denial visibility. It must never silently
disappear or be auto-read.

---

## 28. Snapshot Is In-Memory Only

RepositorySnapshot is Phase 2's observed repository state representation. In
Phase 2 it is **IN MEMORY ONLY**. Production Phase 2 code must **NOT** create
`.path-code/snapshot.json` or cache files.

---

## 29. Repository Snapshot

A RepositorySnapshot may conceptually contain:

- inventory
- repository entries
- Git state
- configuration/restriction state
- project metadata claims
- observed content
- fingerprints
- knowledge state
- evidence
- snapshot generation/time
- completeness/limitations

Keep it proportionate.

---

## 30. Freshness / Staleness

Phase 2F makes stale-state vocabulary operational. A previous observation may
become stale. Relevant changes must transition dependent knowledge toward
`STALE`, `RE_READ_REQUIRED`, or `UNKNOWN`. Freshness claims must be
evidence-backed.

---

## 31. No Model Consumption — LOCKED

Phase 2 **MUST NOT** invoke Gemini, OpenAI, Anthropic, or any ModelProvider
implementation. No repository content is sent to an LLM in Phase 2. Repository
Intelligence must be testable deterministically without a model.

---

## 32. No Project Mutation

Production Phase 2 remains read-only. **NO** file edit, create, delete, dependency
installation, Git mutation, arbitrary process execution, or database mutation.

---

## 33. Six Dimensions of Repository Intelligence

Lock these dimensions:

| Dimension | Scope |
|---|---|
| **A. TOPOLOGY** | What structures exist |
| **B. IDENTITY** | What frameworks are evidence-backed |
| **C. STATE** | Git/repository state |
| **D. CONTENT** | Selected bounded content actually observed |
| **E. FRESHNESS** | Whether previous observations are still current |
| **F. RELEVANCE** | Which admitted entries are candidates for a task |

---

## 34. Dependency Direction

Phase 2 introduces these relationships:

```
Phase 1 foundations
  → repository inventory
  → reader / Git enrichment
  → metadata / repository map
  → candidate retrieval
  → in-memory snapshot
```

- Inventory may depend on domain, WorkspaceBoundary, and ResolvedProjectConfig
  **VALUE TYPES**.
- Inventory must **NOT** invoke the `loadProjectConfig` capability itself.
- Git Phase 2C extends existing `src/git` capability.
- Search must not depend on a model provider.

---

## 35. Config Load Failure Composition

Phase 2 integration must preserve:

| Outcome | Behavior |
|---|---|
| ConfigFailure | repository intelligence does not begin |
| ABSENT ProjectConfig success | inventory begins with no deniedPaths |
| REPOSITORY_FILE ProjectConfig success | inventory begins with its visibility restrictions |

No caller-facing convenience API may silently transform configuration failure
into an unrestricted/default inventory.

---

## 36. Proof Obligations

These obligations are part of the Phase 2 contract. Every applicable obligation
must eventually have falsifiable automated evidence.

| ID | Obligation |
|---|---|
| **RI-001** | **NO RAW READ** — Every successful repository-content read originates from an admitted RepositoryEntry, never a raw string. |
| **RI-002** | **NO INHERITED ADMISSION** — Admission of a parent directory never grants admission to a child. |
| **RI-003** | **NO OUTSIDE DESCENT** — A physical target outside WorkspaceBoundary can never be descended or promoted to RepositoryEntry. |
| **RI-004** | **NO DENIED CONTENT OBSERVATION** — A deny-path restricted object can never produce ContentObservation or content hash. |
| **RI-005** | **NO FALSE COMPLETENESS** — A limited, pruned, denied, unreadable, failed, or incomplete inventory can never silently represent itself as COMPLETE. |
| **RI-006** | **NO FALSE READ KNOWLEDGE** — DISCOVERED or ADMITTED state cannot become READ without read evidence. |
| **RI-007** | **HASH HONESTY** — A full-content SHA-256 exists only for fully observed content. |
| **RI-008** | **METADATA IS NOT FRESHNESS PROOF** — size/mtime equality alone can never establish verified-current content. |
| **RI-009** | **SEARCH DOES NOT READ** — Candidate retrieval cannot create ContentObservation. |
| **RI-010** | **IDENTITY CLAIMS REQUIRE EVIDENCE** — Project identity marked OBSERVED requires read evidence from an appropriate manifest. |
| **RI-011** | **SNAPSHOT IS NON-PERSISTENT** — Phase 2 production code creates no repository snapshot/cache/index on disk. |
| **RI-012** | **NO MODEL BOUNDARY** — Phase 2 production architecture has no execution dependency on a model provider implementation. |
| **RI-013** | **DENIAL VISIBILITY** — A denied subtree is explicitly represented as denied. Restriction can never produce silent absence. |
| **RI-014** | **TERMINATION** — Traversal terminates under cycles, pathological nesting, and entry explosion through explicit bounds. |
| **RI-015** | **CONFIG FAILURE FAILS CLOSED** — Inventory requires successful configuration resolution (ResolvedProjectConfig). Inventory does not internally swallow ConfigFailure, AND callers cannot substitute a synthetic/default ProjectConfig that has the same fail-open effect. |
| **RI-016** | **UNREADABLE IS EXPLICIT** — A filesystem permission/read failure is represented as UNREADABLE and never silently masquerades as denial, pruning, absence, or completeness. |
| **RI-017** | **GIT DOES NOT GRANT ADMISSION** — Git output cannot manufacture RepositoryEntry or CanonicalPath. Git enriches already-authorized repository knowledge. |
| **RI-018** | **SYSTEM PRUNING IS VISIBLE** — Every system-pruned subtree is explicitly represented with SYSTEM_PRUNED and a declared reason. |
| **RI-019** | **CONFIGURATION ORIGIN MUST BE PROVEN** — Repository inventory can begin only from a ResolvedProjectConfig produced by successful configuration resolution. ConfigFailure, raw ProjectConfig, caller-created ABSENT objects, or default fallback can never become valid inventory input through the normal typed API. |

---

## 37. Phase 2 Sub-Roadmap — LOCKED

### PRE-2A — Resolved Configuration Provenance Hardening

**Core:** Introduce ResolvedProjectConfig, make successful resolution produce it,
keep ConfigFailure/defaults from producing it, prevent normal architectural
bypass. No inventory or traversal implemented yet.

**Then:** VERIFY / FREEZE

### PHASE 2A — Inventory + Traversal Safety

**Core:** InventoryObservation, RepositoryEntry, RepositoryInventory, traversal
dispositions, independent admission, denial visibility, symlink-directory
safety, cycles, bounds, explicit system pruning. No content reading.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2B — Bounded Reader + Content Fingerprints

**Core:** RepositoryEntry-only reader, just-in-time revalidation, regular-file
boundary, bounded handle read, text/binary/too-large/unreadable states, SHA-256
honesty, ContentObservation.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2C — Git State Baseline + Ignore / Provenance Annotation

**Core:** Extend existing private Git runner, fixed read-only Git commands,
tracked/untracked/modified/staged/ignored annotation, PRE_EXISTING change
provenance. No Git mutation, no home-grown gitignore parser.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2D — Project Metadata + Evidence-Backed Repository Map

**Core:** Observed manifest content, project identity claims,
OBSERVED/INFERRED/UNKNOWN, repository structural map. No deep AST requirement.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2E — Search + Candidate Retrieval

**Core:** Deterministic search, RepositoryCandidate, relevance score, candidate
selection does NOT read, no model scoring.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2F — Freshness + In-Memory Snapshot Integrity

**Core:** RepositorySnapshot (in-memory only), stale transitions, dependency of
knowledge on observations. Metadata as trigger, not proof.

**Then:** VERIFY / ADVERSARIAL AUDIT / FREEZE

### PHASE 2G — Repository Intelligence Integration Audit

Read-only independent audit against **THIS** Master Contract verifying all
dimensions and obligations.

---

## 38. Phase 2 Exit Contract

Phase 2 may be declared **COMPLETE** only if:

1. Pre-2A through 2F are individually verified/frozen.
2. 2G independently audits the implementation against this Master Contract.
3. All six intelligence dimensions are satisfied.
4. All applicable RI proof obligations pass (including the strengthened
   cross-boundary RI-015 and RI-019).
5. No Phase 2 blocker remains.
6. Repository Intelligence remains production read-only.
7. No model/provider implementation consumes repository content.
8. No policy/action engine has leaked into Phase 2 (`disable-action` unapplied).
9. Git does not grant filesystem authority.
10. Snapshot remains non-persistent.
11. Configuration loading failure cannot be converted into unrestricted inventory
    through a default/synthetic configuration.
12. No unsafe resolved-config constructor is part of the normal production
    surface.

---

## 39. Known Deliberate Deferrals

Record as future responsibilities, not Phase 2 requirements:

- actual model/provider implementation
- repository content sent to model
- final prompt-injection handling at model boundary
- editing / non-existing safe creation paths
- mutation-time TOCTOU hardening for writes
- generic process execution / package installation
- action policy enforcement / `disable-action`
- Git mutation
- session/snapshot persistence
- database / browser / MCP / PTY

---

## 40. Final Principle

Phase 1 established what Path Code is allowed to trust.

Phase 2 establishes what Path Code is allowed to claim that it knows.

Repository knowledge must be earned through bounded observation, explicit
authority, evidence, provenance, and freshness.

- Discovery does not imply admission.
- Admission does not imply reading.
- Reading does not imply understanding.
- Restriction never becomes silent absence.
- Incomplete knowledge never becomes complete knowledge by omission.

This is the grounding from which Path Code Repository Intelligence is built.
