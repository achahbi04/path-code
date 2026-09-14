/**
 * G8 — universal polyglot capability discovery from project metadata.
 * Detects languages, toolchains, LSP readiness, and validation hints.
 * Never invents commands; never installs binaries.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Resolve a host binary via `which`.
 * @param {string} bin
 * @returns {string | null}
 */
export function whichBinary(bin) {
  if (typeof bin !== "string" || !bin.trim()) return null;
  try {
    const probe = spawnSync("which", [bin.trim()], {
      encoding: "utf8",
      env: process.env,
      timeout: 5_000,
    });
    if (probe.status !== 0) return null;
    const path = (probe.stdout || "").trim().split("\n")[0];
    return path || null;
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {string} rel
 * @returns {boolean}
 */
function has(root, rel) {
  try {
    return existsSync(join(root, rel));
  } catch {
    return false;
  }
}

/**
 * @param {string} root
 * @param {string} rel
 * @returns {string | null}
 */
function readText(root, rel) {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return null;
  }
}

/**
 * @param {string} root
 * @param {(name: string) => boolean} pred
 * @returns {string[]}
 */
function listRootFiles(root, pred) {
  try {
    return readdirSync(root).filter((name) => {
      try {
        return pred(name) && statSync(join(root, name)).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return [];
  }
}

/**
 * Clear LSP config evidence (not extensions recommendations alone).
 * @param {string} projectRoot
 * @param {{ homeDir?: string }} [opts]
 * @returns {{ ready: boolean, evidence: string[] }}
 */
function detectLspConfigEvidence(projectRoot, opts = {}) {
  /** @type {string[]} */
  const evidence = [];
  let ready = false;

  const settingsPath = join(projectRoot, ".vscode", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const text = readFileSync(settingsPath, "utf8");
      if (
        /languageServer|lsp\.|typescript\.tsserver|python\.languageServer|rust-analyzer|clangd|jdt\.ls|gopls|pylsp|pyright|basedpyright/i.test(
          text,
        ) ||
        /"[^"]*(?:serverPath|ls\.path|lspPath)[^"]*"\s*:/i.test(text)
      ) {
        ready = true;
        evidence.push(".vscode/settings.json language-server paths");
      } else {
        evidence.push(".vscode/settings.json present (no server path keys)");
      }
    } catch {
      evidence.push(".vscode/settings.json unreadable");
    }
  }

  const home = typeof opts.homeDir === "string" ? opts.homeDir : homedir();
  const copilotCandidates = [
    join(projectRoot, ".copilot", "lsp"),
    join(projectRoot, ".copilot", "lsp.json"),
    join(projectRoot, ".copilot", "lsp", "config.json"),
    join(home, ".copilot", "lsp"),
    join(home, ".copilot", "lsp.json"),
  ];
  for (const p of copilotCandidates) {
    if (existsSync(p)) {
      ready = true;
      evidence.push(
        p.startsWith(projectRoot) ? p.slice(projectRoot.length + 1) : p,
      );
      break;
    }
  }

  return { ready, evidence };
}

/**
 * @param {string} id
 * @param {string[]} binaries
 * @param {boolean} configReady
 * @param {string[]} configEvidence
 * @param {string[]} extraEvidence
 */
function lspEntry(id, binaries, configReady, configEvidence, extraEvidence = []) {
  /** @type {string[]} */
  const evidence = [...extraEvidence];
  /** @type {string | null} */
  let serverBinary = null;
  for (const bin of binaries) {
    const path = whichBinary(bin);
    if (path) {
      serverBinary = path;
      evidence.push(`${bin} → ${path}`);
      break;
    }
    evidence.push(`${bin} not on PATH`);
  }
  for (const e of configEvidence) evidence.push(e);
  const status = serverBinary || configReady ? "ready" : "unavailable";
  return { id, status, serverBinary, evidence };
}

/**
 * @param {string} projectRoot
 * @param {{
 *   homeDir?: string,
 *   discoverMcp?: (root: string) => unknown[],
 *   detectCopilot?: () => { status: string, executable: string | null, evidence: string[] },
 * }} [options]
 */
export function discoverCapabilityPlane(projectRoot, options = {}) {
  const root =
    typeof projectRoot === "string" && projectRoot.trim()
      ? projectRoot.trim()
      : process.cwd();

  /** @type {Array<{ id: string, status: 'ready'|'unavailable', evidence: string[] }>} */
  const languages = [];
  /** @type {Array<{ id: string, status: 'ready'|'unavailable', executable: string|null, evidence: string[] }>} */
  const toolchains = [];
  /** @type {Array<{ id: string, status: 'ready'|'unavailable', serverBinary: string|null, evidence: string[] }>} */
  const languageIntelligence = [];
  /** @type {Array<{ id: string, kind: string, label: string, source: string, evidence: string[] }>} */
  const validationHints = [];

  const lspConfig = detectLspConfigEvidence(root, { homeDir: options.homeDir });

  // ── JS / TS ──────────────────────────────────────────────────────────────
  const hasPkg = has(root, "package.json");
  const hasTsconfig =
    has(root, "tsconfig.json") ||
    has(root, "tsconfig.app.json") ||
    has(root, "jsconfig.json");
  const lockNpm = has(root, "package-lock.json");
  const lockPnpm = has(root, "pnpm-lock.yaml");
  const lockYarn = has(root, "yarn.lock");
  const lockBun = has(root, "bun.lock") || has(root, "bun.lockb");

  if (hasPkg || hasTsconfig || lockNpm || lockPnpm || lockYarn || lockBun) {
    /** @type {string[]} */
    const jsEvidence = [];
    if (hasPkg) jsEvidence.push("package.json");
    if (has(root, "tsconfig.json")) jsEvidence.push("tsconfig.json");
    else if (has(root, "tsconfig.app.json")) jsEvidence.push("tsconfig.app.json");
    else if (has(root, "jsconfig.json")) jsEvidence.push("jsconfig.json");
    if (lockNpm) jsEvidence.push("package-lock.json");
    if (lockPnpm) jsEvidence.push("pnpm-lock.yaml");
    if (lockYarn) jsEvidence.push("yarn.lock");
    if (lockBun) jsEvidence.push(has(root, "bun.lock") ? "bun.lock" : "bun.lockb");

    languages.push({
      id: hasTsconfig ? "typescript" : "javascript",
      status: "ready",
      evidence: jsEvidence,
    });

    /** @type {Array<{ id: string, lockHint: boolean }>} */
    const pmOrder = [
      { id: "pnpm", lockHint: lockPnpm },
      { id: "yarn", lockHint: lockYarn },
      { id: "bun", lockHint: lockBun },
      { id: "npm", lockHint: lockNpm || hasPkg },
    ];
    for (const pm of pmOrder) {
      if (!pm.lockHint && !(pm.id === "npm" && hasPkg)) continue;
      const exe = whichBinary(pm.id);
      /** @type {string[]} */
      const evidence = [
        ...(pm.lockHint
          ? [`lockfile evidence for ${pm.id}`]
          : hasPkg
            ? ["package.json (npm default)"]
            : []),
      ];
      if (exe) evidence.push(`${pm.id} → ${exe}`);
      else evidence.push(`${pm.id} not on PATH`);
      toolchains.push({
        id: pm.id,
        status: exe ? "ready" : "unavailable",
        executable: exe,
        evidence,
      });
      if (exe && hasPkg) {
        validationHints.push({
          id: `${pm.id}-scripts`,
          kind: "PACKAGE_SCRIPTS",
          label: `${pm.id} run <admitted-script>`,
          source: "PACKAGE_JSON",
          evidence: ["package.json scripts (host decides admission)"],
        });
      }
    }

    languageIntelligence.push(
      lspEntry(
        "typescript",
        ["typescript-language-server"],
        lspConfig.ready,
        lspConfig.evidence,
        hasTsconfig ? ["project tsconfig/jsconfig present"] : [],
      ),
    );
  }

  // ── Python ───────────────────────────────────────────────────────────────
  const reqFiles = listRootFiles(
    root,
    (n) => /^requirements.*\.txt$/i.test(n),
  );
  const hasPyproject = has(root, "pyproject.toml");
  const hasSetupPy = has(root, "setup.py");
  const hasVenv = has(root, ".venv") || has(root, "venv");
  if (hasPyproject || reqFiles.length > 0 || hasSetupPy || hasVenv) {
    /** @type {string[]} */
    const pyEvidence = [];
    if (hasPyproject) pyEvidence.push("pyproject.toml");
    for (const f of reqFiles) pyEvidence.push(f);
    if (hasSetupPy) pyEvidence.push("setup.py");
    if (hasVenv) pyEvidence.push(has(root, ".venv") ? ".venv" : "venv");

    languages.push({ id: "python", status: "ready", evidence: pyEvidence });

    const pyprojectText = hasPyproject ? readText(root, "pyproject.toml") || "" : "";
    const poetryMeta = /\[tool\.poetry\]/i.test(pyprojectText);
    const pytestHint =
      has(root, "pytest.ini") ||
      /\[tool\.pytest/i.test(pyprojectText) ||
      /\bpytest\b/i.test(pyprojectText) ||
      reqFiles.some((f) => /\bpytest\b/i.test(readText(root, f) || ""));

    /** @type {Array<{ id: string, need: boolean }>} */
    const pyBins = [
      { id: "uv", need: hasPyproject || reqFiles.length > 0 },
      { id: "poetry", need: poetryMeta },
      { id: "pip", need: reqFiles.length > 0 || hasSetupPy || hasPyproject },
      { id: "pytest", need: pytestHint },
    ];
    for (const b of pyBins) {
      if (!b.need) continue;
      const exe =
        whichBinary(b.id) ||
        (has(root, `.venv/bin/${b.id}`) ? join(root, `.venv/bin/${b.id}`) : null) ||
        (has(root, `venv/bin/${b.id}`) ? join(root, `venv/bin/${b.id}`) : null);
      /** @type {string[]} */
      const evidence = [...pyEvidence];
      if (exe) evidence.push(`${b.id} → ${exe}`);
      else evidence.push(`${b.id} not found`);
      toolchains.push({
        id: b.id,
        status: exe ? "ready" : "unavailable",
        executable: exe,
        evidence,
      });
      if (b.id === "pytest" && exe) {
        validationHints.push({
          id: "python-pytest",
          kind: "TARGETED_TEST",
          label: "pytest",
          source: "PYTHON_PYTEST",
          evidence: ["Python metadata + pytest available"],
        });
      }
    }

    languageIntelligence.push(
      lspEntry(
        "python",
        ["basedpyright", "pyright", "pylsp"],
        lspConfig.ready,
        lspConfig.evidence,
        pyEvidence.slice(0, 3),
      ),
    );
  }

  // ── Go ───────────────────────────────────────────────────────────────────
  if (has(root, "go.mod")) {
    languages.push({ id: "go", status: "ready", evidence: ["go.mod"] });
    const goBin = whichBinary("go");
    toolchains.push({
      id: "go",
      status: goBin ? "ready" : "unavailable",
      executable: goBin,
      evidence: goBin ? ["go.mod", `go → ${goBin}`] : ["go.mod", "go not on PATH"],
    });
    if (goBin) {
      validationHints.push({
        id: "go-test",
        kind: "TARGETED_TEST",
        label: "go test ./...",
        source: "GO_TEST",
        evidence: ["go.mod", "go available"],
      });
    }
    languageIntelligence.push(
      lspEntry("go", ["gopls"], lspConfig.ready, lspConfig.evidence, ["go.mod"]),
    );
  }

  // ── Rust ─────────────────────────────────────────────────────────────────
  if (has(root, "Cargo.toml")) {
    languages.push({ id: "rust", status: "ready", evidence: ["Cargo.toml"] });
    const cargo = whichBinary("cargo");
    toolchains.push({
      id: "cargo",
      status: cargo ? "ready" : "unavailable",
      executable: cargo,
      evidence: cargo
        ? ["Cargo.toml", `cargo → ${cargo}`]
        : ["Cargo.toml", "cargo not on PATH"],
    });
    if (cargo) {
      validationHints.push({
        id: "cargo-test",
        kind: "TARGETED_TEST",
        label: "cargo test",
        source: "CARGO_TEST",
        evidence: ["Cargo.toml", "cargo available"],
      });
    }
    languageIntelligence.push(
      lspEntry(
        "rust",
        ["rust-analyzer"],
        lspConfig.ready,
        lspConfig.evidence,
        ["Cargo.toml"],
      ),
    );
  }

  // ── Java ─────────────────────────────────────────────────────────────────
  const hasPom = has(root, "pom.xml");
  const hasGradle =
    has(root, "build.gradle") || has(root, "build.gradle.kts");
  if (hasPom || hasGradle) {
    /** @type {string[]} */
    const javaEvidence = [];
    if (hasPom) javaEvidence.push("pom.xml");
    if (has(root, "build.gradle")) javaEvidence.push("build.gradle");
    if (has(root, "build.gradle.kts")) javaEvidence.push("build.gradle.kts");
    languages.push({ id: "java", status: "ready", evidence: javaEvidence });

    if (hasPom) {
      const mvn = whichBinary("mvn");
      toolchains.push({
        id: "mvn",
        status: mvn ? "ready" : "unavailable",
        executable: mvn,
        evidence: mvn ? ["pom.xml", `mvn → ${mvn}`] : ["pom.xml", "mvn not on PATH"],
      });
      if (mvn) {
        validationHints.push({
          id: "maven-test",
          kind: "TARGETED_TEST",
          label: "mvn test",
          source: "MAVEN_TEST",
          evidence: ["pom.xml", "mvn available"],
        });
      }
    }
    if (hasGradle) {
      const wrapper = has(root, "gradlew") ? join(root, "gradlew") : null;
      const gradle = wrapper || whichBinary("gradle");
      toolchains.push({
        id: wrapper ? "gradlew" : "gradle",
        status: gradle ? "ready" : "unavailable",
        executable: gradle,
        evidence: [
          ...javaEvidence.filter((e) => e.startsWith("build.gradle")),
          gradle
            ? wrapper
              ? "gradlew present"
              : `gradle → ${gradle}`
            : "gradle/gradlew not found",
        ],
      });
      if (gradle) {
        validationHints.push({
          id: "gradle-test",
          kind: "TARGETED_TEST",
          label: wrapper ? "./gradlew test" : "gradle test",
          source: "GRADLE_TEST",
          evidence: ["Gradle build file", "gradle available"],
        });
      }
    }
    languageIntelligence.push(
      lspEntry(
        "java",
        ["jdtls", "java-language-server"],
        lspConfig.ready,
        lspConfig.evidence,
        javaEvidence,
      ),
    );
  }

  // ── C / C++ ──────────────────────────────────────────────────────────────
  const hasCmake = has(root, "CMakeLists.txt");
  const hasMake = has(root, "Makefile") || has(root, "makefile");
  const hasMeson = has(root, "meson.build");
  const hasCompileDb = has(root, "compile_commands.json");
  if (hasCmake || hasMake || hasMeson || hasCompileDb) {
    /** @type {string[]} */
    const ccEvidence = [];
    if (hasCmake) ccEvidence.push("CMakeLists.txt");
    if (hasMake) ccEvidence.push(has(root, "Makefile") ? "Makefile" : "makefile");
    if (hasMeson) ccEvidence.push("meson.build");
    if (hasCompileDb) ccEvidence.push("compile_commands.json");
    languages.push({ id: "c_cpp", status: "ready", evidence: ccEvidence });

    /** @type {Array<{ id: string, need: boolean }>} */
    const ccTools = [
      { id: "cmake", need: hasCmake },
      { id: "make", need: hasMake },
      { id: "ninja", need: hasCmake || hasMeson || hasCompileDb },
      { id: "meson", need: hasMeson },
      { id: "clangd", need: true },
    ];
    for (const t of ccTools) {
      if (!t.need) continue;
      const exe = whichBinary(t.id);
      toolchains.push({
        id: t.id,
        status: exe ? "ready" : "unavailable",
        executable: exe,
        evidence: [
          ...ccEvidence.slice(0, 2),
          exe ? `${t.id} → ${exe}` : `${t.id} not on PATH`,
        ],
      });
    }
    languageIntelligence.push(
      lspEntry("c_cpp", ["clangd"], lspConfig.ready, lspConfig.evidence, ccEvidence),
    );
  }

  // ── .NET / C# ────────────────────────────────────────────────────────────
  const csprojFiles = listRootFiles(root, (n) => /\.csproj$/i.test(n));
  const hasSln =
    has(root, "Directory.Build.props") ||
    listRootFiles(root, (n) => /\.sln$/i.test(n)).length > 0;
  if (csprojFiles.length > 0 || hasSln || has(root, "global.json")) {
    /** @type {string[]} */
    const csEvidence = [];
    if (csprojFiles.length > 0) csEvidence.push(...csprojFiles.slice(0, 3));
    if (has(root, "global.json")) csEvidence.push("global.json");
    if (hasSln) csEvidence.push(".sln / Directory.Build.props");
    languages.push({ id: "csharp", status: "ready", evidence: csEvidence });
    const dotnet = whichBinary("dotnet");
    toolchains.push({
      id: "dotnet",
      status: dotnet ? "ready" : "unavailable",
      executable: dotnet,
      evidence: [
        ...csEvidence.slice(0, 2),
        dotnet ? `dotnet → ${dotnet}` : "dotnet not on PATH",
      ],
    });
    languageIntelligence.push(
      lspEntry(
        "csharp",
        ["csharp-ls", "OmniSharp"],
        lspConfig.ready,
        lspConfig.evidence,
        csEvidence,
      ),
    );
  }

  // ── Bazel ────────────────────────────────────────────────────────────────
  const hasBazel =
    has(root, "WORKSPACE") ||
    has(root, "WORKSPACE.bazel") ||
    has(root, "MODULE.bazel");
  if (hasBazel) {
    /** @type {string[]} */
    const bzEvidence = [];
    if (has(root, "MODULE.bazel")) bzEvidence.push("MODULE.bazel");
    if (has(root, "WORKSPACE.bazel")) bzEvidence.push("WORKSPACE.bazel");
    if (has(root, "WORKSPACE")) bzEvidence.push("WORKSPACE");
    languages.push({ id: "bazel", status: "ready", evidence: bzEvidence });
    const bazel = whichBinary("bazel") || whichBinary("bazelisk");
    toolchains.push({
      id: bazel && /bazelisk/.test(bazel) ? "bazelisk" : "bazel",
      status: bazel ? "ready" : "unavailable",
      executable: bazel,
      evidence: [
        ...bzEvidence,
        bazel ? `bazel → ${bazel}` : "bazel/bazelisk not on PATH",
      ],
    });
  }

  // ── MCP (caller-filled via discoverMcp) ──────────────────────────────────
  /** @type {unknown[]} */
  let mcp = [];
  if (typeof options.discoverMcp === "function") {
    try {
      const found = options.discoverMcp(root);
      if (Array.isArray(found)) mcp = found;
    } catch {
      mcp = [];
    }
  }

  // ── Copilot specialist ───────────────────────────────────────────────────
  let specialist = {
    copilot: {
      status: /** @type {'ready'|'unavailable'} */ ("unavailable"),
      executable: /** @type {string|null} */ (null),
      evidence: /** @type {string[]} */ (["copilot not probed"]),
    },
  };
  if (typeof options.detectCopilot === "function") {
    try {
      const c = options.detectCopilot();
      specialist = {
        copilot: {
          status: c.status === "ready" ? "ready" : "unavailable",
          executable: c.executable ?? null,
          evidence: Array.isArray(c.evidence) ? c.evidence : [],
        },
      };
    } catch {
      /* keep unavailable */
    }
  } else {
    const copilot = whichBinary("copilot");
    specialist = {
      copilot: {
        status: copilot ? "ready" : "unavailable",
        executable: copilot,
        evidence: copilot
          ? [`copilot → ${copilot}`]
          : ["copilot not on PATH"],
      },
    };
  }

  const briefForEngine = buildBrief({
    languages,
    toolchains,
    languageIntelligence,
    specialist,
    validationHints,
  });

  return {
    languages,
    toolchains,
    languageIntelligence,
    mcp,
    specialist,
    validationHints,
    briefForEngine,
  };
}

/**
 * @param {{
 *   languages: Array<{ id: string, status: string }>,
 *   toolchains: Array<{ id: string, status: string, executable: string|null }>,
 *   languageIntelligence: Array<{ id: string, status: string, serverBinary: string|null }>,
 *   specialist: { copilot: { status: string } },
 *   validationHints: Array<{ id: string, label: string }>,
 * }} plane
 */
function buildBrief(plane) {
  const langs = plane.languages.map((l) => l.id).join(", ") || "none";
  const readyTools = plane.toolchains
    .filter((t) => t.status === "ready")
    .map((t) => t.id);
  const lspReady = plane.languageIntelligence
    .filter((l) => l.status === "ready")
    .map((l) => l.id);
  const hints = plane.validationHints.map((h) => h.label).slice(0, 6);
  const parts = [
    `Languages: ${langs}.`,
    readyTools.length
      ? `Toolchains ready: ${readyTools.join(", ")}.`
      : "No host toolchains ready.",
    lspReady.length
      ? `LSP ready: ${lspReady.join(", ")}.`
      : "No language servers ready.",
    `Copilot CLI: ${plane.specialist.copilot.status}.`,
  ];
  if (hints.length) parts.push(`Validation hints: ${hints.join("; ")}.`);
  return parts.join(" ");
}
