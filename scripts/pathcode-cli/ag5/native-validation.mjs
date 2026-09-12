/**
 * AG5 — native (non-npm) validation discovery from project metadata evidence.
 * Never invents commands. Only admits toolchain commands when the matching
 * project file exists and the host binary is available.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const NATIVE_TIMEOUT_MS = 300_000;

/**
 * @param {string} bin
 * @param {string} [projectRoot]
 * @returns {string | null}
 */
function resolveHostBinary(bin, projectRoot) {
  if (projectRoot) {
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
 * @param {string} projectRoot
 * @returns {Array<object>}
 */
export function discoverNativeValidationCandidates(projectRoot) {
  /** @type {Array<object>} */
  const candidates = [];
  const root = projectRoot;

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
      const pytest = resolveHostBinary("pytest", root);
      const python =
        resolveHostBinary("python3", root) ||
        resolveHostBinary("python", root) ||
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
      } else if (python) {
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
    }
  }

  // Go
  if (existsSync(join(root, "go.mod"))) {
    const goBin = resolveHostBinary("go", root);
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

  // Rust
  if (existsSync(join(root, "Cargo.toml"))) {
    const cargo = resolveHostBinary("cargo", root);
    if (cargo) {
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

  // Java — Maven
  if (existsSync(join(root, "pom.xml"))) {
    const mvn = resolveHostBinary("mvn", root);
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
    const gradle = wrapper || resolveHostBinary("gradle", root);
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
