# PATH CODE — PHASE 3-R2-H1
# COMPLETE PUBLIC PARAMETER-GRAPH TRAVERSAL REPORT

Starting HEAD: `c60c78254ce273235921694faac57ec5e4a30d5f`

Governing contract: `docs/passes/PHASE_3_R2_H1_PARAMETER_GRAPH_TRAVERSAL_CONTRACT.md`
(SHA-256 `989950f0b2541182d789a228527e6ae8174f5dab88a1237461d98646ab3c6e58`)

---

## §0 — Stage 0 finding record

### F-R1-003 as established at c60c782

Independent re-audit result at c60c782:

> **Result:** PHASE 3 SAFE EDITING — RE-AUDIT R1 NOT COMPLETE

Finding F-R1-003: the derived walker enumerates every public parameter but
traverses only `options`-shaped ones. The F-R1-001 corruption class still
escapes on any other public parameter.

Exact traversal gate at HEAD
`tests/architecture/public-authority-surface-analyzer.ts:858–861` (matches
auditor lines 858–861):

```ts
const deepInspect =
  parameterName === "options" ||
  /Options$/.test(typeName) ||
  hasUserDefinedCallSignatures(paramType);
```

Baseline derived public parameter roots: **28**. Of those, only the **4** whose
names satisfy the gate receive recursive member-graph traversal
(`AuthorizePreparedChangeOptions`, `CreateFileOptions`,
`ExecuteMultiFilePlanOptions`, `ReplaceExistingFileOptions`). The other **24**
roots appear as bare manifest rows with empty `memberPath` and are never opened.

Auditor live escape (A-F19 (c)) at c60c782 — adversarially named:

```ts
export type NovelPublishSettings = {
  readonly note?: string;
  readonly authorityOps?: { readonly issue: (input: unknown) => unknown };
};
export function novelPublishSomething(input?: NovelPublishSettings): void { void input; }
```

Canonical analyzer result:

```
FINDINGS (0):
[]
novelPublishSomething sig0 p0 input: NovelPublishSettings | typePath=NovelPublishSettings | member=
```

Standing guard reported zero findings. Discovery occurred; traversal did not.

### Why R2's 2-F2 did not catch it

2-F2's fixture used `FutureMutateOptions` with parameter name `options`. That
shape satisfies the naming gate it was meant to stress. The falsification tested
*through* the hole rather than *at* it.

### WorkspaceBoundary.canonicalize tension

The R2 analyzer comment (lines 853–857) and R2 report design section excluded
positional earned opaques so that `WorkspaceBoundary.canonicalize` — a
user-defined call signature reachable from prepare/create/replace paths —
would not fail contracted 2-F5 positive controls. The frozen census classifies
`workspace` as `CALLER_NARROWING_BOUND`, so `canonicalize` is a reviewed surface
and is not itself claimed as a leak. The defect is that the tension was resolved
by silently narrowing the walk rather than STOP AND REPORT.

### Exact R2 contract clauses contradicted

1. `docs/passes/PHASE_3_R2_PUBLIC_SURFACE_GUARD_CORRECTION_CONTRACT.md` §1.2 —
   for each parameter, traverse the recursively reachable project-defined type
   graph (not "for each options parameter").
2. §1.2 — discovery must not use type-name list or filename convention; the
   coverage decision used `/Options$/` and the literal parameter name `"options"`.
3. §1.2 / §1.4 — if a case cannot be classified from frozen text, STOP AND
   REPORT origin CONTRACT or FOUNDATION. The WorkspaceBoundary.canonicalize case
   was that situation; the implemented response was silent narrowing.

### Fail-open vs fail-closed list principle

A list that decides WHAT TO SKIP is fail-open: anything not on it is invisible.
A list that decides WHAT IS REVIEWED-SAFE is fail-closed: anything not on it is
inspected and rejected if dangerous. R2's naming gate was the first kind. This
pass permits only the second kind, keyed by resolved type identity.

### Origin

- Primary: IMPLEMENTATION — contract required unconditional project-graph
  traversal; implementation gated it on names and did not STOP AND REPORT.
- Contributing: EVIDENCE — 2-F2 fixture was shaped to pass the gate.

### Auditor npm run check observations (verbatim from R1 report §9)

