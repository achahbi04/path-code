/** P10.1: materialize only canonical Git blobs; no checkout hooks or filters. */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, realpathSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { assertAllowedProjectRoot } from "../paths.mjs";
import { readBuildRecord } from "./record.mjs";
import { detectBuildArtifact } from "./runtime/artifact.mjs";

const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const fail = (code) => ({ ok: false, code });

function git(root, args, input = undefined) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_NO_REPLACE_OBJECTS = "1";
  return spawnSync("git", args, { cwd: root, env, encoding: "buffer", timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024, input, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
}
const output = (result) => result.status === 0 ? String(result.stdout || "").trim() : null;

function workspaceFiles(root, directory = root, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!prefix && entry.name === ".git") continue;
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error("link");
    if (entry.isDirectory()) files.push(...workspaceFiles(root, join(directory, entry.name), name));
    else if (entry.isFile()) files.push(name);
    else throw new Error("special");
  }
  return files.sort();
}

export function isUnsafeDeploymentPath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") ||
      path.split("/").some((part) => !part || part === "." || part === ".." || part.includes("\0"))) return true;
  const parts = path.split("/");
  if (parts.some((part, i) => part === ".vercel" && parts[i + 1] === "project.json")) return true;
  return parts.some((part) => {
    const name = part.toLowerCase();
    return name === ".ssh" || name === "credentials.json" ||
      name === "id_rsa" || name === "id_ed25519" ||
      name.endsWith(".pem") || name.endsWith(".key") ||
      (name !== ".env.example" && (name === ".env" || name.startsWith(".env.")));
  });
}

/** Inspect Git object names and modes before any checkout. No file contents read. */
export function inspectDeploymentTree(root, sha) {
  const listed = git(root, ["ls-tree", "-r", "-z", "--full-tree", sha]);
  if (listed.status !== 0) return fail("DEPLOY_TREE_UNAVAILABLE");
  const entries = [];
  const objects = {};
  const modes = {};
  for (const raw of listed.stdout.toString("utf8").split("\0")) {
    if (!raw) continue;
    const match = /^(\d{6}) (blob|commit) ([a-f0-9]+)\t(.+)$/s.exec(raw);
    if (!match) return fail("DEPLOY_TREE_INVALID");
    const [, mode, type, objectId, path] = match;
    if (isUnsafeDeploymentPath(path)) return fail("DEPLOY_SOURCE_PATH_UNSAFE");
    if (type !== "blob" || !["100644", "100755"].includes(mode)) return fail("DEPLOY_SOURCE_LINK_UNSAFE");
    entries.push(path);
    objects[path] = objectId;
    modes[path] = mode;
  }
  return { ok: true, entries, objects, modes };
}

export function inspectDeploymentSource({ runtimeRoot, buildId }) {
  if (!ID.test(String(buildId || ""))) return fail("BUILD_NOT_FOUND");
  const record = readBuildRecord(runtimeRoot, buildId);
  if (!record || record.buildId !== buildId) return fail("BUILD_NOT_FOUND");
  if (record.pendingRestore) return fail("RESTORE_PENDING");
  if (record.pendingCandidate) return fail("DEPLOY_CANDIDATE_PENDING");
  const binding = record.projectBindings?.[0];
  if (!binding?.bindingId || !binding?.projectRoot) return fail("BUILD_NOT_BOUND");
  const allowed = assertAllowedProjectRoot(binding.projectRoot);
  if (!allowed.ok) return fail(allowed.code);
  let root;
  try { root = realpathSync(binding.projectRoot); }
  catch { return fail("PROJECT_UNAVAILABLE"); }
  const top = output(git(root, ["rev-parse", "--show-toplevel"]));
  if (!top || realpathSync(top) !== root) return fail("PROJECT_BINDING_MISMATCH");
  const sha = record.authoritativeSha;
  if (!SHA.test(String(sha || "")) || output(git(root, ["rev-parse", "--verify", `${sha}^{commit}`])) !== sha) {
    return fail("DEPLOY_SOURCE_UNRESOLVED");
  }
  const treeSha = output(git(root, ["rev-parse", "--verify", `${sha}^{tree}`]));
  if (!SHA.test(String(treeSha || ""))) return fail("DEPLOY_TREE_UNAVAILABLE");
  const tree = inspectDeploymentTree(root, sha);
  if (!tree.ok) return tree;
  return { ok: true, buildId, bindingId: binding.bindingId, root, sha, treeSha,
    entries: tree.entries, objects: tree.objects, modes: tree.modes };
}

