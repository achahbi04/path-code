# PATH CODE — PHASE 5E1: OPENAI RESPONSES ADAPTER CONTRACT

**Governing instruction:** `PathCode_Phase5E1_OpenAI_Responses_Adapter_Cursor_Implementation_FINAL.md` (supersedes advisory `PathCode_Phase5E1_Live_OpenAI_Adapter_CONTRACT.md`).

**Implementer scope:** one live-capable OpenAI Responses adapter against the existing `EngineeringBrainAdapter` contract and both application profiles. No Brain/orchestrator/gate/mutation/authority changes. No SDK. No live billable call in this assignment.

---

## FOUNDATION COMPATIBILITY PREFLIGHT

| Subject | Status | Note |
|---|---|---|
| `EngineeringBrainAdapter` / reply union / control | `MAPS_TO_EXISTING` | Exact kinds COMPLETE/REFUSAL/INCOMPLETE/FAILURE; failureClass AUTHENTICATION\|RATE_LIMIT\|UNAVAILABLE\|TRANSPORT\|OTHER |
| `REASONING_PROPOSAL_JSON` v1 + `ENGINEERING_EDIT_PROPOSAL_JSON` v1 | `MAPS_TO_EXISTING` | Both advertised; native schemas owned by adapter |
| Gate 1 `bindReasoningProposalJson` / edit `parseEditProposalEnvelope` | `MAPS_TO_EXISTING` | Consumers unchanged; adapter returns untrusted text only |
| Mutation `session.propose` | `MAPS_TO_EXISTING` | Handoff tests only; no approval/apply |
| Named HTTPS production owner | `AMENDMENT_REQUIRED` | New `src/adapters/openai/transport.ts`; see `PHASE_5E1_OPENAI_TRANSPORT_AMENDMENT_1.md` |
| Brain reverse-import exemption for adapters | `AMENDMENT_REQUIRED` | Adapters may import brain helpers/types (type-only for profiles/packet) |
| Architecture named allowances | `AMENDMENT_REQUIRED` | Focused adapter architecture suite + narrow D22 exemption |
| Result / ActionClass host composition | `MAPS_TO_EXISTING` | Host must check NETWORK_ACCESS / SECRET_ACCESS before composition; adapter does not load policy |
| Package root / Brain barrel exports | `NOT_APPLICABLE` | No root/subpath/Brain export of concrete adapter |
| Live smoke in canonical collection | `NOT_APPLICABLE` | Standalone script only; not collected by Vitest/`npm run check` |
| Gemini / provider router / Chat Completions | `NOT_APPLICABLE` | Out of scope |
| Essential port incompatibility | `BLOCKING_GAP` | None identified at mapping time; report precisely if discovered |

---

## Actual API / source map

### Adapter seam (`src/brain/types.ts`)

```text
EngineeringBrainAdapter = {
  descriptor: EngineeringBrainAdapterDescriptor
  invoke(packet: FrozenNormalizedAdapterPacket, control: { signal, invocationId })
    -> Promise<EngineeringBrainAdapterReply>
}
```

Packet (all required after normalize): `invocationId`, `correlationId`, `purpose`, `taskText`, `context.{references,blocks}`, `responseProfile`, `maxOutputTokens`, `maxResponseUtf8Bytes`, `preparedRequestUtf8Bytes`.

Reply kinds: COMPLETE (exact `text`), REFUSAL, INCOMPLETE, FAILURE (`failureClass` + optional `retryAfterMs` / usage / providerRequestId).

Usage: `AdapterUsageReport` with optional `inputTokens`/`outputTokens`/`cacheTokens` and `provenance: "PROVIDER_REPORTED" | "TEST_FIXTURE"`.

### Profiles

| Profile | Constant | Consumer |
|---|---|---|
| `{ kind: "REASONING_PROPOSAL_JSON", schemaVersion: 1 }` | `REASONING_PROPOSAL_SCHEMA_VERSION` | Gate 1 binder |
| `{ kind: "ENGINEERING_EDIT_PROPOSAL_JSON", schemaVersion: 1 }` | `ENGINEERING_EDIT_PROPOSAL_SCHEMA_VERSION` | Mutation envelope → embedded string → Gate 1 |

### Native schema sources (owned; not runtime parsers)

**ReasoningProposal-v1** (`src/reasoning/types.ts` + `parse.ts`): root `schemaVersion|proposalId|requestedOutcome|claims|hypotheses`; six claim kinds EXISTS/CONTENT/DEPENDS_DECLARED/CONTAINS/DEFINES/BEHAVES; evidence `EVIDENCE_ID` \| `REPOSITORY_RELATIVE_PATH`; hypotheses INFERRED (required supportingClaimIds) \| UNVERIFIED (canonical subset always emits supportingClaimIds array).

**Edit envelope-v1** (`src/orchestrator/mutation/envelope.ts`): root `schemaVersion|proposalId|reasoningProposalJson|changes`; change `changeId|kind|targetId|supportingClaimIds|afterText`; kind REPLACE_TEXT\|CREATE_TEXT; `reasoningProposalJson` is a **string**.

### Trusted host composition

| Responsibility | Owner |
|---|---|
| Choose model / credential / disclosure / local narrowing | Trusted host |
| NETWORK_ACCESS / SECRET_ACCESS ActionClass | Host policy before construction (adapter does not load repository policy) |
| API key material | Host → constructor; never env inside `src/adapters/openai/**` |
| Packet contents disclosed on the wire | Host-selected task/context/descriptor only |

### Local counters (adapter instance)

| Quantity | Default / hard ceiling |
|---|---|
| Reserved transport attempts | 8 |
| In-flight | 1 |
| HTTP request body / attempt | 1,048,576 B |
| Cumulative request body | 4,194,304 B |
| Requested output tokens / attempt | packet limit ≤ 8,192 |
| Cumulative reserved output tokens | 32,768 |
| HTTP response envelope / attempt | 1,048,576 B |
| Decoded proposal text | ≤ 65,536 UTF-8 B and packet ceiling |
| Retries / refunds | 0 |

### Named production network boundary

`src/adapters/openai/transport.ts` — sole production `fetch` owner for this pass. Fixed `POST https://api.openai.com/v1/responses`; `redirect: "error"`; no env/credential discovery.

### Constructor

```text
createOpenAIAdapter(modelConfiguration, credential, narrowingLimits?)
  -> Result<EngineeringBrainAdapter & diagnostics, OpenAIAdapterConfigurationFailure>
```

No public fetch/transport/header override. Capture `globalThis.fetch` at construction (tests stub before create). Own/freeze non-secret config before awaits.

---

## Governing decisions (FINAL)

- Responses API, not Chat Completions
- Pure request builder + pure response translator
- Platform `fetch`; no new dependency
- Exact counters; reported usage never refunds admission
- Fixed endpoint; reject all redirects
- Host-supplied credential; no `process.env` under adapter
- Two owned native JSON Schemas; gates remain authoritative
- Live smoke built but NOT executed in this assignment
- At most three canonical attempts

---

## Architecture evolution

See `docs/passes/PHASE_5E1_OPENAI_TRANSPORT_AMENDMENT_1.md`.


---

## Appendix: Governing FINAL instruction (verbatim)

# PATH CODE — PHASE 5E1: OPENAI RESPONSES ADAPTER
## FINAL — live-capable intelligence transport; deterministic verification; explicit disclosure; no new engineering authority

**Implementer:** one fresh normal Cursor desktop Agent. No Claude Code, subagents, parallel writers, or autonomous follow-on work.

