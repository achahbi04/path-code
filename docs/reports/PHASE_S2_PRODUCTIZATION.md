# PATH CODE — S2
# REAL-PROJECT WORKFLOW PRODUCTIZATION

**S2 RESULT:** **FROZEN / OPERATOR ACCEPTED**  
**S2 / S2.3 freeze tip:** _(set in tip-record commit to the freeze SHA)_  
**S2.3 tip record:** _(follows freeze commit)_  

**S2.3 — Installed-product completion:** **FROZEN / OPERATOR ACCEPTED** (Cursor verification PASS; operator procedure below)  
**S2.2 freeze tip:** `70fdfe14120dfeb3bb45c7f6b98ec13018438868`  
**S2.2 tip record:** `0cc5f2764e8e866a0902c2c1d9d562a8af3e5559`  
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
- **S2.3** Cursor installed-product verification PASS — operator acceptance procedure [`g10-evidence/s2/s23-operator-acceptance.md`](./g10-evidence/s2/s23-operator-acceptance.md)

**Published releases:** UNCHANGED  
**Publication performed:** NO

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

Tip `70fdfe14…`. Discard + `/pr` + title/ANSI repairs. See prior section history in git.

---

## S2.3 — Installed-product completion (FROZEN)

**Goal:** prove the packed/installed `pathcode` is the complete PATH Code product — install → real project → engineer → exit → reopen — with no development-worktree dependency.

### What changed
- Command discoverability: `/help`, welcome, and idle home list the accepted S2 surface including `/attach`
- `/attach [taskId]` reuses existing Gateway attach for still-running external-Gateway tasks (not S4 crash recovery)
- `pathcode doctor` reports **Install** package root so operators can confirm they are not on a worktree symlink
- Gateway client exposes `listTasks()` beside `attachTask()`

### Proof (Cursor executed on packed install)
Evidence: [`g10-evidence/s2/s23-installed-product-proof.json`](./g10-evidence/s2/s23-installed-product-proof.json)

| Claim | Result |
|---|---|
| Isolated `npm pack` + `npm install -g` | PASS — bin under `node_modules/path-code`, not checkout |
| Doctor Install identity | PASS — package root in prefix |
| `cd Klarapp && pathcode` identity | PASS |
| Help discoverability | PASS — history/report/inspect/merge/discard/pr/prefs/model/autonomy/attach/exit |
| Parity matrix (S1+S2 in tarball; `gc1` deferred) | PASS |
| Prefs survive process restart | PASS |
| History/report/inspect survive restart | PASS |
| Gateway attach continuity (fake engine) | PASS |
| Live engineering via installed Gateway on Klarapp | PASS — durable commit + report (`S2_3_INSTALLED_PRODUCT.md`); classification `NOT_VERIFIED` only because Klarapp has no validation candidates |
| Reopen persistence after live task | PASS |

### Explicitly out of S2.3 / remaining deferred
- `gc1` in tarball — DEFERRED (intentional)
- S3 Cursor SDK / engine adapters / model ranking — NOT STARTED
- S4 crash/reboot recovery — NOT STARTED
- Studio / Build / org features — OUT OF S2

### Focused tests
- `tests/s2/installed-product.test.ts` — help/welcome/idle discovery, doctor Install, listTasks
- Existing `tests/s2/*` + `tests/general-session/cli.test.ts` welcome update

### Operator acceptance
[`g10-evidence/s2/s23-operator-acceptance.md`](./g10-evidence/s2/s23-operator-acceptance.md)

---

## Verification

- Packaging gate: `packaging-gate.json` `ok: true` (S2 entry)
- S2.3 installed-product: `s23-installed-product-proof.json` `ok: true`
- Focused: `s23-focused-tests.txt`
- Canonical: `s23-canonical-check.txt`
