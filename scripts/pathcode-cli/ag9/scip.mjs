/**
 * G9 — SCIP indexer acquire + fingerprint-cached indexes.
 * PATH owns cache under runtime; refuses stale fingerprint as current.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { whichBinary } from "../ag8/discover.mjs";
import { ensureAg9RuntimeDirs } from "./layout.mjs";
import { withToolLock } from "./locks.mjs";
import { appendProvenance } from "./provenance.mjs";

const LARGE_FILE_THRESHOLD = 400;

/**
 * @param {string} projectRoot
 * @param {string} rel
 */
function has(projectRoot, rel) {
  try {
    return existsSync(join(projectRoot, rel));
  } catch {
    return false;
  }
}

/**
 * @param {string} projectRoot
 * @param {string} rel
 */
function readText(projectRoot, rel) {
  try {
    return readFileSync(join(projectRoot, rel), "utf8");
  } catch {
    return null;
  }
}

/**
 * Count files under projectRoot with a shallow/bounded walk.
 * @param {string} root
 * @param {number} [limit]
 */
function countFilesBounded(root, limit = LARGE_FILE_THRESHOLD + 50) {
  let count = 0;
  /** @type {string[]} */
  const stack = [root];
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".next",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  while (stack.length && count <= limit) {
    const dir = stack.pop();
    if (!dir) break;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".") && ent.name !== ".github") continue;
      if (skip.has(ent.name)) continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile()) {
        count += 1;
        if (count > limit) return count;
      }
    }
  }
  return count;
}

/**
 * True when monorepo markers / large trees suggest SCIP is worthwhile.
 * @param {{ projectRoot: string, taskText?: string }} input
 * @returns {boolean}
 */
export function shouldBuildScipIndex({ projectRoot, taskText }) {
  if (typeof projectRoot !== "string" || !projectRoot.trim()) return false;
  const root = projectRoot.trim();

  if (has(root, "pnpm-workspace.yaml") || has(root, "pnpm-workspace.yml")) return true;
  if (has(root, "lerna.json")) return true;
  if (has(root, "nx.json")) return true;
  if (has(root, "turbo.json")) return true;
  if (has(root, "go.work")) return true;

  if (has(root, "Cargo.toml")) {
    const cargo = readText(root, "Cargo.toml") || "";
    if (/\[workspace\]/i.test(cargo) && /members\s*=/i.test(cargo)) return true;
  }

  if (has(root, "package.json")) {
    try {
      const pkg = JSON.parse(readText(root, "package.json") || "{}");
      if (Array.isArray(pkg.workspaces) && pkg.workspaces.length > 0) return true;
      if (pkg.workspaces && typeof pkg.workspaces === "object" && Array.isArray(pkg.workspaces.packages)) {
        return pkg.workspaces.packages.length > 0;
      }
    } catch {
      /* ignore */
    }
  }

  // Multiple package roots under packages/ or apps/
  for (const dir of ["packages", "apps", "services", "libs"]) {
    const p = join(root, dir);
    if (!existsSync(p)) continue;
    try {
      const kids = readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory());
      if (kids.length >= 2) return true;
    } catch {
      /* ignore */
    }
  }

  const fileCount = countFilesBounded(root);
  if (fileCount >= LARGE_FILE_THRESHOLD) return true;

  const text = typeof taskText === "string" ? taskText.toLowerCase() : "";
  if (text && /\b(monorepo|cross-package|scip|code.?intel|find references|go to definition)\b/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Fingerprint project tree + indexer version for cache keys.
 * @param {{ projectRoot: string, indexerVersion: string }} input
 * @returns {string}
 */
export function scipFingerprint({ projectRoot, indexerVersion }) {
  const hash = createHash("sha256");
  hash.update(`indexer:${indexerVersion || "unknown"}\n`);

  /** @type {string[]} */
  const markers = [
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
    "tsconfig.json",
    "Cargo.toml",
    "Cargo.lock",
    "go.mod",
    "go.sum",
    "go.work",
    "pyproject.toml",
    "poetry.lock",
    "requirements.txt",
  ];

  for (const m of markers) {
    const p = join(projectRoot, m);
    if (!existsSync(p)) continue;
    try {
      const st = statSync(p);
      hash.update(`${m}:${st.size}:${Math.trunc(st.mtimeMs)}\n`);
      // Include small file contents for stronger fingerprint.
      if (st.size > 0 && st.size < 256_000) {
        hash.update(readFileSync(p));
        hash.update("\n");
      }
    } catch {
      hash.update(`${m}:unreadable\n`);
    }
  }

  // Sample top-level package dirs for monorepo churn.
  for (const dir of ["packages", "apps", "services", "libs"]) {
    const p = join(projectRoot, dir);
    if (!existsSync(p)) continue;
    try {
      const kids = readdirSync(p).sort();
      hash.update(`${dir}:${kids.join(",")}\n`);
    } catch {
      /* ignore */
    }
  }

  try {
    const gitHead = spawnSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], {
      encoding: "utf8",
      timeout: 5_000,
    });
    if (gitHead.status === 0) {
      hash.update(`git:${(gitHead.stdout || "").trim()}\n`);
    }
  } catch {
    /* ignore */
  }

  return hash.digest("hex").slice(0, 32);
}

