/**
 * G9 — capability requirement resolution + classification.
 * Discovery stays in G8; this module turns the plane into actionable requirements.
 */

import { existsSync, accessSync, constants as fsConstants } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { discoverCapabilityPlane, whichBinary } from "../ag8/discover.mjs";
import { resolveAg9RuntimeDirs } from "./layout.mjs";
import { miseWhich } from "./mise.mjs";
import { resolveToolVersion } from "./versions.mjs";

/**
 * @typedef {'PROJECT_LOCAL'|'HOST_READY'|'PATH_RUNTIME_READY'|'MISSING'|'INCOMPATIBLE'|'BROKEN'} RequirementStatus
 *
 * @typedef {object} CapabilityRequirement
 * @property {string} id
 * @property {string} kind toolchain|lsp|language|wrapper
 * @property {string} [miseTool]
 * @property {string[]} [bins]
 * @property {string[]} evidence
 * @property {RequirementStatus} [status]
 * @property {string|null} [executable]
 * @property {{ version: string, source: string, evidence: string[] }} [version]
 */

/**
 * @param {string} path
 */
function isExecutable(path) {
  if (!path || !existsSync(path)) return false;
  try {
    accessSync(path, fsConstants.X_OK);
    return true;
  } catch {
    // Windows / non-chmod filesystems: existence is enough for wrappers we write.
    return existsSync(path);
  }
}

/**
 * @param {string} executable
 * @returns {'ok'|'broken'}
 */
