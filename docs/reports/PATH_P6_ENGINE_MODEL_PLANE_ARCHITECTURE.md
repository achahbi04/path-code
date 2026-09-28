# PATH P6 — Engine+Model Plane Architecture (Design Specification)

**Status:** Design only — **no implementation authorized** by this document.  
**Operator decisions:** Frozen in **§2.1–§2.2** (final 2026-09-28).  
**Authority:** Operator review required before commit and before any P6 code.  
**Roadmap:** `docs/reports/PATH_POST_S5_ROADMAP_RECONCILIATION.md` (commit `2673068`).

---

## 1. Executive architecture

P6 introduces a **Model Plane**: a shared platform layer that resolves **which provider model** runs **after** S3 Engine Fabric has already chosen **which engineering engine** executes the turn.

```text
TASK NEED
    ↓
ENGINE FIT (S3 Fabric — unchanged)
    ↓
chosen ENGINE (cursor | copilot | antigravity)
    ↓
MODEL RESOLUTION (P6 Model Plane — new authority)
    ↓
adapter executes with resolved model + records provenance
    ↓
EXECUTION
```

**ENGINE ≠ MODEL.** Cursor, GitHub Copilot, and Antigravity remain the only PATH engineering engines. GPT-, Gemini-, Grok-, Composer-, and Claude-class strings are **model identities** exposed through compatible adapters — not new Fabric peers.

**Placement:** One shared **Model Plane module** (proposed: `scripts/pathcode-cli/model-plane/`) invoked from **engineering adapters** and **Gateway-orchestrated G10 turns** — not from Builder UI calling SDKs directly. Fabric (`selectEngineForTurn`, `resolvePreferredEngine`) is **not** replaced.

**Canonical persistence:** G10 task checkpoint `engineTurns[]` (and sealed projection fields) remain the **authoritative execution provenance store** for engineering; preferences live in **durable PATH state** (`preferences.json` evolved + optional project overlay). General Session brain state remains a **separate consumer** with a documented bridge to the same **model identity schema**.

**Absorbs S3-01:** `resolveCursorModel` env pins become **legacy compatibility inputs** to the Model Plane — not a parallel resolver forever.

---

## 2. Frozen baseline

| Artifact | SHA / ref |
|----------|-----------|
| Builder implementation | `2ae7540da76e8d311e64465958d5f6ce03a72c25` |
| Builder repair closure | `903fd292e9828d4aeb7899d3e0b44affa58d11fd` |
| S1–S5 platform audit | `93a3596313851291dcbd779dc034567729b19660` |
| Debt disposition | `59df5a2bca88742ebd08b10057583a56fae46ef3` |
| Post-S5 roadmap | `2673068` — `PATH_POST_S5_ROADMAP_RECONCILIATION.md` |

**P6 must not:** replace Engine Fabric; add a second engine router; add a new engineering engine; redesign Gateway authority; redesign S2/S4; reopen Builder repair; change Apply/Discard; touch ICE implementation.

---

## 2.1 Operator architecture decisions (frozen)

The following decisions are **binding** on P6 design and implementation. They supersede open questions previously listed at the end of this document.

| # | Topic | Decision |
|---|--------|----------|
| 1 | Engineering CLI | Single flag `--engineering-model <model-id>` only — **no** `--cursor-model`, `--copilot-model`, or `--antigravity-model`. Evaluated **only after** S3 Fabric resolves `engineId`. Never reroutes engine. Incompatible model → `MODEL_INCOMPATIBLE`. May combine with `--engine <id>` for display/intent; **engine authority remains S3**. |
| 2 | Project prefs | Frozen path: **`.path/model-preferences.json`** — optional, model-only, **no secrets**, not auto-created on project open/bind, written only on explicit preference action, **project default only**. User defaults in durable `preferences.json`. **No task pins** in project file. |
| 3 | Builder UX | Default: `Model: [ Auto ▾ ]`. **Engine** shown read-only after resolution/execution (e.g. `Engine: Cursor`, `Model: Composer 2.5`). **Invariant:** model selection must **never** implicitly select or reroute engine. No global cross-engine model picker when Fabric chooses engine. Per-engine project/user defaults allowed. |
| 4 | Copilot discovery | **P6 MVP does not depend** on dynamic Copilot discovery — static/fallback/provider-default only. If actual model unproven: `actualModelKnown: false`, `actualModel: null`. **P6.8** optional; not required for P6 closure. |
| 5 | GS vs engineering UX | Shared **identity schema**; **separate** preferences: `generalSession.modelId` vs `engineering.byEngine.{cursor,copilot,antigravity}`. No single ambiguous global Model control. General Session remains non-Fabric unless separately authorized later. |
| 6 | Task model pin | **Canonical in G10 task checkpoint** only. Project file = defaults only. History never reconstructed from current project default. Checkpoint execution provenance is canonical. |
| 7 | Catalog vs availability | **Catalogued** = identity + compatibility declaration. **Available** = adapter/provider can truthfully establish current usability. Static catalog entry ≠ `availability: available`. Unproven → `availability: unknown`. |
| 8 | Pass plan | **P6 closure = P6.0–P6.7 only.** **P6.8** is **outside** closure — separately operator-authorized future work; **no** dynamic discovery implementation authorized now. |
| 9 | P6.8 (future) | If later authorized: **Cursor first** only with documented/callable SDK model-list API; **Antigravity** waits for equally truthful bridge enumeration; **Copilot** outside discovery closure unless separately proven. Evidence bar: **§2.2**. |
| 10 | `PATHCODE_PREFERRED_ENGINE` | S3 **preference** only — not Model Plane authority. **Engine preference ≠ engine guarantee.** Model preference is **engine-scoped**. Builder/fallback rules: **§12.4**, **§17**. |
| 11 | PATH Code slashes | **`/model`** = General Session only. **`/engineering-model`** = engineering only. Do not overload `/model`. CLI: `--model` (GS), `--engineering-model` (engineering). |

