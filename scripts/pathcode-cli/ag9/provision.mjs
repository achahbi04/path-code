/**
 * G9 — provision MISSING/BROKEN requirements via PATH-owned mise.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { platformBackend } from "./backends.mjs";
import { ensureAg9RuntimeDirs, resolveAg9RuntimeDirs } from "./layout.mjs";
import { withToolLock } from "./locks.mjs";
import { ensureMise, miseEnv, miseInstall, miseWhich } from "./mise.mjs";
import { appendProvenance } from "./provenance.mjs";
import { classifyRequirement } from "./resolve.mjs";

/**
 * Map requirement id / mise tool → mise install spec.
 * @param {{ id: string, miseTool?: string, version?: { version?: string } }} req
 * @returns {string | null}
 */
export function requirementToMiseSpec(req) {
  const ver =
    typeof req.version?.version === "string" && req.version.version
      ? req.version.version
      : "";
  const tool = (req.miseTool || req.id || "").replace(/^lsp:/, "");

  /** @type {Record<string, string>} */
  const aliases = {
    rust: "rust",
    cargo: "rust",
    rustc: "rust",
    "rust-toolchain": "rust",
    go: "go",
    node: "node",
    nodejs: "node",
    npm: "node",
    java: "java",
    jdk: "java",
    openjdk: "java",
    python: "python",
    python3: "python",
    pip: "python",
    gopls: "gopls",
    "rust-analyzer": "rust-analyzer",
    jdtls: "jdtls",
    llvm: "llvm",
    clangd: "llvm",
    cmake: "cmake",
    ninja: "ninja",
    meson: "meson",
    pnpm: "pnpm",
    yarn: "yarn",
    bun: "bun",
    uv: "uv",
    poetry: "poetry",
    maven: "maven",
    mvn: "maven",
    gradle: "gradle",
    bazel: "bazel",
    bazelisk: "bazelisk",
    dotnet: "dotnet",
    csharp: "dotnet",
  };

  // npm-based LSPs handled separately
  if (tool === "typescript-language-server" || req.id === "lsp:typescript") {
    return null; // npm path
  }
  if (tool.startsWith("pipx:")) {
    const name = tool.slice("pipx:".length);
    return ver ? `pipx:${name}@${ver}` : name === "pyright" ? "pipx:pyright" : tool;
  }

  const miseName = aliases[tool] || aliases[req.id] || null;
  if (!miseName) return null;
  // Skip non-miseable host utilities
  if (["make", "pytest"].includes(req.id) && !req.miseTool) return null;

  if (!ver || ver === "latest" || ver === "lts" || ver === "stable") {
    if (ver === "lts" && miseName === "node") return "node@lts";
    if (ver === "stable" && miseName === "rust") return "rust@stable";
    if (miseName === "maven") return "maven@3.9.9";
    if (miseName === "gradle") return "gradle@8.10.2";
    return `${miseName}@latest`;
  }
  // JDK major versions must never be treated as Maven/Gradle release numbers.
  if (miseName === "maven") {
    const n = Number(ver);
    if (Number.isFinite(n) && n > 0 && n <= 25) return "maven@3.9.9";
  }
  if (miseName === "gradle") {
    const n = Number(ver);
    if (Number.isFinite(n) && n > 0 && n <= 25 && !String(ver).includes(".")) {
      return "gradle@8.10.2";
    }
  }
  return `${miseName}@${ver}`;
}

/**
 * @param {string} executable
 * @param {NodeJS.ProcessEnv} [env]
 */
