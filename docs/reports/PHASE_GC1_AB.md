# PATH CODE — PHASE GC1-AB CONTINUOUS DRIVE

**Result: GREEN**

```text
GC1-AB CONTINUOUS DRIVE: GREEN
— GC1-a lifecycle/auth/I/O preserved
— GC1-b Engineering Image boots on Cloud Workstations
— Workstations image contract (GC1B-G) + falsifications
— Full polyglot toolchain as workstation user (not root HOME)
— Workspace hydration + dependency install + project command
— Force-dispose verified; warm cluster preserved
— Engine src/** ZERO-DIFF
```

---

## Provenance chain (images)

| Label | Digest | Outcome |
|---|---|---|
| **Upstream Google Workstations base** | `us-central1-docker.pkg.dev/cloud-workstations-images/predefined/base@sha256:50086f15b59f375ccc755659bd1b0c2e38347af4c6d739fff6fda8941fb19c38` | Headless NO-IDE base; Entrypoint `/google/scripts/entrypoint.sh`; USER unset |
| **gc1b-v2 (retired)** | `sha256:7cdbbce2a60a77728b21fc2c55da4f24af18e5fd2d8aa48bdccc9dcdc9a9015a` | CONTAINER_START_FAILED / "no users found" |
| **gc1b-v3** | `sha256:077bd0639241bbc649b110cb0a910a5e1d46337b2f88ec978536a4649a694868` | Boots; Go/Rust incomplete for non-login workstation user PATH |
| **gc1b-v4 (live pin)** | `sha256:7551be3df526788324a942b793ad6b4c294ab1511f273851602b5357640be2f6` | Full GC1-b live green |

Pinned live reference:

`europe-west4-docker.pkg.dev/path-code-gc1-260910/pathcode-gc1-images/pathcode-engineering@sha256:7551be3df526788324a942b793ad6b4c294ab1511f273851602b5357640be2f6`

---

## Artifact Registry 403 blocker (resolved by operator)

- Runtime SA previously could not pull the private Engineering Image.
- Operator granted Artifact Registry reader on the image repository to the Runtime SA.
- Subsequent live attempt pulled the image successfully and advanced to container start.
- **IAM/ADC were not touched in this drive after that grant.**

---

## v2 CONTAINER_START_FAILED — root cause

### Diagnosis (A–J)

| Item | v2 (defective) | Contract target |
|---|---|---|
| A. FROM | `predefined/code-oss:latest` (floating) | `predefined/base@sha256:50086f15…` |
| B. ENTRYPOINT | inherited from code-oss | preserve `/google/scripts/entrypoint.sh` |
| C. CMD | unset | unset |
| D. USER | final `USER user` | final `USER root` (runtime user created by startup) |
| E. passwd/group | assumed build-time `user` | runtime `010_add-user.sh` |
| F. runAsUser | unset | must remain unset / 0 |
| G. command/args | unset | must remain unset |
| H. workingDir | `WORKDIR /home/user/workspace` | no build-time `/home` authority |
| I. persistent home | `mkdir /home/user` + chown as correctness | dynamically mounted by Workstations |
| J. startup infra | present on code-oss but incompatible with final USER | preserve entrypoint + `/etc/workstation-startup.d/{010_add-user,020_start-sshd}.sh` |

**Exact failure class:** containerd mount callback with image metadata `USER user` before Workstations runtime user creation → `CONTAINER_START_FAILED` / `no users found` (LRO code=9).

Cleanup after v2 probe: `probeAfterTeardown=null`, `clusterPreserved=true`, `verifiedAbsent=true`.

---

## GC1B-G — Cloud Workstations image contract

Permanent local proof (`tests/gc1/gc1b-image-contract.test.ts` + `image-contract.mjs`):

- Linux / Workstations `predefined/base` digest pin
- Entrypoint preserved
- Startup dir + `010_add-user.sh` + `020_start-sshd.sh`
- No final `USER user` / incompatible `runAsUser`
- No build-time `/home/user` authority
- No `/root/.cargo` reliance
- Go shim `/usr/local/bin/go` + rustup wrappers + `profile.d`

Falsifications (restore by hash): remove entrypoint; remove add-user; `USER user` / `runAsUser=1000`; wipe startup dir; omit Go shim / profile.d; `/root/.cargo` PATH.

---

## Live GC1-b acceptance (v4)

Config: `pathcode-gc1b-config-v4` on warm `pathcode-gc1-cluster`.