**Dispatch revision:** this file supersedes the supplied `PathCode_Phase5E1_Live_OpenAI_Adapter_CONTRACT.md`. The supplied draft was advisory input, not a governing contract already adopted. Do not combine its contradictory requirements with this file.

**Live-call authorization:** this assignment authorizes implementation and deterministic testing, NOT use of the operator's API credits. Build the opt-in smoke harness, but do not execute it or inspect real credentials in this assignment. Return the exact two-call procedure for subsequent explicit operator authorization. This does not prevent completing a real, live-capable adapter now.

| Item | Required value |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Starting branch | `cursor/phase5d3-authorized-mutation` |
| Starting HEAD | `ecf480faff53560133309df36837534a38b7f4cb` |
| Canonical tested 5D3 implementation | `0a5827d32cd112815b3f2f4d73e814c516940c89` |
| New branch in this SAME worktree | `cursor/phase5e1-openai-adapter` |
| Main worktree | `/Users/achahbi/Projects/path-code` |
| Expected main at entry | `8ee7488cddf999f9c3a21dd4f1777cddb908258d` |
| Reported baseline | 90 runtime-test files / 865 runtime tests; compile-only proofs counted separately |

## 1. Deliver this capability, not another framework

Implement one OpenAI adapter satisfying the ACTUAL existing `EngineeringBrainAdapter` contract and supporting both existing application profiles:

- `REASONING_PROPOSAL_JSON`, schema version 1;
- `ENGINEERING_EDIT_PROPOSAL_JSON`, schema version 1.

```text
trusted host chooses model, credential, disclosure, and local limits
    -> existing EngineeringBrain
    -> OpenAI adapter: pure request builder
    -> one budget-admitted HTTPS POST to the Responses API
    -> bounded raw response reading + pure response translation
    -> existing COMPLETE / REFUSAL / INCOMPLETE / FAILURE envelope
    -> existing Brain returns untrusted text / invocation failure
    -> trusted caller uses the existing Gate 1 or mutation consumer
```

Do not build another Brain, provider protocol, request queue, orchestrator, editor, validator, gate, tokenizer, billing engine, general HTTP client, secret scanner, or provider router. No Gemini implementation, automatic fallback, streamed application interface, tools, uploads, embeddings, batch requests, server-side conversation management, background response polling, or autonomous code-correction/Git loop.

The existing system already has timing- and environment-sensitive local tests. Do not call its entire history perfectly deterministic, free, or failure-proof. The relevant invariant here is narrower: **no canonical test depends on a real external provider or real credentials, and all new adapter tests use controlled in-process transport responses.**

### Decisions adopted and corrected from the advisory draft

| Subject | Final decision |
|---|---|
| Request and response separation | Keep pure request construction and pure response translation |
| API family | Use **Responses**, not a Chat Completions `choices`/`finish_reason` protocol |
| HTTP implementation | Installed Node platform `fetch`; no new SDK/dependency for this small, foreground, one-endpoint surface |
| Dependency rationale | A scoped engineering choice, not a claim that SDKs inherently invalidate evidence |
| Local spend exposure | Exact request/byte counters and reserved requested-output ceilings; no `bytes / 3` token estimate or exact-currency claim |
| Reported usage | Separate telemetry; never refunds or replenishes admission capacity |
| Destination | Fixed public OpenAI Responses endpoint; no configurable arbitrary base URL; reject every redirect |
| Credentials | Supplied by trusted host at construction; no environment reads inside `src/adapters/openai/**` |
| Test seam | Substitute the lowest fetch boundary in tests while exercising the REAL transport, not a fake `send` that bypasses its checks |
| Structured generation | Two owned native JSON Schemas matching the existing consumers; gates remain authoritative |
| Live smoke | Separate script, absent from canonical collection; no live run authorized by this dispatch |
| Canonical attempts | At most three, within the elapsed budget, each retry after a named causal correction or resolved setup fault |
| Gemini neutrality | Reuse application semantics and port; provider-specific implementation/details need not be identical |

These are explicit architectural decisions in this FINAL, not assertions that the advisory draft or current source already implemented them.

## 2. Verify state, integrate accepted 5D3, and branch once

Use explicit working directories. Verify both roots, branches, full HEADs, clean tracked/untracked state, one common Git directory, and no unfinished merge/rebase/cherry-pick. Check for competing writers or source-mutating probes in these worktrees. Stop on a mismatch; never reset, stash, discard another actor's work, overwrite a branch, or kill an unknown process.

Before changing main:

1. Confirm main is an ancestor of `ecf480faff53560133309df36837534a38b7f4cb`.
2. Inspect every commit and the endpoint diff from tested `0a5827d32cd112815b3f2f4d73e814c516940c89` to final `ecf480faff53560133309df36837534a38b7f4cb`. Require informational report-only changes. Expected path: `docs/reports/PHASE_5D3_AUTHORIZED_MUTATION_REPORT.md`. Source/tests/config/scripts/lockfile/ledgers and other load-bearing inputs must be unchanged. A `docs/` prefix is not a blanket exemption for new governing instructions.
3. Compare the main-to-5D3 change list with the actual report: mutation session, Brain edit profile, directory catalog/snapshot amendments, internal editing projection, tests and named architecture allowances. Record any unexplained difference; do not silently approve or repair it.
4. Confirm the committed 5D3 evidence records 90/90 files, 865/865 tests, actual exit 0 and all pipeline stages at `0a5827d...`. Preserve both failures and the three-attempt sequence. The already accepted forward-development decision does not retroactively authorize that third attempt under the former two-attempt limit.
5. Require `refs/heads/cursor/phase5e1-openai-adapter` not to exist.

No pre-change canonical rerun or historical audit. After those checks, this package authorizes:

```bash
git -C /Users/achahbi/Projects/path-code merge --ff-only ecf480faff53560133309df36837534a38b7f4cb
```

Require main clean at that exact commit. In the active feature worktree:

```bash
git switch --no-track -c cursor/phase5e1-openai-adapter ecf480faff53560133309df36837534a38b7f4cb
```

Reverify root/branch/HEAD/clean state. Preserve all earlier phase refs. No new worktree, installation, shared Git configuration change, rebase, push, or remote creation. **Main stays at accepted 5D3 for the remainder of this assignment.** New adapter code stays on its feature branch.

## 3. Read the actual contracts; keep earlier owners unchanged

Before dependent implementation, inspect only the actual declarations/call paths needed for:

- `src/brain/**`: exact adapter packet, capability descriptor, control, reply union, failure/usage fields, invocation limits, immutable capture and late-settlement semantics;
- the actual ReasoningProposal-v1 and edit-envelope-v1 schemas/parsers, including optional fields, all six claim variants, supported reference alternatives and the exact embedded `reasoningProposalJson` string;
- profile selection added in 5D3 and the test-only deterministic adapters;
- existing Result and network/secret-related ActionClass vocabulary, where applicable to trusted host composition;
- package exports, build scripts, installed Node/Vitest behavior, network/import boundaries and directly affected architecture tests.

The architect has the supplied reports/contracts, not a live checkout of the current source. Pin real API spellings locally; do not replace established meanings to make this package fit. Do not reread the full project history.

Create `docs/passes/PHASE_5E1_OPENAI_ADAPTER_CONTRACT.md` before implementation, containing this instruction and a compact actual API/source map. Include `FOUNDATION COMPATIBILITY PREFLIGHT` using exactly `MAPS_TO_EXISTING`, `AMENDMENT_REQUIRED`, `NOT_APPLICABLE`, `BLOCKING_GAP`.

