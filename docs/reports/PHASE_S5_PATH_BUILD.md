# PATH CODE — S5
# PATH BUILD (visual builder closure pass)

**S5 NOT FROZEN**  
**OPERATOR ACCEPTANCE:** **NOT YET**  
**PRODUCT SURFACE:** visual builder workspace (`path-build`) over Gateway / S3 / S5 controller

| Checkpoint | SHA |
| --- | --- |
| Visual-builder substrate | `c931421` |
| Adoption + visual gates | `caf9a42` |
| public/ static preview fix | `6846f7e` |
| Authoritative HEAD | `6846f7e` (see `git rev-parse HEAD`) |

**Product entry:** `node scripts/path-build.mjs`

---

## Authoritative Build product revision

Build binding `projectRoot` on branch `path-build/<buildIdPrefix>`. Engineer isolation via Gateway `path/task-*` worktrees. Adoption via `git merge` in `build/adopt.mjs` (no `cp -R`). Runtime, preview proxy, Open Folder, and Open in PATH Code all use the same binding root after adoption.

---

## Real-engine ICE E2E (partial)

- **buildId:** `818ccab1-f626-473c-96ca-0ef91931b138`
- **projectRoot:** `/Users/achahbi/PATH Builds/ice-real-visual-mu8rutmg`
- **Result:** `REAL_VISUAL_E2E_PARTIAL` — preview + adoption + conversational visible change proven; **BUILD COMPLETE not reached**
- Evidence: `docs/reports/g10-evidence/s5/s5-real-visual-e2e.json` and runtime `metadata/build-evidence/real-visual-e2e/continue-report.json`

### Remaining before operator acceptance

1. Loop must reach `complete` with all derived criteria PROVEN and post-revision evaluate+challenge VERIFIED  
2. Playwright Chromium install incomplete in this environment — HTML/DOM evidence works; screenshots null  
3. Element-select → engineer context not proven in this E2E run  
4. Bounded S4-style durability (controller/runtime/builder reopen) not exercised in this run  
5. Child provider provenance not persisted onto Build child records (available in task reports: `cursor native_sdk`)

---

## Artifact presentation matrix

See `scripts/pathcode-cli/build/runtime/presentation.mjs`.

---

## Regression

```bash
npx vitest run tests/s5/   # 29/29
PATHCODE_BUILD_NO_OPEN=1 node scripts/pathcode-cli/build/real-visual-e2e.mjs
```