---

## 2.2 P6.8 dynamic discovery (future — not P6 closure)

**P6.8 is not part of P6 completion.** P6 is complete when **P6.0–P6.7** acceptance passes. No dynamic discovery implementation is authorized by this architecture revision.

If P6.8 is **later** operator-authorized:

| Adapter | Order / rule |
|---------|----------------|
| **Cursor** | First candidate **only if** the **installed** Cursor SDK exposes a **documented, callable** model-list or discovery API (not marketing inference). |
| **Antigravity** | Waits until the bridge/provider exposes an **equally truthful** enumeration mechanism. |
| **Copilot** | Remains **outside** discovery closure requirements unless separately proven and authorized. |

**Evidence bar — “SDK capability proven”** (all must hold before P6.8 work on that adapter):

1. A **concrete** SDK or official provider API method exists — not inferred from marketing.
2. Installed SDK types or official provider API documentation establishes the contract.
3. The PATH adapter can call it **without inventing** model identities.
4. A **bounded adapter test** proves mapping into `path.model.identity.v1`.
5. Any real-provider check is **read-only** and does **not** require a paid inference or engineering turn.

---

## 3. Current model-selection audit

Evidence from repository inspection (2026-09-28). **No provider capabilities inferred beyond what code uses today.**

### 3.1 Cursor (engineering engine)

| Dimension | Current behavior |
|-----------|------------------|
| **ENGINE / CONSUMER** | Engineering — `cursor-sdk.mjs`, G10 `runCursorCollabTurn` (`ag10/index.mjs`) |
| **CURRENT MODEL SOURCE** | `resolveCursorModel(env)` → `{ id }`; passed to `@cursor/sdk` `Agent.create` / `agent.send(..., { model })` |
| **DEFAULT** | Hardcoded `"composer-2.5"` when env unset (`cursor-sdk.mjs` ~165–171) |
| **ENV OVERRIDE** | `PATHCODE_CURSOR_MODEL`, `CURSOR_MODEL` (precedence: PATHCODE_* first) |
| **CALLER OVERRIDE** | `createCursorEngine({ model })` / `options.model` on engine factory |
| **DYNAMIC DISCOVERY?** | **No** — repo does not call a Cursor model-list API |
| **STATIC CATALOG?** | **De facto** — default string only; no PATH catalog file |
| **MODEL PROVENANCE TODAY?** | **Partial / requested-not-actual** — G10 `noteEngineExecution` records **resolved request** (`cursorModel.id`), not SDK-reported actual model; `withEngineProvenance` adds `engine`, `mode`, `sessionId`, `runId` only — **no model field** |
| **TASK-SCOPED?** | No dedicated task model field; per-turn env + `options.model` |
| **SESSION-SCOPED?** | No |
| **PROJECT-SCOPED?** | No |
| **USER-SCOPED?** | Env global only |
| **KNOWN LIMITATIONS** | SDK requires explicit model on create/send; no PATH validation of ID against catalog; no discovery hook in tree |

### 3.2 Copilot (engineering engine)

| Dimension | Current behavior |
|-----------|------------------|
| **ENGINE / CONSUMER** | Engineering — `copilot-sdk.mjs`, G10 `runCopilotCollabTurn` |
| **CURRENT MODEL SOURCE** | Copilot SDK session config — `model` only if `options.model` string set at session create (`copilot-sdk.mjs` ~268–270) |
| **DEFAULT** | **Provider/SDK default** when `options.model` omitted |
| **ENV OVERRIDE** | **None** for model ID in repo (only `COPILOT_CLI_PATH`, `PATHCODE_COPILOT_BIN` for binary) |
| **CALLER OVERRIDE** | `options.model` on engine factory; G10 passes `turn.model` only into `noteEngineExecution`, **not** into `runEngineeringTurn` |
| **DYNAMIC DISCOVERY?** | **Not used** in PATH code |
| **STATIC CATALOG?** | **None** in PATH |
| **MODEL PROVENANCE TODAY?** | Checkpoint may show `model: null` for Copilot primary (`tests/s5/build-scope-fabric.test.ts`); turn result does not attach model |
| **TASK-SCOPED?** | Only if future wiring passes `turn.model` into SDK |
| **SESSION-SCOPED?** | SDK session implicit default |
| **PROJECT / USER** | No PATH prefs |
| **KNOWN LIMITATIONS** | CLI fallback path has no model parameter in `runCopilotEngineeringTurn` call site; actual model often **unknown** → UI/report shows `unknown` |
| **P6 MVP (operator)** | **No dynamic Copilot discovery** in closure scope; static catalog + provider default; provenance must allow `actualModelKnown: false` |

### 3.3 Antigravity (engineering engine)