Record only relevant mappings: adapter/reply/control/usage; both profiles; trusted disclosure and credential composition; local counters; named production network boundary; and architecture evolution. Inspect rather than assert that no environment/network use has ever existed elsewhere in the repository.

Create `docs/passes/PHASE_5E1_OPENAI_TRANSPORT_AMENDMENT_1.md` for the new named network owner and affected architecture tests. It is part of this pass, not an extra audit. Earlier no-network promises remain true for the Brain, gates, mutation and orchestrator modules. A network primitive in the concrete adapter is an explicit new owner, not an exception for every future adapter.

**Preserve `src/brain/**`, `src/domain/**`, Gate 1, Gate 2, Validation, editing, and orchestrator production behavior.** No provider-specific fields in those consumers. A transport incompatibility is diagnosed locally first; do not silently change the Brain envelope or claim capability that was not provided. An actual essential port incompatibility is reported precisely, not worked around with a second protocol.

## 4. Concrete scope and constructor

Preferred responsibility layout (combine trivial files when clearer):

```text
src/adapters/openai/
    types.ts             adapter-local configuration/result views
    profiles.ts          fixed profile instructions + native output schemas
    request.ts           PURE packet/config -> owned HTTP body
    response.ts          PURE bounded wire response + local correlation -> reply
    budget.ts            bounded private admission state, no I/O
    transport.ts         ONLY production network owner
    adapter.ts           constructor + composition + per-instance ownership
    index.ts             finite package-internal export list

tests/adapters/openai/   real transport with recording fetch fixtures
scripts/openai-live-smoke.mjs   separate, explicitly armed harness
```

Implement responsibilities equivalent to:

```text
createOpenAIAdapter(modelConfiguration, credential, narrowingLimits?)
    -> Result<an object implementing EngineeringBrainAdapter,
              OpenAIAdapterConfigurationFailure>
```

A safe read-only adapter diagnostics/budget view is allowed on a separate method or helper. Match existing naming conventions; do not change the Brain interface. No public constructor argument for `fetch`, `transport`, executor, raw headers, serializer, gate, tokenizer or arbitrary operation bag. No root export, subpath, or concrete-adapter export from the Brain barrel.

The supported constructor binds the real transport internally. Capture the selected configuration and method identities; own/freeze copied data before awaits. Reading mutable caller configuration later must not change endpoint/model/profiles/limits.

The trusted host chooses whether to compose and invoke this network adapter. That decision includes permission to disclose the selected packet and use the specified credential. Mere key availability, model output, `approved: true` in JSON, or a passing gate does not grant network/action permission. This pass adds no general policy engine or provider-controlled authorization. Document where the existing application's network/secret restrictions must be checked at composition; do not claim the adapter loaded repository policy when it did not.

Adapter transport code is trusted same-process application code. The input/output boundaries and tests are not an OS sandbox against hostile host code, a monkey-patched runtime, or a malicious proxy/DNS/TLS environment.

## 5. Pinned API and model configuration

**API:** foreground, non-streaming `POST https://api.openai.com/v1/responses`.

The URI is an owned constant, not a packet field, environment override, filename, or model-returned URL. No Chat Completions endpoint, Azure `api-version`, regional endpoint, compatible proxy, OAuth flow, organization-discovery call, model-list request or token-count endpoint in V1. A future region/endpoint addition needs an explicit reviewed destination decision, not a wildcard now.

The constructor requires an explicit model identifier (1..128 UTF-8 bytes, no control characters) and a trusted configuration stating compatibility with the chosen text/Structured Outputs profile and output limit. There is NO runtime default model and no network call to validate model availability. Syntactic validity is not account access. Unknown/inaccessible/incompatible models may be rejected by the service; translate that refusal without model probing or fallback.

The operator chooses the actual model before a live smoke. Record the model and official compatibility source at that time; do not adopt earlier conversational model/price recommendations as current evidence. Do not hardcode a dated model allowlist in the Brain.

Optional provider-specific reasoning effort may be configured explicitly as `low`, `medium` or `high` ONLY for a model whose reviewed capability supports that exact value. If omitted, omit `reasoning` from the request; do not invent a universally supported setting. No temperature/top_p/service-tier tuning, arbitrary provider-options bag or retry-after-driven tuning in V1.

A defaulted provider setting is not deterministic inference. The finite tests use fixtures, not a claim that temperature zero makes real responses reproducible.

## 6. Request construction and the disclosure boundary

`request.ts` is a pure function of validated data and frozen non-secret configuration. No fs/path traversal, environment/argv/cwd, clock, network, credential or prior-response access. Use explicit field construction, not object spreads of input/config into the HTTP request.

The request shape is Responses-native:

```text
model: explicitly selected model
instructions: fixed profile-owned instructions
input: an owned user input-text message containing the explicitly selected
       task + ordered labeled context blocks + descriptor data
max_output_tokens: exact admitted packet limit
text.format: { type: "json_schema", name, schema, strict: true }
store: false
stream: false
background: false
truncation: "disabled"
tools: []
tool_choice: "none"
parallel_tool_calls: false
reasoning: only when explicitly configured and supported
```

Do not send Chat Completions `messages`, `n`, `response_format` or `max_tokens` fields. Do not send `previous_response_id`, `conversation`, file IDs/URLs, images/audio, hosted tools, compaction controls, prompt-cache controls, remote prompts, logprobs, or requested reasoning summaries/encrypted reasoning. No provider-side conversation/memory is introduced.

Instructions identify the requested existing profile, say that references/target IDs must come from the supplied data, require exact complete text fields and no code fences, and explicitly separate proposal content from authority. Context remains labeled data; a source file containing `ignore your instructions` is NOT lifted into `instructions` or a tool definition. Do not claim labeling eliminates prompt injection.

Serialize task/context using a fixed owned data structure and deterministic property/order construction. Same packet content + same configuration produces identical body bytes; do not put timestamps or generated invocation IDs in prompts/metadata. Local invocation correlation stays local. Preserve original text values when decoded; JSON escaping on the wire is not a content change.

Only expressly selected task/context/descriptor data plus owned instructions/schema/configuration may enter the body. A relative path deliberately present in a descriptor is disclosed metadata. An unrelated file, environment value, argv item or local cwd is not disclosed merely because the process can access it.

**Secrets in deliberately disclosed context will be sent.** Do not silently redact/modify source text or claim general secret detection. Credential acquisition is separate; the selected API key must never be inserted into model instructions, schema, context or request-body metadata by the adapter.

Golden request fixtures for BOTH profiles must prove the exact shape, protected switches, output limit, data order and escaping. Fixtures contain synthetic source text and dummy identifiers only. No live credential/body is captured as a golden.

### Two native schemas, not a second application parser

Derive the fixed JSON Schemas from the ACTUAL existing parser/type fields, not illustrative chat snippets. The top-level schema is an object; nested union variants may use supported `anyOf`. Set `additionalProperties: false` for every schema object and supply required fields consistent with strict Structured Outputs.

Where the application's grammar has optional fields, define a documented canonical generation subset that the EXISTING parser already accepts. For example, always emitting an already-permitted array is acceptable; adding `null` where the parser forbids it is not. Do not rename fields, invent nullable cases, introduce a wrapper, or change upstream parsing to satisfy OpenAI. Preserve all six reasoning claim kinds and both supported evidence-reference alternatives.

The edit schema includes the actual string-valued `reasoningProposalJson` and change records; its native outer schema cannot validate the embedded string's ReasoningProposal grammar. The existing mutation consumer passes that exact decoded string to Gate 1.

