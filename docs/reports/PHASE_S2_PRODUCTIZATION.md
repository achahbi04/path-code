# PATH CODE — S2
# REAL-PROJECT WORKFLOW PRODUCTIZATION

**S2 RESULT:** FIRST SLICE FROZEN / OPERATOR ACCEPTED — Balanced MVP (packaging + history/result/prefs)  
**S2 freeze tip:** _(filled after freeze commit)_  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S1 Gateway Extract + Live Engineering Surface — **FROZEN / OPERATOR ACCEPTED**  
See [`PHASE_LIVE_ENGINEERING_SURFACE.md`](./PHASE_LIVE_ENGINEERING_SURFACE.md).

**S1 Gateway tip:** `9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe`

**MANUAL_UI_ACCEPTANCE:**  
- S1 operator-accepted (Klarapp Phase D + two freeze repairs)  
- **S2 Balanced MVP first slice operator-accepted (Klarapp)** — `/history`, `/report <taskId>`, `/inspect <taskId>`, read-only `/merge` refusal, `/prefs`, persistent `/autonomy` across restart, interactive command panels

**Published releases:** UNCHANGED  
**Publication performed:** NO

---

## Packaging gate (entry)

**RESULT:** PASS

Evidence: [`g10-evidence/s2/`](./g10-evidence/s2/)

| Step | Result |
|---|---|
| `npm run build` + `npm pack` | PASS (753 375 bytes, 1058 files) |
| `audit-release --tarball` | PASS |
| Required S1 modules in tarball (gateway, ag8–ag10, ag1 python, path-studio, dist) | PASS |
| `gc1` / `ensure-venv` absent (intentional) | PASS |
| Isolated `npm install -g` prefix | PASS — bin resolves under install prefix, not checkout |
| Installed `pathcode --version` / `doctor` | PASS |
| Runtime bootstrap from installed package | PASS (marker + venv under isolated runtime) |
| Gateway fake-engine bind/start/steer/cancel from installed modules | PASS |

Runner: `node docs/reports/g10-evidence/s2/run-packaging-gate.mjs` → `packaging-gate.json`

No packaging redesign was required. Cloud/`gc1` remains intentionally out of the npm distribution.

---

## Frozen slice — Balanced MVP (packaging + history/result/prefs)

### Durable task/session history
- Module: [`scripts/pathcode-cli/task-history.mjs`](../../scripts/pathcode-cli/task-history.mjs)
- Commands: `/history [n]`, `/report <taskId>` (reopen durable `.report.txt`)
- Operator panel: in-canvas under `PATH · command`; composer stays usable (Esc closes)

### Result integration UX
- `/inspect [taskId]` — disposition / branch / commit / changed files / adoptable yes|no
- `/merge` / `/adopt` `[taskId]` — refused when no adoptable file changes; otherwise plan + confirm `y` before `git merge` into primary (dirty primary refused)

### Minimal preferences
- Module: [`scripts/pathcode-cli/preferences.mjs`](../../scripts/pathcode-cli/preferences.mjs)
- File: `{stateDir}/preferences.json` (`pathcode.prefs.v1`) — `modelId` + `autonomy` only
- `/model`, `/autonomy` persist with visible confirmation; `/prefs` shows values + source

### Explicitly out of this frozen slice
- Studio / Build / Cursor engine (S5 / S6 / S3)
- Crash `/resume` productization (continuity architecture → S4; product UX may return later in S2 if needed)
- Push/PR / discard as first-class result commands (next S2 candidate)
- Shipping `gc1` in the tarball
- Broad CLI unify / update-channel redesign

---

## Operator acceptance (Klarapp) — PASSED

Live retest confirmed:

1. `/history` — durable tasks with id / project / outcome / when / asked  
2. `/report <taskId>` — canonical durable report  
3. `/inspect <taskId>` — disposition / branch / commit / changes / adoptable  
4. Read-only `/merge` — refused (no primary change)  
5. `/prefs` — durable prefs visible  
6. `/autonomy` — persists across PATH restart  
7. Command panels remain interactive (composer ready; Esc closes; Ctrl-D not required)

---

## Remaining S2 product-completion scope

Authoritative S2 (roadmap): *PATH Code product completion + distribution parity* — real projects/settings/history, admit/merge/discard/PR workflow, unify CLI, package ag8–ag10+ capabilities, clean install/update/doctor; CLI independently shippable.

| Area | Status after this freeze |
|---|---|
| Packaging / installed product gate | **DONE** (this slice) |
| Durable history + report reopen | **DONE** (this slice) |
| Inspect + confirmed merge/adopt | **DONE** (this slice) |
| Minimal model/autonomy prefs | **DONE** (this slice) |
| Discard task result / branch cleanup | **OPEN** |
| Publish / PR from durable task result (beyond `--issue` AG4 path) | **OPEN** |
| Richer project registry / multi-project settings | **OPEN** |
| Product-facing `/resume` over existing checkpoints | **OPEN** (prefer keep architecture in S4; thin CLI only if needed) |
| Update channel / CLI unify polish | **OPEN** (bounded later) |
| Ship `gc1` in npm tarball | **DEFERRED** (intentional) |
| Studio / Build / Cursor SDK | **OUT OF S2** (S5 / S6 / S3) |

---

## Proposed next bounded S2 slice (do not start until approved)

**S2.2 — Result lifecycle completion (discard + publish/PR)**

Close the remaining *admit/merge/discard/PR* product workflow on top of the frozen history/inspect/merge surface:

1. `/discard <taskId>` — explicit confirmation; remove/abandon adoptable task branch + worktree metadata without changing primary (mirror merge’s safety rules)  
2. `/publish` or `/pr <taskId>` — product command that reuses AG4 delivery against a durable verified task (not only `--issue`), with dirty/primary guards and operator confirmation  
3. Operator panels stay interactive (same composition rules as this freeze)  
4. Focused tests + Klarapp acceptance; no S1 reopen; no S3 Cursor SDK; no Studio/Build; no continuity-architecture rewrite

Defer update-channel unify and `gc1`-in-tarball unless a packaging regression appears.

---

## Verification

- Packaging gate: `packaging-gate.json` `ok: true`
- Focused: `tests/s2/history-prefs.test.ts`, `tests/s2/engineering-surface.test.ts`
- Canonical: prior `g10-evidence/s2/canonical-check.txt` (160 files / 1441 tests)
