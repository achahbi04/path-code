# PATH BUILDER — P13.4→P16 CONSOLIDATED CORRECTION REPORT

## A. Preflight

- Repository: `achahbi04/path-code`.
- Starting authority branch: `codex/path-builder-p13-4-p16`.
- Exact starting parent: `e7dac89edcfb0eca2b219df019c014cb191d2bcc`.
- Correction branch: `codex/path-builder-p13-4-p16-corrections`, created directly from that parent.
- Protected accepted baseline: `5638ac85bf7edfbca9eb1f1df8da223ee033be03`.
- Preserved review branch, `work`, accepted branch and `main` are not changed by this mission. Protected remote heads were captured before implementation and verified unchanged after the correction/evidence push. The final completion report supplies final remote-head equality; draft PR creation is blocked by the Cloud egress policy described in J/K.

## B. RC-1 — Native disk monitor

Root cause: the timer performed a synchronous recursive whole-workspace scan and mapped every exception to `NATIVE_DISK_LIMIT`. Ordinary concurrent deletion could therefore terminate valid packaging and block coordinator responsiveness.

Correction in `scripts/pathcode-cli/build/native-executor.mjs`: streaming asynchronous directory iteration, one non-overlapping scan at a time, cancellation when execution ends, existing 200,000-entry and byte caps, and a 128-open-directory traversal budget. Only descendant `ENOENT` / `ENOTDIR` races are tolerated. Permission/I/O failures and traversal-budget exhaustion fail closed as `NATIVE_WORKSPACE_UNAVAILABLE`; actual measured byte/entry overflow remains `NATIVE_DISK_LIMIT`. Direct and chained escaping links are rejected without following them. Physical-root traversal accepts normal macOS parent aliases but rejects a linked workspace itself. Post-command accounting uses the same asynchronous walker. Stable artifact inspection remains bounded and rejects root links.

Tests in `tests/s5/build-native-corrections.test.ts` cover real create/delete/rename churn, deterministic deletion during stat/open, deliberate EACCES handling, real child termination on measured overflow, depth bounds, symlink containment, macOS parent aliases, argv-only spawn, timeout and output caps. Existing actual coordinator-death containment and child-environment stripping tests also pass. The execution guard is unchanged. Production timeout (300,000 ms), output (1 MiB), workspace (1 GiB), artifact (256 MiB), entry and checksum caps are unchanged.

Direct before/after reproduction: the original walker raised 22 transient ENOENT errors in 160 churn sweeps; all 20 corrected asynchronous sweeps completed without errors. These old traversal exceptions were the errors the original command monitor mislabeled as disk overflow. Result: **PASS**.

## C. RC-2 — Artifact scanner

Root cause: artifact inspection reused the generic input-admission `secretLike` pattern, which intentionally treats generic Bearer syntax and PEM headers as suspicious. Ordinary Supabase client source was consequently rejected.

Correction, also in `native-executor.mjs`: an artifact-specific private-material classifier retains Supabase/Stripe/restricted/webhook/GitHub private prefixes and detects PEM payload rather than a header literal. Raw and JSON-escaped private PEM payloads, including exposed standard truncated bodies, fail closed. Exact selected-private-value sentinels and their base64 encoding remain enforced. Generic input-admission and event-redaction patterns are unchanged; only artifact classification is narrowed.

Representative Supabase client class text containing `Bearer ${this.supabaseKey}` and ordinary PEM parser header constants is accepted. Real generated ephemeral PKCS8/PKCS1 RSA private keys are rejected in raw and JSON-escaped forms. All private-prefix classes and arbitrary selected OAuth-private sentinels remain rejected. The three exact public binding names are each tested through coordinator packaging; deliberately placing private Supabase material under the same names still fails. Case variants, near misses and arbitrary public-prefixed secret names remain rejected by unchanged P9 admission. Durable record/event assertions exclude the test values; no private keys or provider material are printed in evidence. Result: **PASS**.

## D. RC-3 — Missing invariant tests

All 26 newly added RC-3 cases are in `tests/s5/build-product-operations.test.ts`. All 22 new RC-1/RC-2 cases are in `tests/s5/build-native-corrections.test.ts`.

The complete requirement → implementation path → exact parameterized test → assertion → result mapping is in [REQUIREMENT_TEST_MAP.json](p13-4-p16-corrections-evidence/REQUIREMENT_TEST_MAP.json), with a readable [exact-test table](p13-4-p16-corrections-evidence/REQUIREMENT_TEST_MAP.md). Every one of the 48 new cases passed.