| Dimension | Current behavior |
|-----------|------------------|
| **ENGINE / CONSUMER** | Engineering — AG1 bridge (`ag1/session.mjs`, `cloud-env.mjs`, Python bridge) |
| **CURRENT MODEL SOURCE** | `resolveAg1ExecutionIdentity(env)` — `AG1_MODEL` \|\| `GOOGLE_CLOUD_MODEL`; `hydrateAg1CloudEnv` sets default `AG1_MODEL=gemini-2.5-flash` |
| **DEFAULT** | `gemini-2.5-flash` after hydration |
| **ENV OVERRIDE** | `AG1_MODEL`, `GOOGLE_CLOUD_MODEL`; auth via `GEMINI_API_KEY` / `GOOGLE_API_KEY` / Vertex ADC |
| **CALLER OVERRIDE** | **No** PATH turn-level model override in G10 fabric today |
| **DYNAMIC DISCOVERY?** | **Not used** — comment in `cloud-env.mjs`: model is env-resolved, **not catalog-inferred** |
| **STATIC CATALOG?** | **Implicit** via env default string only |
| **MODEL PROVENANCE TODAY?** | `noteEngineExecution` with `provider` (Vertex AI / Google AI) + `model` from **env identity**, not post-hoc bridge disclosure |
| **TASK-SCOPED?** | Task session uses shared env |
| **SESSION-SCOPED?** | Env per process |
| **KNOWN LIMITATIONS** | Bridge may use provider-internal routing; PATH does not verify actual model ID returned from bridge |

### 3.4 OpenAI General Session (non-Fabric consumer)

| Dimension | Current behavior |
|-----------|------------------|
| **ENGINE / CONSUMER** | **Not** an engineering engine — `src/brain/*`, `general-session.mjs`, `pathcode.mjs` General Session loop |
| **CURRENT MODEL SOURCE** | `resolveEffectivePreferences` / launch: `--model` → `preferences.json` `modelId` → `PATHCODE_OPENAI_MODEL` |
| **DEFAULT** | Brain adapter requires valid `modelId` at session start (`general-session.mjs`) |
| **ENV OVERRIDE** | `PATHCODE_OPENAI_MODEL` (also `OPENAI_MODEL` in some gc1 scripts) |
| **CALLER OVERRIDE** | CLI `--model`, `/model` slash command, session override |
| **DYNAMIC DISCOVERY?** | **No** in PATH |
| **STATIC CATALOG?** | Operator-supplied ID only |
| **MODEL PROVENANCE TODAY?** | Brain receipt / session state `modelId`; separate from G10 `engineTurns` |
| **RELATION TO FABRIC** | **Orthogonal** — no `selectEngineForTurn` on this path |
| **KNOWN LIMITATIONS** | `preferences.mjs` conflates **one** `modelId` field for General Session — not engine-scoped today |

### 3.5 Cross-cutting today

| Concern | Location | Note |
|---------|----------|------|
| Engine selection | `engine-contract.mjs` `selectEngineForTurn` | Unchanged by P6 |
| Engineering provenance extraction | `build/reconcile.mjs` `extractProviderProvenance` | Reads checkpoint `engineTurns` |
| Builder child projection | `build/controller.mjs` → `child.engineModel` | From provenance.model |
| Readiness vs registry | `engine-readiness.mjs` header | Explicitly **not** Model Registry |

---

## 4. Authority model

| Layer | Owns | Does not own |
|-------|------|----------------|
| **S3 Engine Fabric** | Engine fit, `selectEngineForTurn`, preferred **engine**, continuity | Model IDs, catalogs, Auto model policy |
| **P6 Model Plane** | Model identity, catalog views, compatibility, preferences, Auto **model** resolution, selection provenance **contract** | Engine choice, routing, repair authority |
| **Adapters** | Provider SDK invocation, optional discovery implementation, translating provider errors | Independent model prefs stores; bypassing resolver |
| **Gateway** | Task lifecycle, dispatch, passing **opaque** model preference handles into fabric/adapter stack | Direct SDK model APIs from Builder |
| **Builder / Code UX** | Display, creator overrides within policy | Engine fabric logic; provider secrets |

**Rule:** Model resolution runs **only when `engineId` is known** for the executing turn.

---

## 5. Canonical model identity

### 5.1 Record shape (logical schema)

Proposed schema id: `path.model.identity.v1`

```json
{
  "pathKey": "cursor:composer-2.5",
  "engineId": "cursor",
  "provider": "cursor",
  "providerModelId": "composer-2.5",
  "displayName": "Composer 2.5",
  "aliases": [],
  "catalogued": true,
  "availability": "available | unavailable | deprecated | unknown",
  "catalogSource": "static | discovered | legacy_env",
  "discoveredAt": "ISO-8601 | null",
  "capabilities": {
    "modalities": ["text"],
    "traits": []
  },
  "metadata": {}
}
```

| Field class | Fields | Rule |
|-------------|--------|------|
| **AUTHORITATIVE** | `pathKey`, `engineId`, `providerModelId`, `catalogued` | Identity + compatibility declaration |
| **RUNTIME (separate)** | `availability` | Set only when adapter/provider can **truthfully** establish usability; default **unknown** for static seed entries |
| **DISCOVERED** | `discoveredAt`, discovery-sourced `displayName` | May be stale; refresh policy applies |
| **STATIC FALLBACK** | Seed catalog entries per engine | Shipped with PATH; versioned |
| **OPTIONAL METADATA** | context window, cost, reasoning effort | **Omit unless adapter attests reliability** |

**Internal key:** `pathKey = `${engineId}:${normalizedProviderModelId}`` — prevents cross-engine mistaken equivalence.

**Do not** store marketing specs or unverified capability matrices.

### 5.2 General Session bridge