/**
 * @param {string} runtimeRoot
 * @param {string} language
 * @returns {{ bin: string | null, version: string, evidence: string[] }}
 */
function ensureIndexer(runtimeRoot, language) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  /** @type {string[]} */
  const evidence = [];
  const lang = (language || "typescript").toLowerCase();

  if (lang === "typescript" || lang === "javascript") {
    const prefix = join(dirs.indexers, "npm", "scip-typescript");
    const bin = join(prefix, "node_modules", ".bin", "scip-typescript");
    if (existsSync(bin)) {
      evidence.push(`scip-typescript → ${bin}`);
      return { bin, version: "scip-typescript", evidence };
    }
    const npm = whichBinary("npm");
    if (npm) {
      mkdirSync(prefix, { recursive: true });
      const r = spawnSync(
        npm,
        [
          "install",
          "--prefix",
          prefix,
          "--no-save",
          "--no-package-lock",
          "@sourcegraph/scip-typescript",
        ],
        { encoding: "utf8", timeout: 300_000, env: process.env },
      );
      evidence.push(`npm install scip-typescript status=${r.status}`);
      if (existsSync(bin)) {
        return { bin, version: "scip-typescript", evidence };
      }
    } else {
      evidence.push("npm missing — cannot install scip-typescript");
    }
  }

  if (lang === "python") {
    const bin = whichBinary("scip-python") || whichBinary("scip");
    if (bin) {
      evidence.push(`python indexer → ${bin}`);
      return { bin, version: "scip-python-host", evidence };
    }
    evidence.push("scip-python unavailable (best-effort)");
  }

  if (lang === "go") {
    const bin = whichBinary("scip") || whichBinary("lsif-go");
    if (bin) {
      evidence.push(`go indexer → ${bin}`);
      return { bin, version: "scip-go-host", evidence };
    }
    evidence.push("scip go indexer unavailable (best-effort)");
  }

  if (lang === "rust") {
    const bin = whichBinary("rust-analyzer") || whichBinary("scip");
    if (bin) {
      evidence.push(`rust indexer probe → ${bin}`);
      return { bin, version: "rust-best-effort", evidence };
    }
  }

  const scip = whichBinary("scip");
  if (scip) {
    evidence.push(`generic scip → ${scip}`);
    return { bin: scip, version: "scip-cli", evidence };
  }

  return { bin: null, version: "none", evidence };
}

/**
 * Build or reuse a SCIP index under caches/scip/{fingerprint}/.
 * Refuses to return a directory whose stored fingerprint mismatches.
 *
 * @param {{
 *   projectRoot: string,
 *   runtimeRoot: string,
 *   language?: string,
 *   emit?: (event: object) => void,
 * }} input
 */