| Frozen invariant | Implementation | Exact test or parameterized test template in build-product-operations.test.ts | Assertion / evidence | Result |
|---|---|---|---|---|
| P14 post-effect uncertainty | auth-operations.mjs | keeps a possibly applied Auth PATCH uncertain after it %s, never retries it, and explicitly reconciles | Thrown and failed PATCH responses remain uncertain; one PATCH; explicit reconciliation records interrupted, never failed_no_effect. | PASS |
| P14 worker-loss recovery | auth-operations.mjs | recovers durable effect_started Auth state after simulated worker loss without repeating PATCH | Inject loss after successful PATCH and before terminal write; durable effect_started survives and reconciles without PATCH replay. | PASS |
| Payments pending restore | payments.mjs | blocks payment create, update and delete at preparation and coordinator boundaries during pending restore | Both boundaries reject all three actions; record bytes unchanged. | PASS |
| Canonical-source symlinks | native-operations.mjs / deploy-source.mjs | rejects canonical source symlinks before native materialization | Committed link is rejected before preparation; no pending operation. | PASS |
| Artifact/path escape | native-executor.mjs | rejects linked artifact roots, nested symlinks and escaping static web roots | Root link, child link and ancestor escape are rejected. | PASS |
| Next static export | native-executor.mjs | requires actual Next static index output, accepting out/index.html and rejecting server-only .next output | Real output-tree fixture: server-only .next fails, out/index.html succeeds, content copied exactly and checksummed. Synthetic command executors; not a claim of real Next compilation. | PASS |
| Total retention size | native-operations.mjs | enforces total retained bytes across profiles and removes oldest workspace before exceeding the cap | Sparse historical artifacts fill the 1 GiB cap across distinct profiles; new output evicts oldest workspace and preserves later ones. | PASS |
| Restore non-rewind | historical-restore.mjs / native.mjs | completed historical restore preserves newer Auth, Payments and Native authority and projects old-source artifacts stale | Real disposable Git forward restore changes product tree; all three newer authority objects remain equal and artifact projects stale. | PASS |
| Unsafe transport | runtime/product-env.mjs | preserves BUILD_TRANSPORT_UNSAFE for unsafe transport %s | Four negative cases preserve the resolver error; existing native-preparation labeling is unchanged. | PASS |
| Exact public-key exception | environments.mjs / native-operations.mjs / native-executor.mjs | accepts the exact public client binding %s but rejects private material under that same name; rejects case variants, near misses and arbitrary public secret name %s | All three exact names accepted; private-value disguise blocked; ten negative name cases rejected. | PASS |

## E. RC-4 — build-running-identity fixture

The original unmodified test was reproduced failing with `ERR_MODULE_NOT_FOUND` for `pg`. Its copied package contained scripts/package.json without installed dependencies. The bounded correction in `tests/s5/build-running-identity.test.ts` gives the disposable package a Git-ignored directory symlink to the existing installed `node_modules`. The real surface and independent coordinator still start; no identity assertion is removed, weakened or mocked. Fresh identity, stale-checkout detection, clean coordinator identity and coordinator replacement assertions all pass.

The same test passes on the correction branch and in an isolated detached accepted-baseline worktree with **only this fixture correction**. That temporary worktree was removed. No production dependency resolver or runtime workaround was added. See [RC4_BASELINE_PROOF.json](p13-4-p16-corrections-evidence/RC4_BASELINE_PROOF.json). Result: **PASS**.

## F. Protected-stage preservation

Separate focused protected regression run: 26 files, **319 passed / 0 failed / 0 skipped**. These files are also covered by the final full run.

| Stage | Files | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| P9 | 4 | 24 | 0 | 0 |
| P10 | 7 | 79 | 0 | 0 |
| P11 | 3 | 83 | 0 | 0 |
| P12 | 4 | 32 | 0 | 0 |
| P13 | 8 | 101 | 0 | 0 |

P9 admission/runtime, P10 source/deploy, P11 domain authority, P12 integrations and P13 database/provider/pg production files are unchanged from the preserved tranche. The sole production delta is `native-executor.mjs`; no accepted P13 authority was reopened.

## G. Full test evidence

- Tested implementation commit: `8d46171eea159f642afc7d9b846d7a576fa5d8e1`; parent is the exact preserved completed SHA.
- `git diff --check`: PASS; repeat branch-wide check before delivery.
- `npm run typecheck`: PASS.
- `npm run build`: PASS.
- Focused new/original tranche + identity suites: **103 passed / 0 failed / 0 skipped**.
- New correction tests: **48 passed / 0 failed / 0 skipped**.
- Protected-stage suites: **319 passed / 0 failed / 0 skipped**.
- Accepted-baseline identity fixture proof: **1 passed / 0 failed / 0 skipped**.
- Final fixed-tree full suite: **2175 passed / 30 failed / 0 skipped**, 2205 total; command exit **1** for known baseline failures.
- New failures: **0**. Correction-related failures: **0**. Missing previous test cases: **0**.
- Remaining known failures: **29 ENVIRONMENT_LIMITATION**, **1 CONFIRMED_DEFECT** (the pre-existing GC1C mock-session artifact-saving event). The identity fixture moves from known confirmed defect to resolved, proven on both baseline and correction code. No other classification is changed.

