# PATH • Builder — Genuine Repair Track — OPERATOR VERIFIED / CLOSED

**Ended:** `PATH BUILDER REPAIR TRACK — PHASES 1–7 OPERATOR VERIFIED / CLOSED`

**Package version:** `1.0.1`  
**Accepted Builder runtime (exact):** `2ae7540da76e8d311e64465958d5f6ce03a72c25`  
**Git tip at closure (same runtime):** `2ae7540da76e8d311e64465958d5f6ce03a72c25`

This report records operator closure of the PATH Builder **genuine repair roadmap** (Phases 1–7). It does **not** claim S5 platform freeze, npm publish, remote push, Model Registry, Astra, Grok, or new-engine work.

---

## Closure verdict

| Scope | Status |
|---|---|
| Phases 1–7 (Builder repair) | **OPERATOR VERIFIED / CLOSED** |
| Phase 7 real acceptance (Dark Mode) | **OPERATOR VERIFIED / CLOSED** |
| Canonical ICE (`dcca5ffb`) | **Paused · read-only witness · not engineered in Phases 1–7** |

---

## Accepted runtime identity

All operator verification for Phases 4–7 and the Phase 7 acceptance run used a freshly started Builder whose **surface / coordinator / gateway** reported:

- **SHA:** `2ae7540da76e8d311e64465958d5f6ce03a72c25`
- **exact:** `true` (no dirty `CODE_PATHS` ambiguity on `scripts` + `package.json`)
- **stale:** `false`

Phase 6 added the rail footer **Build identity** kicker and per-process lines; Phase 1 established the underlying loaded-code identity model (`identity.mjs`, `/api/identity`, stale banner).

---

## Phase ledger (operator-closed)

| Phase | Title | Closed implementation SHA | Primary evidence |
|---|---|---|---|
| **0** | ICE recovery (prerequisite) | `bb9cb660c8e2a994cc00bd1069dc62dbbd25c9d5` (restored product on branch; Build paused) | Operator recovery; `dcca5ffb` record |
| **1** | Running-build identity (D7) | `e3773453aba8e893042beadae6995fa29292d389` | `4a06b81` + coordinator/gateway reuse fix; falsification in build identity tests |
| **2** | Creator candidate review (Apply / Discard) | `ed1a175` (history-truth closeout; live Apply proof on `267f610`) | `tests/s5/build-candidate-review.test.ts`; `docs/reports/PHASE_2_CREATOR_CANDIDATE_REVIEW_COMPLETE.md` |
| **3** | Remove automatic re-engineering (D2/D3/D4) | `5c4e9c6aff721293864b016968dbd8f95bf721f6` | `tests/s5/build-phase3-auto-reengineer.test.ts`; `docs/reports/PHASE_3_AUTO_REENGINEERING_REMOVAL_COMPLETE.md` |
| **4** | Preview + lifecycle truth | `98bc44454c0ef7ab8039449c17bf098b3c37764d` | `tests/s5/build-phase4-preview-lifecycle.test.ts`, `build-phase4-preview-render.test.ts`; shutdown `270560b` operator-verified with Phase 4 |
| **5** | Remove manufactured criteria ceremony (D6) | `77377ba01f94096ba0db4eb17054375a54deedb3` | `tests/s5/build-phase5-criteria-removal.test.ts` |
| **6** | Project rail UI finish | `2ae7540da76e8d311e64465958d5f6ce03a72c25` | `tests/s5/build-phase6-project-rail.test.ts`; `docs/reports/PHASE_6_PROJECT_RAIL_UI_COMPLETE.md` |
| **7** | Real end-to-end acceptance | `2ae7540da76e8d311e64465958d5f6ce03a72c25` (runtime) | `docs/reports/PHASE_7_ACCEPTANCE/acceptance.json` (35 harness invariants) |

**Note:** Phase SHAs are cumulative on one repair line; the **accepted runtime for closure** is the Phase 6/7 tip `2ae7540`.

---

## Phase 7 — acceptance conditions (operator-verified)

**Project:** Dark Mode `351d7275-a6ea-498b-a48d-a32e91f669f4`  
**Pre-acceptance applied SHA:** `a95f0e7db67412f88b9f07e5567efbffee2cb73f`  
**Final applied SHA (after authorized Apply):** `810a63a3b33dc8bdf28c2a14f6aa565126936a4d`

**Authorized engineering budget:** exactly **2** Cursor engineer turns.

