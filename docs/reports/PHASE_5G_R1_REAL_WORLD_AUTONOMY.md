# PHASE 5G-R1 — REAL-WORLD STABILIZATION + BOUNDED AUTONOMY

**Result: PASS**

```text
PHASE 5G-R1 REAL-WORLD STABILIZATION + BOUNDED AUTONOMY IMPLEMENTED
— EXACT APPROVED SOURCE SET ONLY
— ONE RUN AUTHORITY FOR IN-POLICY ENGINEERING
— RECOVERY REQUIRED BEFORE AUTONOMOUS WRITE
— MODEL NEVER CONTROLS AUTHORITY
— REVIEW MODE PRESERVED
— LIVE REAL-WORLD BOUNDED AUTONOMY NOT YET ESTABLISHED
```

---

## SHA concepts (deliberately distinct)

| Concept | Value | Meaning |
|---|---|---|
| **IMPLEMENTATION SHA** | `2954e3d335e81b43b7b69f5e35a310ed9f5d9cc3` | Commit on which focused + canonical validation ran |
| **BRANCH TIP SHA** | `git rev-parse HEAD` on `cursor/phase5g-r1-live-autonomy` | Tip after any docs-only commits |

Do not call both “Final SHA”.

---

## Part A — accepted base

| Item | Value |
|---|---|
| Accepted main | `82f765a0622a9cd7426f9892f6b5072fb436fba6` |
| Feature branch | `cursor/phase5g-r1-live-autonomy` |
| Main worktree | `/Users/achahbi/Projects/path-code` — **unchanged** at accepted SHA |
| Push / merge | **not performed** |
| Live Nordic Rain General Session | **not run** in this pass |

---

## CATALOG FINDING

### Defect class

**CLASS III — SCOPE LEAK** (source-disclosure finding), with the live symptom expressed as a selection-count rejection.

Not CLASS I (read-context mis-admission of the three approved roots) and not CLASS II (bound too tight for a legitimate 3-file set). Bound `MAX_CATALOG_RECORDS = 128` is retained; it is not widened.

### Exact production path

`admitScopePlan` → operator SCOPE → `earnApprovedScopeContext` → `createReferenceCatalog` (`src/reasoning/catalog.ts`) → mutation session Call #2.

Owner that emitted the live message:

`createReferenceCatalog` → `SELECTION_REJECTED` → `"Catalog selection count is outside the allowed range"` when

`total = entries.length + contentObservations.length + manifestEvidence.length`
is outside **`[1, MAX_CATALOG_RECORDS]`** and **`MAX_CATALOG_RECORDS = 128`**.

Host wrapped that as `CATALOG_FAILED`.

### Live reproduction (read-only diagnostic against disposable clone)

Approved set (operator/policy):

1. `src/lib/utils.ts` (editable)
2. `tsconfig.json` (read context)
3. `package.json` (read context)

Pre-fix `earnApprovedScopeContext` seeded **all** `map.manifestObservations` into catalog selection. On Nordic Rain with `node_modules` admitted by inventory:

| Quantity | Value |
|---|---|
| Approved path count | **3** |
| Successfully observed approved sources (would-be) | **3** |
| Seeded manifest ContentObservations | **128** (metadata hard cap) |
| Catalog `entries` count | **129** |
| Catalog `contentObservations` count | **129** |
| **Selection total passed to owner** | **258** |
| Configured minimum | **1** |
| Configured maximum | **128** |
| Side violated | **maximum** (`258 > 128`) |
| Unapproved paths that would have entered catalog | **126** (sample: `node_modules/*/package.json`, nested dependency `tsconfig.json`) |

What the count represents: **not** “approved path count”. It is the sum of selected **ENTRY** records + **CONTENT** records (+ manifests if any) handed to `createReferenceCatalog`.

Sibling sources under `src/lib/` (`cn.ts`, `db.ts`, …) were **not** the leak vector; ambient **manifest** observations (largely dependency-tree `package.json`) were.

Byte size of the three approved files (1781) was **not** causal.

### Correction

`earnApprovedScopeContext` now:

- indexes manifest ContentObservations **only** to reuse exact object identity for approved paths that map construction already read;
- builds **catalog** `entries` + `contentObservations` from the **exact approved path set only**;
- refuses `CATALOG_SCOPE_LEAK` if any catalog CONTENT path is outside that set;
- surfaces oversize approved selections as product-level `APPROVED_SCOPE_EXCEEDS_REFERENCE_BUDGET` rather than an opaque range failure where practical.

Snapshot may still bind OBSERVED ManifestEvidence ContentObservations for map compatibility; **provider/Gate 1 catalog membership does not**.

Post-fix live-shape diagnostic: catalog + disclosed paths are exactly

`package.json`, `src/lib/utils.ts`, `tsconfig.json`.

### Bound policy

| Bound | Change |
|---|---|
| `MAX_CATALOG_RECORDS = 128` | **unchanged** (global reasoning catalog ceiling) |
| Product refusal | `APPROVED_SCOPE_EXCEEDS_REFERENCE_BUDGET` when the **approved** selection itself exceeds `[1, 128]` |

No arbitrary 100/1000/unlimited limit. No widening around leaked sources.

---

## AUTONOMY

### REVIEW (default; preserved)

`pathcode --autonomy review` (also default when flag omitted).

Gates unchanged:

`START` → `SCOPE` → `APPLY` → `CHECK` (+ `/recover` → `RESTORE`)

