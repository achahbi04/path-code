# PATH CODE — PHASE 5D1: ENGINEERING BRAIN INFRASTRUCTURE
## Contract + foundation mapping — provider-neutral proposals, no action authority

**Basis:** `PathCode_Phase5D1_Engineering_Brain_Infrastructure_Cursor_Implementation_FINAL.md` (governing instruction).  
**Branch:** `cursor/phase5d1-engineering-brain`  
**Start HEAD:** `4c0f715f47e38742cac6439b29c66be5d875ff4a` (accepted Phase 5C checkpoint)  
**Main after authorized 5C FF:** `4c0f715f47e38742cac6439b29c66be5d875ff4a`  
**Budget start (UTC):** `2026-09-06T19:40:15Z` · **Deadline:** `2026-09-06T21:10:15Z`

This pass implements a package-internal Engineering Brain facade and bounded invocation controller above the existing provider-neutral `ModelProvider` foundation. The brain supplies untrusted proposal text. It cannot issue edit/process/Validation authorization, authenticate references, or claim that an engineering task succeeded. Gate 1 / Gate 2 / kernel authorization remain separate. No live provider transport, SDK, credentials, network, orchestration, editing, process execution, or persistence.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Consumed concept | Architectural decision |
|---|---|
| `ModelProvider` / `ModelRequest` / `ModelResponse` / `ModelCapabilityDescriptor` / `ModelToolCallProposal` | Reuse as foundation vocabulary. Brain does **not** replace or amend `src/domain/provider.ts`. Controller calls a narrow reviewed adapter `invoke` (data + AbortSignal + correlation), not `ModelProvider.complete` directly — the general port lacks abort, invocation correlation, refusal/incomplete/failure envelopes, and usage provenance required by this profile. |
| `Result` / `success` / `failure` | Reuse `src/domain/result.ts` exactly. |
| Phase 5A `ReasoningProposal` schemaVersion `1` | Requested response profile only. Brain does **not** re-implement the parser; complete text is `UNTRUSTED_RESPONSE_TEXT` for Gate 1. |
| Gate 1 `ReferenceDescriptor` / `ReferenceEvidenceKind` | Brain-local data projection `BrainReferenceDescriptor` / `BrainReferenceEvidenceKind` (`ENTRY` \| `CONTENT` \| `MANIFEST`) — same spelling, no live catalog authority and no production import edge from brain → reasoning (avoids A03 reverse-layer false positive). |
| Gate 1 JSON input ceiling | Align response byte hard ceiling with `MAX_PROPOSAL_JSON_UTF8_BYTES` (65_536). |
| Abort / deadline / usage absent from older `ModelProvider` | Brain-local control + receipt envelope. Missing usage is `UNKNOWN`, never fabricated zero/cost. |
| Normalized brain failures | Local invocation failures only — no new global KnowledgeState / ValidationOutcome / ledger states. |
| Invocation receipt | Telemetry only — not `EvidenceRecord`, authenticity proof, engineering success, or action permission. |
| Provider choice | Fixed by trusted application composition at `createEngineeringBrain`; never selected by model output. |

Preserve all existing ledger states. No independent audit, `PHASE_VERIFIED`, Phase 5D2, or live provider claim.

**BLOCKING_GAP:** none. Abort/usage gaps are covered by brain-local envelopes without domain meaning changes.

---

## Source mapping (pinned to committed owners)

### Domain foundation

| Item | Actual mapping |
|---|---|
| Provider port | `ModelProvider` in `src/domain/provider.ts` — `id`, `capabilities`, `complete(ModelRequest): Promise<ModelResponse>` |
| Capabilities (general) | `ModelCapabilityDescriptor` — `maxContextTokens`, `supportsToolCalling`, `supportsStreaming`, `supportsMultimodal` |
| Tool proposals | `ModelToolCallProposal` — brain profile refuses tool-bearing replies; does not execute tools |
| Result | `Result<T,E>` / `success` / `failure` |

### Reasoning / Gate 1 (consumed by tests; not by brain production)

| Item | Actual mapping |
|---|---|
| Proposal schema | `ReasoningProposalSchemaVersion = 1`; `ReasoningProposal` in `src/reasoning/types.ts` |
| JSON ceiling | `MAX_PROPOSAL_JSON_UTF8_BYTES = 65_536` in `src/reasoning/bounds.ts` |
| Descriptors | `ReferenceDescriptor` / `ReferenceEvidenceKind` (`ENTRY` \| `CONTENT` \| `MANIFEST`) |
| Binding entry | `bindReasoningProposalJson(jsonText, catalog)` — test handoff only |

---

## Internal brain API (`src/brain/`)

```ts
createEngineeringBrain(reviewedAdapter, optionalNarrowingLimits?)
  -> Result<EngineeringBrain, BrainConfigurationFailure>

EngineeringBrain.invoke(request, { signal? }?)
  -> Promise<Result<BrainInvocationSuccess, BrainInvocationFailure>>

EngineeringBrain.dispose()
  -> void

summarizeBrainInvocation(receipt)
  -> BrainInvocationSummary
```

Not on package root (`src/index.ts`). No package subpath.

