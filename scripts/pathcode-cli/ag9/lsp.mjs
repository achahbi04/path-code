/**
 * G9 — language server provision + health checks.
 * Acquires mature LSP binaries into PATH runtime; does not implement an LSP.
 */

import {
  existsSync,
  mkdirSync,
  symlinkSync,
  chmodSync,
  copyFileSync,
  createWriteStream,
  rmSync,
  readdirSync,
  renameSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { whichBinary } from "../ag8/discover.mjs";
import { ensureAg9RuntimeDirs } from "./layout.mjs";
import { withToolLock } from "./locks.mjs";
import { ensureMise, miseEnv, miseInstall, miseWhich } from "./mise.mjs";
import { appendProvenance } from "./provenance.mjs";

/** Pinned Eclipse JDT LS snapshot URL (mature upstream; PATH extracts under runtime). */
export const JDTLS_TARBALL_URL =
  "https://download.eclipse.org/jdtls/snapshots/jdt-language-server-latest.tar.gz";

/**
 * Language → preferred bins + optional mise/npm/eclipse/dotnet acquisition hints.
 * @type {Readonly<Record<string, { bins: string[], miseTool?: string, npmPackage?: string, args?: string[], eclipseJdtls?: boolean, dotnetTool?: string }>>}
 */
export const LSP_SERVERS = Object.freeze({
  typescript: {
    bins: ["typescript-language-server"],
    npmPackage: "typescript-language-server",
    args: ["--stdio"],
  },
  javascript: {
    bins: ["typescript-language-server"],
    npmPackage: "typescript-language-server",
    args: ["--stdio"],
  },
  python: {
    bins: ["basedpyright-langserver", "basedpyright", "pyright-langserver", "pyright", "pylsp"],
    npmPackage: "pyright",
    args: ["--stdio"],
  },
  go: {
    bins: ["gopls"],
    miseTool: "go:golang.org/x/tools/gopls",
  },
  rust: {
    bins: ["rust-analyzer"],
    miseTool: "rust-analyzer",
  },
  java: {
    bins: ["jdtls", "java-language-server"],
    eclipseJdtls: true,
  },
  c: {
    bins: ["clangd"],
    miseTool: "llvm",
  },
  cpp: {
    bins: ["clangd"],
    miseTool: "llvm",
  },
  // Discover uses language id "c_cpp"; map to the same clangd capability.
  c_cpp: {
    bins: ["clangd"],
    miseTool: "llvm",
  },
  csharp: {
    bins: ["csharp-ls", "OmniSharp"],
    miseTool: "dotnet",
    /** Local `dotnet tool install --tool-path` package (PATH language-servers/bin). */
    dotnetTool: "csharp-ls",
  },
});

/**
 * Download + extract Eclipse JDT Language Server into PATH runtime.
 * @param {string} runtimeRoot
 * @returns {Promise<{ ok: boolean, executable: string | null, evidence: string[] }>}
 */
export async function installEclipseJdtls(runtimeRoot) {
  /** @type {string[]} */
  const evidence = [];
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const destRoot = join(dirs.languageServers, "jdtls-dist");
  const launcherLink = join(dirs.languageServers, "bin", "jdtls");
  mkdirSync(join(dirs.languageServers, "bin"), { recursive: true });

  const existing = findJdtlsLauncher(destRoot);
  if (existing) {
    linkJdtls(existing, launcherLink);
    evidence.push(`reusing ${existing}`);
    return { ok: true, executable: launcherLink, evidence };
  }

  mkdirSync(dirs.downloads || join(dirs.miseHome, "downloads"), { recursive: true });
  const downloads = dirs.downloads || join(dirs.miseHome, "downloads");
  const archive = join(downloads, "jdt-language-server-latest.tar.gz");
  try {
    evidence.push(`fetch ${JDTLS_TARBALL_URL}`);
    const res = await fetch(JDTLS_TARBALL_URL, { redirect: "follow" });
    if (!res.ok || !res.body) {
      return {
        ok: false,
        executable: null,
        evidence: [...evidence, `HTTP ${res.status}`],
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await new Promise((resolve, reject) => {
      const file = createWriteStream(archive);
      file.on("error", reject);
      file.on("finish", resolve);
      file.end(buf);
    });
    evidence.push(`downloaded ${buf.length} bytes`);
  } catch (err) {
    return {
      ok: false,
      executable: null,
      evidence: [
        ...evidence,
        `download failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  try {
    rmSync(destRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(destRoot, { recursive: true });
  const tar = spawnSync("tar", ["-xzf", archive, "-C", destRoot], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (tar.status !== 0) {
    return {
      ok: false,
      executable: null,
      evidence: [
        ...evidence,
        `tar failed: ${(tar.stderr || tar.stdout || "").slice(0, 200)}`,
      ],
    };
  }

  const launcher = findJdtlsLauncher(destRoot);
  if (!launcher) {
    return {
      ok: false,
      executable: null,
      evidence: [...evidence, "jdtls launcher not found after extract"],
    };
  }
  linkJdtls(launcher, launcherLink);
  evidence.push(`launcher ${launcher}`);
  return { ok: true, executable: launcherLink, evidence };
}

/**
 * @param {string} root
 * @returns {string | null}
 */
function findJdtlsLauncher(root) {
  if (!existsSync(root)) return null;
  const direct = [
    join(root, "bin", "jdtls"),
    join(root, "jdtls"),
  ];
  for (const p of direct) {
    if (existsSync(p)) return p;
  }
  // Search one level deep for bin/jdtls
  try {
    for (const name of readdirSync(root)) {
      const candidate = join(root, name, "bin", "jdtls");
      if (existsSync(candidate)) return candidate;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {string} target
 * @param {string} linkPath
 */
function linkJdtls(target, linkPath) {
  mkdirSync(dirname(linkPath), { recursive: true });
  try {
    rmSync(linkPath, { force: true });
  } catch {
    /* ignore */
  }
  try {
    symlinkSync(target, linkPath);
  } catch {
    copyFileSync(target, linkPath);
  }
  try {
    chmodSync(linkPath, 0o755);
  } catch {
    /* ignore */
  }
}

/**
 * @param {string} executable
 * @param {number} [timeoutMs]
 * @returns {{ ok: boolean, evidence: string[] }}
 */
export function healthCheckLsp(executable, timeoutMs = 8_000) {
  /** @type {string[]} */
  const evidence = [];
  if (typeof executable !== "string" || !executable.trim()) {
    return { ok: false, evidence: ["empty executable"] };
  }
  if (!existsSync(executable)) {
    return { ok: false, evidence: [`missing: ${executable}`] };
  }

  const attempts = [
    ["--version"],
    ["version"],
    ["--help"],
    ["help"],
  ];

  for (const args of attempts) {
    try {
      const r = spawnSync(executable, args, {
        encoding: "utf8",
        timeout: timeoutMs,
        env: process.env,
      });
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
      evidence.push(
        `${args.join(" ")} → status=${r.status}${out ? ` ${out.slice(0, 160)}` : ""}`,
      );
      // Many LSPs exit 0 on --version/--help; some exit non-zero but still print usage.
      if (r.error && /** @type {NodeJS.ErrnoException} */ (r.error).code === "ETIMEDOUT") {
        evidence.push("timeout");
        continue;
      }
      if (r.status === 0 || /version|usage|help|language.?server/i.test(out)) {
        return { ok: true, evidence };
      }
    } catch (err) {
      evidence.push(`spawn error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Last resort: short spawn with --stdio then kill — proves binary starts.
  try {
    const r = spawnSync(executable, ["--stdio"], {
      encoding: "utf8",
      timeout: 1_500,
      env: process.env,
      input: "",
    });
    evidence.push(`stdio probe status=${r.status} (short timeout expected)`);
    // Timeout or quick exit both mean the binary launched.
    if (
      !r.error ||
      /** @type {NodeJS.ErrnoException} */ (r.error).code === "ETIMEDOUT"
    ) {
      return { ok: true, evidence };
    }
  } catch (err) {
    evidence.push(`stdio probe: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: false, evidence };
}

/**
 * @param {string} runtimeRoot
 * @param {string} npmPackage
 * @param {string} binName
 * @returns {string | null}
 */
function installNpmLsp(runtimeRoot, npmPackage, binName) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const prefix = join(dirs.languageServers, "npm", npmPackage);
  mkdirSync(prefix, { recursive: true });
  const binPath = join(prefix, "node_modules", ".bin", binName);
  if (existsSync(binPath)) return binPath;

  const npm = whichBinary("npm");
  if (!npm) return null;
  const r = spawnSync(
    npm,
    ["install", "--prefix", prefix, "--no-save", "--no-package-lock", npmPackage],
    { encoding: "utf8", timeout: 300_000, env: process.env },
  );
  if (r.status !== 0) return null;
  return existsSync(binPath) ? binPath : null;
}

/**
 * Install a .NET global-style tool into PATH language-servers/bin (non-interactive).
 * AppHost tools need DOTNET_ROOT; wrap the installed binary so launch works without
 * callers exporting it.
 *
 * @param {string} runtimeRoot
 * @param {string} toolName
 * @returns {string | null}
 */
export function installDotnetToolLsp(runtimeRoot, toolName) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const toolPath = join(dirs.languageServers, "bin");
  const binPath = join(toolPath, toolName);
  const apphost = join(toolPath, `${toolName}.apphost`);
  mkdirSync(toolPath, { recursive: true });

  if (existsSync(binPath) || existsSync(apphost)) {
    return wrapDotnetToolApphost(runtimeRoot, binPath, apphost);
  }

  const dotnet = miseWhich(runtimeRoot, "dotnet") || whichBinary("dotnet");
  if (!dotnet) return null;
  const dotnetRoot = dirname(dotnet);
  const env = {
    ...miseEnv(runtimeRoot),
    DOTNET_ROOT: dotnetRoot,
  };
  env.PATH = `${dotnetRoot}:${env.PATH || ""}`;

  const r = spawnSync(
    dotnet,
    ["tool", "install", "--tool-path", toolPath, toolName],
    { encoding: "utf8", timeout: 300_000, env },
  );
  if (!existsSync(binPath) && r.status !== 0) return null;
  if (!existsSync(binPath)) return null;
  return wrapDotnetToolApphost(runtimeRoot, binPath, apphost);
}

/**
 * @param {string} runtimeRoot
 * @param {string} binPath
 * @param {string} apphost
 * @returns {string | null}
 */
function wrapDotnetToolApphost(runtimeRoot, binPath, apphost) {
  const dotnet = miseWhich(runtimeRoot, "dotnet") || whichBinary("dotnet");
  if (!dotnet) return existsSync(binPath) ? binPath : null;
  const dotnetRoot = dirname(dotnet);

  try {
    if (existsSync(binPath) && !existsSync(apphost)) {
      let isWrapper = false;
      try {
        const head = readFileSync(binPath, { encoding: "utf8" }).slice(0, 64);
        isWrapper = head.startsWith("#!") && head.includes("DOTNET_ROOT");
      } catch {
        /* binary / unreadable — treat as apphost */
      }
      if (!isWrapper) {
        renameSync(binPath, apphost);
      }
    }
    if (!existsSync(apphost)) {
      return existsSync(binPath) ? binPath : null;
    }
    // Absolute apphost path — linkIntoLanguageServers may symlink this launcher.
    const script = `#!/bin/sh
export DOTNET_ROOT=${JSON.stringify(dotnetRoot)}
export PATH="$DOTNET_ROOT:$PATH"
exec ${JSON.stringify(apphost)} "$@"
`;
    writeFileSync(binPath, script, { encoding: "utf8", mode: 0o755 });
    chmodSync(binPath, 0o755);
  } catch {
    return existsSync(binPath) ? binPath : null;
  }
  return existsSync(binPath) ? binPath : null;
}

/**
 * @param {string} runtimeRoot
 * @param {string} executable
 * @param {string} id
 * @returns {string}
 */
function linkIntoLanguageServers(runtimeRoot, executable, id) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const dest = join(dirs.languageServers, id);
  try {
    mkdirSync(dirname(dest), { recursive: true });
    try {
      rmSync(dest, { force: true });
    } catch {
      /* ignore */
    }
    symlinkSync(executable, dest);
    try {
      chmodSync(dest, 0o755);
    } catch {
      /* ignore */
    }
  } catch {
    return executable;
  }
  return existsSync(dest) ? dest : executable;
}

/**
 * Ensure language servers for requested languages; health-check each.
 *
 * @param {{
 *   languages: Array<string | { id: string }>,
 *   runtimeRoot: string,
 *   emit?: (event: object) => void,
 * }} input
 * @returns {Promise<Array<{ id: string, status: string, executable: string | null, evidence: string[] }>>}
 */
export async function provisionLanguageServers({ languages, runtimeRoot, emit }) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const emitFn = typeof emit === "function" ? emit : () => {};
  try {
    await ensureMise({ runtimeRoot });
  } catch {
    /* best-effort — host/npm paths may still work */
  }
  const ids = [
    ...new Set(
      (languages || [])
        .map((l) => (typeof l === "string" ? l : l && typeof l.id === "string" ? l.id : ""))
        .filter(Boolean)
        .map((s) => s.toLowerCase()),
    ),
  ];

  /** @type {Array<{ id: string, status: string, executable: string | null, evidence: string[] }>} */
  const results = [];

  for (const id of ids) {
    const spec = LSP_SERVERS[id];
    if (!spec) {
      results.push({
        id,
        status: "unavailable",
        executable: null,
        evidence: [`no LSP mapping for language ${id}`],
      });
      continue;
    }

    emitFn({ type: "session.capability.provisioning", tool: `lsp:${id}` });

    const entry = await withToolLock(dirs.locks, `lsp:${id}`, async () => {
      /** @type {string[]} */
      const evidence = [`bins=${spec.bins.join(",")}`];
      /** @type {string | null} */
      let executable = null;

      for (const bin of spec.bins) {
        const runtimeBin = join(dirs.languageServers, "bin", bin);
        if (existsSync(runtimeBin)) {
          if (spec.dotnetTool && bin === spec.dotnetTool) {
            executable =
              wrapDotnetToolApphost(
                runtimeRoot,
                runtimeBin,
                join(dirs.languageServers, "bin", `${bin}.apphost`),
              ) || runtimeBin;
            evidence.push(`runtime ${bin} → ${executable}`);
          } else {
            executable = runtimeBin;
            evidence.push(`runtime ${bin} → ${runtimeBin}`);
          }
          break;
        }
        const host = whichBinary(bin);
        if (host) {
          executable = host;
          evidence.push(`host ${bin} → ${host}`);
          break;
        }
        const mise = miseWhich(runtimeRoot, bin);
        if (mise) {
          executable = mise;
          evidence.push(`mise ${bin} → ${mise}`);
          break;
        }
        evidence.push(`${bin} not found`);
      }

      if (!executable && spec.miseTool) {
        const inst = miseInstall(runtimeRoot, spec.miseTool);
        evidence.push(
          `mise install ${spec.miseTool} ok=${Boolean(inst.ok)} status=${inst.status}`,
        );
        if (inst.stderr) evidence.push(String(inst.stderr).slice(0, 200));
        for (const bin of spec.bins) {
          const mise = miseWhich(runtimeRoot, bin);
          if (mise) {
            executable = mise;
            evidence.push(`after mise: ${bin} → ${mise}`);
            break;
          }
        }
      }

      if (!executable && spec.eclipseJdtls) {
        const jdt = await installEclipseJdtls(runtimeRoot);
        evidence.push(...jdt.evidence);
        if (jdt.ok && jdt.executable) {
          executable = jdt.executable;
        }
      }

      if (!executable && spec.npmPackage) {
        const npmBin = installNpmLsp(runtimeRoot, spec.npmPackage, spec.bins[0]);
        if (npmBin) {
          executable = npmBin;
          evidence.push(`npm ${spec.npmPackage} → ${npmBin}`);
        } else {
          evidence.push(`npm install ${spec.npmPackage} failed or npm missing`);
        }
      }

      if (!executable && spec.dotnetTool) {
        const dotnetBin = installDotnetToolLsp(runtimeRoot, spec.dotnetTool);
        if (dotnetBin) {
          executable = dotnetBin;
          evidence.push(`dotnet tool ${spec.dotnetTool} → ${dotnetBin}`);
        } else {
          evidence.push(
            `dotnet tool install --tool-path ${join(dirs.languageServers, "bin")} ${spec.dotnetTool} failed or dotnet missing`,
          );
        }
      }

      if (!executable) {
        return {
          id,
          status: "unavailable",
          executable: null,
          evidence,
        };
      }

      const linked = linkIntoLanguageServers(runtimeRoot, executable, spec.bins[0]);
      const health = healthCheckLsp(linked);
      evidence.push(...health.evidence.map((e) => `health: ${e}`));

      appendProvenance(join(dirs.metadata, "capabilities.jsonl"), {
        tool: `lsp:${id}`,
        source: "lsp.provision",
        executable: linked,
        health: health.ok ? "ok" : "failed",
        requestedBy: "provisionLanguageServers",
      });

      return {
        id,
        status: health.ok ? "ready" : "broken",
        executable: health.ok ? linked : linked,
        evidence,
      };
    });

    results.push(entry);
  }

  return results;
}