export async function ensureScipIndex({
  projectRoot,
  runtimeRoot,
  language = "typescript",
  emit,
}) {
  const dirs = ensureAg9RuntimeDirs(runtimeRoot);
  const emitFn = typeof emit === "function" ? emit : () => {};

  return withToolLock(dirs.locks, `scip:${language}`, async () => {
    const indexer = ensureIndexer(runtimeRoot, language);
    /** @type {string[]} */
    const evidence = [...indexer.evidence];
    const fingerprint = scipFingerprint({
      projectRoot,
      indexerVersion: indexer.version || "heuristic",
    });
    const indexDir = join(dirs.scipCache, fingerprint);
    const metaPath = join(indexDir, "fingerprint.json");
    const indexPath = join(indexDir, "index.scip");
    const symbolMapPath = join(indexDir, "symbols.json");

    if (!indexer.bin) {
      evidence.push("indexer binary unavailable — heuristic symbol map only");
    }

    if (existsSync(metaPath) && (existsSync(indexPath) || existsSync(symbolMapPath))) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf8"));
        if (meta.fingerprint === fingerprint) {
          evidence.push(`cache hit ${fingerprint}`);
          emitFn({
            type: "session.capability.indexing",
            status: "cache_hit",
            fingerprint,
          });
          return {
            ok: true,
            indexDir,
            fingerprint,
            indexPath: existsSync(indexPath) ? indexPath : null,
            symbolMapPath: existsSync(symbolMapPath) ? symbolMapPath : null,
            evidence,
            cached: true,
          };
        }
        evidence.push("fingerprint mismatch — refusing stale index");
        rmSync(indexDir, { recursive: true, force: true });
      } catch {
        evidence.push("corrupt cache meta — rebuilding");
        rmSync(indexDir, { recursive: true, force: true });
      }
    } else if (existsSync(indexDir) && !existsSync(metaPath)) {
      evidence.push("index dir without fingerprint — refusing stale");
      rmSync(indexDir, { recursive: true, force: true });
    }

    mkdirSync(indexDir, { recursive: true });
    emitFn({
      type: "session.capability.indexing",
      status: "building",
      fingerprint,
      language,
    });

    const lang = (language || "typescript").toLowerCase();
    let built = false;

    if (
      indexer.bin &&
      (lang === "typescript" || lang === "javascript") &&
      indexer.bin.includes("scip-typescript")
    ) {
      const r = spawnSync(
        indexer.bin,
        ["index", "--output", indexPath],
        {
          cwd: projectRoot,
          encoding: "utf8",
          timeout: 600_000,
          env: process.env,
        },
      );
      evidence.push(`scip-typescript index status=${r.status}`);
      if (r.stderr) evidence.push((r.stderr || "").slice(0, 300));
      built = r.status === 0 && existsSync(indexPath);
    }

    if (!built) {
      // Best-effort: write a minimal symbol map so MCP tools work without full SCIP CLI.
      const symbols = buildHeuristicSymbolMap(projectRoot);
      writeFileSync(symbolMapPath, `${JSON.stringify(symbols, null, 2)}\n`, "utf8");
      writeFileSync(
        indexPath,
        `# pathcode-g9 heuristic scip placeholder\nfingerprint=${fingerprint}\n`,
        "utf8",
      );
      evidence.push(
        `heuristic symbol map (${symbols.symbols?.length || 0} symbols)`,
      );
      built = true;
    } else if (!existsSync(symbolMapPath)) {
      const symbols = buildHeuristicSymbolMap(projectRoot);
      writeFileSync(symbolMapPath, `${JSON.stringify(symbols, null, 2)}\n`, "utf8");
    }

    writeFileSync(
      metaPath,
      `${JSON.stringify(
        {
          fingerprint,
          indexerVersion: indexer.version,
          language: lang,
          projectRoot,
          builtAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    appendProvenance(join(dirs.metadata, "capabilities.jsonl"), {
      tool: `scip:${lang}`,
      version: indexer.version,
      source: "scip.ensure",
      executable: indexer.bin || "",
      health: built ? "ok" : "failed",
      integrity: fingerprint,
      requestedBy: "ensureScipIndex",
    });

    if (!built) {
      return {
        ok: false,
        reason: "index_build_failed",
        indexDir: null,
        fingerprint,
        evidence,
      };
    }

    return {
      ok: true,
      indexDir,
      fingerprint,
      indexPath,
      symbolMapPath,
      evidence,
      cached: false,
    };
  });
}

/**
 * @param {string} projectRoot
 */
function buildHeuristicSymbolMap(projectRoot) {
  /** @type {Array<{ name: string, path: string, kind: string }>} */
  const symbols = [];
  /** @type {string[]} */
  const stack = [projectRoot];
  const skip = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "target",
    ".next",
    "vendor",
    "__pycache__",
    ".venv",
    "venv",
  ]);
  let seen = 0;
  while (stack.length && seen < 2_000) {
    const dir = stack.pop();
    if (!dir) break;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (skip.has(ent.name)) continue;
      if (ent.name.startsWith(".") && ent.name !== ".github") continue;
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs)$/i.test(ent.name)) continue;
      seen += 1;
      const rel = relative(projectRoot, full);
      const base = ent.name.replace(/\.[^.]+$/, "");
      symbols.push({ name: base, path: rel, kind: "file_symbol" });
      try {
        const text = readFileSync(full, "utf8").slice(0, 40_000);
        const re =
          /\b(?:export\s+(?:async\s+)?(?:function|class|const|let|var|type|interface)|def|func|fn|class|struct|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
        let m;
        while ((m = re.exec(text))) {
          symbols.push({ name: m[1], path: rel, kind: "definition" });
          if (symbols.length > 5_000) break;
        }
      } catch {
        /* ignore */
      }
      if (symbols.length > 5_000) break;
    }
  }
  return { version: 1, symbols };
}

/**
 * Best-effort query via `scip` CLI or local symbol map.
 * @param {{ indexDir: string, op: string, symbol: string }} input
 */
export function queryScipIndex({ indexDir, op, symbol }) {
  if (typeof indexDir !== "string" || !indexDir.trim()) {
    return { ok: false, reason: "indexDir_required", results: [] };
  }
  if (!existsSync(indexDir)) {
    return { ok: false, reason: "index_missing", results: [] };
  }

  const metaPath = join(indexDir, "fingerprint.json");
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      const expected = meta.fingerprint;
      const dirName = indexDir.split(/[/\\]/).filter(Boolean).pop();
      if (expected && dirName && expected !== dirName) {
        return {
          ok: false,
          reason: "fingerprint_mismatch",
          results: [],
          evidence: [`expected ${expected} dir ${dirName}`],
        };
      }
    } catch {
      /* ignore */
    }
  }

  const scip = whichBinary("scip");
  const indexPath = join(indexDir, "index.scip");
  if (scip && existsSync(indexPath) && !isHeuristicPlaceholder(indexPath)) {
    const args =
      op === "definition" || op === "code_definition"
        ? ["print", "--json", indexPath]
        : op === "references" || op === "code_references"
          ? ["print", "--json", indexPath]
          : ["print", "--json", indexPath];
    const r = spawnSync(scip, args, {
      encoding: "utf8",
      timeout: 30_000,
      env: process.env,
    });
    if (r.status === 0) {
      const needle = String(symbol || "").toLowerCase();
      const lines = (r.stdout || "")
        .split("\n")
        .filter((l) => !needle || l.toLowerCase().includes(needle))
        .slice(0, 50);
      return {
        ok: true,
        source: "scip-cli",
        results: lines.map((l) => ({ raw: l })),
      };
    }
  }

  const symbolMapPath = join(indexDir, "symbols.json");
  if (!existsSync(symbolMapPath)) {
    return { ok: false, reason: "no_symbol_map_or_scip_cli", results: [] };
  }

  try {
    const map = JSON.parse(readFileSync(symbolMapPath, "utf8"));
    const needle = String(symbol || "").toLowerCase();
    const all = Array.isArray(map.symbols) ? map.symbols : [];
    const matched = all
      .filter(
        (s) =>
          !needle ||
          String(s.name || "")
            .toLowerCase()
            .includes(needle) ||
          String(s.path || "")
            .toLowerCase()
            .includes(needle),
      )
      .slice(0, 50);
    return {
      ok: true,
      source: "symbol_map",
      op,
      results: matched,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
      results: [],
    };
  }
}

/**
 * @param {string} indexPath
 */
function isHeuristicPlaceholder(indexPath) {
  try {
    const head = readFileSync(indexPath, "utf8").slice(0, 80);
    return head.includes("pathcode-g9 heuristic");
  } catch {
    return false;
  }
}