| Gate | Result |
|---|---|
| `npm run check` attempt 1 | **FAIL** — exit 1, `Test Files 7 failed \| 58 passed (65)`, `Tests 16 failed \| 603 passed (619)`, real 243.75 s |
| `npm run check` attempt 2 | **FAIL** — exit 1, `Test Files 1 failed \| 64 passed (65)`, `Tests 1 failed \| 618 passed (619)`, real 158.97 s |
| `npm run check` attempt 3 | **PASS** — exit 0, `Test Files 65 passed (65)`, `Tests 619 passed (619)`, real 131.58 s |
| `npm run check` attempt 4 (pre-commit gate, report present) | **FAIL** — exit 1, `Test Files 9 failed \| 56 passed (65)`, `Tests 23 failed \| 596 passed (619)`, real 308.77 s; all 23 are wall-clock timeouts, zero assertion failures |

Attempt 1 failed 16 tests across 7 files; every failure was a wall-clock timeout;
no assertion failed. Includes
`tests/architecture/public-authority-surface-derived.test.ts > 2-F6 — approved exception model`
— `Test timed out in 60000ms` (observed 70 689 ms; file as a whole 148 045 ms).

Attempt 4 at host load average **26.14 / 30.56 / 25.89** failed **23** tests
across **9** files; `grep -c "Test timed out"` returned **46**; zero assertion
failures.

Isolation control: all five timing-suspect files together —
`Test Files 5 passed (5)`, `Tests 52 passed (52)`, 12.35 s, exit 0.

R2-exclusion control: full vitest with both R2 architecture files excluded still
failed **4** tests (all timeouts). R2 Program-loading path is not the sole cause.

Three of four full check attempts failed. Exact runtime total at audited
checkpoint: **619**.

### Stage 0 ledger actions

- GAP-057 reopened: lifecycle CLOSED → OPEN. Prior closure at
  `4aadb06047173b09cfceee542f140ad6fce7b06f` /
  `docs/reports/PHASE_3_R2_CORRECTION_REPORT.md` preserved in notes as immutable
  historical evidence proven insufficient by c60c782. closedByCommit and
  closureEvidence removed. Reattached to `safe-editing.knownLimitations` and
  `edit-contracts.knownLimitations`. F-R1-003 is not assigned a duplicate gap.
- GAP-059 recorded as OPEN NON_BLOCKING_LIMITATION after verifying the ID was
  unused and no existing canonical gap already represented the broader
  full-suite timeout condition (GAP-016 covers only Fixed-Git timeout
  falsification absence; census/hardening two-file flake is narrower and not a
  Gap Ledger record of this extent). Not attached to any capability.
- No component capability downgraded. safe-editing remains IMPLEMENTED.
- GAP-058 remains OPEN and unattached; not implemented here.

### Baseline capability derivation (verified)

| Capability | Derived state |
|---|---|
| edit-contracts | PASS_FROZEN |
| existing-file-replacement | PASS_FROZEN |
| safe-file-creation | PASS_FROZEN |
| multi-file-coordination | PASS_FROZEN |
| safe-editing | IMPLEMENTED |
| repository-intelligence | PHASE_VERIFIED |
| foundation-kernel | PHASE_VERIFIED |

Baseline runtime total: **619**. Phase 4 absent.

Foundation compatibility preflight: all concepts MAPS_TO_EXISTING; no amendment
required.

---

## §1 — Stage 1 implementation evidence

*(Completed in Stage 1 commit. This section is filled before Stage 1 commits and
is not rewritten in Stage 2.)*

### 1.1 Pre-correction reproduction

*(pending Stage 1)*

### 1.2–1.6 Analyzer design

*(pending Stage 1)*

### Disposition manifest

*(pending Stage 1)*

### Reviewed terminal registry

*(pending Stage 1)*

### H1-F1 … H1-F7

*(pending Stage 1)*

### Validation gate

*(pending Stage 1)*

### NOT VALIDATED

- the correction is not independently audited here; a fresh executor re-runs
  R1 Stage 3 in full
- package-root callable-surface coverage not implemented (GAP-058)
- full-suite timing instability recorded, not corrected (GAP-059)
- hostile casts and cast-read forms remain the runtime P4 layer's
  responsibility (GAP-005, F-R1-002)
- auditor independence ASSERTED, not mechanically proven (GAP-055)
- the reviewed terminal registry is a reviewed allowlist; its safety rests on
  each entry's cited reason and falsification, not on the walker
- the false statement in hardening report §9 remains in that immutable report
- single host; no live Windows validation (GAP-002)
- residual filesystem races remain (GAP-035/036/037/044/045)
- no rollback, no delete, no directory creation
- Foundation §10 audit not run; Phase 4 absent
- a guard that traverses every declared public graph is not a proof that no
  authority can leak; it is a proof that every declared public graph is
  inspected