Schemas are owned format guidance, not a semantic verifier, evidence registry or permission. They do not contain dynamic catalog handles, file text or task-specific enums. Use stable profile/schema names and keep arbitrary task data in the input only. Prefer the documented core schema keywords (object/array/scalar types, enums, required, additionalProperties, nested anyOf). Application byte/currentness/identity limits remain in their existing owners; do not express UTF-8 byte limits as though JSON Schema string length proved them. No new schema library, AST generator, generic schema compiler or runtime application-schema parser is authorized.

The adapter checks only the Responses envelope and text bounds. It does not validate/repair the returned ReasoningProposal or edit envelope. Complete malformed proposal text can remain an untrusted response for its actual consumer to refuse. There is no automatic fallback from strict schema to JSON mode/text after HTTP 400. An actual incompatibility is reported, not retried under a weaker format.

## 7. Credentials and supported egress

The trusted host passes the API key explicitly to construction. Validate nonempty bounded header-safe data; reject control characters/CR/LF and invalid values without echoing them. Do not enforce a guessed provider key prefix. Use a V1 key ceiling of 8,192 bytes and header-safe printable ASCII without whitespace; this checks transport safety, not whether OpenAI issued the key. Keep it private in the transport closure, not in the non-secret configuration/view or adapter descriptor.

**No `process.env` reads anywhere under `src/adapters/openai/**`.** The opt-in standalone host script may read exactly `OPENAI_API_KEY` after its authorization checks. No dotenv loader, config-file credential, shell argument containing a key, browser/local-storage lookup, account connector, or scan for existing credentials.

Attach `Authorization: Bearer ...` ONLY at the last transport step for the fixed endpoint. Request-body construction never receives the key. Use fixed headers such as Content-Type/Accept; no caller-controlled raw headers, cookies, custom proxy/TLS settings or organization/project routing headers in this V1. Prefer a dedicated project-scoped key chosen by the operator; do not change account settings.

The credential legitimately appears in the outbound Authorization header. Tests must prove it appears there ONLY for an allowed destination, and is absent from body, descriptors, failures, logs and receipts. Do not write an impossible test demanding that the credential never crosses HTTPS at all.

Provider error messages can echo content or headers. Do not propagate raw provider messages/refusal prose/errors/stacks into diagnostic metadata. Use fixed local messages and a small allowlist of safe reason/status codes. Validate optional display IDs separately; omit malformed values and literal reflections of the selected credential. Do not present this as perfect redaction of arbitrarily encoded secrets. Output text is a separate untrusted data channel, never a telemetry field; a detected literal reflection of the selected credential in usable output is refused, not silently edited.

Production must never print requests, responses, Authorization headers, raw exceptions, or adapter config. The live harness must never print the key or its length/prefix. Do not enable debug logging in Node/HTTP code or create a secret-bearing request dump for troubleshooting.

## 8. Real transport, tested at the lowest useful boundary

The supported constructor does not accept a transport override. Deterministic tests install a recording fake for the exact fetch primitive BEFORE adapter construction, or use an owner-private test factory not re-exported by the adapter barrel. In either case the REAL production request builder, admission checks, destination assertion, header attachment, bounded reader and response translator must execute.

A fake `send` that returns already-classified success does NOT prove host pinning, header protection, body-size handling or no redirects. Avoid that testing shortcut.

`transport.ts` is the sole new production network owner. Prefer one captured platform fetch function with normal receiver semantics. No dynamic import/module loading, global dispatcher change, custom HTTP pool, SDK, HTTP library, sockets, DNS calls or retry wrapper.

Before attaching the key and calling fetch, assert the effective destination is exactly the owned HTTPS URL: expected scheme, hostname, port semantics, path, no userinfo/query/fragment. There is no allowlist supplied by the model or generic suffix match. The normal path constructs the endpoint internally; the private transport guard is still tested against foreign/malformed destinations.

Use `redirect: "error"`, `credentials: "omit"` and `referrerPolicy: "no-referrer"`; the explicit Authorization header is still the required API credential. Follow NO redirects, even same-origin ones. A 3xx fixture response is rejected; its Location is not followed or echoed. Do not send a second request to discover why a redirect occurred. Hostname pinning does not claim control over trusted platform DNS/TLS/proxy internals. Standard HTTP/TLS/runtime metadata is not repository disclosure; the body allowlist is not a claim that the platform transmits no protocol metadata.

One admitted attempt invokes fetch at most once. No reauthentication replay, GET polling, retry of 408/409/429/5xx, retry after timeout, model discovery or automatic format/model substitution.

### Bounds apply while consuming the response

Read `Response.body` incrementally. Count actual bytes delivered by the stream BEFORE retaining each chunk. Do not call unbounded `response.text()`, `json()` or `arrayBuffer()` and check length afterward. Content-Length may allow early refusal but is not trusted as the sole bound; missing/incorrect/chunked headers must still be bounded.

On overflow, wrong content type, abort or early rejection: request cancellation of the owned reader/fetch, handle its settlement/rejection, and release the reader lock in cleanup. Do not leave an unread body on a success/error path. The cap applies to bytes delivered by fetch, including transparently decoded content, not an assumption about compressed Content-Length. It bounds application-retained/accepted data, not every allocation made by TLS, the runtime or a single incoming chunk before inspection.

For successful envelopes require JSON media type (application/json with valid optional parameters). Reject event-stream or other unexpected successful bodies; this interface is not streaming Responses/SSE. Decode valid UTF-8 strictly and parse the bounded HTTP JSON once. Do not silently repair invalid encoding or promote a truncated prefix to a complete response.

Error statuses use their safe status classification even when the bounded body is not JSON. Only recognized safe error codes/Retry-After metadata may be extracted; invalid optional body details do not leak raw text.

## 9. Finite admission counters — no estimated-token fiction

Use exact, safe-integer, adapter-local limits. The trusted host may narrow; it may not widen these V1 ceilings. These are designed for the existing small proposal workflow, not unlimited projects.

| Quantity | Default and hard ceiling unless narrowed |
|---|---|
| Reserved transport attempts per adapter instance | 8 |
| In-flight transport operations per adapter instance | 1; no queue |
| HTTP request body per attempt, INCLUDING schema/instruction/JSON escaping | 1,048,576 bytes |
| Cumulative reserved HTTP request-body bytes | 4,194,304 bytes |
| Requested output tokens per attempt | actual packet limit; <=8,192 and any smaller declared model/instance ceiling |
| Cumulative reserved requested output tokens | 32,768 |
| HTTP response envelope per attempt | 1,048,576 bytes |
| Decoded proposal text | <=65,536 UTF-8 bytes AND the actual smaller packet/Brain output ceiling |
| Automatic transport retries/fallback | 0 |

The Brain's normalized-packet ceiling stays 262,144 bytes. The HTTP body has different wrapping/schema/escaping overhead. The Responses envelope also contains metadata, usage and possibly reasoning items. **Neither complete wire document should be incorrectly capped as though it were only the final proposal string.** All three actual byte counts are separate and measured.

Before transport handoff:

