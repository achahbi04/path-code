# PATH CODE — PHASE 5D1 ENGINEERING BRAIN INFRASTRUCTURE REPORT

**Status:** PASS  
**Branch:** `cursor/phase5d1-engineering-brain`  
**Contract:** `docs/passes/PHASE_5D1_ENGINEERING_BRAIN_CONTRACT.md`  
**State line:**

```text
PHASE 5D1 ENGINEERING BRAIN INFRASTRUCTURE IMPLEMENTED — PROVIDER-NEUTRAL — UNTRUSTED OUTPUT — NO LIVE PROVIDER — NO ACTION AUTHORITY
```

---

## 1. Worktree / branch / SHA

| Field | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Start branch | `cursor/phase5c-execution-evidence` |
| Start HEAD | `4c0f715f47e38742cac6439b29c66be5d875ff4a` |
| Working branch | `cursor/phase5d1-engineering-brain` (same worktree; no new worktree) |
| Contract commit | `5353dd4…` |
| Implementation commit (canonical tested) | `268e39307edc25b2882b9e579dfee21582769fbd` |
| Report commit | docs-only after PASS (this file) |
| Phase 5A branch preserved | yes (`cursor/phase5a-reasoning-contracts`) |
| Phase 5B branch preserved | yes (`cursor/phase5b-reference-binding`) |
| Phase 5C branch preserved | yes (`cursor/phase5c-execution-evidence` → `4c0f715…`) |
| Phase 4 branch preserved | yes (`cursor/phase4-execution-core`) |
| Main before authorized 5C FF | `72025ec1b51de140f538248d18ead3c68163d684` |
| Main after authorized 5C FF | `4c0f715f47e38742cac6439b29c66be5d875ff4a` |
| Main after 5D1 | **unchanged** at `4c0f715…` (5D1 runtime **not** merged) |
| Push | none |

Budget: start `2026-09-06T19:40:15Z`; deadline `2026-09-06T21:10:15Z`; canonical check completed `2026-09-06T19:59:09Z`.

Canonical `npm run check` ran against HEAD `268e393…` (implementation). This report commit is docs-only after that PASS.

---

## 2. Phase 5C integration proof

| Check | Result |
|---|---|
| Feature WT clean at `4c0f715…` on `cursor/phase5c-execution-evidence` | yes |
| Main clean at `72025ec…` before FF | yes |
| Common git dir | `/Users/achahbi/Projects/path-code/.git` |
| No merge/rebase/cherry-pick in progress | yes |
| `cursor/phase5d1-engineering-brain` absent before create | yes |
| Main is ancestor of 5C checkpoint | yes |
| Post-gate `7c2e4f0…` → `4c0f715…` | docs-only — only `docs/reports/PHASE_5C_EXECUTION_EVIDENCE_GATE2_REPORT.md` (add + SHA note); both commits edit the same report file |
| Main→5C diff | Gate 2 implementation + contract/tests/owner projections only; no package-export / dependency / ledger / scheduling change |
| Committed 5C evidence | first-attempt PASS 82 files / 800 tests / exit 0 incl. CLI smoke + ledger |
| Authorized FF | `git -C /Users/achahbi/Projects/path-code merge --ff-only 4c0f715…` → main `4c0f715…` |
| New branch | `git switch --no-track -c cursor/phase5d1-engineering-brain 4c0f715…` |

---

## 3. Changed paths

| Path | Role |
|---|---|
| `docs/passes/PHASE_5D1_ENGINEERING_BRAIN_CONTRACT.md` | Governing contract + FOUNDATION COMPATIBILITY + API mapping |
| `src/brain/bounds.ts` | Finite local limits + UTF-8 helpers |
| `src/brain/clock.ts` | Production monotonic (`performance.now` lookup-on-read) + wall clock |
| `src/brain/types.ts` | Request/response/adapter/receipt types; local evidence-kind projection |
| `src/brain/failures.ts` | Local configuration + invocation failures |
| `src/brain/normalize.ts` | Data-only request validation / owned reconstruction |
| `src/brain/receipt.ts` | Immutable receipts + `summarizeBrainInvocation` |
| `src/brain/controller.ts` | `createEngineeringBrain` + invoke/dispose lifecycle |
| `src/brain/index.ts` | Package-internal barrel (not on `src/index.ts`) |
| `tests/brain/fixtures.ts` | Deterministic adapters |
| `tests/brain/brain.test.ts` | D01–D24 runtime proofs + both falsification probes |
| `tests/brain/architecture.test.ts` | Internal allowlist / no I/O / finite exports |
| `tests/brain/type-contracts.ts` | Compile-only D01/D23 non-authority proofs |
| `docs/reports/PHASE_5D1_ENGINEERING_BRAIN_REPORT.md` | This report |

