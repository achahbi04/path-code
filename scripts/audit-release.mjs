#!/usr/bin/env node
/**
 * AG6 — release sanitation audit against an UNPACKED npm package directory.
 * Inspects what the user receives. Never prints secret values.
 *
 * Usage:
 *   node scripts/audit-release.mjs <unpacked-package-dir>
 *   node scripts/audit-release.mjs --tarball <path-to.tgz>
 */

import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const MAX_PACKED_BYTES = 5 * 1024 * 1024;

const FORBIDDEN_PATH_FRAGMENTS = Object.freeze([
  `${sep}tests${sep}`,
  `${sep}test${sep}`,
  `${sep}.path-code-tmp${sep}`,
  `${sep}node_modules${sep}`,
  `${sep}.git${sep}`,
  `${sep}docs${sep}reports${sep}`,
  `${sep}gc1${sep}`,
  "ensure-venv.sh",
  "ag5-live-task.mjs",
  "ag5-live-session.mjs",
  ".env",
  "application_default_credentials.json",
  "id_rsa",
  "id_ed25519",
  ".npmrc",
]);

const SECRET_PATTERNS = Object.freeze([
  {
    id: "PEM_PRIVATE_KEY",
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  { id: "GH_PAT", re: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { id: "GITHUB_TOKEN_VALUE", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { id: "GOOGLE_API_KEY_VALUE", re: /\bAIza[0-9A-Za-z\-_]{20,}\b/ },
  { id: "AWS_SECRET_STYLE", re: /\bAKIA[0-9A-Z]{16}\b/ },
]);

/**
 * @param {string} root
 * @returns {string[]}
 */
function listFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} dir */
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(abs);
      else if (st.isFile()) out.push(abs);
    }
  }
  walk(root);
  return out;
}

/**
 * @param {string} text
 * @param {string[]} needles
 */
function findEmbeddedDevPaths(text, needles) {
  /** @type {string[]} */
  const hits = [];
  for (const n of needles) {
    if (!n || n.length < 8) continue;
    if (text.includes(n)) hits.push(n);
  }
  return hits;
}

/**
 * @param {string} packageDir
 * @param {{ repoRoot?: string, home?: string }} [opts]
 */
export function auditUnpackedPackage(packageDir, opts = {}) {
  const root = resolve(packageDir);
  const repoRoot = resolve(opts.repoRoot ?? REPO_ROOT);
  const home = opts.home ?? process.env.HOME ?? homedir();
  /** @type {Array<{ file: string, category: string, detail: string }>} */
  const findings = [];

  if (!existsSync(join(root, "package.json"))) {
    return {
      ok: false,
      findings: [
        {
          file: root,
          category: "STRUCTURE",
          detail: "package.json missing in unpacked artifact",
        },
      ],
    };
  }

  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (typeof pkg.version !== "string" || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
    findings.push({
      file: "package.json",
      category: "VERSION",
      detail: `expected semver x.y.z, found ${String(pkg.version)}`,
    });
  }
  if (pkg.private === true) {
    findings.push({
      file: "package.json",
      category: "METADATA",
      detail: "package marked private; cannot publish to the public registry",
    });
  }

  const files = listFiles(root);
  const needles = [
    repoRoot,
    home,
    "/tmp/ag5-accept",
    "/tmp/ag5-pathcode",
    "/tmp/ag4-pathcode",
    "cursor-pathcode-antigravity-v1",
    "path-code-worktrees",
  ].filter(Boolean);

  for (const abs of files) {
    const rel = relative(root, abs).split(sep).join("/");

    if (
      rel.includes("/gc1/") ||
      rel.endsWith("/ensure-venv.sh") ||
      rel.includes("ag5-live-") ||
      rel.includes(".path-code-tmp/") ||
      rel.startsWith("docs/reports/") ||
      rel.includes("/node_modules/") ||
      rel.includes("/.git/") ||
      /(^|\/)\.env$/.test(rel) ||
      /application_default_credentials\.json$/.test(rel) ||
      /(^|\/)id_(rsa|ed25519)(\.pub)?$/.test(rel)
    ) {
      findings.push({
        file: rel,
        category: "DEV_ARTIFACT",
        detail: "forbidden release path",
      });
    }

    // Binary skip for large non-text
    let text;
    try {
      const st = statSync(abs);
      if (st.size > 2_000_000) continue;
      const buf = readFileSync(abs);
      if (buf.includes(0)) continue;
      text = buf.toString("utf8");
    } catch {
      continue;
    }

    const pathHits = findEmbeddedDevPaths(text, needles);
    for (const hit of pathHits) {
      findings.push({
        file: rel,
        category: "MACHINE_PATH",
        detail: `embedded development path (${basename(hit)})`,
      });
    }

    for (const pat of SECRET_PATTERNS) {
      if (pat.re.test(text)) {
        findings.push({
          file: rel,
          category: "SECRET",
          detail: pat.id,
        });
      }
    }
  }

  // Deduplicate
  const key = (f) => `${f.file}|${f.category}|${f.detail}`;
  const uniq = [];
  const seen = new Set();
  for (const f of findings) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(f);
  }

  return {
    ok: uniq.length === 0,
    findings: uniq,
    fileCount: files.length,
    packageName: pkg.name,
    version: pkg.version,
  };
}

