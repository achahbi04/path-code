# PATH CODE — PHASE 5E1 OPENAI RESPONSES ADAPTER REPORT

**Success line:**  
`PHASE 5E1 OPENAI RESPONSES ADAPTER IMPLEMENTED — LIVE-CAPABLE — NO AUTOMATIC RETRIES — BOUNDED LOCAL DISPATCH/OUTPUT EXPOSURE — EXPLICIT DISCLOSURE — UNTRUSTED OUTPUT — CANONICAL TESTS OFFLINE — LIVE USE SEPARATELY OPT-IN`

---

## 1. Branch / SHA state

| Item | Value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Feature branch | `cursor/phase5e1-openai-adapter` |
| Starting HEAD | `ecf480faff53560133309df36837534a38b7f4cb` |
| Contract commit | `c3dc582` — Record Phase 5E1 OpenAI adapter contract and transport amendment |
| Implementation / tested HEAD | `3c3b8cf10f20c769303e5d83e25a54e9dcc737f1` |
| Report commit | (this docs-only commit; does not change tested load-bearing bytes) |
| Main worktree | `/Users/achahbi/Projects/path-code` |
| Main HEAD (unchanged for 5E1) | `ecf480faff53560133309df36837534a38b7f4cb` |
| Accepted 5D3 integration | FF-only merge of `ecf480f…` into main **before** feature work; main remains at accepted 5D3 |
| 5E1 merged to main? | **No** |

### 5D3 integration proof (pre-branch)

- Main at entry: `8ee7488cddf999f9c3a21dd4f1777cddb908258d`
- Ancestor check: main ⊑ `ecf480f…`
- `0a5827d…` → `ecf480f…`: report-only (`docs/reports/PHASE_5D3_AUTHORIZED_MUTATION_REPORT.md`)
- 5D3 evidence preserved: 90/90 files, 865/865 tests, exit 0 at `0a5827d…` (three-attempt historical sequence recorded; not rewritten)
- `cursor/phase5e1-openai-adapter` did not exist; created `--no-track` from `ecf480f…`
- All earlier phase refs preserved; no new worktree

---

## 2. Files delivered

### Production

| Path | Role |
|---|---|
| `src/adapters/openai/types.ts` | Config / diagnostics / ceilings |
| `src/adapters/openai/profiles.ts` | Fixed instructions + owned native JSON Schemas |
| `src/adapters/openai/request.ts` | PURE packet → Responses body |
| `src/adapters/openai/response.ts` | PURE wire → Brain reply |
| `src/adapters/openai/budget.ts` | Sync admission; no refunds |
| `src/adapters/openai/transport.ts` | **Named** production `fetch` owner |
| `src/adapters/openai/adapter.ts` | `createOpenAIAdapter` composition |
| `src/adapters/openai/index.ts` | Finite package-internal exports |

### Tests / harness / docs

| Path | Role |
|---|---|
| `tests/adapters/openai/*.test.ts` | F01–F30, F32 runtime |
| `tests/adapters/openai/type-contracts.ts` | F31 compile-only |
| `tests/adapters/openai/fixtures.ts` | Recording fetch (no network) |
| `tests/brain/architecture.test.ts` | D22: exempt `src/adapters/**` |
| `scripts/openai-live-smoke.mjs` | Opt-in two-call live harness (**not executed**) |
| `docs/passes/PHASE_5E1_OPENAI_ADAPTER_CONTRACT.md` | Contract + FINAL appendix |
| `docs/passes/PHASE_5E1_OPENAI_TRANSPORT_AMENDMENT_1.md` | Named network owner |
| `docs/reports/PHASE_5E1_OPENAI_ADAPTER_REPORT.md` | This report |

**Unchanged:** `src/brain/**` behavior, orchestrator, gates, mutation semantics, authority, profile definitions, `package.json` / lockfile dependencies (0 runtime deps; 4 prior devDeps).

---

## 3. API / profile / capability mapping

### Constructor

```text
createOpenAIAdapter(modelConfiguration, credential, narrowingLimits?)
  -> Result<OpenAIAdapter (= EngineeringBrainAdapter + describeOpenAIAdapter),
            OpenAIAdapterConfigurationFailure>
```

