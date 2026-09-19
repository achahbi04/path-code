# PATH CODE — S5
# PATH BUILD (Option A′)

**S5 IMPLEMENTED**  
**REAL-LIVE-VERIFIED:** **PASSING** (`REAL_PATH_BUILD_END_TO_END_VERIFIED` — latest honest e2e)  
**OPERATOR ACCEPTANCE:** **READY**  
**S5 NOT FROZEN**

**Authoritative HEAD:** `b414ac4d40e7fc254491a524cded9034b1952852` (pre-acceptance tip; supersedes stale `e724e22` pointer; real e2e evidence in `963e04c` lineage)  
**Prior superseded checkpoint:** `357d9328ad2fe0634fd43ad6e0e394d517907a34` (`req-readme` stuck UNKNOWN — probe scanned binding primary only; checkpoints split across runtime roots)

**Mode:** mechanical fake fabric for CI/unit tests; real-engine PATH Build via `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (no Build fake fabric, no Gateway fake engine)

**Evidence artifacts (honest verdict labels — do not conflate with S5 live-verified):**

| Artifact | Runner | Verdict label |
| --- | --- | --- |
| [`g10-evidence/s5/s5-build-proof.json`](./g10-evidence/s5/s5-build-proof.json) | `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** (controller fake fabric) |
| [`g10-evidence/s5/s5-gateway-fake-dispatch.json`](./g10-evidence/s5/s5-gateway-fake-dispatch.json) | `node docs/reports/g10-evidence/s5/run-s5-gateway-fake-dispatch.mjs` | **GATEWAY DISPATCH VERIFIED** (`fakeMode=false`, Gateway fake engine only) |
| [`g10-evidence/s5/s5-live-engine-attempt.json`](./g10-evidence/s5/s5-live-engine-attempt.json) | `node docs/reports/g10-evidence/s5/run-s5-live-engine-attempt.mjs` | **LIVE-ENGINE-ATTEMPTED** (bounded Copilot/Cursor turn; not full Build) |
| [`g10-evidence/s5/s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) | `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | **REAL ENGINE E2E (latest):** `REAL_PATH_BUILD_END_TO_END_VERIFIED` — Cursor greenfield engineer → evaluate → challenge → steer (`req-readme`) → post-steer evaluate/challenge → **BUILD COMPLETE** (`req-readme` **SATISFIED** via worktree/git-aware probe; engineer-authored README) |

Fake-fabric proofs alone **do not** constitute S5 live-verified operator acceptance.

**Prior stages:** S4 durable continuity — preserved.

---

## What S5 delivered

PATH Build v1 is a **durable product control loop** over one or more project bindings:

- Thin **Build records** under the PATH runtime root (intent, criteria, children, loop state)
- **Greenfield origin:** `mkdir` + `git init` only — no scaffold; first engineer task owns architecture
- **Engineer / evaluate / challenge** child dispatch via Gateway with `preferredEngine` from `PATHCODE_PREFERRED_ENGINE` / controller option
- **Mechanical probe** (`mechanical-probe.mjs`) for FS/check/git-backed criteria and requirements — probes **binding primary + active/task worktree + task branch (`git show`)**; **README detect only — does not write product files**
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

**Tests:** `tests/s5/build.test.ts` (probe does-not-materialize README; worktree + task-branch README detection)  
**Regression:** `tests/s4/*` — pass with `npx vitest run tests/s5 tests/s4 --reporter=dot`

---

## Verification (mechanical)

| Check | Result |
| --- | --- |
| `npx vitest run tests/s5 tests/s4 --reporter=dot` | 25 / 25 pass (requires git available for origin tests) |
| `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** |
| `node --check scripts/pathcode-cli/build/controller.mjs` | OK |
| `node --check docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` | OK |

---

## Real-engine PATH Build E2E (latest recorded run)

| Field | Value |
| --- | --- |
| Evidence | [`s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) |
| Verdict | `REAL_PATH_BUILD_END_TO_END_VERIFIED` |
| Engine | `cursor` (preferred) |
| Build ID | `81bbd2d7-0801-49ac-9cc8-d9f1f74e1f7e` |
| Loop complete | **Yes** (`complete`, revision r2 after steer) |
| Criteria | `c-runnable`, `c-outcome` **PROVEN** |
| Requirements | `req-offline` **SATISFIED**; `req-readme` **SATISFIED** (FS/git probe; engineer-authored) |
| Children (kinds, order) | `engineer` → `evaluate` → `challenge` → steer → `evaluate` → `challenge` → impact/durability → **COMPLETE** |
| Impact reinspect | **OK** |
| PATH Code continuation | **OK** |
| Root-cause fix | Probe + consume now honor task **worktreePath**, **activeWorktreePath**, **task branch (`git show`)**, and **checkpoint fallback** across runtime roots; Gateway session uses Build **runtimeRoot** (e2e sets `PATHCODE_RUNTIME_ROOT`). |

Re-run: `node docs/reports/g10-evidence/s5/run-s5-real-e2e.mjs` (requires `CURSOR_API_KEY` or `copilot` on PATH; ~7–25 min depending on engine closure).

---

## Remaining limitations

- **Fake fabric** drives automated proof and vitest — not a substitute for real-engine requirement closure.
- **Real engines** must author required docs (e.g. README on primary or task worktree/branch); the probe verifies FS/git evidence — never materializes product files.
- **Completion gates** require VERIFIED evaluate/challenge since the current intent revision and satisfied explicit requirements.
- S5 is **not frozen** — loop, probe, harness, and engine reliability may evolve until operator acceptance.

---

## Related design docs

- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)
- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)