1. Validate configuration, packet/control fields, selected profile and exact requested limits; prepare the owned body; check abort, instance slot and local bounds.
2. Check all three totals together: `reservedAttempts + 1`, `reservedRequestBytes + bodyBytes`, `reservedOutputTokens + requestedMaxOutputTokens`. Reject any overrun without transport invocation. Guard integer additions against overflow.
3. Reserve the adapter's in-flight slot and all counters synchronously before calling transport code or awaiting. The transport can synchronously re-enter through a test double; no second operation may slip through. The reservation belongs to this operation.
4. Recheck abort at the final network admission point. A completed reservation is never refunded, including an immediate transport rejection, sync throw, unknown outcome, error status, cancellation or timeout. This conservatively counts attempted handoffs, not proof that bytes reached OpenAI. Record `fetchStarted` separately where established.
5. Keep ownership until the actual transport/reader cleanup settles, not merely until an outer cancellation wrapper returns. Rejected BUSY calls do not clear someone else's slot. No retry or new instance is created automatically.

Preflight rejection before reservation consumes zero. After reservation, capacity NEVER returns—even if the service reports zero tokens or a much smaller output. **Reported usage is observation, not a credit mechanism.** Repeated caller correlation IDs do not hide a new explicit attempt. Two Brain instances sharing this adapter share these same counters; constructing a new adapter is an explicit host choice and outside this instance cap.

Do not use `ceil(bytes / 3)` or another heuristic as a conservative token proof. Do not fetch a tokenizer/count endpoint, invent worst-case billed input tokens, convert to dollars/euros, or call unknown usage zero. The exact hard controls are attempt count, disclosed bytes and requested output allocation. The provider must honor its API output limit; actual billing and other callers remain external.

Provider-reported input/output/cache/reasoning counts remain separately validated telemetry. Do not sum subsets such as cached input or reasoning output into totals twice, or refund admission reservations from them. Unknown/invalid usage remains UNKNOWN/INVALID. Any known totals must explicitly indicate whether some attempts lack usage.

## 10. Response translation — Responses, not choices

`response.ts` takes bounded status/body data and the locally supplied invocationId. It performs no I/O, clock read, environment lookup or action. If Retry-After date interpretation is supported, pass a captured receive-time value explicitly; delta-seconds-only support with unknown otherwise is sufficient for V1.

The raw HTTP Responses JSON has an `output` item array, not `choices[0].message`. The top-level `output_text` convenience used by SDKs is not a substitute for parsing the raw array. Reasoning-capable models may return a `reasoning` item before the final `message`; do not treat every non-message item as a tool call or assume index zero is the answer.

Pin the accepted output grammar:

- root object is a Responses resource with a recognized lifecycle status;
- COMPLETE requires root `status === "completed"`, no non-null error/incomplete indicator, and exactly one completed assistant message;
- allow bounded ordinary `reasoning` items as non-executable metadata, ignored for proposal text and not persisted or summarized by Path Code;
- the assistant message may contain ordered `output_text` parts; concatenate those text values in order with NO inserted separator;
- preserve exact decoded whitespace/BOM/newlines/fences; do not strip/reformat/repair proposal text;
- any refusal content prevents COMPLETE; no mixture of helpful text and refusal is treated as success;
- any tool/function/computer/shell/MCP/search/action item prevents usable output even if text is also present;
- unknown output/control item kinds fail closed; additional inert top-level provider metadata need not cause brittle rejection;
- zero/multiple final assistant messages, nontext fields, invalid known discriminants or malformed required structures refuse; bounded optional telemetry is handled separately;
- root/message incomplete or nonterminal status never becomes COMPLETE; no automatic continuation or polling.

Bound traversal within the already bounded envelope; e.g. <=32 output items and <=64 content parts per message. Reject excess rather than picking the first item. Never expose hidden reasoning/summary text as the model's final proposal.

### Mandatory translation dispositions

| Observed response | Existing adapter-envelope result / local reason |
|---|---|
| Completed valid single-message output | COMPLETE with exact final text; still untrusted |
| Output-limit/incomplete status, even if partial text is valid JSON | INCOMPLETE; no usable complete proposal |
| Provider refusal content | REFUSAL with safe fixed explanation; no raw refusal echoed into telemetry |
| Tools/action output, including text plus tool | FAILURE, unsupported output/tool reason; never executed |
| Invalid envelope/encoding/empty or excessive text | FAILURE, malformed/empty/oversize reason |
| `queued` / `in_progress` in a foreground response | INCOMPLETE/nonterminal failure; no polling |
| Root `failed` or non-null provider error | FAILURE with safe mapped provider reason |
| HTTP 401 | Authentication failure |
| HTTP 403 | Permission/request failure, distinguished locally from bad credentials |
| HTTP 429 quota/credit/project/org spend-limit code | Safe billing/quota reason; terminal, zero retry |
| Other HTTP 429 | RATE_LIMITED; bounded Retry-After as information only |
| HTTP 408/409 | Safe request/transport failure; zero retry |
| HTTP 400/404/422 | Request/model/schema rejected; fixed explanation, no fallback |
| HTTP 5xx | Provider unavailable; zero retry |
| HTTP 3xx / rejected redirect | Destination/redirect policy failure; no follow |
| Signal abort | Cancelled adapter operation; Brain still owns timeout versus caller-cancel classification |
| Network/DNS/TLS/body-read failure | Sanitized transport failure; no host/stack/key echo |
| Other unsupported HTTP/status/control shape | Explicit failure, never a benign default |

Map exact code names to the existing Brain reply/failure union. Where the union has no dedicated billing/permission code, preserve the distinction in a safe adapter-local reason/diagnostic view and use the nearest non-success existing envelope; do not expand the global/Brain union for provider-specific strings. Do not parse raw error.message to decide whether to retry.

Every reply branch uses the control invocationId supplied by the Brain. Provider response IDs and x-request-id are distinct reported metadata; no copied provider ID authenticates a Brain invocation. Validate optional metadata and omit invalid/secret-reflecting values.

Parse Responses usage dimensions from their actual names, validate finite nonnegative safe integers and consistent subset relationships, and map only fields supported by the existing usage envelope. Preserve unknown dimensions as bounded optional adapter metadata or omit them honestly; do not invent a new common receipt format. Missing is UNKNOWN, reported zero is REPORTED zero, invalid metadata is INVALID. Invalid OPTIONAL usage does not turn syntactically complete text into semantically failed reasoning or replenish a budget.

## 11. Cancellation, deadlines and ownership

The Brain already owns the invocation deadline and final consumer receipt. Do not create another retrying timeout controller. Use the supplied AbortSignal; a small transport-owned child controller may forward a safe abort reason and cancel local body consumption on overflow/early failure. Never mutate the caller's controller or echo its abort reason.

Check cancellation before reservation, immediately before fetch, during body reads, and before returning usable text after bounded translation. No accepted late response after observed stop. Remove the parent's listener on normal completion too; `{ once: true }` alone is not completion cleanup.

Native fetch participates in abort, but an abort request does NOT prove OpenAI stopped inference/billing. Nor does the Brain's consumer timeout prove the underlying adapter Promise settled. Keep the adapter invoke Promise pending until its actual fetch/body-read/owned cleanup operation settles; the Brain may independently return its consumer timeout while that adapter Promise is still PENDING. Never release an instance slot or report adapter settlement because only an outer Promise.race settled. If an uncooperative test/runtime operation never settles, ownership stays pending; there is no fake termination.

Handle fetch rejection, reader rejection and cancellation-cleanup rejection immediately and once. No detached rejecting `finally` chain. A stale completion/cleanup handler cannot refund counters, release a newer operation or change an already-returned receipt. Timers/listeners introduced by tests must be cleaned; no production polling/watchdog/heartbeat is added.

Use the existing monotonic clock semantics for optional transport timing; no clock-selection callback. Scoped fake-timer tests must fake the same `performance.now` source and cover abort before headers, during body read and after response availability. Use a short real-async fixture smoke too, not narrow wall-clock speed assertions. A synchronously blocking hostile adapter/runtime remains outside this assurance.

