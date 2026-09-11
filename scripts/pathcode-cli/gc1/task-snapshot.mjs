/**
 * Phase GC1-c — exact admitted task snapshot for hydration set H.
 *
 * Captures working-tree bytes (not merely HEAD), rejects traversal/secrets/
 * symlinks/special files, materializes into a PATH-owned directory, and
 * verifies currentness against the recorded hashes.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

/** Basename / path patterns treated as credential canaries in tests. */
export const CREDENTIAL_CANARY_PATH_PATTERNS = Object.freeze([
  /^\.env$/i,
  /^\.env\./i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i,
  /\.pem$/i,
  /\.key$/i,
  /(^|\/)\.ssh(\/|$)/i,
  /private[_-]?key/i,
  /OPENAI_API_KEY/i,
  /PATHCODE_OPENAI_API_KEY/i,
  /PATHCODE_LIVE_OPENAI/i,
  /PATHCODE_GC1C_SECRET_CANARY/i,
  /GC1_CANARY_SECRET/i,
]);

const FORBIDDEN_DIR_SEGMENTS = new Set([
  "node_modules",
  ".git",
  ".ssh",
  ".pathcode",
  "gc1c-journal",
]);

/**
 * @param {string} relPosix
 */
export function isCredentialCanaryPath(relPosix) {
  const p = String(relPosix).replace(/\\/g, "/");
  return CREDENTIAL_CANARY_PATH_PATTERNS.some((re) => re.test(p));
}

/**
 * Lexical refusal before any filesystem touch.
 * @param {string} raw
 * @returns {{ ok: true, path: string } | { ok: false, code: string, detail: string }}
 */
export function normalizeHydrationRelativePath(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    return { ok: false, code: "PATH_INVALID", detail: "path must be a nonempty string" };
  }
  if (raw.includes("\0")) {
    return { ok: false, code: "PATH_INVALID", detail: "path contains NUL" };
  }
  const unified = raw.replaceAll("\\", "/");
  if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified)) {
    return { ok: false, code: "PATH_TRAVERSAL", detail: "path is absolute" };
  }
  const kept = [];
  for (const segment of unified.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      return { ok: false, code: "PATH_TRAVERSAL", detail: "path escapes the repository root" };
    }
    if (FORBIDDEN_DIR_SEGMENTS.has(segment)) {
      return {
        ok: false,
        code: "PATH_FORBIDDEN",
        detail: `segment '${segment}' is never hydratable`,
      };
    }
    kept.push(segment);
  }
  if (kept.length === 0) {
    return { ok: false, code: "PATH_INVALID", detail: "path resolves to repository root" };
  }
  const path = kept.join("/");
  if (isCredentialCanaryPath(path)) {
    return {
      ok: false,
      code: "PATH_SECRET",
      detail: `refused credential/secret path '${path}'`,
    };
  }
  const basename = kept[kept.length - 1];
  if (basename === ".env" || basename.startsWith(".env.")) {
    if (basename.toLowerCase() !== ".env.example") {
      return {
        ok: false,
        code: "PATH_SECRET",
        detail: "environment secret files are never hydratable",
      };
    }
  }
  return { ok: true, path };
}

/**
 * @param {{ projectRoot: string, hydrationPaths: readonly string[], origin?: object }} opts
 */
