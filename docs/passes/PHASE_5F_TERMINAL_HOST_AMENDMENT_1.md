# PHASE 5F — Terminal Host Amendment 1

Application-host permissions for the first live engineering trial CLI. Prospective; does not widen kernel, Brain, adapter, mutation, gate, or authorization semantics.

| Concern | Decision |
|---|---|
| Brain / adapter / mutation / conductor / gates | Compose existing owners unchanged |
| Human terminal choices → existing owner approvals | Trusted application host responsibility, not model authority or a new authorization system |
| Synthetic trial provisioning | One named host-only filesystem provisioning module (`scripts/pathcode-cli/fixture-store.mjs`); not an alternate repository writer |
| Exact review rendering / TTY input / credential acquisition | Named terminal-host modules under `scripts/pathcode-cli/`; not permissions granted to the kernel or adapter |
| Command packaging / local install helper | Application distribution metadata only; preserve legacy `dist/cli/entry.js` behavior and root exports |
| Result display | Safe telemetry plus actual owner outcomes; no fabricated CompletionReport/EvidenceRecord |
| General workspace operation / automatic retries / Git automation | NOT_APPLICABLE to this trial |

## Named host modules

| Module | Permission |
|---|---|
| `scripts/pathcode.mjs` | Thin executable entry; argv routing; legacy delegation |
| `scripts/pathcode-cli/banner.mjs` | Presentation-only wordmark |
| `scripts/pathcode-cli/escape.mjs` | Display-only escaping of untrusted text |
| `scripts/pathcode-cli/terminal.mjs` | TTY prompts, hidden credential input, challenge grammar |
| `scripts/pathcode-cli/fixture-store.mjs` | Exclusive create of multiply-01 synthetic files only |
| `scripts/pathcode-cli/child-env.mjs` | Explicit check child environment construction |
| `scripts/pathcode-cli/trial.mjs` | Trial orchestration; host-only approval minting after prompts |
| `scripts/pathcode-cli/report.mjs` | Safe outcome rendering |
| `scripts/install-pathcode-local.mjs` | Operator-only user-local symlink helper |

Authorization constructors (`explicitEditApproval`, `authorizePreparedChange`, `explicitLocalProcessApproval`, `authorizeValidationPlan`) are invoked only from the host after prompt-specific human confirmation.