function healthProbe(executable) {
  if (!isExecutable(executable)) return "broken";
  try {
    const probe = spawnSync(executable, ["--version"], {
      encoding: "utf8",
      timeout: 8_000,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const versionOut = `${probe.stdout || ""}${probe.stderr || ""}`;
    // macOS /usr/bin/java stub prints this when no JDK is installed.
    if (/Unable to locate a Java Runtime/i.test(versionOut)) return "broken";
    if (probe.status === 0 && /version|openjdk|java|javac|\d+\.\d+/i.test(versionOut)) {
      return "ok";
    }
    if (probe.status === 0) return "ok";
    // Some tools exit non-zero on --version but still run help.
    const help = spawnSync(executable, ["--help"], {
      encoding: "utf8",
      timeout: 5_000,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const helpOut = `${help.stdout || ""}${help.stderr || ""}`;
    if (/Unable to locate a Java Runtime/i.test(helpOut)) return "broken";
    if (help.status === 0 || (helpOut && !/Unable to locate/i.test(helpOut))) return "ok";
    return "broken";
  } catch {
    return "broken";
  }
}

/**
 * Build requirements list from G8 plane + project wrappers.
 *
 * @param {string} projectRoot
 * @param {ReturnType<typeof discoverCapabilityPlane>} [plane]
 * @returns {CapabilityRequirement[]}
 */
export function resolveCapabilityRequirements(projectRoot, plane) {
  const root =
    typeof projectRoot === "string" && projectRoot.trim()
      ? projectRoot.trim()
      : process.cwd();
  const p = plane ?? discoverCapabilityPlane(root);

  /** @type {CapabilityRequirement[]} */
  const reqs = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /**
   * @param {CapabilityRequirement} req
   */
  function push(req) {
    if (seen.has(req.id)) return;
    seen.add(req.id);
    reqs.push(req);
  }

  // Prefer project wrappers first.
  if (existsSync(join(root, "gradlew"))) {
    push({
      id: "gradlew",
      kind: "wrapper",
      bins: [join(root, "gradlew")],
      evidence: ["gradlew present"],
      version: resolveToolVersion(root, "java"),
    });
  }
  if (existsSync(join(root, "mvnw"))) {
    push({
      id: "mvnw",
      kind: "wrapper",
      bins: [join(root, "mvnw")],
      evidence: ["mvnw present"],
      version: resolveToolVersion(root, "java"),
    });
  }
  for (const venv of [".venv", "venv"]) {
    const py = join(root, venv, "bin", "python");
    if (existsSync(py)) {
      push({
        id: "project-venv-python",
        kind: "wrapper",
        bins: [py],
        evidence: [`${venv}/bin/python`],
        version: resolveToolVersion(root, "python"),
      });
      break;
    }
  }
  if (
    existsSync(join(root, "rust-toolchain")) ||
    existsSync(join(root, "rust-toolchain.toml"))
  ) {
    push({
      id: "rust-toolchain",
      kind: "wrapper",
      miseTool: "rust",
      bins: ["cargo", "rustc"],
      evidence: [
        existsSync(join(root, "rust-toolchain.toml"))
          ? "rust-toolchain.toml"
          : "rust-toolchain",
      ],
      version: resolveToolVersion(root, "rust"),
    });
  }

  for (const lang of p.languages || []) {
    const map = languageToToolchain(lang.id);
    if (!map) continue;
    push({
      id: map.id,
      kind: "toolchain",
      miseTool: map.miseTool,
      bins: map.bins,
      evidence: Array.isArray(lang.evidence) ? lang.evidence : [],
      version: resolveToolVersion(root, map.versionTool),
    });
  }

  for (const tc of p.toolchains || []) {
    if (["gradlew", "mvnw"].includes(tc.id)) continue;
    const map = toolchainMiseMap(tc.id);
    push({
      id: tc.id,
      kind: "toolchain",
      miseTool: map?.miseTool,
      bins: map?.bins || [tc.id],
      evidence: Array.isArray(tc.evidence) ? tc.evidence : [],
      version: resolveToolVersion(root, map?.versionTool || tc.id),
    });
  }

  for (const lsp of p.languageIntelligence || []) {
    const map = lspMiseMap(lsp.id);
    push({
      id: `lsp:${lsp.id}`,
      kind: "lsp",
      miseTool: map?.miseTool,
      bins: map?.bins || [],
      eclipseJdtls: Boolean(map?.eclipseJdtls),
      evidence: Array.isArray(lsp.evidence) ? lsp.evidence : [],
      version: {
        version: "latest",
        source: "path_default",
        evidence: ["LSP default latest unless project pin"],
      },
    });
  }

  return reqs;
}

/**
 * @param {string} langId
 */
function languageToToolchain(langId) {
  switch (langId) {
    case "typescript":
    case "javascript":
      return { id: "node", miseTool: "node", bins: ["node"], versionTool: "node" };
    case "python":
      return {
        id: "python",
        miseTool: "python",
        bins: ["python3", "python"],
        versionTool: "python",
      };
    case "go":
      return { id: "go", miseTool: "go", bins: ["go"], versionTool: "go" };
    case "rust":
      return {
        id: "rust",
        miseTool: "rust",
        bins: ["cargo", "rustc"],
        versionTool: "rust",
      };
    case "java":
      return { id: "java", miseTool: "java", bins: ["java"], versionTool: "java" };
    case "c_cpp":
      return {
        id: "clangd-toolchain",
        miseTool: "llvm",
        bins: ["clangd", "clang"],
        versionTool: "clangd",
      };
    default:
      return null;
  }
}

/**
 * @param {string} id
 */
function toolchainMiseMap(id) {
  /** @type {Record<string, { miseTool?: string, bins: string[], versionTool: string }>} */
  const map = {
    npm: { miseTool: "node", bins: ["npm", "node"], versionTool: "node" },
    pnpm: { miseTool: "pnpm", bins: ["pnpm"], versionTool: "node" },
    yarn: { miseTool: "yarn", bins: ["yarn"], versionTool: "node" },
    bun: { miseTool: "bun", bins: ["bun"], versionTool: "node" },
    go: { miseTool: "go", bins: ["go"], versionTool: "go" },
    cargo: { miseTool: "rust", bins: ["cargo", "rustc"], versionTool: "rust" },
    mvn: { miseTool: "maven", bins: ["mvn"], versionTool: "maven" },
    gradle: { miseTool: "gradle", bins: ["gradle"], versionTool: "gradle" },
    pip: { miseTool: "python", bins: ["pip", "python3"], versionTool: "python" },
    poetry: { miseTool: "poetry", bins: ["poetry"], versionTool: "python" },
    uv: { miseTool: "uv", bins: ["uv"], versionTool: "python" },
    pytest: { bins: ["pytest"], versionTool: "python" },
    cmake: { miseTool: "cmake", bins: ["cmake"], versionTool: "cmake" },
    make: { bins: ["make"], versionTool: "make" },
    ninja: { miseTool: "ninja", bins: ["ninja"], versionTool: "ninja" },
    meson: { miseTool: "meson", bins: ["meson"], versionTool: "meson" },
    clangd: { miseTool: "llvm", bins: ["clangd"], versionTool: "clangd" },
    bazel: { miseTool: "bazel", bins: ["bazel"], versionTool: "bazel" },
    bazelisk: { miseTool: "bazelisk", bins: ["bazelisk"], versionTool: "bazel" },
    java: { miseTool: "java", bins: ["java"], versionTool: "java" },
    python: { miseTool: "python", bins: ["python3", "python"], versionTool: "python" },
    node: { miseTool: "node", bins: ["node"], versionTool: "node" },
    rust: { miseTool: "rust", bins: ["cargo", "rustc"], versionTool: "rust" },
    dotnet: { miseTool: "dotnet", bins: ["dotnet"], versionTool: "dotnet" },
  };
  return map[id] || null;
}

/**
 * @param {string} langId
 */
function lspMiseMap(langId) {
  /** @type {Record<string, { miseTool?: string, bins: string[], npmPackage?: string }>} */
  const map = {
    typescript: {
      bins: ["typescript-language-server"],
      npmPackage: "typescript-language-server",
    },
    python: { bins: ["basedpyright", "pyright", "pylsp"], miseTool: "pipx:pyright" },
    go: { bins: ["gopls"], miseTool: "gopls" },
    rust: { bins: ["rust-analyzer"], miseTool: "rust-analyzer" },
    java: { bins: ["jdtls", "java-language-server"], eclipseJdtls: true },
    c_cpp: { bins: ["clangd"], miseTool: "llvm" },
  };
  return map[langId] || null;
}

/**
 * Classify a single requirement against project / host / PATH runtime.
 *
 * @param {CapabilityRequirement} req
 * @param {{ runtimeRoot: string, projectRoot: string }} ctx
 * @returns {CapabilityRequirement & { status: RequirementStatus }}
 */
export function classifyRequirement(req, ctx) {
  const projectRoot = ctx.projectRoot;
  const runtimeRoot = ctx.runtimeRoot;
  const dirs = resolveAg9RuntimeDirs(runtimeRoot);
  /** @type {string[]} */
  const evidence = [...(req.evidence || [])];

  // Project wrappers / local paths.
  if (req.kind === "wrapper" || req.id === "gradlew" || req.id === "mvnw") {
    const localBins = (req.bins || []).filter((b) => b.includes("/") || b.startsWith("."));
    for (const b of localBins.length ? localBins : req.bins || []) {
      const abs = b.startsWith("/") || /^[A-Za-z]:\\/.test(b) ? b : join(projectRoot, b);
      if (isExecutable(abs)) {
        const health = healthProbe(abs);
        if (health === "ok") {
          return {
            ...req,
            status: "PROJECT_LOCAL",
            executable: abs,
            evidence: [...evidence, `project local ${abs}`],
          };
        }
        return {
          ...req,
          status: "BROKEN",
          executable: abs,
          evidence: [...evidence, `project local broken ${abs}`],
        };
      }
    }
  }

  // Explicit project-relative bins (e.g. .venv).
  for (const b of req.bins || []) {
    if (!b.includes("/") && !b.startsWith(".")) continue;
    const abs = b.startsWith("/") ? b : join(projectRoot, b);
    if (isExecutable(abs)) {
      const health = healthProbe(abs);
      return {
        ...req,
        status: health === "ok" ? "PROJECT_LOCAL" : "BROKEN",
        executable: abs,
        evidence: [...evidence, abs],
      };
    }
  }

  // PATH runtime (mise which / language-servers dir).
  for (const b of req.bins || []) {
    const base = b.split("/").pop() || b;
    const fromMise = miseWhich(runtimeRoot, base);
    if (fromMise && isExecutable(fromMise)) {
      const health = healthProbe(fromMise);
      return {
        ...req,
        status: health === "ok" ? "PATH_RUNTIME_READY" : "BROKEN",
        executable: fromMise,
        evidence: [...evidence, `mise which ${base} → ${fromMise}`],
      };
    }
    const lsCandidate = join(dirs.languageServers, "bin", base);
    if (isExecutable(lsCandidate)) {
      const health = healthProbe(lsCandidate);
      return {
        ...req,
        status: health === "ok" ? "PATH_RUNTIME_READY" : "BROKEN",
        executable: lsCandidate,
        evidence: [...evidence, lsCandidate],
      };
    }
  }

  // Host PATH.
  for (const b of req.bins || []) {
    const base = b.split("/").pop() || b;
    if (base.includes("/")) continue;
    const host = whichBinary(base);
    if (host) {
      const health = healthProbe(host);
      if (health === "ok") {
        return {
          ...req,
          status: "HOST_READY",
          executable: host,
          evidence: [...evidence, `host ${base} → ${host}`],
        };
      }
      return {
        ...req,
        status: "BROKEN",
        executable: host,
        evidence: [...evidence, `host broken ${host}`],
      };
    }
  }

  // Unsupported / no mise mapping on unsupported platforms could be INCOMPATIBLE —
  // left to provision layer; here treat as MISSING.
  if (!req.miseTool && req.kind === "lsp") {
    return {
      ...req,
      status: "MISSING",
      executable: null,
      evidence: [...evidence, "no host/runtime LSP binary"],
    };
  }

  return {
    ...req,
    status: "MISSING",
    executable: null,
    evidence: [...evidence, "not found on project, host, or PATH runtime"],
  };
}
