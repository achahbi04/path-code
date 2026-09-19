# PATH CODE — S5
# PATH BUILD (Option A′)

**S5 RESULT:** **REAL-LIVE-VERIFICATION NOT YET PASSING** (real-engine end-to-end harness; see below)  
**S5 implementation checkpoint:** `ebb8cf76d89ef7d3c2f76048d37b043d63332f4b` (Build controller, Gateway `preferredEngine`, mechanical probe, real-e2e harness, phase evidence labels).  
**Mode:** mechanical fake fabric for CI/unit tests; real-engine PATH Build via `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (no Build fake fabric, no Gateway fake engine)

**Evidence artifacts (honest verdict labels — do not conflate with S5 live-verified):**

| Artifact | Runner | Verdict label |
| --- | --- | --- |
| [`g10-evidence/s5/s5-build-proof.json`](./g10-evidence/s5/s5-build-proof.json) | `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** (controller fake fabric) |
| [`g10-evidence/s5/s5-gateway-fake-dispatch.json`](./g10-evidence/s5/s5-gateway-fake-dispatch.json) | `node docs/reports/g10-evidence/s5/run-s5-gateway-fake-dispatch.mjs` | **GATEWAY DISPATCH VERIFIED** (`fakeMode=false`, Gateway fake engine only) |
| [`g10-evidence/s5/s5-live-engine-attempt.json`](./g10-evidence/s5/s5-live-engine-attempt.json) | `node docs/reports/g10-evidence/s5/run-s5-live-engine-attempt.mjs` | **LIVE-ENGINE-ATTEMPTED** (bounded Copilot/Cursor turn; not full Build) |
| [`g10-evidence/s5/s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) | `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | **REAL ENGINE / REAL PATH BUILD E2E:** `REAL_LIVE_VERIFICATION_NOT_YET_PASSING` — greenfield engineer/evaluate/challenge + steer + continuation exercised on Cursor; build did not reach `loop.status=complete` with all requirements satisfied |

Fake-fabric proofs alone **do not** constitute S5 live-verified operator acceptance.

**Prior stages:** S4 durable continuity — preserved. S5 is **not frozen** until operator acceptance.

---

## What S5 delivered

PATH Build v1 is a **durable product control loop** over one or more project bindings:

- Thin **Build records** under the PATH runtime root (intent, criteria, children, loop state)
- **Greenfield origin:** `mkdir` + `git init` only — no scaffold; first engineer task owns architecture
- **Engineer / evaluate / challenge** child dispatch via Gateway with `preferredEngine` from `PATHCODE_PREFERRED_ENGINE` / controller option
- **Mechanical probe** (`mechanical-probe.mjs`) for FS/check-backed criteria and requirements (incl. README)
- **Impact-aware reinspection:** evidence freshness, scope-independent doc changes, PROVEN demotion on unknown impact
- **Product-level steering:** outcome revision, explicit requirements, loop re-open after complete
- **CLI surface:** `/build start|status|tick|run|steer|require|help` in `pathcode.mjs`
- **Headless proof:** `node scripts/pathcode-cli/build/headless.mjs proof`

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

**Tests:** `tests/s5/build.test.ts` (11 cases)  
**Regression:** `tests/s4/*` — pass with `npx vitest run tests/s5 tests/s4 --reporter=dot`

---

## Verification (mechanical)

| Check | Result |
| --- | --- |
| `npx vitest run tests/s5 tests/s4 --reporter=dot` | 22 / 22 pass (requires git available for origin tests) |
| `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** |
| `node --check scripts/pathcode-cli/build/controller.mjs` | OK |
| `node --check docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | OK |

---

## Real-engine PATH Build E2E (latest recorded run)

| Field | Value |
| --- | --- |
| Evidence | [`s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) |
| Engine | `cursor` (preferred) |
| Build ID | `a4d277e3-5910-42ea-ad0c-2b9c1e675104` |
| Loop complete | **No** (`running`, revision r2) |
| Criteria | `c-runnable`, `c-outcome` **PROVEN** |
| Requirements | `req-offline` **SATISFIED**; `req-readme` **UNKNOWN** |
| Children | 18 consumed (engineer / evaluate / challenge mix; multiple post-steer engineer turns) |
| PATH Code continuation | **OK** |
| Key defect | After product-level steer adding `req-readme`, real engineering turns returned **VERIFIED** but did not establish `README.md` on the binding root (requirement never mechanically satisfied; completion gate correctly withheld) |

Re-run: `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (requires `CURSOR_API_KEY` or `copilot` on PATH; ~12–20 min).

---

## Remaining limitations

- **Fake fabric** drives automated proof and vitest — not a substitute for real-engine requirement closure.
- **Real engines** must actually mutate product FS for steered requirements; VERIFIED sessions without README (or without `REQUIREMENT` directives) leave Build **running**.
- **Completion gates** require VERIFIED evaluate/challenge since the current intent revision and satisfied explicit requirements.
- S5 is **not frozen** — loop, probe, and harness may evolve until operator acceptance.

---

## Related design docs

- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)
- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)