Use the **same identity schema** with `consumer: "general_session"` and `engineId: null` (or sentinel `openai_direct`) so Studio/Code can display one vocabulary. **Execution path stays separate** from Fabric.

**Preferences (frozen):** do **not** merge consumers in one UI field.

- General Session: `preferences.json` → `generalSession.modelId` (plus legacy/env migration).
- Engineering: `preferences.json` → `engineering.byEngine.cursor` | `.copilot` | `.antigravity`.
- Project defaults: `.path/model-preferences.json` → same `byEngine` shape, **defaults only**.

### 5.3 Catalogued vs runtime availability (frozen)

| Concept | Meaning |
|---------|---------|
| **CATALOGUED** | PATH knows the model identity and that it is **compatible** with a given `engineId` (static seed, optional discovery, or explicit operator entry). |
| **AVAILABLE** | The relevant adapter/provider can **truthfully** establish the model is usable **right now** (auth ready, provider accepts ID, etc.). |

**Rules:**

- Listing in a static catalog sets `catalogued: true` — it does **not** automatically set `availability: available`.
- When PATH cannot prove runtime availability: `availability: unknown` (UI may still offer the ID as an explicit choice with honest risk labeling).
- **Never** synthesize `available` from catalog membership alone.
- Builder/Code pickers join catalog with **engine readiness** probes where implemented; disabled state must distinguish “unknown availability” from “incompatible engine.”

---

## 6. Engine ↔ model compatibility

**Single source of truth per engine:** the **adapter-owned catalog provider**.

```text
EngineAdapter
  ├── declareEngineCapability()     (existing S3)
  └── declareModelCatalogProvider() (P6)
         ├── staticSeed(): ModelIdentity[]
         ├── discoverModels?(): Promise<ModelIdentity[]>  // optional
         └── validateModelId?(id): boolean               // optional
```

**Registry** merges static + discovered entries **for that engine only**. Compatibility is **not** a global matrix claiming GPT-on-Cursor equals GPT-on-Copilot.

**Cross-engine alias collision:** forbidden at execution time — `pathKey` always includes `engineId`.

---

## 7. Catalog architecture

### 7.1 Modes

| Mode | When | Precedence |
|------|------|------------|
| **A. Dynamic discovery** | Adapter implements `discoverModels` and provider auth ready (**P6.8 optional**; Copilot **not** in MVP) | Discovered entries **overlay** static for same `providerModelId`; newer `discoveredAt` wins; availability still proven separately |
| **B. Static fallback** | Discovery fails, offline, unimplemented, or **Copilot MVP** | Static seed only; `availability: unknown` unless adapter attests |

### 7.2 Freshness (no polling mesh)

| Event | Action |
|-------|--------|
| Process start (Gateway/engine attach) | Lazy cache per engine — **one** discovery attempt if implemented |
| Operator `model catalog refresh` (PATH Code) | Explicit refresh; records `catalogRefreshedAt` |
| Execution | Resolver uses cache; does **not** block turn on network unless policy requires fresh catalog |
| Stale catalog | Label `availability: unknown`; allow explicit ID if adapter validates |
| Removed model | Mark `deprecated`; resolver fails closed for Auto, allows explicit with warning provenance |
| Unknown provider ID at runtime | Execution error or `actualModel: unknown` per adapter disclosure |

**Offline:** static seed + last-good cache; Auto degrades to adapter default with provenance `selectionSource: provider_default`.

---

## 8. Auto semantics

**Auto is not an engine selector.** Fabric has already fixed `engineId`.

**Auto (model)** means: within that engine, select the **platform default model policy outcome** using only:

1. Declared **model capability traits** attached to catalog entries (when adapter attests them).
2. **Turn need tags** from existing `inferTurnNeeds` (capability fit — not quality ranking).
3. **Availability** state.
4. **Operator/project policy** (allow/deny lists).

**When evidence is insufficient:** deterministic fallback chain:

```text
policy match (if any reliable trait match)
  → project default for engine (if set)
  → user default for engine (if set)
  → adapter-declared defaultModelId
  → first static seed marked default
  → fail with MODEL_RESOLUTION_FAILED (truthful error)
```

**Forbidden:** scoring models across providers; inventing benchmark rankings; Auto changing engine.

---

## 9. Preference hierarchy

Engineering model resolution runs **only after** Fabric has fixed `engineId`. **`--engineering-model`** and turn overrides never influence engine selection.

Engineering model resolution order (highest wins):

| Rank | Source | Field / mechanism |
|------|--------|-------------------|
| 1 | Turn explicit override | CLI `--engineering-model <id>`, Gateway dispatch `modelPreference`, or Builder explicit pick for **current engine** |
| 2 | Task checkpoint pin | G10 checkpoint `modelPreferences[engineId]` or turn pin fields — **canonical task scope** (not project file) |
| 3 | Project default | `.path/model-preferences.json` → `byEngine[engineId]` — **project default only**; file optional, explicit write only |
| 4 | User durable default | `preferences.json` v2 → `engineering.byEngine[engineId]` |
| 5 | Legacy env compatibility | `PATHCODE_CURSOR_MODEL`, `CURSOR_MODEL`, `AG1_MODEL`, etc. |
| 6 | Auto policy | §8 |
| 7 | Adapter/provider default | With `selectionSource: provider_default` |

**General Session** uses a **separate** chain: `--model` / session / `generalSession.modelId` / `PATHCODE_OPENAI_MODEL` — never mixed into engineering resolution.

