/**
 * AG1 — prove file path targets cannot escape the configured workspace.
 * Pure PATH-side boundary used by the bridge Cwd/file guards (no live model).
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/**
 * @param {string} root
 * @param {string} candidate
 */
export function isPathWithinWorkspace(root, candidate) {
  const absRoot = resolve(root);
  const absPath = resolve(candidate);
  const prefix = absRoot.endsWith("/") ? absRoot : `${absRoot}/`;
  return absPath === absRoot || absPath.startsWith(prefix);
}

/**
 * @param {{ parent?: string }} [options]
 */
export function proveFileToolsWorkspaceOnly(options = {}) {
  const parent =
    options.parent ??
    mkdtempSync(join(tmpdir(), "pathcode-ag1-filebound-"));
  const workspace = join(parent, "task-worktree");
  const outside = join(parent, "outside-canary");
  mkdirSync(workspace, { recursive: true });
  mkdirSync(outside, { recursive: true });

  const inside = join(workspace, "ok.txt");
  const outsideFile = join(outside, "ESCAPE.txt");

  try {
    const insideOk = isPathWithinWorkspace(workspace, inside);
    const outsideDenied = !isPathWithinWorkspace(workspace, outsideFile);

    writeFileSync(inside, "ok", "utf8");
    const insideExists = existsSync(inside);
    const outsideExists = existsSync(outsideFile);

    if (insideOk && outsideDenied && insideExists && !outsideExists) {
      return {
        ok: true,
        code: "AG1_FILEBOUND_OK",
        detail: { insideOk, outsideDenied, insideExists, outsideExists },
      };
    }
    return {
      ok: false,
      code: "AG1_FILEBOUND_FAILED",
      message: "Inside/outside file boundary proof failed.",
      detail: { insideOk, outsideDenied, insideExists, outsideExists },
    };
  } finally {
    if (!options.parent) {
      try {
        rmSync(parent, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }
}