export async function captureTaskSnapshot(opts) {
  const projectRoot = resolve(String(opts.projectRoot));
  const rawPaths = opts.hydrationPaths ?? [];
  if (!Array.isArray(rawPaths) || rawPaths.length === 0) {
    const err = new Error("captureTaskSnapshot requires a nonempty hydrationPaths list");
    err.code = "SNAPSHOT_EMPTY";
    throw err;
  }

  /** @type {Map<string, object>} */
  const byPath = new Map();
  for (const raw of rawPaths) {
    const norm = normalizeHydrationRelativePath(raw);
    if (!norm.ok) {
      const err = new Error(`hydration path refused: ${norm.detail}`);
      err.code = norm.code;
      throw err;
    }
    if (byPath.has(norm.path)) {
      const err = new Error(`duplicate hydration path '${norm.path}'`);
      err.code = "SNAPSHOT_DUPLICATE";
      throw err;
    }

    const abs = join(projectRoot, ...norm.path.split("/"));
    let st;
    try {
      st = lstatSync(abs);
    } catch (e) {
      const err = new Error(`hydration path missing: ${norm.path}`);
      err.code = "SNAPSHOT_MISSING";
      err.cause = e;
      throw err;
    }

    if (st.isSymbolicLink()) {
      // Resolve and ensure the target stays under projectRoot.
      let target;
      try {
        target = realpathSync(abs);
      } catch (e) {
        const err = new Error(`escaping or broken symlink: ${norm.path}`);
        err.code = "SNAPSHOT_SYMLINK";
        err.cause = e;
        throw err;
      }
      const rootReal = realpathSync(projectRoot);
      const rel = relative(rootReal, target);
      if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
        const err = new Error(`symlink escapes project root: ${norm.path}`);
        err.code = "SNAPSHOT_SYMLINK";
        throw err;
      }
      const err = new Error(`symlinks are not hydratable: ${norm.path}`);
      err.code = "SNAPSHOT_SYMLINK";
      throw err;
    }

    if (!st.isFile()) {
      const err = new Error(`not a regular file: ${norm.path}`);
      err.code = "SNAPSHOT_SPECIAL";
      throw err;
    }

    const bytes = readFileSync(abs);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    byPath.set(
      norm.path,
      Object.freeze({
        relativePath: norm.path,
        kind: "file",
        mode: st.mode & 0o777,
        sha256,
        byteLength: bytes.length,
        bytes,
      }),
    );
  }

  const files = [...byPath.values()]
    .map((f) =>
      Object.freeze({
        relativePath: f.relativePath,
        kind: f.kind,
        mode: f.mode,
        sha256: f.sha256,
        byteLength: f.byteLength,
      }),
    )
    .sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1));

  const origin = captureOriginIdentity(projectRoot, opts.origin);
  const dirtyState = captureDirtyStateSummary(projectRoot);

  // Drift check: re-hash immediately — any mismatch means concurrent mutation.
  for (const entry of byPath.values()) {
    const abs = join(projectRoot, ...entry.relativePath.split("/"));
    const again = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (again !== entry.sha256) {
      const err = new Error(`drift during snapshot capture: ${entry.relativePath}`);
      err.code = "SNAPSHOT_DRIFT";
      throw err;
    }
  }

  const snapshotId = randomUUID();
  const manifest = Object.freeze({
    version: "gc1c-snapshot-v1",
    snapshotId,
    capturedAtMs: Date.now(),
    projectRoot,
    origin,
    dirtyState,
    files,
  });

  /** @type {Map<string, Buffer>} */
  const payload = new Map();
  for (const entry of byPath.values()) {
    payload.set(entry.relativePath, entry.bytes);
  }

  return Object.freeze({
    snapshotId,
    manifest,
    manifestDigest: manifestDigest(manifest),
    payload,
  });
}

/**
 * @param {object} manifest
 */
export function manifestDigest(manifest) {
  const canonical = canonicalizeForDigest(manifest);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalizeForDigest(manifest) {
  return {
    version: manifest.version,
    snapshotId: manifest.snapshotId,
    projectRoot: manifest.projectRoot,
    origin: manifest.origin ?? null,
    dirtyState: manifest.dirtyState ?? null,
    files: [...(manifest.files ?? [])]
      .map((f) => ({
        relativePath: f.relativePath,
        kind: f.kind,
        mode: f.mode,
        sha256: f.sha256,
        byteLength: f.byteLength,
      }))
      .sort((a, b) => (a.relativePath < b.relativePath ? -1 : 1)),
  };
}

/**
 * Write exact snapshot bytes into a PATH-owned destination tree.
 * @param {{ manifest: object, payload: Map<string, Buffer> }} snapshot
 * @param {string} destRoot
 */
export async function materializeTaskWorkspace(snapshot, destRoot) {
  const root = resolve(String(destRoot));
  mkdirSync(root, { recursive: true });
  const files = snapshot.manifest?.files ?? [];
  for (const meta of files) {
    const norm = normalizeHydrationRelativePath(meta.relativePath);
    if (!norm.ok) {
      const err = new Error(`materialize refused: ${norm.detail}`);
      err.code = norm.code;
      throw err;
    }
    const bytes = snapshot.payload.get(norm.path);
    if (!bytes) {
      const err = new Error(`materialize missing payload for ${norm.path}`);
      err.code = "SNAPSHOT_INCOMPLETE";
      throw err;
    }
    const abs = join(root, ...norm.path.split("/"));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bytes, { mode: meta.mode ?? 0o644 });
    const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (hash !== meta.sha256) {
      const err = new Error(`materialize hash mismatch for ${norm.path}`);
      err.code = "SNAPSHOT_VERIFY";
      throw err;
    }
  }
  return { ok: true, root, fileCount: files.length };
}