## 12. Telemetry and retention

Keep Brain receipts unchanged. A small immutable `describeOpenAIAdapter`/diagnostic view may expose safe selected model/profile names, configured limits, reserved counters, last safe HTTP/reason code, last provider request ID, known/unknown usage counts, response/body byte counts and actual settlement information. Do not create an unbounded per-call history, request-body hash registry, signing service or billing account mirror.

Never expose key material, body/prompt/context text, source bytes, model output excerpts, raw headers, raw error/refusal prose, argv/env, or absolute paths through summaries/diagnostics. An API-key-bearing HTTP request object is owner-private, not a report artifact. The deliberately returned COMPLETE text is separate untrusted data consumed by existing gates.

`store: false` is a deliberate application-state choice, NOT a Zero Data Retention guarantee. API abuse-monitoring and other documented retention/caching controls may still apply. No implicit provider memory, background response retention, or prior-response linkage is introduced. State this in the report without promising that the data never leaves or is never retained.

Current OpenAI documentation distinguishes spend alerts from explicitly enforced hard limits, and notes enforcement propagation can allow some overshoot. Account configuration is the operator's task; this pass does not verify or change it. A limit-related rejection does not roll back local edits or refund an earlier request. Local admission counters remain useful independently of that account control.

## 13. Deterministic verification and genuine caller handoff

All existing tests retain their current fixtures. Do not replace the entire D01–D24 Brain suite with real OpenAI behavior. Add focused tests composing the unchanged Brain with the new adapter and the recording fetch fixture.

The network double is installed before adapter creation and errors on every unscripted call. It has no route to real fetch or a fallback endpoint. New tests use native in-process Response/ReadableStream fixtures as appropriate; no local socket server or external HTTP is necessary. Scope global stubs per isolated test and restore them in finally/afterEach; no concurrently running cases share a mocked global fetch or clock.

Test the REAL transport with: absent/lying Content-Length, multiple chunks, UTF-8 across chunk boundaries, oversized first/later chunk, incomplete JSON, error body echoing secrets, header/body abort, and rejection during cleanup. Prove the mock captured the actual requested URL/options/headers/body—not merely an adapter-side counter that would miss an extra fetch.

F29 must use real Phase 2/Gate 1 artifacts and the actual mutation proposal consumer in disposable workspaces:

- reasoning profile through adapter + Brain -> exact text -> real Gate 1 REFERENCES_ONLY;
- invented-handle output -> invocation complete, Gate 1 refuses;
- edit profile through adapter + Brain -> real `session.propose` returns an exact MutationReview with embedded reasoning passed through Gate 1; no approval is minted and no apply occurs;
- malformed complete proposal text is not repaired by the adapter.

Fixture responses may be selected deterministically from the posted profile. They are test data, not a production fake OpenAI implementation. New handoff tests use REAL timers and an explicit 45,000 ms per-test allowance with the actual filesystem/owner-work reason. Prefer existing non-Git fixtures. All user-project content remains untouched by these tests.

### F01–F32 finite acceptance matrix

Map EVERY row to exact test titles/assertions. Several rows may share a test; no arbitrary test-function count. Keep type-only proofs separate from runtime collection. No new combinatorial detector/framework.

| ID | Required evidence |
|---|---|
| F01 | Construction validates explicit model/capabilities/key/limits; no environment/network access or partial adapter; unknown account availability is not falsely verified. |
| F02 | Captured config/descriptor/methods and safe views resist ordinary caller mutation; no endpoint/transport/header option reachable through constructor/packet/barrel. |
| F03 | Golden Responses reasoning request is deterministic; both protected switches and actual native schema are asserted. |
| F04 | Golden Responses edit request preserves exact embedded reasoning string/afterText shape; canonical schema samples conform to actual consumers. |
| F05 | Exact selected model/profile/output limit; store/stream/background false, truncation disabled, no tools/history/Chat Completions fields; unsupported profile/limit fails before transport. |
| F06 | Ambient canaries in env/unselected disk file/argv/cwd absent from serialized body; pure builder and production import boundaries; no ambient credential read. |
| F07 | Deliberately disclosed context is sent as text unchanged, including command-like/secret-like text; it does not become instructions, endpoint, headers or authority. |
| F08 | Separate packet/wire/text limits; escaped content and HTTP metadata overhead handled; oversize body refused before reservation/transport; request boundary exact and +1 cases. |
| F09 | Every translation-table status branch + unknown control kind fails/succeeds exactly as specified; local invocationId preserved across all replies. |
| F10 | Reasoning item before assistant message accepted; multiple output_text parts joined without edits; decoded whitespace/BOM/fences remain exact. |
| F11 | Text plus tool/function/action output refuses; no tool execution or hidden useful-text success. |
| F12 | Missing/multiple assistant messages, malformed content/status, refusal mixture, root error, pending/incomplete output cannot become COMPLETE. |
| F13 | Actual streaming body cap before buffering/parsing; lying/missing Content-Length; invalid UTF-8; huge chunk; cancel/release on error; no unbounded .json/.text shortcut. |
| F14 | Responses input/output/cache/reasoning usage maps without double counting; missing/invalid/reported-zero distinguished; telemetry cannot refund reservations. |
| F15 | Each independent attempt/total-byte/reserved-output cap refuses before send; cumulative output reservation—not only per-call token limit—is tested. |
| F16 | Synchronous reservation and single-flight protect concurrent and re-entrant invocation, including two Brains sharing one adapter; rejected call cannot release the active slot. |
| F17 | Successful low/zero usage never returns capacity; unknown usage retains counters with no fabricated billed-token total; safe read-only budget view. |
| F18 | Sync throw/HTTP error/abort/unknown body outcome retain an admitted reservation; pre-abort/invalid input before reservation charge zero; no self-reset or replacement instance. |
| F19 | 429 rate/quota/project/org-spend distinctions; actual fetch count one; Retry-After never schedules another call. |
| F20 | 408/409/5xx/timeout failure paths never retry; no continuation, credential refresh, schema or model fallback. |
| F21 | Network/read/cleanup errors safely handled; no unhandled rejection, raw hostname/stack/body/key leak. |
| F22 | 401/403 and credential-echoing error/refusal/metadata cases yield safe failures/views; no returned receipt contains the canary key. |
| F23 | REAL private transport refuses foreign origin/scheme/port/userinfo/query/path; mocked fetch sees no credential-bearing foreign request; all redirects rejected and never followed. |
| F24 | Pre-abort/abort while awaiting headers/body/late resolution: no usable late answer; parent unchanged; listeners/readers cleaned and ownership retained until actual settlement. |
| F25 | Brain deadline + real adapter + fake fetch compose correctly with matched monotonic clock; one real-async abort fixture; no full D-suite replacement or long wall sleeps. |
| F26 | Key exists only in the allowed request's Authorization header; absent from body/goldens/descriptor/errors/summary; source construction has no console/debug path. |
| F27 | Diagnostics bounded/immutable/allowlisted; model output separate; no persistence, transcript excerpt, fabricated money or retention/termination claim. |
| F28 | Adapter satisfies both existing profiles/actual Brain envelope with no Brain/orchestrator/gate/domain source changes; canonical deterministic suites preserved. |
| F29 | Real reasoning/Gate 1 and edit/session.propose handoffs through Brain + actual transport with fixture fetch; invented reference refuses; no live network or mutation approval. |
| F30 | Named network owner only; no adapter env/fs/process reads; no reverse imports/root/subpath/test helper exposure; installed dependency count unchanged. |
| F31 | Compile proofs keep adapter replies/diagnostics separate from authorization, bound reasoning, assessment and EvidenceRecord/CompletionReport; no transport seam in supported constructor. |
| F32 | All prior/new tests collected and accounted for; live harness never collected/run by check even with live flags present; no async/timer/mock/fixture residue. |