No `package.json` / vitest / dependency / ledger / root-export / Phase 4 limit changes. Scheduling unchanged (`maxWorkers=2`, src-lock-serial preserved).

---

## 4. Actual domain-to-brain mapping and signatures

### Foundation reuse

| Concept | Mapping |
|---|---|
| `ModelProvider` / `ModelRequest` / `ModelResponse` / `ModelCapabilityDescriptor` / `ModelToolCallProposal` | Reused as vocabulary; **not** amended. Controller does **not** call `complete()` — general port lacks abort, invocation correlation, refusal/incomplete/failure envelopes, usage provenance. |
| `Result` / `success` / `failure` | Exact `src/domain/result.ts` |
| ReasoningProposal schema v1 | Requested profile only; **no second parser** |
| Gate 1 descriptors | Local `BrainReferenceEvidenceKind` = `ENTRY` \| `CONTENT` \| `MANIFEST` (same spelling; no brain→reasoning production import) |
| Response byte ceiling | `MAX_RESPONSE_UTF8_BYTES = 65_536` aligned with Gate 1 `MAX_PROPOSAL_JSON_UTF8_BYTES` |

### Exact API

```ts
createEngineeringBrain(reviewedAdapter, optionalNarrowingLimits?)
  -> Result<EngineeringBrain, BrainConfigurationFailure>

EngineeringBrain.invoke(request, { signal? }?)
  -> Promise<Result<BrainInvocationSuccess, BrainInvocationFailure>>

EngineeringBrain.dispose() -> void
EngineeringBrain.describe() -> BrainDescriptorView

summarizeBrainInvocation(receipt) -> BrainInvocationSummary
```

### Adapter / control signatures

```ts
type EngineeringBrainAdapterInvoke = (
  packet: FrozenNormalizedAdapterPacket,
  control: { readonly signal: AbortSignal; readonly invocationId: string },
) => Promise<EngineeringBrainAdapterReply>;

// Reply kinds: COMPLETE | REFUSAL | INCOMPLETE | FAILURE
// Every branch requires exact invocationId match.
```

### REVIEWED CALLABLE SEAM

`EngineeringBrainAdapter.invoke` — selected by trusted composition; receives data + cancellation + correlation only; returns untrusted text / normalized failures. No filesystem/process/evidence-issuer/approval capabilities in arguments. Not a GAP-058 change. Deterministic adapter is test-only; production `src/brain/**` has no fs/net/process/SDK/env imports.

### Supported profile / limits / budget

- Purposes: `PROPOSE_REASONING` \| `REVISE_REASONING`
- Response profile: `REASONING_PROPOSAL_JSON` / schemaVersion `1`
- Defaults vs ceilings: tokens 2048 default / 8192 hard; timeout 60s default / 300s hard; response 65536; prepared request ≤262144; in-flight 1; dispatches default/hard 8; retries 0
- Defaults exceeding a smaller configured ceiling refuse (no silent rewrite)
- Dispatch consumed immediately before adapter call; never restored; pre-dispatch refusals charge 0

---

## 5. Lifecycle / clocks / cancellation

| Fact | Implementation |
|---|---|
| Production monotonic clock | `readMonotonicMs()` looks up `globalThis.performance.now` **when read** |
| Wall timestamps | `Date.now()` only |
| Test fake set | `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })` before controller construction |
| Single-flight | `reserveInFlightSlot` synchronous **before** first await and **before** adapter invoke |
| Dispatch | `consumeDispatchBudget` immediately before `invokeAdapter` |
| Operation-owned | child `AbortController`, deadline timer, caller-abort listener; explicit removal on every terminal path including success |
| Latch-before-abort | terminal decision latched before `childController.abort(safeReason)` |
| Slot release | only when adapter settled (or never dispatched) **and** this operation still owns `inFlight` |
| Timeout meaning | stop waiting for usable answer + request abort; **does not** claim remote work/billing stopped; `abortRequested` ≠ `adapterSettlement` |
| Late results | discarded; no receipt rewrite / Gate 1 / retry / unhandled rejection |

