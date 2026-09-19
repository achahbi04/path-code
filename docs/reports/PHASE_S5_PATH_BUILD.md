# PATH CODE — S5
# PATH BUILD (Option A′)

**S5 IMPLEMENTED**  
**REAL-LIVE-VERIFIED:** **NOT YET PASSING** (`REAL_LIVE_VERIFICATION_NOT_YET_PASSING` — latest honest e2e)  
**OPERATOR ACCEPTANCE:** **NOT READY**  
**S5 NOT FROZEN**

**S5 implementation checkpoint (authoritative HEAD — includes probe honesty fix + latest e2e evidence):** 357d9328ad2fe0634fd43ad6e0e394d517907a34  
**Prior superseded checkpoint:** `d4e3f7b5304fd78dcd3560a405b035a239c744d5` (archived e2e used probe README materialization — **invalid for operator acceptance**)

**Mode:** mechanical fake fabric for CI/unit tests; real-engine PATH Build via `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (no Build fake fabric, no Gateway fake engine)

**Evidence artifacts (honest verdict labels — do not conflate with S5 live-verified):**

| Artifact | Runner | Verdict label |
| --- | --- | --- |
| [`g10-evidence/s5/s5-build-proof.json`](./g10-evidence/s5/s5-build-proof.json) | `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** (controller fake fabric) |
| [`g10-evidence/s5/s5-gateway-fake-dispatch.json`](./g10-evidence/s5/s5-gateway-fake-dispatch.json) | `node docs/reports/g10-evidence/s5/run-s5-gateway-fake-dispatch.mjs` | **GATEWAY DISPATCH VERIFIED** (`fakeMode=false`, Gateway fake engine only) |
| [`g10-evidence/s5/s5-live-engine-attempt.json`](./g10-evidence/s5/s5-live-engine-attempt.json) | `node docs/reports/g10-evidence/s5/run-s5-live-engine-attempt.mjs` | **LIVE-ENGINE-ATTEMPTED** (bounded Copilot/Cursor turn; not full Build) |
| [`g10-evidence/s5/s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) | `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | **REAL ENGINE E2E (latest):** `REAL_LIVE_VERIFICATION_NOT_YET_PASSING` — Cursor greenfield engineer → evaluate → challenge → steer (`req-readme`) → **10 post-steer engineer ticks** (no probe README) → impact reinspect OK → durability recover OK → PATH Code continuation OK — **BUILD not COMPLETE** (`req-readme` **UNKNOWN**) |

Fake-fabric proofs alone **do not** constitute S5 live-verified operator acceptance.

**Prior stages:** S4 durable continuity — preserved.

---

## What S5 delivered

PATH Build v1 is a **durable product control loop** over one or more project bindings:

- Thin **Build records** under the PATH runtime root (intent, criteria, children, loop state)
- **Greenfield origin:** `mkdir` + `git init` only — no scaffold; first engineer task owns architecture
- **Engineer / evaluate / challenge** child dispatch via Gateway with `preferredEngine` from `PATHCODE_PREFERRED_ENGINE` / controller option
- **Mechanical probe** (`mechanical-probe.mjs`) for FS/check-backed criteria and requirements (**README detect only — does not write product files**; `materializeMinimalReadme` removed)
- **Impact-aware reinspection:** evidence freshness, scope-independent doc changes, PROVEN demotion on unknown impact
- **Product-level steering:** outcome revision, explicit requirements, preserved `proposedNextAction` / non-demoted requirements on steer
- **CLI surface:** `/build start|status|tick|run|steer|require|help` in `pathcode.mjs`
- **Headless proof:** `node scripts/pathcode-cli/build/headless.mjs proof`

**Control-loop honesty:** `assessCompletion` returns `requirements_unsatisfied` / `criteria_unproven` **before** `evaluate_required` / `challenge_required` when explicit requirements or criteria are still open. Post-steer ticks dispatch **engineer** on `requirements_unsatisfied` (see controller `tick`).

---

## Module map (`scripts/pathcode-cli/build/`)

| Module | Role |
| --- | --- |
| `types.mjs` | Build record / binding / evidence types |
| `record.mjs` | Durable JSON records, listing, action ids |
| `origin.mjs` | Greenfield git-init origin + admission |
| `evidence.mjs` | Binding reality, evidence refs, stale invalidation |
| `objectives.mjs` | Engineer / evaluate / challenge objective framing |
| `reinspect.mjs` | Depth-A reality refresh, status directive parsing, targeted revalidation |
| `mechanical-probe.mjs` | Authoritative FS/check probes for criteria & requirements |
| `controller.mjs` | Start/tick/run loop, fake fabric + Gateway port |
| `format.mjs` | Operator-facing status formatting |
| `headless.mjs` | Headless CLI + mechanical greenfield proof |
| `index.mjs` | Public exports for CLI and tests |

**Tests:** `tests/s5/build.test.ts` (includes probe does-not-materialize README)  
**Regression:** `tests/s4/*` — pass with `npx vitest run tests/s5 tests/s4 --reporter=dot`

---

## Verification (mechanical)

| Check | Result |
| --- | --- |
| `npx vitest run tests/s5 tests/s4 --reporter=dot` | 23 / 23 pass (requires git available for origin tests) |
| `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** |
| `node --check scripts/pathcode-cli/build/controller.mjs` | OK |
| `node --check docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | OK |

---

## Real-engine PATH Build E2E (latest recorded run)

| Field | Value |
| --- | --- |
| Evidence | [`s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) |
| Verdict | `REAL_LIVE_VERIFICATION_NOT_YET_PASSING` |
| Engine | `cursor` (preferred) |
| Build ID | `62d7bba8-fc4a-47e7-958c-b720d1694421` |
| Loop complete | **No** (`running`, revision r2 after steer) |
| Criteria | `c-runnable`, `c-outcome` **PROVEN** |
| Requirements | `req-offline` **SATISFIED**; `req-readme` **UNKNOWN** |
| Children (kinds, order) | `engineer` → `evaluate` → `challenge` → steer → `engineer` ×10 (post-steer; no evaluate/challenge on r2) |
| Impact reinspect | **OK** (docs retained, src demotion) |
| PATH Code continuation | **OK** |
| Closure notes | Post-steer engineers ran under `requirements_unsatisfied`; Cursor did not land `README.md` within harness bounds. No probe shortcut. Operator acceptance requires a passing re-run with engineer-authored README and post-revision VERIFIED evaluate/challenge before BUILD COMPLETE. |

Re-run: `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (requires `CURSOR_API_KEY` or `copilot` on PATH; ~7–25 min depending on engine closure).

---

## Remaining limitations

- **Fake fabric** drives automated proof and vitest — not a substitute for real-engine requirement closure.
- **Real engines** must author required docs (e.g. README via engineer framing on `requirements_unsatisfied`); the probe only verifies files already on disk.
- **Completion gates** require VERIFIED evaluate/challenge since the current intent revision and satisfied explicit requirements.
- S5 is **not frozen** — loop, probe, harness, and engine reliability may evolve until operator acceptance.

---

## Related design docs

- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)
- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)
