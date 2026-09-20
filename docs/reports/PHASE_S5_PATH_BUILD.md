# PATH CODE — S5
# PATH BUILD (fresh-user browser flow — operator acceptance ready)

**S5 NOT FROZEN**  
**OPERATOR ACCEPTANCE:** **READY** (operator performs final acceptance)

## Verdict

```
PATH BUILD — REAL FRESH-USER BROWSER FLOW PASS
REAL ENGINE BUILD BUTTON → LIVE PRODUCT — PASS
OPEN IN PATH CODE — PASS
OPEN FOLDER — PASS
OPERATOR ACCEPTANCE READY
S5 NOT FROZEN
```

## Root causes fixed

| Failure | Root cause | Fix |
| --- | --- | --- |
| Build → Starting… → Build, no activity | Fresh empty Build treated missing browser evidence as stale (`pendingRuntimeRefresh`), so `tick` never dispatched the first engineer | Do not require browser evidence / runtime refresh until a consumed engineer exists; clear refresh on empty trees |
| Activity always visible / clicks blocked | `.drawer { display: grid }` overrode HTML `[hidden]` | `.drawer[hidden] { display: none !important }` |
| Open in PATH Code did nothing | Detached `node pathcode.mjs` with `stdio: ignore` (no TTY) | Launch via Terminal.app (`osascript`) bound to authoritative `projectRoot` |
| Silent Build CTA reset | `finally` always restored “Build” | Only restore landing CTA on start failure; poll `/api/builds/:id` as SSE fallback |

## Fresh browser acceptance

- Harness: `node scripts/pathcode-cli/build/run-s5-real-browser-acceptance.mjs`
- Evidence: `docs/reports/g10-evidence/s5/s5-fresh-browser-acceptance.json`
- **buildId:** `96d6d96f-958f-4a5f-bc2e-e91f9631e769`
- **projectRoot:** `/Users/achahbi/PATH Builds/build-a-website-that-tells-about-ice-c0d549`
- **engine:** Cursor `native_sdk`
- **first engineer:** `3b3b0f93-b0a5-45b0-9077-8edaa50b3d4b`
- **preview auth:** `adae8271…` → conversation auth `474e135a…`
- **runtime:** static preview `http://127.0.0.1:4174/`
- Open Folder / Open in PATH Code: launched (`terminal.app`)

**Product entry:** `node scripts/path-build.mjs`
