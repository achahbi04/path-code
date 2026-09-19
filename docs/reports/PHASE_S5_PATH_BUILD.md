# PATH CODE — S5
# PATH BUILD (Option A′)

**S5 IMPLEMENTED**  
**PRODUCT SURFACE:** **SHIPPED** (`path-build` browser builder — not PATH Code terminal)  
**REAL-LIVE-VERIFIED (control loop):** **PASSING** (`REAL_PATH_BUILD_END_TO_END_VERIFIED`)  
**OPERATOR ACCEPTANCE:** **READY for product-surface acceptance** (`node scripts/path-build.mjs`)  
**S5 NOT FROZEN**

**Authoritative HEAD:** `(pending tip)`  
**Control-loop e2e:** [`g10-evidence/s5/s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json)  
**Operator-entry (legacy CLI path):** [`g10-evidence/s5/s5-operator-entry-proof.json`](./g10-evidence/s5/s5-operator-entry-proof.json) — superseded as **product** entry; retained as control-loop evidence  

**Mode:** mechanical fake fabric for CI/unit tests; real-engine Build via Gateway/S3 (no Build fake / no Gateway fake for live product use)

**Product entry (settled):**

```bash
node scripts/path-build.mjs
```

Opens a local browser builder (Lovable-shaped): outcome → Build → live status → steer/require → project folder. Creates projects under `~/PATH Builds/`. Uses the same S5 control loop + Gateway fabric. **Not** another PATH Code REPL.

**PATH Code** remains the terminal product for engineering an **existing** project. `/build …` inside `pathcode` is a **debug/power** seam only — not the Build product.

**Engine:** unchanged S3 fabric (Cursor / Copilot / Antigravity) + S4 continuity.

---

## Evidence artifacts

| Artifact | Runner | Verdict label |
| --- | --- | --- |
| Product surface | `node scripts/path-build.mjs` + `tests/s5/build-surface.test.ts` | **PRODUCT SURFACE** — browser UI + API over controller |
| [`g10-evidence/s5/s5-build-proof.json`](./g10-evidence/s5/s5-build-proof.json) | `node scripts/pathcode-cli/build/headless.mjs proof` | **MECHANICAL CONTROL-LOOP VERIFIED** |
| [`g10-evidence/s5/s5-gateway-fake-dispatch.json`](./g10-evidence/s5/s5-gateway-fake-dispatch.json) | gateway fake dispatch runner | **GATEWAY DISPATCH VERIFIED** |
| [`g10-evidence/s5/s5-real-e2e.json`](./g10-evidence/s5/s5-real-e2e.json) | real e2e runner | **REAL_PATH_BUILD_END_TO_END_VERIFIED** |
| [`g10-evidence/s5/s5-operator-entry-proof.json`](./g10-evidence/s5/s5-operator-entry-proof.json) | CLI unbound entry runner | Legacy CLI entry proof (not product UX) |

---

## What S5 delivered

PATH Build v1 = **durable product control loop** + **dedicated product surface**:

- Browser surface: [`scripts/path-build.mjs`](../../scripts/path-build.mjs) + [`scripts/pathcode-cli/build/surface/`](../../scripts/pathcode-cli/build/surface/)
- Thin **Build records** (intent, criteria, children, loop state)
- **Greenfield origin:** mkdir + git init only — first engineer establishes architecture
- **Engineer / evaluate / challenge** via Gateway (`PATHCODE_PREFERRED_ENGINE`)
- Mechanical probe + impact-aware reinspection + product-level steer/require
- Debug CLI: `/build …` in PATH Code only

---

## Module map (`scripts/pathcode-cli/build/`)

| Module | Role |
| --- | --- |
| `surface/server.mjs` | Localhost Build API + static UI host |
| `surface/product-view.mjs` | Human product projection (no slash-command UX) |
| `surface/public/*` | PATH Build browser UI |
| `controller.mjs` | Start/tick/run loop |
| `origin.mjs` | git-init-only origin |
| `mechanical-probe.mjs` / `reinspect.mjs` / `evidence.mjs` | Honesty probes |
| `headless.mjs` | Mechanical proof |

**Tests:** `tests/s5/build.test.ts` + `tests/s5/build-surface.test.ts`  
**Regression:** `tests/s4/*`

---

## Verification (mechanical)

| Check | Result |
| --- | --- |
| `npx vitest run tests/s5 tests/s4 --reporter=dot` | run after tip |
| `node --check scripts/path-build.mjs` | OK |
| Product launch | `PATHCODE_BUILD_NO_OPEN=1 node scripts/path-build.mjs` → `http://127.0.0.1:7788/` |

---

## Remaining limitations

- Surface is S5 builder UX — **not** full PATH Studio (S6).
- Real engines must author product files; probes never scaffold.
- S5 is **not frozen**.

---

## Related

- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_AUDIT.md)
- [`PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md`](./PHASE_S5_PATH_BUILD_ARCHITECTURE_REFINEMENT.md)