/**
 * @param {string} projectRoot
 * @param {{ manifest: object }} snapshot
 * @returns {{ ok: true } | { ok: false, status: "drift", detail: string, path?: string }}
 */
export function verifySnapshotCurrentness(projectRoot, snapshot) {
  const root = resolve(String(projectRoot));
  for (const meta of snapshot.manifest?.files ?? []) {
    const abs = join(root, ...String(meta.relativePath).split("/"));
    if (!existsSync(abs)) {
      return {
        ok: false,
        status: "drift",
        detail: `missing ${meta.relativePath}`,
        path: meta.relativePath,
      };
    }
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      return {
        ok: false,
        status: "drift",
        detail: `unreadable ${meta.relativePath}`,
        path: meta.relativePath,
      };
    }
    if (!st.isFile()) {
      return {
        ok: false,
        status: "drift",
        detail: `not a file ${meta.relativePath}`,
        path: meta.relativePath,
      };
    }
    const hash = createHash("sha256").update(readFileSync(abs)).digest("hex");
    if (hash !== meta.sha256 || st.size !== meta.byteLength) {
      return {
        ok: false,
        status: "drift",
        detail: `content changed ${meta.relativePath}`,
        path: meta.relativePath,
      };
    }
  }
  return { ok: true };
}

/**
 * Assert primary project H paths still match the original snapshot hashes.
 * @param {string} primaryRoot
 * @param {{ manifest: object }} snapshot
 */
export function assertPrimaryUnchanged(primaryRoot, snapshot) {
  const check = verifySnapshotCurrentness(primaryRoot, snapshot);
  if (!check.ok) {
    const err = new Error(`primary tree changed under H: ${check.detail}`);
    err.code = "PRIMARY_MUTATED";
    throw err;
  }
  return check;
}

/**
 * Capture local directionality state (content hashes + git status summary)
 * for admitted paths — used to prove host→remote one-way effects.
 * @param {string} projectRoot
 * @param {readonly string[]} paths
 */
export function captureLocalDirectionalityState(projectRoot, paths) {
  const root = resolve(String(projectRoot));
  /** @type {Record<string, string>} */
  const hashes = {};
  for (const raw of paths ?? []) {
    const norm = normalizeHydrationRelativePath(raw);
    if (!norm.ok) {
      const err = new Error(`directionality path refused: ${norm.detail}`);
      err.code = norm.code;
      throw err;
    }
    const abs = join(root, ...norm.path.split("/"));
    if (!existsSync(abs)) {
      const err = new Error(`directionality path missing: ${norm.path}`);
      err.code = "DIRECTIONALITY_MISSING";
      throw err;
    }
    hashes[norm.path] = createHash("sha256").update(readFileSync(abs)).digest("hex");
  }
  const dirtyState = captureDirtyStateSummary(root);
  const statusPorcelain = gitOne(root, ["status", "--porcelain"]) ?? "";
  return Object.freeze({
    projectRoot: root,
    capturedAtMs: Date.now(),
    hashes: Object.freeze({ ...hashes }),
    gitStatusSummary: Object.freeze({
      ...dirtyState,
      porcelain: statusPorcelain,
    }),
  });
}

/**
 * Assert directionality state is unchanged (hashes + git status summary).
 * @param {ReturnType<typeof captureLocalDirectionalityState>} before
 * @param {ReturnType<typeof captureLocalDirectionalityState>} after
 */