- No public `fetch` / transport / headers / executor argument
- Captures platform fetch via `capturePlatformFetch()` inside `transport.ts` at construction
- Freezes model id, limits, profiles before any await
- Credential kept in transport closure only

### Brain seam (exact)

| Field | Mapping |
|---|---|
| `descriptor.providerId` | `"openai"` |
| `descriptor.modelId` | host-selected model id |
| `acceptedResponseProfiles` | both `REASONING_PROPOSAL_JSON` v1 and `ENGINEERING_EDIT_PROPOSAL_JSON` v1 |
| `honorsOutputTokenLimit` | `true` |
| `cancellationDeclared` | `true` |
| `nativeSchemaConstrainedGeneration` | `true` |
| `invoke(packet, { signal, invocationId })` | build → admit → one POST → translate → reply |

### Host disclosure / credential permission

Trusted host must decide, **before** composition, whether selected packet disclosure and credential use are permitted (`NETWORK_ACCESS` / `SECRET_ACCESS` ActionClass). The adapter does **not** load repository policy, read `process.env`, or mint authority. Mere key availability / `approved: true` / gate pass does not grant network permission.

---

## 4. Responses URL, request switches, native schemas

| Item | Value |
|---|---|
| Endpoint | `POST https://api.openai.com/v1/responses` (owned constant) |
| `store` / `stream` / `background` | `false` |
| `truncation` | `"disabled"` |
| `tools` | `[]`; `tool_choice: "none"`; `parallel_tool_calls: false` |
| `max_output_tokens` | exact admitted packet limit |
| `text.format` | `{ type: "json_schema", name, schema, strict: true }` |
| `reasoning` | only when host configures `low|medium|high` |
| Absent | Chat Completions `messages`/`n`/`response_format`/`max_tokens`; `previous_response_id`; conversation/file/tools uploads |

### Native schema source mapping

| Schema name | Source fields |
|---|---|
| `pathcode_reasoning_proposal_v1` | ReasoningProposal-v1: root 5 keys; six claim kinds; two evidence ref kinds; INFERRED/UNVERIFIED hypotheses. Canonical subset: always emit `proposedCitations` and UNVERIFIED `supportingClaimIds` arrays (parser-accepted). |
| `pathcode_engineering_edit_proposal_v1` | Edit envelope-v1: `schemaVersion|proposalId|reasoningProposalJson(string)|changes[]` with `REPLACE_TEXT|CREATE_TEXT`. Embedded reasoning string **not** nested-validated. |

Golden request fixtures: `tests/adapters/openai/request.test.ts` F03–F05.

---

## 5. Transport boundary and byte caps

| Cap | Value |
|---|---|
| Request body / attempt | ≤ 1,048,576 B (narrowable) |
| Cumulative request body | ≤ 4,194,304 B |
| Response envelope / attempt | ≤ 1,048,576 B (incremental stream read; Content-Length not sole bound) |
| Proposal text | ≤ 65,536 UTF-8 B ∩ packet ceiling |
| Per-attempt output tokens | packet ≤ model/instance ≤ 8,192 |
| Cumulative reserved output tokens | ≤ 32,768 |
| Attempts / in-flight | 8 / 1 |

**Test boundary:** recording `globalThis.fetch` installed **before** `createOpenAIAdapter`. Real builder, admission, destination assert, header attach, bounded reader, translator all execute. No fake classified-success `send`.

Redirects: `redirect: "error"`; 3xx → `REDIRECT_REJECTED`; Location never followed/echoed.

---

## 6. Reservation / accounting

1. Validate + build body (preflight; zero charge on reject)
2. Check attempts + request bytes + output tokens together; overflow-safe
3. **Synchronously** reserve counters + in-flight **before** await/transport (re-entrant safe)
4. Recheck abort at final admission; reservation **never refunded**
5. `fetchStarted` counted separately; reported usage never replenishes capacity
6. Slot released only after owned cleanup settles; rejected BUSY cannot clear active slot

Units: exact safe integers (attempts, UTF-8/HTTP bytes, requested output tokens). No `bytes/3` token fiction. Missing usage → UNKNOWN; reported zero → REPORTED zero; invalid → INVALID.

