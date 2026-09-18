# PATH CODE — S5
# PATH BUILD (Option A′)

**S5 RESULT:** **IMPLEMENTED / LIVE-VERIFIED** (not frozen)  
**Implementation commit:** `5dc1e07325d85e80d41866cfec37cae94a51b4b4`  
**Proof artifact:** [`g10-evidence/s5/s5-build-proof.json`](./g10-evidence/s5/s5-build-proof.json) — verdict **LIVE-VERIFIED**  
**Mode:** mechanical fake fabric for the durable product control loop (CI + unit tests)  
**Real-engine greenfield:** operator-exercisable via interactive **`/build`** (Gateway-backed tasks)

**Prior stages:** S4 durable continuity — preserved; S3/S2/S1 freeze tips unchanged.

---

## What S5 delivered

PATH Build v1 is a **durable product control loop** over one or more project bindings:

- Thin **Build records** under the PATH runtime root (intent, criteria, children, loop state)
- **Greenfield origin:** `mkdir` + `git init` only — no scaffold; first engineer task owns architecture
- **Engineer / evaluate / challenge** child dispatch (fake fabric in tests; Gateway in CLI)
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
| `controller.mjs` | Start/tick/run loop, fake fabric + Gateway port |
| `format.mjs` | Operator-facing status formatting |
| `headless.mjs` | Headless CLI + mechanical greenfield proof |
| `index.mjs` | Public exports for CLI and tests |

**Tests:** `tests/s5/build.test.ts` (8 cases)  
**Regression:** `tests/s4/*` (12 cases) — unchanged pass

---

## Verification (mechanical)

| Check | Result |
| --- | --- |
| `npx vitest run tests/s5/build.test.ts` | 8 / 8 pass |
| `node scripts/pathcode-cli/build/headless.mjs proof` | **LIVE-VERIFIED** |
| `node --check scripts/pathcode-cli/build/controller.mjs` | OK |
| `node --check scripts/pathcode.mjs` | OK |
| `npx vitest run tests/s4 --reporter=dot` | 12 / 12 pass |

Proof steps exercised: origin (git, no package.json scaffold), multi-task loop (engineer/evaluate/challenge), impact reinspect, durability/consume dedupe, steering + re-complete, code convergence bindable tree.

---

## Remaining limitations

- **Fake fabric** drives automated proof and vitest; it writes a minimal Node marker + tests — not a substitute for live Gateway engineering quality.
- **Real engines** require operator session with `/build start …` and configured Gateway; not part of the mechanical proof gate.
- **Evidence fingerprints** augment Git status with changed-file content digests so untracked edits invalidate anchors; tracked-only edge cases still follow Git porcelain/diff-stat semantics from AG10 task reality.
- S5 is **not frozen** — product loop APIs and reinspection rules may evolve in later stages.

---

## Related design docs

- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)
- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)