export function assertDirectionalityUnchanged(before, after) {
  if (!before || !after) {
    const err = new Error("assertDirectionalityUnchanged requires before and after");
    err.code = "DIRECTIONALITY_INVALID";
    throw err;
  }
  if (before.projectRoot !== after.projectRoot) {
    const err = new Error("directionality projectRoot mismatch");
    err.code = "DIRECTIONALITY_ROOT";
    throw err;
  }
  const beforePaths = Object.keys(before.hashes ?? {}).sort();
  const afterPaths = Object.keys(after.hashes ?? {}).sort();
  if (beforePaths.join("\0") !== afterPaths.join("\0")) {
    const err = new Error("directionality path set changed");
    err.code = "DIRECTIONALITY_PATHS";
    throw err;
  }
  for (const p of beforePaths) {
    if (before.hashes[p] !== after.hashes[p]) {
      const err = new Error(`directionality hash changed: ${p}`);
      err.code = "DIRECTIONALITY_HASH";
      throw err;
    }
  }
  const b = before.gitStatusSummary ?? {};
  const a = after.gitStatusSummary ?? {};
  if (
    b.clean !== a.clean ||
    b.modified !== a.modified ||
    b.untracked !== a.untracked ||
    b.unmerged !== a.unmerged ||
    String(b.porcelain ?? "") !== String(a.porcelain ?? "")
  ) {
    const err = new Error("directionality git status summary changed");
    err.code = "DIRECTIONALITY_GIT";
    throw err;
  }
  return { ok: true };
}

function captureOriginIdentity(projectRoot, originOverride) {
  if (originOverride && typeof originOverride === "object") {
    return Object.freeze({ ...originOverride });
  }
  const head = gitOne(projectRoot, ["rev-parse", "HEAD"]);
  const branch = gitOne(projectRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const toplevel = gitOne(projectRoot, ["rev-parse", "--show-toplevel"]);
  return Object.freeze({
    headOid: head || null,
    branch: branch || null,
    gitToplevel: toplevel || null,
  });
}

function captureDirtyStateSummary(projectRoot) {
  const porcelain = gitLines(projectRoot, ["status", "--porcelain", "-z"]);
  let modified = 0;
  let untracked = 0;
  let unmerged = 0;
  for (const line of porcelain) {
    if (!line) continue;
    const code = line.slice(0, 2);
    if (code.includes("U") || code === "DD" || code === "AA") unmerged += 1;
    else if (code === "??") untracked += 1;
    else modified += 1;
  }
  return Object.freeze({
    clean: porcelain.length === 0,
    modified,
    untracked,
    unmerged,
  });
}

function gitOne(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return String(r.stdout || "").trim() || null;
}

function gitLines(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], {
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) return [];
  const buf = r.stdout || Buffer.alloc(0);
  if (args.includes("-z")) {
    return buf
      .toString("utf8")
      .split("\0")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return buf
    .toString("utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build a retained patch artifact (task workspace vs original snapshot).
 * @param {string} taskWorkspaceRoot
 * @param {{ manifest: object, payload: Map<string, Buffer> }} snapshot
 * @param {string} destFile
 */
export async function writeSnapshotDiffArtifact(taskWorkspaceRoot, snapshot, destFile) {
  const lines = [];
  for (const meta of snapshot.manifest.files ?? []) {
    const abs = join(taskWorkspaceRoot, ...meta.relativePath.split("/"));
    if (!existsSync(abs)) {
      lines.push(`--- ${meta.relativePath} (deleted in task workspace)`);
      continue;
    }
    const now = readFileSync(abs);
    const hash = createHash("sha256").update(now).digest("hex");
    if (hash === meta.sha256) continue;
    const before = snapshot.payload.get(meta.relativePath)?.toString("utf8") ?? "";
    const after = now.toString("utf8");
    lines.push(`--- a/${meta.relativePath}`);
    lines.push(`+++ b/${meta.relativePath}`);
    lines.push(`@@ before sha256=${meta.sha256} after sha256=${hash} @@`);
    lines.push(before);
    lines.push("---");
    lines.push(after);
    lines.push("");
  }
  mkdirSync(dirname(destFile), { recursive: true });
  writeFileSync(destFile, lines.join("\n"), "utf8");
  return { ok: true, path: destFile, bytes: Buffer.byteLength(lines.join("\n")) };
}

/** Exposed for tests that need to stream bytes without holding them twice. */
export async function writeBytesToFile(absPath, bytes) {
  mkdirSync(dirname(absPath), { recursive: true });
  await pipeline(Readable.from(Buffer.from(bytes)), createWriteStream(absPath));
}
