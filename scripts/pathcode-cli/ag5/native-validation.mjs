/**
 * AG5 — native (non-npm) validation discovery from project metadata evidence.
 * Never invents commands. Only admits toolchain commands when the matching
 * project file exists and the host binary is available.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const NATIVE_TIMEOUT_MS = 300_000;

/**
 * Resolve a host/toolchain binary. Prefer project-local venvs under any of the
 * search roots (task worktree first, then primary checkout — `.venv` is almost
 * never present inside a linked worktree).
 *
 * @param {string} bin
 * @param {string | string[] | null | undefined} searchRoots
 * @returns {string | null}
 */
function resolveHostBinary(bin, searchRoots) {
  const roots = Array.isArray(searchRoots)
    ? searchRoots
    : searchRoots
      ? [searchRoots]
      : [];
  for (const projectRoot of roots) {
    if (typeof projectRoot !== "string" || !projectRoot) continue;
    const localCandidates = [
      join(projectRoot, ".venv", "bin", bin),
      join(projectRoot, "venv", "bin", bin),
      join(projectRoot, ".venv", "Scripts", `${bin}.exe`),
      join(projectRoot, "venv", "Scripts", `${bin}.exe`),
    ];
    for (const c of localCandidates) {
      if (existsSync(c)) return c;
    }
  }
  const which = spawnSync("which", [bin], {
    encoding: "utf8",
    env: process.env,
    timeout: 5_000,
  });
  if (which.status !== 0) return null;
  const path = (which.stdout || "").trim().split("\n")[0];
  return path || null;
}

/**
 * @param {string} pythonPath
 */
