# PATH CODE — V1 RELEASE LOCK RECORD

Product: PATH Code 1.0.0  
Local tag: `v1.0.0` (created only after exact artifact acceptance)

## Support

| Item | V1 claim |
| --- | --- |
| Platform | macOS Apple Silicon (`darwin` / `arm64`) |
| Node.js | `>=22` (smoke-proven on 22, 24, and 26) |
| Engineering engine | Google Antigravity SDK `google-antigravity==0.1.16` |
| GitHub delivery | Official `gh` (feature-specific) |

## Package

| Item | Value |
| --- | --- |
| npm name | `path-code` |
| version | `1.0.0` |
| tarball | `path-code-1.0.0.tgz` |
| packed-size ceiling | 5 MiB |
| allowlist | `package.json` `files` (no `gc1/`, no `ensure-venv.sh`) |
| audit | `npm run audit:release -- --tarball <tgz>` |

## Installation (pre-registry)

```bash
npm install -g ./path-code-1.0.0.tgz
pathcode --version
```

## Acceptance (installed artifact)

Recorded in the AG6 final Cursor report: R1–R6, failure regression, sanitation SHA-256, and local tag binding.

Publication: **NOT PUBLISHED** unless separately authorized.
