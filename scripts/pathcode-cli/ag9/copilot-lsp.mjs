/**
 * G9 — PATH-owned Copilot home + LSP config for collaborative engineering.
 *
 * Format (GitHub Copilot CLI):
 *   COPILOT_HOME/lsp-config.json  →  { "lspServers": { "<name>": {
 *     "command": "<abs-or-bin>", "args": ["--stdio"], "fileExtensions": { ".ts": "typescript", ... }
 *   }}}
 *
 * Never writes into the operator's ~/.copilot.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { ensureAg9RuntimeDirs, resolveAg9RuntimeDirs } from "./layout.mjs";
import { whichBinary } from "../ag8/discover.mjs";

/** Default file-extension maps for PATH-managed servers. */
const FILE_EXTENSIONS = Object.freeze({
  typescript: {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mts": "typescript",
    ".cts": "typescript",
    ".mjs": "javascript",
    ".cjs": "javascript",
  },
  javascript: {
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".mjs": "javascript",
    ".cjs": "javascript",
  },
  python: {
    ".py": "python",
    ".pyi": "python",
  },
  go: { ".go": "go" },
  rust: { ".rs": "rust" },
  java: { ".java": "java" },
  c: { ".c": "c", ".h": "c" },
  cpp: {
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".hh": "cpp",
    ".hxx": "cpp",
  },
  csharp: { ".cs": "csharp" },
});

const STDIO_ARGS = Object.freeze(["--stdio"]);

/**
 * @param {string} id
 * @returns {string[]}
 */
function defaultArgsFor(id) {
  if (id === "java" || id === "jdtls") return [];
  return [...STDIO_ARGS];
}

/**
 * Create PATH-owned COPILOT_HOME and write lsp-config.json pointing at managed LSPs.
 *
 * @param {{
 *   runtimeRoot: string,
 *   languageServers: Array<{ id: string, status?: string, executable?: string | null }>,
 * }} input
 * @returns {{
 *   copilotHome: string,
 *   lspConfigPath: string,
 *   env: Record<string, string>,
 *   servers: string[],
 *   evidence: string[],
 * }}
 */
export function prepareCopilotLspHome({ runtimeRoot, languageServers }) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const copilotHome = dirs.copilotHome;
  mkdirSync(copilotHome, { recursive: true });

  /** @type {Record<string, object>} */
  const lspServers = {};
  /** @type {string[]} */
  const servers = [];
  /** @type {string[]} */
  const evidence = [
    `COPILOT_HOME=${copilotHome}`,
    "format=Copilot CLI lsp-config.json (lspServers map)",
    "never writes ~/.copilot",
  ];

  for (const ls of languageServers || []) {
    if (!ls || typeof ls !== "object") continue;
    const id = typeof ls.id === "string" ? ls.id : "";
    const executable =
      typeof ls.executable === "string" && ls.executable.trim()
        ? ls.executable.trim()
        : null;
    if (!id || !executable) continue;
    if (ls.status && ls.status !== "ready" && ls.status !== "broken") continue;
    if (!existsSync(executable)) {
      evidence.push(`skip ${id}: executable missing`);
      continue;
    }

    const fileExtensions = FILE_EXTENSIONS[id] || { [`.${id}`]: id };
    lspServers[id] = {
      command: executable,
      args: defaultArgsFor(id),
      fileExtensions,
    };
    servers.push(id);
    evidence.push(`${id} → ${executable}`);
  }

  const lspConfigPath = join(copilotHome, "lsp-config.json");
  writeFileSync(
    lspConfigPath,
    `${JSON.stringify({ lspServers }, null, 2)}\n`,
    "utf8",
  );
  // Also write a documented alternate name used by some Copilot builds / docs.
  const altPath = join(copilotHome, "lsp.json");
  writeFileSync(altPath, `${JSON.stringify({ lspServers }, null, 2)}\n`, "utf8");
  evidence.push(`wrote ${lspConfigPath}`);
  evidence.push(`wrote ${altPath}`);

  return {
    copilotHome,
    lspConfigPath,
    env: { COPILOT_HOME: copilotHome },
    servers,
    evidence,
  };
}

/**
 * Optional light probe that Copilot CLI can see PATH-owned home / config.
 * Does not claim full LSP-backed advisory unless evidence is strong.
 *
 * @param {{
 *   copilotHome: string,
 *   executable?: string | null,
 *   cwd?: string,
 * }} input
 * @returns {{ ok: boolean, evidence: string[] }}
 */
export function probeCopilotLspReady({ copilotHome, executable, cwd }) {
  /** @type {string[]} */
  const evidence = [];
  if (typeof copilotHome !== "string" || !copilotHome.trim()) {
    return { ok: false, evidence: ["copilotHome required"] };
  }
  if (!existsSync(copilotHome)) {
    return { ok: false, evidence: [`missing COPILOT_HOME ${copilotHome}`] };
  }

  const lspConfig = join(copilotHome, "lsp-config.json");
  if (!existsSync(lspConfig)) {
    return { ok: false, evidence: [`missing ${lspConfig}`] };
  }

  try {
    const raw = JSON.parse(readFileSync(lspConfig, "utf8"));
    const servers =
      raw && typeof raw === "object" && raw.lspServers && typeof raw.lspServers === "object"
        ? Object.keys(raw.lspServers)
        : [];
    evidence.push(`lsp-config servers: ${servers.join(",") || "(none)"}`);
    if (servers.length === 0) {
      return { ok: false, evidence };
    }
  } catch (err) {
    return {
      ok: false,
      evidence: [
        `invalid lsp-config: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }

  const bin =
    (typeof executable === "string" && executable.trim()) ||
    whichBinary("copilot") ||
    null;
  if (!bin) {
    evidence.push("copilot CLI not on PATH — config present but CLI unprobed");
    // Config is valid; treat as soft-ok for env wiring.
    return { ok: true, evidence };
  }

  evidence.push(`copilot → ${bin}`);
  try {
    const r = spawnSync(bin, ["--help"], {
      encoding: "utf8",
      timeout: 8_000,
      cwd: typeof cwd === "string" && cwd ? cwd : process.cwd(),
      env: { ...process.env, COPILOT_HOME: copilotHome },
    });
    const out = `${r.stdout || ""}${r.stderr || ""}`;
    evidence.push(`copilot --help status=${r.status}`);
    if (/lsp/i.test(out)) evidence.push("help mentions lsp");
    if (r.status === 0 || out.length > 0) {
      return { ok: true, evidence };
    }
  } catch (err) {
    evidence.push(`probe error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: true, evidence };
}

/**
 * Resolve PATH-owned copilot home path without creating it.
 * @param {string} runtimeRoot
 */
export function resolveCopilotHome(runtimeRoot) {
  return resolveAg9RuntimeDirs(runtimeRoot).copilotHome;
}