**Invalid / unavailable / incompatible:**

| Condition | Behavior |
|-----------|----------|
| Model incompatible with selected engine | **Reject before SDK call** — `MODEL_INCOMPATIBLE` |
| Model unavailable in catalog | Explicit pref → fail; Auto → fallback per §8 |
| Removed from catalog | Explicit → execute only if adapter accepts; provenance `requestedModel` + `catalogStatus: deprecated` |
| Provider offline | Fail turn with `PROVIDER_UNAVAILABLE`; no silent engine switch |
| Provider internal fallback | Record `requestedModel` vs `actualModel` when disclosed; else `actualModel: null`, `actualModelKnown: false` |

**No silent substitution** without `fallbackOccurred: true` and `selectionSource` lineage.

**Model fallback ≠ engine fallback.** Engine peer handoff remains S3 only.

---

## 10. Provenance contract

### 10.1 Canonical record (`path.model.execution.v1`)

Persisted on each engineering turn completion (authoritative: G10 checkpoint `engineTurns[]` element — **extend** sealed fields):

| Field | Type | Required |
|-------|------|----------|
| `engine` | `cursor\|copilot\|antigravity` | yes |
| `engineMode` | string | yes |
| `provider` | string \| null | when known (AG) |
| `requestedModel` | string \| null | yes |
| `actualModel` | string \| null | when knowable |
| `actualModelKnown` | boolean | yes |
| `pathKey` | string \| null | when resolved |
| `selectionSource` | enum | yes |
| `fallbackOccurred` | boolean | yes |
| `catalogSource` | static \| discovered \| legacy_env \| null | when resolved |
| `autoPolicyVersion` | string \| null | when Auto |

**`selectionSource` enum:** `explicit_turn` | `task_pin` | `project_default` | `user_default` | `auto` | `provider_default` | `legacy_env` | `unknown`

### 10.2 Projections (read-only derivations)

| Surface | Source |
|---------|--------|
| Builder activity / product view | `child.engineModel` ← `actualModel` \|\| `requestedModel` |
| Engineering report | `extractProviderProvenance` extended |
| PATH Code history | checkpoint + report |
| Future Studio | same API read |

**One canonical store** — no duplicate conflicting model fields.

**Task pin authority (frozen):** task/turn model preference and per-turn execution truth live in the **G10 task checkpoint** (`modelPreferences`, extended `engineTurns[]`). The project file supplies **defaults for new turns only**. Reconstructing past execution from today’s `.path/model-preferences.json` is **forbidden** — use checkpoint provenance only.

### 10.3 `withEngineProvenance` evolution

Extend engineering turn result + checkpoint writer to include **model block** — still adapter-agnostic at contract level.

---

## 11. Gateway / Fabric integration

**Flow (unchanged engine step):**

```text
Gateway.dispatchEngineeringTurn
  → G10 fabric: selectEngineForTurn() → engineId
  → ModelPlane.resolve({ engineId, taskId, turn, prefs, env })
  → adapter.runEngineeringTurn({ ..., model: resolved.providerModelId })
  → ModelPlane.recordExecution(provenance)
  → checkpoint persist
```

**Model Plane is:** shared module + **per-adapter catalog provider registry** — **not** a Gateway microservice in P6 v1.

**Minimum API additions (design):**

| API | Owner | Purpose |
|-----|-------|---------|
| `ModelPlane.resolve(input)` | model-plane | Single resolver entry |
| `ModelPlane.listCatalog(engineId)` | model-plane | Builder/Studio/Code read |
| `ModelPlane.setPreference(scope, …)` | model-plane | Policy-gated writes |
| Gateway task params | gateway | Optional `modelPreference` on dispatch |
| G10 `noteEngineExecution` | ag10 | Accept full provenance block |

**No** new Gateway method required for P6 MVP if CLI/Builder call resolver through existing dispatch path — optional later: `model.catalog.list` JSON-RPC for headless clients.

**Fabric exports unchanged** except adapters call resolver before SDK.

---

## 12. Builder UX contract (minimum P6)

### 12.1 Default creator control (no explicit engine preference)

When there is **no** explicit engine preference and Fabric chooses engine per turn:

```text
Model: [ Auto ▾ ]
```

- **Auto** is the normal Builder control.
- Do **not** expose a global cross-engine model list on the primary Builder surface.
- Per-engine defaults may still exist in settings / `preferences.json` / `.path/model-preferences.json` (engine-scoped keys).

### 12.4 Explicit preferred engine (`PATHCODE_PREFERRED_ENGINE` / S3 preference)

`PATHCODE_PREFERRED_ENGINE` (and equivalent S3 preference inputs) remain **engine preference** — **not** Model Plane authority. A model choice must **never** force that engine.

When an explicit preferred engine is present, Builder may display:

```text
Preferred engine: Cursor
Model: [ Auto / Cursor-compatible models only ▾ ]
```

- Model picker is **scoped to that engine** (e.g. preferred `cursor` → Cursor-compatible catalog entries only).
- Example stored prefs: preferred engine = `cursor`, selected Cursor model = `composer-2.5` (under `engineering.byEngine.cursor` or project `byEngine.cursor`).

**Frozen corollaries:**

- **ENGINE PREFERENCE ≠ ENGINE GUARANTEE** — S3 may still legitimately execute a different engine (fallback / continuity).
- **MODEL PREFERENCE IS ENGINE-SCOPED** — preferences are keyed by `engineId`; they do not imply cross-engine applicability.

