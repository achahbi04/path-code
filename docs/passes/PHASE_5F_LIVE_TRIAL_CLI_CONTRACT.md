# PATH CODE — PHASE 5F: FIRST LIVE ENGINEERING TRIAL + TERMINAL LAUNCHER
## Contract (implementation binding)

This pass delivers the `pathcode` terminal application host and proves it offline. It does not authorize the implementer to read a real API key, run billable inference, approve live model changes, install a global command, or change shell startup files.

## FOUNDATION COMPATIBILITY PREFLIGHT

| Value | SHA / path |
|---|---|
| Active worktree | `/Users/achahbi/Projects/path-code-worktrees/cursor-phase4-execution-core` |
| Starting branch | `cursor/phase5e1-openai-adapter` |
| Starting / accepted 5E1 HEAD | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Canonical-tested 5E1 implementation | `3c3b8cf10f20c769303e5d83e25a54e9dcc737f1` |
| New branch | `cursor/phase5f-live-trial-cli` |
| Main after authorized FF integration | `525d74c4a92ae30a13fa0a2ae62bc305cc3115de` |
| Historical main on entry | `ecf480faff53560133309df36837534a38b7f4cb` |

## Product decision

Command: `pathcode`. Display: `PATH ● Code` (U+25CF). First application host over the implemented core. `/trial` runs ONE fixed task (`multiply-01`) in a newly provisioned synthetic workspace. Not a general coding-agent release.

## Host boundary

Compose existing owners: OpenAI adapter, EngineeringBrain, Phase 2 observation/catalog builders, `openEngineeringMutationSession`, Phase 3 edit authorization, Validation authorization, conductor / Engineering Run / Gate 2. The host supplies disclosure, credential acquisition, exact review rendering, prompt-specific approvals, and fixture provisioning — not replacements for those owners.

See `PHASE_5F_TERMINAL_HOST_AMENDMENT_1.md` for named host permissions.

## Trial budgets (exactly one trial per invocation)

| Quantity | Bound |
|---|---|
| Model invocations / Brain dispatch | 2 |
| Adapter transport attempts | 2 |
| Output tokens | 4096 / call; 8192 cumulative |
| Request body | 131072 / call; 262144 cumulative |
| Brain deadline | 90000 ms / call |
| Edit-profile calls | 1 |
| Post-edit reasoning | 1 (`maxBrainAttempts: 1`) |
| Mutation dispatches | 1 |
| Validation plan executions | 1 (TYPECHECK + TARGETED_TEST) |
| Automatic retries / provider fallback | 0 |

## Two human approval boundaries

1. `START <challenge>` — trial/network consent (not edit/validation authority).
2. `APPLY <challenge>` — bound to exact MutationReview; then host mints EditAuthorizations and `session.apply`.
3. `CHECK <challenge>` — bound to exact MutationValidationReview; then host mints ValidationAuthorization and `session.validate`.

## Packaging

- `scripts/pathcode.mjs` — shebang entry; `node scripts/pathcode.mjs` fallback.
- `package.json` bin `pathcode` → `./scripts/pathcode.mjs`; legacy `dist/cli/entry.js` preserved and delegated for foundation flags.
- `scripts/install-pathcode-local.mjs` — operator-only `~/.local/bin/pathcode` symlink; Cursor must not run real install.

## Acceptance

T01–T30 with exact test references; P1–P3 bounded falsifications; canonical offline `npm run check`; `LIVE_ENGINEERING_TRIAL: NOT_RUN_BY_IMPLEMENTER`.

Full instruction text retained by the operator FINAL package; this contract binds the implementable surface.
