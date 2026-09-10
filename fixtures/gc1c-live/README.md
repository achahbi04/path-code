# GC1-c live acceptance fixture (synthetic)

**Label:** synthetic fixture content for operator live smoke (`GC1_LIVE_SMOKE=1`) only.

This tree is **not** part of the editable set for Path Code’s own GC1-c
validation suite. Canonical/unit tests must keep using disposable temp
projects from `tests/general-session/helpers.ts` (or equivalent), never this
directory as a live mutation target during `npm test` / `npm run check`.

## Contents

| Path | Role |
| --- | --- |
| `package.json` | `typecheck` + one Vitest script |
| `src/greet.ts` | Tiny library under test |
| `src/greet.test.ts` | One Vitest unit test |
| `tsconfig.json` | Strict noEmit typecheck |
| `vitest.config.ts` | Local Vitest config |

## Live use

Copy or mount this fixture as the workstation project root when running
operator-gated live acceptance. Do not treat success here as a substitute for
the mock-transport GC1-c suite.