| Step | Outcome |
|---|---|
| Run 1 | Candidate `fb2c9e24…` → verified → **DISCARD** (0 engine calls on discard) |
| Run 2 | Same bounded creator request → candidate `810a63a3…` → **APPLY** once |
| ICE | No engine call; remains paused at `bb9cb66…` |

**Creator request (verbatim class):** slim “What’s new” banner under main header with dismiss control; preserve existing dark-mode homepage, logo, polish, and CVR footer; do not replace the site.

**Operator confirmed live:** banner visible; product evolved not replaced; Ready status; preview `810a63a3…`; refresh and project switching durable; no candidate-review after Apply; truthful conversation; no spontaneous engineer; ICE untouched.

---

## Witness projects (runtime)

| Project | buildId | Role at closure |
|---|---|---|
| Dark Mode | `351d7275-a6ea-498b-a48d-a32e91f669f4` | Phase 2–7 witness; final applied `810a63a3…` |
| ICE (canonical) | `dcca5ffb-f748-4778-bc91-876ac8ae0176` | Paused witness; applied `bb9cb66…`; not modified in repair track |

---

## Mechanical closeout (Phase 7, at `2ae7540`)

Recorded in `docs/reports/PHASE_7_ACCEPTANCE/`:

| Gate | Result |
|---|---|
| `npm run check` | PASS (`cold-check.log`) |
| `npm pack` | PASS → `pack/path-code-1.0.1.tgz` |
| `node scripts/audit-release.mjs --tarball …` | PASS (`audit-release.log`) |
| Isolated `npm install` + `path-build --help` | PASS (`isolated-install.log`) |
| Phase 7 harness invariants | **35 / 35** PASS (`acceptance.json`) |

**Ledger:** `ledger:verify PASS at 2ae7540da76e8d311e64465958d5f6ce03a72c25` (from Phase 7 closeout run).

---

## Evidence index

| Artifact | Path |
|---|---|
| Phase 7 acceptance JSON | `docs/reports/PHASE_7_ACCEPTANCE/acceptance.json` |
| Phase 7 live log (resume run) | `docs/reports/PHASE_7_ACCEPTANCE/live-run-resume.log` |
| Phase 7 harness (acceptance only; outside `CODE_PATHS`) | `docs/reports/PHASE_7_ACCEPTANCE/run-phase7-dark-mode-acceptance.mjs` |
| Phase 7 summary | `docs/reports/PHASE_7_ACCEPTANCE/PHASE_7_ACCEPTANCE_COMPLETE.md` |
| Phase 2 report | `docs/reports/PHASE_2_CREATOR_CANDIDATE_REVIEW_COMPLETE.md` |
| Phase 3 report | `docs/reports/PHASE_3_AUTO_REENGINEERING_REMOVAL_COMPLETE.md` |
| Phase 6 report | `docs/reports/PHASE_6_PROJECT_RAIL_UI_COMPLETE.md` |
| Packaged candidate at closure | `docs/reports/PHASE_7_ACCEPTANCE/pack/path-code-1.0.1.tgz` |

---

## Doctrine preserved (roadmap)

1. Falsification tests per phase; live proving condition for Phase 7 on a real accumulated project.
2. No acceptance without code-identity match on long-lived Builder processes.
3. One creator request → one engineer turn (Phase 7 budget enforced).
4. Candidate until explicit Apply; Discard restores authoritative product with zero engine calls.
5. No evaluate/challenge/PATH-authored repair/auto second engineer (Phases 3–7).
6. No remote push on acceptance paths.
7. ICE canonical product not used as Phase 7 engineering target; no ICE engine calls.

---

## Explicit non-claims

- **Not** a claim that PATH Code Foundation Phases 1F–5G or unrelated `docs/reports/PHASE_*` kernel tracks are frozen.
- **Not** authorization to start Model Registry, Astra, Grok, deployment platform, or new engine subsystems.
- **Not** a npm registry publish or git remote push from this closure report.
- **Not** modification of canonical ICE product content beyond Phase 0 recovery state.

---

## Operator sign-off

**Phases 1–7:** OPERATOR VERIFIED / CLOSED (2026-09-27).  
**Accepted Builder runtime:** `2ae7540da76e8d311e64465958d5f6ce03a72c25`.  
**Phase 7 final Dark Mode applied SHA:** `810a63a3b33dc8bdf28c2a14f6aa565126936a4d`.
