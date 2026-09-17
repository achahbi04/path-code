# PATH CODE — S2
# REAL-PROJECT WORKFLOW PRODUCTIZATION

**S2 RESULT:** S2.1 FROZEN / OPERATOR ACCEPTED · **S2.2 FROZEN / OPERATOR ACCEPTED**  
**S2.2 freeze tip:** _(recorded at freeze commit)_  
**S2.1 freeze tip:** `a1bab1070d0f9bfd627fbbfdec6265a90b20a2c8`  
**S2.1 tip record:** `1f120c8bb275001f83317535bf8de45c430b8441`  
**S1:** FROZEN / OPERATOR ACCEPTED — tip `eac5f8620fea8c75070cd27421643bb167864294` — **do not reopen**

**Prior stage:** S1 Gateway Extract + Live Engineering Surface — **FROZEN / OPERATOR ACCEPTED**  
See [`PHASE_LIVE_ENGINEERING_SURFACE.md`](./PHASE_LIVE_ENGINEERING_SURFACE.md).

**S1 Gateway tip:** `9f9db58c918b4ee690f0a5053aa8ebfd8bc15cfe`

**MANUAL_UI_ACCEPTANCE:**  
- S1 operator-accepted (Klarapp Phase D + two freeze repairs)  
- **S2.1** operator-accepted (Klarapp) — history/report/inspect/merge refusal/prefs/autonomy/interactive panels  
- **S2.2** operator-accepted — discard lifecycle (Klarapp) + positive `/pr` lifecycle (private GitHub Klarapp) + S1 title/ANSI regression closure

**Published releases:** UNCHANGED  
**Publication performed:** NO (task-result PR to Klarapp only; PATH package not published)

**S3:** NOT STARTED

---

## Packaging gate (entry)

**RESULT:** PASS — evidence [`g10-evidence/s2/`](./g10-evidence/s2/)

---

## S2.1 — Balanced MVP (FROZEN)

Packaging + durable history + inspect/merge + minimal prefs. Tip `a1bab107…`.

---

## S2.2 — Result lifecycle completion (FROZEN)

**Goal:** complete durable result lifecycle — `history / inspect → adopt | discard | PR`.

### Module
- [`scripts/pathcode-cli/result-lifecycle.mjs`](../../scripts/pathcode-cli/result-lifecycle.mjs)
- Lifecycle stored on durable checkpoint as `resultLifecycle` (same history model; no second store)

### Commands
- `/discard <taskId>` — confirm → clean worktree + delete local `path/task-*` branch → mark **DISCARDED**; primary untouched; report/history retained  
- `/pr <taskId>` (alias `/publish`) — confirm → AG4 `publishVerifiedResult` (push + create/reuse PR) → mark **PR OPEN · url**; primary content unchanged  
- `/merge` success now marks **MERGED**

### Lifecycle labels (`/history` · `/inspect`)
- `VERIFIED · adoptable` (only when changed files are recorded)
- `MERGED`
- `DISCARDED`
- `PR OPEN · <url>`

### Closure repairs (frozen-S1 regressions closed in S2.2)
- **Terminal.app title:** sticky reclaim disable removed; reclaim detached + quiet env; faster watchdog; title remains `<project> — PATH Code` during child execution — evidence `g10-evidence/s2/s22-title-ansi-proof.json`
- **ANSI source residue:** incomplete CSI no longer leaves `38;5;180m` tails; fit/truncate consume full sequences; orphan SGR scrub — same evidence file

### Live Klarapp `/pr` proof
- Private repo: https://github.com/achahbi04/Klarapp  
- PR left open: https://github.com/achahbi04/Klarapp/pull/1  
- Evidence: `g10-evidence/s2/s22-pr-live-proof.json` (N cancel no side effect → y publish → PR OPEN · url; primary untouched)

### Explicitly out of S2.2
- S3 Cursor SDK / engine fabric  
- S4 continuity architecture  
- Studio / Build  
- `gc1` distribution  
- update-channel / release architecture beyond task-result PR

### Focused tests
- `tests/s2/result-lifecycle.test.ts` — discard primary-safe + DISCARDED; read-only/discarded not adoptable; MERGED + PR panel copy  
- Existing `tests/s2/history-prefs.test.ts` / `engineering-surface.test.ts`

---

## Remaining S2 after S2.2 (if any later work)

| Area | Status |
|---|---|
| Packaging / history / prefs / inspect / merge | **DONE** (S2.1) |
| Discard + `/pr` lifecycle | **DONE** (S2.2 FROZEN) |
| Richer project registry / multi-project settings | OPEN |
| Product-facing `/resume` | OPEN (architecture → S4) |
| Update channel / CLI unify | OPEN |
| Ship `gc1` in tarball | DEFERRED |
| Studio / Build / Cursor SDK | OUT OF S2 → S3+ |

---

## Verification

- Packaging gate: `packaging-gate.json` `ok: true`
- Focused: `tests/s2/result-lifecycle.test.ts`, `history-prefs.test.ts`, `engineering-surface.test.ts`
- Title/ANSI: `g10-evidence/s2/s22-title-ansi-proof.json`
- Live PR: `g10-evidence/s2/s22-pr-live-proof.json`
- Canonical: `g10-evidence/s2/s22-canonical-check.txt`