Canary setup occurs only in isolated test fixtures; never read real secrets to prove a redaction test. Avoid host-wide cwd changes and shared process argv/env mutation across concurrent tests; use isolated test process or narrowly scoped restore-safe setup. Positive bodies include explicit disclosure canaries to prove that intentional content is not silently erased.

### Four bounded falsifications: fixture fetch only

After focused tests pass, snapshot the exact candidate source bytes. For each probe, make ONE named change, observe the intended behavioral assertion fail, restore exact bytes/hash, then confirm focused PASS. Never run the whole suite or a live call under corruption. Compile/import errors are not successful falsification.

- **P1 — cumulative requested-output budget:** with transport-attempt cap >=2 and sufficient byte allowance, consume the configured total output reservation with the first finished call. Bypass ONLY the next-call total-output admission predicate. F15 must expose the forbidden second transport admission. Preserve Brain and attempt caps; test the same private predicate if an independent defense still refuses end-to-end.
- **P2 — accidental disclosure:** add one synthetic environment-canary value to the pure builder's serialized body. F06 must fail because the posted body includes forbidden ambient data, not merely because an import scan noticed it. Restore; never use an actual credential in this probe.
- **P3 — destination guard:** bypass ONLY the real transport's destination assertion; invoke that same private path with a foreign URL and dummy key while fetch is an in-process recorder with NO network fallback. F23 must expose the attempted foreign request. Keep the normal constructor's fixed endpoint defense intact; record private mechanism and end-to-end defense separately.
- **P4 — hidden retry:** temporarily add one retry after a fixture HTTP 429. F19 must expose TWO actual fetch calls. Restore. Do not remove independent budget protections just to force two calls; give the fixture enough legitimate capacity.

These are regression proofs for concrete mechanisms, not mathematical proof against every exfiltration path or schedule. No public replacement transport, reset-budget method, general test hook bag or weakening of two independent checks to make a probe look impressive.

## 14. Opt-in live harness — ready to use, not executed by this assignment

Implement `scripts/openai-live-smoke.mjs`, outside all Vitest test patterns and canonical scripts. It imports built code; it does not build/install dependencies or discover credentials by itself. Use an explicit direct invocation documented in the report. No change to package test/check scripts or Vitest projects is necessary.

Before any network request, require ALL of:

1. Explicit operator invocation with `--confirm-network`.
2. `PATHCODE_LIVE_OPENAI=1` set intentionally by the operator.
3. `PATHCODE_OPENAI_MODEL` explicitly naming the reviewed model; no fallback.
4. `OPENAI_API_KEY` present, read only by this trusted host script and never printed.

Check these prerequisites before touching live transport. Missing authorization/model/key means `LIVE_SMOKE_NOT_RUN`, not PASS and not a skipped canonical test. Credential presence alone never enables live calls. Do not set the opt-in flag or read a real key on the operator's behalf during this implementation pass.

Create ONE Brain and ONE adapter for the entire smoke, with adapter limits fixed to:

- at most **2** reserved transport attempts total;
- at most **2,048** requested output tokens per call, **4,096** total;
- at most **65,536** serialized request bytes per call, **131,072** total;
- at most **60,000 ms** Brain deadline per call, or a smaller compatible selected-model bound;
- normal bounded wire/text response caps; no retries/fallback.

Use only two prewritten tiny synthetic fixtures. No real Nordic Rain/Path Code source code, invoices, keys, history or user data is disclosed. Any local fixture preparation is in disposable directories through established helpers, not the implementation repository. Owned native schemas/instructions count toward the request-body cap.

Call 1 requests a small reasoning proposal against real synthetic catalog descriptors and passes returned text to real Gate 1. Call 2 requests a tiny edit envelope and uses the existing parser/proposal-preparation path on the disposable fixture. **Do not approve/apply the model's edit, run its commands or commit anything.** The point is live protocol/profile interoperability, not a paid autonomous mutation demo.

Stop on the first transport/HTTP/refusal/incomplete or consumer-invalid result. Do not spend extra calls regenerating valid output. A real refusal is recorded honestly. Test budget exhaustion locally in deterministic tests, not with a third unnecessary provider request. A new smoke process/run requires a new explicit operator decision; a local two-call cap is not a monthly account cap.

Output only a safe structured summary: selected model, attempted calls, HTTP/reply outcome, owner consumer result, request/response/text sizes, known/unknown usage, duration and limitations. **No first-64-byte output excerpt, body, prompt or secret.** The harness need not write a report directory; sanitized stdout is sufficient. No credential files or raw HTTP dumps.

Record independent statuses:

```text
DETERMINISTIC_GATE: PASS / FAIL / INCOMPLETE
LIVE_SMOKE: NOT_RUN_REQUIRES_OPERATOR_AUTHORIZATION
          | ESTABLISHED_FOR_SELECTED_MODEL_AT_RECORDED_TIME
          | NOT_ESTABLISHED_WITH_SAFE_REASON
```

A provider outage/permission/spend limit does not turn local translation tests into failures. Conversely, if a live attempt later exposes a real reproducible builder/translation/schema defect, do not claim the adapter is operationally ready just because fixtures passed. Preserve both facts, diagnose the owned defect and seek the next bounded authorization. No repeat live iteration is authorized here.

Do not assert a dollar ceiling. Before approving a live run, the operator should separately confirm the selected model's current pricing/access and applicable account controls. Current provider hard-limit enforcement can lag; alerts alone do not stop traffic. Never raise account limits, turn on auto-recharge, purchase credits or retry against another key.

## 15. Architecture permissions and dependency discipline

Allowed new source: `src/adapters/openai/**` with the explicit internal exports. Allowed supporting changes: focused tests/fixtures, the standalone live harness, new pass/report/amendment documents, and narrowly named architecture assertions which must recognize this new owner.

Production value dependencies are limited to existing Result utilities, required bounded byte/encoding helpers and compatible public-internal clock utilities. Brain/provider/profile types may be imported type-only. No adapter production imports of reasoning/editing/Validation/Engineering Run/orchestrator behavior or private registries. Tests may use those genuine owners to verify handoff.

`fetch` is allowed only in the named transport module (including its captured call path). Environment/argv acquisition is allowed only in the standalone opt-in host harness, not the reusable adapter. Direct filesystem use in the harness/test fixtures is limited to disposable synthetic setup/cleanup; never source disclosure. No `credential.ts` environment-reading production exception is created.

Do not modify package dependencies, lockfile, Brain controller/types, global ActionClass/KnowledgeState, gates, currentness, writers, phase status or ledgers. No root/subpath exports, public transport/budget overrides, broad directory exemptions, generalized authority-detector expansion or live SDK installation.

Inspect affected compiled/import tests during focused development rather than wait for the canonical check to rediscover a known owner rule. Update only the exact named allowance, preserving forbidden imports/calls in every earlier layer. A source scan is one architecture check, not a proof that arbitrary same-process code cannot access ambient APIs.

## 16. Verification budget and prospective attempt policy

**120 minutes elapsed total**, including source mapping, implementation, deterministic tests/probes, evidence and cleanup. Reserve the final 25 minutes. This is a stop budget, not an expected duration or permission to omit failed requirements.