/**
 * @param {string} tarballPath
 */
export function sha256File(tarballPath) {
  const hash = createHash("sha256");
  const data = readFileSync(tarballPath);
  hash.update(data);
  return hash.digest("hex");
}

/**
 * @param {string} tarballPath
 * @param {{ destDir?: string }} [opts]
 */
export function unpackTarball(tarballPath, opts = {}) {
  const dest =
    opts.destDir ?? mkdtempSync(join(tmpdir(), "pathcode-audit-unpack-"));
  const tar = spawnSync(
    "tar",
    ["-xzf", tarballPath, "-C", dest],
    { encoding: "utf8" },
  );
  if (tar.status !== 0) {
    throw new Error(tar.stderr || "tar extract failed");
  }
  const pkgDir = join(dest, "package");
  return { dest, packageDir: pkgDir };
}

/**
 * @param {string} tarballPath
 */
export function auditTarball(tarballPath) {
  const abs = resolve(tarballPath);
  const st = statSync(abs);
  if (st.size > MAX_PACKED_BYTES) {
    return {
      ok: false,
      packedBytes: st.size,
      sha256: sha256File(abs),
      findings: [
        {
          file: basename(abs),
          category: "SIZE",
          detail: `packed size ${st.size} exceeds ${MAX_PACKED_BYTES} byte ceiling`,
        },
      ],
    };
  }
  const { dest, packageDir } = unpackTarball(abs);
  try {
    const audit = auditUnpackedPackage(packageDir);
    return {
      ...audit,
      packedBytes: st.size,
      sha256: sha256File(abs),
      packageDir,
      unpackRoot: dest,
    };
  } finally {
    // leave dest for caller if they want; default cleanup
  }
}

function printReport(result) {
  if (result.ok) {
    console.log("audit-release PASS");
    if (typeof result.packedBytes === "number") {
      console.log(`packedBytes=${result.packedBytes}`);
    }
    if (result.sha256) console.log(`sha256=${result.sha256}`);
    if (result.fileCount) console.log(`files=${result.fileCount}`);
    return;
  }
  console.log("audit-release FAIL");
  for (const f of result.findings) {
    console.log(`${f.category}\t${f.file}\t${f.detail}`);
  }
}

function main(argv) {
  const args = [...argv];
  let tarball = null;
  let dir = null;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--tarball") {
      tarball = args[i + 1];
      i += 1;
      continue;
    }
    if (!dir) dir = args[i];
  }
  let result;
  if (tarball) {
    result = auditTarball(tarball);
    if (result.unpackRoot) {
      try {
        rmSync(result.unpackRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  } else if (dir) {
    result = auditUnpackedPackage(dir);
  } else {
    console.error(
      "Usage: node scripts/audit-release.mjs <unpacked-dir> | --tarball <file.tgz>",
    );
    process.exit(2);
  }
  printReport(result);
  process.exit(result.ok ? 0 : 1);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main(process.argv.slice(2));
}
