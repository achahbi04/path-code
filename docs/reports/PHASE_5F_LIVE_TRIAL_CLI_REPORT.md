# PHASE 5F — LIVE ENGINEERING TRIAL + TERMINAL LAUNCHER REPORT

**Success line:**  
`PHASE 5F TERMINAL TRIAL HOST IMPLEMENTED — PATH ● Code — REAL OWNER COMPOSITION — HUMAN-APPROVED EDIT + VALIDATION — CANONICAL OFFLINE — LIVE ENGINEERING TRIAL OPERATOR-ONLY`

**LIVE_ENGINEERING_TRIAL: NOT_RUN_BY_IMPLEMENTER**

---

## 1. Exact state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Branch | `cursor/phase5f-live-trial-cli` |
| Starting HEAD (accepted 5E1) | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Canonical-tested 5E1 implementation | `3c3b8cf10f20c769303e5d83e25a54e9dcc737f1` |
| Main on entry | `ecf480faff53560133309df36837534a38b7f4cb` |
| Main after authorized FF integration | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` (stays here; 5F not merged) |
| Implementation commit | `5d14b7b23745ea3998e110784e72cd8356e8901e` |
| Typecheck correction commit | `3060d7451bdec0c8475bfe36ab1dd83cb5b7a12e` |
| Tested / final HEAD | `3060d7451bdec0c8475bfe36ab1dd83cb5b7a12e` |
| Platform tested | macOS (`darwin`), Node `v26.5.0` |

5E1 integration: `git merge --ff-only 525d74c…` on main worktree `/Users/achahbi/Projects/path-code`. Feature branch created with `--no-track` from that SHA. Prior phase refs preserved. Working tree clean after report commit.

### Changed paths (5F branch vs 525d74c)

- `package.json` — bin → `./scripts/pathcode.mjs`
- `scripts/pathcode.mjs` — shebang entry
- `scripts/install-pathcode-local.mjs` — operator-only local symlink helper
- `scripts/pathcode-cli/{banner,escape,terminal,fixture-store,child-env,owners,paths,trial,report}.mjs`
- `tests/terminal-trial/*` — T01–T30 / P1–P3
- `tests/cli/package.test.ts` — bin path + legacy shebang preservation
- `docs/passes/PHASE_5F_LIVE_TRIAL_CLI_CONTRACT.md`
- `docs/passes/PHASE_5F_TERMINAL_HOST_AMENDMENT_1.md`
- `docs/PATHCODE_TRIAL_QUICKSTART.md`
- `docs/reports/PHASE_5F_LIVE_TRIAL_CLI_REPORT.md` (this file)

No Brain / OpenAI transport / mutation / editing / Validation / conductor / gate semantic changes. No dependency version changes. Root `exports` unchanged.

---

## 2. Entry / bin / install

- **Bin:** `"pathcode": "./scripts/pathcode.mjs"`
- **Legacy:** `dist/cli/entry.js` retained; `cli:smoke` still exercises it; unknown argv delegated via `runCli` from `dist/cli/main.js`
- **Direct fallback:** `node scripts/pathcode.mjs`
- **Install:** `node scripts/install-pathcode-local.mjs --install` creates only `~/.local/bin/pathcode` → this checkout’s entry; `--check` read-only; refuses different/dangling/non-symlink collisions; idempotent when already correct; never edits shell rc / sudo / npm registry

---

## 3. Rendered PATH ● Code samples

### Wide (columns=100)

```text
    ████   ███  █████ █   █          ████           █
    █   █ █   █   █   █   █    ▄    █               █
    ████  █████   █   █████   ███   █      ███   ████  ███
    █     █   █   █   █   █    ▀    █     █   █ █   █ █████
    █     █   █   █   █   █          ████  ███   ████  ███
```

Centred three-row larger dot (`▄` / `███` / `▀`) on rows 2–4 between H and C.

### Compact (columns=60 and 40)

```text
PATH ● Code
```

### ASCII / plain / non-TTY

```text
PATH * Code
```

Offline `--help` / `--version` / bare non-TTY welcome: zero provider calls, no trial files, no key read (T03).

---

## 4. Host → owner API map

| Concern | Actual API |
|---|---|
| Adapter | `createOpenAIAdapter(modelCfg, credential, narrowing)` from `dist/adapters/openai` |
| Brain | `createEngineeringBrain(adapter, { maxDispatches:2, maxTimeoutMs:90000, maxOutputTokens:4096 })` |
| Session | `openEngineeringMutationSession({ workspace, snapshot, catalog, brain, permittedTargets:[{kind:REPLACE_TEXT, contentObservation, entry}], disclosedObservations, validationBlueprint })` |
| Propose / apply / validate | `session.propose` → host `authorizePreparedChange`+`explicitEditApproval` → `session.apply` → host `authorizeValidationPlan`+`explicitLocalProcessApproval` → `session.validate` |
| Phase 2 | `createWorkspaceBoundary` → `loadProjectConfig` → `inventory` → `buildRepositoryMap` → `buildRepositorySearchCorpus` → `readRepositoryContent` → `buildRepositorySnapshot` → `createReferenceCatalog` |
| Policy | `inspectTrialActionPolicy` reads `restrictions.disabledActions` for `NETWORK_ACCESS`/`SECRET_ACCESS`/`EDIT`/`EXECUTE_PROCESS`/`TYPECHECK`/`TARGETED_TEST`; ABSENT config ⇒ empty denials (established default) |
| Target | only `src/calculator.ts` REPLACE_TEXT |
| Checks | TYPECHECK: `node <abs tsc.js> -p <trial>/tsconfig.json` (emits `.trial-build`); TARGETED_TEST: `node <trial>/tests/calculator.test.cjs`; `timeoutMs: 15000`; host `buildTrialChildEnvironment()` |
| Claim assignment | `behaves-multiply-01` → `targeted`; `maxBrainAttempts: 1` |
| Strong success | owner label `MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED` |

### Approval boundaries

1. `START <challenge>` — consent only (P1 predicate `acceptsStartConsent`)
2. `APPLY <challenge>` — exact MutationReview (P2 `acceptsApplyConfirmation`) then host mints edit auths
3. `CHECK <challenge>` — exact MutationValidationReview then host mints validation auth

---

## 5. Credential handling

- After START + Phase 2 policy: read `OPENAI_API_KEY` once if present, else hidden TTY raw-mode input (`askHiddenCredential`), bounded to 8192 UTF-8 bytes
- Passed only into `createOpenAIAdapter`; never argv/task/context/result/child env
- Terminal raw/echo restored on success/EOF/Ctrl+C/error; readline paused during secret collection
- Child env / request body / report: no key (T09/T20/T25)

---

## 6. Fixture lifecycle

- `mkdtemp(os.tmpdir(), "pathcode-trial-01-")` + `realpath`; exclusive `wx` creates
- Seed `multiply` returns `a + b` (defective); never writes the correct solution in setup
- Not the Path Code checkout / cwd; retained on all outcomes; no Git; no rollback

---

## 7. Two profiles / Gate 2

Offline integration (recording fetch, synthetic credential):

1. Edit profile → Gate 1 → MutationReview → APPLY → mutation → reobserve → Validation review
2. CHECK → ValidationAuthorization → conductor BIND_AND_VALIDATE → Engineering Run → Gate 2  
   Positive path reaches `MUTATION_APPLIED_AND_CONFIGURED_VALIDATION_ACCEPTED` with real installed `tsc` + regression.

Wrong approved edit remains on disk; validation not accepted; no retry (T22).

---

## 8. T01–T30 proof map

| ID | Evidence |
|---|---|
| T01 | `banner-entry.test.ts` foreign-cwd spawn + legacy `dist/cli/entry.js`; `package.test.ts` bin |
| T02 | `banner-entry.test.ts` widths 40/60/100, ascii/plain, centred dot glyphs |
| T03 | `banner-entry.test.ts` help/version with fetch trap |
| T04 | non-TTY refuse; `--yes` rejected |
| T05 | START decline before credential/fixture; model conflict `resolveModelSelection` |
| T06 | `fixture-install.test.ts` challenge grammar; hidden-key ownership in `terminal.mjs` (unit + code) |
| T07 | `fixture-install.test.ts` unique roots, defective seed, `wx` |
| T08 | `integration.test.ts` real Phase 2 + single REPLACE target |
| T09 | recorded fetch bodies lack key/checkout path; contain calculator |
| T10 | adapter/Brain narrowing 2/4096/131072; `maxBrainAttempts:1`; conflict diagnosis |
| T11 | propose→Gate1 path in positive integration; refuse path on GATE1 |
| T12 | `escape.mjs` tests ESC/OSC/CR/tab/BOM/bidi; prefixes |
| T13 | EDIT_DECLINED leaves seed bytes; no apply |
| T14 | APPLY exact challenge; wrong line declines |
| T15 | host-only `authorizePreparedChange` after APPLY |
| T16 | owner stale/mismatch semantics retained (no host repair loop) |
| T17 | positive path fresh Validation plan + disk bytes match fixed source |
| T18 | check review fields; CHECK decline → no second fetch |
| T19 | `session.validate` → conductor/eng-run/Gate2; no direct child_process from CLI |
| T20 | `childEnv` + prepared `envSnapshot` exclude OPENAI_API_KEY/NODE_OPTIONS |
| T21 | offline real tsc+regression fail on seed / pass on fixed |
| T22 | defective approved edit retained; non-acceptance |
| T23 | stop/`isStopped` checked; session.close/brain.dispose; no process.exit mid-drain in host |
| T24 | prompt-specific challenges; no buffered auto-approve (scripted answers) |
| T25 | `report.mjs` owner labels only; no key/body |
| T26 | installer under disposable home |
| T27 | `resolveRuntimePrerequisites` missing dist; platform refuse |
| T28 | `architecture.test.ts` named modules; no src reverse imports; exports intact |
| T29 | no test auto-approve enablement; recording fetch only in tests |
| T30 | canonical 101/912; legacy smoke; P1–P3 restored |

**Real vs simulated:** filesystem/process/tsc/regression/mutation/conductor = real owners. Prompt answers in integration = private scripted `askLine` (same predicates). No real PTY claimed. No live network.

### P1–P3

| Probe | File | Restored SHA-256 |
|---|---|---|
| P1 START | `scripts/pathcode-cli/terminal.mjs` | `43e7e24c74c7089f4c152a6d4511875bd62aab4aa1c9700a4f77f6b4f97e4f65` |
| P2 APPLY | same | same (restored after each probe) |
| P3 child-env | `scripts/pathcode-cli/child-env.mjs` | `da73e42d117197ba9150513fbc797676507933e56c9f7a713cda91a86cbe900b` |

Weakened → subprocess observes broken predicate → exact bytes restored → focused PASS.

---

## 9. Canonical attempts

### Attempt 1 (failed — typecheck)

- Cause: unused `rm` import; static `.mjs` import without declarations
- Exit: typecheck non-zero (pipeline status via tee not authoritative)

### Attempt 2 (PASS) — HEAD `3060d7451bdec0c8475bfe36ab1dd83cb5b7a12e`

| Stage | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| test | **101 files / 912 tests**, exit 0 |
| cli:smoke | PASS (legacy `dist/cli/entry.js`) |
| ledger:verify | PASS at `3060d7451bdec0c8475bfe36ab1dd83cb5b7a12e` |
| Duration | ~120.04s tests; wall ~135s for full check |
| Historical baseline | 96 / 893 at `3c3b8cf…` |
| Delta | +5 files, +19 tests |

Process/TTY/timer residue: integration cleans tracked trial roots; falsifications restore files; recording fetch uninstalled in `afterEach`.

Report commit is documentation-only after tested bytes at `3060d74…`.

---

## 10. Operator install / launch (after review)

```bash
cd /Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core
node scripts/install-pathcode-local.mjs --install
# if needed for this shell only:
export PATH="$HOME/.local/bin:$PATH"

pathcode
# or: pathcode --model gpt-5.6-terra
```

Credential: `OPENAI_API_KEY` in the environment, or hidden prompt after START.  
Confirmations: exact `START` / `APPLY` / `CHECK` challenges printed on screen.  
Exit without approval: `/exit`, EOF, or decline any challenge.  
See `docs/PATHCODE_TRIAL_QUICKSTART.md`.

---

## 11. Live trial status

**LIVE_ENGINEERING_TRIAL: NOT_RUN_BY_IMPLEMENTER**

No real credentials used. No billable calls. Deterministic tests use recording fetch + synthetic key only.

---

## 12. Limits

First controlled synthetic trial (`multiply-01`) only. Not a sandbox product, not whole-project correctness, no automatic correction, no Git commit, no Gemini, no arbitrary repository workflow, no `--yes` / headless live approval.

---

## Actual budgets enforced

| Bound | Value |
|---|---|
| Brain dispatches | 2 |
| Transport attempts | 2 |
| Output tokens | 4096 / call; 8192 cumulative |
| Request body | 131072 / call; 262144 cumulative |
| Brain deadline | 90000 ms |
| Post-edit reasoning | 1 |
| Check timeouts | 15000 ms each |