Use the existing installation/lockfile and the properly approved environment for existing disposable Git/process fixtures. Verify necessary fixture permissions before a canonical run; do not knowingly repeat sandbox-denied git-init failures. Do not globally bypass security controls or kill unrelated work.

No pre-change full-suite run. Develop with focused adapter/Brain/consumer/architecture/type checks. Preserve every existing assertion, maxWorkers=2, src-lock-serial, strict compiler settings and existing test budgets. New real-filesystem handoff budgets are explicit above. Baseline: 90 files / 865 runtime tests, not a target total.

Run a canonical check only on a coherent candidate after its focused checks pass. Prefer a committed candidate so its tested SHA is exact.

**At most THREE sequential `npm run check` attempts in this assignment.** After a failure, record its concrete signature/cause, make a specific owned correction (or resolve a demonstrable one-off setup fault), and pass its focused proof before a further canonical run. Do not require a contrived new label for the same real defect; require a real new causal correction. The same failure with no correction, a run in hope, the elapsed budget, or reaching the three-run ceiling means STOP. A fourth requires a new explicit operator authorization and explanation of why focused tests missed the blocker.

This rule is prospective and scoped to this pass. Preserve 5D3's historical facts: three attempts against its former two-attempt ceiling; a real owned correction preceded the final green; implementation was accepted for forward development with a recorded process deviation. Do not rewrite that report or retroactively label the third run authorized. In the new contract's note, distinguish implementation causes from the decision to improve future budget policy.

Capture complete logs and actual npm exit status, not tee/grep/head's status. PASS requires all stages: typecheck, build, complete tests, CLI smoke, ledger verification; every collected baseline/new test accounted for; zero required failures/skips/unhandled worker errors; F01–F32 mapped; P1–P4 restored. No live call/real credential can be required or activated by canonical execution—even when unrelated shell environment contains live flags.

Only diagnostic fixture data is used in probes. Clean up mocks/readers/listeners/timers and fixture work before canonical execution. A failed/incomplete gate preserves legitimate candidate changes and stops; no unrelated correction campaign is authorized.

## 17. Commits, evidence and integration handoff

Use coherent local commits: contract/source mapping + transport amendment; implementation/tests/harness; any necessary explicit owned fix; final report. No amend/rebase/squash, ceremonial self-SHA-fill commits, push or remote changes.

Create `docs/reports/PHASE_5E1_OPENAI_ADAPTER_REPORT.md` containing:

- exact branch/start/tested/final SHAs, accepted 5D3 integration proof and unchanged main;
- exact files and API/profile/capability mappings, including where host disclosure/credential permission belongs;
- the Responses URL, request switches, native-schema source mapping and fixture/golden evidence;
- real transport versus fake-fetch test boundary, request-body/response-envelope/proposal-text caps;
- reservation logic and units, count/byte/output totals, no refund/retry behavior, unknown usage semantics;
- response/status/tool/refusal/incomplete/reasoning-item translation table;
- credential/disclosure/no ambient access, redirect/destination and cancellation/cleanup evidence;
- precise safe telemetry and provider-retention/spend-control non-claims;
- full F01–F32 assertion map and P1–P4 mutation/restore hashes, distinguishing private and E2E outcomes;
- every canonical attempt, cause/fix, real exit, exact totals/delta, runtime and worker errors;
- tested-to-committed load-bearing byte equality; reports after the gate are documentation-only;
- `LIVE_SMOKE: NOT_RUN_REQUIRES_OPERATOR_AUTHORIZATION` for this dispatch, plus the exact ready-to-run two-call command and its prerequisites WITHOUT a key value;
- no runtime dependency/controller/gate/mutation semantics change, no provider fallback or new action authority;
- known limitations, clean worktree and task-owned residue/cleanup.

Return the FULL report plus final SHA. Do not insert a report's own future SHA into itself. A docs-only final commit needs a byte comparison, not another full check just to print a different HEAD.

Success line:

`PHASE 5E1 OPENAI RESPONSES ADAPTER IMPLEMENTED — LIVE-CAPABLE — NO AUTOMATIC RETRIES — BOUNDED LOCAL DISPATCH/OUTPUT EXPOSURE — EXPLICIT DISCLOSURE — UNTRUSTED OUTPUT — CANONICAL TESTS OFFLINE — LIVE USE SEPARATELY OPT-IN`

Main remains `ecf480faff53560133309df36837534a38b7f4cb`. New adapter commits stay on `cursor/phase5e1-openai-adapter`. No merge of 5E1, push, phase promotion, invented audit, 5E2 or CLI/product rollout. STOP for review.

## 18. Gemini follow-on: prove the abstraction, not identical implementation

5E2 should add its concrete adapter using the same Brain invocation/control/reply contracts and both application profiles, without provider-specific branching in Brain/orchestrator/gates/mutation. Its request schema, errors, usage dimensions, endpoint and tests will be Gemini-specific; do not require it to use OpenAI output-item shapes or every identical fixture.

The expected integration changes are adapter/composition/configuration/tests/docs. A genuinely additive capability declaration may be reviewed where the existing port already allows it. A required semantic change to the shared control/reply/profile meanings is a real compatibility finding, not something to conceal in a concrete adapter. It deserves a proportional named amendment if actually needed—not a predeclared full redesign. Do not implement any of that in 5E1.

The second adapter is expected to reuse the architecture; it is not guaranteed to be free, effortless or supported by every future model.

## 19. Source basis and current external facts

**Project sources:** operator-supplied 5D1/5D2/5D3 reports and FINAL contracts; the actual committed Brain/profile/gate/mutation owners at the required HEAD; Foundation Extensibility Constitution; advisory `PathCode_Phase5E1_Live_OpenAI_Adapter_CONTRACT.md` studied rather than adopted wholesale. The architect has not independently inspected the current repository implementation.

**Official documentation checked for this FINAL on 7 September 2026:**

1. Responses API create/reference — request fields, output array, lifecycle, output-token definition:
   https://developers.openai.com/api/reference/resources/responses/methods/create
   https://developers.openai.com/api/reference/cli/resources/responses/methods/create
2. Structured Outputs — Responses `text.format`, strict JSON Schema subset:
   https://developers.openai.com/api/docs/guides/structured-outputs
3. Data controls — `store:false` is not a blanket retention exemption:
   https://developers.openai.com/api/docs/guides/your-data
4. Spend limits — explicit enforcement versus alerts; enforcement lag and limit error codes:
   https://developers.openai.com/api/docs/guides/spend-limits
5. Official OpenAI Node library — retries/timeouts and configuration, informing the scoped fetch decision, not an instruction to install it:
   https://github.com/openai/openai-node
   https://github.com/openai/openai-node/blob/main/docs/configuration.md
6. Node platform fetch/AbortSignal/Web Streams — use the installed runtime's supported APIs, not a version upgrade:
   https://nodejs.org/api/globals.html
   https://nodejs.org/api/webstreams.html

The OpenAI SDK identifies Responses as its primary API. Official docs distinguish `output` items from the SDK-only aggregated `output_text`; `max_output_tokens` includes visible and reasoning tokens. Strict output schemas are provider format constraints, not Path Code evidence checks. Current spend documentation supports enforced project/org limits but explicitly notes non-instantaneous enforcement. Account access, exact model support/prices and actual live interoperability are NOT established by this drafting session.

Do not silently correct inherited source claims with guesses or freeze old model names/prices. Record any material difference between these API facts and the official docs at implementation time before making a conflicting request. Most implementation work is ordinary code/tests from this resolved contract, not an open-ended research assignment.