### D13 clock evidence

| Path | Evidence |
|---|---|
| Scheduled timeout | advance virtual time by `timeoutMs`; assert `readMonotonicMs()` delta ≥ timeout; `TIMED_OUT`; `abortRequested`; settlement `PENDING` until adapter settles; single finalization |
| Held deadline callback | spy holds owned `setTimeout` callback; advance same monotonic clock to deadline; resolve otherwise-valid COMPLETE text; completion-side `readMonotonicMs() >= deadline` refuses as `TIMED_OUT` before held callback runs; before-deadline success control; exact-deadline refusal; later held-callback invoke does not rewrite receipt |
| Real-time abort smoke | D13b with ignored-abort adapter + caller abort; generous test timeout |

Controller SHA at PASS: `b0febbfc68a554476c3c652f3fdac79402f54bb9872d4965ca5a9240f5b7b8c6`

---

## 6. Failures / receipts / secrets

Normalized local codes include invalid/limits/capability, disposed/busy/budget, cancelled vs timed out, auth/rate-limit/unavailable/transport, refusal/incomplete/tool-calls/malformed/empty/oversize, adapter exception.

Receipts: schema v1; invocation + correlation IDs; provider/model; bounds; wall + monotonic elapsed; dispatch/attempt/budget; outcome/failureCode; `abortRequested`; settlement `NOT_DISPATCHED` \| `PENDING` \| `SETTLED`; usage `UNKNOWN` \| `REPORTED` \| `INVALID` with provenance `PROVIDER_REPORTED` \| `TEST_FIXTURE` (never money). Missing usage is UNKNOWN, not zero.

Secrets seeded in task/context/output/raw exceptions are absent from receipt/summary JSON; response text returned separately as `UNTRUSTED_RESPONSE_TEXT`.

---

## 7. Deterministic adapter + Gate 1 handoff

- Location: `tests/brain/fixtures.ts` (+ inline adapters in tests)
- Capabilities: complete/refusal/failure/incomplete/tool-call/delay/sync-throw/reject/cooperative abort/ignored abort
- **D21:** `fixtureWithSourceAndManifest` (non-Git Phase 2 snapshot path) → real catalog descriptors → brain COMPLETE ReasoningProposal JSON → caller passes exact text to `bindReasoningProposalJson` → `REFERENCES_ONLY`; fabricated handle and malformed JSON refused by Gate 1; brain does not repair. Real timers; per-test budget **30_000 ms**. No Gate 2 / Engineering Run.

---

## 8. D01–D24 proof map

| ID | Test / mechanism |
|---|---|
| D01 | `D01/D20…` + `tests/brain/type-contracts.ts` foundation types; no reverse imports |
| D02 | `D02/D03…` data-only; control fields; dangling handles; JSON-in-text stays text |
| D03 | same — mutation after capture; accessor refuse without getter invoke; captured method survives caller replace |
| D04 | `D04…` bounds; defaults vs ceilings; no clamp |
| D05 | `D05/D06…` pre-abort/disposed zero dispatch |
| D06 | same — one call; rate-limit no retry |
| D07 | `D07/D08/D09…` exact text + foreign invocationId refuse |
| D08 | same — refusal/incomplete/tools/empty |
| D09 | same — oversize reject |
| D10 | `D10/D19…` sync throw / reject sanitized |
| D11 | `D11…` concurrent + sync re-entry → BUSY; callCount 1 |
| D12 | `D12…` budget=1; identical correlation still counts |
| D13 | `D13…` + `D13b…` both deadline paths + real abort smoke |
| D14 | `D14/D16/D17…` cancel + cleanup |
| D15 | `D15…` ignored abort → BUSY until settle; late discard |
| D16 | covered in D14/D15/D13 races |
| D17 | dispose idempotent |
| D18 | `D18…` UNKNOWN vs reported zero vs INVALID |
| D19 | `D10/D19…` secret absence |
| D20 | `D01/D20…` two named adapters; unsupported capability |
| D21 | `D21…` real Gate 1 handoff (non-Git) |
| D22 | architecture + source import bans; not on package root |
| D23 | `type-contracts.ts` compile-only + runtime malformed |
| D24 | canonical 821/84; timers restored; brains disposed in afterEach |

