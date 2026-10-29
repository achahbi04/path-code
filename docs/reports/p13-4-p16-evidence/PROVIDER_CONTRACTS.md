# Provider contract recheck

Rechecked in the cloud tranche on 2026-10-18 using TLS verification.

- Supabase official OpenAPI: `https://raw.githubusercontent.com/supabase/supabase/master/apps/docs/spec/api_v1_openapi.json`. Both `/v1/projects/{ref}/config/auth` methods exist; the PATCH schema `UpdateAuthConfigBody` includes all eleven frozen fields with the specified string/boolean types. This source specifies bearer authentication. Token scopes still require live owner validation.
- Stripe official OpenAPI: `https://raw.githubusercontent.com/stripe/openapi/master/openapi/spec3.json`. `/v1/account` exists; all eight distinct frozen Checkout/subscription/invoice event names occur in the current specification. No inferred Checkout capability is reported by account verification.
- Capacitor official v8 documentation: `ionic-team/capacitor-docs`, `versioned_docs/version-v8/main/getting-started/environment-setup.md`. Node >=22, Xcode >=26.0, Android Studio >=2025.2.1. The main branch documents the next v9 requirements; it was not used to change the frozen v8 target.
- npm registry `@capacitor/{core,cli,ios,android}`: all four current stable versions resolved to **8.5.3**. CLI package inspection confirms `--packagemanager` accepts SPM. All four dependencies are pinned exactly in each packaging workspace.

Direct requests to the provider documentation websites returned proxy 403 responses. Official source repositories and the npm registry provided the contracts above; no TLS, signature, checksum or certificate verification was disabled.

Real native evidence uses an anonymous disposable local Git fixture, actual npm installation and Capacitor Android add/sync through the coordinator. It does not build an APK, sign artifacts or create provider resources.