When Fabric chooses the engine per turn **without** explicit preference, use **§12.1** only.

### 12.2 Read-only execution facts (after resolution / execution)

```text
Engine: Cursor
Model: Composer 2.5
```

- Shown as **factual execution information**, not routing controls.
- If actual model unknown (e.g. Copilot CLI fallback): `Model: unknown` with `actualModelKnown: false` in provenance.

### 12.3 Frozen invariant

**MODEL SELECTION MUST NEVER IMPLICITLY SELECT OR REROUTE ENGINE.**

Builder is **not** an engine-routing surface. Per-engine project/user defaults are valid; cross-engine model picking is not.

| Rule | P6 behavior |
|------|-------------|
| Labels | “Model” ≠ engine; provider model names only as models |
| Catalog vs availability | Catalogued IDs may appear with `availability: unknown`; do not imply live provider guarantee |
| Advanced | Optional: `selectionSource`, requested vs actual |

**No Studio-grade override matrix in P6.**

### 12.5 S3 engine fallback vs engine-scoped model (frozen)

If S3 legitimately executes a **different** engine than the operator’s preferred engine (existing Fabric fallback / continuity behavior):

| Rule | Requirement |
|------|-------------|
| No model carry-over | Do **not** transfer the preferred engine’s model ID to the fallback engine (e.g. do **not** apply `composer-2.5` to Copilot because Cursor was preferred). |
| No model-driven reroute | Do **not** reroute back to the preferred engine **because of** model selection — engine choice stays S3. |
| Independent resolution | Resolve the **fallback engine’s** model via that engine’s own task / project / user / Auto / default hierarchy. |
| Provenance | Record **actual** `engine`, **requested** vs **actual** model for **that** execution turn truthfully. |
| Builder prefs | Engine-scoped Builder model preference must **not** block legitimate S3 engine fallback. |

---

## 13. PATH Code UX contract

### 13.1 General Session (unchanged consumer)

| Mechanism | Role |
|-----------|------|
| `--model <id>` | General Session brain model only |
| `/model <id>` | **General Session only** — frozen; do not use for engineering |
| `PATHCODE_OPENAI_MODEL` | Env fallback for General Session |
| `preferences.json` → `generalSession.modelId` | Durable GS default (v2) |

### 13.2 Engineering (frozen CLI)

| Mechanism | Role |
|-----------|------|
| `--engineering-model <model-id>` | **Only** shared engineering model override flag |
| `/engineering-model <id>` | **Engineering only** — frozen; do not overload `/model` |
| `--engine <cursor\|copilot\|antigravity>` | **S3 preferred engine** only — does not bypass Fabric fit for the turn |

**Forbidden flags:** `--cursor-model`, `--copilot-model`, `--antigravity-model`.

**Evaluation order:** Fabric resolves engine for the turn → Model Plane resolves model → incompatibility → `MODEL_INCOMPATIBLE` (no engine reroute).

**Example (illustrative):**

```bash
pathcode --engine cursor --engineering-model composer-2.5 …
```

Engine authority remains **S3**; the model flag applies only to the **already-selected** compatible engine.

### 13.3 Preferences and doctor

| Today | P6 migration |
|-------|----------------|
| `preferences.json` single `modelId` | v2: `generalSession.modelId` + `engineering.byEngine.{cursor,copilot,antigravity}` |
| Env pins | Legacy tier in engineering hierarchy; doctor lists sources |
| Project | `.path/model-preferences.json` on explicit write only |

**Reports / history:** `requestedModel` / `actualModel` / unknown — consistent with Builder; historical turns from **checkpoint**, not project defaults.

---

## 14. Future Studio API contract (read/write surface)

Studio must consume **the same Model Plane APIs** without a fork:

| Capability | API |
|------------|-----|
| Catalog read | `listCatalog(engineId?)` |
| Preference read/write | `getPreference` / `setPreference` (user, project default file, checkpoint task pin) |
| Task override | Gateway dispatch + checkpoint pin — **not** project file |
| Provenance | checkpoint projection + turn history |
| Availability | catalog + readiness join |

**No Studio-specific backend.**

---

## 15. Env-pin migration

| Variable | Consumer today | P6 disposition |
|----------|----------------|----------------|
| `PATHCODE_CURSOR_MODEL` | Cursor engineering | **Legacy compatibility** → maps to `engineering.byEngine.cursor` at resolve time; deprecation window |
| `CURSOR_MODEL` | Cursor engineering | Same, lower precedence than PATHCODE_* |
| `AG1_MODEL` | Antigravity bridge | **Legacy compatibility** for `antigravity` |
| `GOOGLE_CLOUD_MODEL` | Antigravity / bridge | **Provider-native env** — PATH reads but does not own; document as bridge input |
| `PATHCODE_OPENAI_MODEL` | General Session | **Retained** for brain path; migrate file prefs to `generalSession.modelId` |
| `OPENAI_MODEL` (gc1 scripts) | GC1 only | **Out of P6 engineering scope** — document boundary |

**No blind removal.** Doctor lists active legacy sources and effective resolution.

---

## 16. Persistence / config

**Reuse:**

- `preferences.json` (`pathcode.prefs.v1` → **`pathcode.prefs.v2`**) under `resolveStateDirectory` — **user** defaults
- G10 task checkpoint — **task pins** + **canonical execution provenance**
- Project file (frozen path): **`.path/model-preferences.json`**

### 16.1 `.path/model-preferences.json` (frozen)

