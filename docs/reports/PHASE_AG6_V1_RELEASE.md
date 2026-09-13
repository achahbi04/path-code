# PATH CODE — V1 RELEASE LOCK RECORD

Product: PATH Code  
Local tags: `v1.0.0` (immutable engineering release), `v1.0.1` (distribution hotfix)

## Support

| Item | V1 claim |
| --- | --- |
| Platform | macOS Apple Silicon (`darwin` / `arm64`) |
| Node.js | `>=22` (smoke-proven on 22, 24, and 26) |
| Engineering engine | Google Antigravity SDK `google-antigravity==0.1.16` |
| GitHub delivery | Official `gh` (feature-specific / optional) |

## Package

| Item | Value |
| --- | --- |
| npm name | `path-code` |
| engineering release | `1.0.0` (immutable; GitHub published) |
| distribution hotfix | `1.0.1` (removes npm `private` publication guard only) |
| packed-size ceiling | 5 MiB |
| allowlist | `package.json` `files` (no `gc1/`, no `ensure-venv.sh`) |
| audit | `npm run audit:release -- --tarball <tgz>` |

## Installation

```bash
npm install -g path-code
pathcode --version
```

## Notes

- `v1.0.0` / commit `e35cbfc58d01045f7b2436fa5b8cff7dda7f81da` remains immutable.
- `1.0.1` is distribution metadata only: not a product behavior change.

Publication of `1.0.1` requires separate explicit operator authorization.
