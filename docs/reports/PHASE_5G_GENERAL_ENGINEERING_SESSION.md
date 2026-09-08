# PHASE 5G — GENERAL ENGINEERING SESSION V1

**Result: PASS**

```text
PHASE 5G GENERAL ENGINEERING SESSION V1 IMPLEMENTED
— NATURAL-LANGUAGE TASK ENTRY
— REVIEWED REAL-REPOSITORY SCOPE
— RECOVERY REQUIRED BEFORE WRITE, PREIMAGE BOUND TO FINAL CURRENTNESS
— CONFIGURED VALIDATION UNDER SEPARATE AUTHORITY, EXECUTION SURFACE DISCLOSED
— NO AUTOMATIC GIT MUTATION
— LIVE REAL-REPOSITORY USE NOT YET ESTABLISHED
```

---

## SHA concepts (deliberately distinct)

| Concept | Value | Meaning |
|---|---|---|
| **IMPLEMENTATION SHA** | `133209244a932c750139562ed0a8ba15f0342bf2` | Commit on which focused + canonical validation ran |
| **BRANCH TIP SHA** | `git rev-parse HEAD` on `cursor/phase5g-general-engineering-session` | Tip after any docs-only commits |

Do not call both “Final SHA”.

---

## Part A — Phase 6A freeze

| Item | Value |
|---|---|
| Accepted Phase 6A main SHA | `32cada66411212239f3145656e0d6c5e57f0009d` |
| Phase 5G starting SHA | `32cada66411212239f3145656e0d6c5e57f0009d` |
| Main worktree | `/Users/achahbi/Projects/path-code` @ Phase 6A tip (clean) |
| Feature branch | `cursor/phase5g-general-engineering-session` |
| Push / merge 5G to main | **not performed** |

Docs-only commits above 6A implementation `ded28f9…`: `ede13af`, `1ba9546`, `32cada6`.

---

## Architecture

### Product UX

- Natural-language line at `PATH ● Code >` → General Engineering Session
- `/trial` `/help` `/exit` retained
- `/recover <checkpoint-id>` for current-workspace recovery (no provider)

### Host composition

`scripts/pathcode-cli/general-session.mjs` (+ `preflight.mjs`, `currentness.mjs`, `scope-request.mjs`, `state-dir.mjs`, `validation-candidates.mjs`, `recover.mjs`)

Reuses existing: EngineeringBrain, Gate 1, mutation session, Recovery Floor, Validation, EngineeringRun, Gate 2.

### Scope planning (provider-neutral)

`src/scope/*` + Brain profile `ENGINEERING_SCOPE_PLAN_JSON` / purpose `PROPOSE_SCOPE`.  
OpenAI transports only. Call #1: inventory/metadata — **no source bodies**.

### Authorities (host-only)

START → SCOPE → APPLY → CHECK → RESTORE — each with challenge phrase.  
Model never mints Scope/Edit/Validation/Recovery authorization.

### Recovery Floor

General Session **always** `recoveryProtection: "REQUIRED"` (literal; no NONE path).  
State dir: `PATHCODE_STATE_DIR` or platform defaults; store must be outside the project.

### §18 final currentness → checkpoint → write

1. Re-resolve workspace  
2. Recheck Git root/branch/HEAD  
3. Fresh re-observe approved targets  
4. Compare to EditReview-bound pre-state → else `MUTATION_STALE`  
5. Checkpoint from **these** fresh observations  
6. Persist + READY  
7. Mutation writes (existing apply currentness still applies)

### Scope file currentness (5G-I)

At SCOPE approval: fingerprint approved REPLACE paths.  
Before Call #2: recheck fingerprints → `SCOPE_STALE` if drifted.

### Validation candidates

Trusted host owns commands: local `tsc` when available; admitted npm scripts (`typecheck`, `check`, `test`, `test:*`, `lint`, `build`).  
No install/ci/downloading npx/deploy/migrate/publish.  
Lifecycle + static `npm run <literal>` chain disclosure; dynamic chains → `VALIDATION_CANDIDATE_UNRESOLVED`.  
No usable plan → `VALIDATION_PLAN_NOT_AVAILABLE` before START.  
Child env scrubbed of provider keys.

### CHECK acknowledgement

