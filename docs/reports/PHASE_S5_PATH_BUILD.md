# PATH CODE — S5
# PATH BUILD (visual builder closure pass)

**S5 NOT FROZEN**  
**OPERATOR ACCEPTANCE:** **NOT YET** — awaiting real-engine ICE visual E2E operator confirmation  
**PRODUCT SURFACE:** visual builder workspace (`path-build`) over Gateway / S3 / S5 controller

**Substrate checkpoint:** `c931421`  
**Closure work:** uncommitted on top of substrate until committed in this pass

**Product entry:**

```bash
node scripts/path-build.mjs
# or: path-build
```

Opens a local **builder workspace**: conversation + **live product preview** (iframe via `/preview/:buildId/*`), not a status dashboard as the primary surface.

**PATH Code** remains the terminal for engineering an **existing** repo.

---

## Authoritative Build product revision

| Concept | Definition |
| --- | --- |
| Authoritative tree | Build binding `projectRoot` checked out on `path-build/<buildIdPrefix>` |
| Engineer isolation | Gateway task worktree on `path/task-*` |
| Adoption | `git merge path/task-*` into product branch via `build/adopt.mjs` (no `cp -R`) |
| Runtime / preview / Open Folder / Open in PATH Code | All bind to the same `projectRoot` after adoption |

Persisted per adoption: `buildId`, `taskId`, `sourceSha`, `adoptedSha`, `projectRoot`, `productBranch`, `adoptedAt`.

---

## Artifact presentation matrix

See `scripts/pathcode-cli/build/runtime/presentation.mjs` — web is fully interactive in-builder; desktop/mobile/multi_service unsupported; api/cli/service partial.

---

## Regression

```bash
npx vitest run tests/s5/
node scripts/pathcode-cli/build/proof-visual-builder.mjs
# Real engine (no fake env):
PATHCODE_BUILD_NO_OPEN=1 node scripts/pathcode-cli/build/real-visual-e2e.mjs
```
