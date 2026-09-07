# PATH CODE — PHASE 5E1 OPENAI TRANSPORT AMENDMENT 1

**Prospective extension of:** architecture import/I/O bans for Brain, orchestrator, and mutation layers.  
**Does not rewrite** historical no-network promises for those modules.

---

## Named network owner

| Item | Value |
|---|---|
| Production owner | `src/adapters/openai/transport.ts` |
| Allowed primitive | Installed Node platform `fetch` (captured at adapter construction) |
| Destination | Exact constant `https://api.openai.com/v1/responses` |
| Redirects | `redirect: "error"`; every 3xx rejected; Location never followed or echoed |
| Credentials | Attached only as `Authorization: Bearer …` at last transport step for that URL |
| Env / argv / cwd | Forbidden under `src/adapters/openai/**` |
| SDK / HTTP libraries | Forbidden; no new package dependency |

Sibling modules under `src/adapters/openai/` may call the owner-private send path; they must not call `fetch` directly.

---

## Affected architecture assertions

| Suite | Change |
|---|---|
| `tests/brain/architecture.test.ts` D22 reverse-import | Exempt `src/adapters/**` (same pattern as orchestrator): adapters may import brain package-internal helpers/types |
| `tests/adapters/openai/architecture.test.ts` (new) | Allowlist openai modules; only `transport.ts` may reference `fetch`; no `process.env`; no reverse imports into gates/mutation/editing/Validation/Engineering Run; finite barrel exports; not on `src/index` |
| Orchestrator / mutation / brain production fetch bans | Unchanged — remain true for those trees |

---

## Preserved earlier-layer promises

- Brain / Gate 1 / Gate 2 / Validation / editing / orchestrator / mutation production modules remain free of `fetch` and adapter env reads.
- A network primitive in the concrete OpenAI adapter is an **explicit new owner**, not a blanket exception for every future adapter.
- Trusted host still owns ActionClass `NETWORK_ACCESS` / `SECRET_ACCESS` before composing this adapter.

---

## Test seam

Deterministic tests install a recording `globalThis.fetch` **before** `createOpenAIAdapter`, or import owner-private helpers from non-barrel module paths. Real request builder, admission, destination assertion, header attachment, bounded reader, and response translator always execute. A fake `send` that returns already-classified success is not authorized as proof.