| Rule | Requirement |
|------|-------------|
| Path | **`.path/model-preferences.json`** at project root |
| Optional | File may be absent |
| Contents | Model preferences **only** — same logical shape as `engineering.byEngine` |
| Secrets | **Never** — no credentials, API keys, or env secret material |
| Creation | **Not** auto-created on project open/bind |
| Write | Only on **explicit** operator/project preference action |
| Role | **Project default** for engineering model resolution — not task history |
| Task pins | **Excluded** — task pins live in checkpoint only |

**Proposed schema sketch:**

```json
{
  "schema": "path.model-preferences.v1",
  "byEngine": {
    "cursor": "auto",
    "copilot": "auto",
    "antigravity": "auto"
  },
  "updatedAt": "ISO-8601"
}
```

Values: provider model id string or `"auto"`.

| Scope | Storage | Authority |
|-------|---------|-----------|
| USER | `preferences.json` v2 (`generalSession` + `engineering.byEngine`) | `/model` (GS), `/engineering-model` or prefs commands (engineering) |
| PROJECT | `.path/model-preferences.json` | Explicit project preference action |
| SESSION | in-memory GS overrides | General Session loop |
| TASK/TURN | G10 checkpoint + dispatch params | Gateway; **canonical** for that task’s pin and execution record |

**Versioning:** `schema` field bump with migration reader v1→v2 (copy `modelId` → `generalSession.modelId`).

**No new database.**

---

## 17. Failure / fallback semantics

| Failure | Engineering response |
|---------|------------------------|
| Model unavailable | Fail turn; surface to Builder; **no** product repair |
| Model removed | Explicit → warn + attempt if adapter allows; Auto → re-resolve |
| Incompatible with engine | Pre-flight error |
| Catalog unavailable | Static seed + cache; provenance notes `catalogSource: static` |
| Provider auth failure | Existing `AUTH_REQUIRED` paths |
| Discovery failure | Log; use static |
| SDK rejects model ID | Turn error; provenance `executionRejected: true` |
| Provider internal fallback | Record discrepancy when known |

**Engine fallback** (peer handoff) — **unchanged S3**; must not be triggered by model resolution failure unless operator policy explicitly configures engine-level retry (out of P6 scope).

### 17.1 Engine fallback and engine-scoped models (frozen)

When S3 selects an engine **different** from the operator’s preferred engine:

- Model Plane resolves model **only for the engine that actually runs**.
- Previous engine’s model preference is **not** imported (no `composer-2.5` on Copilot because Cursor was preferred).
- Model Plane must **not** force Fabric back to the preferred engine.
- Checkpoint provenance must show the **actual** engine and per-turn requested/actual model for that engine.

See **§12.5** for Builder-facing rules.

---

## 18. Security / policy boundaries (P6 design only)

| Mechanism | P6 scope |
|-----------|----------|
| Model allow/deny lists | Project + user policy hooks in resolver |
| Credential boundary | Unchanged — env/keychain; model plane never stores API keys |
| Sensitive IDs | Redact in logs (existing patterns) |
| Cost metadata | **Not in P6** unless adapter supplies stable fields |
| Enterprise policy | Extension points only |

**No billing / cost optimization promises.**

---

## 19. Bounded implementation plan

| Pass | Purpose | Expected modules | Contract | Tests | Falsification | Migration | No-regression | Acceptance gate |
|------|---------|------------------|----------|-------|---------------|-----------|---------------|-----------------|
| **P6.0** | Identity + resolver skeleton | `model-plane/identity.mjs`, `resolver.mjs` | `path.model.identity.v1` | Unit: pathKey, validation | Wrong cross-engine key used | None | N/A | Types stable |
| **P6.1** | Cursor catalog + absorb env | `adapters/cursor-catalog.mjs`, wire `cursor-sdk` | Legacy env tier | Unit: env precedence | Fabric touched | Env still works | S3 tests green | Cursor turn uses resolver |
| **P6.2** | Provenance v1 on checkpoint | `ag10/index.mjs`, `task-checkpoint.mjs`, `reconcile.mjs` | `path.model.execution.v1` | `build-scope-fabric` extended | Fake actual model | Builder shows unknown honestly | S5 repair tests | requested/actual fields |
| **P6.3** | Copilot + Antigravity **factual static** catalogs | catalog providers | per-engine seeds | Unit | Claim discovery without SDK; fake Copilot `available` | AG1_MODEL still works | G10 fabric tests | AG + Copilot resolve; Copilot `actualModelKnown: false` OK |
| **P6.4** | Preferences v2 + migration | `preferences.mjs` | `pathcode.prefs.v2` | `history-prefs.test.ts` | Break General Session | v1 auto-migrate | GS tests green | OpenAI path unchanged |
| **P6.5** | Auto policy v1 | `auto-policy.mjs` | policy version string | Unit: deterministic fallback | Auto picks engine | N/A | Fabric unchanged | Auto never changes engine |
| **P6.6** | Builder model UI minimum | `build/surface/*` | UX contract §12 | UI/mechanical | Model labeled as engine | N/A | Builder repair freeze tests | Auto + pick list |
| **P6.7** | PATH Code commands + doctor | `pathcode.mjs`, `doctor.mjs` | CLI contract §13 | CLI tests | Silent env break | Deprecation warnings | Code UX | Doctor lists sources |
| **P6.8** | Dynamic discovery hooks (**OUT OF P6 CLOSURE**) | adapter-specific | discoveredAt | Per **§2.2** evidence bar | Not authorized in P6 | N/A | N/A | **Separate** operator authorization only |