Every remaining case is listed in [FULL_TEST_DELTA.json](p13-4-p16-corrections-evidence/FULL_TEST_DELTA.json); aggregated command/stage evidence is in [VERIFICATION.json](p13-4-p16-corrections-evidence/VERIFICATION.json). Linux/macOS host restrictions, unavailable AG1 runtime/venv and writable-HOME/initial-branch fixture assumptions are reported rather than hidden or fixed outside scope.

An earlier in-flight full run crossed a final monitor-bound update and mixed the old loaded module with the new depth-code assertion. It is explicitly retained as non-authoritative in [INTERMEDIATE_RUN_NOTE.json](p13-4-p16-corrections-evidence/INTERMEDIATE_RUN_NOTE.json). Final full validation was restarted after committing the fixed source and tests, and uses that stable commit; no source/test edits were made during the final run.

Reproduce on the correction branch with installed dependencies:

```bash
npm run typecheck
npm run build
npx vitest run tests/s5/build-native-corrections.test.ts tests/s5/build-product-operations.test.ts tests/s5/build-product-operations-http.test.ts tests/s5/build-product-operations-surface.test.ts tests/s5/build-running-identity.test.ts
npm test
git diff --check e7dac89edcfb0eca2b219df019c014cb191d2bcc HEAD
```

## H. Security invariants

No raw credentials are added to browser payloads, records, events or evidence. Actual PEM values exist only in disposable test fixtures and are not printed. Selected-private-value scanning, private credential classes and exact public Supabase exceptions remain enforced. No shell is introduced; argv boundaries and child-environment stripping pass. Fixed provider transport, ingress validation, timeout/output/disk caps, owned process groups and coordinator-death guard remain intact. No live provider mutations were performed.

## I. Architecture conformance

No new authority, worker/service architecture, P17 implementation, Engine Fabric change, generic OAuth/provider layer, dependency graph or alternate Git/checkpoint/adoption authority. Existing native executor, authority and coordinator mechanisms remain authoritative. The governing V2.1 specification and original Cloud report are unchanged.

## J. Git preservation

- Implementation correction commit: `8d46171eea159f642afc7d9b846d7a576fa5d8e1` — `fix(builder): harden native monitoring and prove frozen tranche invariants`.
- Evidence closure commit: `79c7353186f1593572411c1db65ad73fa41c52a3` — `docs(builder): record consolidated correction verification and invariant evidence`. A final documentation-only delivery-gate record follows; its exact SHA is supplied in the completion report.
- Delivery branch: `codex/path-builder-p13-4-p16-corrections`.
- Draft PR target: `cursor/pathcode-antigravity-v1`; title: **PATH Builder P13.4–P16 corrections (review only — do not merge)**. **Not created**: the Cloud proxy blocks HTTPS CONNECT to `api.github.com` with HTTP 403 before GitHub can receive either GraphQL or REST requests. Exact REST error: `Post "https://api.github.com/repos/achahbi04/path-code/pulls": Forbidden`. Expanded network permission and approved escalated execution did not remove this egress block. No GitHub token or authentication was changed.
- Original review branch remains `e7dac89edcfb0eca2b219df019c014cb191d2bcc`; accepted branch remains `5638ac85bf7edfbca9eb1f1df8da223ee033be03`; main remains `5a1784d8f033251caf9c0c3be102c9eb2f0cd345`. All three protected remote refs were compared equal after push.
- No amend, rebase, squash, force push, accepted-branch update, repository merge or deployment. The source/evidence push was verified by fetch and exact local/remote HEAD equality. Final clean-worktree and remote-head checks are repeated after the delivery-gate documentation commit.

## K. Remaining acceptance gates

- **Delivery gate:** the owner/platform must allow HTTPS CONNECT to `api.github.com` in this Cloud environment’s outbound network policy, then create the authorized draft PR. This is a verified network-layer block, not evidence that the already-granted repository or pull-request permissions are insufficient. Git transport to `github.com` works and the correction branch is preserved. All RC-1 through RC-4 implementation and verification work is complete; the mission remains blocked solely on the required draft PR. See [GITHUB_DELIVERY.json](p13-4-p16-corrections-evidence/GITHUB_DELIVERY.json).

- P13.4 live/local final database UX acceptance.
- P14 live Auth/social/runtime acceptance.
- P15 live Stripe/Checkout/webhook/fulfillment acceptance.
- P16 macOS native/toolchain/binary/signing acceptance, including final local full-suite verification. The Cloud fixture proof does not claim macOS binary acceptance.

## L. Final status

`BLOCKED — CORRECTIONS_NOT_COMPLETE`