| Stage | Result |
|---|---|
| Image boot / STATE_RUNNING | PASS (`lifecycleReadyMs≈180`) |
| Execution ready `HEALTH_CHECK_OK` | PASS |
| Hydration | PASS — 547 files, ~1.18 MiB, `/home/user/workspace` |
| `pwd` + package/tests presence | PASS |
| Dependency (`npm ci`) | PASS |
| Polyglot toolchain (24/24) | PASS — see table |
| `npm run typecheck` | PASS (`exitCode=0`) |
| Workstation-user env (durable `/usr/local/bin`) | PASS — `USER=user`, wrappers resolve |
| stdout/stderr/exit sentinel | PASS — exit 17, distinct channels |
| Force-dispose + verified absence | PASS — `verifiedAbsent=true`, cluster preserved |

### Workstation-user toolchain table (live)

| Tool | Evidence |
|---|---|
| git | `git version 2.43.0` |
| node | `v24.20.0` |
| npm | `12.0.2` |
| pnpm | OK (corepack) |
| yarn | OK (corepack) |
| bun | `1.4.2` |
| python3 | `Python 3.12.3` |
| pip | `pip 24.0` |
| uv | `uv 0.12.12` |
| pipx | `1.17.2` |
| java | `openjdk 25.0.4.1` |
| mvn | OK |
| gradle | OK |
| go | `go1.23.6` via `/usr/local/bin/go` |
| rustc | `1.98.1` via wrapper |
| cargo | `1.98.1` via wrapper |
| rustfmt | OK |
| clippy | OK |
| gcc / g++ | `13.3.0` |
| rg / fd / jq / git-lfs | OK |

---

## Local freeze gate

| Check | Result |
|---|---|
| `npm run check` | **PASS** — typecheck + build + vitest **123 files / 1190 tests** + cli:smoke + ledger:verify (`CHECK_EXIT:0`; ZERO GCP) |
| GC1 tests (`tests/gc1`) | **PASS — 39 passed (39)** across 3 files |
| `git diff --check` | **PASS** (`DIFF_CHECK_EXIT:0`) |
| `SRC_DIFF_BYTES` (`git diff HEAD -- src/`) | **0** |
| Mock GCP calls (canonical / GC1 suite) | **ZERO** (GC1A-G) |
| Probe workstation remaining | **NO** — last live v4 cleanup: `probeAfterTeardown=null`, `verifiedAbsent=true`, list empty (no new cloud call at freeze) |

---

## FINDINGS LOG (non-blocking)

1. **Host CPU saturation (historical)** — during the continuous drive, orphaned `while :; do :; done` load generators from another project inflated load averages >100 and flaked default 5s vitest budgets. Cleared before freeze; freeze `npm run check` passed cleanly with unchanged assertions/timeouts.
2. **v3 user-env PATH** — Workstations rewrites PATH for SSH non-login sessions; image `ENV PATH` / rustup proxies without `RUSTUP_HOME` failed for `go`/`rustc`/`cargo`. Fixed in v4 with `/usr/local/bin` shims + rustup wrappers + `profile.d`.
3. **`bash -lc` hang** — login-shell user-env probe hung the Control-SA tunnel once; switched to non-login durable-path proof.
4. **pnpm/yarn corepack download notices** — first-run network fetch under corepack; tools still exit 0.

---

## Intentionally remaining billable resources

| Resource | Why kept |
|---|---|
| `pathcode-gc1-cluster` | Warm cluster — **do not delete** |
| `pathcode-gc1-config` | GC1-a baseline config |
| `pathcode-gc1b-config-v2` | Evidence pin for v2 failure class |
| `pathcode-gc1b-config-v3` | Evidence pin for PATH incomplete class |
| `pathcode-gc1b-config-v4` | Live GC1-b pin |
| Artifact Registry images `gc1b-v1`…`v4` | Immutable provenance |

**No probe workstation remains** (verified absent on v4 config after live PASS; freeze gate did not issue new GCP calls).

---

## Guardrails honored

- No IAM mutations after operator AR grant
- No ADC / JSON keys
- Control SA never attached to workstation
- No `src/**` edits
- No push to main
- No GC1-c entry
- Cluster never deleted
- Every probe force-disposed + absence verified

---

## Final freeze evidence

| Gate | Result |
|---|---|
| GC1-a live | **PASS** |
| GC1-b live | **PASS** |
| `npm run check` | **PASS** (123 test files / 1190 tests + cli:smoke + ledger:verify) |
| GC1 tests | **PASS — 39** |
| `SRC_DIFF_BYTES` | **0** |
| `git diff --check` | **PASS** |
| Control SA inside workstation | **NO** |
| JSON keys | **NO** |
| Probe workstation remaining | **NO** |
| Warm cluster | **intentionally preserved** |
| Final GC1-AB freeze SHA | *(recorded at commit tip below)* |
| `git status` | **CLEAN** (after freeze commit) |
