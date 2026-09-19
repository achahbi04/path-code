# PATH CODE — S5
# PATH BUILD (visual builder pass)

**S5 NOT FROZEN**  
**OPERATOR ACCEPTANCE:** **NOT YET** — substrate + builder UI shipped; full real-engine ICE visual e2e still open  
**PRODUCT SURFACE:** visual builder workspace (`path-build`) over Gateway / S3 / S5 controller

**Authoritative tip (dirty worktree):** see `git status` — visual builder modules uncommitted on top of `59f64be628c6550915ecf71f254a640c5e5249b5`

**Product entry:**

```bash
node scripts/path-build.mjs
# or: path-build
```

Opens a local **builder workspace**: conversation + **live product preview** (iframe via `/preview/:buildId/*`), not a status dashboard as the primary surface.

**PATH Code** remains the terminal for engineering an **existing** repo.

---

## What this pass added

| Area | Location |
| --- | --- |
| Exact Build-origin binding | `build/origin.mjs` — `exactRoot` never walks to `$HOME` |
| Product brief / derived criteria | `build/brief.mjs` |
| Conversation steering | `build/conversation.mjs` + `POST /api/builds/:id/message` |
| Artifact detection | `build/runtime/artifact.mjs` |
| Runtime manager | `build/runtime/manager.mjs` (+ static serve, browser evidence, proxy) |
| Builder UI | `build/surface/public/{index.html,app.js,app.css}` |
| Proof harness | `build/proof-visual-builder.mjs` |
| Regressions | `tests/s5/build-builder.test.ts` (26/26 S5 tests passing) |

---

## Still open before operator acceptance

1. **Real-engine ICE e2e** (no `PATHCODE_BUILD_FAKE`) with engineer → preview → conversation change → visible HMR/reload proof  
2. **Worktree → product branch adoption** beyond recording `productBranch`  
3. **Playwright** screenshots (optional dep; fetch HTML evidence works today)  
4. **Evaluate/challenge** consuming rendered browser evidence automatically  
5. Non-web presentation adapters beyond detection stubs  

---

## Regression

```bash
npx vitest run tests/s5/
node scripts/pathcode-cli/build/proof-visual-builder.mjs
```
