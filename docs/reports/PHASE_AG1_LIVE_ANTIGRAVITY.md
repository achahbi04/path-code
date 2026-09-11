# PHASE AG1 — Live Antigravity (operator acceptance)

**Status:** LIVE PASS (credentialed Vertex/ADC)

## Divergence found (operator screenshot)

Normal NL task appeared to complete with legacy Gate 1 evidence and `0 model calls`.

Root causes (mechanical):

1. **Bridge stdin theft** — Antigravity local harness inherits fd 0; PATH JSONL protocol saw EOF and cancelled the task (false `cancelled`, hiding real engine errors).
2. **False Complete** — agent “complete” / partial validation mapped to PATH Complete while Gate 1 still waiting.
3. **Misleading telemetry** — “model calls” counted legacy OpenAI only; AG1 always reported 0.
4. **Auth** — `GEMINI_API_KEY` present but rejected (401). Working path: Vertex ADC + `GOOGLE_CLOUD_PROJECT` + model `gemini-2.5-flash` (default Agent Platform model was unavailable).

## Fixes

- Isolate protocol stdin off fd 0; do not cancel in-flight work on protocol EOF.
- AG1 terminal: Verified / Partially verified / Failed / Not verified — never Complete on failure.
- AG1 evidence column (no Gate 1 / Gate 2); banner “PATH engineering session”.
- Footer: task count + engineering activities (not OpenAI model calls).
- Vertex preferred when cloud project + ADC available; default model `gemini-2.5-flash`.
- `hydrateAg1CloudEnv` loads gcloud project when unset.

## Live proof (this machine)

| Check | Result |
| --- | --- |
| Entered Antigravity | yes (`session.engineering.bridge` spawn + `started`) |
| Real SDK activity in events | Understanding → Inspecting → Editing → Testing → Verifying |
| Project modified | `src/sum.js` in isolated worktree |
| Primary checkout untouched | yes |
| PATH independent validation | passed |
| Terminal | **Verified** |

Diag artifacts: `.path-code-tmp/ag1-diag/live-drive-*.json`

## Operator note

Export is optional when `gcloud` project + ADC exist. For explicit Vertex:

```bash
export GOOGLE_CLOUD_PROJECT=…
export GOOGLE_CLOUD_LOCATION=us-central1
export GOOGLE_GENAI_USE_VERTEXAI=true
# optional: export AG1_MODEL=gemini-2.5-flash
```

A Gemini API key that returns 401 will not drive AG1; use Vertex/ADC or a valid AI Studio key.