### Exact adapter / control signatures

```ts
type EngineeringBrainAdapterInvoke = (
  packet: FrozenNormalizedAdapterPacket,
  control: { readonly signal: AbortSignal; readonly invocationId: string },
) => Promise<EngineeringBrainAdapterReply>;

type EngineeringBrainAdapter = {
  readonly descriptor: EngineeringBrainAdapterDescriptor;
  readonly invoke: EngineeringBrainAdapterInvoke;
};
```

**REVIEWED CALLABLE SEAM:** `EngineeringBrainAdapter.invoke`  
Selected by trusted internal composition. Receives normalized data-only packet + cancellation + controller `invocationId`. Returns untrusted text / normalized failure envelopes. No filesystem, process, evidence-issuer, or approval capabilities are passed through arguments. Same-process adapter code is not OS-sandboxed by this interface. Deterministic adapter is test-only; production controller has no fs/net/process/SDK imports. This is not a GAP-058 change and not a blanket future exemption.

### Request profile (V1)

- Purposes: `PROPOSE_REASONING` | `REVISE_REASONING`
- Response profile: `REASONING_PROPOSAL_JSON` / schemaVersion `1`
- Context: copied reference descriptors + ordered blocks (`REFERENCE_MATERIAL` | `DIAGNOSTIC`)
- No `execute`, `approved`, `tools`, authority tokens, endpoints, SDK options, or kernel objects

### Adapter reply union (brain-local wrapper)

Every branch requires exact `invocationId` match:

- `COMPLETE` — nonempty bounded text; no tool calls
- `REFUSAL` — provider refusal
- `INCOMPLETE` — truncated / token-stop / incomplete generation
- `FAILURE` — normalized transport/auth/rate-limit/unavailable/provider failure
- Unexpected tool calls → invocation failure (not usable output)

### Finite limits (brain-local; Phase 4 limits untouched)

| Item | V1 policy |
|---|---|
| Prepared request UTF-8 | ≤262_144 |
| Task text | 1..8_192 nonempty |
| Reference descriptors | 0..128 unique handles |
| Context blocks | 0..32 unique block IDs |
| Block text | ≤32_768 |
| IDs (handle/correlation/provider/model) | ≤128 |
| Relative path metadata | ≤1_024 |
| Refs per block | ≤32; must resolve in packet |
| Response text | default+hard ceiling 65_536 (Gate 1 aligned) |
| Max output tokens | default 2_048; 1..8_192; adapter may narrow |
| Timeout ms | default 60_000; 1..300_000; adapter/app may narrow |
| In-flight per instance | 1; no queue |
| Dispatched calls | default/hard 8; narrowable 1..8 |
| Automatic retries | 0 |

Defaults are not hard ceilings. Omitted fields that exceed a smaller configured ceiling refuse (no silent rewrite).

### Lifecycle / clocks

- Production monotonic clock: owner-private wrapper looking up `globalThis.performance.now` when read; `Date.now()` for wall timestamps only.
- Tests: `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date', 'performance'] })` before controller construction.
- Single-flight reservation is synchronous **before** first await and **before** adapter invocation.
- Dispatch budget consumed immediately before the adapter call (including sync throw).
- Operation-owned child `AbortController`, deadline timer, caller-abort listener; explicit cleanup on every terminal path including normal completion.
- Timeout/cancel/dispose: latch terminal decision **before** abort notification; slot released only when adapter settles (or never dispatched) and this operation still owns the slot.
- Timeout does **not** prove remote work/billing stopped.

### Receipt / usage

- Schema versioned immutable receipt on every entered invocation (including pre-dispatch refusal).
- `abortRequested` ≠ `adapterSettledAtReport`; `NOT_DISPATCHED` when never dispatched.
- Usage: `UNKNOWN` | `REPORTED` | `INVALID` | `TEST_FIXTURE`; no money/prices/account balance.
- No task/source/model output/secrets/raw errors/abort reasons in receipt/summary.

### Adapter obligation matrix (future; not implemented here)

| Future adapter | Must translate | Stays outside |
|---|---|---|
| OpenAI | normalized packet/format/limits → reviewed provider request; response/refusal/incomplete/tool-call/usage → common envelope | gates, fs/process authority, task-completion verdict |
| Gemini | same | same |
| Local / other | same profile or honest unsupported-capability | no parse/gate exemption because local |

---

## Allowed production dependencies

Compatible domain Result/provider **types**, type-only reasoning descriptor types, UTF-8 byte sizing, random IDs, monotonic/wall clocks, cancellation/timers.

Forbidden: fs/path I/O, child_process/worker_threads, fetch/http/net/socket/DNS, provider SDKs, credentials/env reads, gate/evidence/approval minting, editing, execution/Validation/Engineering Run calls, reverse imports into earlier layers.

---

## Architecture evolution

New internal area `src/brain/`. Amend only the exact architecture allowlist that would otherwise block this area; retain positive tests for prohibited operations. Do not widen GAP-058.

Preserve 5A type proofs, 5B binding semantics, 5C acceptance semantics. Phase 5 / runtime orchestration is **not** complete.
