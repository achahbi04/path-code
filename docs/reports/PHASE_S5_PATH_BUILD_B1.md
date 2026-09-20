# PATH BUILD — B1
# Honest origin + live product preview

**S5 NOT FROZEN**  
**B1 STATUS:** **GREEN**

```
B1 — HONEST ORIGIN + LIVE PRODUCT PREVIEW PASS
```

## Scope honesty

- B1: greenfield binding == `~/PATH Builds/<slug>` + live web preview.
- B2 (next): outcome → product-specific acceptance criteria.
- B3 (next): non-web product kinds + hardened converse→visible-change.

## Part 1 — origin

| Change | Role |
| --- | --- |
| `paths.mjs` `HOME_BINDING_GUARD` + `assertAllowedProjectRoot` | Refuse `$HOME` / ancestors structurally |
| `paths.mjs` `findUnversionedProjectRoot` | Stop at `$HOME` before marker checks |
| `origin.mjs` `ensureBuildOrigin({ exactRoot: true })` | Build-created binds exact folder; git init in place |
| `origin.mjs` `isBindableProject` | Empty dir → false |
| `controller.mjs` `startBuild` | Always `exactRoot` for `build-created`; assert allowed root |
| `gateway/runtime.mjs` `bindProject` | Assert allowed root after discovery |

## Part 2 — preview

| Module | Role |
| --- | --- |
| `runtime/artifact.mjs` | Detect static / node web from real files |
| `runtime/manager.mjs` | Managed start/stop/restart; exit+stderr on failure |
| `runtime/static-serve.mjs` + proxy | Serve + embed |
| `surface/public/app.js` | Truthful dead-process preview UX |
| `adopt.mjs` | Recover nested-git engineer SHA; refuse empty adoption |
| `controller.mjs` tick | Empty product tree forces another engineer (never evaluate) |
| `objectives.mjs` | Forbid nested `git init` on greenfield |

## Falsification

- `tests/s5/build-b1-honest-origin-preview.test.ts` — F1–F7
- `tests/s5/build-adoption.test.ts` — empty/missing SHA adoption refused
- Browser E2E: `node scripts/pathcode-cli/build/run-b1-honest-origin-preview.mjs`
- Evidence: `docs/reports/g10-evidence/s5/b1-honest-origin-preview.json`

## Fresh browser Build (acceptance)

| Field | Value |
| --- | --- |
| buildId | `058612c6-c70f-459a-b667-7fa709cb9922` |
| projectRoot | `/Users/achahbi/PATH Builds/build-a-website-that-tells-about-ice-76898a` |
| originGitInit | `true` |
| bindsHome | `false` |
| preview URL | `http://127.0.0.1:4174/` |
| servedMatchesDisk | `true` |
| conversation change | title → `ICE — Your Emergency Lifeline` |
| Open Folder | launched on bound projectRoot |
| engine | Cursor `native_sdk` |