Deterministic REVIEW regression remains green.

### BOUNDED

`pathcode --autonomy bounded`

`--autonomy unlimited` is refused.

After local preflight + validation candidate discovery (no provider yet): one **RUN** session-policy challenge. Declining RUN → **zero** provider calls.

Inside the disclosed envelope the trusted host may mint existing Edit/Validation authorities when policy checks pass. The model never mints authority and never supplies executables.

### RUN session-policy semantics

RUN authorizes a **finite session policy**, not an edit and not a shell command. Host evaluates every later proposal against that policy and stops with `AUTONOMY_ESCALATION_REQUIRED` rather than widening.

### Policy defaults (V1; reuse 5G caps)

| Field | Default |
|---|---|
| Max model calls | 3 |
| Max editable targets | `MAX_SCOPE_EDITABLE_TARGETS` (4) |
| Max read-context paths | `MAX_SCOPE_CONTEXT_PATHS` (16) |
| Aggregate approved source bytes | 262 144 (`GENERAL_SESSION_REQUEST_BODY_BYTES`) |
| Allowed mutation kinds | `REPLACE_TEXT`, `CREATE_TEXT` |
| Validation candidates | host-discovered set disclosed at RUN |
| Recovery | **REQUIRED** |
| Git writes | NONE |
| Dependency installation | FORBIDDEN |
| Sensitive paths | EXCLUDED |
| Automatic provider retries | NONE |

### Host authority composition

| Stage | REVIEW | BOUNDED (in-policy) |
|---|---|---|
| Session policy | START | RUN |
| Scope disclosure | SCOPE challenge | host admits after `evaluateScopeAgainstPolicy` |
| Edit | APPLY after EditReview | EditReview retained; host mints after `evaluateEditAgainstPolicy` |
| Validation | CHECK | host mints after `evaluateValidationAgainstPolicy` |
| Recovery restore | RESTORE (explicit) | unchanged — no auto-recover |

### Escalation / stop conditions

Out-of-policy scope (before source-body disclosure), out-of-policy edit (before mutation), validation surface drift, Gate 1/2 refusal, checkpoint failure, currentness drift, sensitive paths, budget exhaustion — all stop closed. No hidden retry. No automatic widening.

### Progress UX

Engineering-state lines only (e.g. planning scope, scope admitted counts, reading approved files, Gate 1 grounded, recovery READY, applying N files, running admitted validation). No private chain-of-thought. No fabricated steps.

### Recovery / validation

Recovery Floor remains absolute before autonomous write. Validation failure after an allowed edit reports `EDIT APPLIED · VALIDATION NOT ESTABLISHED` with checkpoint id and `/recover` — **no auto-recovery and no autonomous correction loop** in this pass.

Execution-risk policy is disclosed once at RUN: admitted validation may run repository-owned code with ordinary OS permissions; recovery covers PATH Code mutations only.

---

## PROOF

| ID | Result |
|---|---|
| H1-A…G / R1-A…C | PASS — live 3-path catalog; no unapproved siblings/descendants; oversize approved set → `APPROVED_SCOPE_EXCEEDS_REFERENCE_BUDGET`; context read-only; sensitive policy intact; ENTRY+CONTENT grounding retained |
| R1-D | PASS — REVIEW still requires START/SCOPE/APPLY/CHECK |
| R1-E | PASS — BOUNDED success asks only `run-consent` |
| R1-F | PASS — decline RUN → zero provider calls |
| R1-G | PASS — model cannot mint Scope/Edit/Validation authority |
| R1-H…T | PASS — escalation, recovery REQUIRED, currentness, validation restriction, env scrub, no auto-recover, RESTORE still required, no Git mutation, finite budget, real progress, scoped success copy |

Focused: general-session suite (catalog, bounded-autonomy, architecture, session-flow, cli, scope, validation-candidates, preflight, recover) — **123 passed**.

Smokes:

- `npm run bounded-session:smoke` — **PASSED** (one RUN; no SCOPE/APPLY/CHECK; nested `src/lib`; siblings present; store outside repo; no network/credentials)
- `npm run general-session:smoke` — **PASSED** (REVIEW regression)

Canonical: **ONE** `npm run check` — **PASS**

- Test Files 117 passed; Tests **1103** passed
- `ledger:verify PASS` (pre-commit tip still at accepted base until implementation commit)

---

## STATE

| Item | Value |
|---|---|
| Branch | `cursor/phase5g-r1-live-autonomy` |
| Main | **unchanged** `82f765a0622a9cd7426f9892f6b5072fb436fba6` |
| Live providers | **zero** |
| Credentials | **zero** |
| Push | **none** |
| Live Nordic Rain session | **not established in this pass** |

---

## Modules touched

- `scripts/pathcode-cli/general-session.mjs` — catalog exact-set + REVIEW/BOUNDED dual mode
- `scripts/pathcode-cli/autonomy-policy.mjs` — RUN policy / escalation
- `scripts/pathcode-cli/terminal.mjs` — `acceptsRunConfirmation`
- `scripts/pathcode-cli/owners.mjs` — `MAX_CATALOG_RECORDS`, `MAX_SCOPE_CONTEXT_PATHS`
- `scripts/pathcode.mjs` / `banner.mjs` — `--autonomy`
- `scripts/bounded-session-smoke.mjs`
- `tests/general-session/catalog.test.ts`, `bounded-autonomy.test.ts`, helpers/architecture updates