function healthCheck(executable, env = process.env) {
  if (!executable || !existsSync(executable)) {
    return { ok: false, detail: "missing" };
  }
  const probe = spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.status === 0) return { ok: true, detail: "version ok" };
  const help = spawnSync(executable, ["help"], {
    encoding: "utf8",
    timeout: 5_000,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (help.status === 0 || help.stdout || help.stderr) {
    return { ok: true, detail: "help ok" };
  }
  return { ok: false, detail: "unhealthy" };
}

/**
 * Best-effort npm install of an LSP under PATH language-servers prefix.
 * @param {string} runtimeRoot
 * @param {string} npmPackage
 * @param {string} binName
 */
function installNpmLanguageServer(runtimeRoot, npmPackage, binName) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const prefix = join(dirs.languageServers, "npm");
  mkdirSync(prefix, { recursive: true });
  const node = miseWhich(runtimeRoot, "node") || "node";
  const npm = miseWhich(runtimeRoot, "npm") || "npm";
  const env = {
    ...miseEnv(runtimeRoot),
    npm_config_prefix: prefix,
  };
  const install = spawnSync(
    npm,
    ["install", "-g", "--prefix", prefix, npmPackage],
    {
      encoding: "utf8",
      env,
      timeout: 300_000,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const binPath = join(prefix, "bin", binName);
  return {
    ok: install.status === 0 && existsSync(binPath),
    executable: existsSync(binPath) ? binPath : null,
    stderr: install.stderr || "",
    node,
  };
}

/**
 * Provision requirements that are MISSING or BROKEN.
 *
 * @param {Array<object>} reqs
 * @param {{
 *   runtimeRoot: string,
 *   projectRoot?: string,
 *   emit?: (event: string, payload?: object) => void,
 *   signal?: AbortSignal,
 * }} opts
 * @returns {Promise<{
 *   ready: object[],
 *   failed: object[],
 *   toolEnvPathPrepend: string[],
 *   briefLines: string[],
 * }>}
 */
export async function provisionRequirements(reqs, opts) {
  const runtimeRoot = opts.runtimeRoot;
  const projectRoot = opts.projectRoot || process.cwd();
  const emitRaw = typeof opts.emit === "function" ? opts.emit : () => {};
  /** @param {object} event */
  const emit = (event) => {
    try {
      if (event && typeof event === "object" && typeof event.type === "string") {
        emitRaw(event);
      } else if (typeof event === "string") {
        // Back-compat: older two-arg style mistakenly called as emit(type, payload)
        emitRaw({ type: event });
      }
    } catch {
      /* ignore */
    }
  };
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const provenancePath = join(dirs.metadata, "capabilities.jsonl");
  const backend = platformBackend();

  /** @type {object[]} */
  const ready = [];
  /** @type {object[]} */
  const failed = [];
  /** @type {string[]} */
  const briefLines = [];
  /** @type {Set<string>} */
  const pathPrepend = new Set();

  const classified = (Array.isArray(reqs) ? reqs : []).map((req) =>
    req.status
      ? req
      : classifyRequirement(req, { runtimeRoot, projectRoot }),
  );

  for (const req of classified) {
    if (opts.signal?.aborted) {
      failed.push({ ...req, error: "aborted" });
      continue;
    }

    if (
      req.status === "PROJECT_LOCAL" ||
      req.status === "HOST_READY" ||
      req.status === "PATH_RUNTIME_READY"
    ) {
      ready.push(req);
      if (req.executable) {
        pathPrepend.add(dirname(req.executable));
      }
      briefLines.push(`${req.id}: ${req.status}`);
      continue;
    }

    if (req.status === "INCOMPATIBLE") {
      failed.push(req);
      briefLines.push(`${req.id}: INCOMPATIBLE`);
      continue;
    }

    // MISSING / BROKEN → acquire
    if (!backend.canAcquireUserSpace) {
      const fail = {
        ...req,
        status: "INCOMPATIBLE",
        error: `platform ${backend.id} cannot acquire user-space tools`,
      };
      failed.push(fail);
      briefLines.push(`${req.id}: prerequisite terminal (unsupported platform)`);
      emit({
        type: "session.capability.provision_failed",
        id: req.id,
        reason: fail.error,
      });
      continue;
    }

    emit({ type: "session.capability.provisioning", id: req.id });

    const result = await withToolLock(dirs.locks, req.id, async () => {
      // Re-classify under lock — another process may have installed.
      const again = classifyRequirement(req, { runtimeRoot, projectRoot });
      if (
        again.status === "PATH_RUNTIME_READY" ||
        again.status === "HOST_READY" ||
        again.status === "PROJECT_LOCAL"
      ) {
        return { ok: true, req: again, reused: true };
      }

      const miseReady = await ensureMise({ runtimeRoot, signal: opts.signal });
      if (!miseReady.ok) {
        return {
          ok: false,
          req,
          error: miseReady.error || "mise bootstrap failed",
        };
      }

      // TypeScript LSP via npm under PATH runtime.
      if (req.id === "lsp:typescript" || req.id === "typescript-language-server") {
        // Ensure node first.
        const nodeSpec = "node@lts";
        miseInstall(runtimeRoot, nodeSpec);
        const npmResult = installNpmLanguageServer(
          runtimeRoot,
          "typescript-language-server",
          "typescript-language-server",
        );
        if (!npmResult.ok || !npmResult.executable) {
          return {
            ok: false,
            req,
            error: npmResult.stderr || "npm LSP install failed",
          };
        }
        const health = healthCheck(npmResult.executable);
        appendProvenance(provenancePath, {
          tool: req.id,
          version: "latest",
          requestedBy: "g9-provision",
          source: "npm",
          executable: npmResult.executable,
          integrity: "",
          health: health.ok ? "ok" : "broken",
        });
        if (!health.ok) {
          return { ok: false, req, error: "LSP health check failed after npm install" };
        }
        return {
          ok: true,
          req: {
            ...req,
            status: "PATH_RUNTIME_READY",
            executable: npmResult.executable,
          },
          reused: false,
        };
      }

      // Python pyright via npm package as fallback when mise tool unavailable.
      if (req.id === "lsp:python") {
        const goplsSpec = requirementToMiseSpec({
          id: "pyright",
          miseTool: "pyright",
          version: { version: "latest" },
        });
        // Try mise pyright / basedpyright; fall back to npm pyright.
        let installed = null;
        if (goplsSpec) {
          const mi = miseInstall(runtimeRoot, "pyright@latest");
          if (mi.ok) installed = miseWhich(runtimeRoot, "pyright");
        }
        if (!installed) {
          const npmResult = installNpmLanguageServer(runtimeRoot, "pyright", "pyright");
          if (npmResult.ok) installed = npmResult.executable;
        }
        if (!installed) {
          return { ok: false, req, error: "pyright install failed" };
        }
        const health = healthCheck(installed);
        appendProvenance(provenancePath, {
          tool: req.id,
          version: "latest",
          requestedBy: "g9-provision",
          source: "mise-or-npm",
          executable: installed,
          health: health.ok ? "ok" : "broken",
        });
        if (!health.ok) return { ok: false, req, error: "pyright unhealthy" };
        return {
          ok: true,
          req: { ...req, status: "PATH_RUNTIME_READY", executable: installed },
        };
      }

      // Eclipse JDT LS via PATH download (not in mise registry).
      if (req.id === "lsp:java" || req.eclipseJdtls) {
        const { installEclipseJdtls } = await import("./lsp.mjs");
        const jdt = await installEclipseJdtls(runtimeRoot);
        if (!jdt.ok || !jdt.executable) {
          return {
            ok: false,
            req,
            error: (jdt.evidence || []).join("; ") || "jdtls install failed",
          };
        }
        const health = healthCheck(jdt.executable, miseEnv(runtimeRoot));
        appendProvenance(provenancePath, {
          tool: req.id,
          version: "eclipse-jdtls-latest",
          requestedBy: "g9-provision",
          source: "eclipse",
          executable: jdt.executable,
          health: health.ok ? "ok" : "broken",
        });
        if (!health.ok) {
          return { ok: false, req, error: "jdtls health check failed" };
        }
        return {
          ok: true,
          req: {
            ...req,
            status: "PATH_RUNTIME_READY",
            executable: jdt.executable,
          },
        };
      }

      const spec = requirementToMiseSpec(req);
      if (!spec) {
        return {
          ok: false,
          req,
          error: `no mise mapping for ${req.id}`,
        };
      }

      const install = miseInstall(runtimeRoot, spec);
      if (!install.ok) {
        return {
          ok: false,
          req,
          error: (install.stderr || install.stdout || "mise install failed").slice(0, 500),
        };
      }

      /** @type {string | null} */
      let executable = null;
      for (const b of req.bins || []) {
        const base = b.split("/").pop() || b;
        executable = miseWhich(runtimeRoot, base, { toolSpec: spec });
        if (executable) break;
        executable = miseWhich(runtimeRoot, base);
        if (executable) break;
      }
      if (!executable && req.miseTool) {
        executable = miseWhich(runtimeRoot, req.miseTool, { toolSpec: spec });
        if (!executable) executable = miseWhich(runtimeRoot, req.miseTool);
      }

      const health = healthCheck(executable || "", miseEnv(runtimeRoot));
      appendProvenance(provenancePath, {
        tool: req.id,
        version: req.version?.version || spec,
        requestedBy: "g9-provision",
        source: "mise",
        executable: executable || "",
        health: health.ok ? "ok" : "broken",
      });

      if (!health.ok) {
        return { ok: false, req, error: `health check failed for ${req.id}` };
      }

      return {
        ok: true,
        req: {
          ...req,
          status: "PATH_RUNTIME_READY",
          executable,
          evidence: [...(req.evidence || []), `mise install ${spec}`],
        },
      };
    });

    if (result.ok) {
      ready.push(result.req);
      if (result.req.executable) pathPrepend.add(dirname(result.req.executable));
      briefLines.push(
        `${result.req.id}: PATH_RUNTIME_READY${result.reused ? " (reused)" : ""}`,
      );
      emit({ type: "session.capability.provisioned", id: result.req.id });
    } else {
      failed.push({ ...result.req, error: result.error });
      briefLines.push(`${req.id}: FAILED (${result.error || "unknown"})`);
      emit({
        type: "session.capability.provision_failed",
        id: req.id,
        reason: result.error,
      });
    }
  }

  // Standard PATH runtime bin roots.
  pathPrepend.add(join(dirs.miseHome, "bin"));
  pathPrepend.add(join(dirs.languageServers, "bin"));
  pathPrepend.add(join(dirs.languageServers, "npm", "bin"));
  pathPrepend.add(join(dirs.toolchains, "cargo-home", "bin"));
  const shims = join(dirs.toolchains, "mise-data", "shims");
  if (existsSync(shims)) pathPrepend.add(shims);

  return {
    ready,
    failed,
    toolEnvPathPrepend: [...pathPrepend],
    briefLines,
  };
}
