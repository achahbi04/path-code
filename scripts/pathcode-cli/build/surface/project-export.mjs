/**
 * Export the authoritative product tree as a portable ZIP.
 * Git archive of the adopted SHA. Not the task worktree or runtime metadata.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EXCLUDED = [
  "node_modules",
  ".git",
  ".env",
  ".env.*",
  "credentials.json",
  "id_rsa",
  "id_ed25519",
  "*.pem",
  "*.key",
];

const SECRET_PATH =
  /(^|\/)(\.env($|\.)|credentials\.json|id_rsa|id_ed25519|.*\.(pem|key)$)/i;

/**
 * @param {string} title
 * @param {string} sha
 */
export function exportFilename(title, sha) {
  const safe = String(title || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
  const short = String(sha || "").slice(0, 8) || "tree";
  return `${safe}-${short}.zip`;
}

/**
 * @param {string} projectRoot
 * @param {string[]} args
 */
function git(projectRoot, args) {
  return spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
  });
}

/**
 * @param {string} projectRoot
 * @param {string} sha
 */
export function authoritativeTreeFiles(projectRoot, sha) {
  const listed = git(projectRoot, ["ls-tree", "-r", "--name-only", sha]);
  if (listed.status !== 0) {
    return { ok: false, code: "TREE_UNAVAILABLE", message: (listed.stderr || "").trim() };
  }
  const files = listed.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const secret = files.find((file) => SECRET_PATH.test(file));
  if (secret) {
    return { ok: false, code: "SECRET_EXPORT_REFUSED", path: secret };
  }
  const included = files.filter(
    (file) =>
      !file.startsWith("node_modules/") &&
      file !== "node_modules" &&
      !file.startsWith(".git/") &&
      !SECRET_PATH.test(file),
  );
  return { ok: true, files: included };
}

/**
 * @param {{ projectRoot: string, sha: string, title?: string }} input
 */
export function exportAuthoritativeProject(input) {
  const projectRoot = input.projectRoot;
  const sha = String(input.sha || "").trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) {
    return { ok: false, code: "SHA_REQUIRED" };
  }
  const tree = authoritativeTreeFiles(projectRoot, sha);
  if (!tree.ok) return tree;
  const filename = exportFilename(input.title, sha);
  const dir = mkdtempSync(join(tmpdir(), "path-export-"));
  const zipPath = join(dir, filename);
  const archived = git(projectRoot, [
    "archive",
    "--format=zip",
    `-o${zipPath}`,
    sha,
    "--",
    ".",
    ...EXCLUDED.map((pattern) => `:(exclude)${pattern}`),
  ]);
  if (archived.status !== 0) {
    rmSync(dir, { recursive: true, force: true });
    return { ok: false, code: "ARCHIVE_FAILED", message: (archived.stderr || "").trim() };
  }
  const listed = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  const exported = (listed.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.endsWith("/"));
  const expected = [...tree.files].sort();
  const actual = [...exported].sort();
  const same =
    expected.length === actual.length && expected.every((file, index) => file === actual[index]);
  if (!same) {
    rmSync(dir, { recursive: true, force: true });
    return {
      ok: false,
      code: "EXPORT_TREE_MISMATCH",
      expected: expected.length,
      actual: actual.length,
    };
  }
  return {
    ok: true,
    filename,
    zipPath,
    directory: dir,
    files: actual,
    sha,
  };
}

/**
 * @param {string} zipPath
 */
export function readExportBytes(zipPath) {
  return readFileSync(zipPath);
}