---

## 7. Translation table (summary)

| Observation | Envelope |
|---|---|
| `status===completed`, one assistant message, `output_text` parts | COMPLETE (exact join, no separator) |
| Reasoning items before message | Ignored (non-executable) |
| Refusal content / mixture | REFUSAL (fixed reason; no raw prose in telemetry) |
| Tool/function/action (+ text) | FAILURE `UNSUPPORTED_TOOL_OUTPUT` |
| incomplete / queued / in_progress | INCOMPLETE |
| Root error / failed | FAILURE |
| HTTP 401 | AUTHENTICATION |
| HTTP 403 | OTHER + local `HTTP_403_PERMISSION` |
| HTTP 429 quota/spend | RATE_LIMIT + `HTTP_429_QUOTA` |
| Other 429 | RATE_LIMIT + Retry-After info only |
| 408/409 | TRANSPORT |
| 400/404/422 | OTHER request rejected |
| 5xx | UNAVAILABLE |
| 3xx | TRANSPORT redirect policy |
| Abort / network / overflow / bad UTF-8 | TRANSPORT (sanitized) |

All replies use Brain-supplied `invocationId`.

---

## 8. Credential / disclosure / cancellation evidence

| Proof | Test |
|---|---|
| No adapter `process.env` | F30 architecture |
| Ambient env/argv/cwd absent from body | F06 (+ P2) |
| Deliberate context sent unchanged | F07 |
| Key only in Authorization for fixed URL | F26 |
| Key absent from body/descriptor/errors/diagnostics | F26/F22/F27 |
| Foreign destination refused; no credentialed foreign request | F23 (+ P3) |
| Redirects never followed | F23 |
| Pre-abort / mid-await abort: no usable late answer | F24 |
| Brain deadline + fake timers + real-async abort | F25 |
| No console/debug dump path in construction | F26/F30 |

**Non-claims:** `store:false` ≠ Zero Data Retention; account spend alerts ≠ hard stop; hostname pin ≠ control of DNS/TLS/proxy internals; adapter is trusted same-process code, not an OS sandbox.

---

## 9. F01–F32 assertion map

| ID | Evidence |
|---|---|
| F01 | `request.test.ts` construction validation |
| F02 | captured config freeze; arity ≤3 |
| F03 | golden reasoning body + schema |
| F04 | golden edit schema / string field |
| F05 | protected switches; no Chat Completions fields |
| F06 | ambient canaries absent |
| F07 | disclosed context unchanged |
| F08 | oversize before reserve |
| F09 | status/translation matrix + invocationId |
| F10 | reasoning item + exact text join/BOM |
| F11 | tool+text refuse |
| F12 | missing/multi/refusal/pending/error |
| F13 | chunked/overflow/UTF-8/lying CL |
| F14 | usage map; no double-count |
| F15 | cumulative output refuse (+ P1) |
| F16 | single-flight / BUSY |
| F17 | usage never refunds; budget view |
| F18 | error retains reserve; pre-abort zero |
| F19 | 429 one fetch (+ P4) |
| F20 | 408/409/5xx no retry |
| F21 | sanitized transport errors |
| F22/F26 | credential hygiene |
| F23 | destination/redirect (+ P3) |
| F24 | abort paths |
| F25 | Brain + clocks |
| F27 | bounded diagnostics |
| F28 | both profiles via Brain; no Brain/gate edits |
| F29 | Gate 1 + `session.propose` handoffs (45s) |
| F30 | architecture allowlist / deps unchanged |
| F31 | `type-contracts.ts` compile-only |
| F32 | 96 files / 893 tests; live harness not collected |

---

## 10. P1–P4 falsification

Baseline SHA-256 (tested tree `3c3b8cf…`):

| File | SHA-256 |
|---|---|
| `budget.ts` | `eaef96b85b2d55e63e04616537afced5124909fc8435a2fedb1f2efce9baa130` |
| `request.ts` | `645971e9706eb7292bc0837cfc64649e76dffc836abd446d0c44aec10f004212` |
| `transport.ts` | `e13a44f65857954c490f0e0652311c910bd49e1386fc4effb80fc64f8ca5fa0a` |
| `adapter.ts` | `a77e36fb341a93c87b6b560b9616cacde7af69b1ba57d7d7fe151cf5dcea2cae` |