**Closure scope (frozen):** **P6 complete = P6.0–P6.7 only.** **P6.8 is outside P6 closure** — separately operator-authorized future work; **no** dynamic discovery implementation is authorized now. P6 MVP does not depend on Copilot (or any) dynamic discovery.

**Preserves:** S1 Gateway, S2 adoption, S3 selection, S4 recovery, S5 Builder repair, Phase 7 product, ICE untouched.

---

## 20. P6 acceptance contract

Before P6 is declared **complete** (implementation phase):

### 20.1 Authority and routing

1. Fabric still selects engine (`selectEngineForTurn` unchanged in tests).
2. Model Plane resolves **only after** engine choice.
3. `--engineering-model` and Builder model picks **never** select or reroute engine.
4. Incompatible `--engineering-model` for selected engine → `MODEL_INCOMPATIBLE` (truthful failure).
5. Auto works without becoming an engine router.
6. No second registry/router.

### 20.2 Preferences and persistence

7. `preferences.json` v2: separate `generalSession.modelId` and `engineering.byEngine.*`.
8. Project defaults only in `.path/model-preferences.json` (optional, explicit write, no secrets, not auto-created).
9. Task model pins and execution history **canonical in G10 checkpoint** — not in project file.
10. Historical execution never derived from current project default.

### 20.3 Catalog, availability, provenance

11. Cursor env-only pin is **not** the sole mechanism — registry + prefs participate.
12. Explicit per-engine model preference works (CLI, Builder, prefs).
13. **Catalogued ≠ available** — static catalog entries do not auto-mark `availability: available`.
14. Execution provenance persists when knowable; Copilot may legitimately end with `actualModelKnown: false`.
15. Provider-default / unknown actual model labeled honestly.
16. No synthetic model provenance.

### 20.4 Engine preference, fallback, and slash commands

17. Engine-scoped Builder model preference **does not** prevent legitimate S3 engine fallback.
18. When fallback changes `engineId`, the **previous** engine’s model preference is **not** carried to the fallback engine.
19. Fallback turn: model resolved via **that** engine’s hierarchy; provenance records actual engine and truthful requested/actual model.
20. **`/model`** affects General Session only; **`/engineering-model`** affects engineering only — distinct consumers, no overload.
21. CLI remains `--model` (GS) and `--engineering-model` (engineering).

### 20.5 Surfaces, closure, and regression

22. PATH Code and Builder use the **same** resolver/catalog APIs.
23. Builder: §12.1 / §12.4 UX + read-only execution facts; invariant §12.3; preferred-engine scoped picker when applicable.
24. No S2/S4/Builder repair regression.
25. No new engineering engine.
26. Restart/recovery preserves user prefs + checkpoint provenance.
27. **P6 closure requires P6.0–P6.7 only** — **P6.8 is outside closure** and not authorized now.

**Architecture / implementation verification:** no paid live engine runs required for doc acceptance; implementation tests use mocks/mechanical paths where live engines are unnecessary.

---

## 21. Explicit non-actions

- Implement P6 code (this document only)
- Add Grok/xAI/Gemini/GPT as Fabric engines
- Replace `selectEngineForTurn`
- Builder repair reopen
- Gateway authority redesign
- ICE changes
- P7–P17 features
- Dynamic Model Registry marketing database
- Cost-based Auto routing
- Network polling catalog service
- Remote git push
- **P6.8** dynamic discovery (until separately operator-authorized per §2.2)

---

## 22. Evidence index

| Topic | Path |
|-------|------|
| Cursor model resolve | `scripts/pathcode-cli/ag10/cursor-sdk.mjs` (~165–171, 397, 530–532) |
| Copilot model option | `scripts/pathcode-cli/ag10/copilot-sdk.mjs` (~268–270, 439–476) |
| AG model identity | `scripts/pathcode-cli/ag1/cloud-env.mjs` |
| Engine provenance wrapper | `scripts/pathcode-cli/ag10/engine-contract.mjs` (~725–738) |
| G10 execution notes | `scripts/pathcode-cli/ag10/index.mjs` (~520–730) |
| Checkpoint seal | `scripts/pathcode-cli/ag10/task-checkpoint.mjs` (~235–261) |
| Provenance extract | `scripts/pathcode-cli/build/reconcile.mjs` (~90–112) |
| Builder child model | `scripts/pathcode-cli/build/controller.mjs` (~1459) |
| General Session prefs | `scripts/pathcode-cli/preferences.mjs` |
| OpenAI launch model | `scripts/pathcode.mjs` (~536–540) |
| Fabric selection | `scripts/pathcode-cli/ag10/engine-contract.mjs` `selectEngineForTurn` |
| Readiness disclaimer | `scripts/pathcode-cli/ag10/engine-readiness.mjs` (header) |
| Provenance tests | `tests/s5/build-scope-fabric.test.ts` |
| S3-01 disposition | `docs/reports/PATH_S1_S5_DEBT_DISPOSITION.md` §7 |
| Roadmap P6 | `docs/reports/PATH_POST_S5_ROADMAP_RECONCILIATION.md` §7, P6 table |

---

## Architecture readiness for P6.0

All operator decisions required to start **P6.0** implementation are recorded in **§2.1** and **§2.2**. There are **no remaining open questions that block P6.0**.

Future work (not blocking): **P6.8** dynamic discovery — separately authorized per §2.2 when/if operator approves.

---

*End of P6 architecture specification (design only).*