Prominent ordinary-OS / repository-code warning before CHECK challenge. No CHECK → zero Validation execution.

### Explicit limitations

- Arbitrary repository runtime side effects of disclosed scripts cannot be statically enumerated  
- V1: text REPLACE/CREATE only; no DELETE/RENAME/binary; no Git commit/stash/reset; no self-workspace mutation  
- Live real-repository use **not yet established** by this pass

---

## Proof map (mission 5G-A … 5G-AJ)

| Mission ID | Proof location (semantic) |
|---|---|
| 5G-A | `session-flow`: declining START → zero provider calls |
| 5G-B | `preflight`: not a Git working tree refused |
| 5G-C | `preflight`: self / nested Path Code checkout refused |
| 5G-D | `preflight`: dirty disclosed; no destructive Git verbs |
| 5G-E | `session-flow`: scope call metadata only |
| 5G-F | `scope-contract`: unknown / non-admitted paths refused |
| 5G-G | `preflight` / `session-flow`: sensitive `.env` / keys / forbidden prefixes |
| 5G-H | `session-flow`: declining SCOPE → no source read / no edit |
| 5G-I | `session-flow`: approved file drift after SCOPE → `SCOPE_STALE` |
| 5G-J | `session-flow`: HEAD/branch change after scope / before write refused |
| 5G-K | `session-flow`: edit call grounded in approved paths only |
| 5G-L | `session-flow`: ungrounded Gate 1 refusal |
| 5G-M | `session-flow` / architecture: `recoveryProtection` literal `REQUIRED` |
| 5G-N | `session-flow`: checkpoint persist failure → zero writes |
| 5G-O | `session-flow` / recover: checkpoint preimage = observed pre-edit bytes |
| 5G-P | `session-flow`: declining APPLY → zero mutation |
| 5G-Q | `validation-candidates`: only admitted candidate IDs / trusted argv |
| 5G-R | `validation-candidates`: install/ci/npx/deploy/migrate refused |
| 5G-S | `session-flow` validation review: `OPENAI_API_KEY in env: no` |
| 5G-T | `session-flow`: Call #3 has `POST_EDIT_EXECUTION_CLAIM_REQUIREMENTS` |
| 5G-U | smoke / accepted run: configured checks dispatch in order |
| 5G-V | `session-flow`: Gate 2 accepted on authentic EngineeringRun |
| 5G-W | `session-flow`: failing check → mutation retained; `/recover` offered; no auto-recovery |
| 5G-X | `recover` + smoke: fresh process `/recover` without credential |
| 5G-Y | `recover`: no valid RESTORE → no recovery mutation |
| 5G-Z | `recover`: post-mutation user edit → conflict, no overwrite |
| 5G-AA | START/SCOPE/APPLY/CHECK/RESTORE decline paths |
| 5G-AB | budget disclosed; ≤3 calls; no retry |
| 5G-AC | architecture / preflight: no destructive Git in host |
| 5G-AD | success copy: approved files + configured checks; `Git commit: none` |
| 5G-AE | validation review / candidates: pretest/posttest disclosed |
| 5G-AF | validation-candidates: static `npm run` chain expansion |
| 5G-AG | validation-candidates: dynamic chain → unresolved / not admitted |
| 5G-AH | CHECK decline after IMPORTANT warning → zero Validation |
| 5G-AI | `MUTATION_STALE` on pre-checkpoint drift; zero writes |
| 5G-AJ | checkpoint minted from final fresh pre-write observation |

Note: some historical test titles reuse letter labels from an earlier section map; the table above is the **mission** ID map. Mission-labeled tests for 5G-I / 5G-T / 5G-W were added explicitly.

---

## Validation

### Focused

- `tests/general-session` — **PASS** (102 tests)
- `npm run build && npm run general-session:smoke` — **PASS** (separate-process recover)

### Canonical

1. `npm run check` — **PASS** (exit 0)

Zero live providers. Zero credentials.

---

## Worktree status

| Worktree | Branch | HEAD | Status |
|---|---|---|---|
| Feature | `cursor/phase5g-general-engineering-session` | see BRANCH TIP | clean after commits |
| Main | `main` | `32cada66411212239f3145656e0d6c5e57f0009d` | clean |

Phase 5G **not** merged to main. No push. No live Nordic Rain / OpenAI run.
