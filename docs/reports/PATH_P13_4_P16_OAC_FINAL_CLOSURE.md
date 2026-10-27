# PATH P13.4 → P16 — OAC-FINAL Closure Record

Docs-only record. No code, tests, or historical reports were modified.

## Baselines

- Entry implementation baseline: `a48c08bff302626e769f62621f75a3e3667b3a96`
- OAC-14 static-readiness correction: `9ddbd95c7d2b0fc8abffbce968c4900d7d52237f`
- Branch: `codex/path-builder-p13-4-p16-corrections`
- PR #2: OPEN / DRAFT / UNMERGED (base `e7dac89edcfb0eca2b219df019c014cb191d2bcc`)
- P17: **has NOT started** (HOLD)

Safe evidence (no private values) lives outside the repository under `PATH OAC Evidence/` (`oac-0`, `oac-13`–`oac-16`, `oac-final`).

## Gate results

### OAC-13 — PASS / CLOSED
Real Supabase project creation (ref `uakyurfnamnyuqvqgyce`), ACTIVE_HEALTHY, database password rotated to a strong random value, real Postgres probe (PostgreSQL 17.11), migration observation `none`, restart persistence, clean secret scan.

### OAC-14 — PASS / FULLY CLOSED
Real Auth GET and PATCH, drift guard `AUTH_PROVIDER_CONFIG_DRIFTED` with `failed_no_effect`, provider restored (`matchesDesired = true`), email and GitHub enabled, email signup/login/logout/relogin, GitHub OAuth session, static Auth readiness correction at `9ddbd95c`, readiness = ready.

### OAC-15 — PASS / CLOSED
P12 account ready (`acct_1U8NdMC990JVvfpa`, `stripe.mode.test`), real Product, Price, public Vercel endpoint and webhook endpoint, real Checkout Session, hosted Checkout success, signed `checkout.session.completed`, database fulfillment row, Vercel secret functional proof, restart persistence, clean leak scan.

### OAC-16 — PASS / CLOSED
Fixture source authority (`446cbfa8`), PATH Build authority, real P16 prepare and execute, packaged iOS+Android artifact, real iOS Simulator compilation, real Android debug APK compilation, restart persistence, source-authority staleness proof (authority moved to `20942fad`, artifact projected `stale`), clean secret scan.

## Recorded limitations (not strengthened)

- OAC-14: a real inbox confirmation click was not exercised; confirmation-required behavior and confirmed-user session behavior were proven separately (Supabase Admin API confirmed the test user).
- OAC-15: the handler's exact returned HTTP 200 status was not separately captured. Successful signature verification, durable fulfillment, and Stripe `pending_webhooks: 0` prove successful provider delivery/acknowledgment.
- OAC-15: the Stripe verification credential was bound in the production environment rather than a dedicated one, because the P9 `local_env_file` resolver only permits same-environment local names.
- OAC-16: no simulator/emulator runtime launch (optional by contract).
- OAC-16: Android compilation required `npm ci` in a disposable copy of the retained artifact because P16 intentionally removes `node_modules`; accepted as dependency rehydration, not native-project regeneration.
- OAC-16: Gradle auto-installed Android platform 36 and build-tools 35.0.0 into the local SDK.

## Provider cleanup disposition

| Resource | Disposition |
|---|---|
| Supabase `uakyurfnamnyuqvqgyce` (OAC project) | DELETED (also removed OAC-13 DB, OAC-14 Auth users/config, OAC-15 fulfillment table, project keys) |
| Supabase `llggmlmpjxqqrbfnjbii` (historical p13) | RETAINED / UNTOUCHED |
| Stripe Nordic Rain sandbox | RETAINED / PRE-EXISTING (standard key not rotated) |
| Stripe Product / Price | ARCHIVED (`active=false`) |
| Stripe webhook endpoint | DELETED |
| Stripe Checkout/payment/event objects | RETAINED as immutable test history |
| Stripe claimable sandbox `acct_1UUmfCA3O0DDz4qb` | UNCLAIMED / UNUSED / AUTO-EXPIRY 2026-11-02 / NO OAC DEPENDENCY |
| Vercel `path-oac15-acceptance` | DELETED |
| GitHub OAuth App "PATH OAC 14" | DELETED (single owner browser action; no API exists) |
| Local OAC secret copies, OAC-16 build outputs | REMOVED |

Member Desk PATH authority was unwound through normal mutations (payment → Stripe integration → Auth → database → P9 bindings); it now holds no OAC payment, integration, Auth, database, or secret-binding records. Audit history was not erased.

## Final secret-leak scan

~190k files across the PATH repo, PATH runtime state, Member Desk, OAC evidence, fixtures, and scratch: Supabase access token, DB password, `DATABASE_URL`, GitHub client secret, Stripe private key, and `sk_`/`rk_`/`whsec_`/`sbp_` patterns all NOT_FOUND. The exact webhook signing secret was never locally recoverable (Vercel Sensitive) and is covered by pattern only.

## Decision

P13.4 → P16: FULLY CLOSED. P17 remains HOLD pending the owner's decision on PR #2 disposition and P17 start authority.