| Probe | Mutation | Observed failure | Restore |
|---|---|---|---|
| **P1** | `wouldExceedCumulativeOutput` → always `false` | F15: fetch count `2≠1` (second admission) | hash match + F15 PASS |
| **P2** | inject `process.env` canary into request body | F06: body contains `AMBIENT_ENV_CANARY_VALUE_7a2f` | hash match + F06 PASS |
| **P3** | `assertAllowedOpenAIDestination` → always `true` | F23 private path: `TRANSPORT_ERROR` instead of `DESTINATION_REJECTED` (foreign fetch attempted against recorder) | hash match + F23 PASS |
| **P4** | retry once after HTTP 429 in transport | F19: second fetch → `TRANSPORT` ≠ `RATE_LIMIT` (two calls) | hash match + F19 PASS |

Independent defenses noted: constructor still pins fixed endpoint when private assert is the only bypassed check; attempt/byte caps untouched for P1/P4.

---

## 11. Canonical attempts

| # | SHA | Result | Cause |
|---|---|---|---|
| 1 | `3c3b8cf…` | **FAIL** exit 1 | Sandbox-denied disposable `git init` (`GIT_DISCOVERY_FAILED`) — 55 git/integration fixture failures; **not** adapter defects. 86 files otherwise green; openai suite already focused-green. |
| 2 | `3c3b8cf…` | **PASS** exit 0 | Same candidate after resolving setup fault (`required_permissions: all`). No source correction. |

### Attempt 2 totals

| Stage | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| tests | **96/96 files**, **893/893 tests**, zero required failures/skips |
| cli:smoke | PASS |
| ledger:verify | PASS at `3c3b8cf10f20c769303e5d83e25a54e9dcc737f1` |

**Baseline delta:** 90→96 files (+6 openai suites); 865→893 tests (+28). Compile-only `type-contracts.ts` counted via typecheck, not runtime.

Attempt 3 unused.

---

## 12. Live smoke — NOT RUN

```text
DETERMINISTIC_GATE: PASS
LIVE_SMOKE: NOT_RUN_REQUIRES_OPERATOR_AUTHORIZATION
```

### Prerequisites (ALL required)

1. Explicit `--confirm-network`
2. `PATHCODE_LIVE_OPENAI=1`
3. `PATHCODE_OPENAI_MODEL=<reviewed-model-id>` (no fallback)
4. `OPENAI_API_KEY` present (never printed)
5. Prior `npm run build` so `dist/adapters/openai/**` exists
6. Operator confirms current model pricing/access and account hard limits separately

### Exact command (operator authorization only — **do not run in this assignment**)

```bash
PATHCODE_LIVE_OPENAI=1 \
PATHCODE_OPENAI_MODEL='<reviewed-model-id>' \
OPENAI_API_KEY='<key>' \
node scripts/openai-live-smoke.mjs --confirm-network
```

Limits: 2 attempts; 2048 tokens/call (4096 total); 65536 request bytes/call (131072 total); Brain deadline ≤60000 ms. Two synthetic fixtures only. Stop on first failure. No approve/apply/commit. No key/output excerpts on stdout.

---

## 13. Known limitations

- Live interoperability for a specific model is **not** established by this dispatch
- Provider retention/abuse monitoring may still apply despite `store:false`
- Spend-limit enforcement can lag; local counters are independent
- Native schemas guide format only; Gate 1 / envelope parsers remain authoritative
- 5E2 Gemini is out of scope

---

## 14. Final states

| Tree | Branch | HEAD |
|---|---|---|
| Feature worktree | `cursor/phase5e1-openai-adapter` | `3c3b8cf…` (+ report commit) |
| Main | `main` | `ecf480f…` (accepted 5D3 only) |

Clean task-owned residue: probes restored; mocks uninstalled; no live credentials inspected; no push; no phase promotion; no 5E2.

**Tested load-bearing byte equality:** implementation commit `3c3b8cf…` is the canonical-tested tree; subsequent report commit is documentation-only.