### Bounded falsifications

| Probe | Weakening | Open evidence | Restore |
|---|---|---|---|
| Budget cap | `if (false && state.dispatchedCount >= state.maxDispatches)` | child vite-node: second dispatch succeeds (`BUDGET_BYPASS_OPEN`); callCount 2 | exact bytes + hash; restored refuses (`BUDGET_BYPASS_RESTORED`) |
| Single-flight order | remove early `reserveInFlightSlot`; place after `invokeAdapter(...)` returns into sync call | child vite-node: nested sync re-entry reaches adapter (`SINGLE_FLIGHT_BYPASS_OPEN`) | exact bytes + hash; restored nested BUSY (`SINGLE_FLIGHT_BYPASS_RESTORED`); independent budget check retained |

Restored controller SHA: `b0febbfc68a554476c3c652f3fdac79402f54bb9872d4965ca5a9240f5b7b8c6`

---

## 9. Verification

| Attempt | Result |
|---|---|
| 1 | **FAIL** — sandbox blocked disposable Git fixture `git init` (`GIT_DISCOVERY_FAILED`); typecheck/build/brain suites already green; 10 files / 55 tests failed (all Git fixtures). Setup fault, not owned brain defect. |
| 2 | **PASS** — exit 0 (unsandboxed operator-approved environment) |

| Stage | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| tests | **84/84 files**, **821/821 tests**, zero required failures/skips |
| cli:smoke | PASS |
| ledger:verify | PASS at `268e39307edc25b2882b9e579dfee21582769fbd` |
| Scheduling | unchanged (`maxWorkers=2`) |
| Duration (vitest) | 119.24s |
| Full `npm run check` wall (attempt 2) | ~138.8s |

### Runtime totals

| Metric | Phase 5C baseline | Final | Delta |
|---|---|---|---|
| Test files | 82 | 84 | +2 (`brain.test.ts`, `architecture.test.ts`) |
| Runtime tests | 800 | 821 | +21 |
| Compile-only proofs | T01–T12 + Gate proofs preserved | + D01/D23 brain type-contracts | compile-only |

`COMMITTED_BYTES_MATCH_TESTED=yes` for load-bearing sources at check HEAD `268e393…`. Report commit is docs-only after that PASS.

---

## 10. Future adapter obligation matrix (not implemented)

| Future adapter | Must translate | Stays outside |
|---|---|---|
| OpenAI | normalized packet/format/limits → reviewed provider request; response/refusal/incomplete/tool-call/usage → common envelope | gates, fs/process authority, task-completion verdict |
| Gemini | same | same |
| Local / other | same profile or honest unsupported-capability | no parse/gate exemption because local |

No live provider, SDK, credentials, network, or billing was exercised.

---

## 11. Honest limitations

- Reviewed adapter code is trusted transport; same-process code is not OS-sandboxed.
- Cancellation is cooperative; sync adapters can block the thread.
- Event-loop deadlines are not hard real-time.
- Receipts are telemetry, not billing, evidence, or authority.
- Complete schema-shaped text remains untrusted; Gate 1/2 and kernel authorization remain separate.
- Timeout/abort does not prove remote work or billing stopped.
- Phase 5 orchestration / 5D2 / live providers are **not** complete.

---

## 12. Final state

- Branch: `cursor/phase5d1-engineering-brain`
- Implementation HEAD: `268e39307edc25b2882b9e579dfee21582769fbd`
- Main: `4c0f715f47e38742cac6439b29c66be5d875ff4a` (accepted Phase 5C checkpoint; unchanged after initial integration)
- Phase 5D1 runtime commits remain on the feature branch only
- No push; no ledger promotion; no invented audit; no Phase 5D2
- Timers restored in tests; brains disposed in afterEach; no competing writers introduced

```text
PHASE 5D1 ENGINEERING BRAIN INFRASTRUCTURE IMPLEMENTED — PROVIDER-NEUTRAL — UNTRUSTED OUTPUT — NO LIVE PROVIDER — NO ACTION AUTHORITY
```