/** Caller must call cleanupDeploymentSource when finished. No provider action here. */
export function prepareDeploymentSource({ runtimeRoot, buildId }) {
  const source = inspectDeploymentSource({ runtimeRoot, buildId });
  if (!source.ok) return source;
  const parent = join(resolve(runtimeRoot), "deployment-snapshots", buildId);
  let workspace;
  let canonicalParent;
  try {
    mkdirSync(parent, { recursive: true });
    const canonicalRuntime = realpathSync(runtimeRoot);
    canonicalParent = realpathSync(parent);
    if (!canonicalParent.startsWith(`${canonicalRuntime}${sep}`)) return fail("DEPLOY_WORKSPACE_ESCAPE");
    workspace = join(canonicalParent, randomUUID());
    mkdirSync(workspace, { mode: 0o700 });
  } catch { return fail("DEPLOY_WORKSPACE_FAILED"); }
  const abort = (code) => { cleanupDeploymentSource({ runtimeRoot, workspace }); return fail(code); };
  try {
    const real = realpathSync(workspace);
    if (relative(canonicalParent, real).startsWith("..") || !real.startsWith(`${canonicalParent}${sep}`)) {
      return abort("DEPLOY_WORKSPACE_ESCAPE");
    }
    for (const path of source.entries) {
      const blob = git(source.root, ["cat-file", "blob", source.objects[path]]);
      if (blob.status !== 0 || output(git(source.root, ["hash-object", "--stdin"], blob.stdout)) !== source.objects[path]) {
        return abort("DEPLOY_TREE_MISMATCH");
      }
      const target = join(real, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, blob.stdout, { mode: source.modes[path] === "100755" ? 0o700 : 0o600, flag: "wx" });
    }
    if (source.entries.some((path) => !lstatSync(join(real, path)).isFile() ||
          output(git(source.root, ["hash-object", "--stdin"], readFileSync(join(real, path)))) !== source.objects[path]) ||
        JSON.stringify(workspaceFiles(real)) !== JSON.stringify([...source.entries].sort())) {
      return abort("DEPLOY_TREE_MISMATCH");
    }
    const artifact = detectBuildArtifact(real);
    if (artifact.kind !== "web" || !["static", "vite", "next", "astro"].includes(artifact.framework)) {
      return abort("DEPLOY_PRODUCT_UNSUPPORTED");
    }
    return { ok: true, buildId, bindingId: source.bindingId, authoritativeSha: source.sha,
      treeSha: source.treeSha, repositoryRoot: source.root, runtimeRoot, workspace, framework: artifact.framework,
      preparedAt: new Date().toISOString() };
  } catch { return abort("DEPLOY_WORKSPACE_FAILED"); }
}

export function cleanupDeploymentSource({ runtimeRoot, workspace }) {
  if (!workspace || !existsSync(workspace)) return { ok: true };
  try {
    const parent = realpathSync(join(resolve(runtimeRoot), "deployment-snapshots", dirname(workspace).split(sep).pop()));
    if (!/^[0-9a-f-]{36}$/i.test(workspace.split(sep).pop()) ||
        dirname(realpathSync(workspace)) !== parent) return fail("DEPLOY_WORKSPACE_ESCAPE");
    rmSync(workspace, { recursive: true, force: true });
    return { ok: true };
  } catch { return fail("DEPLOY_WORKSPACE_CLEANUP_FAILED"); }
}