function pythonCanImportPytest(pythonPath) {
  const probe = spawnSync(
    pythonPath,
    ["-c", "import pytest"],
    {
      encoding: "utf8",
      env: process.env,
      timeout: 15_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return probe.status === 0;
}

/**
 * @param {string} projectRoot Validation cwd (usually the task worktree).
 * @param {{
 *   toolRoots?: string[],
 *   primaryRoot?: string,
 * }} [options]
 * @returns {Array<object>}
 */
export function discoverNativeValidationCandidates(projectRoot, options = {}) {
  /** @type {Array<object>} */
  const candidates = [];
  const root = projectRoot;
  /** @type {string[]} */
  const toolRoots = [];
  const pushRoot = (p) => {
    if (typeof p !== "string" || !p) return;
    if (!toolRoots.includes(p)) toolRoots.push(p);
  };
  pushRoot(root);
  if (Array.isArray(options.toolRoots)) {
    for (const p of options.toolRoots) pushRoot(p);
  }
  pushRoot(options.primaryRoot);

  // Python — pytest when configured or unittest discovery when tests/ exists.
  const pyproject = join(root, "pyproject.toml");
  const requirements = [
    join(root, "requirements.txt"),
    join(root, "requirements-dev.txt"),
    join(root, "setup.py"),
    join(root, "setup.cfg"),
  ];
  const hasPythonMeta =
    existsSync(pyproject) || requirements.some((p) => existsSync(p));
  if (hasPythonMeta) {
    let preferPytest = existsSync(join(root, "pytest.ini"));
    if (!preferPytest && existsSync(pyproject)) {
      try {
        const text = readFileSync(pyproject, "utf8");
        preferPytest =
          /\[tool\.pytest/i.test(text) ||
          /pytest/i.test(text) ||
          existsSync(join(root, "tests")) ||
          existsSync(join(root, "test"));
      } catch {
        preferPytest = existsSync(join(root, "tests"));
      }
    }
    if (!preferPytest) {
      preferPytest =
        existsSync(join(root, "tests")) || existsSync(join(root, "test"));
    }
    if (preferPytest) {
      const pytest = resolveHostBinary("pytest", toolRoots);
      const python =
        resolveHostBinary("python3", toolRoots) ||
        resolveHostBinary("python", toolRoots) ||
        resolveHostBinary("python3") ||
        resolveHostBinary("python");
      if (pytest) {
        candidates.push({
          id: "python-pytest",
          kind: "TARGETED_TEST",
          source: "PYTHON_PYTEST",
          label: "pytest",
          request: {
            executable: pytest,
            argv: [],
            cwd: root,
            timeoutMs: NATIVE_TIMEOUT_MS,
          },
          disclosure: { command: "pytest", chain: [], lifecycleHooks: [] },
        });
      } else if (python && pythonCanImportPytest(python)) {
        candidates.push({
          id: "python-pytest-module",
          kind: "TARGETED_TEST",
          source: "PYTHON_PYTEST",
          label: "python -m pytest",
          request: {
            executable: python,
            argv: ["-m", "pytest"],
            cwd: root,
            timeoutMs: NATIVE_TIMEOUT_MS,
          },
          disclosure: {
            command: `${python} -m pytest`,
            chain: [],
            lifecycleHooks: [],
          },
        });
      }
      // If Python metadata exists but pytest is unavailable, emit no candidate
      // (honest NOT_VERIFIED) — never invent a FAILED run.
    }
  }

  // Go
  if (existsSync(join(root, "go.mod"))) {
    const goBin = resolveHostBinary("go", toolRoots);
    if (goBin) {
      candidates.push({
        id: "go-test",
        kind: "TARGETED_TEST",
        source: "GO_TEST",
        label: "go test ./...",
        request: {
          executable: goBin,
          argv: ["test", "./..."],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: "go test ./...",
          chain: [],
          lifecycleHooks: [],
        },
      });
    }
  }

  // Rust — cargo check (static) before cargo test when available.
  if (existsSync(join(root, "Cargo.toml"))) {
    const cargo = resolveHostBinary("cargo", toolRoots);
    if (cargo) {
      candidates.push({
        id: "cargo-check",
        kind: "TYPECHECK",
        source: "CARGO_CHECK",
        label: "cargo check",
        request: {
          executable: cargo,
          argv: ["check"],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: "cargo check",
          chain: [],
          lifecycleHooks: [],
        },
      });
      candidates.push({
        id: "cargo-test",
        kind: "TARGETED_TEST",
        source: "CARGO_TEST",
        label: "cargo test",
        request: {
          executable: cargo,
          argv: ["test"],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: "cargo test",
          chain: [],
          lifecycleHooks: [],
        },
      });
    }
  }

  // Make — only admit test/check when the Makefile declares those targets.
  const makefilePath = join(root, "Makefile");
  if (existsSync(makefilePath)) {
    const makeBin = resolveHostBinary("make", toolRoots);
    if (makeBin) {
      let makefileText = "";
      try {
        makefileText = readFileSync(makefilePath, "utf8");
      } catch {
        makefileText = "";
      }
      if (/^test\s*:/m.test(makefileText)) {
        candidates.push({
          id: "make-test",
          kind: "TARGETED_TEST",
          source: "MAKE_TEST",
          label: "make test",
          request: {
            executable: makeBin,
            argv: ["test"],
            cwd: root,
            timeoutMs: NATIVE_TIMEOUT_MS,
          },
          disclosure: {
            command: "make test",
            chain: [],
            lifecycleHooks: [],
          },
        });
      } else if (/^check\s*:/m.test(makefileText)) {
        candidates.push({
          id: "make-check",
          kind: "TARGETED_TEST",
          source: "MAKE_CHECK",
          label: "make check",
          request: {
            executable: makeBin,
            argv: ["check"],
            cwd: root,
            timeoutMs: NATIVE_TIMEOUT_MS,
          },
          disclosure: {
            command: "make check",
            chain: [],
            lifecycleHooks: [],
          },
        });
      }
    }
  }

  // CMake — ctest only when an existing build/ tree is present (configured).
  if (existsSync(join(root, "CMakeLists.txt")) && existsSync(join(root, "build"))) {
    const ctest = resolveHostBinary("ctest", toolRoots);
    if (ctest) {
      candidates.push({
        id: "ctest",
        kind: "TARGETED_TEST",
        source: "CTEST",
        label: "ctest --test-dir build",
        request: {
          executable: ctest,
          argv: ["--test-dir", "build", "--output-on-failure"],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: "ctest --test-dir build --output-on-failure",
          chain: [],
          lifecycleHooks: [],
        },
      });
    }
  }

  // Bazel — only when workspace markers + BUILD files exist.
  const hasBazelWorkspace =
    existsSync(join(root, "MODULE.bazel")) ||
    existsSync(join(root, "WORKSPACE")) ||
    existsSync(join(root, "WORKSPACE.bazel"));
  if (hasBazelWorkspace) {
    let hasBuildFiles =
      existsSync(join(root, "BUILD")) || existsSync(join(root, "BUILD.bazel"));
    if (!hasBuildFiles) {
      try {
        for (const entry of readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (entry.name.startsWith(".") || entry.name === "node_modules") {
            continue;
          }
          const sub = join(root, entry.name);
          if (
            existsSync(join(sub, "BUILD")) ||
            existsSync(join(sub, "BUILD.bazel"))
          ) {
            hasBuildFiles = true;
            break;
          }
        }
      } catch {
        hasBuildFiles = false;
      }
    }
    if (hasBuildFiles) {
      const bazel =
        resolveHostBinary("bazelisk", toolRoots) ||
        resolveHostBinary("bazel", toolRoots);
      if (bazel) {
        candidates.push({
          id: "bazel-test",
          kind: "TARGETED_TEST",
          source: "BAZEL_TEST",
          label: "bazel test //...",
          request: {
            executable: bazel,
            argv: ["test", "//..."],
            cwd: root,
            timeoutMs: NATIVE_TIMEOUT_MS,
          },
          disclosure: {
            command: "bazel test //...",
            chain: [],
            lifecycleHooks: [],
          },
        });
      }
    }
  }

  // Java — Maven
  if (existsSync(join(root, "pom.xml"))) {
    const mvn = resolveHostBinary("mvn", toolRoots);
    if (mvn) {
      candidates.push({
        id: "maven-test",
        kind: "TARGETED_TEST",
        source: "MAVEN_TEST",
        label: "mvn test",
        request: {
          executable: mvn,
          argv: ["test", "-q"],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: "mvn test -q",
          chain: [],
          lifecycleHooks: [],
        },
      });
    }
  }

  // Java — Gradle
  const gradleKts = join(root, "build.gradle.kts");
  const gradleGroovy = join(root, "build.gradle");
  if (existsSync(gradleKts) || existsSync(gradleGroovy)) {
    const wrapper = existsSync(join(root, "gradlew"))
      ? join(root, "gradlew")
      : null;
    const gradle = wrapper || resolveHostBinary("gradle", toolRoots);
    if (gradle) {
      candidates.push({
        id: "gradle-test",
        kind: "TARGETED_TEST",
        source: "GRADLE_TEST",
        label: wrapper ? "./gradlew test" : "gradle test",
        request: {
          executable: gradle,
          argv: ["test", "-q"],
          cwd: root,
          timeoutMs: NATIVE_TIMEOUT_MS,
        },
        disclosure: {
          command: wrapper ? "./gradlew test -q" : "gradle test -q",
          chain: [],
          lifecycleHooks: [],
        },
      });
    }
  }

  return candidates;
}
